-- ============================================================================
-- Usulan Pengurus Barang — MODEL PER-TAHUN (snapshot historis).
-- Aditif di atas 20260723_03.
--   (1) Kolom `tahun` di admin_usulan_pengurus (SK/Lampiran per tahun).
--   (2) Batal Setujui HANYA tahun berjalan; tahun lampau FINAL (tak bisa mundur).
--       Batal juga TIDAK lagi menghapus pegawai master (model per-tahun: pegawai
--       = master orang; keanggotaan SK per tahun = baris usulan). Menghindari
--       crash/inkonsistensi dgn data yg sudah tercatat.
--
-- Jalankan di SQL Editor SETELAH 20260723_03_usulan_role_bmd.sql.
-- ============================================================================

-- (1) Tambah kolom tahun + backfill dari tanggal yg ada.
ALTER TABLE admin_usulan_pengurus ADD COLUMN IF NOT EXISTS tahun int;
UPDATE admin_usulan_pengurus SET tahun = COALESCE(
  EXTRACT(YEAR FROM tgl_usulan)::int,
  EXTRACT(YEAR FROM disetujui_at)::int,
  EXTRACT(YEAR FROM created_at)::int,
  EXTRACT(YEAR FROM now())::int
) WHERE tahun IS NULL;
ALTER TABLE admin_usulan_pengurus ALTER COLUMN tahun SET NOT NULL;
ALTER TABLE admin_usulan_pengurus ALTER COLUMN tahun SET DEFAULT EXTRACT(YEAR FROM now())::int;
CREATE INDEX IF NOT EXISTS idx_admin_usulan_pengurus_tahun ON admin_usulan_pengurus(tahun);

-- (2) Batal Setujui: hanya tahun berjalan, tak menyentuh pegawai master.
CREATE OR REPLACE FUNCTION fn_batal_setujui_usulan_pengurus(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_u admin_usulan_pengurus%ROWTYPE;
BEGIN
  IF NOT fn_is_admin() THEN
    RAISE EXCEPTION 'Hanya admin yang boleh membatalkan persetujuan.';
  END IF;

  SELECT * INTO v_u FROM admin_usulan_pengurus WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Usulan tidak ditemukan.'; END IF;
  IF v_u.status <> 'disetujui' THEN
    RAISE EXCEPTION 'Hanya usulan berstatus "disetujui" yang bisa dibatalkan.';
  END IF;

  -- Tahun lampau = FINAL (SK & data sudah tercatat) → tak bisa mundur.
  IF v_u.tahun < EXTRACT(YEAR FROM now())::int THEN
    RAISE EXCEPTION 'Usulan tahun % sudah final dan tidak bisa dibatalkan. Batal Setujui hanya untuk tahun berjalan.', v_u.tahun;
  END IF;

  -- Model per-tahun: cukup keluarkan dari SK tahun ini (revert status). Pegawai
  -- master TIDAK dihapus (hapus manual lewat Daftar Pegawai bila memang perlu).
  UPDATE admin_usulan_pengurus
  SET status = 'diajukan', disetujui_at = NULL, pegawai_id = NULL, pegawai_created = false
  WHERE id = p_id;
END $$;
