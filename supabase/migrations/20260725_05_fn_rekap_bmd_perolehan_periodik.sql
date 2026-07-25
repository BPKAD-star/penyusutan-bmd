-- ============================================================================
-- fn_rekap_bmd: NILAI PEROLEHAN diambil period-correct (dari penyusutan_semester
-- periode terpilih), bukan dari kolom `aset` yang selalu TERKINI.
--
-- MASALAH (temuan audit Pelaporan 2026-07-25): kolom perolehan dihitung
--   sum(a.nilai_perolehan) — nilai SEKARANG. Padahal nilai perolehan bisa
--   BERUBAH setelah periode yang dilihat (kapitalisasi menambah nilai,
--   koreksi_nilai ±). Akibatnya Laporan BMD untuk periode LAMPAU ikut
--   menampilkan nilai hasil perubahan yang terjadi SESUDAHNYA — laporan periode
--   lama tidak reproducible. Contoh: kapitalisasi Rp200 jt di S2 membuat
--   Laporan BMD S1 ikut naik Rp200 jt.
--
-- FIX: pakai ps.nilai_perolehan (snapshot engine pada periode itu) kalau ada,
--   fallback ke a.nilai_perolehan kalau tidak. Fallback WAJIB karena golongan
--   yang tidak disusutkan (Tanah 1.3.1, ATL 1.3.5, KDP 1.3.6) memang TIDAK
--   punya baris penyusutan_semester — persis pola yang sudah dipakai
--   lib/rekon.ts (fetchSnapshot):
--       const perolehan = p ? p.nilai_perolehan : (b.nilai_perolehan || 0)
--   Dengan ini Laporan BMD & Rekonsiliasi memakai definisi perolehan yang sama.
--
-- HANYA baris `perolehan` yang berubah. Kuantitas, akumulasi, beban, nilai buku,
-- filter, dan replikasi scope RLS TIDAK diubah dari 20260716_08.
--
-- ⚠️ MASIH TERSISA (belum diperbaiki migrasi ini — perlu keputusan terpisah):
--   fn_rekap_bmd tetap memakai `WHERE a.status='aktif'` (visibilitas TERKINI,
--   bukan replay SEMBUNYI/MUNCUL s.d. periode) dan `a.skpd_id` TERKINI
--   (kepemilikan tidak period-aware). Jadi untuk periode LAMPAU, barang yang
--   kelak dihapus/pindah SKPD masih menggeser angka. Alternatif period-correct
--   penuh ada di lib/rekon.ts (dipakai Rekonsiliasi BMD).
--
-- Signature & tipe kembalian identik → aman, tak ada perubahan kode aplikasi.
-- Jalankan di Supabase SQL Editor SETELAH 20260716_08_rekap_rollup_root_skpd.sql.
-- ============================================================================

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
    -- SATU-SATUNYA perubahan: nilai perolehan periode itu, bukan nilai terkini.
    COALESCE(sum(COALESCE(ps.nilai_perolehan, a.nilai_perolehan)), 0),
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

-- Verifikasi:
--   (1) Periode BERJALAN harus TIDAK berubah angkanya (terkini = periode):
--       SELECT golongan, sum(perolehan) FROM fn_rekap_bmd('2026-S2', NULL, 'intra')
--       GROUP BY 1 ORDER BY 1;
--   (2) Periode LAMPAU: selisih vs sebelum migrasi = total kapitalisasi +
--       koreksi_nilai yang terjadi SESUDAH periode itu.
--   (3) Cocokkan dgn Rekonsiliasi BMD (lib/rekon.ts) pada periode & scope sama —
--       kolom perolehan kini sedefinisi (sisa selisih = status/skpd terkini,
--       lihat catatan "MASIH TERSISA" di atas).
