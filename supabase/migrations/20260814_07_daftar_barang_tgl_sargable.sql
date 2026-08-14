-- 20260814_07_daftar_barang_tgl_sargable.sql
-- Lanjutan 20260814_06. Sesudah 06: halaman 126 ms (dari 9.821), TAPI rekap
-- masih 3.335 ms — dan rekap dipanggil tiap kali filter berubah, jadi itulah
-- yang dirasakan operator saat menekan "Tampilkan".
--
-- SEBAB: `fn_periode_dari_tanggal(a.tgl_perolehan) <= p_periode` dievaluasi
-- PER BARIS, 218.251 kali. Fungsinya memang di-inline planner, tapi yang
-- di-inline itu `EXTRACT(year) || '-S' || CASE EXTRACT(month) <= 6 ...` —
-- tetap perakitan string per baris, dan hasilnya TAK BISA dipakai sbg index
-- condition karena ia ekspresi atas kolom, bukan kolomnya sendiri.
--
-- OBAT: bandingkan TANGGALNYA langsung. Keduanya setara PERSIS:
--   periode(tgl) <= 'YYYY-S1'  <=>  tgl <= YYYY-06-30
--   periode(tgl) <= 'YYYY-S2'  <=>  tgl <= YYYY-12-31
-- karena `periode` berbentuk 'YYYY-S1'/'YYYY-S2' sehingga urutan leksikografis
-- = urutan kronologis (dipakai juga oleh comparePeriode di lib/bmd.ts).
-- Batasnya dihitung SEKALI di plpgsql, lalu jadi perbandingan date biasa yang
-- murah & sargable.
--
-- ⚠️ Perubahan ini WAJIB mendarat di KEDUA fungsi. Klausa WHERE halaman & rekap
-- memang kembar (lihat peringatan di 20260814_06) — kalau cuma satu yang
-- disunting, jumlah di kaki tabel berhenti cocok dgn isi halamannya, tanpa
-- satu pun error.

-- ── Batas akhir periode, satu rumah ─────────────────────────────────────────
-- 'YYYY-S1' -> YYYY-06-30, 'YYYY-S2' -> YYYY-12-31.
CREATE OR REPLACE FUNCTION fn_akhir_periode(p_periode text)
RETURNS date
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE WHEN right(p_periode, 2) = 'S1'
              THEN make_date(left(p_periode, 4)::int, 6, 30)
              ELSE make_date(left(p_periode, 4)::int, 12, 31) END
$$;

REVOKE ALL ON FUNCTION fn_akhir_periode(text) FROM public;
GRANT EXECUTE ON FUNCTION fn_akhir_periode(text) TO authenticated;

