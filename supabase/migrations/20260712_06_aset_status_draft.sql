-- ============================================================================
-- aset.status: tambah nilai 'draft'.
-- Barang KDP (per-barang) dibuat SAAT input rincian supaya spesifikasi bisa
-- diisi sebelum approval — TAPI harus TERSEMBUNYI dari Daftar Barang & laporan
-- sampai admin menyetujui termin (pola approval app: data tak resmi jangan
-- bocor). Semua reader menyaring status='aktif', jadi 'draft' otomatis
-- terkecuali. setujuiTermin (lib/kdp.ts) memflip 'draft' → 'aktif'.
--
-- Jalankan SETELAH 20260712_05_pegawai_gender.sql.
-- ============================================================================
DO $$
DECLARE c text;
BEGIN
  SELECT conname INTO c FROM pg_constraint
  WHERE conrelid = 'aset'::regclass AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%status%';
  IF c IS NOT NULL THEN EXECUTE format('ALTER TABLE aset DROP CONSTRAINT %I', c); END IF;
END $$;

ALTER TABLE aset ADD CONSTRAINT aset_status_check CHECK (status IN ('aktif','dihapus','draft'));
