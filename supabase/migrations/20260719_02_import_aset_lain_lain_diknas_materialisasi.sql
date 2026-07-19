-- ============================================================================
-- Import Aset Lain-Lain Diknas (1.5.4) — TAHAP 2: materialisasi (2026-07-19).
-- Lanjutan 20260719_01 (stg_import_aset_lain_lain_diknas terisi 6.701 baris).
-- Pola SAMA dgn 20260718_02: staging → aset_awal_2026 → aset → transaksi_bmd
-- ('saldo_awal', periode 2025-S2, tgl 2025-12-31 — retroaktif, di-whitelist
-- migrasi 20260710_10). intra_ekstra dipertahankan dari file. 1.5.4 beku
-- otomatis di engine (guard perlakuan='lain_lain', tak perlu ubah kode).
--
-- ⚠️ WAJIB jalankan BLOK VERIFIKASI PRA-SYARAT DULU — terutama spot-check
-- dobel-hitung (d): 4.161 baris "Kode Asal: 1.3.2" datang dari Peralatan &
-- Mesin yg BARU diimpor 218rb kemarin. Kalau ada barang identik (nilai+tgl+
-- skpd) yg MASIH aktif di 1.3.2/1.3.5, cek manual apakah beneran barang beda
-- (pembelian massal) atau dobel sebelum insert. Pola sama seperti batch
-- sebelumnya yg ternyata aman (rasio kecil, pembelian massal) — tapi karena
-- overlap ke P&M lebih besar, JANGAN lewati verifikasi.
-- ============================================================================

-- ============================================================================
-- ⚠️ VERIFIKASI PRA-SYARAT — jalankan SEMUA, aman baru lanjut STEP 1.
--
--   -- (a) skpd_id valid — HARUS 0:
--   SELECT DISTINCT s.skpd_id FROM stg_import_aset_lain_lain_diknas s
--     LEFT JOIN admin_skpd sk ON sk.id=s.skpd_id WHERE sk.id IS NULL;
--
--   -- (b) kode valid — HARUS 0:
--   SELECT DISTINCT s.kode FROM stg_import_aset_lain_lain_diknas s
--     LEFT JOIN admin_kodefikasi_bmd k ON k.kode=s.kode WHERE k.kode IS NULL;
--
--   -- (c) baseline SEBELUM (catat):
--   SELECT count(*) AS lain_lain_sebelum FROM aset WHERE kode LIKE '1.5.4%';
--
--   -- (d) SPOT-CHECK DOBEL — ringkasan skala (bukan per-baris):
--   WITH cand AS (
--     SELECT s.nibar, s.nilai_perolehan, s.tgl_perolehan, s.skpd_id
--     FROM stg_import_aset_lain_lain_diknas s
--     WHERE EXISTS (SELECT 1 FROM aset a WHERE a.status='aktif'
--       AND a.kode NOT LIKE '1.5.4%'
--       AND a.nilai_perolehan=s.nilai_perolehan AND a.tgl_perolehan=s.tgl_perolehan
--       AND a.skpd_id=s.skpd_id))
--   SELECT count(*) AS baris_kena, count(DISTINCT (nilai_perolehan,tgl_perolehan,skpd_id)) AS grup,
--          COALESCE(sum(nilai_perolehan),0) AS total_nilai_kena FROM cand;
--   -- Kalau baris_kena kecil & total_nilai kecil dibanding total import →
--   -- pembelian massal (aman). Kalau besar → cek manual sebelum lanjut.
-- ============================================================================

-- ── STEP 1: staging → aset_awal_2026 ────────────────────────────────────────
INSERT INTO aset_awal_2026 (
  nibar, kode, nama_barang, skpd_id, nilai_perolehan, intra_ekstra, tgl_perolehan,
  akumulasi_2025, nilai_buku_awal, spesifikasi_lainnya, merek_tipe, no_polisi,
  no_bpkb, no_rangka, no_mesin, nomor_dokumen_kepemilikan, tanggal_dokumen_kepemilikan,
  nama_dokumen_kepemilikan, jenis_hak, alamat_detail, uraian_barang, keterangan,
  jumlah, satuan, harga_satuan, penggunaan_pengamanan, asal_usul, kondisi_barang,
  tahun_pengadaan, golongan
)
SELECT
  s.nibar, s.kode, s.nama_barang, s.skpd_id, s.nilai_perolehan,
  COALESCE(NULLIF(s.intra_ekstra, ''), 'intra'), s.tgl_perolehan,
  s.akumulasi_2025, s.nilai_buku_awal, NULLIF(s.spesifikasi_lainnya, ''),
  NULLIF(s.merek_tipe, ''), NULLIF(s.no_polisi, ''), NULLIF(s.no_bpkb, ''),
  NULLIF(s.no_rangka, ''), NULLIF(s.no_mesin, ''), NULLIF(s.nomor_dokumen_kepemilikan, ''),
  s.tanggal_dokumen_kepemilikan, NULLIF(s.nama_dokumen_kepemilikan, ''),
  NULLIF(s.jenis_hak, ''), NULLIF(s.alamat_detail, ''),
  COALESCE(NULLIF(s.uraian_barang, ''), s.kode), NULLIF(s.keterangan, ''),
  COALESCE(s.jumlah, 1), NULLIF(s.satuan, ''), s.harga_satuan,
  NULLIF(s.penggunaan_pengamanan, ''), NULLIF(s.asal_usul, ''),
  NULLIF(s.kondisi_barang, ''), s.tahun_pengadaan, s.golongan
