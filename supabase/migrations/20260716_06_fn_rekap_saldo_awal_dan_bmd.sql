-- ============================================================================
-- fn_rekap_saldo_awal() + fn_rekap_bmd() — agregasi rekap di SERVER
-- (2026-07-16). Sama motivasi dgn fn_dashboard_rekap (20260716_05): setelah
-- import Peralatan & Mesin (218rb baris), halaman Rekapitulasi (Saldo Awal) &
-- Laporan BMD (Pelaporan) mem-paging seluruh tabel 1000 baris/request di
-- BROWSER lalu menjumlah di JS → se-kabupaten ratusan request → lambat parah.
--
-- Keduanya mengembalikan agregat PER (skpd_id, golongan) — SENGAJA bukan sudah
-- di-rollup ke SKPD induk — supaya SEMUA logika bisnis di client (rollup ke
-- SKPD induk via rootOf(), rekonsiliasi nilai buku, mapping GOLONGAN_REKAP)
-- TETAP UTUH tak berubah. Yang pindah ke SQL hanya loop "scan + jumlah".
--
-- SECURITY INVOKER (default LANGUAGE sql, TANPA definer) — wajib tunduk RLS
-- pemanggil, sama spt scan lama yg baca tabel di bawah sesi user. golongan =
-- 3 segmen pertama kode (= kodeLevel3() lib/bmd.ts). STABLE, tak menulis.
-- ============================================================================

-- ── 1. Rekap Saldo Awal (dari aset_awal_2026, baseline beku) ────────────────
-- Dipakai app/dashboard/saldo-awal/rekapitulasi/page.tsx. Murni agregasi,
-- TANPA join penyusutan / filter periode (baseline = snapshot 31 Des 2025).
-- nilai_buku = COALESCE(nilai_buku_awal, nilai_perolehan) — samakan dgn
-- `r.nilai_buku_awal ?? perolehan` di page (?? bukan ||: nilai_buku 0 itu SAH,
-- mis. gedung sudah habis disusutkan; fallback ke perolehan HANYA saat NULL).
CREATE OR REPLACE FUNCTION fn_rekap_saldo_awal(
  p_skpd_ids bigint[] DEFAULT NULL,
  p_komptabel text DEFAULT NULL
)
RETURNS TABLE (
  skpd_id bigint, golongan text, kuantitas bigint,
  perolehan numeric, akumulasi numeric, beban numeric, nilai_buku numeric
)
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT
    skpd_id,
    split_part(kode,'.',1)||'.'||split_part(kode,'.',2)||'.'||split_part(kode,'.',3),
    count(*)::bigint,
    COALESCE(sum(nilai_perolehan), 0),
    COALESCE(sum(akumulasi_2025), 0),
    COALESCE(sum(beban_penyusutan_per_smt), 0),
    COALESCE(sum(COALESCE(nilai_buku_awal, nilai_perolehan)), 0)
  FROM aset_awal_2026
  WHERE (p_skpd_ids IS NULL OR skpd_id = ANY(p_skpd_ids))
    AND (p_komptabel IS NULL OR p_komptabel = '' OR intra_ekstra = p_komptabel)
  GROUP BY 1, 2;
$$;

-- ── 2. Rekap BMD live + penyusutan (Laporan BMD, Model 1 & 2) ───────────────
-- Dipakai app/dashboard/pelaporan/bmd/page.tsx (proses() Model 1/2 &
-- snapshotPerolehan() Model 3). Harga perolehan dari `aset` LIVE (period-aware:
-- status='aktif' & tgl_perolehan s.d. periode), akumulasi/beban/nilai buku dari
-- penyusutan_semester periode terpilih (LEFT JOIN — golongan non-disusutkan /
-- aset tanpa hasil engine tetap muncul dgn 0).
--   count_peny = jumlah aset di sel yg punya baris penyusutan_semester (>0 =
--   "hasPeny" di page → pakai nilai buku engine; else nilai buku = perolehan).
--   Filter periode: fn_periode_dari_tanggal(tgl) <= p_periode (perbandingan
--   string leksikal SAH utk format 'YYYY-S1/2'); tgl NULL selalu ikut (samakan
--   dgn `if (r.tgl_perolehan && ...)` di page).
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
LANGUAGE sql STABLE SET search_path = public AS $$
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
  GROUP BY 1, 2;
$$;

-- Verifikasi (bandingkan dgn hasil scan lama utk satu SKPD):
--   SELECT * FROM fn_rekap_saldo_awal(NULL, NULL) ORDER BY golongan, skpd_id;
--   SELECT * FROM fn_rekap_bmd('2026-S2', NULL, 'intra') ORDER BY golongan, skpd_id;
