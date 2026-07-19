-- ============================================================================
-- FIX 2 hal yang kelewat dari perbaikan performa kantor (20260717_01/02),
-- ketahuan saat verifikasi Fase 1: Daftar Barang ATB (120 baris) MASIH
-- 500/timeout ~8dtk di request `aset` walau aset_select + trx_select sudah
-- di-InitPlan-kan (2026-07-18).
--
-- ── MASALAH 1: policy `_viewer_select` masih fn_is_viewer() telanjang ───────
-- Migrasi 20260714_04 menambah policy SELECT permissive KEDUA di banyak tabel:
-- `USING (fn_is_viewer())`. Di `aset`, RLS efektif = aset_select OR
-- aset_viewer_select. Office cuma membungkus fn_is_admin() di aset_select;
-- `fn_is_viewer()` di aset_viewer_select TETAP telanjang → dievaluasi per baris
-- (query admin_profiles per baris), sama akar masalah. Ikut mahal.
--
-- ── MASALAH 2: index kode (idx_aset_kode_pattern) kemungkinan GAGAL dibuat ──
-- Migrasi 20260717_01 pakai `CREATE INDEX CONCURRENTLY`. CONCURRENTLY TIDAK
-- BOLEH jalan di dalam transaction block — dan Supabase SQL Editor membungkus
-- skrip yg di-Run jadi satu transaksi → perintah itu gagal senyap / index tak
-- terbentuk (atau tertinggal INVALID). Tanpa index ini, `kode LIKE '1.5.3.%'`
-- = seq scan ~220rb baris aset + RLS per baris → 8 dtk walau hasil akhir 120.
--
-- FIX (semua aman dalam transaksi normal — TANPA CONCURRENTLY):
--   1. Bungkus fn_is_viewer() → (SELECT fn_is_viewer()) di policy viewer `aset`
--      & `transaksi_bmd` (dua tabel terpanas utk Daftar Barang/Penyusutan/
--      Laporan). Semantik keamanan IDENTIK.
--   2. Buat ulang index kode secara PLAIN (bukan CONCURRENTLY) — DROP dulu utk
--      buang kemungkinan sisa INVALID, lalu CREATE. Lock tulis `aset` ~1-2 dtk
--      (sekali, admin maintenance) — dapat dipakai planner sesudahnya.
--
-- Catatan: tabel LAIN yg dapat policy fn_is_viewer() dari 20260714_04 (belum
-- panas) belum ikut dibungkus di sini — sengaja surgical ke 2 tabel penyebab.
-- Bisa dibereskan menyeluruh menyusul kalau perlu.
-- ============================================================================

-- 1. Bungkus fn_is_viewer() jadi InitPlan di policy viewer tabel panas
DROP POLICY IF EXISTS "aset_viewer_select" ON aset;
CREATE POLICY "aset_viewer_select" ON aset FOR SELECT TO authenticated
  USING ((SELECT fn_is_viewer()));

DROP POLICY IF EXISTS "transaksi_bmd_viewer_select" ON transaksi_bmd;
CREATE POLICY "transaksi_bmd_viewer_select" ON transaksi_bmd FOR SELECT TO authenticated
  USING ((SELECT fn_is_viewer()));

-- 2. Index prefix kode (plain, guaranteed valid). text_pattern_ops = wajib utk
--    LIKE 'prefix%' (default opclass tak terpakai utk pola LIKE).
DROP INDEX IF EXISTS idx_aset_kode_pattern;
CREATE INDEX idx_aset_kode_pattern ON aset (kode text_pattern_ops);

-- Verifikasi index valid & kepakai (jalankan terpisah kalau mau):
--   SELECT indexrelid::regclass, indisvalid FROM pg_index
--     WHERE indexrelid='idx_aset_kode_pattern'::regclass;   -- indisvalid = true
--   EXPLAIN ANALYZE SELECT id FROM aset WHERE kode LIKE '1.5.3.%';  -- Index Scan, ms-an
