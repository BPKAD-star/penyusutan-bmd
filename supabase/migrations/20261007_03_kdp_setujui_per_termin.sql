-- ============================================================================
-- 20261007_03 — Pekerjaan Konstruksi (KDP): kartu = paket, SETUJUI PER TERMIN
-- (keputusan user 2026-10-07; rancangan: docs/kdp-per-termin-plan.md)
--
-- Isi:
--   1. fn_kdp_termin_batal(trx_id, aset_id) — aturan "termin ini sudah batal?"
--      ⚠️ KEMBAR dgn terminKdpDibatalkan (lib/voidedAset.ts):
--        · batal_akumulasi_kdp ber-target → membatalkan BARIS ITU SAJA;
--        · tanpa target (`{}`, warisan Buka Kunci kartu) → membatalkan seluruh
--          termin barang itu yang LEBIH TUA dari pembatalnya.
--   2. fn_kdp_setujui_termin / fn_kdp_batal_termin / fn_kdp_batal_semua —
--      SECURITY DEFINER, ADMIN PEMDA SAJA, satu transaksi per panggilan.
--   3. Trigger fn_kdp_kartu_guard — lewat UPDATE/DELETE biasa: termin disetujui,
--      barang yang sudah terbit, & kontrak yang dipakai termin disetujui BEKU;
--      status kartu tak bisa diubah kecuali diarsipkan (tanpa termin disetujui).
--      Pengecualian HANYA penanda transaksi `app.kdp_via_rpc` yang dinyalakan
--      ketiga RPC di atas (pola `app.standar_via_usulan`, 20260814_01).
--   4. fn_lra_belanja_modal, fn_ipa_hitung_otomatis, fn_ipa_rincian: pembatalan
--      termin KDP dibaca PER BARIS (dulu: satu batal = seluruh barang hilang).
--      Bedah teks atas definisi HIDUP, tiap pola dihitung dulu.
--   5. fn_tutup_tahun: tolak menutup tahun selama ada termin MENUNGGU.
--
-- Tanpa nilai enum baru, tanpa kolom baru (payload kartu jsonb).
-- ⚠️ Deploy-ordering: migrasi ini DULU, baru kode. Terbalik → tombol Setujui
-- per termin gagal (RPC belum ada); pesannya tampil, tak ada yang tertulis.
-- ============================================================================

-- ── 1. Aturan pembatalan termin ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_kdp_termin_batal(p_trx_id bigint, p_aset_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM transaksi_bmd b
    WHERE b.aset_id = p_aset_id AND b.jenis = 'batal_akumulasi_kdp'
      AND (
        b.payload->>'target_trx_id' = p_trx_id::text
        OR (jsonb_typeof(b.payload->'target_trx_ids') = 'array'
            AND EXISTS (SELECT 1 FROM jsonb_array_elements_text(b.payload->'target_trx_ids') e(v) WHERE e.v = p_trx_id::text))
        OR (NOT (COALESCE(b.payload, '{}'::jsonb) ? 'target_trx_id')
            AND NOT (COALESCE(b.payload, '{}'::jsonb) ? 'target_trx_ids')
            AND b.id > p_trx_id)
      )
  )
$$;
REVOKE ALL ON FUNCTION public.fn_kdp_termin_batal(bigint, uuid) FROM PUBLIC, anon, authenticated;