-- ── Halaman ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_daftar_barang(
  p_periode text, p_skpd_ids bigint[] DEFAULT NULL, p_golongan text DEFAULT NULL,
  p_komptabel text DEFAULT NULL, p_search text DEFAULT NULL,
  p_limit integer DEFAULT 50, p_offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid, nibar text, kode_register text, kode text, nama_barang text,
  spesifikasi_lainnya text, alamat_detail text, merek_tipe text,
  nilai_perolehan numeric, tgl_perolehan date, intra_ekstra text,
  asal_usul text, cara_perolehan text, penggunaan_pengamanan text,
  keterangan text, status text, skpd_id bigint, owner_skpd bigint,
  luas numeric, nomor_dokumen_kepemilikan text, tanggal_dokumen_kepemilikan date,
  nama_dokumen_kepemilikan text, jenis_hak text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_lihat_semua boolean := fn_is_admin() OR fn_is_viewer();
  v_scope bigint[]; v_pernah uuid[];
  v_akhir date := fn_akhir_periode(p_periode);
BEGIN
  PERFORM fn_dbar_guard(p_skpd_ids, p_golongan);
  SELECT s.scope, s.pernah INTO v_scope, v_pernah FROM fn_dbar_scope(v_lihat_semua) s;

  RETURN QUERY
  WITH hidden AS MATERIALIZED (SELECT h.aset_id FROM fn_dbar_hidden(p_periode) h),
       ownr   AS MATERIALIZED (SELECT o.aset_id, o.owner_skpd FROM fn_dbar_owner(p_periode) o)
  SELECT
    a.id, a.nibar, a.kode_register, a.kode, a.nama_barang,
    a.spesifikasi_lainnya, a.alamat_detail, a.merek_tipe,
    a.nilai_perolehan, a.tgl_perolehan, a.intra_ekstra,
    a.asal_usul, a.cara_perolehan, a.penggunaan_pengamanan,
    a.keterangan, a.status, a.skpd_id,
    COALESCE(o.owner_skpd, a.skpd_id),
    a.luas, a.nomor_dokumen_kepemilikan, a.tanggal_dokumen_kepemilikan,
    a.nama_dokumen_kepemilikan, a.jenis_hak
  FROM aset a
  LEFT JOIN ownr o ON o.aset_id = a.id
  WHERE a.status <> 'draft'
    AND (p_golongan IS NULL OR p_golongan = '' OR a.golongan = p_golongan)
    AND (p_komptabel IS NULL OR p_komptabel = '' OR a.intra_ekstra = p_komptabel)
    AND (p_search IS NULL OR p_search = ''
         OR a.nama_barang ILIKE '%' || p_search || '%'
         OR a.nibar       ILIKE '%' || p_search || '%'
         OR a.kode        ILIKE p_search || '%')
    AND (v_lihat_semua OR a.skpd_id = ANY(v_scope) OR a.id = ANY(v_pernah))
    AND (p_skpd_ids IS NULL OR cardinality(p_skpd_ids) = 0
         OR COALESCE(o.owner_skpd, a.skpd_id) = ANY(p_skpd_ids))
    AND NOT EXISTS (SELECT 1 FROM hidden h WHERE h.aset_id = a.id)
    AND (a.tgl_perolehan IS NULL OR a.tgl_perolehan <= v_akhir)
  ORDER BY a.kode, a.nilai_perolehan DESC, a.id
  LIMIT p_limit OFFSET COALESCE(p_offset, 0);
END;
$function$;

-- ── Rekap ───────────────────────────────────────────────────────────────────
-- ⚠️⚠️ Klausa WHERE di bawah WAJIB SAMA PERSIS dgn fn_daftar_barang di atas.
CREATE OR REPLACE FUNCTION fn_daftar_barang_rekap(
  p_periode text, p_skpd_ids bigint[] DEFAULT NULL, p_golongan text DEFAULT NULL,
  p_komptabel text DEFAULT NULL, p_search text DEFAULT NULL
)
RETURNS TABLE (total_count bigint, grand_total numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_lihat_semua boolean := fn_is_admin() OR fn_is_viewer();
  v_scope bigint[]; v_pernah uuid[];
  v_akhir date := fn_akhir_periode(p_periode);
BEGIN
  PERFORM fn_dbar_guard(p_skpd_ids, p_golongan);
  SELECT s.scope, s.pernah INTO v_scope, v_pernah FROM fn_dbar_scope(v_lihat_semua) s;

  RETURN QUERY
  WITH hidden AS MATERIALIZED (SELECT h.aset_id FROM fn_dbar_hidden(p_periode) h),
       ownr   AS MATERIALIZED (SELECT o.aset_id, o.owner_skpd FROM fn_dbar_owner(p_periode) o)
  SELECT count(*)::bigint, COALESCE(sum(a.nilai_perolehan), 0)
  FROM aset a
  LEFT JOIN ownr o ON o.aset_id = a.id
  WHERE a.status <> 'draft'
    AND (p_golongan IS NULL OR p_golongan = '' OR a.golongan = p_golongan)
    AND (p_komptabel IS NULL OR p_komptabel = '' OR a.intra_ekstra = p_komptabel)
    AND (p_search IS NULL OR p_search = ''
         OR a.nama_barang ILIKE '%' || p_search || '%'
         OR a.nibar       ILIKE '%' || p_search || '%'
         OR a.kode        ILIKE p_search || '%')
    AND (v_lihat_semua OR a.skpd_id = ANY(v_scope) OR a.id = ANY(v_pernah))
    AND (p_skpd_ids IS NULL OR cardinality(p_skpd_ids) = 0
         OR COALESCE(o.owner_skpd, a.skpd_id) = ANY(p_skpd_ids))
    AND NOT EXISTS (SELECT 1 FROM hidden h WHERE h.aset_id = a.id)
    AND (a.tgl_perolehan IS NULL OR a.tgl_perolehan <= v_akhir);
END;
$function$;

-- ── PEMERIKSAAN SILANG (wajib sesudah migrasi ini) ──────────────────────────
-- (1) angka TIDAK BOLEH bergeser dari sebelum migrasi:
--       total_count 218.251 · grand_total 1.363.714.539.056,01  (2026-S1, 1.3.2)
--     — dua-duanya cocok dgn kartu Peralatan & Mesin di Dashboard.
-- (2) halaman & rekap harus sepakat:
--       SELECT (SELECT total_count FROM fn_daftar_barang_rekap('2026-S1', NULL, '1.3.2'))
--                AS dari_rekap,
--              (SELECT count(*) FROM fn_daftar_barang('2026-S1', NULL, '1.3.2',
--                                                     NULL, NULL, 1000000, 0)) AS dari_halaman;