FROM stg_import_aset_lain_lain_diknas s
WHERE NOT EXISTS (SELECT 1 FROM aset_awal_2026 x WHERE x.nibar = s.nibar);

-- ── STEP 2: aset_awal_2026 → aset (dibatasi ke batch ini) ───────────────────
INSERT INTO aset (
  nibar, kode, nama_barang, nilai_perolehan, tgl_perolehan, skpd_id, intra_ekstra,
  cara_perolehan, status, jumlah, satuan, harga_satuan, spesifikasi_lainnya,
  merek_tipe, no_polisi, no_bpkb, no_rangka, no_mesin, nomor_dokumen_kepemilikan,
  tanggal_dokumen_kepemilikan, nama_dokumen_kepemilikan, jenis_hak, alamat_detail,
  uraian_barang, keterangan, penggunaan_pengamanan, asal_usul, kondisi_barang, tahun_pengadaan
)
SELECT
  x.nibar, x.kode, x.nama_barang, x.nilai_perolehan, x.tgl_perolehan, x.skpd_id, x.intra_ekstra,
  'saldo_awal', 'aktif', x.jumlah, x.satuan, x.harga_satuan, x.spesifikasi_lainnya,
  x.merek_tipe, x.no_polisi, x.no_bpkb, x.no_rangka, x.no_mesin, x.nomor_dokumen_kepemilikan,
  x.tanggal_dokumen_kepemilikan, x.nama_dokumen_kepemilikan, x.jenis_hak, x.alamat_detail,
  x.uraian_barang, x.keterangan, x.penggunaan_pengamanan, x.asal_usul, x.kondisi_barang, x.tahun_pengadaan
FROM aset_awal_2026 x
WHERE x.nibar IN (SELECT nibar FROM stg_import_aset_lain_lain_diknas)
  AND NOT EXISTS (SELECT 1 FROM aset a WHERE a.nibar = x.nibar);

-- ── STEP 3: ledger 'saldo_awal' (2025-S2, 2025-12-31) ───────────────────────
INSERT INTO transaksi_bmd (aset_id, jenis, periode, tanggal, nilai, skpd_tujuan, payload, keterangan)
SELECT a.id, 'saldo_awal', '2025-S2', DATE '2025-12-31', a.nilai_perolehan, a.skpd_id,
       jsonb_build_object(
         'akumulasi_2025',        x.akumulasi_2025,
         'nilai_buku_awal',       x.nilai_buku_awal,
         'sisa_masa_manfaat_smt', NULL,
         'masa_manfaat_smt',      NULL,
         'beban_per_smt',         NULL,
         'sumber',                'Import Aset Lain Lain Diknas.xlsx — backfill 2026-07-19'
       ),
       'Baseline — Aset Lain-Lain Diknas (1.5.4), beku sejak baseline'
FROM aset a
JOIN aset_awal_2026 x ON x.nibar = a.nibar
WHERE a.cara_perolehan = 'saldo_awal'
  AND a.nibar IN (SELECT nibar FROM stg_import_aset_lain_lain_diknas)
  AND NOT EXISTS (SELECT 1 FROM transaksi_bmd t WHERE t.aset_id = a.id AND t.jenis = 'saldo_awal');

-- ============================================================================
-- VERIFIKASI AKHIR:
--   SELECT count(*) FROM aset_awal_2026 WHERE nibar IN (SELECT nibar FROM stg_import_aset_lain_lain_diknas); -- 6701
--   SELECT count(*) FROM aset WHERE kode LIKE '1.5.4%';  -- lain_lain_sebelum + jumlah baris BARU
--   SELECT count(*) FROM stg_import_aset_lain_lain_diknas s LEFT JOIN aset a ON a.nibar=s.nibar WHERE a.id IS NULL; -- 0
--   SELECT count(*) FROM aset a WHERE a.nibar IN (SELECT nibar FROM stg_import_aset_lain_lain_diknas)
--     AND NOT EXISTS (SELECT 1 FROM transaksi_bmd t WHERE t.aset_id=a.id AND t.jenis='saldo_awal'); -- 0
--   SELECT intra_ekstra, count(*) FROM aset WHERE nibar IN (SELECT nibar FROM stg_import_aset_lain_lain_diknas) GROUP BY 1; -- 100% intra
-- ============================================================================
