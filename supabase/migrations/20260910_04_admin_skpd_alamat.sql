-- Kolom alamat per SKPD/Sub-OPD/Sub-sub-OPD (permintaan user 2026-09-10).
--
-- KIBAR bagian "I.4 Alamat" selama ini selalu "-" (lihat komentar kepala
-- app/kibar/[nibar]/page.tsx: "kolom alamat SKPD belum ada"). Ditambahkan di
-- SATU kolom pada admin_skpd, bukan tabel terpisah per level — tiap
-- OPD/Sub-OPD/Sub-sub-OPD di tabel ini memang sudah masing-masing baris
-- sendiri (hierarki lewat parent_id/path), jadi satu kolom nullable cukup
-- untuk semua level tanpa penanganan khusus.
--
-- Nullable & tanpa default: SELURUH 816 baris yang sudah ada belum tahu
-- alamatnya, dan mengarang string kosong ('') tak bisa dibedakan dari "sudah
-- diisi tapi memang kosong". Diisi belakangan lewat menu Admin > SKPD.
--
-- Tak perlu GRANT/RLS tambahan — diverifikasi ke DB: GRANT UPDATE pada
-- admin_skpd ada di level TABEL (bukan per-kolom), dan policy skpd_update
-- (qual fn_is_admin()) row-level, bukan pembatas kolom. Kolom baru otomatis
-- ikut tercakup begitu ditambahkan.

ALTER TABLE admin_skpd ADD COLUMN IF NOT EXISTS alamat text;

COMMENT ON COLUMN admin_skpd.alamat IS
  'Alamat unit (OPD/Sub-OPD/Sub-sub-OPD). Diisi manual lewat Admin > SKPD. '
  'Dipakai KIBAR (I.4 Alamat) — jatuh ke induk terdekat yang sudah berisi '
  'kalau unit itu sendiri belum diisi.';
