-- ============================================================================
-- fn_dashboard_rekap() — agregasi dashboard di SERVER, bukan di browser
-- (2026-07-16). Latar: setelah import Peralatan & Mesin (218.251 baris),
-- halaman /dashboard 504 FUNCTION_INVOCATION_TIMEOUT. Penyebab: scanAset()
-- di app/dashboard/page.tsx mem-paging SELURUH tabel aset aktif 1000 baris
-- per request (dulu ~10 request, kini ~230 request berurutan dalam satu
-- invocation serverless Vercel) lalu menjumlah di JS → tembus batas 10 detik.
--
-- Fungsi ini memindah agregasi (count + Σ nilai_perolehan) ke satu query
-- GROUP BY: 230 request + transfer 218rb baris → 1 request balik ~15 baris.
--
-- SECURITY INVOKER (default LANGUAGE sql, TANPA security definer) — SENGAJA:
-- fungsi mewarisi RLS pemanggil, jadi role dgn scope terbatas (pengurus_barang
-- dst) tetap lihat rekap sesuai subtree SKPD-nya, PERSIS seperti perilaku
-- scanAset lama yang baca `aset` di bawah sesi user. Jangan diubah jadi
-- SECURITY DEFINER — itu akan membocorkan total kabupaten ke role terbatas.
--
-- golongan = 3 segmen pertama `kode` (samakan dgn kodeLevel3() di lib/bmd.ts:
-- kode.split('.').slice(0,3).join('.')). Hanya status='aktif' (sama spt lama —
-- register terkini, sudah dikurangi soft-delete). STABLE: tak menulis apa pun.
-- ============================================================================

CREATE OR REPLACE FUNCTION fn_dashboard_rekap()
RETURNS json
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT json_build_object(
    'gol', COALESCE((
      SELECT json_agg(row_to_json(g)) FROM (
        SELECT
          split_part(kode,'.',1)||'.'||split_part(kode,'.',2)||'.'||split_part(kode,'.',3) AS golongan,
          count(*)::bigint AS count,
          COALESCE(sum(nilai_perolehan), 0) AS nilai
        FROM aset
        WHERE status = 'aktif'
        GROUP BY 1
      ) g
    ), '[]'::json),
    'cara', COALESCE((
      SELECT json_agg(row_to_json(c)) FROM (
        SELECT
          cara_perolehan,
          count(*)::bigint AS count,
          COALESCE(sum(nilai_perolehan), 0) AS nilai
        FROM aset
        WHERE status = 'aktif'
        GROUP BY 1
      ) c
    ), '[]'::json)
  );
$$;

-- Verifikasi: bandingkan dgn scan lama (harus sama).
--   SELECT fn_dashboard_rekap();
--   SELECT split_part(kode,'.',1)||'.'||split_part(kode,'.',2)||'.'||split_part(kode,'.',3) gol,
--          count(*), sum(nilai_perolehan)
--     FROM aset WHERE status='aktif' GROUP BY 1 ORDER BY 1;
