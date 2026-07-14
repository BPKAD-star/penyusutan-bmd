-- ============================================================================
-- Perluas pilihan role_bmd (admin_pegawai) jadi 9 peran resmi pengelolaan BMD
-- (Permendagri 19/2016). role_bmd murni ATRIBUT master pegawai — tidak dipakai
-- RLS/engine/logic mana pun (dicek: hanya di form Daftar Pegawai), jadi aman.
-- Nilai lama 'penyimpan_barang' tetap diizinkan (legacy) walau tak ditawarkan
-- di UI, supaya data lama (kalau ada) tidak melanggar. Jalankan di SQL Editor.
-- ============================================================================

-- Drop CHECK lama (nama auto-generate; tabel dulu bernama 'pegawai' sebelum rename).
DO $$
DECLARE c text;
BEGIN
  SELECT conname INTO c FROM pg_constraint
  WHERE conrelid = 'admin_pegawai'::regclass AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%role_bmd%';
  IF c IS NOT NULL THEN
    EXECUTE format('ALTER TABLE admin_pegawai DROP CONSTRAINT %I', c);
  END IF;
END $$;

ALTER TABLE admin_pegawai ADD CONSTRAINT admin_pegawai_role_bmd_check CHECK (role_bmd IN (
  'pengelola_barang',
  'penatausahaan_barang_pengelola',
  'pengurus_barang_pengelola',
  'pengguna_barang',
  'penatausahaan_barang_pengguna',
  'pengurus_barang',
  'pembantu_pengurus_barang',
  'kuasa_pengguna_barang',
  'pengurus_barang_pembantu',
  'penyimpan_barang'  -- legacy, dipertahankan agar data lama tidak melanggar
));
