-- 20260921_01 — Penyusutan: Cari tidak lagi membuat rekap timeout.
--
-- Gejala produksi 2026-09-21: Penyusutan 2026-S1, Peralatan & Mesin,
-- Intrakomptabel, Cari "1.3.2.02.01" → `fn_penyusutan_rekap` 57014
-- (statement timeout). Daftar halaman bisa selesai karena LIMIT 100, tetapi
-- rekap wajib menyapu SEMUA hasil sehingga gagal; UI lalu fail-closed dan
-- mengosongkan daftar, sesuai rules.md §2.
--
-- Sebabnya sama dengan Daftar Barang sebelum 20260914_01: tiga ILIKE lama
-- (`nama_barang`/`nibar`/`kode`) membuat planner menyaring satu golongan besar
-- baris demi baris. `idx_aset_teks_cari_trgm` + `fn_aset_teks_cari` sudah
-- tersedia dari 20260914_01, tetapi ketika itu Penyusutan sengaja belum ikut
-- diubah. Kini kedua RPC Penyusutan memakai ekspresi dan indeks yang SAMA.
--
-- ⚠️ JANGAN menyalin ulang badan fn_penyusutan/fn_penyusutan_rekap di sini.
-- Kedua fungsi Lapis 1 memuat replay visibilitas/pemilik period-aware dan
-- sudah beberapa kali berubah. Patch hanya predikat cari dari DEFINISI HIDUP,
-- dengan jumlah kecocokan ketat; bila bentuknya berubah, migrasi GAGAL KERAS
-- daripada menimpa perbaikan lain dengan salinan basi.
--
-- ⚠️ CREATE OR REPLACE menghapus konfigurasi ALTER FUNCTION. Maka search_path,
-- work_mem rekap, dan custom plan DITULIS ULANG setelah patch. `work_mem` tetap
-- 64MB, jangan dinaikkan (rules.md §4; 64MB per node per koneksi).
--
-- Prasyarat: 20260914_01_daftar_barang_cari_luas.sql sudah dijalankan dulu
-- (urut nama migrasi memang menjaminnya). Indeks dibuat PLAIN oleh migrasi itu
-- sehingga jangan menjalankan keduanya di jam sibuk.

DO $mig$
DECLARE
  v_pola constant text :=
    $re$OR a\.nama_barang\s+ILIKE\s+'%'\s*\|\|\s*p_search\s*\|\|\s*'%'\s+OR a\.nibar\s+ILIKE\s+'%'\s*\|\|\s*p_search\s*\|\|\s*'%'\s+OR a\.kode\s+ILIKE\s+p_search\s*\|\|\s*'%')$re$;
  v_ganti constant text :=
    $g$OR public.fn_aset_teks_cari(a.nama_barang, a.kode, a.nibar, a.kode_register, a.merek_tipe, a.no_polisi, a.no_rangka, a.no_mesin, a.alamat_detail, a.wilayah_kode, a.keterangan) ILIKE '%' || replace(replace(replace(p_search, '\', '\\'), '%', '\%'), '_', '\_') || '%')$g$;
  r record;
  v_def text;
  v_n integer;
BEGIN
  IF to_regclass('public.idx_aset_teks_cari_trgm') IS NULL
     OR NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'fn_aset_teks_cari') THEN
    RAISE EXCEPTION
      'Migrasi 20260914_01 belum lengkap: fn_aset_teks_cari / idx_aset_teks_cari_trgm tidak ditemukan. Jalankan 20260914_01_daftar_barang_cari_luas.sql lebih dulu.';
  END IF;

  FOR r IN
    SELECT p.oid, p.proname, x.harap
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
      JOIN (VALUES ('fn_penyusutan', 1), ('fn_penyusutan_rekap', 1)) x(nama, harap)
        ON x.nama = p.proname
  LOOP
    v_def := pg_get_functiondef(r.oid);
    SELECT count(*) INTO v_n FROM regexp_matches(v_def, v_pola, 'g');
    IF v_n <> r.harap THEN
      RAISE EXCEPTION '%: predikat Cari lama ditemukan % kali (harap %). Definisi hidup berubah — periksa manual, jangan dipaksa.', r.proname, v_n, r.harap;
    END IF;

    -- Backslash di pengganti regexp bermakna khusus; gandakan agar escape
    -- literal untuk %, _, dan \ tetap masuk ke badan fungsi yang baru.
    EXECUTE regexp_replace(v_def, v_pola, replace(v_ganti, '\', '\\'), 'g');
  END LOOP;

  -- Keduanya dipakai berulang dalam koneksi PostgREST. Generic plan tidak bisa
  -- melipat `p_search IS NULL OR …`, lalu GIN trigram diabaikan diam-diam.
  ALTER FUNCTION public.fn_penyusutan(text, bigint[], text, text, text, integer, integer)
    SET search_path TO public;
  ALTER FUNCTION public.fn_penyusutan(text, bigint[], text, text, text, integer, integer)
    SET plan_cache_mode TO force_custom_plan;

  ALTER FUNCTION public.fn_penyusutan_rekap(text, bigint[], text, text, text)
    SET search_path TO public;
  ALTER FUNCTION public.fn_penyusutan_rekap(text, bigint[], text, text, text)
    SET work_mem TO '64MB';
  ALTER FUNCTION public.fn_penyusutan_rekap(text, bigint[], text, text, text)
    SET plan_cache_mode TO force_custom_plan;

  -- Verifikasi eksekusi, bukan sekadar percaya pada regexp_replace.
  IF (SELECT count(*) FROM pg_proc p
      WHERE p.proname IN ('fn_penyusutan', 'fn_penyusutan_rekap')
        AND pg_get_functiondef(p.oid) LIKE '%fn_aset_teks_cari%') <> 2 THEN
    RAISE EXCEPTION 'predikat Cari trigram tidak terpasang pada kedua RPC Penyusutan';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.proname = 'fn_penyusutan_rekap'
      AND NOT (COALESCE(p.proconfig, ARRAY[]::text[]) @> ARRAY[
        'search_path=public', 'work_mem=64MB', 'plan_cache_mode=force_custom_plan'
      ])
  ) THEN
    RAISE EXCEPTION 'konfigurasi fn_penyusutan_rekap tidak pulih lengkap sesudah CREATE OR REPLACE';
  END IF;
END
$mig$;
