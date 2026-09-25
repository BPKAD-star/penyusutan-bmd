-- ============================================================================
-- 20260925_06 — `fn_daftar_barang` MENGEMBALIKAN `latitude` & `longitude`
--
-- ═══ KENAPA ════════════════════════════════════════════════════════════════
-- Permintaan user 2026-09-25: kolom Lokasi di Daftar Barang & Daftar Barang
-- Awal diberi indikator kecil (pin teal / titik merah) — sudah/belum ada
-- titik koordinat di GIS — biar operator gampang menyisir Tanah yang belum
-- dititik tanpa membuka satu-satu. Daftar Barang Awal (`aset_awal_2026`)
-- sudah lama punya kolom ini (GRANT UPDATE per-kolom, migrasi 20260728_01),
-- tinggal di-select di klien — TAK BUTUH migrasi. Daftar Barang (register
-- HIDUP) beda: sejak paginasi pindah ke server (20260814_05..08), layarnya
-- SAMA SEKALI tak `select` tabel `aset` — ia membaca `fn_daftar_barang`.
-- Kolom yang tak ada di RETURNS TABLE-nya MUSTAHIL ditampilkan, seberapa pun
-- kodenya disunting (persis pelajaran 20260908_01 & 20260923_02).
--
-- ═══ RISIKO LEBIH RENDAH DARI MIGRASI RPC LAIN DI SINI ═════════════════════
-- Selama migrasi ini BELUM jalan, `r.latitude`/`r.longitude` di klien cuma
-- `undefined` — kode klien memperlakukannya SAMA dgn `null` (indikator
-- "belum ada titik"), jadi tak ada baris yang hilang/salah kalau urutan
-- deploy terbalik: kolomnya cuma tampil telat (semua "belum ada titik")
-- sampai migrasi ini jalan. TETAP disarankan migrasi dulu, tapi bukan syarat
-- keras seperti migrasi RPC lain di repo ini.
--
-- ═══ CARA AMAN: TEXT-SURGERY, pola SAMA dgn 20260923_02 ═══════════════════
-- Bukan tulis ulang dari nol — ambil pg_get_functiondef definisi yang HIDUP,
-- sisipkan lewat regexp_replace TERGUARD (count dicek dulu, RAISE kalau
-- meleset), DROP, jalankan definisi hasil sisipan. Anchor-nya "...pengamanan"
-- (kolom terakhir yang disisipkan 20260923_02) — kalau migrasi itu belum
-- jalan atau definisi hidup sudah menyimpang, guard di bawah akan menolak
-- dgn pesan yang jelas, bukan diam-diam menimpa yang salah.
-- ============================================================================

DO $mig$
DECLARE
  v_oid oid;
  v_def text;
  v_n int;
