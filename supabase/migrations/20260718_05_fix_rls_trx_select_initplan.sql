-- ============================================================================
-- FIX PERFORMA: RLS `trx_select` (transaksi_bmd) — bungkus fn_is_admin() jadi
-- InitPlan, SAMA POLA dgn `aset_select` (20260717_02), tapi buat transaksi_bmd
-- (2026-07-18). Ketahuan saat verifikasi manual Fase 1 (fn_daftar_barang):
-- Daftar Barang golongan ATB (1.5.3, cuma 120 baris!) tetap 500/timeout ~8dtk
-- di request ke `aset` DAN `transaksi_bmd` — dicek policy aktif via pg_policies,
-- `aset_select` TERNYATA SUDAH dibungkus (SELECT fn_is_admin()) [migrasi
-- 20260717_02 sudah jalan], TAPI `trx_select` (transaksi_bmd) MASIH pola lama:
--
--   USING (fn_is_admin() OR fn_skpd_visible(skpd_asal) OR fn_skpd_visible(skpd_tujuan)
--          OR EXISTS (SELECT 1 FROM aset a WHERE a.id=aset_id AND fn_skpd_visible(a.skpd_id)))
--
-- `fn_is_admin()` telanjang (bukan argumen kolom) tapi dievaluasi ULANG per
-- baris — sama akar masalah dgn migrasi 20260717_02/20260716_07. Ledger
-- sekarang ~262rb baris (naik drastis stlh import P&M+ATL+Aset Lain-Lain) →
-- SEMUA query ke transaksi_bmd sbg role `authenticated` (Daftar Barang,
-- Penyusutan, Laporan BMD, dkk — bukan cuma RPC baru) kena lambat, walau
-- filter akhirnya cuma nyisain segelintir baris.
--
-- FIX: `(SELECT fn_is_admin())` — subquery skalar tanpa korelasi dipromosikan
-- Postgres jadi InitPlan, dievaluasi SEKALI. Untuk admin, OR short-circuit,
-- `fn_skpd_visible`/EXISTS (lebih mahal) TIDAK PERNAH dievaluasi.
--
-- ⚠️ SEMANTIK KEAMANAN TIDAK BERUBAH. Reversible: CREATE ulang versi lama ada
-- di 20260702_01_bmd_core.sql (baris ~170-ish, policy asli).
-- ============================================================================

DROP POLICY IF EXISTS "trx_select" ON transaksi_bmd;
CREATE POLICY "trx_select" ON transaksi_bmd FOR SELECT TO authenticated
  USING (
    (SELECT fn_is_admin())
    OR fn_skpd_visible(skpd_asal)
    OR fn_skpd_visible(skpd_tujuan)
    OR EXISTS (SELECT 1 FROM aset a WHERE a.id = transaksi_bmd.aset_id AND fn_skpd_visible(a.skpd_id))
  );

-- CARA UKUR (aman, di-ROLLBACK) — bandingkan sebelum/sesudah migrasi ini:
--   BEGIN;
--   SET LOCAL role authenticated;
--   SET LOCAL request.jwt.claims = '{"sub":"<UUID-user-admin-kamu>","role":"authenticated"}';
--   EXPLAIN ANALYZE
--   SELECT id, aset_id, jenis, periode FROM transaksi_bmd
--   WHERE jenis IN ('kapitalisasi_serap','penghapusan_pemindahtanganan') LIMIT 200;
--   ROLLBACK;
