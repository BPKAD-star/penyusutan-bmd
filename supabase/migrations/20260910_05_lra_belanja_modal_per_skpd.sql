-- Rekap per SKPD berjenjang untuk LRA (permintaan user 2026-09-10, kelanjutan
-- pola drill-down yang sudah dipasang di Perolehan/Perpindahan/Reklas/Koreksi/
-- Penghapusan/Pengamanan). `fn_lra_belanja_modal` sampai sekarang menjumlahkan
-- SELURUH `p_skpd_ids` jadi satu angka per (grup, golongan, bulan) — cukup
-- untuk worksheet satu-SKPD yang sudah ada, tapi tak bisa dipecah per SKPD
-- individual buat baris pohon rekap. Kolom `skpd_id` ditambahkan ke keluaran +
-- GROUP BY, pakai ekspresi COALESCE yang SAMA PERSIS dgn yang sudah dipakai
-- WHERE-clause-nya (fallback ke `aset.skpd_id` untuk `akumulasi_kdp`, yang tak
-- mengisi skpd_tujuan).
--
-- ⚠️ RETURNS TABLE tak bisa diubah lewat CREATE OR REPLACE — DROP dulu.
-- Tanda tangan argumen (p_tahun, p_skpd_ids) TIDAK berubah, jadi pemanggil
-- lama (fn_lra_belanja_modal(int, bigint[])) tetap valid; yang berubah cuma
-- bertambah satu kolom di hasilnya. Baris LRA sisi realisasi (`lra_realisasi`)
-- TIDAK perlu RPC baru — tabel itu sudah py `skpd_id` & sudah ditarik utuh ke
-- klien (bukan tabel besar spt transaksi_bmd/aset), jadi pengelompokan per
-- SKPD cukup dikerjakan di klien dari baris yang sudah ada.

DROP FUNCTION IF EXISTS public.fn_lra_belanja_modal(integer, bigint[]);

CREATE FUNCTION public.fn_lra_belanja_modal(p_tahun integer, p_skpd_ids bigint[] DEFAULT NULL::bigint[])
 RETURNS TABLE(skpd_id bigint, grup text, golongan text, bulan integer, nilai numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_is_admin boolean := fn_is_admin();
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(t.skpd_tujuan, a.skpd_id)::bigint AS skpd_id,
    COALESCE(
      NULLIF(substring(t.payload->>'kode_rekening' from '^[0-9]+\.[0-9]+\.[0-9]+'), ''),
      CASE a.golongan
        WHEN '1.3.1' THEN '5.2.01'
        WHEN '1.3.2' THEN '5.2.02'
        WHEN '1.3.3' THEN '5.2.03'
        WHEN '1.3.4' THEN '5.2.04'
        WHEN '1.3.5' THEN '5.2.05'
        ELSE NULL   -- termasuk 1.3.6 (KDP): jenis belanja hanya sah dari rekening
      END
    )::text                              AS grup,
    a.golongan::text                     AS golongan,
    EXTRACT(MONTH FROM t.tanggal)::int   AS bulan,
    SUM(t.nilai)::numeric                AS nilai
  FROM transaksi_bmd t
  JOIN aset a ON a.id = t.aset_id
  WHERE t.jenis IN ('pengadaan', 'akumulasi_kdp')
    AND t.tanggal >= make_date(p_tahun, 1, 1)
    AND t.tanggal <= make_date(p_tahun, 12, 31)
    -- akumulasi_kdp tak mengisi skpd_tujuan → fallback ke SKPD asetnya.
    AND (p_skpd_ids IS NULL OR COALESCE(t.skpd_tujuan, a.skpd_id) = ANY (p_skpd_ids))
    -- scope RLS transaksi_bmd direplikasi (v_is_admin dievaluasi SEKALI)
    AND (
      v_is_admin
      OR fn_skpd_visible(t.skpd_asal)
      OR fn_skpd_visible(t.skpd_tujuan)
      OR fn_skpd_visible(a.skpd_id)
    )
    -- Dibuang: pengadaan yang dibatalkan & kontrak konstruksi yang dibuka kunci.
    AND NOT EXISTS (
      SELECT 1 FROM transaksi_bmd b
      WHERE b.aset_id = t.aset_id
        AND b.jenis IN ('batal_pengadaan', 'batal_akumulasi_kdp')
    )
  GROUP BY 1, 2, 3, 4;
END $function$;

GRANT EXECUTE ON FUNCTION public.fn_lra_belanja_modal(integer, bigint[]) TO PUBLIC, postgres, anon, authenticated, service_role;
