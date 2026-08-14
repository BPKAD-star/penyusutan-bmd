-- 20260814_08_daftar_barang_filter_skpd.sql
-- PERBAIKAN: memilih SATU SKPD + satu jenis aset kena statement timeout.
--
-- ═══ SEBAB ═════════════════════════════════════════════════════════════════
-- Filter SKPD di 20260814_05..07 ditulis atas pemilik-pada-periode:
--     COALESCE(o.owner_skpd, a.skpd_id) = ANY(p_skpd_ids)
-- Nilai itu baru ada SESUDAH LEFT JOIN ke fn_dbar_owner, jadi ia tak bisa jadi
-- index condition — `idx_aset_skpd_urut` tak terpakai sama sekali. Planner
-- terpaksa menyusuri SELURUH golongan (218.251 baris 1.3.2) dalam urutan kode,
-- menyaring satu per satu, sampai terkumpul 50 baris milik SKPD itu. Untuk SKPD
-- yang barangnya sedikit & tersebar di rentang kode, itu berarti nyaris seluruh
-- golongan dibaca -> timeout 8 dtk.
--
-- Ironisnya ini kebalikan dari mode se-kabupaten: di sana TANPA filter SKPD
-- justru cepat (126 ms), karena 50 baris pertama langsung ketemu.
--
-- ═══ OBAT ══════════════════════════════════════════════════════════════════
-- Pemilik-pada-periode itu SAMA DENGAN `a.skpd_id` untuk hampir semua barang —
-- yang berbeda hanya yang pernah berpindah unit: 57 aset se-produksi (2026-S2).
-- Jadi syaratnya dipecah dua, dan yang besar dikembalikan ke kolom terindeks:
--
--   (a) a.skpd_id ∈ scope DAN aset ini TIDAK punya override   -> lewat index
--   (b) aset ini PUNYA override yang jatuh di dalam scope      -> daftar id kecil
--
-- Gabungan (a) OR (b) setara PERSIS dengan COALESCE(...) = ANY(...):
--   * tanpa override  -> efektif = a.skpd_id, ditangani (a)
--   * dengan override -> efektif = owner_skpd, ditangani (b); (a) sengaja
--     mengecualikannya lewat NOT (a.id = ANY(v_ovr_all)) supaya barang yang
--     SUDAH PINDAH KELUAR tidak ikut terbawa hanya karena skpd_id-nya masih
--     menunjuk ke sana.
--
-- Kedua array dihitung SEKALI di plpgsql dari fn_dbar_owner (57 baris), jadi
-- ongkosnya nihil.
--
-- ⚠️ Perubahan ini WAJIB mendarat di KEDUA fungsi — klausa WHERE halaman &
-- rekap memang kembar. Kalau cuma satu yang disunting, jumlah di kaki tabel
-- berhenti cocok dgn isi halamannya, tanpa satu pun error. Pemeriksaan
-- silangnya ada di kaki berkas ini.

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
  v_ovr_all uuid[];  -- semua aset yang pemilik-pada-periodenya BEDA dari skpd_id-nya
  v_ovr_in  uuid[];  -- di antaranya, yang pemiliknya jatuh di dalam scope
BEGIN
  PERFORM fn_dbar_guard(p_skpd_ids, p_golongan);
  SELECT s.scope, s.pernah INTO v_scope, v_pernah FROM fn_dbar_scope(v_lihat_semua) s;

  SELECT COALESCE(array_agg(o.aset_id), ARRAY[]::uuid[]),
         COALESCE(array_agg(o.aset_id) FILTER (WHERE o.owner_skpd = ANY(p_skpd_ids)), ARRAY[]::uuid[])
    INTO v_ovr_all, v_ovr_in
    FROM fn_dbar_owner(p_periode) o;

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
         OR (a.skpd_id = ANY(p_skpd_ids) AND NOT (a.id = ANY(v_ovr_all)))
         OR a.id = ANY(v_ovr_in))
    AND NOT EXISTS (SELECT 1 FROM hidden h WHERE h.aset_id = a.id)
    AND (a.tgl_perolehan IS NULL OR a.tgl_perolehan <= v_akhir)
  ORDER BY a.kode, a.nilai_perolehan DESC, a.id
  LIMIT p_limit OFFSET COALESCE(p_offset, 0);
END;
$function$;

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
  v_ovr_all uuid[]; v_ovr_in uuid[];
BEGIN
  PERFORM fn_dbar_guard(p_skpd_ids, p_golongan);
  SELECT s.scope, s.pernah INTO v_scope, v_pernah FROM fn_dbar_scope(v_lihat_semua) s;

  SELECT COALESCE(array_agg(o.aset_id), ARRAY[]::uuid[]),
         COALESCE(array_agg(o.aset_id) FILTER (WHERE o.owner_skpd = ANY(p_skpd_ids)), ARRAY[]::uuid[])
    INTO v_ovr_all, v_ovr_in
    FROM fn_dbar_owner(p_periode) o;

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
         OR (a.skpd_id = ANY(p_skpd_ids) AND NOT (a.id = ANY(v_ovr_all)))
         OR a.id = ANY(v_ovr_in))
    AND NOT EXISTS (SELECT 1 FROM hidden h WHERE h.aset_id = a.id)
    AND (a.tgl_perolehan IS NULL OR a.tgl_perolehan <= v_akhir);
END;
$function$;

-- ── PEMERIKSAAN SILANG (wajib sesudah migrasi ini) ──────────────────────────
-- (1) Mode se-kabupaten TIDAK BOLEH bergeser:
--       SELECT * FROM fn_daftar_barang_rekap('2026-S1', NULL, '1.3.2');
--       -> harus tetap 218.251 · 1.363.714.539.056,01
-- (2) Mode satu SKPD harus cepat DAN sepakat antara halaman & rekap:
--       SELECT (SELECT total_count FROM fn_daftar_barang_rekap('2026-S2', ARRAY[28]::bigint[], '1.3.2'))
--                AS dari_rekap,
--              (SELECT count(*) FROM fn_daftar_barang('2026-S2', ARRAY[28]::bigint[], '1.3.2',
--                                                     NULL, NULL, 1000000, 0)) AS dari_halaman;
