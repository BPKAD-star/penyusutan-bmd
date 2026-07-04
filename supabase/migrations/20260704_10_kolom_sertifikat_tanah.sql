-- ============================================================================
-- Kolom khusus Tanah (1.3.1): luas, data sertifikat. Field sparse — hanya
-- relevan untuk golongan Tanah, NULL untuk golongan lain. Konsisten dengan
-- pola kolom sparse yang sudah ada (merek_tipe, spesifikasi).
--
-- Diedit lewat jenis transaksi 'koreksi_spesifikasi' yang sudah ada (lib/
-- transaksi.ts) — bukan UPDATE langsung — supaya perubahan tetap tercatat
-- di ledger (PLAN §1.1: koreksi = transaksi baru, bukan edit diam-diam).
-- ============================================================================

ALTER TABLE aset ADD COLUMN IF NOT EXISTS luas_tanah numeric;              -- m2
ALTER TABLE aset ADD COLUMN IF NOT EXISTS no_sertifikat text;
ALTER TABLE aset ADD COLUMN IF NOT EXISTS tgl_sertifikat date;
ALTER TABLE aset ADD COLUMN IF NOT EXISTS atas_nama_sertifikat text;
ALTER TABLE aset ADD COLUMN IF NOT EXISTS hak_kepemilikan text;            -- HM/HGB/HP/HGU/HPL, dst — teks bebas
