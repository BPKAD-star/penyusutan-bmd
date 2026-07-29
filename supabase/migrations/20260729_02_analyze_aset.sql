-- ============================================================================
-- ANALYZE aset — statistik planner basi sesudah import ATL Diknas (2026-07-29).
--
-- Kenapa ini perlu: perbaikan 20260728_05 & 20260729_01 sama-sama menutup dgn
-- `ANALYZE transaksi_bmd`, tapi TAK SATU PUN meng-ANALYZE `aset` — padahal
-- 20260720_02 memasukkan 149.846 baris ATL ke tabel itu (aset kini 418.144
-- baris). Kalau autovacuum belum sempat mengejar, planner masih memakai
-- statistik dari sebelum import.
--
-- Kenapa itu berbahaya khusus di Daftar Barang: query-nya
--   WHERE skpd_id IN (...) AND kode LIKE '<gol>.%' AND status <> 'draft'
--   ORDER BY nilai_perolehan DESC LIMIT 1000
-- Tak ada index utk `nilai_perolehan`, dan `kode LIKE` TAK PERNAH jadi
-- index-cond di bawah RLS. Jadi pilihan planner bergantung MURNI pada tebakan
-- selektivitas: kalau ia mengira filternya longgar, ia akan pilih menyusuri
-- baris sambil menyaring demi memenuhi LIMIT 1000 — dan karena yang cocok cuma
-- segelintir (BPKAD: 8 dari 418rb baris utk 1.3.1), LIMIT tak pernah terpenuhi
-- → seluruh tabel dilewati → statement timeout. Persis pola kegagalan
-- 20260729_01, cuma tabelnya `aset`.
--
-- Dgn statistik segar, estimasi `skpd_id = 28` jadi benar (~1.291 baris) →
-- planner memilih bitmap scan idx_aset_skpd lalu sort, yang murah.
--
-- AMAN & tak mengubah data: ANALYZE cuma membaca sampel & memperbarui
-- pg_statistic. Tidak mengunci tulis (cuma ShareUpdateExclusive), tidak
-- menyentuh satu baris pun. Boleh diulang kapan saja.
--
-- ⚠️ KEBIASAAN BARU: **setiap migrasi import massal WAJIB diakhiri ANALYZE
-- tabel yang diisi.** Import besar mengubah distribusi data, dan rencana query
-- yang tadinya sehat bisa berbalik jadi full scan tanpa satu pun kode berubah —
-- gejalanya "halaman yang kemarin cepat, hari ini timeout".
-- ============================================================================

ANALYZE aset;
ANALYZE aset_awal_2026;
ANALYZE penyusutan_semester;

-- Cek kapan terakhir dianalisis (jalankan terpisah):
--   SELECT relname, n_live_tup, last_analyze, last_autoanalyze
--   FROM pg_stat_user_tables
--   WHERE relname IN ('aset','transaksi_bmd','aset_awal_2026','penyusutan_semester');
