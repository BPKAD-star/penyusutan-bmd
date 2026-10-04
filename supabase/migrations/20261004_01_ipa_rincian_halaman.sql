-- ============================================================================
-- 20261004_01 — Rincian indikator IPA: filter jenis aset, status, cari, &
-- PAGINASI di server (`fn_ipa_rincian_halaman`).
--
-- Permintaan user 2026-10-04: pop-up "Kelengkapan Data Administrasi" BKAD
-- menampilkan "Semua (1.000)" padahal BKAD punya 1.296 barang aktif.
--
-- ⚠️ SEBAB: terpotong DIAM-DIAM di 1.000 baris. Klien meminta p_limit 2000
-- (ambang peringatan "terpotong" pun 2000), tetapi hasil RPC bertabel dibatasi
-- 1.000 baris oleh PostgREST (max_rows). Karena ambang peringatannya 2000, tak
-- satu pun peringatan tampil — dan karena daftar diurut "perlu ditindaklanjuti"
-- lebih dulu, tab "Sudah terpenuhi" bisa tampil 0 padahal ada ratusan barang
-- lengkap yang terpotong.
--
-- Tak bisa ditambal dengan menaikkan angka: SKPD terbesar IPA (RSUD) punya
-- 23.214 barang aktif (diukur 2026-10-04). Jadi penyaringan, penghitungan, dan
-- pemotongan halaman dikerjakan di SERVER; klien cuma menerima SATU halaman.
--
-- Bentuk: fungsi pembungkus yang mengembalikan SATU jsonb (jsonb bukan
-- set-returning, jadi tidak kena batas max_rows):
--   { rows:[{keadaan,judul,sub,ket,nilai,nibar,uraian}], total, n:{kurang,ok,
--     semua}, golongan:[{kode,n}] }
--   · n        — jumlah per keadaan SETELAH filter jenis aset & cari
--   · total    — jumlah baris untuk keadaan yang dipilih (dasar halaman)
--   · golongan — jenis aset yang ada, dihitung setelah filter cari (SEBELUM
--                filter jenis aset, supaya pilihan lain tidak ikut lenyap)
--
-- Kode barang dikenali dari pola di kolom `o_sub` ("NIBAR · 1.3.2.02.01.04.001").
-- Polanya SENGAJA hanya golongan 1.3/1.5 dgn ≥ 5 segmen: kode sub kegiatan
-- ("1.01.01.2.06.0002") juga bertitik tapi berawalan 1.01 — tanpa batasan ini
-- baris indikator anggaran ikut dianggap "barang" dan mendapat filter jenis aset.
-- Uraian barang dilookup dari `admin_kodefikasi_bmd` (nomenklatur baku terkini).
--
-- `fn_ipa_rincian` sendiri hanya DILONGGARKAN batas atasnya (5000 → 50000) lewat
-- bedah teks atas definisi yang HIDUP (bukan menulis ulang badannya — fungsi itu
-- sudah dua kali dipatch; menyalin dari berkas lama mengembalikan patch itu).
-- Pemanggil lain (klien lama) meminta 2000 sehingga perilakunya tak berubah.
--
-- SECURITY INVOKER: wewenang dicek di dalam fn_ipa_rincian (SECURITY DEFINER).
-- Tak menulis apa pun. Tak ada perubahan tabel.
--
-- ⚠️ Deploy-ordering: migrasi ini WAJIB jalan SEBELUM deploy kode — kode baru
-- memanggil fn_ipa_rincian_halaman untuk SEMUA pop-up rincian indikator.
-- ============================================================================

DO $$
DECLARE
  v_def text;
  v_n   int;
