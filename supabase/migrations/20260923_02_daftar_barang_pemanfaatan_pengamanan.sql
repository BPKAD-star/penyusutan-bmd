-- ============================================================================
-- 20260923_02 — `fn_daftar_barang` MENGEMBALIKAN `pemanfaatan` & `pengamanan`
--
-- ═══ KENAPA ════════════════════════════════════════════════════════════════
-- Permintaan user 2026-09-23: kolom "Penggunaan" di Daftar Barang selama ini
-- cuma membaca `penggunaan_pengamanan` (teks bebas warisan impor e-BMD) — dan
-- `aset.pemanfaatan`/`aset.pengamanan` (cache "siapa memakai/dalam bentuk apa
-- dimanfaatkan", sudah ada sejak migrasi 20260721_02/20260722_02, ditulis
-- LANGSUNG oleh menu Pemanfaatan & Pengamanan tiap kartu dicatat/diakhiri/
-- dibatalkan) TAK PERNAH DITAMPILKAN DI MANA PUN — diverifikasi lewat grep,
-- 0 halaman membaca kedua kolom itu. Sekarang kolom Penggunaan menampilkan
-- cache aktif itu (kalau ada) MENDUDUKI teks baseline — pola yang sama dgn
-- Σ luas bidang MENANG atas luas register (lib/luasBidang.ts): entri yang
-- HIDUP menggantikan teks warisan, bukan menambahnya.
--
-- ═══ KENAPA HARUS MIGRASI (bukan cuma sunting kode) ════════════════════════
-- Sejak paginasi Daftar Barang pindah ke server (20260814_05..08), layar &
-- Export Excel biasa SAMA SEKALI tidak `select` tabel `aset` — keduanya
-- membaca `fn_daftar_barang`. Kolom yang tak ada di `RETURNS TABLE`-nya
-- MUSTAHIL ditampilkan, seberapa pun kodenya disunting (persis pelajaran
-- 20260908_01, yang sempat lolos ter-deploy sebulan tanpa migrasinya jalan —
-- gejalanya "-" untuk semua baris, TANPA satu pun error).
--
-- ⚠️ RETURNS TABLE tak bisa diubah lewat CREATE OR REPLACE ("cannot change
-- return type of existing function", 42P13) — wajib DROP dulu. DROP membuang
-- GRANT & seluruh `ALTER FUNCTION … SET` (plan_cache_mode, dipasang
-- 20260914_01) — CLAUDE.md sudah dua kali mencatat kelas kegagalan ini.
--
-- ═══ CARA AMAN: TEXT-SURGERY ATAS DEFINISI YANG HIDUP, BUKAN TULIS ULANG ═══
-- Fungsi ini sudah 3x direvisi (20260908_01 tambah 4 kolom kendaraan,
-- 20260913_01 tambah CTE `kodereg`, 20260914_01 ganti predikat cari) — dan
-- 20260913_01 sendiri nyaris gagal karena menyalin RETURNS TABLE dari salinan
-- BASI. Supaya migrasi ini tidak mengulang kesalahan yang sama: TIDAK menulis
-- ulang badan fungsi dari nol, melainkan mengambil `pg_get_functiondef` dari
-- definisi yang BENAR-BENAR HIDUP di database saat ini, menyisipkan dua kolom
-- baru lewat regexp_replace TERGUARD (count dicek dulu, RAISE kalau meleset),
-- lalu DROP + jalankan definisi hasil sisipan itu.
--
-- Keuntungan sampingan: `pg_get_functiondef` MEMUAT SELURUH `SET` config
-- (search_path DAN plan_cache_mode, keduanya tersimpan di `pg_proc.proconfig`)
-- di badan definisinya — jadi begitu definisi hasil sisip dieksekusi ulang,
-- plan_cache_mode ikut terbawa OTOMATIS, tak perlu ALTER FUNCTION susulan.
--
-- ⚠️ Biaya: NOL secara rencana query — kedua kolom cuma dibaca dari heap yang
-- sudah dikunjungi (index penutup fungsi ini memang sudah tak mencakup
-- nama_barang/keterangan/dst., jadi heap fetch sudah terjadi sejak dulu).
--
-- ⚠️ DEPLOY-ORDERING: WAJIB jalan SEBELUM deploy kode. Kalau terbalik, kolom
-- Penggunaan tetap tampil teks lama — bukan error, tapi cache Pemanfaatan/
-- Pengamanan yang baru saja dicatat tak kelihatan sampai migrasi ini jalan.
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

  -- (1) RETURNS TABLE — sisipkan dua kolom baru SEBELUM tutup kurung daftar
  -- keluaran. Pola ini WAJIB TEPAT SEKALI; kalau tidak, definisi hidup sudah
  -- menyimpang dari yang diasumsikan migrasi ini & harus diperiksa manual.
  SELECT count(*) INTO v_n FROM regexp_matches(v_def, 'no_bpkb text(\s*)\)', 'g');
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'pola RETURNS TABLE (no_bpkb text)) ditemukan % kali (harap 1) — definisi hidup berubah, periksa manual, JANGAN dipaksa', v_n;
  END IF;
  v_def := regexp_replace(v_def, 'no_bpkb text(\s*)\)', 'no_bpkb text, pemanfaatan text, pengamanan text\1)');

  -- (2) SELECT list LUAR, alias `u.` — TEPAT SEKALI (satu SELECT terluar).
  SELECT count(*) INTO v_n FROM regexp_matches(v_def, 'u\.no_polisi, u\.no_rangka, u\.no_mesin, u\.no_bpkb', 'g');
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'pola SELECT u.no_polisi..no_bpkb ditemukan % kali (harap 1)', v_n;
  END IF;
  v_def := regexp_replace(v_def,
    'u\.no_polisi, u\.no_rangka, u\.no_mesin, u\.no_bpkb',
    'u.no_polisi, u.no_rangka, u.no_mesin, u.no_bpkb, u.pemanfaatan, u.pengamanan');

  -- (3) SELECT list KEDUA subquery, alias `a.` — TEPAT DUA (cabang 1 & 2).
  SELECT count(*) INTO v_n FROM regexp_matches(v_def, 'a\.no_polisi, a\.no_rangka, a\.no_mesin, a\.no_bpkb', 'g');
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'pola SELECT a.no_polisi..no_bpkb ditemukan % kali (harap 2)', v_n;
  END IF;
  v_def := regexp_replace(v_def,
    'a\.no_polisi, a\.no_rangka, a\.no_mesin, a\.no_bpkb',
    'a.no_polisi, a.no_rangka, a.no_mesin, a.no_bpkb, a.pemanfaatan, a.pengamanan',
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
        AND pg_get_functiondef(oid) LIKE '%pemanfaatan text, pengamanan text%'
  ) THEN
    RAISE EXCEPTION 'fn_daftar_barang tidak memuat kolom pemanfaatan/pengamanan sesudah migrasi — batal';
  END IF;
  -- CTE `kodereg` (period-aware kode register, 20260913_01) tak boleh ikut
  -- hilang — kelas kegagalan yang PERSIS sudah terjadi sebelumnya di repo ini.
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
END
$mig$;

-- ── PEMERIKSAAN SILANG (jalankan sesudah migrasi, pola sama dgn 20260908_01) ─
-- (1) Isi & urutan halaman TIDAK boleh bergeser sedikit pun:
--       SELECT count(*) FROM fn_daftar_barang('2026-S2', NULL, '1.3.2', NULL, NULL, 50, 0);
--       -> 50 (atau sebanyak sebelum migrasi)
-- (2) Kolom barunya benar-benar bisa dibaca (boleh semuanya NULL kalau belum
--     ada pemanfaatan/pengamanan aktif — itu bukan tanda gagal):
--       SELECT pemanfaatan, pengamanan FROM fn_daftar_barang('2026-S2', NULL, '1.3.3', NULL, NULL, 5, 0);
-- (3) Sepakat dgn rekap (klausa WHERE tak disentuh migrasi ini, harus tetap 0 beda):
--       SELECT (SELECT total_count FROM fn_daftar_barang_rekap('2026-S2', NULL, '1.3.3')) AS dari_rekap,
--              (SELECT count(*) FROM fn_daftar_barang('2026-S2', NULL, '1.3.3', NULL, NULL, 1000000, 0)) AS dari_halaman;
