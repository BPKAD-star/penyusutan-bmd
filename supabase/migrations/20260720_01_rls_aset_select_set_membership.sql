-- ============================================================================
-- FIX PERFORMA: aset_select RLS untuk NON-ADMIN — dari eval per-baris jadi
-- set-membership (InitPlan), + helper scope SKPD utk disuntik ke query GIS &
-- Kendaraan (2026-07-20).
--
-- GEJALA: login role pengurus_barang → GIS Tanah & Kendaraan "Gagal memuat
-- data" (canceling statement due to statement timeout, HTTP 500, ~8 dtk).
-- Admin normal. Bukan data kosong — query `aset` TIMEOUT.
--
-- DIAGNOSIS (dibuktikan EXPLAIN ANALYZE sbg pengurus_barang, DB live):
-- Policy lama (20260704_22/20260717_02):
--   USING (fn_is_admin() OR fn_skpd_visible(skpd_id) OR fn_aset_pernah_dikelola(id))
-- `(SELECT fn_is_admin())` sudah InitPlan (admin short-circuit → cepat). TAPI
-- utk non-admin, `fn_skpd_visible(skpd_id)` & `fn_aset_pernah_dikelola(id)`
-- (SECURITY DEFINER bersarang + subquery ledger 262rb) dievaluasi PER BARIS.
-- Plan: Seq Scan seluruh `aset` (~418rb baris). GIS/Kendaraan TIDAK memfilter
-- skpd_id di query → semua baris golongan discan × fungsi mahal → timeout.
--
-- Ada DUA lapis masalah, keduanya dibereskan:
--   (1) RLS per-baris  → migrasi ini (set-membership InitPlan).
--   (2) `kode LIKE 'x%'` TIDAK bisa jadi index-cond di bawah RLS karena operator
--       `~~` TIDAK leakproof → walau idx_aset_kode_pattern ada & valid, planner
--       Seq Scan. Penyelamatnya qual leakproof + terindeks = kesetaraan skpd_id
--       (idx_aset_skpd). Disuntik di sisi kode (GIS/Kendaraan) pakai
--       fn_my_skpd_scope() di bawah. Terbukti: 8.000 ms → ~150 ms.
--
-- ⚠️ SEMANTIK KEAMANAN IDENTIK. Aturan sama persis: admin lihat semua; non-admin
-- lihat aset subtree SKPD-nya + aset yang pernah dikelolanya (pengalihan). Yang
-- berubah HANYA CARA evaluasi: himpunan dibangun SEKALI (uncorrelated subquery →
-- hashed SubPlan) lalu per-baris cuma tes keanggotaan — bukan fungsi per-baris.
-- Konsisten dgn aturan InitPlan di CLAUDE.md — JANGAN balik ke fn telanjang.
-- Reversible: policy lama ada di 20260704_22_pengalihan_kembalikan.sql.
-- ============================================================================

-- ── Helper 1: himpunan skpd_id subtree user (descendant-or-self) ─────────────
-- Uncorrelated (tak ada argumen kolom) → di `x IN (SELECT ...)` dipromosikan
-- jadi hashed SubPlan / InitPlan: dievaluasi SEKALI per query.
CREATE OR REPLACE FUNCTION fn_my_skpd_ids() RETURNS SETOF bigint
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.id FROM admin_skpd s WHERE s.path <@ fn_my_skpd_path()
$$;

-- ── Helper 2: himpunan aset_id yang pernah dikelola user (via pengalihan) ────
-- Pengganti fn_aset_pernah_dikelola(id) yang per-baris. Dibangun SEKALI dari
-- baris `pengalihan_status` (jarang) — bukan subquery per baris aset.
CREATE OR REPLACE FUNCTION fn_my_pernah_dikelola_aset() RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT t.aset_id FROM transaksi_bmd t
  WHERE t.jenis = 'pengalihan_status'
    AND (fn_skpd_visible(t.skpd_asal) OR fn_skpd_visible(t.skpd_tujuan))
$$;

-- ── Helper 3: scope SKPD utk DIPANGGIL CLIENT (RPC) ─────────────────────────
-- Dipakai GIS & Kendaraan: non-admin → array skpd_id subtree (disuntik
-- .in('skpd_id', ...) supaya idx_aset_skpd kepakai). ADMIN → NULL (client tak
-- memfilter → lihat se-kabupaten), TERMASUK admin yang kebetulan punya skpd_id.
-- Non-admin tanpa skpd_id (salah setup) → NULL juga, TAPI RLS tetap menutup
-- (fn_my_skpd_path NULL → fn_skpd_visible false → tak lihat apa pun; fail-closed).
CREATE OR REPLACE FUNCTION fn_my_skpd_scope() RETURNS bigint[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN fn_is_admin() THEN NULL
    ELSE (SELECT array_agg(s.id) FROM admin_skpd s WHERE s.path <@ fn_my_skpd_path())
  END
$$;

GRANT EXECUTE ON FUNCTION fn_my_skpd_ids()            TO authenticated;
GRANT EXECUTE ON FUNCTION fn_my_pernah_dikelola_aset() TO authenticated;
GRANT EXECUTE ON FUNCTION fn_my_skpd_scope()          TO authenticated;

-- ── Policy: cabang non-admin jadi set-membership (InitPlan) ──────────────────
DROP POLICY IF EXISTS "aset_select" ON aset;
CREATE POLICY "aset_select" ON aset FOR SELECT TO authenticated
  USING (
    (SELECT fn_is_admin())
    OR skpd_id IN (SELECT fn_my_skpd_ids())
    OR id      IN (SELECT fn_my_pernah_dikelola_aset())
  );

-- Verifikasi (aman, ROLLBACK) — jalankan sbg pengurus_barang:
--   BEGIN;
--   SELECT set_config('request.jwt.claims',
--     json_build_object('sub',(SELECT id::text FROM admin_profiles
--        WHERE role='pengurus_barang' AND skpd_id IS NOT NULL ORDER BY skpd_id LIMIT 1),
--       'role','authenticated')::text, true);
--   SET LOCAL ROLE authenticated;
--   EXPLAIN (ANALYZE, BUFFERS)
--   SELECT id,kode,nama_barang,skpd_id FROM aset
--   WHERE kode LIKE '1.3.1.%' AND status='aktif'
--     AND skpd_id IN (SELECT fn_my_skpd_ids())
--   ORDER BY nama_barang;   -- Index Scan idx_aset_skpd, ~ratusan ms
--   ROLLBACK;