BEGIN
  v_def := pg_get_functiondef('public.fn_ipa_rincian(int,bigint,text,int)'::regprocedure);
  v_n := (length(v_def) - length(replace(v_def, 'COALESCE(p_limit, 2000), 1), 5000)', ''))) /
         length('COALESCE(p_limit, 2000), 1), 5000)');
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'fn_ipa_rincian: pola batas 5000 ditemukan % kali (harus 1) — definisi hidup berbeda dari yang diharapkan, migrasi dibatalkan.', v_n;
  END IF;
  v_def := replace(v_def, 'COALESCE(p_limit, 2000), 1), 5000)', 'COALESCE(p_limit, 2000), 1), 50000)');
  EXECUTE v_def;
END $$;

CREATE OR REPLACE FUNCTION public.fn_ipa_rincian_halaman(
  p_tahun int, p_skpd_id bigint, p_indikator text,
  p_keadaan text DEFAULT NULL,      -- 'kurang' | 'ok' | NULL (semua)
  p_golongan text DEFAULT NULL,     -- '1.3.2' | NULL (semua jenis aset)
  p_cari text DEFAULT NULL,
  p_offset int DEFAULT 0,
  p_limit int DEFAULT 250)
RETURNS jsonb
LANGUAGE sql STABLE
SET search_path = public SET work_mem TO '64MB'
AS $$
  WITH d AS MATERIALIZED (
    SELECT r.o_keadaan, r.o_judul, r.o_sub, r.o_ket, r.o_nilai, r.o_ref,
           row_number() OVER () AS ord,
           substring(r.o_sub from '\m1\.[35]\.[0-9]+(?:\.[0-9]+){3,}') AS kode
    FROM fn_ipa_rincian(p_tahun, p_skpd_id, p_indikator, 50000) r
  ), e AS (
    SELECT d.*, k.uraian,
           CASE WHEN d.kode IS NOT NULL THEN
             split_part(d.kode,'.',1) || '.' || split_part(d.kode,'.',2) || '.' || split_part(d.kode,'.',3)
           END AS gol
    FROM d LEFT JOIN admin_kodefikasi_bmd k ON k.kode = d.kode
  ), f AS (   -- setelah filter cari
    SELECT * FROM e
    WHERE nullif(btrim(p_cari), '') IS NULL
       OR position(lower(btrim(p_cari)) IN lower(concat_ws(' ', o_judul, o_sub, o_ket, uraian))) > 0
  ), g AS (   -- + filter jenis aset
    SELECT * FROM f WHERE p_golongan IS NULL OR gol = p_golongan
  ), h AS (   -- + filter keadaan
    SELECT * FROM g WHERE p_keadaan IS NULL OR o_keadaan = p_keadaan
  )
  SELECT jsonb_build_object(
    'rows', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'keadaan', x.o_keadaan, 'judul', x.o_judul, 'sub', x.o_sub, 'ket', x.o_ket,
               'nilai', x.o_nilai, 'nibar', x.o_ref, 'uraian', x.uraian) ORDER BY x.ord)
      FROM (SELECT * FROM h ORDER BY ord
            OFFSET GREATEST(COALESCE(p_offset, 0), 0)
            LIMIT LEAST(GREATEST(COALESCE(p_limit, 250), 1), 1000)) x
    ), '[]'::jsonb),
    'total', (SELECT count(*) FROM h),
    'n', jsonb_build_object(
      'kurang', (SELECT count(*) FROM g WHERE o_keadaan = 'kurang'),
      'ok',     (SELECT count(*) FROM g WHERE o_keadaan = 'ok'),
      'semua',  (SELECT count(*) FROM g)),
    'golongan', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('kode', q.gol, 'n', q.n) ORDER BY q.gol)
      FROM (SELECT gol, count(*) AS n FROM f WHERE gol IS NOT NULL GROUP BY gol) q
    ), '[]'::jsonb)
  );
$$;

REVOKE ALL ON FUNCTION public.fn_ipa_rincian_halaman(int,bigint,text,text,text,text,int,int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_ipa_rincian_halaman(int,bigint,text,text,text,text,int,int) TO authenticated;
