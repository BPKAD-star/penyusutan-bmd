-- LKI disesuaikan dgn matriks kebutuhan data per jenis aset (keputusan user
-- 2026-09-25, berkas "Alur Inventarisasi.xlsx"). Checklist baru yang "narik
-- daftar barang live" butuh nilai TERCATAT-nya di snapshot, dan lima di
-- antaranya belum pernah dibawa: No. BPKB, Luas, Wilayah (Prov/Kab/Kec/Desa),
-- Keterangan, & Foto. Tanpa itu kotak "Tercatat" di form cuma menampilkan "—"
-- & petugas tak punya pembanding untuk menilai Sesuai/Tidak Sesuai.
--
-- Pola & alasan sama dgn 20260924_04 (titik koordinat):
--  1. fn_inventarisasi_snapshot — RETURNS jsonb → CREATE OR REPLACE cukup.
--  2. fn_inventarisasi_lembar — RETURNS TABLE berubah bentuk → WAJIB DROP dulu,
--     GRANT & SET (search_path, plan_cache_mode) ditulis ulang.
--  fn_inventarisasi_hasil TIDAK disentuh: ia mengembalikan `h.snapshot` apa
--  adanya, jadi isian BARU otomatis membawa kunci-kunci baru ini.
--
-- `wilayah` = rantai nama (Desa, Kec., Kabupaten; provinsi dibuang — pola
-- Daftar Barang Awal) lewat `fn_wilayah_label`, supaya kotak "Tercatat" bisa
-- dibaca manusia. `wilayah_kode` tetap ikut: itu yang dibandingkan.
--
-- Isian LAMA tak retroaktif — snapshot dibekukan saat disimpan, bukan
-- dihitung ulang (prinsip yang sudah berlaku di modul ini).

CREATE OR REPLACE FUNCTION public.fn_wilayah_label(p_kode text)
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  WITH RECURSIVE r AS (
    SELECT kode, nama, level, parent_kode FROM admin_wilayah WHERE kode = p_kode
    UNION ALL
    SELECT w.kode, w.nama, w.level, w.parent_kode
    FROM admin_wilayah w JOIN r ON w.kode = r.parent_kode
    WHERE r.level > 1
  )
  SELECT string_agg(CASE WHEN level = 3 THEN 'Kec. ' || nama ELSE nama END, ', ' ORDER BY level DESC)
  FROM r WHERE level > 1
$function$;

