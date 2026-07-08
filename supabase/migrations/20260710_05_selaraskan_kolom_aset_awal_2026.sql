-- Lanjutan penyamaan kolom aset_awal_2026 dgn aset (migrasi 20260704_20 sudah
-- menyamakan sebagian, tapi 8 kolom ini ditambah ke aset BELAKANGAN — setelah
-- migrasi itu jalan duluan — jadi belum ikut kebawa). Tipe & CHECK constraint
-- disamakan persis dgn versi di aset.
--
-- SENGAJA TIDAK ditambahkan (beda dari migrasi 20260704_20, masih berlaku):
-- cara_perolehan, status, created_at, updated_at — itu metadata siklus hidup
-- baris `aset`, bukan spesifikasi barang, gak relevan utk baris baseline beku.

ALTER TABLE aset_awal_2026 ADD COLUMN IF NOT EXISTS jumlah numeric NOT NULL DEFAULT 1;
ALTER TABLE aset_awal_2026 ADD COLUMN IF NOT EXISTS satuan text;
ALTER TABLE aset_awal_2026 ADD COLUMN IF NOT EXISTS harga_satuan numeric;
ALTER TABLE aset_awal_2026 ADD COLUMN IF NOT EXISTS penggunaan_pengamanan text;
ALTER TABLE aset_awal_2026 ADD COLUMN IF NOT EXISTS asal_usul text;
ALTER TABLE aset_awal_2026 ADD COLUMN IF NOT EXISTS pemanfaatan text;
ALTER TABLE aset_awal_2026 ADD COLUMN IF NOT EXISTS kondisi_barang text;
ALTER TABLE aset_awal_2026 ADD COLUMN IF NOT EXISTS tahun_pengadaan smallint;

DO $$
DECLARE cname text;
BEGIN
  SELECT conname INTO cname
  FROM pg_constraint
  WHERE conrelid = 'aset_awal_2026'::regclass AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%kondisi_barang%';
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE aset_awal_2026 DROP CONSTRAINT %I', cname);
  END IF;
END $$;
ALTER TABLE aset_awal_2026 ADD CONSTRAINT aset_awal_2026_kondisi_barang_check
  CHECK (kondisi_barang IS NULL OR kondisi_barang IN ('Baik', 'Rusak Ringan', 'Rusak Berat', 'Hilang', 'Tidak Ditemukan'));

DO $$
DECLARE cname text;
BEGIN
  SELECT conname INTO cname
  FROM pg_constraint
  WHERE conrelid = 'aset_awal_2026'::regclass AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%tahun_pengadaan%';
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE aset_awal_2026 DROP CONSTRAINT %I', cname);
  END IF;
END $$;
ALTER TABLE aset_awal_2026 ADD CONSTRAINT aset_awal_2026_tahun_pengadaan_check
  CHECK (tahun_pengadaan IS NULL OR tahun_pengadaan BETWEEN 1900 AND 2100);
