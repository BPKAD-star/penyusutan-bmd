-- 20260704_16_rename_kolom_aset.sql
-- Rename kolom `aset` supaya nama kolom DB konsisten dgn label barunya (sebelumnya
-- migrasi 14 sengaja tidak merename, kini user minta rename beneran). RENAME
-- COLUMN di Postgres adalah operasi metadata-only (tidak menulis ulang data),
-- aman & cepat utk tabel 9.606 baris — TAPI wajib jalan SEBELUM deploy kode yang
-- mereferensikannya (lib/asetFields.ts, Pengadaan.tsx, Koreksi.tsx, lib/transaksi.ts,
-- app/dashboard/daftar-barang/page.tsx).
--
--   luas_tanah            -> luas
--   no_sertifikat         -> nomor_dokumen_kepemilikan
--   tgl_sertifikat        -> tanggal_dokumen_kepemilikan
--   atas_nama_sertifikat  -> nama_dokumen_kepemilikan
--   hak_kepemilikan       -> jenis_hak
--   spesifikasi           -> spesifikasi_lainnya

ALTER TABLE aset RENAME COLUMN luas_tanah TO luas;
ALTER TABLE aset RENAME COLUMN no_sertifikat TO nomor_dokumen_kepemilikan;
ALTER TABLE aset RENAME COLUMN tgl_sertifikat TO tanggal_dokumen_kepemilikan;
ALTER TABLE aset RENAME COLUMN atas_nama_sertifikat TO nama_dokumen_kepemilikan;
ALTER TABLE aset RENAME COLUMN hak_kepemilikan TO jenis_hak;
ALTER TABLE aset RENAME COLUMN spesifikasi TO spesifikasi_lainnya;
