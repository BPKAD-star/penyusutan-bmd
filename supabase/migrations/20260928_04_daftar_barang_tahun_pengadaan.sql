-- ============================================================================
-- 20260928_04 — `fn_daftar_barang` MENGEMBALIKAN `tahun_pengadaan`
--
-- ═══ KENAPA ════════════════════════════════════════════════════════════════
-- Ketahuan dari spreadsheet user (yg dipakai utk "samain urutan kolom",
-- putaran sebelumnya hari ini): header "Tanggal Perolehan - Tahun Pengadaan"
-- itu SATU kolom bertumpuk, sama persis pola Kode Barang/Uraian Barang. Saldo
-- Awal (`aset_awal_2026`) sudah lama punya tumpukan ini (`tahun_pengadaan` ada
-- di COLS-nya); Daftar Barang (live) KELEWAT — kolom `tgl` di sana cuma
-- menampilkan `tgl_perolehan` polos.
--
-- Sejak paginasi pindah ke server (20260814_05..08), layar Daftar Barang
-- SAMA SEKALI tak `select` tabel `aset` — ia membaca `fn_daftar_barang`. Kolom
-- yang tak ada di RETURNS TABLE-nya MUSTAHIL ditampilkan, seberapa pun
-- kodenya disunting.
--
-- ═══ RISIKO LEBIH RENDAH DARI MIGRASI RPC LAIN DI SINI ═════════════════════
-- Selama migrasi ini BELUM jalan, sub-baris Tahun Pengadaan di klien cuma
-- `undefined` (diperlakukan sama dgn `null` → sub-baris tak dirender) — tak
-- ada baris yang hilang/salah, cuma kolomnya tampil telat.
--
-- ═══ CARA AMAN: TEXT-SURGERY, pola SAMA dgn 20260928_01/20260925_06 ═══════
-- Anchornya "...kondisi_barang" (kolom terakhir yang disisipkan 20260928_01).
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

  SELECT count(*) INTO v_n FROM regexp_matches(v_def, 'kondisi_barang text(\s*)\)', 'g');
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'pola RETURNS TABLE (kondisi_barang text)) ditemukan % kali (harap 1) — definisi hidup berubah (migrasi 20260928_01 belum jalan?), periksa manual, JANGAN dipaksa', v_n;
  END IF;
  v_def := regexp_replace(v_def, 'kondisi_barang text(\s*)\)', 'kondisi_barang text, tahun_pengadaan smallint\1)');

  SELECT count(*) INTO v_n FROM regexp_matches(v_def, 'u\.latitude, u\.longitude, u\.kondisi_barang', 'g');
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'pola SELECT u....kondisi_barang ditemukan % kali (harap 1)', v_n;
  END IF;
  v_def := regexp_replace(v_def,
    'u\.latitude, u\.longitude, u\.kondisi_barang',
    'u.latitude, u.longitude, u.kondisi_barang, u.tahun_pengadaan');

  SELECT count(*) INTO v_n FROM regexp_matches(v_def, 'a\.latitude, a\.longitude, a\.kondisi_barang', 'g');
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'pola SELECT a....kondisi_barang ditemukan % kali (harap 2)', v_n;
  END IF;
  v_def := regexp_replace(v_def,
    'a\.latitude, a\.longitude, a\.kondisi_barang',
    'a.latitude, a.longitude, a.kondisi_barang, a.tahun_pengadaan',
    'g');

  EXECUTE 'DROP FUNCTION ' || v_oid::regprocedure;
  EXECUTE v_def;

  EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon, authenticated, service_role',
    (SELECT oid::regprocedure FROM pg_proc
       WHERE proname = 'fn_daftar_barang' AND pronamespace = 'public'::regnamespace));

  -- ── PENJAGA AKHIR ──────────────────────────────────────────────────────
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
      WHERE proname = 'fn_daftar_barang' AND pronamespace = 'public'::regnamespace
        AND pg_get_functiondef(oid) LIKE '%tahun_pengadaan smallint%'
  ) THEN
    RAISE EXCEPTION 'fn_daftar_barang tidak memuat kolom tahun_pengadaan sesudah migrasi — batal';
  END IF;
  IF (SELECT pg_get_functiondef(oid) NOT LIKE '%kodereg%' FROM pg_proc
        WHERE proname = 'fn_daftar_barang' AND pronamespace = 'public'::regnamespace) THEN
    RAISE EXCEPTION 'fn_daftar_barang kehilangan CTE kodereg — batal';
  END IF;
  IF (SELECT pg_get_functiondef(oid) NOT LIKE '%fn_aset_teks_cari%' FROM pg_proc
        WHERE proname = 'fn_daftar_barang' AND pronamespace = 'public'::regnamespace) THEN
    RAISE EXCEPTION 'fn_daftar_barang kehilangan predikat fn_aset_teks_cari — batal';
  END IF;
  IF (SELECT proconfig FROM pg_proc
        WHERE proname = 'fn_daftar_barang' AND pronamespace = 'public'::regnamespace) IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM pg_proc, unnest(proconfig) cfg
         WHERE proname = 'fn_daftar_barang' AND pronamespace = 'public'::regnamespace
           AND cfg LIKE 'plan_cache_mode=%'
     ) THEN
    RAISE EXCEPTION 'fn_daftar_barang kehilangan setelan plan_cache_mode — batal';
  END IF;
  IF (SELECT pg_get_functiondef(oid) NOT LIKE '%latitude numeric, longitude numeric%' FROM pg_proc
        WHERE proname = 'fn_daftar_barang' AND pronamespace = 'public'::regnamespace) THEN
    RAISE EXCEPTION 'fn_daftar_barang kehilangan kolom latitude/longitude — batal';
  END IF;
  IF (SELECT pg_get_functiondef(oid) NOT LIKE '%pemanfaatan text, pengamanan text%' FROM pg_proc
        WHERE proname = 'fn_daftar_barang' AND pronamespace = 'public'::regnamespace) THEN
    RAISE EXCEPTION 'fn_daftar_barang kehilangan kolom pemanfaatan/pengamanan — batal';
  END IF;
END
$mig$;

-- ── PEMERIKSAAN SILANG (jalankan sesudah migrasi) ───────────────────────────
-- (1) Isi & urutan halaman TIDAK boleh bergeser sedikit pun:
--       SELECT count(*) FROM fn_daftar_barang('2026-S2', NULL, '1.3.3', NULL, NULL, 50, 0);
-- (2) Kolom barunya benar-benar bisa dibaca:
--       SELECT nibar, tgl_perolehan, tahun_pengadaan FROM fn_daftar_barang('2026-S2', NULL, '1.3.3', NULL, NULL, 5, 0);
