-- ============================================================================
-- FIX PERFORMA: fn_dashboard_rekap / fn_rekap_saldo_awal / fn_rekap_bmd
-- jadi SECURITY DEFINER + evaluasi fn_is_admin() SEKALI (2026-07-16).
--
-- MASALAH: versi SECURITY INVOKER (migrasi 05 & 06) tunduk RLS, dan RLS
-- `aset`/`aset_awal_2026` memakai `fn_is_admin() OR fn_skpd_visible(...) [OR
-- fn_aset_pernah_dikelola(...)]`. `fn_is_admin()` STABLE tapi TETAP dipanggil
-- PER BARIS (Postgres tak auto-cache STABLE fn di qual) → 218rb subquery ke
-- `profiles` per query → ~8 dtk → fn_rekap_bmd (aset, RLS paling berat krn
-- ada fn_aset_pernah_dikelola yg subquery ke transaksi_bmd) tembus statement
-- timeout 8s role authenticated → HTTP 500. fn_rekap_saldo_awal cuma lolos tipis.
--
-- FIX: SECURITY DEFINER (bypass RLS per-baris) + replikasi scope RLS SENDIRI di
-- WHERE, dgn fn_is_admin() dihitung SEKALI ke v_is_admin. Untuk admin,
-- `v_is_admin OR <cek per-baris>` di-short-circuit (v_is_admin Param cost 0 →
-- dievaluasi duluan) → cek per-baris TAK PERNAH jalan → agregasi 218rb baris
-- jadi ratusan ms. Non-admin: cek subtree per-baris tetap jalan TAPI umumnya
-- app sudah kirim p_skpd_ids (subtree-nya) → dataset kecil → cepat; kalaupun
-- p_skpd_ids null (mis. panggil RPC langsung), WHERE tetap batasi ke baris
-- visible (aman, tak bocor lintas-SKPD).
--
-- Scope direplikasi PERSIS spt RLS tabel masing-masing:
--   aset_awal_2026 : v_is_admin OR fn_skpd_visible(skpd_id)
--   aset           : v_is_admin OR fn_skpd_visible(skpd_id) OR fn_aset_pernah_dikelola(id)
-- fn_is_admin()/fn_skpd_visible()/fn_aset_pernah_dikelola() sendiri SECURITY
-- DEFINER berbasis auth.uid() → tetap kenali PEMANGGIL walau dipanggil dari
-- dalam fungsi DEFINER ini. Signature & return TETAP sama → tak perlu ubah app.
-- ============================================================================

-- ── 1. Dashboard (reads aset) ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_dashboard_rekap()
RETURNS json
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_is_admin boolean := fn_is_admin();
  v_result json;
BEGIN
  SELECT json_build_object(
    'gol', COALESCE((SELECT json_agg(row_to_json(g)) FROM (
        SELECT split_part(kode,'.',1)||'.'||split_part(kode,'.',2)||'.'||split_part(kode,'.',3) AS golongan,
               count(*)::bigint AS count, COALESCE(sum(nilai_perolehan), 0) AS nilai
        FROM aset
        WHERE status = 'aktif'
          AND (v_is_admin OR fn_skpd_visible(skpd_id) OR fn_aset_pernah_dikelola(id))
        GROUP BY 1) g), '[]'::json),
    'cara', COALESCE((SELECT json_agg(row_to_json(c)) FROM (
        SELECT cara_perolehan, count(*)::bigint AS count, COALESCE(sum(nilai_perolehan), 0) AS nilai
        FROM aset
        WHERE status = 'aktif'
          AND (v_is_admin OR fn_skpd_visible(skpd_id) OR fn_aset_pernah_dikelola(id))
        GROUP BY 1) c), '[]'::json)
  ) INTO v_result;
  RETURN v_result;
END;
$$;

-- ── 2. Rekap Saldo Awal (reads aset_awal_2026) ──────────────────────────────
CREATE OR REPLACE FUNCTION fn_rekap_saldo_awal(
  p_skpd_ids bigint[] DEFAULT NULL,
  p_komptabel text DEFAULT NULL
)
RETURNS TABLE (
  skpd_id bigint, golongan text, kuantitas bigint,
  perolehan numeric, akumulasi numeric, beban numeric, nilai_buku numeric
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_is_admin boolean := fn_is_admin();
BEGIN
  RETURN QUERY
  SELECT
    a.skpd_id,
    split_part(a.kode,'.',1)||'.'||split_part(a.kode,'.',2)||'.'||split_part(a.kode,'.',3),
    count(*)::bigint,
    COALESCE(sum(a.nilai_perolehan), 0),
    COALESCE(sum(a.akumulasi_2025), 0),
    COALESCE(sum(a.beban_penyusutan_per_smt), 0),
    COALESCE(sum(COALESCE(a.nilai_buku_awal, a.nilai_perolehan)), 0)
  FROM aset_awal_2026 a
  WHERE (p_skpd_ids IS NULL OR a.skpd_id = ANY(p_skpd_ids))
    AND (p_komptabel IS NULL OR p_komptabel = '' OR a.intra_ekstra = p_komptabel)
    AND (v_is_admin OR fn_skpd_visible(a.skpd_id))
  GROUP BY 1, 2;
END;
$$;

-- ── 3. Rekap BMD (reads aset LIVE ⋈ penyusutan_semester) ────────────────────
CREATE OR REPLACE FUNCTION fn_rekap_bmd(
  p_periode text,
  p_skpd_ids bigint[] DEFAULT NULL,
  p_komptabel text DEFAULT NULL
)
RETURNS TABLE (
  skpd_id bigint, golongan text, kuantitas bigint,
  perolehan numeric, akumulasi numeric, beban numeric,
  nilai_buku_akhir numeric, count_peny bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_is_admin boolean := fn_is_admin();
BEGIN
  RETURN QUERY
  SELECT
    a.skpd_id,
    split_part(a.kode,'.',1)||'.'||split_part(a.kode,'.',2)||'.'||split_part(a.kode,'.',3),
    count(*)::bigint,
    COALESCE(sum(a.nilai_perolehan), 0),
    COALESCE(sum(ps.akumulasi), 0),
    COALESCE(sum(ps.beban), 0),
    COALESCE(sum(ps.nilai_buku_akhir), 0),
    count(ps.aset_id)::bigint
  FROM aset a
  LEFT JOIN penyusutan_semester ps ON ps.aset_id = a.id AND ps.periode = p_periode
  WHERE a.status = 'aktif'
    AND (p_skpd_ids IS NULL OR a.skpd_id = ANY(p_skpd_ids))
    AND (p_komptabel IS NULL OR p_komptabel = '' OR a.intra_ekstra = p_komptabel)
    AND (a.tgl_perolehan IS NULL OR fn_periode_dari_tanggal(a.tgl_perolehan) <= p_periode)
    AND (v_is_admin OR fn_skpd_visible(a.skpd_id) OR fn_aset_pernah_dikelola(a.id))
  GROUP BY 1, 2;
END;
$$;

-- Verifikasi (harus balik CEPAT, < 1 dtk, tanpa 500):
--   SELECT * FROM fn_rekap_bmd('2026-S2', NULL, 'intra') ORDER BY golongan;