-- ⚠️ fn_kdp__beku & fn_kdp__status_kartu SENGAJA tetap bisa dieksekusi
-- `authenticated`: trigger penjaga di bawah berjalan sbg PEMANGGIL (INVOKER).
-- Mencabutnya membuat SETIAP simpan kartu konstruksi gagal "permission denied".
-- Keduanya fungsi murni atas payload — tak membaca tabel apa pun.
-- Termin disetujui di payload (id → termin), barang yang sudah terbit
-- (key → barang tanpa daftar termin), & kontrak yang dipakai termin disetujui.
CREATE OR REPLACE FUNCTION public.fn_kdp__beku(p jsonb)
RETURNS jsonb
LANGUAGE sql IMMUTABLE
SET search_path TO 'public'
AS $$
  WITH b AS (
    SELECT bv FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p->'barang') = 'array' THEN p->'barang' ELSE '[]'::jsonb END) x(bv)
  ),
  t AS (
    SELECT b.bv, tv FROM b, jsonb_array_elements(CASE WHEN jsonb_typeof(b.bv->'pembayaran') = 'array' THEN b.bv->'pembayaran' ELSE '[]'::jsonb END) y(tv)
    WHERE tv->>'status' = 'disetujui'
  )
  SELECT jsonb_build_object(
    'termin',  COALESCE((SELECT jsonb_object_agg(COALESCE(tv->>'id', ''), tv) FROM t), '{}'::jsonb),
    'barang',  COALESCE((SELECT jsonb_object_agg(COALESCE(bv->>'key', ''), bv - 'pembayaran')
                         FROM (SELECT DISTINCT bv FROM t) z), '{}'::jsonb),
    'kontrak', COALESCE((SELECT jsonb_object_agg(kv->>'id', kv)
                         FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p->'kontrak') = 'array' THEN p->'kontrak' ELSE '[]'::jsonb END) k(kv)
                         WHERE kv->>'id' IN (SELECT tv->>'kontrak_id' FROM t)), '{}'::jsonb)
  )
$$;

-- Status kartu DITURUNKAN dari terminnya.
CREATE OR REPLACE FUNCTION public.fn_kdp__status_kartu(p jsonb)
RETURNS text
LANGUAGE sql IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT CASE WHEN (fn_kdp__beku(p)->'termin') = '{}'::jsonb THEN 'pending' ELSE 'disetujui' END
$$;

