-- ============================================================================
-- 20260914_01 — Kotak Cari Daftar Barang diperluas + INDEX TRIGRAM
--
-- Permintaan user 2026-09-14: Cari di Daftar Barang bisa mencocokkan
-- nama barang · kode barang · NIBAR · no. polisi · no. rangka · no. mesin ·
-- alamat_detail · wilayah_kode · keterangan. Ditambah dua yang sejenis & murah:
-- kode_register (tercetak di label/KIR, sama pentingnya dgn NIBAR) & merek_tipe.
--
-- ⚠️ KENAPA BUTUH INDEX, DIUKUR (RLS aktif, pengurus Dinas Pendidikan, 1.3.2):
--   fn_daftar_barang 'honda'       : 2.107 ms (cache hangat) · 15.532 ms (dingin)
--   fn_daftar_barang_rekap 'honda' : 1.016 ms
--   tanpa kata kunci               :   398 ms /   302 ms
-- Pagu `authenticated` 8 dtk. `ILIKE '%x%'` tak bisa dilayani btree, jadi tiap
-- pencarian menyapu SELURUH golongan (218rb baris 1.3.2) — dan kata kunci yang
-- TIDAK ketemu adalah kasus TERBURUK (LIMIT tak pernah terpenuhi). Menambah enam
-- kolom tanpa index = memperparahnya.
--
-- OBAT:
-- (1) `fn_aset_teks_cari(...)` — SATU teks gabungan, IMMUTABLE & inlinable, jadi
--     index ekspresi & predikat di RPC dijamin sama bentuknya. Pemisah E'\x1f'
--     (bukan spasi) supaya kata kunci tak bisa "menyambung" dua kolom.
-- (2) GIN `gin_trgm_ops` di atas ekspresi itu → `ILIKE '%x%'` jadi index scan
--     (kata kunci ≥ 3 karakter; di bawahnya trigram tak menolong, sama saja
--     dgn hari ini).
-- (3) Predikat pencarian di KEDUA RPC diganti lewat regexp atas definisi yang
--     HIDUP, BUKAN menulis ulang badan fungsinya — fn_daftar_barang sudah dua
--     kali kehilangan CTE `kodereg` gara-gara dibuat ulang dari salinan basi
--     (lihat 20260913_01). Pola harus cocok TEPAT sekian kali, kalau tidak RAISE.
-- (4) `plan_cache_mode = force_custom_plan` di kedua RPC. Keduanya plpgsql, dan
--     sesudah 5 panggilan per koneksi (PostgREST memakai ulang koneksi) plpgsql
--     boleh pindah ke GENERIC plan — di situ `p_search IS NULL OR …` tak bisa
--     dilipat & index trigram DIABAIKAN DIAM-DIAM, balik ke 2 dtk tanpa error.
--
-- Kata kunci di-escape (`\`, `%`, `_`) supaya "AG_1021" tak jadi wildcard.
--
-- ⚠️ fn_penyusutan SENGAJA TIDAK disentuh (belum diminta). Predikatnya masih
--    bentuk lama.
-- ⚠️ CREATE INDEX (bukan CONCURRENTLY — SQL Editor membungkus transaksi)
--    MENGUNCI TULIS ke `aset` selama index dibangun. Jalankan di luar jam kerja.
-- ⚠️ Deploy-ordering: AMAN DUA ARAH (argumen & RETURNS tak berubah). Tapi kode
--    baru mengirim kata kunci yang kini juga dicocokkan ke kolom lain — tanpa
--    migrasi ini hasilnya cuma lebih sempit, tak rusak.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

-- ⚠️ KEMBAR dgn KOLOM_CARI di lib/cariBarang.ts (jalur PostgREST mentah:
--    Export Audit & barang yang sudah pindah SKPD). Dikunci lib/cariBarang.test.ts.
CREATE OR REPLACE FUNCTION public.fn_aset_teks_cari(
  p_nama text, p_kode text, p_nibar text, p_kode_register text, p_merek text,
  p_no_polisi text, p_no_rangka text, p_no_mesin text,
  p_alamat text, p_wilayah text, p_keterangan text
) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $$
  SELECT coalesce(p_nama, '')          || E'\x1f' || coalesce(p_kode, '')
    || E'\x1f' || coalesce(p_nibar, '')     || E'\x1f' || coalesce(p_kode_register, '')
    || E'\x1f' || coalesce(p_merek, '')     || E'\x1f' || coalesce(p_no_polisi, '')
    || E'\x1f' || coalesce(p_no_rangka, '') || E'\x1f' || coalesce(p_no_mesin, '')
    || E'\x1f' || coalesce(p_alamat, '')    || E'\x1f' || coalesce(p_wilayah, '')
    || E'\x1f' || coalesce(p_keterangan, '')
$$;

CREATE INDEX IF NOT EXISTS idx_aset_teks_cari_trgm ON public.aset USING gin (
  public.fn_aset_teks_cari(nama_barang, kode, nibar, kode_register, merek_tipe,
    no_polisi, no_rangka, no_mesin, alamat_detail, wilayah_kode, keterangan)
  extensions.gin_trgm_ops
);

DO $mig$
DECLARE
  v_pola constant text :=
    $re$OR a\.nama_barang\s+ILIKE\s+'%'\s*\|\|\s*p_search\s*\|\|\s*'%'\s+OR a\.nibar\s+ILIKE\s+'%'\s*\|\|\s*p_search\s*\|\|\s*'%'\s+OR a\.kode\s+ILIKE\s+p_search\s*\|\|\s*'%'\)$re$;
  v_ganti constant text :=
    $g$OR public.fn_aset_teks_cari(a.nama_barang, a.kode, a.nibar, a.kode_register, a.merek_tipe, a.no_polisi, a.no_rangka, a.no_mesin, a.alamat_detail, a.wilayah_kode, a.keterangan) ILIKE '%' || replace(replace(replace(p_search, '\', '\\'), '%', '\%'), '_', '\_') || '%')$g$;
  r record;
  v_def text;
  v_n int;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, x.harap
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
      JOIN (VALUES ('fn_daftar_barang', 2), ('fn_daftar_barang_rekap', 1)) x(nama, harap)
        ON x.nama = p.proname
  LOOP
    v_def := pg_get_functiondef(r.oid);
    SELECT count(*) INTO v_n FROM regexp_matches(v_def, v_pola, 'g');
    IF v_n <> r.harap THEN
      RAISE EXCEPTION '% : predikat cari lama ditemukan % kali (harap %). Definisi hidup berubah — periksa manual, JANGAN dipaksa.', r.proname, v_n, r.harap;
    END IF;
    -- Backslash di teks pengganti regexp_replace bermakna khusus (\1, \&) →
    -- digandakan dulu supaya escape `\%`/`\_` masuk ke badan fungsi apa adanya.
    EXECUTE regexp_replace(v_def, v_pola, replace(v_ganti, '\', '\\'), 'g');
    EXECUTE format('ALTER FUNCTION %s SET plan_cache_mode TO force_custom_plan', r.oid::regprocedure);
  END LOOP;

  -- Penjaga: dua fungsi harus terganti; kodereg tetap ada.
  IF (SELECT count(*) FROM pg_proc WHERE proname IN ('fn_daftar_barang','fn_daftar_barang_rekap')
        AND pg_get_functiondef(oid) LIKE '%fn_aset_teks_cari%') <> 2 THEN
    RAISE EXCEPTION 'predikat cari baru tidak terpasang di kedua RPC';
  END IF;
  IF (SELECT pg_get_functiondef(oid) NOT LIKE '%kodereg%' FROM pg_proc WHERE proname = 'fn_daftar_barang') THEN
    RAISE EXCEPTION 'fn_daftar_barang kehilangan CTE kodereg — batal';
  END IF;
END
$mig$;
