-- ============================================================================
-- LRA Belanja Modal: IKUTKAN termin konstruksi (KDP) — sebelumnya hanya
-- 'pengadaan', sehingga seluruh realisasi belanja konstruksi TIDAK terhitung
-- (LRA understate). Temuan audit alur Pembukuan > Pengadaan, 2026-07-25.
--
-- DASAR: pembayaran termin kontrak konstruksi = realisasi belanja modal pada
--   tahun pembayarannya, walau asetnya masih berstatus KDP (1.3.6) & belum jadi
--   aset tetap. Tiap termin memang sudah menyimpan `payload.kode_rekening`
--   (PembayaranKdp) → grup 5.2.0x-nya akurat dari rekening, bukan tebakan.
--
-- TIGA PENYESUAIAN (selain menambah jenis):
--   1. SKPD — baris 'akumulasi_kdp' TIDAK mengisi skpd_tujuan (lihat
--      approveKontrakKonstruksi di lib/kdp.ts), jadi filter p_skpd_ids memakai
--      COALESCE(t.skpd_tujuan, a.skpd_id). Tanpa ini, memilih SKPD apa pun akan
--      membuang SEMUA baris KDP. Konsekuensi diterima: utk KDP dipakai SKPD
--      aset saat ini (bukan "kebal pengalihan" spt pengadaan) — pengalihan aset
--      di tengah konstruksi praktis tidak terjadi.
--   2. VOID — kontrak konstruksi yang dibuka kunci (unapprove) membalik SEMUA
--      termin lewat 'batal_akumulasi_kdp'. Jenis itu ditambahkan ke klausa
--      NOT EXISTS supaya kontrak yang dibatalkan tidak ikut terhitung
--      (setara perlakuan 'batal_pengadaan').
--   3. FALLBACK golongan — golongan KDP (1.3.6) SENGAJA tidak dipetakan ke
--      5.2.0x mana pun: dari kodenya saja tak bisa tahu bangunan/jalan/dst.
--      Termin tanpa kode_rekening jatuh ke NULL → ditampilkan client sbg
--      `luarJenis` (dilaporkan, tidak hilang diam-diam) — perilaku yg sudah ada.
--
-- Sisanya (SECURITY DEFINER, replikasi scope RLS, v_is_admin sekali) TIDAK
-- berubah dari 20260724_01 — lihat penjelasan performa di file tersebut.
--
-- ⚠️ DEPLOY-ORDERING: aman dijalankan kapan saja (CREATE OR REPLACE, signature
-- & tipe kembalian identik) — tidak ada perubahan kode aplikasi yang menyertai.
-- Jalankan di Supabase SQL Editor SETELAH 20260724_01_fn_lra_belanja_modal.sql.
-- ============================================================================

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
        ELSE NULL   -- termasuk 1.3.6 (KDP): jenis belanja hanya sah dari rekening
      END
    )::text                              AS grup,
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
  GROUP BY 1, 2;
END $$;

GRANT EXECUTE ON FUNCTION fn_lra_belanja_modal(int, bigint[]) TO authenticated;

-- Verifikasi (bandingkan sebelum/sesudah — selisihnya = realisasi KDP):
--   SELECT grup, SUM(nilai) FROM fn_lra_belanja_modal(2026, NULL) GROUP BY 1 ORDER BY 1;
--   SELECT SUM(nilai) FROM transaksi_bmd t
--     WHERE t.jenis='akumulasi_kdp' AND EXTRACT(YEAR FROM t.tanggal)=2026
--       AND NOT EXISTS (SELECT 1 FROM transaksi_bmd b
--                       WHERE b.aset_id=t.aset_id AND b.jenis='batal_akumulasi_kdp');
