-- ============================================================================
-- Guard arah MAJU untuk Pengalihan Status Penggunaan & Mutasi Internal:
-- tolak "Terima" kalau tanggal dokumennya lebih MUNDUR dari transaksi lain
-- yang sudah tercatat pada aset yang sama.
--
-- ── Kenapa perlu (pertanyaan user 2026-09-18) ──────────────────────────────
-- Kasus nyata yang melatari: barang dipindah Kec. Ngancar → Pengelola Barang,
-- lalu Pengelola Barang → Bakesbangpol. Sejak migrasi 20260811_02/20260812_02,
-- baris ledger KEDUA jenis ini dicatat pakai TANGGAL DOKUMEN (bebas diisi SKPD
-- asal), bukan lagi `current_date` seperti sebelum itu. `current_date` dulu
-- otomatis mencegah backdate (hari ini selalu >= tanggal transaksi lama); begitu
-- dipindah ke tanggal dokumen, itu jaminannya HILANG dan tak digantikan apa pun.
-- Akibatnya pengalihan kedua (Pengelola → Bakesbangpol) bisa didokumentasikan
-- bertanggal LEBIH TUA dari pengalihan pertama (Ngancar → Pengelola) & RPC-nya
-- tidak menolak, selama tahun bukunya masih terbuka.
--
-- Ini pola yang sama dengan `cekBolehSisip` (lib/guardPembatalan.ts, dipasang
-- 2026-08-27 utk Kapitalisasi): engine mengurutkan replay by periode → tanggal
-- → created_at (BUKAN by id), jadi baris baru bertanggal mundur diproses
-- SEBELUM peristiwa yang sudah ada — rantai state berubah tanpa satu pun baris
-- lama disentuh, dan tanpa satu pun error.
--
-- ⚠️ TIDAK dipasang di client (lib/guardPembatalan.ts) karena materialisasi
-- Pengalihan/Mutasi Internal terjadi di RPC SECURITY DEFINER
-- (`fn_terima_pengalihan`/`fn_terima_mutasi_internal`), bukan dari komponen
-- yang mengimpor guardPembatalan.ts — dan aset bisa saja kena transaksi BARU di
-- rentang waktu antara draft dibuat & "Terima" diklik, jadi pemeriksaannya wajib
-- di titik "Terima", bukan di titik draft dibuat.
--
-- Pengecualian `batal_kapitalisasi` KEMBAR dgn `cekBolehSisip`: ia baris
-- REVERSAL yang dinetralkan engine lewat `target_trx_id`, bukan lewat urutan
-- tanggal, jadi menghitungnya di sini cuma menghasilkan penolakan palsu.
--
-- Tanda tangan kedua fungsi TIDAK berubah (RETURNS integer, param sama) →
-- boleh dijalankan kapan saja, tidak ada deploy-ordering.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_terima_pengalihan(p_header_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_h          jurnal_header%ROWTYPE;
  v_item       jsonb;
  v_aset       RECORD;
  v_penghalang RECORD;
  v_n          integer := 0;
  v_periode    text;
  v_tahun      integer;
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

    -- Guard arah MAJU (baru, migrasi ini) — lihat catatan berkas di atas.
    SELECT jenis, tanggal INTO v_penghalang
    FROM transaksi_bmd
    WHERE aset_id = v_aset.id AND jenis <> 'batal_kapitalisasi' AND tanggal > v_h.tanggal
    ORDER BY tanggal ASC, id ASC LIMIT 1;
    IF FOUND THEN
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
  v_h          jurnal_header%ROWTYPE;
  v_item       jsonb;
  v_aset       RECORD;
  v_penghalang RECORD;
  v_n          integer := 0;
  v_periode    text;
  v_tahun      integer;
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

    -- Guard arah MAJU (baru, migrasi ini) — lihat catatan berkas di atas.
    SELECT jenis, tanggal INTO v_penghalang
    FROM transaksi_bmd
    WHERE aset_id = v_aset.id AND jenis <> 'batal_kapitalisasi' AND tanggal > v_h.tanggal
    ORDER BY tanggal ASC, id ASC LIMIT 1;
    IF FOUND THEN
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