REVOKE ALL ON FUNCTION public.fn_wilayah_label(text) FROM public;
GRANT EXECUTE ON FUNCTION public.fn_wilayah_label(text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.fn_inventarisasi_snapshot(p_aset_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object(
    'nibar', a.nibar, 'kode_register', a.kode_register, 'kode', a.kode,
    'uraian_barang', COALESCE(k.uraian, a.uraian_barang),
    'nama_barang', a.nama_barang, 'spesifikasi_lainnya', a.spesifikasi_lainnya,
    'merek_tipe', a.merek_tipe, 'jumlah', a.jumlah, 'satuan', a.satuan,
    'nilai_perolehan', a.nilai_perolehan, 'alamat', a.alamat_detail,
    'kondisi', a.kondisi_barang, 'tgl_perolehan', a.tgl_perolehan,
    'no_polisi', a.no_polisi, 'no_rangka', a.no_rangka, 'no_mesin', a.no_mesin,
    'no_bpkb', a.no_bpkb, 'luas', a.luas,
    'wilayah_kode', a.wilayah_kode, 'wilayah', fn_wilayah_label(a.wilayah_kode),
    'keterangan', a.keterangan, 'foto_paths', COALESCE(to_jsonb(a.foto_paths), '[]'::jsonb),
    'latitude', a.latitude, 'longitude', a.longitude,
    'skpd_id', a.skpd_id)
  FROM aset a LEFT JOIN admin_kodefikasi_bmd k ON k.kode = a.kode
  WHERE a.id = p_aset_id
$function$;

DROP FUNCTION public.fn_inventarisasi_lembar(text, bigint[], text, text, integer, integer);

CREATE FUNCTION public.fn_inventarisasi_lembar(
  p_golongan text, p_skpd_ids bigint[] DEFAULT NULL::bigint[], p_status text DEFAULT NULL::text,
  p_cari text DEFAULT NULL::text, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS TABLE(aset_id uuid, nibar text, kode_register text, kode text, uraian text, nama_barang text,
   spesifikasi_lainnya text, merek_tipe text, jumlah numeric, satuan text, nilai_perolehan numeric,
   tgl_perolehan date, kondisi_barang text, alamat_detail text, latitude numeric, longitude numeric,
   no_polisi text, no_rangka text, no_mesin text, skpd_id bigint, skpd_nama text, inv_id uuid,
   inv_status text, inv_catatan text, inv_diisi_at timestamp with time zone, transaksi_sesudah jsonb,
   no_bpkb text, luas numeric, wilayah_kode text, wilayah text, keterangan text, foto_paths text[])
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET plan_cache_mode TO 'force_custom_plan'
AS $function$
DECLARE
  v_tahun int := extract(year FROM current_date)::int;
  v_lihat_semua boolean := fn_is_admin() OR fn_is_viewer();
  v_scope bigint[];
  v_pola text;
BEGIN
  IF p_golongan IS NULL OR p_golongan = '' THEN
    RAISE EXCEPTION 'Jenis aset wajib dipilih.';
  END IF;
  IF NOT v_lihat_semua THEN
    v_scope := COALESCE(fn_my_skpd_scope(), ARRAY[]::bigint[]);
  END IF;
  IF p_skpd_ids IS NOT NULL AND cardinality(p_skpd_ids) = 0 THEN p_skpd_ids := NULL; END IF;
  IF p_cari IS NOT NULL AND btrim(p_cari) <> '' THEN
    v_pola := '%' || replace(replace(replace(btrim(p_cari), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  END IF;

  IF p_status IN ('diisi', 'divalidasi', 'sudah') THEN
    RETURN QUERY
    WITH hal AS (
      SELECT a.id, a.nibar, a.kode_register, a.kode, a.uraian_barang, a.nama_barang,
             a.spesifikasi_lainnya, a.merek_tipe, a.jumlah, a.satuan, a.nilai_perolehan,
             a.tgl_perolehan, a.kondisi_barang, a.alamat_detail, a.latitude, a.longitude,
             a.no_polisi, a.no_rangka, a.no_mesin, a.skpd_id,
             a.no_bpkb, a.luas, a.wilayah_kode, a.keterangan, a.foto_paths,
             ib.id AS ib_id, ib.status AS ib_status, ib.catatan_validator AS ib_catatan,
             ib.diisi_at AS ib_diisi_at, ib.trx_id_terakhir AS ib_trx
      FROM inventarisasi_barang ib
      JOIN aset a ON a.id = ib.aset_id
      WHERE ib.tahun = v_tahun AND ib.golongan = p_golongan AND ib.aset_id IS NOT NULL
        AND (p_status = 'sudah' OR ib.status = p_status)
        AND a.status = 'aktif' AND a.skpd_id = ib.skpd_id AND a.golongan = ib.golongan
        AND (p_skpd_ids IS NULL OR ib.skpd_id = ANY(p_skpd_ids))
        AND (v_lihat_semua OR ib.skpd_id = ANY(v_scope))
        AND (v_pola IS NULL OR fn_aset_teks_cari(a.nama_barang, a.kode, a.nibar, a.kode_register,
               a.merek_tipe, a.no_polisi, a.no_rangka, a.no_mesin, a.alamat_detail,
               a.wilayah_kode, a.keterangan) ILIKE v_pola)
      ORDER BY a.kode, a.nilai_perolehan DESC, a.id
      LIMIT p_limit OFFSET p_offset
    )
    SELECT h.id, h.nibar, h.kode_register, h.kode, COALESCE(k.uraian, h.uraian_barang),
           h.nama_barang, h.spesifikasi_lainnya, h.merek_tipe, h.jumlah, h.satuan,
           h.nilai_perolehan, h.tgl_perolehan, h.kondisi_barang, h.alamat_detail,
           h.latitude, h.longitude,
           h.no_polisi, h.no_rangka, h.no_mesin, h.skpd_id, s.nama,
           h.ib_id, h.ib_status, h.ib_catatan, h.ib_diisi_at,
           fn_inventarisasi_transaksi_sesudah(h.id, h.ib_trx),
           h.no_bpkb, h.luas, h.wilayah_kode, fn_wilayah_label(h.wilayah_kode), h.keterangan, h.foto_paths
    FROM hal h
    LEFT JOIN admin_kodefikasi_bmd k ON k.kode = h.kode
    LEFT JOIN admin_skpd s ON s.id = h.skpd_id
    ORDER BY h.kode, h.nilai_perolehan DESC, h.id;
    RETURN;
  END IF;

  RETURN QUERY
  WITH hal AS (
    SELECT a.id, a.nibar, a.kode_register, a.kode, a.uraian_barang, a.nama_barang,
           a.spesifikasi_lainnya, a.merek_tipe, a.jumlah, a.satuan, a.nilai_perolehan,
           a.tgl_perolehan, a.kondisi_barang, a.alamat_detail, a.latitude, a.longitude,
           a.no_polisi, a.no_rangka, a.no_mesin, a.skpd_id,
           a.no_bpkb, a.luas, a.wilayah_kode, a.keterangan, a.foto_paths,
           ib.id AS ib_id, ib.status AS ib_status, ib.catatan_validator AS ib_catatan,
           ib.diisi_at AS ib_diisi_at, ib.trx_id_terakhir AS ib_trx
    FROM aset a
    LEFT JOIN inventarisasi_barang ib
      ON ib.aset_id = a.id AND ib.tahun = v_tahun
     AND ib.skpd_id = a.skpd_id AND ib.golongan = a.golongan
    WHERE a.status <> 'draft' AND a.status = 'aktif' AND a.golongan = p_golongan
      AND (p_skpd_ids IS NULL OR a.skpd_id = ANY(p_skpd_ids))
      AND (v_lihat_semua OR a.skpd_id = ANY(v_scope))
      AND (p_status IS DISTINCT FROM 'belum' OR ib.id IS NULL)
      AND (v_pola IS NULL OR fn_aset_teks_cari(a.nama_barang, a.kode, a.nibar, a.kode_register,
             a.merek_tipe, a.no_polisi, a.no_rangka, a.no_mesin, a.alamat_detail,
             a.wilayah_kode, a.keterangan) ILIKE v_pola)
    ORDER BY a.kode, a.nilai_perolehan DESC, a.id
    LIMIT p_limit OFFSET p_offset
  )
  SELECT h.id, h.nibar, h.kode_register, h.kode, COALESCE(k.uraian, h.uraian_barang),
         h.nama_barang, h.spesifikasi_lainnya, h.merek_tipe, h.jumlah, h.satuan,
         h.nilai_perolehan, h.tgl_perolehan, h.kondisi_barang, h.alamat_detail,
         h.latitude, h.longitude,
         h.no_polisi, h.no_rangka, h.no_mesin, h.skpd_id, s.nama,
         h.ib_id, h.ib_status, h.ib_catatan, h.ib_diisi_at,
         CASE WHEN h.ib_id IS NULL THEN '[]'::jsonb
              ELSE fn_inventarisasi_transaksi_sesudah(h.id, h.ib_trx) END,
         h.no_bpkb, h.luas, h.wilayah_kode, fn_wilayah_label(h.wilayah_kode), h.keterangan, h.foto_paths
  FROM hal h
  LEFT JOIN admin_kodefikasi_bmd k ON k.kode = h.kode
  LEFT JOIN admin_skpd s ON s.id = h.skpd_id
  ORDER BY h.kode, h.nilai_perolehan DESC, h.id;
END $function$;

GRANT EXECUTE ON FUNCTION public.fn_inventarisasi_lembar(text, bigint[], text, text, integer, integer)
  TO anon, authenticated, service_role;
