-- ============================================================================
-- Guard arah MAJU Pengalihan/Mutasi Internal (fn_terima_pengalihan/
-- fn_terima_mutasi_internal, migrasi 20260918_01) TERNYATA NAIF — kelas bug
-- yang SAMA dgn guard arah MUNDUR sebelum 2026-08-31/2026-09-17, cuma belum
-- ketahuan sampai memakan korban nyata hari ini (2026-09-22).
--
-- ── Kejadian nyata yang melahirkan perbaikan ini ───────────────────────────
-- User mencatat Pengalihan Status Penggunaan Kec. Plemahan → Kec. Semen utk
-- 1 kendaraan, TAPI lupa isi tanggal dokumen → tersimpan tanggal HARI INI
-- (kartu ini dibuat SEBELUM default tanggal dikosongkan oleh 20260918_01).
-- Kartu itu SUDAH diterima (Semen klik Terima) → `pengalihan_status` #X
-- tercatat bertanggal hari itu. User sadar tanggalnya salah → menekan Batal
-- (`fn_batal_pengalihan_barang`, menulis `batal_pengalihan` ber-
-- `target_trx_ids:[X]`) → mengarsipkan kartunya. Lalu mencatat KARTU BARU dgn
-- tanggal yg BENAR (masih di semester yg sama) → Semen menekan Terima lagi →
-- **DITOLAK**: "sudah punya transaksi 'pengalihan_status' ... LEBIH BARU dari
-- tanggal dokumen pengalihan ini".
--
-- Penolakan itu SALAH. Baris `pengalihan_status` #X yang dituduh jadi
-- penghalang sudah DINETRALKAN oleh `batal_pengalihan` yang menargetnya —
-- barang itu sudah "dianggap tidak pernah terjadi". Tapi guard arah maju yang
-- ditulis migrasi 20260918_01 masih query NAIF:
--     WHERE aset_id=... AND jenis <> 'batal_kapitalisasi' AND tanggal > v_h.tanggal
-- — persis bentuk `fn_batal_pengalihan_barang` SEBELUM 20260917_01, dan persis
-- `cekBolehBatal` SEBELUM 2026-08-31. Append-only: baris #X & pembatalannya
-- tak pernah hilang, jadi begitu ini terjadi kartu barunya TERKUNCI SELAMANYA
-- kalau tak diperbaiki — pesannya menyuruh "batalkan yang lebih baru dulu",
-- padahal itu SUDAH terjadi & menurutinya lagi cuma menambah baris pemblokir.
--
-- ── Obatnya: SATU LAGI fungsi yang mengulang ALGORITMA `barisMasihBerlaku`/
--    `fn_baris_penghalang_batal`, kali ini diparameterkan TANGGAL bukan id ───
-- `fn_baris_penghalang_batal(aset_id, trx_id_batas)` tak bisa dipakai apa
-- adanya di sini: guard arah MAJU memeriksa tanggal dokumen yang BELUM jadi
-- baris (belum ada trx_id buat batasnya), sedangkan guard arah MUNDUR
-- memeriksa baris yg SUDAH ada (trx_id_batas = baris itu sendiri).
-- `fn_baris_penghalang_sisip(aset_id, tanggal_batas)` — badan SAMA PERSIS
-- (netral_a target_trx_id(s), netral_b kapitalisasi_serap↔batal_kapitalisasi,
-- netral_c penghapusan↔batal_penghapusan), cuma `baris` di-scope
-- `tanggal > p_tanggal_batas` (bukan `id > p_trx_id_batas`), dan hasilnya
-- diurut `tanggal ASC, id ASC` (bukan `id ASC`) supaya pesan errornya
-- menunjuk penghalang PALING AWAL, bukan sekadar id terkecil.
--
-- Diverifikasi ke PRODUKSI sebelum ditulis (transaksi + ROLLBACK): rantai
-- pengalihan #X + batal_pengalihan ber-target [X] bertanggal sama pada aset yg
-- sama — fungsi LAMA (query naif) menghitung 1 baris (SALAH, akan memblokir
-- kartu baru bertanggal lebih tua); fungsi BARU: 0 penghalang (BENAR).
-- Skenario "ditambah satu event HIDUP sesudahnya" (reklas_kode tanpa
-- pembatalan) → fungsi BARU tetap memblokir tepat di situ (BENAR, tak jadi
-- longgar). Nol baris tersisa di produksi sesudah ROLLBACK.
--
-- ⚠️ `fn_baris_penghalang_sisip` SENGAJA TIDAK di-GRANT ke `authenticated`/
-- `anon` — pola yang sama dgn `fn_baris_penghalang_batal`: internal-only,
-- dipanggil dari dalam RPC SECURITY DEFINER yang sudah diperiksa wewenangnya.
--
-- Pagu 500 baris (sama filosofi dgn `fn_batal_pengalihan_barang`) ditambahkan
-- sbg pre-check fail-closed di KEDUA fungsi pemanggil: kalau riwayat aset itu
-- (dibatasi tanggal > tanggal dokumen) sudah sebesar itu, pasangan mana yang
-- utuh tak bisa disimpulkan dgn aman → DITOLAK, bukan ditebak.
--
-- Tanda tangan `fn_terima_pengalihan`/`fn_terima_mutasi_internal` tak berubah
-- (RETURNS integer, param sama) → boleh dijalankan kapan saja, tidak ada
-- deploy-ordering.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_baris_penghalang_sisip(p_aset_id uuid, p_tanggal_batas date)
 RETURNS TABLE(id bigint, jenis text, periode text, tanggal date)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH baris AS (
    SELECT t.id, t.jenis::text AS jenis, t.periode::text AS periode, t.tanggal, t.payload
    FROM transaksi_bmd t
    WHERE t.aset_id = p_aset_id AND t.tanggal > p_tanggal_batas
  ),
  -- (a) pasangan ber-target_trx_id/target_trx_ids ------------------------------
  target_batal_tunggal AS (
    SELECT b.id AS batal_id, (b.payload->>'target_trx_id')::bigint AS target_id
    FROM baris b
    WHERE b.jenis LIKE 'batal_%' AND b.payload->>'target_trx_id' ~ '^[0-9]+$'
  ),
  target_batal_jamak_src AS (
    SELECT b.id AS batal_id, b.payload
    FROM baris b
    WHERE b.jenis LIKE 'batal_%' AND b.payload ? 'target_trx_ids'
  ),
  target_batal_jamak AS (
    SELECT s.batal_id, (te.val)::bigint AS target_id
    FROM target_batal_jamak_src s, jsonb_array_elements_text(s.payload->'target_trx_ids') AS te(val)
    WHERE te.val ~ '^[0-9]+$'
  ),
  target_semua AS (
    SELECT batal_id, target_id FROM target_batal_tunggal
    UNION ALL
    SELECT batal_id, target_id FROM target_batal_jamak
  ),
  -- Pasangan UTUH = SELURUH target si baris batal ada di himpunan `baris`.
  pasangan_utuh AS (
    SELECT ts.batal_id
    FROM target_semua ts
    GROUP BY ts.batal_id
    HAVING bool_and(EXISTS (SELECT 1 FROM baris bb WHERE bb.id = ts.target_id))
  ),
  netral_a AS (
    SELECT batal_id AS id FROM pasangan_utuh
    UNION
    SELECT ts.target_id FROM target_semua ts JOIN pasangan_utuh pu ON pu.batal_id = ts.batal_id
  ),
  -- (b) sisi ANAK kapitalisasi: kapitalisasi_serap <-> batal_kapitalisasi TANPA
  --     target ----------------------------------------------------------------
  serap AS (
    SELECT b.id, b.jenis, b.periode,
           row_number() OVER (ORDER BY b.periode, b.id) AS urut,
           count(*) OVER () AS total
    FROM baris b
    WHERE b.jenis = 'kapitalisasi_serap'
       OR (b.jenis = 'batal_kapitalisasi'
           AND NOT (b.payload ? 'target_trx_id') AND NOT (b.payload ? 'target_trx_ids'))
  ),
  netral_b AS (
    SELECT s.id FROM serap s
    WHERE s.total >= 2
      AND EXISTS (SELECT 1 FROM serap x WHERE x.urut = 1 AND x.jenis = 'kapitalisasi_serap')
      AND EXISTS (SELECT 1 FROM serap y WHERE y.urut = s.total AND y.jenis = 'batal_kapitalisasi')
  ),
  -- (c) penghapusan <-> batal_penghapusan TANPA target -------------------------
  hapus AS (
    SELECT b.id, b.jenis, b.periode,
           row_number() OVER (ORDER BY b.periode, b.id) AS urut,
           count(*) OVER () AS total
    FROM baris b
    WHERE b.jenis IN ('penghapusan_pemindahtanganan', 'penghapusan_sebab_lain')
       OR (b.jenis = 'batal_penghapusan'
           AND NOT (b.payload ? 'target_trx_id') AND NOT (b.payload ? 'target_trx_ids'))
  ),
  netral_c AS (
    SELECT h.id FROM hapus h
    WHERE h.total >= 2
      AND EXISTS (SELECT 1 FROM hapus x WHERE x.urut = 1 AND x.jenis IN ('penghapusan_pemindahtanganan', 'penghapusan_sebab_lain'))
      AND EXISTS (SELECT 1 FROM hapus y WHERE y.urut = h.total AND y.jenis = 'batal_penghapusan')
  )
  SELECT b.id, b.jenis, b.periode, b.tanggal
  FROM baris b
  WHERE b.id NOT IN (SELECT id FROM netral_a UNION SELECT id FROM netral_b UNION SELECT id FROM netral_c)
  ORDER BY b.tanggal ASC, b.id ASC
  LIMIT 1;
