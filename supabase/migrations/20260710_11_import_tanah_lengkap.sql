-- ============================================================================
-- Import Tanah Lengkap (2026-07-10) — TINDES data Tanah dari staging_tanah.csv
-- (diimpor manual ke stg_import_tanah via Table Editor SEBELUM migrasi ini).
-- 2732 baris = SEMUA tanah yang sama dgn yang sudah ada di DB, versi lebih
-- lengkap + NIBAR yang sudah dibetulkan di file. Prinsip: TINDES yang lama
-- (termasuk NIBAR), isi kolom yang kosong dari file. BUKAN insert baru kalau
-- barangnya sudah ada.
--
-- 3 langkah:
--   1. Barang yang NIBAR-nya SAMA dgn live (2715 baris) → update field
--      deskriptif in-place (file menang kalau ada isinya).
--   2. Barang yang NIBAR-nya BEDA dari live (di file NIBAR-nya dibetulkan) →
--      cari baris live yang SAMA (by nama+skpd+tgl+nilai), TINDES NIBAR-nya
--      jadi NIBAR dari file + isi deskriptif. Dijaga: cuma nindes kalau
--      identitasnya unik di kedua sisi (gak ada kembar ambigu).
--   3. Yang beneran belum ada sama sekali (NIBAR gak match & gak ada kembaran
--      identitas) → baru INSERT sbg baseline (ledger saldo_awal 2025-12-31,
--      butuh whitelist migrasi 20260710_07).
--   4. 147 baris multi-sertifikat (nomor dipisah koma) → pecah ke
--      aset_bidang_tanah (luas per bidang belum diketahui, isi manual via GIS).
--
-- Urutan LANGKAH 2 SEBELUM 3 itu WAJIB: langkah 2 mindahin NIBAR live ke NIBAR
-- baru dari file, otomatis MEMBEBASKAN NIBAR lama — jadi kasus "Semen vs
-- Bendosari II" (dua tanah beda rebutan 1 NIBAR di file vs live) kelar sendiri:
-- Bendosari pindah ke NIBAR barunya dulu, NIBAR lama bebas, baru Semen masuk.
--
-- PRASYARAT: (1) stg_import_tanah terisi 2732 baris; (2) migrasi 20260710_07
-- SUDAH dijalankan. Re-runnable (semua idempotent / dijaga NOT EXISTS).
-- ============================================================================

-- Kolom deskriptif yang diisi (dipakai di langkah 1 & 2). nomor_dokumen yang
-- ada koma (multi-bidang) TIDAK ditulis ke aset — jadi urusan langkah 4.

-- ── 1. NIBAR sama dgn live → enrich in-place ────────────────────────────────
UPDATE aset a SET
  luas                        = COALESCE(s.luas, a.luas),
  nomor_dokumen_kepemilikan   = COALESCE(NULLIF(CASE WHEN s.nomor_dokumen_kepemilikan LIKE '%,%' THEN NULL ELSE s.nomor_dokumen_kepemilikan END, ''), a.nomor_dokumen_kepemilikan),
  tanggal_dokumen_kepemilikan = COALESCE(s.tanggal_dokumen_kepemilikan, a.tanggal_dokumen_kepemilikan),
  nama_dokumen_kepemilikan    = COALESCE(NULLIF(s.nama_dokumen_kepemilikan, ''), a.nama_dokumen_kepemilikan),
  jenis_hak                   = COALESCE(NULLIF(s.jenis_hak, ''), a.jenis_hak),
  alamat_detail               = COALESCE(NULLIF(s.alamat_detail, ''), a.alamat_detail),
  latitude                    = COALESCE(s.latitude, a.latitude),
  longitude                   = COALESCE(s.longitude, a.longitude)
FROM stg_import_tanah s
WHERE a.nibar = s.nibar;

-- ── 2. NIBAR beda (dibetulkan di file) → cari kembaran identitas, tindes NIBAR ─
-- "changed" = baris file yang NIBAR-nya belum ada di live.
-- "uniq" = changed yang identitasnya (nama+skpd+tgl+nilai) muncul PERSIS 1x di
-- staging DAN persis 1x di aset live golongan Tanah — biar gak salah nindes.
WITH changed AS (
  SELECT s.* FROM stg_import_tanah s
  WHERE NOT EXISTS (SELECT 1 FROM aset a WHERE a.nibar = s.nibar)
),
uniq AS (
  SELECT c.* FROM changed c
  WHERE (SELECT count(*) FROM changed c2
         WHERE c2.nama_barang = c.nama_barang AND c2.skpd_id = c.skpd_id
           AND c2.tgl_perolehan = c.tgl_perolehan AND c2.nilai_perolehan = c.nilai_perolehan) = 1
    AND (SELECT count(*) FROM aset a
         WHERE a.nama_barang = c.nama_barang AND a.skpd_id = c.skpd_id
           AND a.tgl_perolehan = c.tgl_perolehan AND a.nilai_perolehan = c.nilai_perolehan
           AND a.kode LIKE '1.3.1%') = 1
)
UPDATE aset a SET
  nibar                       = u.nibar,
  luas                        = COALESCE(u.luas, a.luas),
  nomor_dokumen_kepemilikan   = COALESCE(NULLIF(CASE WHEN u.nomor_dokumen_kepemilikan LIKE '%,%' THEN NULL ELSE u.nomor_dokumen_kepemilikan END, ''), a.nomor_dokumen_kepemilikan),
  tanggal_dokumen_kepemilikan = COALESCE(u.tanggal_dokumen_kepemilikan, a.tanggal_dokumen_kepemilikan),
  nama_dokumen_kepemilikan    = COALESCE(NULLIF(u.nama_dokumen_kepemilikan, ''), a.nama_dokumen_kepemilikan),
  jenis_hak                   = COALESCE(NULLIF(u.jenis_hak, ''), a.jenis_hak),
  alamat_detail               = COALESCE(NULLIF(u.alamat_detail, ''), a.alamat_detail),
  latitude                    = COALESCE(u.latitude, a.latitude),
  longitude                   = COALESCE(u.longitude, a.longitude)
