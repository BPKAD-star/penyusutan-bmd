-- ============================================================================
-- Role 'pengawas' (Baca-saja/Akuntansi-Auditor) melihat DASHBOARD & LAPORAN BMD
-- KOSONG (Total Aset 0, Total Cara Perolehan 0), padahal Daftar Barang & menu
-- Pembukuan (Pengadaan, Penghapusan, dst.) menampilkan data sungguhan untuk
-- SKPD yang sama — dilaporkan user 2026-09-24.
--
-- SEBABNYA: `fn_dashboard_rekap`, `fn_rekap_bmd`, & `fn_rekap_saldo_awal`
-- (tiga RPC agregat SECURITY DEFINER — Dashboard, Laporan BMD, Saldo Awal →
-- Rekapitulasi) MENGHITUNG scope-nya SENDIRI di dalam badan fungsi (bukan
-- lewat RLS tabel), lewat pola:
--
--   v_scope := CASE WHEN fn_is_viewer() THEN ARRAY[]::bigint[] ELSE ... END;
--   ...
--   WHERE ... AND (v_is_admin OR skpd_id = ANY(v_scope) OR ...)
--
-- `fn_is_viewer()` dipakai MENGOSONGKAN `v_scope` (optimasi: viewer tak perlu
-- `fn_my_skpd_scope()`), tapi WHERE akhirnya TAK PERNAH menambahkan
-- `OR fn_is_viewer()` — jadi untuk pengawas: `v_is_admin`=false,
-- `v_scope`=[] → SELURUH baris tersaring habis, hasilnya nol baris. Pola bug
-- yang SAMA disalin ke tiga fungsi via komentar "Pola & jebakannya sama
-- persis dengan fn_dashboard_rekap — lihat migrasi 20260810_02" — jadi
-- copy-paste yang mewariskan bug yang sama, bukan tiga bug independen.
--
-- Kontras dengan pola yang SUDAH BENAR di RPC lain (`fn_rekon_pos`,
-- `fn_daftar_barang`, `fn_penyusutan`, dst.): mereka memakai
-- `v_lihat_semua boolean := fn_is_admin() OR fn_is_viewer();` lalu
-- `v_lihat_semua OR skpd_id = ANY(scope)` — 'viewer melihat semua' benar²
-- masuk kondisi akhir. Ketiga fungsi di migrasi ini yang menyimpang.
--
-- DIVERIFIKASI ke produksi SEBELUM & SESUDAH (RLS aktif, uid pengawas
-- 315deaf5-a715-4c9d-b0b1-1631b8963beb, `SET LOCAL role authenticated` +
-- `request.jwt.claims`):
--   fn_dashboard_rekap()                     : 0 baris → SEMUA golongan/cara terisi
--   fn_rekap_saldo_awal(NULL,NULL)            : 0 baris → 299 baris
--   fn_rekap_bmd('2026-S1', ARRAY[1], NULL)   : 0 baris → 5 baris
--
-- OBAT: tambahkan `v_is_viewer boolean := fn_is_viewer();` (dievaluasi SEKALI,
-- pola InitPlan yang sudah baku di repo ini), pakai variabel itu utk `v_scope`
-- (gantikan panggilan `fn_is_viewer()` langsung), lalu OR-kan ke kondisi WHERE
-- akhir tiap fungsi. Text-surgery atas `pg_get_functiondef` yang HIDUP (pola
-- 20260914_03/20260923_02) — bukan menulis ulang badan fungsi dari nol —
-- supaya SELURUH logika lain (index hint, CTE, komentar, `SET work_mem`/
-- `SET statement_timeout`) ikut terbawa apa adanya & satu-satunya yang
-- berubah adalah baris yang memang dimaksud.
--
-- Tak ada perubahan tanda tangan (RETURNS TABLE/json tak berubah) → GRANT
-- lama tetap berlaku (CREATE OR REPLACE mempertahankan ACL fungsi selama
-- tanda tangannya sama).
-- ============================================================================

DO $$
DECLARE
  v_def text;
  v_new text;
  v_cnt int;
