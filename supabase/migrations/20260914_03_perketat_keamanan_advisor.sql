-- 20260914_03_perketat_keamanan_advisor.sql
-- Menutup temuan Supabase Security Advisor (dicek 2026-09-14). Tak ada yang
-- level ERROR/kritis; ini pengetatan defense-in-depth, bukan tambal lubang
-- yang sudah bocor. Tiga kategori, TANPA mengubah satu pun logika fungsi:

-- =====================================================================
-- 1) function_search_path_mutable (24 fungsi) — ALTER FUNCTION SET saja,
--    BUKAN CREATE OR REPLACE, supaya badan fungsi & setelan lain (mis.
--    work_mem di fungsi rekap) tidak ikut tertimpa/hilang.
-- =====================================================================
ALTER FUNCTION public.fn_akhir_periode(p_periode text) SET search_path = public, pg_temp;
ALTER FUNCTION public.fn_aset_awal_2026_spek_only() SET search_path = public, pg_temp;
ALTER FUNCTION public.fn_aset_kode_register_immutable() SET search_path = public, pg_temp;
ALTER FUNCTION public.fn_aset_teks_cari(p_nama text, p_kode text, p_nibar text, p_kode_register text, p_merek text, p_no_polisi text, p_no_rangka text, p_no_mesin text, p_alamat text, p_wilayah text, p_keterangan text) SET search_path = public, pg_temp;
ALTER FUNCTION public.fn_cek_tahun_buku() SET search_path = public, pg_temp;
ALTER FUNCTION public.fn_dbar_guard(p_skpd_ids bigint[], p_golongan text) SET search_path = public, pg_temp;
ALTER FUNCTION public.fn_jurnal_header_approval_guard() SET search_path = public, pg_temp;
ALTER FUNCTION public.fn_jurnal_header_guard() SET search_path = public, pg_temp;
ALTER FUNCTION public.fn_jurnal_header_hapus_guard() SET search_path = public, pg_temp;
ALTER FUNCTION public.fn_periode_dari_tanggal(d date) SET search_path = public, pg_temp;
ALTER FUNCTION public.fn_prefix_kode_register(p_intra_ekstra text, p_kode_skpd text, p_tahun text, p_kode text) SET search_path = public, pg_temp;
ALTER FUNCTION public.fn_proyek_termin_guard() SET search_path = public, pg_temp;
ALTER FUNCTION public.fn_proyek_termin_no_delete_approved() SET search_path = public, pg_temp;
ALTER FUNCTION public.fn_rkbmd_item_lock() SET search_path = public, pg_temp;
ALTER FUNCTION public.fn_rkbmd_status_guard() SET search_path = public, pg_temp;
ALTER FUNCTION public.fn_set_updated_at() SET search_path = public, pg_temp;
ALTER FUNCTION public.fn_skpd_root(p_skpd_id bigint) SET search_path = public, pg_temp;
ALTER FUNCTION public.fn_skpd_set_path() SET search_path = public, pg_temp;
ALTER FUNCTION public.fn_standar_usulan_hapus_guard() SET search_path = public, pg_temp;
ALTER FUNCTION public.fn_standar_usulan_item_guard() SET search_path = public, pg_temp;
ALTER FUNCTION public.fn_standar_usulan_status_guard() SET search_path = public, pg_temp;
ALTER FUNCTION public.fn_tahun_buku_log_immutable() SET search_path = public, pg_temp;
ALTER FUNCTION public.fn_transaksi_bmd_immutable() SET search_path = public, pg_temp;
ALTER FUNCTION public.match_regulasi(query_embedding vector, match_threshold double precision, match_count integer) SET search_path = public, pg_temp;

