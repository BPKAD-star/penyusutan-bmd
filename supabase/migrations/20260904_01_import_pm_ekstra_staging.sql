-- ============================================================================
-- Import Peralatan & Mesin EKSTRAKOMPTABEL 2025 (golongan 1.3.2)
-- TAHAP 1: staging (2026-09-04, REVISI KEDUA).
--
-- ⚠️ MENGGANTI revisi pertama (dijalankan 2026-09-04 pagi) — berkas sumbernya
-- sendiri direvisi user SESUDAH revisi pertama itu. Kalau `stg_import_pm_ekstra`
-- SUDAH terisi dari revisi pertama, TRUNCATE dulu sebelum re-import (STEP di
-- bawah). Sengaja TRUNCATE, bukan DROP+CREATE: struktur tabelnya tak berubah.
--
-- Sumber: `Import PM Esktrakom 2025.xlsx` (sheet 'Import', 28.502 baris data,
-- 40 kolom) → dibersihkan ke `arsip-import/stg_import_pm_ekstra.csv` (28 kolom,
-- 6,9 MB). Pola SAMA dgn import ATL Diknas (20260720_01/02): staging →
-- aset_awal_2026 → aset → transaksi_bmd ('saldo_awal', periode 2025-S2,
-- tanggal 2025-12-31 — retroaktif, sudah di-whitelist `fn_cek_tahun_buku`).
--
-- ⚠️ BEDA PALING PENTING DARI IMPOR ATL: golongan 1.3.2 ITU DISUSUTKAN, dan
-- **ekstrakomptabel IKUT disusutkan** (keputusan user 2026-07-13, CLAUDE.md).
-- Jadi masa_manfaat_smt / akumulasi_2025 / sisa_masa_manfaat_smt / beban per
-- semester WAJIB ikut ke payload ledger — TIDAK boleh NULL seperti batch ATL.
-- Konsekuensinya ENGINE WAJIB DI-RUN ULANG sesudah TAHAP 2 (lihat di sana).
--
-- ⚠️ INI BATCH EKSTRAKOMPTABEL PERTAMA untuk 1.3.2. `aset` golongan 1.3.2 saat
-- ini 218.306 baris — 218.305 intra + **1 ekstra** (baris uji "Lap Top" milik
-- operator, `status='dihapus'`, `cara_perolehan='pengadaan'`, tak berkaitan sama
-- sekali dgn batch ini — dicek eksplisit, NIBAR-nya TIDAK ada di 28.502 baris
-- batch ini). Jadi batch ini secara praktis mengisi keranjang yang masih kosong.
--
-- ══ REVISI KEDUA: KEPALA NIBAR SUDAH DIBETULKAN DI SUMBER ══════════════════
-- Revisi pertama berkas ini memakai dua kepala NIBAR yang dua-duanya tak baku
-- ([12][01|02][3506] = [prov/kab][komptabel][wilayah]):
--   27.536 baris → `12025306`  komptabel 02 BENAR, wilayah tertukar (5306)
--      966 baris → `12013506`  wilayah BENAR, komptabel 01 = INTRA (SALAH,
--                              barangnya ekstrakomptabel)
-- User memutuskan menormalkan keduanya jadi `12023506` — TAPI sebelum langkah
-- itu dieksekusi, user memperbaikinya sendiri DI SISTEM SUMBER lalu meng-
-- ekspor ulang. Diverifikasi dgn membandingkan kedua berkas baris-per-baris
-- (bukan diasumsikan): **28.502/28.502 baris identik di SEMUA kolom kecuali
-- NIBAR**, dan yang berubah pada NIBAR **hanya segmen `urut`** (7 digit
-- terakhir) — segmen SKPD/tahun/kode tak berubah, karena generatornya
-- diberi nomor urut baru begitu kepalanya diperbaiki. Kepala revisi kedua ini
-- **seragam `12023506`** — persis target normalisasi yang sudah disepakati.
-- Konsekuensinya: **STEP 0 (normalisasi manual) TIDAK DIPERLUKAN LAGI** — TAHAP
-- 2 kini cuma memverifikasinya (fail keras kalau kelak berkasnya kembali
-- membawa kepala lain), bukan memperbaikinya secara diam-diam.
--
-- ⚠️ Tabrakan NIBAR terhadap `aset`/`aset_awal_2026` yang sudah ada diperiksa
-- LANGSUNG (bukan cuma argumen struktural): satu-satunya baris `aset` berkepala
-- `12023506` dgn segmen kode diawali `132` adalah baris uji "Lap Top" di atas,
-- dan NIBAR persisnya **TIDAK** ada di antara 28.502 NIBAR batch ini. Jadi
-- tabrakan eksak = 0. (`aset_awal_2026` malah 0 baris berkepala `12023506`
-- bersegmen kode `132` sama sekali.)
--
-- ══ KOLOM YANG DIBUANG SAAT PEMBERSIHAN (bukan kelalaian) ══════════════════
--   · 100% KOSONG di seluruh file : created_at, foto_paths
--   · 100% berisi literal "-"     : luas, nomor/tanggal/nama_dokumen_kepemilikan,
--     jenis_hak, wilayah_kode, kolom-26 (alamat_detail, tanpa judul di file),
--     latitude, longitude, pemanfaatan
-- "-" DIJADIKAN KOSONG, bukan disimpan apa adanya: `luas`/`latitude`/
-- `longitude` bertipe numeric (akan menolak "-"), dan yang bertipe text akan
-- menyimpan tanda hubung yang lalu tampil di layar & Excel seolah data.
--
-- ══ DIBULATKAN KE 2 DESIMAL SAAT CSV DIBUAT (baru di revisi kedua) ═════════
-- Sumber Excel-nya menyimpan angka hasil pembagian floating-point mentah —
-- terukur sampai **14 desimal** di `beban_penyusutan_per_smt` (mis.
-- `275111.11111111...`). Seluruh 218.251 baris `aset_awal_2026` golongan 1.3.2
-- yang SUDAH ADA maksimum **2 desimal** (rupiah–sen); membiarkan batch baru ini
-- membawa presisi mentah akan jadi satu-satunya golongan berpresisi tak
-- seragam, dan derau sub-sennya menumpuk di penjumlahan Rekonsiliasi & Uji
-- Konsistensi. `nilai_perolehan`, `akumulasi_2025`, `beban_penyusutan_per_smt`,
-- `harga_satuan` dibulatkan (ROUND_HALF_UP) ke 2 desimal; `nilai_buku_awal`
-- **DITURUNKAN** dari kedua angka yang SUDAH dibulatkan (`nilai_perolehan −
-- akumulasi_2025`), bukan dibulatkan sendiri-sendiri — supaya identitas
-- `nilai_buku = perolehan − akumulasi` tetap EKSAK 0 selisih untuk seluruh
-- 28.502 baris (diverifikasi sesudah pembulatan, 0 baris meleset; sebelum
-- dibulatkan ada 15 baris meleset 1e-11..1e-10 rupiah, derau presisi Excel).
-- Dampak ke total (dari Rp4,89 miliar): perolehan +Rp4,15 · akumulasi +Rp4,78 ·
-- nilai buku −Rp0,63 — beberapa rupiah, bukan salah catat.
--
-- ══ HASIL ANALISIS PENUH FILE (28.502/28.502 baris, bukan sampel) ══════════
--   1. NIBAR 100% unik & 45 digit, kepala seragam `12023506` (lihat di atas).
--   2. Identitas angkanya UTUH sesudah pembulatan, 0 pengecualian:
--        nilai_buku_awal = nilai_perolehan − akumulasi_2025 ......... 0 beda
--        jumlah × harga_satuan = nilai_perolehan ................... 0 beda
--        akumulasi_2025 > nilai_perolehan (ALARM CLAUDE.md) ........ 0 baris
--        nilai <= 0 / negatif ...................................... 0 baris
--        sisa_masa_manfaat_smt > masa_manfaat_smt .................. 0 baris
--      TOTAL (sesudah dibulatkan): perolehan Rp4.890.122.586,94 ·
--        akumulasi Rp4.397.900.674,27 · nilai buku Rp492.221.912,67
--   3. intra_ekstra 100% "Ekstra" → di-lowercase jadi 'ekstra' saat CSV dibuat
--      (CHECK `saldo_awal_2026_intra_ekstra_check` cuma menerima huruf kecil).
--      ⚠️ TIDAK dihitung ulang dari `batas_kapitalisasi` — pelajaran migrasi
--      20260716_04 (P&M sempat salah dihitung ulang jadi 'ekstra' 61.639 baris
--      lalu dibatalkan). Kalau file sumber seragam, itu kebijakan akuntansi
--      aslinya, bukan data yang perlu ditebak ulang.
--   4. kondisi_barang 100% "Baik" → cocok CHECK `aset_kondisi_barang_check`.
--   5. jumlah SELALU 1; satuan 6 nilai (Buah 17.200, unit 8.851, Meter 1.443,
--      Biji 625, Set 346, Pcs 37).
--   6. asal_usul 3 nilai: Pengadaan APBD 26.238 · Hibah 1.793 · Perolehan
--      Lainnya 471. Kolom BEBAS (tak ber-CHECK) — sengaja dipertahankan apa
--      adanya, lihat aturan `cara_perolehan` vs `asal_usul` di CLAUDE.md.
--      `cara_perolehan` sendiri diisi 'saldo_awal' di TAHAP 2 (baseline).
--   7. tgl_perolehan 1941-06-30 s.d. 2025-12-27 — tak ada yang di masa depan,
--      aman untuk ledger retroaktif 2025-S2. Tahun tertua 1941 masih lolos
--      CHECK `aset_awal_2026_tahun_pengadaan_check` (1900..2100).
--   8. `tahun_pengadaan` di file bertipe TANGGAL & selalu SAMA PERSIS dgn
--      tgl_perolehan (0 beda) — sedangkan kolom DB-nya `smallint`. CSV
--      menyimpan TAHUNnya saja.
--   9. 324 kode barang berbeda, SEMUANYA sudah terdaftar di
--      `admin_kodefikasi_bmd` (diverifikasi 2026-09-04) → tak perlu remap.
--      55 baris (Brandkas 35 + Lampu Senter 20, SKPD 8 = Satuan Polisi Pamong
--      Praja) NIBAR-nya menyebut kode LAMA `1.3.2.09.02.05.999` (Persenjataan
--      Non Senjata Api) sementara kolom `kode`-nya sudah `1.3.2.05.01.05.091`
--      (Lain-lain Alat Kantor) — kode dibiarkan APA ADANYA (kolom yang sudah
--      benar), NIBAR juga dibiarkan APA ADANYA (akta lahir, tak digenerate
--      ulang saat direklasifikasi). Diverifikasi: `masa_manfaat_smt` di baris
--      itu (10 smt = 5 tahun) COCOK dgn kodefikasi BARUnya, bukan yang lama
--      (masa_manfaat=0), jadi tak ada risiko masa manfaat salah menempel.
--      Perolehan Rp2.700.000 (0,055% dari batch), sudah habis disusutkan
--      (akumulasi=perolehan, sisa=0).
--      ⚠️ TAPI kolom `uraian_barang` di ke-55 baris itu MASIH menyebut kategori
--      LAMA: "PERSENJATAAN NON SENJATA API LAIN - LAIN LAINNYA" — persis
--      polanya `kode` sebelum dikoreksi. Ini bukan kebetulan lokal: file ini
--      TAK PERNAH menaruh label kodefikasi generik di `uraian_barang` untuk
--      kode-kode spesifik (kolom itu diisi nama jenis barangnya, mis. "Papan
--      Tulis", "Meja Rapat" — konsisten satu nilai per kode di SELURUH 324
--      kode, diverifikasi), sehingga satu-satunya baris yang menyimpang justru
--      yang kodenya ikut berubah. DIPERBAIKI di CSV ke label kodefikasi kode
--      BARUnya ("Lain-lain Alat Kantor Lainnya") — prinsip yang SAMA dgn
--      keputusan `kode`: kolom deskriptif ikut identitas SAAT INI, bukan
--      riwayatnya. Tanpa ini, KIBAR/KIR/Kendaraan (yang membaca kolom
--      TERSIMPAN, bukan lookup kodefikasi live — lihat CLAUDE.md "uraian_barang
--      punya DUA sumber") akan menampilkan "Persenjataan" untuk barang yang
--      register-nya sudah benar Alat Kantor.
--  10. 61 skpd_id berbeda, SEMUANYA valid di `admin_skpd`. Terbesar: id 4
--      (11.523 baris), 5 (1.327), 6 (661).
--
-- PRASYARAT (WAJIB, urut):
--   (a) `fn_cek_tahun_buku` sudah mem-whitelist 'saldo_awal' retroaktif
--       (diverifikasi ADA di produksi 2026-09-04).
--   (b) Kalau `stg_import_pm_ekstra` SUDAH ADA berisi data revisi PERTAMA
--       (kepala ganda `12025306`/`12013506`) — TRUNCATE dulu (di bawah), baru
--       import CSV revisi kedua ini. Table Editor → Import data from CSV,
--       `arsip-import/stg_import_pm_ekstra.csv` (6,9 MB, biasanya < 1 menit).
--   (c) Blok VERIFIKASI PRA-SYARAT di TAHAP 2 menghasilkan hasil aman —
--       TERMASUK verifikasi kepala NIBAR (pengganti STEP 0 lama).
-- Re-runnable / idempotent (semua guard NOT EXISTS ada di TAHAP 2; TRUNCATE di
-- bawah aman dijalankan berkali-kali — staging bukan tabel append-only).
-- ============================================================================

CREATE TABLE IF NOT EXISTS stg_import_pm_ekstra (
  nibar                    text,
  kode                     text,
  nama_barang              text,
  skpd_id                  bigint,
  intra_ekstra             text,
  nilai_perolehan          numeric,
  tgl_perolehan            date,
  masa_manfaat_smt         smallint,
  akumulasi_2025           numeric,
  nilai_buku_awal          numeric,
  sisa_masa_manfaat_smt    smallint,
  beban_penyusutan_per_smt numeric,
  spesifikasi_lainnya      text,
  merek_tipe               text,
  no_polisi                text,
  no_bpkb                  text,
  no_rangka                text,
  no_mesin                 text,
  uraian_barang            text,
  keterangan               text,
  jumlah                   int,
  satuan                   text,
  harga_satuan             numeric,
  penggunaan_pengamanan    text,
  asal_usul                text,
  kondisi_barang           text,
  tahun_pengadaan          smallint,
  golongan                 text
);

-- ⚠️ WAJIB kalau tabel ini sudah terisi dari revisi PERTAMA berkas (kepala
-- NIBAR ganda). Idempotent & aman — staging bukan tabel append-only, dan belum
-- ada satu baris pun batch ini yang sempat masuk aset_awal_2026/aset/ledger
-- (diverifikasi 2026-09-04: 0 baris revisi pertama yang sudah dimaterialisasi).
TRUNCATE TABLE stg_import_pm_ekstra;

-- ── Verifikasi SESUDAH CSV diimpor (jalankan semua sebelum TAHAP 2) ─────────
--   SELECT count(*) FROM stg_import_pm_ekstra;                          -- 28502
--   SELECT count(DISTINCT nibar) FROM stg_import_pm_ekstra;             -- 28502
--   SELECT left(nibar,8) AS kepala, count(*) FROM stg_import_pm_ekstra
--     GROUP BY 1;                                        -- HARUS cuma 12023506
--   SELECT count(*) FROM stg_import_pm_ekstra WHERE golongan <> '1.3.2';-- 0
--   SELECT intra_ekstra, count(*) FROM stg_import_pm_ekstra GROUP BY 1; -- ekstra 28502
--   SELECT kondisi_barang, count(*) FROM stg_import_pm_ekstra GROUP BY 1; -- Baik 28502
--   -- angkanya utuh & sudah 2 desimal (keempatnya HARUS 0):
--   SELECT count(*) FILTER (WHERE nilai_buku_awal <> nilai_perolehan - akumulasi_2025) AS a,
--          count(*) FILTER (WHERE jumlah * harga_satuan <> nilai_perolehan)            AS b,
--          count(*) FILTER (WHERE akumulasi_2025 > nilai_perolehan)                    AS c,
--          count(*) FILTER (WHERE scale(nilai_perolehan) > 2 OR scale(akumulasi_2025) > 2) AS d
--     FROM stg_import_pm_ekstra;
--   -- totalnya cocok dgn CSV (SUDAH dibulatkan, bukan angka mentah file asli):
--   SELECT round(sum(nilai_perolehan),2) AS perolehan,   -- 4890122586.94
--          round(sum(akumulasi_2025),2)  AS akumulasi,   -- 4397900674.27
--          round(sum(nilai_buku_awal),2) AS nilai_buku   --  492221912.67
--     FROM stg_import_pm_ekstra;
