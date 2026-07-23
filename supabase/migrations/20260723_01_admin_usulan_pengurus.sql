-- ============================================================================
-- Usulan Pengurus Barang (Fase 1) — alur usul → ajukan → admin setujui/kembalikan
-- → (disetujui) auto-materialize ke admin_pegawai (role_bmd='pengurus_barang').
--
-- SIFAT: data kepegawaian/administratif, BUKAN ledger — bebas di-UPDATE/DELETE
--   selama belum disetujui. Tidak menyentuh transaksi_bmd/aset/penyusutan.
--   Pola mirip draft-approve Cara Perolehan, tapi tabel sendiri (bukan
--   jurnal_header) karena bukan barang.
--
-- Jalankan di Supabase SQL Editor SETELAH 20260722_05_admin_program.sql.
-- ============================================================================

CREATE TABLE IF NOT EXISTS admin_usulan_pengurus (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  skpd_id        bigint NOT NULL REFERENCES admin_skpd(id),
  -- Field pegawai (sama dgn admin_pegawai; pangkat auto dari golongan di UI).
  nama           text NOT NULL,
  nip            text NOT NULL,
  pangkat        text,
  golongan       text,
  jabatan        text,
  jenis_kelamin  text CHECK (jenis_kelamin IN ('L','P')),
  -- 'pengurus_barang' (Fase 1) | 'pegawai_lain' (Fase 2 — belum dipakai UI).
  jenis          text NOT NULL DEFAULT 'pengurus_barang'
                 CHECK (jenis IN ('pengurus_barang','pegawai_lain')),
  status         text NOT NULL DEFAULT 'draft'
                 CHECK (status IN ('draft','diajukan','disetujui','dikembalikan')),
  catatan_admin  text,                         -- alasan saat dikembalikan
  no_usulan      text,                         -- no surat usulan (opsional, diisi SKPD)
  tgl_usulan     date,
  pegawai_id     uuid REFERENCES admin_pegawai(id), -- diisi saat disetujui
  diajukan_at    timestamptz,
  disetujui_at   timestamptz,
  created_by     uuid DEFAULT auth.uid(),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_admin_usulan_pengurus_skpd   ON admin_usulan_pengurus(skpd_id);
CREATE INDEX IF NOT EXISTS idx_admin_usulan_pengurus_status ON admin_usulan_pengurus(status);

DROP TRIGGER IF EXISTS trg_admin_usulan_pengurus_updated ON admin_usulan_pengurus;
CREATE TRIGGER trg_admin_usulan_pengurus_updated BEFORE UPDATE ON admin_usulan_pengurus
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- ── RLS: SKPD kelola usulan subtree-nya; admin/pengawas lihat semua ──────────
-- fn_is_admin()/fn_is_viewer() konstan → InitPlan (SELECT ...). fn_skpd_visible
-- per-baris (subtree). Update/Delete oleh SKPD hanya selama BELUM disetujui;
-- transisi ke 'disetujui' ditangani RPC SECURITY DEFINER (bypass RLS).
ALTER TABLE admin_usulan_pengurus ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_usulan_pengurus_select" ON admin_usulan_pengurus;
CREATE POLICY "admin_usulan_pengurus_select" ON admin_usulan_pengurus FOR SELECT TO authenticated
  USING ((SELECT fn_is_admin()) OR (SELECT fn_is_viewer()) OR fn_skpd_visible(skpd_id));

DROP POLICY IF EXISTS "admin_usulan_pengurus_insert" ON admin_usulan_pengurus;
CREATE POLICY "admin_usulan_pengurus_insert" ON admin_usulan_pengurus FOR INSERT TO authenticated
  WITH CHECK ((SELECT fn_is_admin()) OR fn_skpd_visible(skpd_id));

DROP POLICY IF EXISTS "admin_usulan_pengurus_update" ON admin_usulan_pengurus;
CREATE POLICY "admin_usulan_pengurus_update" ON admin_usulan_pengurus FOR UPDATE TO authenticated
  USING ((SELECT fn_is_admin()) OR (fn_skpd_visible(skpd_id) AND status <> 'disetujui'))
  WITH CHECK ((SELECT fn_is_admin()) OR (fn_skpd_visible(skpd_id) AND status <> 'disetujui'));

DROP POLICY IF EXISTS "admin_usulan_pengurus_delete" ON admin_usulan_pengurus;
CREATE POLICY "admin_usulan_pengurus_delete" ON admin_usulan_pengurus FOR DELETE TO authenticated
  USING ((SELECT fn_is_admin()) OR (fn_skpd_visible(skpd_id) AND status IN ('draft','dikembalikan')));

-- ── RPC: admin setujui 1 usulan → materialize ke admin_pegawai (atomik) ──────
-- Upsert by NIP (kalau pegawai sudah ada, update role/skpd/atributnya). Set
-- usulan → disetujui + pegawai_id. Admin-only.
CREATE OR REPLACE FUNCTION fn_setujui_usulan_pengurus(p_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_u    admin_usulan_pengurus%ROWTYPE;
  v_peg  uuid;
BEGIN
  IF NOT fn_is_admin() THEN
    RAISE EXCEPTION 'Hanya admin yang boleh menyetujui usulan.';
  END IF;

  SELECT * INTO v_u FROM admin_usulan_pengurus WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Usulan tidak ditemukan.'; END IF;
  IF v_u.status <> 'diajukan' THEN
    RAISE EXCEPTION 'Hanya usulan berstatus "diajukan" yang bisa disetujui (status sekarang: %).', v_u.status;
  END IF;

  INSERT INTO admin_pegawai (nip, nama, pangkat, golongan, jabatan, jenis_kelamin, role_bmd, skpd_id)
  VALUES (v_u.nip, v_u.nama, v_u.pangkat, v_u.golongan, v_u.jabatan, v_u.jenis_kelamin, 'pengurus_barang', v_u.skpd_id)
  ON CONFLICT (nip) DO UPDATE SET
    nama = EXCLUDED.nama, pangkat = EXCLUDED.pangkat, golongan = EXCLUDED.golongan,
    jabatan = EXCLUDED.jabatan, jenis_kelamin = EXCLUDED.jenis_kelamin,
    role_bmd = 'pengurus_barang', skpd_id = EXCLUDED.skpd_id, updated_at = now()
  RETURNING id INTO v_peg;

  UPDATE admin_usulan_pengurus
  SET status = 'disetujui', pegawai_id = v_peg, disetujui_at = now(), catatan_admin = NULL
  WHERE id = p_id;

  RETURN v_peg;
END $$;

REVOKE ALL ON FUNCTION fn_setujui_usulan_pengurus(uuid) FROM public;
GRANT EXECUTE ON FUNCTION fn_setujui_usulan_pengurus(uuid) TO authenticated;
