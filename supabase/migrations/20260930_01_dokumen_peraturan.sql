-- Dokumen Sumber — wadah PERATURAN BMD (permintaan user 2026-09-30).
--
-- Halaman Dokumen Sumber kini tiga bagian: Peraturan · Siklus · Materi.
-- Bagian Peraturan berisi empat kotak — Perpres, Permendagri, Perda, Perbup —
-- dan berkasnya disimpan di tabel yang SUDAH ADA (`admin_dokumen`), bukan tabel
-- baru: bentuknya sama persis dgn dokumen generik lain (judul + keterangan +
-- satu berkas PDF, scope global, unggah admin saja, semua orang boleh lihat).
-- Yang dibutuhkan cuma empat nilai baru di CHECK constraint `siklus`.
--
-- ⚠️ Kolom `tahun` untuk baris peraturan = TAHUN PERATURANNYA (mis. 2021 untuk
-- Permendagri 47/2021), BUKAN tahun buku. Peraturan tidak ikut pemilih tahun di
-- halaman itu — ia berlaku lintas tahun — jadi halamannya menampilkan SEMUA
-- baris jenis itu, diurut tahun peraturan terbaru dulu. `tahun` tak ber-FK ke
-- `tahun_buku`, jadi tahun lampau (2014, 2016, …) sah.
--
-- RLS TIDAK diubah: `ds_select` sudah meloloskan `skpd_id IS NULL` untuk semua
-- pengguna login, `ds_insert`/`ds_delete` sudah `fn_is_admin()`.
--
-- ⚠️ Daftar nilai di bawah KEMBAR dgn `dbSiklus` di lib/dokumenSiklus.ts
-- (`DAFTAR_SIKLUS` yang bertipe generic + `DAFTAR_PERATURAN`) — dikunci
-- lib/dokumenSiklus.test.ts, yang membaca berkas migrasi TERAKHIR yang memuat
-- `admin_dokumen_siklus_check`. Menambah wadah generik baru = migrasi baru yang
-- menulis ulang SELURUH daftar ini.
--
-- DEPLOY-ORDERING: jalankan SEBELUM deploy kode. Kalau terbalik, halaman tetap
-- terbuka & kotak Peraturan tampil kosong, tapi tombol Simpan-nya ditolak
-- Postgres (23514 check violation) — pesannya tampil, tak ada yang tertulis.

ALTER TABLE admin_dokumen DROP CONSTRAINT IF EXISTS dokumen_siklus_siklus_check;
ALTER TABLE admin_dokumen DROP CONSTRAINT IF EXISTS admin_dokumen_siklus_check;

ALTER TABLE admin_dokumen ADD CONSTRAINT admin_dokumen_siklus_check CHECK (siklus IN (
  'perencanaan_kebutuhan', 'penggunaan_sk_penetapan', 'pemanfaatan',
  'penilaian', 'pengamanan', 'penatausahaan', 'pemindahtanganan',
  'pemusnahan', 'pengawasan_pengendalian',
  'sk_pengelolaan_bmd',
  'peraturan_perpres', 'peraturan_permendagri', 'peraturan_perda', 'peraturan_perbup'
));
