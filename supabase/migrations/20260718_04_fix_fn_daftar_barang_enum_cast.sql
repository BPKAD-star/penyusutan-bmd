-- ============================================================================
-- FIX: fn_daftar_barang() — transaksi_bmd.jenis adalah ENUM (jenis_transaksi_bmd),
-- BUKAN text (2026-07-18). Lupa ke-cek pas nulis 20260718_03.
--
-- ERROR yg muncul saat verifikasi manual: `42883: operator does not exist:
-- jenis_transaksi_bmd = text`. Sebabnya: `ARRAY['a','b','c']` (literal ganda)
-- otomatis di-resolve Postgres jadi text[] SEBELUM dibandingkan — beda dari
-- `kolom = 'satu-literal'` (unknown-type literal, biasanya auto-cast sukses
-- ke tipe enum lawan). Jadi `t.jenis = ANY(array_text[])` gagal, padahal
-- `t.jenis = 'pengalihan_status'` kemungkinan tetap lolos.
--
-- FIX: cast eksplisit `t.jenis::text` di semua pemakaian ANY(text[]) —
-- konsisten di seluruh perbandingan biar tidak ambigu lagi ke depannya.
-- Fungsi lain yg PERNAH ditulis session ini (fn_dashboard_rekap,
-- fn_rekap_saldo_awal, fn_rekap_bmd) TIDAK kena bug ini — keduanya tidak
-- pernah bandingkan kolom `jenis` sama sekali (cuma agregasi nilai/kode).
-- ============================================================================

CREATE OR REPLACE FUNCTION fn_daftar_barang(
  p_golongan   text,
  p_periode    text,
  p_skpd_ids   bigint[] DEFAULT NULL,
  p_komptabel  text     DEFAULT NULL,
  p_search     text     DEFAULT NULL,
  p_limit      int      DEFAULT 50,
  p_offset     int      DEFAULT 0
)
RETURNS TABLE (
  id uuid, nibar text, kode text, nama_barang text, spesifikasi_lainnya text,
  merek_tipe text, nilai_perolehan numeric, tgl_perolehan date, intra_ekstra text,
  keterangan text, status text, skpd_id bigint, owner_skpd bigint, luas numeric,
  nomor_dokumen_kepemilikan text, tanggal_dokumen_kepemilikan date,
  nama_dokumen_kepemilikan text, jenis_hak text,
  total_count bigint, grand_total numeric
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_is_admin boolean := fn_is_admin();
  v_sembunyi text[] := ARRAY['kapitalisasi_serap','penghapusan_pemindahtanganan',
    'penghapusan_sebab_lain','batal_pengadaan','koreksi_pencatatan_ganda',
    'batal_hibah_masuk','batal_tukar_menukar','batal_hasil_inventarisasi',
    'batal_perolehan_lainnya','kdp_selesai_keluar','pemecahan_keluar','batal_pemecahan_masuk'];
  v_muncul   text[] := ARRAY['batal_kapitalisasi','batal_penghapusan','batal_pemecahan'];
BEGIN
  RETURN QUERY
  WITH
  owner_at AS (
    SELECT t.aset_id,
      COALESCE(
        (array_agg(t.skpd_tujuan ORDER BY t.periode DESC, t.id DESC)
           FILTER (WHERE t.periode <= p_periode))[1],
        (array_agg(t.skpd_asal ORDER BY t.periode ASC, t.id ASC))[1]
      ) AS owner_skpd
    FROM transaksi_bmd t
    WHERE t.jenis::text = 'pengalihan_status'
    GROUP BY t.aset_id
  ),
  hidden AS (
    SELECT x.aset_id FROM (
      SELECT DISTINCT ON (t.aset_id) t.aset_id, t.jenis::text AS jenis
      FROM transaksi_bmd t
      WHERE t.jenis::text = ANY(v_sembunyi || v_muncul)
        AND t.periode <= p_periode
      ORDER BY t.aset_id, t.periode DESC, t.id DESC
    ) x
    WHERE x.jenis = ANY(v_sembunyi)
  ),
  cand AS (
    SELECT
      a.id, a.nibar, a.kode, a.nama_barang, a.spesifikasi_lainnya, a.merek_tipe,
      a.nilai_perolehan, a.tgl_perolehan, a.intra_ekstra, a.keterangan, a.status,
      a.skpd_id, COALESCE(oa.owner_skpd, a.skpd_id) AS eff_owner,
      a.luas, a.nomor_dokumen_kepemilikan, a.tanggal_dokumen_kepemilikan,
      a.nama_dokumen_kepemilikan, a.jenis_hak
    FROM aset a
    LEFT JOIN owner_at oa ON oa.aset_id = a.id
    WHERE a.status <> 'draft'
      AND a.kode LIKE p_golongan || '.%'
      AND (p_komptabel IS NULL OR p_komptabel = '' OR a.intra_ekstra = p_komptabel)
      AND (p_search IS NULL OR p_search = '' OR
           a.nama_barang ILIKE '%'||p_search||'%' OR a.nibar ILIKE '%'||p_search||'%'
           OR a.kode ILIKE p_search||'%')
      AND (v_is_admin OR fn_skpd_visible(a.skpd_id) OR fn_aset_pernah_dikelola(a.id))
  ),
  visible AS (
    SELECT * FROM cand c
    WHERE (p_skpd_ids IS NULL OR c.eff_owner = ANY(p_skpd_ids))
      AND NOT EXISTS (SELECT 1 FROM hidden h WHERE h.aset_id = c.id)
      AND (c.tgl_perolehan IS NULL
           OR fn_periode_dari_tanggal(c.tgl_perolehan) <= p_periode)
  )
  SELECT
    v.id, v.nibar, v.kode, v.nama_barang, v.spesifikasi_lainnya, v.merek_tipe,
    v.nilai_perolehan, v.tgl_perolehan, v.intra_ekstra, v.keterangan, v.status,
    v.skpd_id, v.eff_owner AS owner_skpd, v.luas, v.nomor_dokumen_kepemilikan,
    v.tanggal_dokumen_kepemilikan, v.nama_dokumen_kepemilikan, v.jenis_hak,
    count(*) OVER()::bigint AS total_count,
    COALESCE(sum(v.nilai_perolehan) OVER(), 0) AS grand_total
  FROM visible v
  ORDER BY v.nilai_perolehan DESC NULLS LAST, v.id
  LIMIT p_limit OFFSET COALESCE(p_offset, 0);
END;
$$;