BEGIN
  SELECT oid INTO v_oid FROM pg_proc
    WHERE proname = 'fn_daftar_barang' AND pronamespace = 'public'::regnamespace;
  IF v_oid IS NULL THEN
    RAISE EXCEPTION 'fn_daftar_barang tidak ditemukan — migrasi sebelumnya belum jalan?';
  END IF;
  v_def := pg_get_functiondef(v_oid);

  -- (1) RETURNS TABLE — sisipkan SEBELUM tutup kurung daftar keluaran.
  SELECT count(*) INTO v_n FROM regexp_matches(v_def, 'pengamanan text(\s*)\)', 'g');
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'pola RETURNS TABLE (pengamanan text)) ditemukan % kali (harap 1) — definisi hidup berubah, periksa manual, JANGAN dipaksa', v_n;
  END IF;
  v_def := regexp_replace(v_def, 'pengamanan text(\s*)\)', 'pengamanan text, latitude numeric, longitude numeric\1)');

  -- (2) SELECT list LUAR, alias `u.` — TEPAT SEKALI (satu SELECT terluar).
  SELECT count(*) INTO v_n FROM regexp_matches(v_def, 'u\.no_bpkb, u\.pemanfaatan, u\.pengamanan', 'g');
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'pola SELECT u....pengamanan ditemukan % kali (harap 1)', v_n;
  END IF;
  v_def := regexp_replace(v_def,
    'u\.no_bpkb, u\.pemanfaatan, u\.pengamanan',
    'u.no_bpkb, u.pemanfaatan, u.pengamanan, u.latitude, u.longitude');

  -- (3) SELECT list KEDUA subquery, alias `a.` — TEPAT DUA (cabang 1 & 2 keyset).
  SELECT count(*) INTO v_n FROM regexp_matches(v_def, 'a\.no_bpkb, a\.pemanfaatan, a\.pengamanan', 'g');
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'pola SELECT a....pengamanan ditemukan % kali (harap 2)', v_n;
  END IF;
  v_def := regexp_replace(v_def,
    'a\.no_bpkb, a\.pemanfaatan, a\.pengamanan',
    'a.no_bpkb, a.pemanfaatan, a.pengamanan, a.latitude, a.longitude',
    'g');

  EXECUTE 'DROP FUNCTION ' || v_oid::regprocedure;
  EXECUTE v_def;

  -- GRANT hilang bersama DROP — pasang ulang persis seperti sebelumnya.
  EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon, authenticated, service_role',
    (SELECT oid::regprocedure FROM pg_proc
       WHERE proname = 'fn_daftar_barang' AND pronamespace = 'public'::regnamespace));

  -- ── PENJAGA AKHIR ──────────────────────────────────────────────────────
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
      WHERE proname = 'fn_daftar_barang' AND pronamespace = 'public'::regnamespace
        AND pg_get_functiondef(oid) LIKE '%latitude numeric, longitude numeric%'
  ) THEN
    RAISE EXCEPTION 'fn_daftar_barang tidak memuat kolom latitude/longitude sesudah migrasi — batal';
  END IF;
  -- CTE `kodereg` (period-aware kode register, 20260913_01) tak boleh ikut hilang.
  IF (SELECT pg_get_functiondef(oid) NOT LIKE '%kodereg%' FROM pg_proc
        WHERE proname = 'fn_daftar_barang' AND pronamespace = 'public'::regnamespace) THEN
    RAISE EXCEPTION 'fn_daftar_barang kehilangan CTE kodereg — batal';
  END IF;
  -- Predikat cari trigram (20260914_01) tak boleh ikut hilang.
  IF (SELECT pg_get_functiondef(oid) NOT LIKE '%fn_aset_teks_cari%' FROM pg_proc
        WHERE proname = 'fn_daftar_barang' AND pronamespace = 'public'::regnamespace) THEN
    RAISE EXCEPTION 'fn_daftar_barang kehilangan predikat fn_aset_teks_cari — batal';
  END IF;
  -- plan_cache_mode (20260914_01) WAJIB ikut terbawa dari pg_get_functiondef.
  IF (SELECT proconfig FROM pg_proc
        WHERE proname = 'fn_daftar_barang' AND pronamespace = 'public'::regnamespace) IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM pg_proc, unnest(proconfig) cfg
         WHERE proname = 'fn_daftar_barang' AND pronamespace = 'public'::regnamespace
           AND cfg LIKE 'plan_cache_mode=%'
     ) THEN
    RAISE EXCEPTION 'fn_daftar_barang kehilangan setelan plan_cache_mode — batal';
  END IF;
  -- pemanfaatan/pengamanan (20260923_02) tak boleh ikut hilang.
  IF (SELECT pg_get_functiondef(oid) NOT LIKE '%pemanfaatan text, pengamanan text%' FROM pg_proc
        WHERE proname = 'fn_daftar_barang' AND pronamespace = 'public'::regnamespace) THEN
    RAISE EXCEPTION 'fn_daftar_barang kehilangan kolom pemanfaatan/pengamanan — batal';
  END IF;
END
$mig$;

-- ── PEMERIKSAAN SILANG (jalankan sesudah migrasi) ───────────────────────────
-- (1) Isi & urutan halaman TIDAK boleh bergeser sedikit pun:
--       SELECT count(*) FROM fn_daftar_barang('2026-S2', NULL, '1.3.1', NULL, NULL, 50, 0);
-- (2) Kolom barunya benar-benar bisa dibaca (boleh NULL kalau belum dititik —
--     itu bukan tanda gagal):
--       SELECT nibar, latitude, longitude FROM fn_daftar_barang('2026-S2', NULL, '1.3.1', NULL, NULL, 5, 0);