-- Hitung ulang aset KDP dari termin yang berlaku.
CREATE OR REPLACE FUNCTION public.fn_kdp__sinkron_aset(p_aset_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_n int; v_nilai numeric; v_tgl date;
BEGIN
  SELECT count(*), COALESCE(sum(t.nilai), 0), min(t.tanggal) INTO v_n, v_nilai, v_tgl
  FROM transaksi_bmd t
  WHERE t.aset_id = p_aset_id AND t.jenis = 'akumulasi_kdp' AND NOT fn_kdp_termin_batal(t.id, t.aset_id);
  IF v_n = 0 THEN
    UPDATE aset SET status = 'draft', nilai_perolehan = 0 WHERE id = p_aset_id;
  ELSE
    -- tgl_perolehan = BAST termin berlaku PALING AWAL (keputusan user
    -- 2026-10-07). Penyusutan sendiri baru mulai saat reklas ke GB/JIJ.
    UPDATE aset SET status = 'aktif', nilai_perolehan = v_nilai, tgl_perolehan = v_tgl WHERE id = p_aset_id;
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.fn_kdp__sinkron_aset(uuid) FROM PUBLIC, anon, authenticated;

-- ── 2a. SETUJUI satu termin ─────────────────────────────────────────────────
-- Klien (admin) lebih dulu MENYIAPKAN baris aset barangnya (status 'draft',
-- NIBAR dari generateNibars, spesifikasi dari kartu) & menulis aset_id-nya ke
-- payload — penulisan NIBAR tetap satu jalur dgn menu lain. Fungsi ini yang
-- memeriksa aset itu benar milik barang ini sebelum menghidupkannya.
CREATE OR REPLACE FUNCTION public.fn_kdp_setujui_termin(p_header uuid, p_termin_id text, p_aset_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  h record; a record; k jsonb; pen record;
  v_bi int; v_ti int; v_barang jsonb; v_t jsonb;
  v_tgl date; v_nominal numeric; v_tahun int; v_trx bigint; v_nama text;
  v_payload jsonb;
BEGIN
  IF NOT fn_is_admin() THEN
    RAISE EXCEPTION 'Hanya admin pemda yang boleh menyetujui termin Pekerjaan Konstruksi.';
  END IF;
  SELECT * INTO h FROM jurnal_header WHERE id = p_header FOR UPDATE;
  IF NOT FOUND OR h.kategori <> 'konstruksi' THEN RAISE EXCEPTION 'Kartu Pekerjaan Konstruksi tidak ditemukan.'; END IF;
  IF h.approval_status = 'ditolak' THEN RAISE EXCEPTION 'Kartu ini sudah diarsipkan.'; END IF;

  SELECT (bo - 1)::int, (tor - 1)::int, bv, tv INTO v_bi, v_ti, v_barang, v_t
  FROM jsonb_array_elements(CASE WHEN jsonb_typeof(h.payload->'barang') = 'array' THEN h.payload->'barang' ELSE '[]'::jsonb END) WITH ORDINALITY x(bv, bo),
       jsonb_array_elements(CASE WHEN jsonb_typeof(bv->'pembayaran') = 'array' THEN bv->'pembayaran' ELSE '[]'::jsonb END) WITH ORDINALITY y(tv, tor)
  WHERE tv->>'id' = p_termin_id;
  IF v_t IS NULL THEN RAISE EXCEPTION 'Termin tidak ditemukan di kartu ini (muat ulang halaman).'; END IF;
  IF v_t->>'status' = 'disetujui' THEN RAISE EXCEPTION 'Termin ini sudah disetujui.'; END IF;

  -- Isian termin (KEMBAR dgn kekuranganTermin/cekTanggalTermin, lib/kdp.ts).
  IF COALESCE(v_t->>'nominal', '') !~ '^[0-9]+(\.[0-9]+)?$' OR (v_t->>'nominal')::numeric <= 0 THEN
    RAISE EXCEPTION 'Nominal termin wajib lebih dari 0.';
  END IF;
  v_nominal := (v_t->>'nominal')::numeric;
  IF COALESCE(v_t->>'tgl_bast', '') !~ '^\d{4}-\d{2}-\d{2}$' THEN RAISE EXCEPTION 'Tanggal BAST termin wajib diisi.'; END IF;
  v_tgl := (v_t->>'tgl_bast')::date;
  v_tahun := extract(year FROM h.tanggal)::int;
  IF extract(year FROM v_tgl)::int <> v_tahun THEN
    RAISE EXCEPTION 'BAST bertanggal % di luar tahun kartu (%). Satu kartu = satu tahun anggaran — buat kartu baru, lalu satukan lewat Kapitalisasi & Reklasifikasi.', v_tgl, v_tahun;
  END IF;
  IF jsonb_typeof(v_t->'dokumen_paths') IS DISTINCT FROM 'array' OR jsonb_array_length(v_t->'dokumen_paths') = 0 THEN
    RAISE EXCEPTION 'Dokumen BAST termin ini belum diunggah.';
  END IF;
  IF COALESCE(v_t->>'komponen', '') NOT IN ('perencanaan', 'fisik', 'pengawasan', 'biaya_umum') THEN
    RAISE EXCEPTION 'Komponen termin tidak dikenal.';
  END IF;
  IF nullif(v_t->>'kontrak_id', '') IS NOT NULL THEN
    SELECT kv INTO k FROM jsonb_array_elements(CASE WHEN jsonb_typeof(h.payload->'kontrak') = 'array' THEN h.payload->'kontrak' ELSE '[]'::jsonb END) z(kv)
    WHERE kv->>'id' = v_t->>'kontrak_id';
    IF k IS NULL THEN RAISE EXCEPTION 'Kontrak termin ini sudah tidak ada di kartu — pilih kontrak lagi.'; END IF;
    IF k->>'komponen' IS DISTINCT FROM v_t->>'komponen' THEN
      RAISE EXCEPTION 'Kontrak "%" bukan kontrak komponen %.', k->>'no_kontrak', v_t->>'komponen';
    END IF;
    IF COALESCE(k->>'tgl_kontrak', '') !~ '^\d{4}-\d{2}-\d{2}$' THEN RAISE EXCEPTION 'Tanggal kontrak "%" belum diisi.', k->>'no_kontrak'; END IF;
    IF v_tgl < (k->>'tgl_kontrak')::date THEN
      RAISE EXCEPTION 'Tgl BAST (%) lebih tua dari tgl kontraknya (%, No. %).', v_tgl, k->>'tgl_kontrak', k->>'no_kontrak';
    END IF;
  ELSIF v_t->>'komponen' <> 'biaya_umum' THEN
    RAISE EXCEPTION 'Termin % wajib menunjuk kontraknya.', v_t->>'komponen';
  END IF;

  -- Isian barang (KEMBAR dgn kekuranganNamaKdp & syarat foto).
  IF COALESCE(v_barang->>'kode', '') NOT LIKE '1.3.6.%' THEN RAISE EXCEPTION 'Barang termin ini tidak berkode KDP (1.3.6).'; END IF;
  v_nama := nullif(btrim(v_barang->'spec'->>'nama_barang'), '');
  IF v_nama IS NULL THEN
    RAISE EXCEPTION 'Barang "%" belum punya Spesifikasi Nama Barang — isi dulu lewat Edit Spesifikasi.', v_barang->>'nama';
  END IF;
  IF (SELECT count(*) FROM jsonb_array_elements(h.payload->'barang') q(bv)
      WHERE lower(regexp_replace(btrim(bv->'spec'->>'nama_barang'), '\s+', ' ', 'g')) = lower(regexp_replace(v_nama, '\s+', ' ', 'g'))) > 1 THEN
    RAISE EXCEPTION 'Spesifikasi Nama Barang "%" kembar di kartu ini — tiap barang KDP harus punya nama yang berbeda.', v_nama;
  END IF;
  IF jsonb_typeof(v_barang->'foto') IS DISTINCT FROM 'array' OR jsonb_array_length(v_barang->'foto') = 0 THEN
    RAISE EXCEPTION 'Barang "%" belum ada foto — lengkapi dulu.', v_nama;
  END IF;

  -- Aset barang: wajib yang sudah disiapkan untuk barang INI.
  IF p_aset_id IS NULL OR v_barang->>'aset_id' IS DISTINCT FROM p_aset_id::text THEN
    RAISE EXCEPTION 'Aset barang ini belum disiapkan (muat ulang halaman lalu coba lagi).';
  END IF;
  SELECT * INTO a FROM aset WHERE id = p_aset_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Aset barang ini tidak ditemukan.'; END IF;
  IF a.skpd_id IS DISTINCT FROM h.skpd_id THEN
    RAISE EXCEPTION 'Barang ini sudah tercatat di SKPD lain — termin baru tak bisa disetujui dari kartu ini.';
  END IF;
  IF a.kode IS DISTINCT FROM v_barang->>'kode' OR a.kode NOT LIKE '1.3.6.%' THEN
    RAISE EXCEPTION 'Barang "%" sudah bukan KDP (kodenya kini %) — setujui termin sebelum reklas, atau catat lewat Kapitalisasi ke barang hasilnya.', v_nama, a.kode;
  END IF;
  IF a.status NOT IN ('draft', 'aktif') THEN RAISE EXCEPTION 'Barang "%" sudah tidak aktif (status %).', v_nama, a.status; END IF;
  IF EXISTS (SELECT 1 FROM transaksi_bmd t WHERE t.aset_id = p_aset_id
               AND (t.header_id IS DISTINCT FROM p_header) AND t.jenis IN ('akumulasi_kdp', 'batal_akumulasi_kdp')) THEN
    RAISE EXCEPTION 'Aset ini milik kartu konstruksi lain.';
  END IF;
  -- Tak menyisip mundur di depan peristiwa NON-termin yang masih berlaku.
  SELECT t.jenis::text AS jenis, t.periode, t.tanggal INTO pen
  FROM fn_baris_berlaku_sesudah(p_aset_id, 0) f
  JOIN transaksi_bmd t ON t.id = f.id
  WHERE f.jenis NOT IN ('akumulasi_kdp', 'batal_akumulasi_kdp') AND t.tanggal > v_tgl
  ORDER BY t.tanggal, t.id LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'Barang "%" sudah punya transaksi % (%, %) — termin ber-BAST lebih tua dari itu tak bisa disetujui. Batalkan transaksi itu dulu.', v_nama, pen.jenis, pen.periode, pen.tanggal;
  END IF;

  PERFORM set_config('app.kdp_via_rpc', '1', true);

  INSERT INTO transaksi_bmd (aset_id, jenis, periode, tanggal, nilai, skpd_tujuan, header_id, payload)
  VALUES (p_aset_id, 'akumulasi_kdp', fn_periode_dari_tanggal(v_tgl), v_tgl, v_nominal, h.skpd_id, p_header,
          jsonb_build_object(
            'komponen', v_t->>'komponen', 'no_bast', nullif(v_t->>'no_bast', ''),
            'kode_rekening', nullif(v_t->>'kode_rekening', ''), 'dokumen_paths', v_t->'dokumen_paths',
            'termin_id', p_termin_id, 'kontrak_id', nullif(v_t->>'kontrak_id', ''),
            'no_kontrak', k->>'no_kontrak', 'tgl_kontrak', k->>'tgl_kontrak', 'penyedia', k->>'penyedia',
            'bentuk_kontrak', k->>'bentuk'))
  RETURNING id INTO v_trx;

  PERFORM fn_kdp__sinkron_aset(p_aset_id);

  v_payload := jsonb_set(h.payload, ARRAY['barang', v_bi::text, 'pembayaran', v_ti::text],
    v_t || jsonb_build_object('status', 'disetujui', 'trx_id', v_trx,
                              'disetujui_oleh', auth.uid(), 'disetujui_at', now()));
  UPDATE jurnal_header
     SET payload = v_payload,
         approval_status = fn_kdp__status_kartu(v_payload),
         approved_by = COALESCE(approved_by, auth.uid()),
         approved_at = COALESCE(approved_at, now())
   WHERE id = p_header;

  -- Penanda dimatikan lagi: hidupnya cuma selama fungsi ini bekerja, bukan
  -- sisa transaksi pemanggil.
  PERFORM set_config('app.kdp_via_rpc', '', true);
  RETURN jsonb_build_object('trx_id', v_trx, 'aset_id', p_aset_id);
END $$;

-- ── 2b. BATAL satu termin ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_kdp_batal_termin(p_header uuid, p_termin_id text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  h record; r record; pen record;
  v_bi int; v_ti int; v_barang jsonb; v_t jsonb; v_trx bigint; v_payload jsonb; v_bt bigint;
BEGIN
  IF NOT fn_is_admin() THEN
    RAISE EXCEPTION 'Hanya admin pemda yang boleh membatalkan termin Pekerjaan Konstruksi.';
  END IF;
  SELECT * INTO h FROM jurnal_header WHERE id = p_header FOR UPDATE;
  IF NOT FOUND OR h.kategori <> 'konstruksi' THEN RAISE EXCEPTION 'Kartu Pekerjaan Konstruksi tidak ditemukan.'; END IF;

  SELECT (bo - 1)::int, (tor - 1)::int, bv, tv INTO v_bi, v_ti, v_barang, v_t
  FROM jsonb_array_elements(CASE WHEN jsonb_typeof(h.payload->'barang') = 'array' THEN h.payload->'barang' ELSE '[]'::jsonb END) WITH ORDINALITY x(bv, bo),
       jsonb_array_elements(CASE WHEN jsonb_typeof(bv->'pembayaran') = 'array' THEN bv->'pembayaran' ELSE '[]'::jsonb END) WITH ORDINALITY y(tv, tor)
  WHERE tv->>'id' = p_termin_id;
  IF v_t IS NULL THEN RAISE EXCEPTION 'Termin tidak ditemukan di kartu ini (muat ulang halaman).'; END IF;
  IF v_t->>'status' IS DISTINCT FROM 'disetujui' OR COALESCE(v_t->>'trx_id', '') !~ '^[0-9]+$' THEN
    RAISE EXCEPTION 'Termin ini belum disetujui.';
  END IF;
  v_trx := (v_t->>'trx_id')::bigint;

  SELECT * INTO r FROM transaksi_bmd WHERE id = v_trx;
  IF NOT FOUND OR r.jenis <> 'akumulasi_kdp' OR r.header_id IS DISTINCT FROM p_header THEN
    RAISE EXCEPTION 'Baris ledger termin ini tidak cocok — hubungi admin sistem.';
  END IF;
  IF fn_kdp_termin_batal(r.id, r.aset_id) THEN RAISE EXCEPTION 'Termin ini sudah dibatalkan.'; END IF;

  -- Tak boleh ada peristiwa NON-termin yang masih berlaku sesudahnya.
  SELECT f.jenis, f.periode INTO pen
  FROM fn_baris_berlaku_sesudah(r.aset_id, r.id) f
  WHERE f.jenis NOT IN ('akumulasi_kdp', 'batal_akumulasi_kdp')
  ORDER BY f.id LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'Barang "%" sudah punya transaksi % (%) sesudah termin ini — batalkan transaksi itu dulu.',
      COALESCE(nullif(btrim(v_barang->'spec'->>'nama_barang'), ''), v_barang->>'nama'), pen.jenis, pen.periode;
  END IF;

  PERFORM set_config('app.kdp_via_rpc', '1', true);

  INSERT INTO transaksi_bmd (aset_id, jenis, periode, tanggal, nilai, header_id, payload)
  VALUES (r.aset_id, 'batal_akumulasi_kdp', r.periode, r.tanggal, -r.nilai, p_header,
          jsonb_build_object('target_trx_id', r.id, 'termin_id', p_termin_id))
  RETURNING id INTO v_bt;

  PERFORM fn_kdp__sinkron_aset(r.aset_id);

  v_payload := jsonb_set(h.payload, ARRAY['barang', v_bi::text, 'pembayaran', v_ti::text],
    (v_t - 'disetujui_oleh' - 'disetujui_at') || jsonb_build_object('status', 'menunggu', 'trx_id', NULL));
  UPDATE jurnal_header
     SET payload = v_payload,
         approval_status = fn_kdp__status_kartu(v_payload)
   WHERE id = p_header;

  -- Penanda dimatikan lagi: hidupnya cuma selama fungsi ini bekerja, bukan
  -- sisa transaksi pemanggil.
  PERFORM set_config('app.kdp_via_rpc', '', true);
  RETURN jsonb_build_object('batal_trx_id', v_bt);
END $$;

-- ── 2c. BATAL SEMUA termin kartu (terbaru dulu) ─────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_kdp_batal_semua(p_header uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_id text; v_n int := 0; h record;
BEGIN
  IF NOT fn_is_admin() THEN
    RAISE EXCEPTION 'Hanya admin pemda yang boleh membatalkan termin Pekerjaan Konstruksi.';
  END IF;
  SELECT * INTO h FROM jurnal_header WHERE id = p_header FOR UPDATE;
  IF NOT FOUND OR h.kategori <> 'konstruksi' THEN RAISE EXCEPTION 'Kartu Pekerjaan Konstruksi tidak ditemukan.'; END IF;
  FOR v_id IN
    SELECT tv->>'id'
    FROM jsonb_array_elements(CASE WHEN jsonb_typeof(h.payload->'barang') = 'array' THEN h.payload->'barang' ELSE '[]'::jsonb END) x(bv),
         jsonb_array_elements(CASE WHEN jsonb_typeof(bv->'pembayaran') = 'array' THEN bv->'pembayaran' ELSE '[]'::jsonb END) y(tv)
    WHERE tv->>'status' = 'disetujui'
    ORDER BY (tv->>'trx_id')::bigint DESC
  LOOP
    PERFORM fn_kdp_batal_termin(p_header, v_id);
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END $$;

REVOKE ALL ON FUNCTION public.fn_kdp_setujui_termin(uuid, text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_kdp_batal_termin(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_kdp_batal_semua(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_kdp_setujui_termin(uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_kdp_batal_termin(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_kdp_batal_semua(uuid) TO authenticated;

-- ── 3. Penjaga kartu ────────────────────────────────────────────────────────
-- SECURITY INVOKER sengaja: `current_setting` membaca penanda transaksi milik
-- pemanggil, dan tak ada tabel yang perlu dibaca melewati RLS.
CREATE OR REPLACE FUNCTION public.fn_kdp_kartu_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE o jsonb; n jsonb;
BEGIN
  IF OLD.kategori IS DISTINCT FROM 'konstruksi' THEN RETURN COALESCE(NEW, OLD); END IF;
  IF current_setting('app.kdp_via_rpc', true) = '1' THEN RETURN COALESCE(NEW, OLD); END IF;

  o := fn_kdp__beku(OLD.payload);
  IF TG_OP = 'DELETE' THEN
    IF (o->'termin') <> '{}'::jsonb THEN
      RAISE EXCEPTION 'Kartu ini masih punya termin disetujui — batalkan semua termin dulu.';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.approval_status = 'ditolak' THEN
    RAISE EXCEPTION 'Kartu ini sudah diarsipkan — tidak bisa diubah.';
  END IF;
  n := fn_kdp__beku(NEW.payload);
  IF (n->'termin') IS DISTINCT FROM (o->'termin') THEN
    RAISE EXCEPTION 'Termin yang sudah disetujui tidak bisa diubah/dihapus, dan termin hanya bisa disetujui lewat tombol Setujui (admin pemda). Batalkan terminnya dulu kalau perlu diperbaiki.';
  END IF;
  IF (n->'barang') IS DISTINCT FROM (o->'barang') THEN
    RAISE EXCEPTION 'Barang yang sudah tercatat (punya termin disetujui) tidak bisa diubah dari kartu — pakai menu Koreksi, atau batalkan terminnya dulu.';
  END IF;
  IF (n->'kontrak') IS DISTINCT FROM (o->'kontrak') THEN
    RAISE EXCEPTION 'Kontrak yang dipakai termin disetujui tidak bisa diubah/dihapus — batalkan termin-termin itu dulu.';
  END IF;
  IF NEW.approval_status IS DISTINCT FROM OLD.approval_status
     AND NOT (NEW.approval_status = 'ditolak' AND (o->'termin') = '{}'::jsonb) THEN
    RAISE EXCEPTION 'Status kartu Pekerjaan Konstruksi mengikuti terminnya — setujui/batalkan per termin.';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_kdp_kartu_guard ON public.jurnal_header;
CREATE TRIGGER trg_kdp_kartu_guard
  BEFORE UPDATE OR DELETE ON public.jurnal_header
  FOR EACH ROW EXECUTE FUNCTION public.fn_kdp_kartu_guard();

-- ── 4. Pembatalan termin dibaca PER BARIS di LRA & IPA ──────────────────────
DO $$
DECLARE d text; v_old text; v_new text; n int; f regprocedure;
BEGIN
  -- LRA
  f := 'public.fn_lra_belanja_modal(integer,bigint[])'::regprocedure;
  d := pg_get_functiondef(f);
  v_old := 'AND b.jenis IN (''batal_pengadaan'', ''batal_akumulasi_kdp'')' || chr(10) || '    )';
  v_new := 'AND b.jenis = ''batal_pengadaan''' || chr(10) || '    )' || chr(10)
        || '    AND NOT (t.jenis = ''akumulasi_kdp'' AND fn_kdp_termin_batal(t.id, t.aset_id))';
  n := (length(d) - length(replace(d, v_old, ''))) / length(v_old);
  IF n <> 1 THEN RAISE EXCEPTION 'fn_lra_belanja_modal: pola pembatalan KDP ditemukan % kali (harus 1).', n; END IF;
  EXECUTE replace(d, v_old, v_new);

  -- IPA (dua fungsi, pola sama)
  v_old := 'AND v.jenis IN (''batal_pengadaan'',''batal_akumulasi_kdp''))';
  v_new := 'AND v.jenis = ''batal_pengadaan'') AND NOT (t.jenis = ''akumulasi_kdp'' AND fn_kdp_termin_batal(t.id, t.aset_id))';
  FOREACH f IN ARRAY ARRAY['public.fn_ipa_hitung_otomatis(integer,bigint)'::regprocedure,
                           'public.fn_ipa_rincian(integer,bigint,text,integer)'::regprocedure] LOOP
    d := pg_get_functiondef(f);
    n := (length(d) - length(replace(d, v_old, ''))) / length(v_old);
    IF n <> 1 THEN RAISE EXCEPTION '%: pola pembatalan KDP ditemukan % kali (harus 1).', f, n; END IF;
    IF position('work_mem' IN d) = 0 THEN RAISE EXCEPTION '%: SET work_mem hilang sebelum dibedah.', f; END IF;
    EXECUTE replace(d, v_old, v_new);
  END LOOP;
END $$;

-- ── 5. Tutup Tahun: tolak selama masih ada termin MENUNGGU ──────────────────
-- Kartu konstruksi berstatus 'disetujui' begitu SATU termin disetujui, jadi
-- pemeriksaan "kartu pending" yang lama tak melihat termin lain yang masih
-- menunggu — padahal kalau disetujui sesudah tahun dikunci, ia ditolak guard
-- tahun buku & tak akan pernah tercatat.
DO $$
DECLARE d text; v_anchor text; n int;
BEGIN
  d := pg_get_functiondef('public.fn_tutup_tahun(integer,text)'::regprocedure);
  v_anchor := '  -- Checkpoint massal: 1 baris per aset aktif+disusutkan';
  n := (length(d) - length(replace(d, v_anchor, ''))) / length(v_anchor);
  IF n <> 1 THEN RAISE EXCEPTION 'fn_tutup_tahun: jangkar ditemukan % kali (harus 1).', n; END IF;
  EXECUTE replace(d, v_anchor,
    '  SELECT count(*) INTO v_pending_count' || chr(10) ||
    '  FROM jurnal_header h,' || chr(10) ||
    '       jsonb_array_elements(CASE WHEN jsonb_typeof(h.payload->''barang'') = ''array'' THEN h.payload->''barang'' ELSE ''[]''::jsonb END) x(bv),' || chr(10) ||
    '       jsonb_array_elements(CASE WHEN jsonb_typeof(bv->''pembayaran'') = ''array'' THEN bv->''pembayaran'' ELSE ''[]''::jsonb END) y(tv)' || chr(10) ||
    '  WHERE h.kategori = ''konstruksi'' AND h.approval_status <> ''ditolak''' || chr(10) ||
    '    AND COALESCE(tv->>''status'', ''menunggu'') <> ''disetujui''' || chr(10) ||
    '    AND (h.periode LIKE (p_tahun::text || ''-%'') OR left(tv->>''tgl_bast'', 4) = p_tahun::text);' || chr(10) ||
    '  IF v_pending_count > 0 THEN' || chr(10) ||
    '    RAISE EXCEPTION ''Masih ada % termin Pekerjaan Konstruksi tahun % yang MENUNGGU persetujuan — setujui atau hapus dulu sebelum menutup tahun ini.'', v_pending_count, p_tahun;' || chr(10) ||
    '  END IF;' || chr(10) || chr(10) || v_anchor);
END $$;
