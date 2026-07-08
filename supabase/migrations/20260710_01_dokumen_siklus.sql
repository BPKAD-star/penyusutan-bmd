-- Dokumen Sumber: tabel generik utk siklus BMD yang BELUM punya modul/tempat
-- penyimpanan sendiri (SK RKBMD, SK Penetapan Status Penggunaan, Dokumen
-- Perjanjian Pemanfaatan, BAST+Pakta Integritas Pengamanan, Pemindahtanganan).
-- Siklus yang SUDAH py penyimpanan (Pengadaan/BAST, Pengalihan Status/BA,
-- Penghapusan/SK) DIBACA LANGSUNG dari jurnal_header.payload.dokumen_paths di
-- halaman ini — TIDAK disalin ke tabel ini (hindari duplikasi sumber data).
--
-- Role 3 tingkat diturunkan dari struktur SKPD yang sudah ada (skpd.parent_id),
-- tanpa kolom role baru:
--   - Super Admin (BKAD)          = fn_is_admin() → upload semua siklus.
--   - Admin (SKPD induk py sub-OPD) = fn_skpd_admin_induk() → HANYA siklus
--     'pengamanan', terbatas subtree sendiri (fn_skpd_visible).
--   - Non-admin (SKPD tanpa sub-OPD / sub-OPD)              → lihat/unduh saja.
-- Pemanfaatan & Pemindahtanganan sengaja GLOBAL (skpd_id NULL, super admin only)
-- per keputusan user — bukan per-SKPD.

CREATE TABLE IF NOT EXISTS dokumen_siklus (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tahun        int NOT NULL,
  siklus       text NOT NULL CHECK (siklus IN (
                 'perencanaan_kebutuhan', 'penggunaan_sk_penetapan', 'pemanfaatan',
                 'penilaian', 'pengamanan', 'penatausahaan', 'pemindahtanganan',
                 'pemusnahan', 'pengawasan_pengendalian'
               )),
  sub_jenis    text,        -- khusus siklus 'pemindahtanganan': hibah|penjualan|tukar_menukar|penyertaan_modal
  skpd_id      bigint REFERENCES skpd(id),  -- NULL = dokumen global/kabupaten
  judul        text NOT NULL,
  keterangan   text,
  file_path    text NOT NULL,   -- path di bucket storage dokumen-sumber
  uploaded_by  uuid REFERENCES auth.users(id) DEFAULT auth.uid(),
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dokumen_siklus_tahun_siklus ON dokumen_siklus (tahun, siklus);

-- Apakah user login berbasis di SKPD INDUK (parent_id NULL) yang punya minimal
-- satu sub-OPD di bawahnya. Dipakai HANYA utk gate upload siklus 'pengamanan'.
CREATE OR REPLACE FUNCTION fn_skpd_admin_induk() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles p
    JOIN skpd s ON s.id = p.skpd_id
    WHERE p.id = auth.uid() AND s.parent_id IS NULL
      AND EXISTS (SELECT 1 FROM skpd c WHERE c.parent_id = s.id)
  )
$$;

ALTER TABLE dokumen_siklus ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ds_select" ON dokumen_siklus;
CREATE POLICY "ds_select" ON dokumen_siklus FOR SELECT TO authenticated
  USING (fn_is_admin() OR skpd_id IS NULL OR fn_skpd_visible(skpd_id));

DROP POLICY IF EXISTS "ds_insert" ON dokumen_siklus;
CREATE POLICY "ds_insert" ON dokumen_siklus FOR INSERT TO authenticated
  WITH CHECK (
    fn_is_admin()
    OR (siklus = 'pengamanan' AND fn_skpd_admin_induk() AND fn_skpd_visible(skpd_id))
  );

DROP POLICY IF EXISTS "ds_delete" ON dokumen_siklus;
CREATE POLICY "ds_delete" ON dokumen_siklus FOR DELETE TO authenticated
  USING (
    fn_is_admin()
    OR (siklus = 'pengamanan' AND fn_skpd_admin_induk() AND fn_skpd_visible(skpd_id))
  );
-- Tidak ada policy UPDATE: salah upload = hapus + upload ulang (konsisten pola
-- append-ish di modul lain, hindari state "sudah diedit tapi file lama nyantol").
