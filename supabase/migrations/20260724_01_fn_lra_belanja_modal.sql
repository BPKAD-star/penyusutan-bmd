-- ============================================================================
-- FIX TIMEOUT LRA — agregasi "Belanja Modal (Entryan Aplikasi)" pindah ke server.
--
-- MASALAH: halaman LRA (Fase B) menarik baris `transaksi_bmd` jenis 'pengadaan'
-- + join `aset` ke browser lalu diagregasi di client. Dengan filter SKPD
-- "Semua", RLS `aset` (fn_is_admin/fn_skpd_visible/fn_aset_pernah_dikelola
-- dievaluasi PER BARIS) + volume aset ~227rb → tembus statement timeout 8s role
-- authenticated → "canceling statement due to statement timeout".
-- Ini melanggar aturan performa CLAUDE.md (agregasi di server via RPC, jangan
-- tarik semua baris ke browser).
--
-- FIX: RPC agregasi, pola PERSIS fn_rekap_bmd/fn_dashboard_rekap (migrasi
-- 20260716_07): SECURITY DEFINER (bypass RLS per-baris) + scope RLS
-- transaksi_bmd DIREPLIKASI di WHERE dengan fn_is_admin() dihitung SEKALI ke
-- v_is_admin. Untuk admin, `v_is_admin OR <cek per-baris>` short-circuit →
-- cek per-baris tak pernah jalan. Non-admin: app umumnya sudah kirim
-- p_skpd_ids (subtree) → dataset kecil; kalau NULL pun WHERE tetap membatasi ke
-- baris yang visible (tak bocor lintas-SKPD).
--
-- Hasil: kembalian maksimal 5 jenis × 12 bulan = 60 baris, bukan ratusan ribu.
--
-- ⚠️ DEPLOY-ORDERING: jalankan migrasi ini SEBELUM deploy kode — halaman LRA
-- sudah memanggil fn_lra_belanja_modal().
-- Jalankan di Supabase SQL Editor SETELAH 20260723_04_usulan_tahun.sql.
-- ============================================================================

-- Index pendukung: filter jenis + rentang tanggal (idx_trx_jenis hanya (jenis)).
-- PLAIN, bukan CONCURRENTLY — SQL Editor membungkus transaksi.
CREATE INDEX IF NOT EXISTS idx_trx_jenis_tanggal ON transaksi_bmd(jenis, tanggal);

-- Agregat belanja modal sisi aplikasi per (jenis 5.2.0x, bulan).
--   grup   : dari payload.kode_rekening (3 segmen pertama); kalau kosong (data
--            lama) fallback dari golongan aset. NULL = di luar 5.2.01–05 →
--            client menaruhnya di `luarJenis` (dilaporkan, tidak hilang diam2).
--   SKPD   : skpd_tujuan (SKPD pembeli saat pengadaan) — kebal pengalihan.
--   Dibuang: aset yang punya `batal_pengadaan` (dianggap tak pernah ada).
CREATE OR REPLACE FUNCTION fn_lra_belanja_modal(
  p_tahun    int,
  p_skpd_ids bigint[] DEFAULT NULL
)
RETURNS TABLE (grup text, bulan int, nilai numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_is_admin boolean := fn_is_admin();
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(
      NULLIF(substring(t.payload->>'kode_rekening' from '^[0-9]+\.[0-9]+\.[0-9]+'), ''),
      CASE split_part(a.kode,'.',1)||'.'||split_part(a.kode,'.',2)||'.'||split_part(a.kode,'.',3)
        WHEN '1.3.1' THEN '5.2.01'
        WHEN '1.3.2' THEN '5.2.02'
        WHEN '1.3.3' THEN '5.2.03'
        WHEN '1.3.4' THEN '5.2.04'
        WHEN '1.3.5' THEN '5.2.05'
        ELSE NULL
      END
    )::text                              AS grup,
    EXTRACT(MONTH FROM t.tanggal)::int   AS bulan,
    SUM(t.nilai)::numeric                AS nilai
  FROM transaksi_bmd t
  JOIN aset a ON a.id = t.aset_id
  WHERE t.jenis = 'pengadaan'
    AND t.tanggal >= make_date(p_tahun, 1, 1)
    AND t.tanggal <= make_date(p_tahun, 12, 31)
    AND (p_skpd_ids IS NULL OR t.skpd_tujuan = ANY (p_skpd_ids))
    -- scope RLS transaksi_bmd direplikasi (v_is_admin dievaluasi SEKALI)
    AND (
      v_is_admin
      OR fn_skpd_visible(t.skpd_asal)
      OR fn_skpd_visible(t.skpd_tujuan)
      OR fn_skpd_visible(a.skpd_id)
    )
    AND NOT EXISTS (
      SELECT 1 FROM transaksi_bmd b
      WHERE b.aset_id = t.aset_id AND b.jenis = 'batal_pengadaan'
    )
  GROUP BY 1, 2;
END $$;

GRANT EXECUTE ON FUNCTION fn_lra_belanja_modal(int, bigint[]) TO authenticated;
