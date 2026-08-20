-- ============================================================================
-- 2026-08-20 — TITIK PETA TERSIMPAN DI LAUT: tanda minus latitude hilang
--
-- GEJALA: operator menitik lokasi tanah hibah di Kediri lewat MapPicker, tapi
-- di GIS Tanah pin-nya muncul jauh di LAUT dekat Filipina.
--
-- SEBABNYA pembaca angka yang salah dipakai. Ketiga menu Cara Perolehan
-- meng-cast kolom `ASET_NUM_COLS` (luas, latitude, longitude) memakai `toNum`
-- milik berkasnya masing-masing:
--
--     const toNum = (s) => parseFloat(String(s).replace(/[^0-9.]/g, ''))
--
-- Regex itu dirancang untuk RUPIAH — ia membuang SEMUA karakter selain angka
-- dan titik, TERMASUK tanda minus. Kabupaten Kediri ada di belahan SELATAN,
-- jadi latitude-nya wajib negatif (≈ −7,8):
--
--     MapPicker → '-7.774007'  →  toNum  →  +7.774007
--
-- Nilainya tetap "masuk akal" (besarannya benar, rentangnya sah), jadi tak ada
-- satu pun validasi yang berteriak. Yang berubah cuma BELAHAN BUMI-nya.
--
-- ⚠️ Jalur lain TIDAK kena, dan itu sudah diverifikasi ke DB, bukan diasumsikan:
-- GIS → Kelola Bidang (`parseFloat`), Inventarisasi/LKI (`Number`), Koreksi →
-- Spesifikasi & Saldo Awal → Daftar Barang Awal (`Number` + isFinite) semuanya
-- benar sejak awal. Buktinya `aset_bidang_tanah` punya **0** baris berlatitude
-- positif, sementara `aset` punya 91.
--
-- TERDAMPAK (dihitung ke DB 2026-08-20): 107 aset berlatitude positif.
--   Per asal   : hibah_masuk 70 · pengadaan 36 · hasil_inventarisasi 1
--                → SELURUHNYA dari ketiga menu ber-`toNum`, NOL dari saldo_awal.
--   Per status : aktif 14 · dihapus 77 · draft 16 — yang 'dihapus'/'draft'
--                sisa siklus Buka Kunci & approve gagal; ikut dibetulkan supaya
--                kalau kelak terbaca (audit/KIBAR) angkanya tak menyesatkan.
-- Rentang latitude +7,732846 … +7,816126 dan longitude 111,934 … 112,061 —
-- keduanya persis Kediri, jadi yang salah SEMATA tandanya. Longitude TIDAK
-- terdampak: Indonesia seluruhnya di bujur TIMUR (positif), tak ada minus yang
-- bisa hilang di sana.
--
-- ⚠️ TEMUAN TERPISAH, SENGAJA TIDAK DISENTUH MIGRASI INI: 184 aset punya
-- longitude di LUAR 111..113 (rentang 5,88 … 110,04) — dan SEMUANYA
-- `cara_perolehan = 'saldo_awal'`, yaitu warisan impor baseline e-BMD, bukan
-- korban `toNum`. Tak satu pun dari mereka berlatitude positif, jadi UPDATE di
-- bawah tak menyentuhnya. Koordinat yang benar untuk baris-baris itu tak
-- diketahui aplikasi ini — menebaknya jauh lebih berbahaya daripada
-- membiarkannya, jadi ia dicatat di sini untuk ditelaah tersendiri.
--
-- PERBAIKANNYA membalik tanda, BUKAN mengosongkan: besarannya sudah benar &
-- itu titik yang sungguh-sungguh dipilih operator. Mengosongkannya berarti
-- membuang pekerjaan yang sudah dilakukan.
--
-- BUKAN LEDGER: `latitude`/`longitude` itu data deskriptif, bukan peristiwa
-- akuntansi — tak ada nilai/penyusutan/kepemilikan/visibilitas yang bergeser.
-- Jadi UPDATE biasa di sini SAH, pola yang sama dgn KIR & koreksi spesifikasi
-- Saldo Awal. `transaksi_bmd` tidak disentuh sama sekali.
--
-- Kodenya ditambal bareng migrasi ini (`angkaKolomAset` di lib/asetFields.ts,
-- dikunci lib/asetFields.test.ts) — tanpa itu, titik berikutnya salah lagi.
--
-- IDEMPOTEN: sesudah dijalankan tak ada lagi latitude > 0, jadi jalan kedua
-- kalinya menyentuh 0 baris. Kalau suatu saat Pemkab benar-benar punya aset di
-- belahan utara, migrasi ini TIDAK boleh dijalankan ulang begitu saja.
-- ============================================================================

DO $$
DECLARE v_n int;
BEGIN
  SELECT count(*) INTO v_n FROM aset WHERE latitude IS NOT NULL AND latitude > 0;
  RAISE NOTICE 'Aset berlatitude positif (mustahil utk Kab. Kediri): %', v_n;

  -- Sabuk pengaman: yang diselidiki 107. Jauh lebih banyak = ada sumber lain
  -- yang belum dipahami → BATALKAN, jangan sapu buta.
  IF v_n > 200 THEN
    RAISE EXCEPTION 'Dibatalkan: % baris, jauh di atas 107 yang diselidiki. Selidiki dulu.', v_n;
  END IF;

  -- Rentang wajar Kab. Kediri: |lat| 7..9. Di luar itu bukan sekadar salah
  -- tanda — jangan dibalik diam-diam, biarkan ketahuan.
  SELECT count(*) INTO v_n FROM aset
   WHERE latitude IS NOT NULL AND latitude > 0 AND (latitude < 7 OR latitude > 9);
  IF v_n > 0 THEN
    RAISE EXCEPTION 'Dibatalkan: % baris berlatitude positif di LUAR rentang 7..9 — bukan sekadar salah tanda.', v_n;
  END IF;

  UPDATE aset SET latitude = -latitude
   WHERE latitude IS NOT NULL AND latitude > 0;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RAISE NOTICE 'Selesai: % latitude dibalik tandanya.', v_n;
END $$;

-- ── Verifikasi: keduanya WAJIB 0 ────────────────────────────────────────────
SELECT
  (SELECT count(*) FROM aset WHERE latitude IS NOT NULL AND latitude > 0) AS aset_lat_positif,
  (SELECT count(*) FROM aset_bidang_tanah WHERE latitude IS NOT NULL AND latitude > 0) AS bidang_lat_positif;
