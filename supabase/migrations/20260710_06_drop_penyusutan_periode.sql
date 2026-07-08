-- Drop tabel warisan penyusutan_periode (13.036 baris) — struktur generasi
-- lama sebelum app di-upscale dari "cuma penyusutan" jadi full pengelolaan
-- BMD (dikonfirmasi user 2026-07-10). Sudah digantikan penyusutan_semester
-- (ber-FK aset_id, support metode amortisasi) sejak migrasi
-- 20260702_01_bmd_core.sql. Tidak ada kode aplikasi yang membaca tabel ini
-- (sudah dicek: nol referensi di app/components/lib), dan dikonfirmasi tidak
-- ada sistem/tools lain di luar app ini yang memakainya.
DROP TABLE IF EXISTS penyusutan_periode;
