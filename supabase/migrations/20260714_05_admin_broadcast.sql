-- ============================================================================
-- Broadcast / Pengumuman dari Pengelola Barang (admin pemda) ke pengurus barang.
--
-- Master data murni — TIDAK menyentuh ledger/aset/engine. Tabel daftar
-- pengumuman (bukan satu baris konfigurasi) supaya pengumuman lama tersimpan
-- sbg riwayat & bisa dipakai ulang; tiap baris punya toggle `aktif`. Popup di
-- DashboardChrome menampilkan yang `aktif` ke role pengurus_barang &
-- pengurus_pembantu (audiens disaring di klien via admin_profiles.role — bukan
-- rahasia, jadi SELECT dibuka utk semua authenticated).
--
-- Pola sama persis dgn master data lain (admin_pegawai dll): tulis = admin,
-- baca = authenticated. Jalankan di Supabase SQL Editor SETELAH
-- 20260714_04_role_pengawas_view_only.sql.
-- ============================================================================

CREATE TABLE IF NOT EXISTS admin_broadcast (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  judul       text NOT NULL,
  isi         text NOT NULL,
  aktif       boolean NOT NULL DEFAULT false,
  dibuat_oleh uuid REFERENCES auth.users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Popup mendeteksi "pengumuman baru / diedit" dari updated_at (klien simpan
-- signature id:updated_at yg sudah ditutup di localStorage). fn_set_updated_at
-- sudah ada sejak migrasi core.
DROP TRIGGER IF EXISTS trg_admin_broadcast_updated_at ON admin_broadcast;
CREATE TRIGGER trg_admin_broadcast_updated_at BEFORE UPDATE ON admin_broadcast
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

ALTER TABLE admin_broadcast ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "broadcast_select" ON admin_broadcast;
CREATE POLICY "broadcast_select" ON admin_broadcast
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "broadcast_insert" ON admin_broadcast;
CREATE POLICY "broadcast_insert" ON admin_broadcast
  FOR INSERT TO authenticated WITH CHECK (fn_is_admin());

DROP POLICY IF EXISTS "broadcast_update" ON admin_broadcast;
CREATE POLICY "broadcast_update" ON admin_broadcast
  FOR UPDATE TO authenticated USING (fn_is_admin());

DROP POLICY IF EXISTS "broadcast_delete" ON admin_broadcast;
CREATE POLICY "broadcast_delete" ON admin_broadcast
  FOR DELETE TO authenticated USING (fn_is_admin());
