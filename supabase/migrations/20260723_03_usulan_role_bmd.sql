-- ============================================================================
-- Usulan Pengurus Barang — usul dgn PERAN (role_bmd) selain 'pengurus_barang'.
-- Aditif di atas 20260723_02.
--   (1) Tambah 'penanggung_jawab_ruangan' ke role_bmd admin_pegawai (recreate CHECK).
--   (2) Kolom role_bmd di admin_usulan_pengurus (peran yang diusulkan).
--   (3) fn_setujui pakai role_bmd dari usulan (bukan hardcoded 'pengurus_barang').
-- role_bmd = ATRIBUT master pegawai (tidak dipakai RLS/engine) → aman.
--
-- Jalankan di SQL Editor SETELAH 20260723_02_batal_setujui_usulan_pengurus.sql.
-- ============================================================================

-- (1) Tambah peran baru ke master pegawai.
DO $$ DECLARE c text; BEGIN
  SELECT conname INTO c FROM pg_constraint
  WHERE conrelid = 'admin_pegawai'::regclass AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%role_bmd%';
  IF c IS NOT NULL THEN EXECUTE format('ALTER TABLE admin_pegawai DROP CONSTRAINT %I', c); END IF;
END $$;
ALTER TABLE admin_pegawai ADD CONSTRAINT admin_pegawai_role_bmd_check CHECK (role_bmd IN (
  'pengelola_barang', 'penatausahaan_barang_pengelola', 'pengurus_barang_pengelola',
  'pengguna_barang', 'penatausahaan_barang_pengguna', 'pengurus_barang',
  'pembantu_pengurus_barang', 'kuasa_pengguna_barang', 'pengurus_barang_pembantu',
  'penanggung_jawab_ruangan',
  'penyimpan_barang'  -- legacy
));

-- (2) Peran yang diusulkan (subset yang ditawarkan di form usulan).
ALTER TABLE admin_usulan_pengurus
  ADD COLUMN IF NOT EXISTS role_bmd text NOT NULL DEFAULT 'pengurus_barang';
DO $$ DECLARE c text; BEGIN
  SELECT conname INTO c FROM pg_constraint
  WHERE conrelid = 'admin_usulan_pengurus'::regclass AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%role_bmd%';
  IF c IS NOT NULL THEN EXECUTE format('ALTER TABLE admin_usulan_pengurus DROP CONSTRAINT %I', c); END IF;
END $$;
ALTER TABLE admin_usulan_pengurus ADD CONSTRAINT admin_usulan_pengurus_role_bmd_check CHECK (role_bmd IN (
  'pengurus_barang', 'pengurus_barang_pembantu', 'pembantu_pengurus_barang',
  'penatausahaan_barang_pengguna', 'penanggung_jawab_ruangan'
));

-- (3) Approve pakai role_bmd dari usulan (carry-forward logika pegawai_created dari 02).
CREATE OR REPLACE FUNCTION fn_setujui_usulan_pengurus(p_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_u       admin_usulan_pengurus%ROWTYPE;
  v_peg     uuid;
  v_exists  boolean;
BEGIN
  IF NOT fn_is_admin() THEN
    RAISE EXCEPTION 'Hanya admin yang boleh menyetujui usulan.';
  END IF;

  SELECT * INTO v_u FROM admin_usulan_pengurus WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Usulan tidak ditemukan.'; END IF;
  IF v_u.status <> 'diajukan' THEN
    RAISE EXCEPTION 'Hanya usulan berstatus "diajukan" yang bisa disetujui (status sekarang: %).', v_u.status;
  END IF;

  SELECT EXISTS(SELECT 1 FROM admin_pegawai WHERE nip = v_u.nip) INTO v_exists;

  INSERT INTO admin_pegawai (nip, nama, pangkat, golongan, jabatan, jenis_kelamin, role_bmd, skpd_id)
  VALUES (v_u.nip, v_u.nama, v_u.pangkat, v_u.golongan, v_u.jabatan, v_u.jenis_kelamin, v_u.role_bmd, v_u.skpd_id)
  ON CONFLICT (nip) DO UPDATE SET
    nama = EXCLUDED.nama, pangkat = EXCLUDED.pangkat, golongan = EXCLUDED.golongan,
    jabatan = EXCLUDED.jabatan, jenis_kelamin = EXCLUDED.jenis_kelamin,
    role_bmd = EXCLUDED.role_bmd, skpd_id = EXCLUDED.skpd_id, updated_at = now()
  RETURNING id INTO v_peg;

  UPDATE admin_usulan_pengurus
  SET status = 'disetujui', pegawai_id = v_peg, disetujui_at = now(),
      catatan_admin = NULL, pegawai_created = (NOT v_exists)
  WHERE id = p_id;

  RETURN v_peg;
END $$;
