-- ============================================================================
-- 20260928_01 — `fn_daftar_barang` MENGEMBALIKAN `kondisi_barang`
--
-- ═══ KENAPA ════════════════════════════════════════════════════════════════
-- Permintaan user 2026-09-28: kolom "Kondisi" ditambahkan ke Daftar Barang &
-- Daftar Barang Awal, persis setelah Asal Usul, di SEMUA jenis aset — isinya
-- disingkat di layar (Baik→B, Rusak Ringan→RR, Rusak Berat→RB, Hilang→H,
-- Tidak Ditemukan→TD). Datanya sudah lama ada: `aset.kondisi_barang` &
-- `aset_awal_2026.kondisi_barang` (kolom itu sudah diisi lewat form entry
-- sejak 2026-08-04, lihat "kondisi_barang ikut di form input awal" di
-- CLAUDE.md). Daftar Barang Awal tinggal di-`select` di klien — TAK BUTUH
-- migrasi (pola sama dgn 20260925_06 utk latitude/longitude). Daftar Barang
-- (register HIDUP) beda: sejak paginasi pindah ke server (20260814_05..08),
-- layarnya SAMA SEKALI tak `select` tabel `aset` — ia membaca
-- `fn_daftar_barang`. Kolom yang tak ada di RETURNS TABLE-nya MUSTAHIL
-- ditampilkan, seberapa pun kodenya disunting.
--
-- ═══ RISIKO LEBIH RENDAH DARI MIGRASI RPC LAIN DI SINI ═════════════════════
-- Selama migrasi ini BELUM jalan, `r.kondisi_barang` di klien cuma
-- `undefined` — kolomnya tampil "-" (kode klien memperlakukan `undefined`
-- sama dgn `null`), bukan salah data. TETAP disarankan migrasi dulu.
--
-- ═══ CARA AMAN: TEXT-SURGERY, pola SAMA dgn 20260923_02 & 20260925_06 ══════
-- Bukan tulis ulang dari nol — ambil pg_get_functiondef definisi yang HIDUP,
-- sisipkan lewat regexp_replace TERGUARD (count dicek dulu, RAISE kalau
-- meleset), DROP, jalankan definisi hasil sisipan. Anchor-nya "...longitude"
-- (kolom terakhir yang disisipkan 20260925_06) — kalau migrasi itu belum
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
  SELECT count(*) INTO v_n FROM regexp_matches(v_def, 'longitude numeric(\s*)\)', 'g');
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'pola RETURNS TABLE (longitude numeric)) ditemukan % kali (harap 1) — definisi hidup berubah (migrasi 20260925_06 belum jalan?), periksa manual, JANGAN dipaksa', v_n;
  END IF;
  v_def := regexp_replace(v_def, 'longitude numeric(\s*)\)', 'longitude numeric, kondisi_barang text\1)');

  -- (2) SELECT list LUAR, alias `u.` — TEPAT SEKALI (satu SELECT terluar).
  SELECT count(*) INTO v_n FROM regexp_matches(v_def, 'u\.pemanfaatan, u\.pengamanan, u\.latitude, u\.longitude', 'g');
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'pola SELECT u....longitude ditemukan % kali (harap 1)', v_n;
  END IF;
  v_def := regexp_replace(v_def,
    'u\.pemanfaatan, u\.pengamanan, u\.latitude, u\.longitude',
    'u.pemanfaatan, u.pengamanan, u.latitude, u.longitude, u.kondisi_barang');

  -- (3) SELECT list KEDUA subquery, alias `a.` — TEPAT DUA (cabang 1 & 2 keyset).
  SELECT count(*) INTO v_n FROM regexp_matches(v_def, 'a\.pemanfaatan, a\.pengamanan, a\.latitude, a\.longitude', 'g');
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'pola SELECT a....longitude ditemukan % kali (harap 2)', v_n;
  END IF;
  v_def := regexp_replace(v_def,
    'a\.pemanfaatan, a\.pengamanan, a\.latitude, a\.longitude',
    'a.pemanfaatan, a.pengamanan, a.latitude, a.longitude, a.kondisi_barang',
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
        AND pg_get_functiondef(oid) LIKE '%kondisi_barang text%'
  ) THEN
    RAISE EXCEPTION 'fn_daftar_barang tidak memuat kolom kondisi_barang sesudah migrasi — batal';
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
  -- latitude/longitude (20260925_06) tak boleh ikut hilang.
  IF (SELECT pg_get_functiondef(oid) NOT LIKE '%latitude numeric, longitude numeric%' FROM pg_proc
        WHERE proname = 'fn_daftar_barang' AND pronamespace = 'public'::regnamespace) THEN
    RAISE EXCEPTION 'fn_daftar_barang kehilangan kolom latitude/longitude — batal';
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
-- (2) Kolom barunya benar-benar bisa dibaca:
--       SELECT nibar, kondisi_barang FROM fn_daftar_barang('2026-S2', NULL, '1.3.1', NULL, NULL, 5, 0);
