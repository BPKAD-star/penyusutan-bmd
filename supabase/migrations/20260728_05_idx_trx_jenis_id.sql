-- ============================================================================
-- INDEX (jenis, id) & (periode, jenis, id) di transaksi_bmd — kolektor laporan
-- timeout, dan dulu KEGAGALANNYA DITELAN sehingga angka laporan salah senyap
-- (2026-07-28).
--
-- GEJALA yang menuntun ke sini: Rekonsiliasi BMD 1.3.2 Intra menampilkan
-- 1.412.700.000, padahal Pengadaan & LRA 1.405.950.000. Selisih 6.750.000 =
-- kontrak yang pernah disetujui lalu dibuka kunci; 3 asetnya sudah punya
-- `batal_pengadaan` tapi tetap terhitung sebagai perolehan sah.
--
-- SEBAB: `fetchVoidedAsetIds`/`fetchBatalTargets` (lib/voidedAset.ts) menyaring
-- `transaksi_bmd` per `jenis`. Query-nya tembus statement timeout 8 dtk, lalu
-- `const { data } = await ...` menelan errornya → set void KOSONG → artinya
-- "tidak ada yang dibatalkan", kebalikan dari kenyataan. Tak ada satu pun
-- halaman yang error; angkanya saja yang diam-diam salah di Rekonsiliasi,
-- Laporan BMD Model 3, dan Laporan Pengadaan sekaligus. Sudah diperbaiki di
-- sisi kode (kolektornya kini MELEMPAR & laporan menolak tampil) — pesan
-- aslinya muncul: "gagal membaca transaksi pembatalan (batal_kapitalisasi):
-- canceling statement due to statement timeout".
--
-- KENAPA TIMEOUT padahal `jenis` SUDAH ada indexnya (idx_trx_jenis,
-- idx_trx_jenis_aset, idx_trx_jenis_tanggal): kolektornya memakai
-- `ORDER BY id` + `LIMIT 1000` (paginasi .range()). Tak satu pun index itu
-- memuat `id`, jadi planner memilih menyusuri index PRIMARY KEY urut id sambil
-- menyaring `jenis` — dan karena baris yang cocok cuma ratusan dari ~259rb,
-- ia harus menyusuri nyaris seluruh tabel sebelum mengumpulkan 1.000 baris.
-- Index (jenis, id) menyelesaikan filter DAN urutan sekaligus: tak ada sort,
-- tak ada penyusuran PK.
--
-- ⚠️ `ORDER BY id`-nya JANGAN dihapus sebagai "solusi". Paginasi OFFSET tanpa
-- ORDER BY tidak dijamin stabil antar-halaman oleh Postgres — begitu hasilnya
-- lewat 1.000 baris, ada yang terlewat DIAM-DIAM, dan yang terlewat itu justru
-- aset void yang lolos ke laporan. Obatnya index, bukan mencabut urutannya.
--
-- idx_trx_jenis (jenis) DI-DROP: sudah redundan sejak ada idx_trx_jenis_aset
-- (jenis, aset_id) & idx_trx_jenis_tanggal (jenis, tanggal) — kolom pertamanya
-- sama — dan kini juga tercakup (jenis, id). Melepasnya menghemat ruang & biaya
-- tulis; penting karena project ini sedang di atas batas free tier.
--
-- PLAIN, bukan CONCURRENTLY (SQL Editor membungkus skrip jadi satu transaksi —
-- lihat 20260718_06). Lock tulis transaksi_bmd beberapa detik, sekali jalan.
-- ============================================================================

-- 1. Melayani: collectAsetIds & fetchBatalTargets (jenis IN (...) ORDER BY id),
--    fetchNetRemoved, dan semua kolektor sejenis berikutnya.
CREATE INDEX IF NOT EXISTS idx_trx_jenis_id ON transaksi_bmd (jenis, id);

-- 2. Melayani: fetchLed (lib/rekon.ts) — periode = X AND jenis IN (...) ORDER BY id.
--    Dipanggil 6x tiap kali Rekonsiliasi diproses.
CREATE INDEX IF NOT EXISTS idx_trx_periode_jenis_id ON transaksi_bmd (periode, jenis, id);

-- 3. Buang yang sudah redundan (kolom pertamanya tercakup index lain).
DROP INDEX IF EXISTS idx_trx_jenis;

ANALYZE transaksi_bmd;

-- Verifikasi (jalankan terpisah; harus Index Scan, milidetik, bukan Seq Scan
-- maupun penyusuran transaksi_bmd_pkey):
--   EXPLAIN ANALYZE SELECT payload FROM transaksi_bmd
--     WHERE jenis = 'batal_kapitalisasi' ORDER BY id LIMIT 1000;
--   EXPLAIN ANALYZE SELECT aset_id FROM transaksi_bmd
--     WHERE jenis IN ('batal_pengadaan','koreksi_pencatatan_ganda') ORDER BY id LIMIT 1000;