FROM uniq u
WHERE a.nama_barang = u.nama_barang AND a.skpd_id = u.skpd_id
  AND a.tgl_perolehan = u.tgl_perolehan AND a.nilai_perolehan = u.nilai_perolehan
  AND a.kode LIKE '1.3.1%';

-- ── 3. Yang beneran baru (NIBAR tetap gak match SETELAH langkah 2, & gak ada
--       kembaran identitas) → INSERT baseline + ledger saldo_awal ─────────────
-- NIBAR dipakai LANGSUNG dari file (bang sudah betulin, dijamin unik di file;
-- NIBAR live yang tadinya nabrak sudah dibebasin langkah 2).
INSERT INTO aset (
  nibar, kode, nama_barang, nilai_perolehan, tgl_perolehan, skpd_id, intra_ekstra,
  cara_perolehan, status, luas, nomor_dokumen_kepemilikan, tanggal_dokumen_kepemilikan,
  nama_dokumen_kepemilikan, jenis_hak, alamat_detail, latitude, longitude, uraian_barang, keterangan
)
SELECT
  s.nibar, s.kode, s.nama_barang, s.nilai_perolehan, s.tgl_perolehan, s.skpd_id, LOWER(s.intra_ekstra),
  'saldo_awal', 'aktif', s.luas,
  CASE WHEN s.nomor_dokumen_kepemilikan LIKE '%,%' THEN NULL ELSE NULLIF(s.nomor_dokumen_kepemilikan, '') END,
  s.tanggal_dokumen_kepemilikan, NULLIF(s.nama_dokumen_kepemilikan, ''), NULLIF(s.jenis_hak, ''),
  NULLIF(s.alamat_detail, ''), s.latitude, s.longitude,
  COALESCE((SELECT kb.uraian FROM admin_kodefikasi_bmd kb WHERE kb.kode = s.kode), NULLIF(s.uraian_barang, '')),
  NULLIF(s.keterangan, '')
FROM stg_import_tanah s
WHERE NOT EXISTS (SELECT 1 FROM aset a WHERE a.nibar = s.nibar);

INSERT INTO transaksi_bmd (aset_id, jenis, periode, tanggal, nilai, skpd_tujuan, payload, keterangan)
SELECT a.id, 'saldo_awal', '2025-S2', DATE '2025-12-31', a.nilai_perolehan, a.skpd_id,
       jsonb_build_object('sumber', 'Import Tanah Lengkap (update).xlsx — backfill 2026-07-10',
                          'tgl_perolehan_asli', a.tgl_perolehan),
       'Baseline tambahan — Tanah yang kelewat di baseline 2025 awal'
FROM aset a
JOIN stg_import_tanah s ON s.nibar = a.nibar
WHERE a.cara_perolehan = 'saldo_awal'
  AND NOT EXISTS (SELECT 1 FROM transaksi_bmd tb WHERE tb.aset_id = a.id AND tb.jenis = 'saldo_awal');

-- ── 4. Pecah multi-sertifikat jadi aset_bidang_tanah ────────────────────────
INSERT INTO aset_bidang_tanah (
  aset_id, nama_bidang, jenis_hak, nomor_dokumen_kepemilikan, tanggal_dokumen_kepemilikan,
  nama_dokumen_kepemilikan, alamat_detail, latitude, longitude, keterangan
)
SELECT a.id, 'Sertifikat No. ' || trim(x.nomor), NULLIF(s.jenis_hak, ''), trim(x.nomor),
       s.tanggal_dokumen_kepemilikan, NULLIF(s.nama_dokumen_kepemilikan, ''),
       NULLIF(s.alamat_detail, ''), s.latitude, s.longitude,
       'Auto-split Import Tanah Lengkap 2026-07-10 — luas per bidang isi manual via GIS.'
FROM stg_import_tanah s
JOIN aset a ON a.nibar = s.nibar
CROSS JOIN LATERAL unnest(string_to_array(s.nomor_dokumen_kepemilikan, ',')) AS x(nomor)
WHERE s.nomor_dokumen_kepemilikan LIKE '%,%'
  AND trim(x.nomor) <> ''
  AND NOT EXISTS (SELECT 1 FROM aset_bidang_tanah b WHERE b.aset_id = a.id);

-- Verifikasi:
--   SELECT count(*) FROM aset WHERE kode LIKE '1.3.1%';  -- naik cuma sejumlah barang yg BENERAN baru (harusnya sedikit, bukan +2732)
--   SELECT count(*) FROM stg_import_tanah s LEFT JOIN aset a ON a.nibar=s.nibar WHERE a.id IS NULL;  -- HARUS 0 (semua file nibar sudah ada di live)
--   SELECT count(*) FROM aset_bidang_tanah;  -- nambah dari 147 baris multi-sertifikat
