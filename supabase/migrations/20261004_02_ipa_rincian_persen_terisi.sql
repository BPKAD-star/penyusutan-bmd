-- ============================================================================
-- 20261004_02 — Rincian IPA "Kelengkapan Data Administrasi": persen TERISI per
-- jenis aset (`fn_ipa_rincian_halaman` + `fn_ipa_kolom_wajib`).
--
-- Permintaan user 2026-10-04, sesudah ditanya apakah skor Integritas sebaiknya
-- dibagi rata per jenis aset. JAWABANNYA TIDAK (diukur ke produksi): dibagi rata,
-- Dinas Kearsipan (17.522 dari 18.300 barangnya ATL berkelengkapan 20%) melompat
-- dari juru kunci (23,2) ke peringkat satu (39,9) hanya karena 1 tanah, 6 gedung,
-- & 2 ATB-nya lengkap; sebaliknya RSUD turun 36,8 → 30,3. Satu barang ATB akan
-- bernilai sama dgn 1.195 barang Peralatan & Mesin, dan bobot satu barang jadi
-- bergantung pada JUMLAH jenis aset yang dimiliki SKPD → skor tak sebanding antar
-- SKPD. Skor TETAP per barang/kolom (tak disentuh migrasi ini).
--
-- Yang kurang bukan rumusnya, melainkan KEMAJUAN PER JENIS yang terlihat — supaya
-- SKPD tahu "Tanah 84%, Peralatan & Mesin 36%, ATL 20%" dan bisa memprioritaskan.
-- Migrasi ini hanya MENAMBAH keluaran:
--   golongan[i] += { isi, req }   kolom terisi / kolom wajib untuk jenis itu
--   terisi      =   { isi, req }  total untuk jenis aset yang sedang dipilih
-- keduanya NULL kecuali indikator INT_KELENGKAPAN (indikator lain tak punya
-- konsep "kolom wajib"). Angka itu SAMA dengan pembilang/penyebut skor: dijumlah
-- atas seluruh barang, ia sama dgn "4.661 / 13.068" di halaman Capaian SKPD.
--
-- ⚠️ ATURAN KOLOM WAJIB kini ada di TIGA tempat, kembar:
--   · fn_ipa_hitung_otomatis (skor)       — blok INT_KELENGKAPAN
--   · fn_ipa_rincian                       — daftar per barang
--   · fn_ipa_kolom_wajib (BARU, di bawah)  — penyebut per barang untuk persen
-- 9 kolom dasar + 1 bila Merek/Tipe berlaku (1.3.2 · 1.3.5 · 1.5.3 · 1.5.4) + 1
-- bila Luas berlaku (1.3.1 · 1.3.3 · 1.3.4 · 1.3.6) + 4 bila kendaraan bermotor
-- (kode 1.3.2.02.01.%). Dikunci lib/ipaRincianHalaman.test.ts, yang membandingkan
-- daftar golongan di sini dgn migrasi terakhir yang menulis blok `AS merek`/
-- `AS luas`. Diverifikasi ke produksi (RLS aktif, transaksi + ROLLBACK): jumlah
-- `req`/`isi` fungsi ini == penyebut/pembilang `fn_ipa_hitung_otomatis`.
--
-- Deploy-ordering AMAN DUA ARAH: kode klien membaca kedua keluaran baru sbg
-- opsional (kosong → persen tak ditampilkan), jadi migrasi boleh jalan kapan saja.
-- Prasyarat: 20261004_01 sudah jalan (fungsi pembungkusnya).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_ipa_kolom_wajib(p_kode text)
RETURNS int
LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path = public
AS $$
  SELECT 9
    + CASE WHEN q.g IN ('1.3.2','1.3.5','1.5.3','1.5.4') THEN 1 ELSE 0 END
    + CASE WHEN q.g IN ('1.3.1','1.3.3','1.3.4','1.3.6') THEN 1 ELSE 0 END
    + CASE WHEN p_kode LIKE '1.3.2.02.01.%' THEN 4 ELSE 0 END
  FROM (SELECT split_part(p_kode,'.',1) || '.' || split_part(p_kode,'.',2) || '.' || split_part(p_kode,'.',3) AS g) q
$$;

REVOKE ALL ON FUNCTION public.fn_ipa_kolom_wajib(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_ipa_kolom_wajib(text) TO authenticated;

-- Pembungkus: badan SAMA dgn 20261004_01 + kolom req/isi. Tanda tangan tak berubah
-- (CREATE OR REPLACE aman), SET ditulis ulang karena CREATE OR REPLACE menghapusnya.
CREATE OR REPLACE FUNCTION public.fn_ipa_rincian_halaman(
  p_tahun int, p_skpd_id bigint, p_indikator text,
  p_keadaan text DEFAULT NULL,
  p_golongan text DEFAULT NULL,
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
           END AS gol,
           -- Penyebut/pembilang HANYA utk Kelengkapan Data (o_nilai = jumlah kolom kosong).
           CASE WHEN p_indikator = 'INT_KELENGKAPAN' AND d.kode IS NOT NULL
                THEN fn_ipa_kolom_wajib(d.kode) END AS req
    FROM d LEFT JOIN admin_kodefikasi_bmd k ON k.kode = d.kode
  ), e2 AS (
    SELECT e.*, CASE WHEN e.req IS NOT NULL THEN e.req - COALESCE(e.o_nilai, 0)::int END AS isi FROM e
  ), f AS (   -- setelah filter cari
    SELECT * FROM e2
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
      SELECT jsonb_agg(jsonb_build_object('kode', q.gol, 'n', q.n, 'isi', q.isi, 'req', q.req) ORDER BY q.gol)
      FROM (SELECT gol, count(*) AS n, sum(isi) AS isi, sum(req) AS req
            FROM f WHERE gol IS NOT NULL GROUP BY gol) q
    ), '[]'::jsonb),
    'terisi', (SELECT CASE WHEN count(req) > 0
                           THEN jsonb_build_object('isi', sum(isi), 'req', sum(req)) END
               FROM g)
  );
$$;

REVOKE ALL ON FUNCTION public.fn_ipa_rincian_halaman(int,bigint,text,text,text,text,int,int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_ipa_rincian_halaman(int,bigint,text,text,text,text,int,int) TO authenticated;
