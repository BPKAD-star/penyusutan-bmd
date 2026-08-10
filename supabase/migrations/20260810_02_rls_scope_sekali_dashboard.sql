-- ============================================================================
-- Dashboard untuk PENGURUS BARANG: dari TIMEOUT TOTAL jadi 442 ms.
--
-- Ditemukan 2026-08-10 saat menjalankan uji yang diwajibkan rules.md §4.5 —
-- "sesudah import besar, uji ulang halaman berat sebagai pengurus barang SKPD
-- TERBESAR, bukan cuma sebagai admin". Itu satu-satunya langkah yang belum
-- pernah dikerjakan, dan hasilnya yang paling parah dari semua pengukuran hari
-- ini: sebagai admin Dashboard 173 ms; sebagai pengurus barang Dinas Pendidikan
-- (294.967 aset, 707 dari 816 SKPD di subtree-nya) ia **tidak selesai sama
-- sekali**, bahkan dengan statement_timeout dinaikkan ke 60 detik.
--
-- ── AKAR ────────────────────────────────────────────────────────────────────
-- `fn_dashboard_rekap` memakai qual:
--     (v_is_admin OR fn_skpd_visible(skpd_id) OR fn_aset_pernah_dikelola(id))
-- Untuk admin, `v_is_admin` memutus di depan — itu sebabnya admin baik-baik
-- saja dan masalahnya tak pernah terlihat. Untuk NON-admin, keduanya
-- dievaluasi PER BARIS atas 418rb baris:
--   * `fn_skpd_visible(skpd_id)`      → EXISTS ke admin_skpd (ltree), 418rb ×
--   * `fn_aset_pernah_dikelola(id)`   → EXISTS ke transaksi_bmd (418rb baris),
--     dan di DALAMNYA memanggil fn_skpd_visible DUA KALI lagi.
-- Ini rules.md §4.1 (InitPlan) dalam bentuk yang tak bisa ditambal InitPlan:
-- fungsi BERARGUMEN per-baris memang tak bisa diangkat jadi InitPlan.
--
-- ── OBAT: hitung scope SEKALI jadi array, lalu `= ANY(array)` ───────────────
-- Pola yang sudah dipakai repo ini (CLAUDE.md, tambalan GIS Tanah 20260720_01).
-- `= ANY(bigint[])` itu leakproof & bisa jadi index-cond; `fn_skpd_visible(x)`
-- tidak.
--
-- ⚠️ KESETARAAN DIVERIFIKASI SEBELUM DIUBAH, bukan diasumsikan: atas seluruh
-- 816 baris `admin_skpd` sebagai pengguna uji, `fn_skpd_visible(s.id)` dan
-- `s.id = ANY(fn_my_skpd_scope())` memberi hasil identik — 707 true, **0 beda**.
--
-- ⚠️ DUA JEBAKAN yang ditutup di bawah, dan dua-duanya soal KEAMANAN:
--   1. VIEWER (`pengawas`). `fn_skpd_visible` SELALU false untuk viewer, tapi
--      `fn_my_skpd_scope()` tidak memeriksanya — kalau dipakai mentah, viewer
--      mendadak melihat seluruh subtree-nya. Karena itu scope viewer dipaksa
--      ARRAY KOSONG.
--   2. `x = ANY(NULL::bigint[])` menghasilkan **NULL**, bukan false. Tanpa
--      COALESCE, qual-nya jadi NULL dan barisnya ikut terbuang/lolos tak
--      terduga. Admin memang dapat NULL dari fn_my_skpd_scope().
--
-- HASIL (RLS aktif, sebagai pengurus barang Dinas Pendidikan):
--   Dashboard  >60.000 ms (timeout) → 442 ms
--   Jumlah aset yang terlihat: 294.967 — SAMA PERSIS dengan hitungan subtree
--   yang diambil terpisah. Yang berubah kecepatannya, bukan angkanya.
-- ============================================================================