$function$;

REVOKE ALL ON FUNCTION public.fn_baris_penghalang_sisip(uuid, date) FROM PUBLIC;

-- Tanda tangan tak berubah, badan diganti: guard naif → pakai fungsi di atas +
-- pagu 500 fail-closed. Wewenang, validasi tahun buku, & seluruh alur lain
-- TIDAK disentuh — salin persis dari 20260918_01, HANYA blok guard yang beda.
CREATE OR REPLACE FUNCTION public.fn_terima_pengalihan(p_header_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_h                jurnal_header%ROWTYPE;
  v_item             jsonb;
  v_aset             RECORD;
  v_penghalang       RECORD;
  v_total_lebih_baru integer;
  v_n                integer := 0;
  v_periode          text;
  v_tahun            integer;
BEGIN
  SELECT * INTO v_h FROM jurnal_header WHERE id = p_header_id FOR UPDATE;
  IF NOT FOUND OR v_h.kategori <> 'pengalihan_status' THEN
    RAISE EXCEPTION 'Jurnal pengalihan status tidak ditemukan.';
  END IF;
  IF v_h.approval_status <> 'pending' THEN
    RAISE EXCEPTION 'Jurnal ini sudah %.', v_h.approval_status;
  END IF;
  IF NOT (fn_is_admin() OR fn_skpd_visible(v_h.skpd_tujuan)) THEN
    RAISE EXCEPTION 'Hanya SKPD tujuan (atau admin) yang boleh menerima pengalihan ini.';
  END IF;

  IF v_h.tanggal IS NULL THEN
    RAISE EXCEPTION 'Jurnal ini belum punya tanggal dokumen — isi dulu di SKPD asal.';
  END IF;
  IF v_h.tanggal > current_date THEN
    RAISE EXCEPTION 'Tanggal dokumen (%) ada di masa depan. Periksa ulang tanggal SK/BAST-nya — tanggal ledger tidak boleh mendahului hari ini.',
      to_char(v_h.tanggal, 'DD-MM-YYYY');
  END IF;
  v_tahun := EXTRACT(YEAR FROM v_h.tanggal)::int;
  IF NOT EXISTS (SELECT 1 FROM tahun_buku WHERE tahun = v_tahun AND status = 'terbuka') THEN
    RAISE EXCEPTION 'Tanggal dokumen (%) jatuh di tahun % yang sudah TERKUNCI, jadi pengalihannya tidak bisa dicatat di sana. Periksa ulang tanggal dokumennya — harus di tahun buku yang masih berjalan.',
      to_char(v_h.tanggal, 'DD-MM-YYYY'), v_tahun;
  END IF;

  v_periode := fn_periode_dari_tanggal(v_h.tanggal);

  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(v_h.payload->'draft_items', '[]'::jsonb))
  LOOP
    SELECT id, skpd_id, status, nilai_perolehan, nama_barang, nibar INTO v_aset
    FROM aset WHERE id = (v_item->>'aset_id')::uuid FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Barang % tidak ditemukan.', v_item->>'aset_id';
    END IF;
    IF v_aset.status <> 'aktif' OR v_aset.skpd_id IS DISTINCT FROM v_h.skpd_id THEN
      RAISE EXCEPTION 'Barang "%" (%) sudah berpindah/tidak aktif — minta SKPD asal merevisi jurnal.',
        COALESCE(v_aset.nama_barang, '-'), COALESCE(v_aset.nibar, '-');
    END IF;

    -- Guard arah MAJU — kini lewat fn_baris_penghalang_sisip (migrasi
    -- 20260922_01), yg mengabaikan pasangan batal yg sudah saling meniadakan.
    SELECT count(*) INTO v_total_lebih_baru
    FROM transaksi_bmd WHERE aset_id = v_aset.id AND tanggal > v_h.tanggal;
    IF v_total_lebih_baru >= 500 THEN
      RAISE EXCEPTION 'Barang "%" (%): riwayatnya melebihi 500 baris bertanggal sesudah dokumen ini, pasangan pembatalan tak bisa dinilai dengan aman.',
        COALESCE(v_aset.nama_barang, '-'), COALESCE(v_aset.nibar, '-');
    END IF;

    SELECT * INTO v_penghalang FROM fn_baris_penghalang_sisip(v_aset.id, v_h.tanggal);
    IF v_penghalang.id IS NOT NULL THEN
      RAISE EXCEPTION 'Barang "%" (%) sudah punya transaksi "%" bertanggal % — LEBIH BARU dari tanggal dokumen pengalihan ini (%). Mencatat peristiwa bertanggal mundur akan menyisipkannya di tengah rantai & merusak replay penyusutan. Majukan tanggal dokumennya, atau batalkan transaksi yang lebih baru itu dulu.',
        COALESCE(v_aset.nama_barang, '-'), COALESCE(v_aset.nibar, '-'),
        v_penghalang.jenis, to_char(v_penghalang.tanggal, 'DD-MM-YYYY'), to_char(v_h.tanggal, 'DD-MM-YYYY');
    END IF;

    -- tanggal/periode = TANGGAL DOKUMEN (v_h.tanggal). `tgl_dokumen_sumber`
    -- tetap ditulis walau kini sama dgn kolom tanggal: pembacanya (laporan &
    -- audit) sudah mengandalkannya, dan baris lama memilikinya.
    INSERT INTO transaksi_bmd (aset_id, jenis, periode, tanggal, nilai, skpd_asal, skpd_tujuan, header_id, payload, keterangan)
    VALUES (v_aset.id, 'pengalihan_status', v_periode, v_h.tanggal, COALESCE(v_aset.nilai_perolehan, 0),
            v_h.skpd_id, v_h.skpd_tujuan, v_h.id,
            jsonb_build_object('no_sk', v_h.no_sk, 'tgl_dokumen_sumber', v_h.tanggal),
            'Pengalihan status penggunaan — ' || v_h.no_sk);
    UPDATE aset SET skpd_id = v_h.skpd_tujuan WHERE id = v_aset.id;
    v_n := v_n + 1;
  END LOOP;

  IF v_n = 0 THEN
    RAISE EXCEPTION 'Jurnal ini tidak berisi barang.';
  END IF;

  UPDATE jurnal_header
  SET approval_status = 'disetujui', approved_by = auth.uid(), approved_at = now()
  WHERE id = p_header_id;
  RETURN v_n;
