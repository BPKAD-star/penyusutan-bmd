-- Permintaan user 2026-09-18: pola "klik 🔒 → info transaksi penyebabnya" yang
-- baru dipasang di Pengalihan/Mutasi Internal (migrasi 20260917_02) diterapkan
-- juga ke 🔒 Saldo Awal → Daftar Barang Awal.
--
-- ⚠️ BEDA SIFAT dari Pengalihan, dan itu SENGAJA (versi "cepat" yang dipilih
-- user, bukan versi "presisi"): di Pengalihan "terkunci" ARTINYA "ada
-- transaksi sesudahnya" — jadi menyebut transaksi itu = jawaban PASTI. Di sini
-- `fn_aset_awal_2026_terkunci_batch` mengunci lewat EMPAT kondisi berbeda
-- (status berubah / kode berubah / skpd_id berubah / ada koreksi_spesifikasi
-- atau penggabungan_masuk yang belum dibatalkan) — jadi "transaksi TERAKHIR
-- pada aset itu" cuma PROXY yang baik (barang biasanya cuma kena SATU
-- peristiwa), bukan daftar lengkap sebab kalau kebetulan ada lebih dari satu.
-- Tetap jauh lebih informatif daripada sekadar "terkunci" tanpa keterangan.
--
-- RETURNS TABLE berubah (nibar) → (nibar, jenis_terakhir, periode_terakhir),
-- jadi WAJIB DROP dulu (CREATE OR REPLACE menolak ganti tipe kembalian).
-- Predikat kuncinya sendiri (empat kondisi) TIDAK disentuh — cuma tambahan
-- LATERAL JOIN cari baris ledger TERAKHIR aset itu, dikecualikan `saldo_awal`/
-- `saldo_awal_checkpoint` (baseline itu bukan penyebab kunci, ia yang dikunci).
--
-- Diverifikasi ke PRODUKSI dgn RLS AKTIF (SET LOCAL role authenticated +
-- klaim JWT uid admin sungguhan, bukan service_role — lihat jebakan yang sama
-- di CLAUDE.md 20260917_02): 3 aset terkunci nyata → jenis_terakhir kembali
-- benar (pemecahan_keluar/pengalihan_status/penghapusan_pemindahtanganan).
-- Rollback bersih, tak ada baris tersisa.

DROP FUNCTION IF EXISTS public.fn_aset_awal_2026_terkunci_batch(text[]);

CREATE FUNCTION public.fn_aset_awal_2026_terkunci_batch(p_nibars text[])
 RETURNS TABLE(nibar text, jenis_terakhir text, periode_terakhir text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT s.nibar, t.jenis::text, t.periode::text
  FROM aset_awal_2026 s
  JOIN aset a ON a.nibar = s.nibar
  LEFT JOIN LATERAL (
    SELECT tb.jenis, tb.periode
    FROM transaksi_bmd tb
    WHERE tb.aset_id = a.id
      AND tb.jenis NOT IN ('saldo_awal', 'saldo_awal_checkpoint')
    ORDER BY tb.id DESC
    LIMIT 1
  ) t ON true
  WHERE s.nibar = ANY(p_nibars)
    AND (
         a.status  <> 'aktif'
      OR a.kode    IS DISTINCT FROM s.kode
      OR a.skpd_id IS DISTINCT FROM s.skpd_id
      OR EXISTS (
           SELECT 1 FROM transaksi_bmd tt
           WHERE tt.aset_id = a.id
             AND tt.jenis = 'koreksi_spesifikasi'
             AND NOT EXISTS (
               SELECT 1 FROM transaksi_bmd b
               WHERE b.jenis = 'batal_koreksi_spesifikasi'
                 AND b.payload->>'target_trx_id' = tt.id::text))
      OR EXISTS (
           SELECT 1 FROM transaksi_bmd tt
           WHERE tt.aset_id = a.id
             AND tt.jenis = 'penggabungan_masuk'
             AND NOT EXISTS (
               SELECT 1 FROM transaksi_bmd b
               WHERE b.jenis = 'batal_penggabungan_masuk'
                 AND b.payload->>'target_trx_id' = tt.id::text))
    )
$function$;

GRANT EXECUTE ON FUNCTION public.fn_aset_awal_2026_terkunci_batch(text[]) TO authenticated;
