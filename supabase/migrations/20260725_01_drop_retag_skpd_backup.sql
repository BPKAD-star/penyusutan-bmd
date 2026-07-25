-- ============================================================================
-- Drop tabel backup rollback re-tag skpd (sudah tidak dipakai).
--
-- retag_skpd_backup_20260714 & retag_skpd_backup_awal_20260714 dibuat oleh
-- migrasi 20260714_02_retag_aset_skpd_dari_nibar.sql SEMATA sbg snapshot
-- (skpd_lama → skpd_baru) untuk rollback re-tag skpd_id ke sub-unit dari NIBAR.
--
-- Audit 2026-07-25: TIDAK ada kode aplikasi, fungsi SQL, trigger, RLS, view,
-- maupun migrasi lain yang menyentuh dua tabel ini — hanya migrasi pembuatnya
-- yang menyebutnya (di komentar ROLLBACK). Re-tag sudah berjalan benar sejak
-- 14 Juli (filter sub-unit tampil normal), jadi jejak rollback tak lagi
-- diperlukan. Keputusan user 2026-07-25: drop.
--
-- ⚠️ Konsekuensi yang diterima: perintah ROLLBACK di 20260714_02 (mengembalikan
--   aset.skpd_id / aset_awal_2026.skpd_id ke nilai pra-retag) TIDAK bisa lagi
--   dijalankan setelah ini. Data live `aset`/`aset_awal_2026` TIDAK disentuh —
--   hanya tabel snapshot yang dibuang.
--
-- Jalankan di Supabase SQL Editor.
-- ============================================================================

DROP TABLE IF EXISTS retag_skpd_backup_20260714;
DROP TABLE IF EXISTS retag_skpd_backup_awal_20260714;
