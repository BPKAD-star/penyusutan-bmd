-- ============================================================================
-- Usulan Pengurus Barang — BATAL SETUJUI (mundur dari 'disetujui' → 'diajukan').
-- Aditif di atas 20260723_01. Tambah kolom penanda `pegawai_created` supaya batal
-- setujui bisa AMAN menghapus pegawai yg BARU dibuat oleh persetujuan itu, tapi
-- TIDAK menghapus pegawai yg sebelumnya sudah ada (cuma di-update) atau yg sudah
-- punya akun/dipakai (dilindungi FK → best-effort, tak menggagalkan batal).
--
-- Jalankan di Supabase SQL Editor SETELAH 20260723_01_admin_usulan_pengurus.sql.
-- ============================================================================

ALTER TABLE admin_usulan_pengurus
  ADD COLUMN IF NOT EXISTS pegawai_created boolean NOT NULL DEFAULT false;

-- ── Approve: catat apakah pegawai BARU dibuat (untuk keperluan batal) ────────
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
  VALUES (v_u.nip, v_u.nama, v_u.pangkat, v_u.golongan, v_u.jabatan, v_u.jenis_kelamin, 'pengurus_barang', v_u.skpd_id)
  ON CONFLICT (nip) DO UPDATE SET
    nama = EXCLUDED.nama, pangkat = EXCLUDED.pangkat, golongan = EXCLUDED.golongan,
    jabatan = EXCLUDED.jabatan, jenis_kelamin = EXCLUDED.jenis_kelamin,
    role_bmd = 'pengurus_barang', skpd_id = EXCLUDED.skpd_id, updated_at = now()
  RETURNING id INTO v_peg;

  UPDATE admin_usulan_pengurus
  SET status = 'disetujui', pegawai_id = v_peg, disetujui_at = now(),
      catatan_admin = NULL, pegawai_created = (NOT v_exists)
  WHERE id = p_id;

  RETURN v_peg;
END $$;

-- ── Batal Setujui: 'disetujui' → 'diajukan' (mundur) + hapus pegawai baru ────
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

  -- Hapus pegawai HANYA kalau: dibuat oleh persetujuan ini, tak dipakai
  -- persetujuan lain, dan tak terhalang FK (mis. sudah punya akun) → best-effort.
  IF v_u.pegawai_created AND v_u.pegawai_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM admin_usulan_pengurus u
       WHERE u.pegawai_id = v_u.pegawai_id AND u.id <> p_id AND u.status = 'disetujui'
     ) THEN
    BEGIN
      DELETE FROM admin_pegawai WHERE id = v_u.pegawai_id;
    EXCEPTION WHEN foreign_key_violation THEN
      NULL; -- pegawai sudah dipakai/berakun → biarkan, jangan gagalkan batal
    END;
  END IF;

  UPDATE admin_usulan_pengurus
  SET status = 'diajukan', pegawai_id = NULL, disetujui_at = NULL, pegawai_created = false
  WHERE id = p_id;
END $$;

REVOKE ALL ON FUNCTION fn_batal_setujui_usulan_pengurus(uuid) FROM public;
GRANT EXECUTE ON FUNCTION fn_batal_setujui_usulan_pengurus(uuid) TO authenticated;
