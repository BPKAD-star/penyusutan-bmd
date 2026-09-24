-- ============================================================================
-- `admin_profiles_role_check` TAK PERNAH memuat 'pengawas' — role itu MUSTAHIL
-- disimpan sejak dibuat (2026-09-24, dilaporkan user: "kok mau gua edit as an
-- akuntansi/auditor gabisa ya").
--
-- KRONOLOGI: migrasi 20260713_04 membuat CHECK
--   `role IN ('admin', 'pengurus_barang', 'pengurus_pembantu')`.
-- Sehari kemudian, 20260714_04_role_pengawas_view_only.sql menambahkan role
-- KEEMPAT — 'pengawas' (view-only lintas SKPD, akuntansi/auditor/inspektorat) —
-- lengkap dengan fn_is_viewer(), fn_skpd_visible() yg menguncinya ke `false`,
-- & policy SELECT permissive di 12 tabel. Migrasi itu **TIDAK PERNAH melebarkan
-- CHECK constraint-nya**, jadi seluruh mekanisme otorisasi 'pengawas' sudah
-- lengkap di DB & di kode (`lib/roles.ts` ROLE_LABEL/ROLE_VALUES memuatnya,
-- `app/dashboard/admin/user/page.tsx` menawarkannya di dropdown Role) — TAPI
-- baris `admin_profiles` tak pernah bisa benar-benar diset ke nilai itu.
--
-- GEJALANYA SENYAP TOTAL, dan itu bug KEDUA yang ditutup di commit yang sama:
-- `handleChangeRole` (app/dashboard/admin/user/page.tsx) menulis
-- `await supabase.from('admin_profiles').update({role}).eq('id',id)` TANPA
-- membaca `error` sama sekali. UPDATE ditolak Postgres dgn `23514` (check
-- violation), tapi errornya dibuang; `loadProfiles()` yg dipanggil sesudahnya
-- menampilkan lagi role LAMA, dan operator cuma melihat dropdown "kembali
-- sendiri" tanpa satu pun pesan — persis pola "const { data } = await tanpa
-- error" yg berkali-kali dicatat di CLAUDE.md sbg sumber kegagalan senyap
-- paling mahal di repo ini.
--
-- DIVERIFIKASI ke produksi SEBELUM migrasi ini: `admin_profiles_role_check`
-- hidup persis `CHECK (role = ANY (ARRAY['admin','pengurus_barang',
-- 'pengurus_pembantu']))` — 'pengawas' benar2 tak pernah masuk. Distribusi
-- role saat ini: admin=13, pengurus_barang=59, pengurus_pembantu=0,
-- pengawas=0 (nol baris berdampak, murni melebarkan constraint).
-- ============================================================================

ALTER TABLE admin_profiles DROP CONSTRAINT admin_profiles_role_check;
ALTER TABLE admin_profiles ADD CONSTRAINT admin_profiles_role_check
  CHECK (role IN ('admin', 'pengurus_barang', 'pengurus_pembantu', 'pengawas'));
