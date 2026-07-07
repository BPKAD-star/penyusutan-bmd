-- ============================================================================
-- Kolom tambahan di `aset`: asal_usul, pemanfaatan, kondisi_barang,
-- tahun_pengadaan. SEMUA nullable, sekadar tambah kolom (bukan tabel baru) —
-- konsisten sama pola "wide table" yang sudah ada (lihat lib/asetFields.ts).
--
-- Skoop migrasi ini SENGAJA cuma tambah kolom, TANPA UI/logic:
--   - asal_usul, tahun_pengadaan → keterangan display-only di Daftar Barang.
--   - pemanfaatan → placeholder, nanti diisi/diatur dari menu Pemanfaatan
--     terpisah (ledger jenis baru, belum dibangun — jangan diasumsikan
--     auto-terisi dari sini).
--   - kondisi_barang → dibatasi ke 3 nilai standar e-BMD (Baik/Rusak
--     Ringan/Rusak Berat), nanti diisi/diubah lewat menu Koreksi.
-- Jalankan SETELAH 20260707_03_mutasi_internal_approval.sql.
-- ============================================================================

ALTER TABLE aset ADD COLUMN IF NOT EXISTS asal_usul      text;
ALTER TABLE aset ADD COLUMN IF NOT EXISTS pemanfaatan     text;
ALTER TABLE aset ADD COLUMN IF NOT EXISTS kondisi_barang  text;
ALTER TABLE aset ADD COLUMN IF NOT EXISTS tahun_pengadaan smallint;

DO $$
DECLARE cname text;
BEGIN
  SELECT conname INTO cname
  FROM pg_constraint
  WHERE conrelid = 'aset'::regclass AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%kondisi_barang%';
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE aset DROP CONSTRAINT %I', cname);
  END IF;
END $$;
ALTER TABLE aset ADD CONSTRAINT aset_kondisi_barang_check
  CHECK (kondisi_barang IS NULL OR kondisi_barang IN ('Baik', 'Rusak Ringan', 'Rusak Berat'));

DO $$
DECLARE cname text;
BEGIN
  SELECT conname INTO cname
  FROM pg_constraint
  WHERE conrelid = 'aset'::regclass AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%tahun_pengadaan%';
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE aset DROP CONSTRAINT %I', cname);
  END IF;
END $$;
ALTER TABLE aset ADD CONSTRAINT aset_tahun_pengadaan_check
  CHECK (tahun_pengadaan IS NULL OR tahun_pengadaan BETWEEN 1900 AND 2100);
