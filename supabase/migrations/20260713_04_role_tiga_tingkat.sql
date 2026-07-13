-- ============================================================================
-- Role 3 tingkat (2026-07-13, keputusan user):
--   1. 'admin'             = Pengelola Barang (admin pemda / BKAD, super admin)
--   2. 'pengurus_barang'   = Pengurus Barang (admin SKPD, di node SKPD induk)
--   3. 'pengurus_pembantu' = Pengurus Barang Pembantu (operator sub-OPD)
--
-- Nilai 'admin' SENGAJA TIDAK di-rename (mis. jadi 'pengelola_barang'):
-- fn_is_admin() + ~12 titik cek `role === 'admin'` di frontend + RLS policy
-- admin_profiles semuanya bergantung ke literal 'admin' — rename = wajib
-- ganti semua serempak dgn jendela outage (pola migrasi 20260710_04 yang
-- sengaja dihindari kalau tidak perlu). Label tampilan "Pengelola Barang"
-- cukup di UI (lib/roles.ts ROLE_LABEL).
--
-- Kewenangan (satu-satunya beda fungsional tingkat 2 vs 3, keputusan user):
--   pengurus_barang boleh MENGUBAH STATUS APPROVAL (setujui/buka kunci/arsip)
--   jurnal Cara Perolehan milik sub-OPD STRICT DI BAWAH node SKPD-nya.
--   Jurnal milik SKPD-nya SENDIRI (node yang sama) tetap HANYA admin pemda.
--   Selain itu tingkat 2 & 3 identik — cakupan data tetap dari subtree ltree
--   (fn_skpd_visible) seperti sebelumnya, tidak berubah.
--   Run engine tetap admin-only (app/api/engine/run — sudah begitu, tak diubah).
--
-- Migrasi data 'user' lama → dipetakan dari POSISI node SKPD user:
--   di node induk (parent_id IS NULL) → pengurus_barang; selain itu (sub-OPD /
--   belum punya SKPD) → pengurus_pembantu. Kalau ada yang meleset, admin
--   tinggal betulkan per user lewat halaman Admin → User.
--
-- ⚠️ DEPLOY: jalankan migrasi ini lalu LANGSUNG deploy frontend yang memuat
-- lib/roles.ts + halaman user 3-opsi. Jendela antara: UI lama masih menawarkan
-- role 'user' di dropdown (bakal ditolak CHECK — error jelas, tidak korup)
-- dan tombol Setujui masih admin-only (lebih ketat dari guard baru — aman).
-- ============================================================================

-- ── 1. Lebarkan role: drop CHECK lama (nama bisa 'profiles_role_check'
--       warisan sebelum rename tabel) → migrasi data → CHECK baru ────────────
DO $$
DECLARE cname text;
BEGIN
  SELECT conname INTO cname
  FROM pg_constraint
  WHERE conrelid = 'admin_profiles'::regclass AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%role%'
    AND pg_get_constraintdef(oid) NOT ILIKE '%ipa_role%';
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE admin_profiles DROP CONSTRAINT %I', cname);
  END IF;
END $$;

UPDATE admin_profiles p
SET role = CASE
  WHEN EXISTS (SELECT 1 FROM admin_skpd s WHERE s.id = p.skpd_id AND s.parent_id IS NULL)
    THEN 'pengurus_barang'
  ELSE 'pengurus_pembantu'
END
WHERE p.role = 'user';

ALTER TABLE admin_profiles ADD CONSTRAINT admin_profiles_role_check
  CHECK (role IN ('admin', 'pengurus_barang', 'pengurus_pembantu'));
ALTER TABLE admin_profiles ALTER COLUMN role SET DEFAULT 'pengurus_pembantu';

-- ── 2. Helper: user login = pengurus_barang yang MEMBAWAHI skpd ini? ─────────
-- Strict di bawah (s.id <> my.id): jurnal milik node SKPD-nya sendiri TIDAK
-- termasuk — itu tetap wewenang admin pemda.
CREATE OR REPLACE FUNCTION fn_is_pengurus_barang_atas(p_skpd_id bigint) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM admin_profiles p
    JOIN admin_skpd my ON my.id = p.skpd_id
    JOIN admin_skpd s  ON s.id = p_skpd_id
    WHERE p.id = auth.uid()
      AND p.role = 'pengurus_barang'
      AND s.path <@ my.path
      AND s.id <> my.id
  )
$$;

-- ── 3. Approval guard: tambah klausa pengurus_barang utk Cara Perolehan ─────
-- Body = versi TERBARU (migrasi 20260707_03, dgn pengecualian SKPD tujuan
-- utk pengalihan_status/mutasi_internal — DIPERTAHANKAN persis) + satu klausa
-- baru. Kategori whitelist = kelima menu Cara Perolehan + konstruksi SAJA;
-- kategori lain (penghapusan/kapitalisasi/koreksi/dll) tidak pakai alur
-- pending, dan kalaupun suatu saat pakai, defaultnya tetap admin-only.
CREATE OR REPLACE FUNCTION fn_jurnal_header_approval_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.approval_status IS DISTINCT FROM OLD.approval_status
     AND NOT fn_is_admin()
     AND NOT (OLD.kategori IN ('pengalihan_status', 'mutasi_internal') AND fn_skpd_visible(OLD.skpd_tujuan))
     AND NOT (OLD.kategori IN ('pengadaan', 'hibah_masuk', 'tukar_menukar', 'hasil_inventarisasi', 'perolehan_lainnya', 'konstruksi')
              AND fn_is_pengurus_barang_atas(OLD.skpd_id)) THEN
    RAISE EXCEPTION 'Hanya admin, Pengurus Barang atasan sub-OPD ini (Cara Perolehan), atau SKPD tujuan (mutasi/pengalihan) yang boleh mengubah status persetujuan.';
  END IF;
  RETURN NEW;
END $$;

-- Verifikasi:
--   SELECT role, count(*) FROM admin_profiles GROUP BY role;
--     -- tidak boleh ada 'user' lagi; cek pemetaan pengurus_barang vs pembantu masuk akal
--   SELECT p.email, p.role, s.nama, s.parent_id
--     FROM admin_profiles p LEFT JOIN admin_skpd s ON s.id = p.skpd_id
--     ORDER BY p.role, s.nama;
--     -- tinjau manual: user di node induk = pengurus_barang, sub-OPD = pembantu
