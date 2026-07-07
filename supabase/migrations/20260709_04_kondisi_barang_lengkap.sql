-- ============================================================================
-- Lengkapi CHECK constraint `kondisi_barang` di `aset`: tambah 'Hilang' dan
-- 'Tidak Ditemukan', selain 3 nilai standar e-BMD yang sudah ada (Baik/Rusak
-- Ringan/Rusak Berat). Kolom `kondisi_barang` SENDIRI sudah ada sejak migrasi
-- 20260707_04_kolom_asal_usul_kondisi.sql — ini CUMA lebarin CHECK-nya, bukan
-- kolom baru. Dibutuhkan utk Koreksi Spesifikasi & nanti menu Inventarisasi.
-- ============================================================================

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
  CHECK (kondisi_barang IS NULL OR kondisi_barang IN ('Baik', 'Rusak Ringan', 'Rusak Berat', 'Hilang', 'Tidak Ditemukan'));
