-- Dokumen Sumber — siklus baru "SK Pengelolaan BMD" (permintaan user
-- 2026-09-05): wadah generik utk SK yang tak masuk siklus spesifik mana pun
-- (mis. SK Pengurus Barang) — admin upload, semua orang lihat/unduh. Pola
-- persis sama dgn siklus generic lain (migrasi 20260710_01): scope 'global',
-- gate upload `fn_is_admin()` saja (bukan per-SKPD).
--
-- Sekaligus mengaktifkan 'penilaian' yang SUDAH ADA di CHECK constraint sejak
-- migrasi 20260710_01 tapi belum pernah dipakai — `lib/dokumenSiklus.ts`
-- masih menandainya placeholder ("modul ini menyusul"). Tak perlu diubah di
-- sini; kolomnya sudah sah.
--
-- ⚠️ Nama constraint TETAP `dokumen_siklus_siklus_check` — `ALTER TABLE
-- ... RENAME TO` (migrasi 20260710_02) memindahkan tabel `dokumen_siklus` ->
-- `admin_dokumen` tapi TIDAK mengganti nama constraint yang sudah ada (itu
-- perilaku baku Postgres, bukan kelalaian migrasi itu). DROP dua nama
-- sekaligus (IF EXISTS) supaya migrasi ini tetap aman dijalankan ulang atau
-- di lingkungan yang kebetulan sudah pernah di-rename manual.

ALTER TABLE admin_dokumen DROP CONSTRAINT IF EXISTS dokumen_siklus_siklus_check;
ALTER TABLE admin_dokumen DROP CONSTRAINT IF EXISTS admin_dokumen_siklus_check;

ALTER TABLE admin_dokumen ADD CONSTRAINT admin_dokumen_siklus_check CHECK (siklus IN (
  'perencanaan_kebutuhan', 'penggunaan_sk_penetapan', 'pemanfaatan',
  'penilaian', 'pengamanan', 'penatausahaan', 'pemindahtanganan',
  'pemusnahan', 'pengawasan_pengendalian',
  'sk_pengelolaan_bmd'
));
