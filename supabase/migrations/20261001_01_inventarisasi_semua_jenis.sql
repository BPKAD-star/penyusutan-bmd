-- ============================================================================
-- 20261001_01 — Lembar Kerja & Validasi Inventarisasi: pilihan "Semua jenis aset"
-- ============================================================================
-- Keputusan user 2026-10-01: sub-menu per jenis aset (8 × Lembar Kerja + 8 ×
-- Validasi) di Sidebar DILEBUR jadi satu halaman per menu, dengan pemilih
-- jenis aset di atasnya — termasuk "Semua jenis". Sampai hari ini kedua RPC
-- daftar MENOLAK jenis kosong ('Jenis aset wajib dipilih.'); migrasi ini
-- mengizinkan NULL = seluruh jenis. Satu jenis tetap berperilaku PERSIS sama.
--
-- Terukur ke produksi sebelum ditulis (2026-10-01, cache hangat):
--   halaman 1 semua jenis — pengurus Dinas Pendidikan (729.233 aset) 43 ms,
--   admin se-kabupaten (906.160 aset) 9 ms; cari tanpa hasil (terburuk) Diknas
--   711 ms. Pagu `authenticated` 8.000 ms. Daftar tetap 50 baris/halaman.
--
-- BEDAH TEKS atas definisi HIDUP (pola 20260914_03/20260923_02), BUKAN menyalin
-- badan fungsi dari berkas migrasi lama: kedua fungsi sudah beberapa kali
-- ditambal (20260924_04, 20260925_02) & salinan di repo bisa basi. Tiap pola
-- diperiksa jumlah kemunculannya dulu — meleset → GAGAL KERAS, bukan diam.
--
-- `plan_cache_mode = force_custom_plan` (sudah terpasang, ikut terbawa lewat
-- pg_get_functiondef) membuat `p_golongan IS NULL OR x = p_golongan` dilipat
-- jadi konstanta per panggilan → rencana satu-jenis tidak berubah.
--
-- Tanda tangan & RETURNS TABLE TIDAK berubah → GRANT tetap, deploy-ordering
-- aman dua arah (kode lama selalu mengirim jenis; kode baru mengirim NULL
-- hanya untuk "Semua jenis", yang sebelum migrasi ditolak dgn pesan jelas).
-- ============================================================================

DO $mig$
DECLARE
  v_def  text;
  v_n    int;
  c_raise constant text := 'IF p_golongan IS NULL OR p_golongan = '''' THEN\s+RAISE EXCEPTION ''Jenis aset wajib dipilih\.'';\s+END IF;';
  c_ganti constant text := 'IF p_golongan = '''' THEN p_golongan := NULL; END IF;';
BEGIN
  -- ── fn_inventarisasi_lembar ───────────────────────────────────────────────
  v_def := pg_get_functiondef('public.fn_inventarisasi_lembar'::regproc);

  v_n := regexp_count(v_def, c_raise);
  IF v_n <> 1 THEN RAISE EXCEPTION 'lembar: pola penolak jenis kosong ditemukan % kali (harap 1)', v_n; END IF;
  v_def := regexp_replace(v_def, c_raise, c_ganti);

  v_n := regexp_count(v_def, '\mib\.golongan = p_golongan');
  IF v_n <> 1 THEN RAISE EXCEPTION 'lembar: "ib.golongan = p_golongan" ditemukan % kali (harap 1)', v_n; END IF;
  v_def := regexp_replace(v_def, '\mib\.golongan = p_golongan', '(p_golongan IS NULL OR ib.golongan = p_golongan)');

  v_n := regexp_count(v_def, '\ma\.golongan = p_golongan');
  IF v_n <> 1 THEN RAISE EXCEPTION 'lembar: "a.golongan = p_golongan" ditemukan % kali (harap 1)', v_n; END IF;
  v_def := regexp_replace(v_def, '\ma\.golongan = p_golongan', '(p_golongan IS NULL OR a.golongan = p_golongan)');

  EXECUTE v_def;

  -- ── fn_inventarisasi_hasil ────────────────────────────────────────────────
  v_def := pg_get_functiondef('public.fn_inventarisasi_hasil'::regproc);

  v_n := regexp_count(v_def, c_raise);
  IF v_n <> 1 THEN RAISE EXCEPTION 'hasil: pola penolak jenis kosong ditemukan % kali (harap 1)', v_n; END IF;
  v_def := regexp_replace(v_def, c_raise, c_ganti);

  v_n := regexp_count(v_def, '\mib\.golongan = p_golongan');
  IF v_n <> 1 THEN RAISE EXCEPTION 'hasil: "ib.golongan = p_golongan" ditemukan % kali (harap 1)', v_n; END IF;
  v_def := regexp_replace(v_def, '\mib\.golongan = p_golongan', '(p_golongan IS NULL OR ib.golongan = p_golongan)');

  EXECUTE v_def;

  -- ── Penjaga: setelan fungsi tetap terpasang ───────────────────────────────
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'fn_inventarisasi_lembar'
      AND 'plan_cache_mode=force_custom_plan' = ANY(proconfig)
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'fn_inventarisasi_hasil'
      AND 'plan_cache_mode=force_custom_plan' = ANY(proconfig)
  ) THEN
    RAISE EXCEPTION 'plan_cache_mode hilang dari salah satu fungsi';
  END IF;
END
$mig$;
