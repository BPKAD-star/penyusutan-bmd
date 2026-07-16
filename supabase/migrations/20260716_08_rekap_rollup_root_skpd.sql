-- ============================================================================
-- FIX ANGKA SALAH (under-count): fn_rekap_saldo_awal & fn_rekap_bmd gulung ke
-- SKPD INDUK (root) di SQL (2026-07-16).
--
-- MASALAH: versi migrasi 06/07 mengembalikan agregat per (LEAF skpd_id,
-- golongan). Dgn ~800 SKPD, itu = 2579 baris (terverifikasi) — MELEBIHI batas
-- baris PostgREST → hasil RPC KEPOTONG → app cuma menjumlah sebagian baris →
-- angka under-count, paling parah utk golongan yg tersebar di banyak SKPD
-- (1.3.2 Peralatan & Mesin: tampil 80rb, seharusnya 218rb).
--
-- FIX: gulung ke SKPD INDUK (level-1) DI SQL via CTE rekursif root_of, jadi
-- output = per (ROOT skpd, golongan) ≈ jumlah OPD × 8 golongan ≈ ratusan baris
-- (di bawah batas). Ini AMAN & hasil IDENTIK karena kedua halaman rekap MEMANG
-- cuma menampilkan per-SKPD-induk (Model 2 pakai rootOf() di client) & per-
-- golongan (Model 1) — tak pernah butuh granularitas leaf. rootOf(root)=root di
-- client → rollup client jadi no-op, angka tetap benar.
--
-- Filter scope (p_skpd_ids dari combobox = daftar id LEAF subtree) & RLS
-- (fn_skpd_visible/pernah_dikelola) TETAP diterapkan pada a.skpd_id LEAF SEBELUM
-- rollup — jadi pembatasan per-SKPD tetap presisi. root_of di-LEFT JOIN +
-- COALESCE(root_id, a.skpd_id) supaya node yatim (rantai parent putus) tetap
-- ikut sbg induk-dirinya-sendiri (samakan perilaku rootOf() client).
-- SECURITY DEFINER + v_is_admin sekali (dari migrasi 07) DIPERTAHANKAN.
-- ============================================================================

-- ── Rekap Saldo Awal (aset_awal_2026) ───────────────────────────────────────
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
  WITH RECURSIVE root_of AS (
    SELECT id, id AS root_id FROM admin_skpd WHERE parent_id IS NULL
    UNION ALL
    SELECT s.id, r.root_id FROM admin_skpd s JOIN root_of r ON s.parent_id = r.id
  )
  SELECT
    COALESCE(ro.root_id, a.skpd_id),
    split_part(a.kode,'.',1)||'.'||split_part(a.kode,'.',2)||'.'||split_part(a.kode,'.',3),
    count(*)::bigint,
    COALESCE(sum(a.nilai_perolehan), 0),
    COALESCE(sum(a.akumulasi_2025), 0),
    COALESCE(sum(a.beban_penyusutan_per_smt), 0),
    COALESCE(sum(COALESCE(a.nilai_buku_awal, a.nilai_perolehan)), 0)
  FROM aset_awal_2026 a
  LEFT JOIN root_of ro ON ro.id = a.skpd_id
  WHERE (p_skpd_ids IS NULL OR a.skpd_id = ANY(p_skpd_ids))
    AND (p_komptabel IS NULL OR p_komptabel = '' OR a.intra_ekstra = p_komptabel)
    AND (v_is_admin OR fn_skpd_visible(a.skpd_id))
  GROUP BY 1, 2;
END;
$$;

-- ── Rekap BMD (aset LIVE ⋈ penyusutan_semester) ─────────────────────────────
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
  WITH RECURSIVE root_of AS (
    SELECT id, id AS root_id FROM admin_skpd WHERE parent_id IS NULL
    UNION ALL
    SELECT s.id, r.root_id FROM admin_skpd s JOIN root_of r ON s.parent_id = r.id
  )
  SELECT
    COALESCE(ro.root_id, a.skpd_id),
    split_part(a.kode,'.',1)||'.'||split_part(a.kode,'.',2)||'.'||split_part(a.kode,'.',3),
    count(*)::bigint,
    COALESCE(sum(a.nilai_perolehan), 0),
    COALESCE(sum(ps.akumulasi), 0),
    COALESCE(sum(ps.beban), 0),
    COALESCE(sum(ps.nilai_buku_akhir), 0),
    count(ps.aset_id)::bigint
  FROM aset a
  LEFT JOIN penyusutan_semester ps ON ps.aset_id = a.id AND ps.periode = p_periode
  LEFT JOIN root_of ro ON ro.id = a.skpd_id
  WHERE a.status = 'aktif'
    AND (p_skpd_ids IS NULL OR a.skpd_id = ANY(p_skpd_ids))
    AND (p_komptabel IS NULL OR p_komptabel = '' OR a.intra_ekstra = p_komptabel)
    AND (a.tgl_perolehan IS NULL OR fn_periode_dari_tanggal(a.tgl_perolehan) <= p_periode)
    AND (v_is_admin OR fn_skpd_visible(a.skpd_id) OR fn_aset_pernah_dikelola(a.id))
  GROUP BY 1, 2;
END;
$$;

-- Verifikasi jumlah baris output TURUN drastis (harus << 1000):
--   SELECT count(*) FROM fn_rekap_bmd('2026-S2', NULL, 'intra');  -- run via app/admin
-- Cek total per golongan lewat app: 1.3.2 harus 218.251, bukan 80.131.