-- Index penutup berkunci `skpd_id` — pasangan dari idx_aset_rekap_golongan
-- (yang berkunci `status`, untuk admin). Tanpa ini rencana query jatuh ke
-- Index Scan biasa: 294.967 akses heap ACAK, 93.812 buffer, 11,8 detik.
CREATE INDEX IF NOT EXISTS idx_aset_skpd_rekap
  ON aset (skpd_id, status)
  INCLUDE (id, kode, nilai_perolehan, cara_perolehan);

CREATE OR REPLACE FUNCTION public.fn_dashboard_rekap()
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_is_admin boolean := fn_is_admin();
  -- Scope SKPD SEKALI, bukan per baris. Viewer → kosong (lihat jebakan 1).
  -- COALESCE wajib (lihat jebakan 2).
  v_scope bigint[] := CASE WHEN fn_is_viewer() THEN ARRAY[]::bigint[]
                           ELSE COALESCE(fn_my_skpd_scope(), ARRAY[]::bigint[]) END;
  -- Aset yang PERNAH dikelola (pengalihan status) — sekali juga. Versi lama
  -- memanggil fn_aset_pernah_dikelola per baris; itu biang timeout-nya.
  v_pernah uuid[] := CASE WHEN v_is_admin THEN ARRAY[]::uuid[] ELSE (
      SELECT COALESCE(array_agg(DISTINCT t.aset_id), ARRAY[]::uuid[])
      FROM transaksi_bmd t
      WHERE t.jenis = 'pengalihan_status'
        AND (t.skpd_asal = ANY(v_scope) OR t.skpd_tujuan = ANY(v_scope))
    ) END;
  v_result json;
BEGIN
  SELECT json_build_object(
    'gol', COALESCE((SELECT json_agg(row_to_json(g)) FROM (
        SELECT split_part(kode,'.',1)||'.'||split_part(kode,'.',2)||'.'||split_part(kode,'.',3) AS golongan,
               count(*)::bigint AS count, COALESCE(sum(nilai_perolehan), 0) AS nilai
        FROM aset
        WHERE status = 'aktif'
          AND (v_is_admin OR skpd_id = ANY(v_scope) OR id = ANY(v_pernah))
        GROUP BY 1) g), '[]'::json),
    'cara', COALESCE((SELECT json_agg(row_to_json(c)) FROM (
        SELECT cara_perolehan, count(*)::bigint AS count, COALESCE(sum(nilai_perolehan), 0) AS nilai
        FROM aset
        WHERE status = 'aktif'
          AND (v_is_admin OR skpd_id = ANY(v_scope) OR id = ANY(v_pernah))
        GROUP BY 1) c), '[]'::json)
  ) INTO v_result;
  RETURN v_result;
END;
$function$;

ANALYZE aset;

-- ── LANGKAH TERPISAH (jangan taruh di berkas ini — ERROR 25001) ─────────────
--   VACUUM (ANALYZE) aset;
--
-- ── VERIFIKASI (WAJIB dengan RLS aktif, rules.md §4.3) ──────────────────────
--   BEGIN;
--   SET LOCAL role authenticated;
--   SET LOCAL request.jwt.claims = '{"sub":"<UUID pengurus SKPD TERBESAR>","role":"authenticated"}';
--   EXPLAIN (ANALYZE) SELECT fn_dashboard_rekap();
--   ROLLBACK;
--
-- Jalankan DUA KALI — run pertama sesudah index dibuat selalu terlihat lambat
-- karena indexnya masih dingin (di sini 4.618 ms lalu 442 ms).
--
-- ⚠️ MASIH ADA PR: `fn_rekap_bmd` & `fn_rekap_saldo_awal` memakai pola qual
-- yang SAMA (`v_is_admin OR fn_skpd_visible(...)`), jadi keduanya kemungkinan
-- besar masih lambat untuk non-admin. Belum diukur — kerjakan terpisah dengan
-- cara yang sama: verifikasi kesetaraan dulu, baru ubah.
