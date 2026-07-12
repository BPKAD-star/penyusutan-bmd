-- ============================================================================
-- Daftar Pegawai — kolom jenis kelamin (untuk kebutuhan agent/pengenalan
-- pengurus barang nanti). Nullable + CHECK 'L'/'P' → data lama tetap valid &
-- bisa diedit belakangan.
--
-- Jalankan SETELAH 20260712_04_kdp_per_barang.sql.
-- ============================================================================
ALTER TABLE admin_pegawai
  ADD COLUMN IF NOT EXISTS jenis_kelamin text CHECK (jenis_kelamin IN ('L','P'));