-- =====================================================================
-- 2) anon/authenticated_security_definer_function_executable (50 fungsi)
--    REVOKE EXECUTE FROM PUBLIC — BUKAN cukup "FROM anon" saja (lihat
--    migrasi susulan 20260914_04 di bawah, itu pelajaran dari kesalahan
--    ronde pertama). `authenticated`/`service_role` TIDAK disentuh: mereka
--    punya grant EKSPLISIT sendiri di proacl, terpisah dari entri PUBLIC.
--    Diverifikasi dulu SEBELUM migrasi ini: fn_rekap_bmd (& pola yang sama
--    di fn_daftar_barang/fn_penyusutan/fn_dashboard_rekap/fn_rekon_pos) sudah
--    fail-closed utk anon (scope kosong -> 0 baris) — jadi ini lapis
--    pertahanan KEDUA, bukan tambal kebocoran yang terbukti aktif.
--    fn_counter_register_minimal sengaja tidak disebut di sini krn sudah
--    terkunci ke service_role saja sejak awal (tak pernah punya grant PUBLIC).
-- =====================================================================
REVOKE EXECUTE ON FUNCTION public.fn_admin_notes_isi() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_admin_notes_tandai(p_id uuid, p_selesai boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_alokasi_nomor_register(p_prefix38 text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_aset_awal_2026_terkunci(p_nibar text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_aset_awal_2026_terkunci_batch(p_nibars text[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_aset_kode_register_sync() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_aset_pernah_dikelola(p_aset_id uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_batal_pengalihan_barang(p_header_id uuid, p_aset_id uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_batal_seluruh_pengalihan(p_header_id uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_batal_setujui_usulan_pengurus(p_id uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_daftar_barang(p_periode text, p_skpd_ids bigint[], p_golongan text, p_komptabel text, p_search text, p_limit integer, p_offset integer, p_after_id uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_daftar_barang_rekap(p_periode text, p_skpd_ids bigint[], p_golongan text, p_komptabel text, p_search text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_dashboard_rekap() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_dbar_hidden(p_periode text, p_varian text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_dbar_kode_at(p_periode text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_dbar_kode_register_at(p_periode text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_dbar_owner(p_periode text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_dbar_scope(p_lihat_semua boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_ipa_role() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_is_admin() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_is_pengurus_barang_atas(p_skpd_id bigint) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_is_pengurus_barang_skpd_induk(p_skpd_id bigint) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_is_viewer() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_kembalikan_inventarisasi(p_id uuid, p_catatan text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_lra_belanja_modal(p_tahun integer, p_skpd_ids bigint[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_lra_realisasi_guard() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_my_pernah_dikelola_aset() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_my_skpd_ids() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_my_skpd_path() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_my_skpd_scope() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_penyusutan(p_periode text, p_skpd_ids bigint[], p_golongan text, p_komptabel text, p_search text, p_limit integer, p_offset integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_penyusutan_rekap(p_periode text, p_skpd_ids bigint[], p_golongan text, p_komptabel text, p_search text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_preview_tutup_tahun(p_tahun integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_rekap_bmd(p_periode text, p_skpd_ids bigint[], p_komptabel text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_rekap_saldo_awal(p_skpd_ids bigint[], p_komptabel text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_rekon_pos(p_periode text, p_skpd_ids bigint[], p_aset_ids uuid[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_rekon_rekap(p_periode_awal text, p_periode text, p_skpd_ids bigint[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_rkbmd_lampiran_batal() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_rkbmd_standar_simpan(p_jenis text, p_tahun integer, p_kode text, p_nama text, p_satuan text, p_harga numeric, p_tkdn numeric, p_keterangan text, p_rekening text[], p_skpd_id bigint, p_merk_tipe text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_setujui_usulan_pengurus(p_id uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_skpd_admin_induk() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_skpd_visible(p_skpd_id bigint) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_standar_usulan_buka_kunci(p_id uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_standar_usulan_setujui(p_id uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_terima_mutasi_internal(p_header_id uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_terima_pengalihan(p_header_id uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_tolak_mutasi_internal(p_header_id uuid, p_alasan text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_tolak_pengalihan(p_header_id uuid, p_alasan text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_tutup_tahun(p_tahun integer, p_catatan text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_validasi_inventarisasi(p_id uuid, p_catatan text) FROM PUBLIC;

-- =====================================================================
-- 3) rls_enabled_no_policy (13 tabel) — semuanya tabel SISA migrasi one-off
--    (staging import, backup sebelum hapus duplikat), BUKAN tabel aplikasi.
--    Sudah aman (RLS tanpa policy = tolak semua kecuali service_role);
--    ditambah policy admin-only supaya statusnya eksplisit & lolos linter,
--    BUKAN membuka akses baru untuk siapa pun.
-- =====================================================================
DO $$
DECLARE
  t text;
  tabel text[] := ARRAY[
    'aset_awal_2026_hapus_bendosari_20260816',
    'aset_awal_2026_hapus_duplikat_20260816',
    'backup_kdp_komptabel_20260805',
    'perbaikan_nibar_semen_20260816',
    'regulasi_chunks',
    'stg_bidang_tanah',
    'stg_dup_pariwisata',
    'stg_dup_pariwisata_snapshot',
    'stg_import_asetlain_ekstra',
    'stg_import_gb_ekstra',
    'stg_import_pm_ekstra',
    'stg_import_pm_ekstra_dinkes',
    'stg_import_pm_ekstra_disdag_pertanian'
  ];
BEGIN
  FOREACH t IN ARRAY tabel LOOP
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING ((select fn_is_admin()))',
      t || '_admin_select', t
    );
  END LOOP;
END $$;

-- =====================================================================
-- 4) Susulan: REVOKE ... FROM anon di atas TIDAK CUKUP untuk kelas ini.
--    Postgres otomatis GRANT EXECUTE ke pseudo-role PUBLIC saat fungsi
--    dibuat, dan `anon` di ke-50 fungsi ini cuma numpang lewat PUBLIC —
--    bukan grant langsung. REVOKE FROM PUBLIC di blok (2) di atas sudah
--    menutup ini SEKALIGUS (ditulis eksplisit di sini sbg jejak apa yang
--    sempat coba & terbukti kurang saat migrasi ini disusun).
-- =====================================================================

-- =====================================================================
-- 5) rls_auto_enable() — fungsi EVENT TRIGGER (RETURNS event_trigger) yang
--    otomatis nyalain RLS tiap CREATE TABLE baru di schema public (inilah
--    sebab ke-13 tabel di atas sudah RLS ON tanpa ada yang menyalakan
--    manual). Bukan fungsi yang dirancang dipanggil lewat REST API, tapi
--    kelewat di audit awal (namanya tak diawali fn_) & anon/authenticated
--    punya grant EKSPLISIT (bukan cuma numpang PUBLIC). Dipanggil di luar
--    konteks event trigger-nya akan gagal sendiri, tapi tetap ditutup
--    sebagai kebersihan & defense-in-depth.
-- =====================================================================
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated;

-- ⛔ SENGAJA TIDAK disentuh migrasi ini:
--   - extension_in_public (vector, ltree di schema public): memindah schema
--     extension di database LIVE berisiko merusak query yang mengandalkan
--     operator/type-nya tanpa qualifikasi schema (ltree dipakai `admin_skpd
--     .path` & fungsi fn_my_skpd_path dkk; vector dipakai fn match_regulasi).
--     Nilai keamanannya kecil (bukan lubang akses, cuma kerapian namespace)
--     dibanding risiko breaking change tanpa staging environment utk diuji.
--   - auth_leaked_password_protection: toggle di Supabase Dashboard →
--     Authentication → Policies/Providers, bukan perubahan skema/SQL.
