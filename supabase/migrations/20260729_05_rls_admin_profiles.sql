-- ============================================================================
-- KEAMANAN — pasang RLS di `admin_profiles` & kembalikan tombol Admin→User.
--
-- LATAR (temuan Supabase Advisors, 2026-07-29 — dua isu CRITICAL):
--   Tabel ini punya policy RLS tapi **RLS-nya tidak pernah di-ENABLE**, dan
--   `anon` MAUPUN `authenticated` memegang GRANT penuh (SELECT/INSERT/UPDATE/
--   DELETE/TRUNCATE). Kunci `anon` tertanam di bundel JavaScript browser — jadi
--   siapa pun di internet bisa membaca seluruh profil, meng-UPDATE `role`
--   dirinya menjadi 'admin' (menguasai approval/penghapusan/tutup tahun
--   se-kabupaten), atau TRUNCATE tabelnya. `admin_profiles.role` adalah fondasi
--   seluruh wewenang: `fn_is_admin()`/`fn_is_viewer()` membacanya, dan hampir
--   semua policy RLS tabel lain memanggil fungsi itu.
--
-- SUDAH DITAMBAL SEMENTARA 2026-07-29 lewat psql (REVOKE semua tulis dari
--   anon+authenticated, REVOKE SELECT dari anon). Migrasi ini menggantikan
--   tambalan itu dengan penjagaan yang benar, dan mengembalikan fungsi yang
--   ikut mati karena tambalan tadi.
--
-- AMAN DARI REKURSI: `fn_is_admin()` SECURITY DEFINER (migrasi 20260710_04),
--   jadi ia membaca admin_profiles TANPA lewat RLS. Kalau suatu saat ada yang
--   mengubahnya jadi fungsi biasa, policy di bawah akan memanggil dirinya
--   sendiri tanpa henti dan SELURUH aplikasi mati. Jangan disentuh.
-- ============================================================================

ALTER TABLE public.admin_profiles ENABLE ROW LEVEL SECURITY;

-- Bersihkan policy lama apa pun namanya (yang tercatat Advisor: "Admins can
-- update profiles", "Admins can view all profiles", "Service role can insert
-- profiles", "Users can view own profile"). Dilakukan lewat loop supaya tidak
-- ada yang tertinggal kalau ternyata ada policy lain yang tak terdaftar.
DO $$
DECLARE p record;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies
           WHERE schemaname = 'public' AND tablename = 'admin_profiles'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.admin_profiles', p.policyname);
  END LOOP;
END $$;

-- ── BACA: seluruh pengguna yang SUDAH LOGIN boleh membaca semua baris ───────
-- SENGAJA seluas ini, bukan "hanya profil sendiri". Dua fitur menariknya untuk
-- SEMUA peran, bukan cuma admin:
--   * components/ChatWidget.tsx — menarik seluruh profil untuk memetakan
--     id→nama pengirim. Tanpa ini nama di chat hilang untuk semua orang.
--   * app/dashboard/admin/pegawai/page.tsx — guard "pegawai ini punya akun
--     login" menghitung profil ber-`pegawai_id` tertentu (baris milik ORANG
--     LAIN).
-- Isinya = direktori pegawai internal satu pemda (email, SKPD, peran). Ini juga
-- TIDAK menambah keterbukaan dibanding keadaan sekarang: `authenticated` memang
-- sudah bisa membaca semuanya. Yang berubah dari migrasi ini adalah sisi TULIS.
-- `anon` tetap tak punya GRANT sama sekali → tak ada policy pun tak bisa masuk.
--
-- Kalau nanti mau lebih ketat, jalannya BUKAN mempersempit policy ini (itu
-- mematikan chat), tapi bikin VIEW berkolom aman lalu ubah dua pemanggil di atas.
CREATE POLICY "profil_select" ON public.admin_profiles
  FOR SELECT TO authenticated USING (true);

-- ── TULIS: admin pemda saja ────────────────────────────────────────────────
-- Ini gerbang yang menggantikan REVOKE semalam. Dengan RLS aktif, GRANT UPDATE
-- boleh dikembalikan (lihat bawah) karena policy inilah yang menyaring — bukan
-- lagi ada/tidaknya GRANT. Tanpa policy ini, siapa pun yang login bisa menyetel
-- `role` dirinya sendiri menjadi 'admin'.
-- fn_is_admin() dibungkus InitPlan (SELECT …) supaya dievaluasi SEKALI, bukan
-- per baris — aturan wajib di repo ini (CLAUDE.md).
CREATE POLICY "profil_update_admin" ON public.admin_profiles
  FOR UPDATE TO authenticated
  USING ((SELECT fn_is_admin()))
  WITH CHECK ((SELECT fn_is_admin()));

-- INSERT & DELETE SENGAJA TANPA POLICY untuk `authenticated` → tertutup rapat.
-- Keduanya memang hanya dilakukan dari API route ber-service-role
-- (app/api/admin/create-user, app/api/admin/delete-user), dan `service_role`
-- melewati RLS sepenuhnya sehingga tak butuh policy.

-- ── GRANT ──────────────────────────────────────────────────────────────────
-- Kembalikan SELECT + UPDATE untuk `authenticated` — sekarang aman karena
-- disaring policy di atas. Ini yang menghidupkan lagi tombol ganti role/SKPD di
-- app/dashboard/admin/user/page.tsx yang mati sejak tambalan semalam.
GRANT SELECT, UPDATE ON public.admin_profiles TO authenticated;

-- `anon` TIDAK diberi apa pun. Ini pagar terluar: kunci anon itu publik (ada di
-- bundel JS), jadi tabel ini tak boleh tersentuh tanpa login — apa pun policynya.
REVOKE ALL ON public.admin_profiles FROM anon;

-- INSERT/DELETE/TRUNCATE tetap dicabut dari `authenticated`: policy sudah
-- menutupnya, tapi mencabut GRANT membuatnya tertutup DUA LAPIS — kalau suatu
-- saat ada yang tak sengaja menambah policy permisif, GRANT-nya tetap menahan.
REVOKE INSERT, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.admin_profiles FROM authenticated;

-- ── Verifikasi (jalankan manual sesudah migrasi) ───────────────────────────
--   -- Harus: rls_aktif = t, dan 2 policy (profil_select, profil_update_admin)
--   SELECT relrowsecurity AS rls_aktif FROM pg_class WHERE oid = 'public.admin_profiles'::regclass;
--   SELECT policyname, cmd FROM pg_policies WHERE tablename = 'admin_profiles';
--   -- Harus: anon TIDAK muncul; authenticated hanya SELECT, UPDATE
--   SELECT grantee, string_agg(privilege_type, ', ' ORDER BY privilege_type) AS izin
--   FROM information_schema.role_table_grants
--   WHERE table_schema='public' AND table_name='admin_profiles'
--     AND grantee IN ('anon','authenticated') GROUP BY grantee;