END $function$;

CREATE OR REPLACE FUNCTION public.fn_terima_mutasi_internal(p_header_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_h                jurnal_header%ROWTYPE;
  v_item             jsonb;
  v_aset             RECORD;
  v_penghalang       RECORD;
  v_total_lebih_baru integer;
  v_n                integer := 0;
  v_periode          text;
  v_tahun            integer;
BEGIN
  SELECT * INTO v_h FROM jurnal_header WHERE id = p_header_id FOR UPDATE;
  IF NOT FOUND OR v_h.kategori <> 'mutasi_internal' THEN
    RAISE EXCEPTION 'Jurnal mutasi internal tidak ditemukan.';
  END IF;
  IF v_h.approval_status <> 'pending' THEN
    RAISE EXCEPTION 'Jurnal ini sudah %.', v_h.approval_status;
  END IF;
  IF NOT (fn_is_admin() OR fn_skpd_visible(v_h.skpd_tujuan)) THEN
    RAISE EXCEPTION 'Hanya SKPD tujuan (atau admin) yang boleh menerima mutasi ini.';
  END IF;

  IF v_h.tanggal IS NULL THEN
    RAISE EXCEPTION 'Jurnal ini belum punya tanggal dokumen — isi dulu di SKPD asal.';
  END IF;
  IF v_h.tanggal > current_date THEN
    RAISE EXCEPTION 'Tanggal dokumen (%) ada di masa depan. Periksa ulang tanggal dokumennya — tanggal ledger tidak boleh mendahului hari ini.',
      to_char(v_h.tanggal, 'DD-MM-YYYY');
  END IF;
  v_tahun := EXTRACT(YEAR FROM v_h.tanggal)::int;
  IF NOT EXISTS (SELECT 1 FROM tahun_buku WHERE tahun = v_tahun AND status = 'terbuka') THEN
    RAISE EXCEPTION 'Tanggal dokumen (%) jatuh di tahun % yang sudah TERKUNCI, jadi mutasinya tidak bisa dicatat di sana. Periksa ulang tanggal dokumennya — harus di tahun buku yang masih berjalan.',
      to_char(v_h.tanggal, 'DD-MM-YYYY'), v_tahun;
  END IF;

  v_periode := fn_periode_dari_tanggal(v_h.tanggal);

  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(v_h.payload->'draft_items', '[]'::jsonb))
  LOOP
    SELECT id, skpd_id, status, nilai_perolehan, nama_barang, nibar INTO v_aset
    FROM aset WHERE id = (v_item->>'aset_id')::uuid FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Barang % tidak ditemukan.', v_item->>'aset_id';
    END IF;
    IF v_aset.status <> 'aktif' OR v_aset.skpd_id IS DISTINCT FROM v_h.skpd_id THEN
      RAISE EXCEPTION 'Barang "%" (%) sudah berpindah/tidak aktif — minta SKPD asal merevisi jurnal.',
        COALESCE(v_aset.nama_barang, '-'), COALESCE(v_aset.nibar, '-');
    END IF;

    -- Guard arah MAJU — kini lewat fn_baris_penghalang_sisip (migrasi
    -- 20260922_01), yg mengabaikan pasangan batal yg sudah saling meniadakan.
    SELECT count(*) INTO v_total_lebih_baru
    FROM transaksi_bmd WHERE aset_id = v_aset.id AND tanggal > v_h.tanggal;
    IF v_total_lebih_baru >= 500 THEN
      RAISE EXCEPTION 'Barang "%" (%): riwayatnya melebihi 500 baris bertanggal sesudah dokumen ini, pasangan pembatalan tak bisa dinilai dengan aman.',
        COALESCE(v_aset.nama_barang, '-'), COALESCE(v_aset.nibar, '-');
    END IF;

    SELECT * INTO v_penghalang FROM fn_baris_penghalang_sisip(v_aset.id, v_h.tanggal);
    IF v_penghalang.id IS NOT NULL THEN
      RAISE EXCEPTION 'Barang "%" (%) sudah punya transaksi "%" bertanggal % — LEBIH BARU dari tanggal dokumen mutasi ini (%). Mencatat peristiwa bertanggal mundur akan menyisipkannya di tengah rantai & merusak replay penyusutan. Majukan tanggal dokumennya, atau batalkan transaksi yang lebih baru itu dulu.',
        COALESCE(v_aset.nama_barang, '-'), COALESCE(v_aset.nibar, '-'),
        v_penghalang.jenis, to_char(v_penghalang.tanggal, 'DD-MM-YYYY'), to_char(v_h.tanggal, 'DD-MM-YYYY');
    END IF;

    -- tanggal/periode = TANGGAL DOKUMEN. `tgl_dokumen_sumber` tetap ditulis
    -- walau kini sama dgn kolom tanggal: pembacanya sudah mengandalkannya, dan
    -- baris lama memilikinya (alasan kembar dgn 20260811_02).
    INSERT INTO transaksi_bmd (aset_id, jenis, periode, tanggal, nilai, skpd_asal, skpd_tujuan, header_id, payload, keterangan)
    VALUES (v_aset.id, 'mutasi_internal', v_periode, v_h.tanggal, COALESCE(v_aset.nilai_perolehan, 0),
            v_h.skpd_id, v_h.skpd_tujuan, v_h.id,
            jsonb_build_object('no_sk', v_h.no_sk, 'tgl_dokumen_sumber', v_h.tanggal),
            'Mutasi internal — ' || v_h.no_sk);
    UPDATE aset SET skpd_id = v_h.skpd_tujuan WHERE id = v_aset.id;
    v_n := v_n + 1;
  END LOOP;

  IF v_n = 0 THEN
    RAISE EXCEPTION 'Jurnal ini tidak berisi barang.';
  END IF;

  UPDATE jurnal_header
  SET approval_status = 'disetujui', approved_by = auth.uid(), approved_at = now()
  WHERE id = p_header_id;
  RETURN v_n;
END $function$;