BEGIN
  ------------------------------------------------------------------
  -- fn_dashboard_rekap
  ------------------------------------------------------------------
  SELECT pg_get_functiondef(oid) INTO v_def
  FROM pg_proc WHERE proname = 'fn_dashboard_rekap';

  SELECT count(*) INTO v_cnt FROM regexp_matches(v_def, 'v_is_admin boolean := fn_is_admin\(\);', 'g');
  IF v_cnt <> 1 THEN RAISE EXCEPTION 'fn_dashboard_rekap: pola v_is_admin declaration tidak ditemukan tepat 1x (dapat %)', v_cnt; END IF;
  v_new := regexp_replace(v_def,
    'v_is_admin boolean := fn_is_admin\(\);',
    'v_is_admin boolean := fn_is_admin();' || E'\n  v_is_viewer boolean := fn_is_viewer();',
    '');

  SELECT count(*) INTO v_cnt FROM regexp_matches(v_new, 'CASE WHEN fn_is_viewer\(\) THEN ARRAY\[\]::bigint\[\]', 'g');
  IF v_cnt <> 1 THEN RAISE EXCEPTION 'fn_dashboard_rekap: pola CASE WHEN fn_is_viewer() tidak ditemukan tepat 1x (dapat %)', v_cnt; END IF;
  v_new := regexp_replace(v_new,
    'CASE WHEN fn_is_viewer\(\) THEN ARRAY\[\]::bigint\[\]',
    'CASE WHEN v_is_viewer THEN ARRAY[]::bigint[]',
    '');

  SELECT count(*) INTO v_cnt FROM regexp_matches(v_new, '\(v_is_admin OR skpd_id = ANY\(v_scope\) OR id = ANY\(v_pernah\)\)', 'g');
  IF v_cnt <> 1 THEN RAISE EXCEPTION 'fn_dashboard_rekap: pola WHERE akhir tidak ditemukan tepat 1x (dapat %)', v_cnt; END IF;
  v_new := regexp_replace(v_new,
    '\(v_is_admin OR skpd_id = ANY\(v_scope\) OR id = ANY\(v_pernah\)\)',
    '(v_is_admin OR v_is_viewer OR skpd_id = ANY(v_scope) OR id = ANY(v_pernah))',
    '');

  EXECUTE v_new;

  ------------------------------------------------------------------
  -- fn_rekap_bmd
  ------------------------------------------------------------------
  SELECT pg_get_functiondef(oid) INTO v_def
  FROM pg_proc WHERE proname = 'fn_rekap_bmd';

  SELECT count(*) INTO v_cnt FROM regexp_matches(v_def, 'v_is_admin boolean := fn_is_admin\(\);', 'g');
  IF v_cnt <> 1 THEN RAISE EXCEPTION 'fn_rekap_bmd: pola v_is_admin declaration tidak ditemukan tepat 1x (dapat %)', v_cnt; END IF;
  v_new := regexp_replace(v_def,
    'v_is_admin boolean := fn_is_admin\(\);',
    'v_is_admin boolean := fn_is_admin();' || E'\n  v_is_viewer boolean := fn_is_viewer();',
    '');

  SELECT count(*) INTO v_cnt FROM regexp_matches(v_new, 'CASE WHEN fn_is_viewer\(\) THEN ARRAY\[\]::bigint\[\]', 'g');
  IF v_cnt <> 1 THEN RAISE EXCEPTION 'fn_rekap_bmd: pola CASE WHEN fn_is_viewer() tidak ditemukan tepat 1x (dapat %)', v_cnt; END IF;
  v_new := regexp_replace(v_new,
    'CASE WHEN fn_is_viewer\(\) THEN ARRAY\[\]::bigint\[\]',
    'CASE WHEN v_is_viewer THEN ARRAY[]::bigint[]',
    '');

  SELECT count(*) INTO v_cnt FROM regexp_matches(v_new, '\(v_is_admin OR a\.skpd_id = ANY\(v_scope\) OR a\.id = ANY\(v_pernah\)\)', 'g');
  IF v_cnt <> 1 THEN RAISE EXCEPTION 'fn_rekap_bmd: pola WHERE akhir tidak ditemukan tepat 1x (dapat %)', v_cnt; END IF;
  v_new := regexp_replace(v_new,
    '\(v_is_admin OR a\.skpd_id = ANY\(v_scope\) OR a\.id = ANY\(v_pernah\)\)',
    '(v_is_admin OR v_is_viewer OR a.skpd_id = ANY(v_scope) OR a.id = ANY(v_pernah))',
    '');

  EXECUTE v_new;

  ------------------------------------------------------------------
  -- fn_rekap_saldo_awal
  ------------------------------------------------------------------
  SELECT pg_get_functiondef(oid) INTO v_def
  FROM pg_proc WHERE proname = 'fn_rekap_saldo_awal';

  SELECT count(*) INTO v_cnt FROM regexp_matches(v_def, 'v_is_admin boolean := fn_is_admin\(\);', 'g');
  IF v_cnt <> 1 THEN RAISE EXCEPTION 'fn_rekap_saldo_awal: pola v_is_admin declaration tidak ditemukan tepat 1x (dapat %)', v_cnt; END IF;
  v_new := regexp_replace(v_def,
    'v_is_admin boolean := fn_is_admin\(\);',
    'v_is_admin boolean := fn_is_admin();' || E'\n  v_is_viewer boolean := fn_is_viewer();',
    '');

  SELECT count(*) INTO v_cnt FROM regexp_matches(v_new, 'CASE WHEN fn_is_viewer\(\) THEN ARRAY\[\]::bigint\[\]', 'g');
  IF v_cnt <> 1 THEN RAISE EXCEPTION 'fn_rekap_saldo_awal: pola CASE WHEN fn_is_viewer() tidak ditemukan tepat 1x (dapat %)', v_cnt; END IF;
  v_new := regexp_replace(v_new,
    'CASE WHEN fn_is_viewer\(\) THEN ARRAY\[\]::bigint\[\]',
    'CASE WHEN v_is_viewer THEN ARRAY[]::bigint[]',
    '');

  SELECT count(*) INTO v_cnt FROM regexp_matches(v_new, '\(v_is_admin OR a\.skpd_id = ANY\(v_scope\)\)', 'g');
  IF v_cnt <> 1 THEN RAISE EXCEPTION 'fn_rekap_saldo_awal: pola WHERE akhir tidak ditemukan tepat 1x (dapat %)', v_cnt; END IF;
  v_new := regexp_replace(v_new,
    '\(v_is_admin OR a\.skpd_id = ANY\(v_scope\)\)',
    '(v_is_admin OR v_is_viewer OR a.skpd_id = ANY(v_scope))',
    '');

  EXECUTE v_new;
END $$;
