-- ============================================================================
-- Lanjutan 20260810_02: pola "scope SEKALI" diterapkan ke DUA RPC rekap yang
-- tersisa, plus satu perbaikan estimasi planner di `fn_rekap_bmd`.
--
-- Latar: sesudah 20260810_02, Dashboard sudah cepat untuk semua peran, tapi
-- **Laporan BMD masih timeout — bahkan untuk ADMIN**. Berkat perbaikan
-- fail-closed 2026-08-10, halamannya bilang sendiri
-- ("canceling statement due to statement timeout") alih-alih menampilkan nol.
--
-- ── PERBAIKAN 1: predikat tanggal yang BISA DITAKSIR (fn_rekap_bmd) ─────────
-- Qual lama:  `fn_periode_dari_tanggal(a.tgl_perolehan) <= p_periode`
-- Planner tak bisa menaksir pemanggilan fungsi, jadi ia memakai tebakan baku
-- 33%: estimasi **139.827** baris padahal nyatanya **418.143**. Akibatnya hash
-- untuk join ke penyusutan_semester dialokasikan terlalu kecil → 16 batch →
-- TUMPAH KE DISK (temp 6.272 blok ditulis & dibaca ulang).
--
-- Qual baru:  `a.tgl_perolehan <= v_batas_tgl`, dengan
--   v_batas_tgl = <tahun>-06-30 untuk S1, <tahun>-12-31 untuk S2.
-- `fn_periode_dari_tanggal` IMMUTABLE dan isinya cuma tahun + S1/S2, jadi
-- kedua bentuk itu setara. DIVERIFIKASI, bukan diasumsikan: atas seluruh
-- 418.160 baris `aset`, untuk S1 MAUPUN S2 → **0 beda**.
--
-- ── PERBAIKAN 2: scope RLS dihitung SEKALI (kedua fungsi) ───────────────────
-- Sama persis dengan 20260810_02, termasuk dua jebakan keamanannya:
--   * viewer → scope WAJIB array kosong (fn_skpd_visible selalu false untuk
--     viewer, fn_my_skpd_scope tidak memeriksanya);
--   * COALESCE wajib — `x = ANY(NULL)` menghasilkan NULL, bukan false.
--
-- ── HASIL (RLS aktif) ──────────────────────────────────────────────────────
--   fn_rekap_bmd, admin ................ timeout (>8.000 ms) → 2.194 ms
--   fn_rekap_bmd, pengurus Diknas ...... timeout            → 2.042 ms
--   fn_rekap_saldo_awal, admin ......... (belum diukur dulu) → 5.394 ms
--
-- ANGKANYA TIDAK BERGESER: `fn_rekap_bmd('2026-S2', NULL, 'intra')` sebagai
-- admin → kuantitas **417.900**, perolehan **8.933.160.505.974,6** — sama
-- persis dengan yang tercetak di layar sebelum perubahan.
--
-- ⚠️ Semua angka di atas diukur saat CPU instance sedang LEMAH (sesudah sejam
-- pembangunan index & VACUUM berturut-turut; query yang sama sempat 6× lebih
-- lambat dengan rencana & buffer identik). Jadi ini kemungkinan besar batas
-- BAWAH — ukur ulang saat tenang.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_rekap_saldo_awal(p_skpd_ids bigint[] DEFAULT NULL::bigint[], p_komptabel text DEFAULT NULL::text)
 RETURNS TABLE(skpd_id bigint, golongan text, kuantitas bigint, perolehan numeric, akumulasi numeric, beban numeric, nilai_buku numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_is_admin boolean := fn_is_admin();
  v_scope bigint[] := CASE WHEN fn_is_viewer() THEN ARRAY[]::bigint[]
                           ELSE COALESCE(fn_my_skpd_scope(), ARRAY[]::bigint[]) END;
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
    AND (v_is_admin OR a.skpd_id = ANY(v_scope))
  GROUP BY 1, 2;
END;
$function$;

-- ⚠️ `fn_rekap_bmd` TIDAK ditulis ulang di berkas ini — definisi lengkapnya
-- panjang dan sudah diterapkan langsung ke DB pada 2026-08-10. Yang berubah
-- HANYA tiga baris di dalamnya, dan ini yang harus diketahui kalau nanti
-- fungsinya disunting lagi:
--   1. DECLARE + v_scope & v_pernah (pola sama seperti di atas);
--   2. DECLARE v_batas_tgl date := (left(p_periode,4) ||
--        CASE WHEN right(p_periode,1)='1' THEN '-06-30' ELSE '-12-31' END)::date;
--   3. di CTE `cand`:
--        AND (a.tgl_perolehan IS NULL OR a.tgl_perolehan <= v_batas_tgl)
--        AND (v_is_admin OR a.skpd_id = ANY(v_scope) OR a.id = ANY(v_pernah))
--      menggantikan versi lama yang memakai fn_periode_dari_tanggal(),
--      fn_skpd_visible(), dan fn_aset_pernah_dikelola() — ketiganya per baris.
--
-- ⚠️ JANGAN kembalikan ke pemanggilan fungsi per-baris. Itu bukan soal gaya:
-- fungsi berargumen per-baris tak bisa diangkat jadi InitPlan, dan di tabel
-- 418rb baris biayanya bukan lebih lambat — melainkan TIDAK SELESAI.

-- ── VERIFIKASI (WAJIB dengan RLS aktif, rules.md §4.3) ──────────────────────
--   BEGIN;
--   SET LOCAL role authenticated;
--   SET LOCAL request.jwt.claims = '{"sub":"<UUID>","role":"authenticated"}';
--   SELECT sum(kuantitas), sum(perolehan) FROM fn_rekap_bmd('2026-S2', NULL, 'intra');
--   ROLLBACK;
-- Sebagai admin harus 417.900 / 8.933.160.505.974,6 (per 2026-08-10).
-- Uji juga sebagai pengurus barang SKPD TERBESAR (rules.md §4.5) — Dinas
-- Pendidikan, 294.967 aset, 707 dari 816 SKPD di subtree-nya.
