-- ============================================================================
-- Import Peralatan & Mesin EKSTRAKOMPTABEL 2025 — DINAS KESEHATAN (gol 1.3.2)
-- TAHAP 1: staging (2026-09-05).
--
-- Batch LANJUTAN dari 20260904_01/02 (28.502 baris, 61 SKPD) yang SENGAJA
-- belum memuat Dinas Kesehatan & Dinas Pendidikan — berkas keduanya disusun
-- terpisah. Ini giliran DINKES; Dinas Pendidikan MASIH DALAM PENYUSUNAN dan
-- akan jadi batch tersendiri lagi (jangan tunggu batch ini untuknya).
--
-- Sumber: `Import PM Ekstrakom 2025 Dinkes.xlsx` (sheet 'Import', 22.800 baris
-- termasuk 5 baris kosong di ekor → **22.795 baris data**, 40 kolom) →
-- dibersihkan ke `arsip-import/stg_import_pm_ekstra_dinkes.csv` (28 kolom,
-- 5,8 MB). Pola SAMA PERSIS dgn 20260904_01: staging → aset_awal_2026 → aset
-- → transaksi_bmd ('saldo_awal', periode 2025-S2, tanggal 2025-12-31 —
-- retroaktif, sudah di-whitelist `fn_cek_tahun_buku`).
--
-- ⚠️ 1.3.2 DISUSUTKAN & ekstrakomptabel IKUT disusutkan (CLAUDE.md), jadi
-- masa_manfaat_smt / akumulasi_2025 / sisa_masa_manfaat_smt / beban per
-- semester WAJIB ikut ke payload ledger — TIDAK boleh NULL. Konsekuensinya
-- ENGINE WAJIB DI-RUN ULANG sesudah TAHAP 2.
--
-- ══ HASIL ANALISIS PENUH BERKAS (22.795/22.795 baris, bukan sampel) ════════
--   1. **5 baris kosong di ekor berkas (baris Excel 22.797–22.801)** — seluruh
--      kolomnya NULL (nibar/kode/nama/nilai/skpd_id/golongan semua kosong).
--      DIBUANG saat CSV dibuat, tidak dibawa ke staging. Kalau ikut terbawa ia
--      akan melanggar CHECK & FK di aset/aset_awal_2026.
--   2. NIBAR 100% unik (22.795 nilai berbeda), semua 45 digit, kepala SERAGAM
--      `12023506` — [12][02=ekstra][3506=Kab. Kediri]. Sudah benar sejak
--      berkas, tak perlu normalisasi seperti revisi pertama batch 20260904.
--   3. **Tabrakan NIBAR terhadap `aset`/`aset_awal_2026` = 0, DIBUKTIKAN
--      TUNTAS** (bukan argumen struktural): himpunan NIBAR di DB yang MUNGKIN
--      bentrok adalah yang berprefix-22 sama (kepala + kode SKPD) — jumlahnya
--      **47 baris**, dan SEMUANYA bersegmen kode `133` (Gedung & Bangunan
--      ekstra milik Dinkes dari batch 20260819_04/05). Seluruh 22.795 NIBAR
--      berkas ini bersegmen `132`. Dicek eksak satu per satu: 0 dari 47 ada di
--      berkas. (Pelajaran 20260819_02: NIBAR bisa berpindah pemilik, jadi yang
--      diperiksa NIBAR PERSISnya — bukan sekadar "SKPD-nya belum punya P&M".)
--   4. Dinkes & 39 UPTD-nya (skpd_id 3, 142, 144–181) per 2026-09-05 punya
--      **0 baris** `aset` golongan 1.3.2 ekstrakomptabel → batch ini mengisi
--      keranjang yang benar-benar masih kosong, bukan menambah di atas data
--      yang sudah ada. Ke-40 skpd_id VALID di `admin_skpd` (skpd_id 3 =
--      "Dinas Kesehatan"; sisanya UPTD Puskesmas/Labkes di bawahnya).
--   5. Identitas angkanya UTUH sesudah pembulatan, 0 pengecualian:
--        nilai_buku_awal = nilai_perolehan − akumulasi_2025 ......... 0 beda
--        jumlah × harga_satuan = nilai_perolehan ................... 0 beda
--        akumulasi_2025 > nilai_perolehan (ALARM CLAUDE.md) ........ 0 baris
--        nilai_perolehan <= 0 ...................................... 0 baris
--        sisa_masa_manfaat_smt > masa_manfaat_smt .................. 0 baris
--        masa_manfaat_smt / beban_per_smt NULL ..................... 0 baris
--      TOTAL (sesudah dibulatkan): perolehan Rp2.798.479.468,99 ·
--        akumulasi Rp2.370.173.730,23 · nilai buku Rp428.305.738,76
--   6. intra_ekstra 100% "Ekstra" → di-lowercase 'ekstra' saat CSV dibuat
--      (CHECK `saldo_awal_2026_intra_ekstra_check` cuma menerima huruf kecil).
--      TIDAK dihitung ulang dari `batas_kapitalisasi` — pelajaran 20260716_04.
--   7. kondisi_barang 100% "Baik"; jumlah SELALU 1; satuan 7 nilai (Buah
--      12.952, unit 9.001, Meter 407, Set 272, Pcs 124, Biji 37, Box 2).
--   8. asal_usul: Pengadaan APBD 17.931 · Hibah 4.863 · Perolehan Lainnya 1.
--      Kolom BEBAS (tak ber-CHECK), dipertahankan apa adanya — `cara_perolehan`
--      sendiri diisi 'saldo_awal' di TAHAP 2 (CLAUDE.md: dua kolom berbeda,
--      sengaja TIDAK disinkronkan).
--   9. tgl_perolehan 1967-06-30 s.d. 2025-12-18 — tak ada yang di masa depan,
--      aman untuk ledger retroaktif 2025-S2.
--  10. ⚠️ **`tahun_pengadaan` TIDAK selalu sama dgn tahun `tgl_perolehan`** —
--      26 baris berbeda (16 di antaranya beda TAHUNnya), dan di baris-baris itu
--      kolomnya berisi TAHUN telanjang (mis. 1990, 1992) sementara baris lain
--      berisi TANGGAL serial Excel. Ini BEDA dari batch 20260904 (0 beda).
--      Contoh: NIBAR …0000001 tgl_perolehan 2009-12-28 tapi tahun_pengadaan
--      1990 — barang lama yang baru diregistrasi 2009. Keduanya DIBIARKAN APA
--      ADANYA (kolom DB-nya memang dua kolom berbeda: `tgl_perolehan` date &
--      `tahun_pengadaan` smallint); CSV menyimpan TAHUNnya saja untuk kolom
--      kedua. Rentang 1967–2025, lolos CHECK
--      `aset_awal_2026_tahun_pengadaan_check` (1900..2100).
--  11. 388 kode barang berbeda — validitasnya diperiksa di TAHAP 2 (query (c)),
--      BUKAN diasumsikan.
--  12. 40 skpd_id, terbesar: id 3 Dinas Kesehatan (4.246 baris), 178 (1.354),
--      159 (1.134), 142 (1.058).
--
-- ══ DIBULATKAN KE 2 DESIMAL SAAT CSV DIBUAT ═══════════════════════════════
-- Sumber Excel menyimpan hasil pembagian floating-point mentah — terukur
-- sampai **15 desimal**. Seluruh baris `aset_awal_2026` yang sudah ada maksimum
-- 2 desimal (rupiah–sen). `nilai_perolehan`, `akumulasi_2025`,
-- `beban_penyusutan_per_smt` dibulatkan (ROUND_HALF_UP) ke 2 desimal;
-- `nilai_buku_awal` **DITURUNKAN** dari kedua angka yang SUDAH dibulatkan
-- (`nilai_perolehan − akumulasi_2025`), dan `harga_satuan` diturunkan dari
-- `nilai_perolehan / jumlah` — bukan dibulatkan sendiri-sendiri. Tanpa itu
-- 3.457 baris nilai_buku-nya meleset 0,01 dari selisihnya sendiri (derau
-- pembulatan independen), dan identitas `nilai_buku = perolehan − akumulasi`
-- yang dipakai Rekonsiliasi & Uji Konsistensi jadi tak eksak. Sesudah cara ini:
-- **0 baris meleset** untuk kedua identitas. Dampak ke total: nilai buku
-- Rp428.305.755,98 → Rp428.305.738,76 (−Rp17,22 dari Rp428 juta; pembulatan
-- sen, bukan salah catat).
--
-- ══ KOLOM INTEGER DIBULATKAN — derau float Excel (ditemukan saat import) ═══
-- Import CSV putaran pertama DITOLAK Postgres:
--   ERROR 22P02: invalid input syntax for type smallint: "1.0000000000000004"
-- Sebabnya `sisa_masa_manfaat_smt` di berkas menyimpan hasil pengurangan
-- floating-point mentah, bukan bilangan bulat: **269 dari 22.795 baris** berisi
-- nilai seperti `1.0000000000000004`, `2.999999999999999`, `3.0000000000000013`.
-- Kolom DB-nya `smallint`, jadi Postgres menolak SELURUH berkas — bukan cuma
-- baris itu. (`masa_manfaat_smt`, `jumlah`, `tahun_pengadaan`, `skpd_id`
-- diperiksa juga: ketiganya sudah bulat, 0 baris menyimpang.)
-- Keempat kolom integer kini DIBULATKAN (Math.round) saat CSV dibuat.
-- ⚠️ Ini pembulatan yang AMAN & bukan penebakan: seluruh 269 nilai itu berjarak
-- < 0,000000000001 semester dari bilangan bulat terdekat — derau presisi, bukan
-- angka setengah semester. Sesudah dibulatkan: `sisa > masa` 0 baris (identitas
-- tetap utuh), dan tak ada satu pun kolom integer yang masih pecahan
-- (diverifikasi ulang dgn membaca CSV hasilnya, bukan mengandalkan generatornya).
--
-- ══ KOLOM YANG DIBUANG SAAT PEMBERSIHAN (bukan kelalaian) ══════════════════
--   · 100% KOSONG di seluruh berkas : created_at, foto_paths
--   · 100% berisi literal "-"       : luas, nomor/tanggal/nama_dokumen_
--     kepemilikan, jenis_hak, wilayah_kode, kolom-26 (tanpa judul), latitude,
--     longitude, pemanfaatan
-- "-" DIJADIKAN KOSONG: kolom numerik (luas/latitude/longitude) akan menolak
-- "-", dan yang bertipe text akan menyimpan tanda hubung yang lalu tampil di
-- layar & Excel seolah data.
--
-- PRASYARAT (WAJIB, urut):
--   (a) `fn_cek_tahun_buku` sudah mem-whitelist 'saldo_awal' retroaktif
--       (sudah dipakai batch 20260904, terverifikasi ada di produksi).
--   (b) Import `arsip-import/stg_import_pm_ekstra_dinkes.csv` (5,8 MB) lewat
--       Table Editor → Import data from CSV ke tabel `stg_import_pm_ekstra_dinkes`
--       yang dibuat di bawah.
--   (c) Blok VERIFIKASI PRA-SYARAT di TAHAP 2 menghasilkan hasil aman.
-- Re-runnable / idempotent (guard NOT EXISTS ada di TAHAP 2; TRUNCATE di bawah
-- aman diulang — staging bukan tabel append-only).
--
-- ⚠️ TABEL STAGING SENDIRI (bukan menumpang `stg_import_pm_ekstra` batch
-- 20260904): dua batch berbeda dgn asal berkas & tanggal verifikasi berbeda.
-- Kalau menumpang tabel yang sama, verifikasi "berapa baris batch ini" &
-- rollback per-batch jadi mustahil dibedakan dari batch sebelumnya.
-- ============================================================================

CREATE TABLE IF NOT EXISTS stg_import_pm_ekstra_dinkes (
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

-- Aman diulang (mis. kalau CSV perlu di-import ulang karena berkasnya direvisi).
TRUNCATE TABLE stg_import_pm_ekstra_dinkes;

-- ── Verifikasi SESUDAH CSV diimpor (jalankan semua sebelum TAHAP 2) ─────────
--   SELECT count(*) FROM stg_import_pm_ekstra_dinkes;                        -- 22795
--   SELECT count(DISTINCT nibar) FROM stg_import_pm_ekstra_dinkes;           -- 22795
--   SELECT left(nibar,8) AS kepala, count(*) FROM stg_import_pm_ekstra_dinkes
--     GROUP BY 1;                                            -- HANYA 12023506
--   SELECT count(*) FROM stg_import_pm_ekstra_dinkes WHERE length(nibar) <> 45; -- 0
--   SELECT count(*) FROM stg_import_pm_ekstra_dinkes WHERE golongan <> '1.3.2';  -- 0
--   SELECT intra_ekstra, count(*) FROM stg_import_pm_ekstra_dinkes GROUP BY 1;   -- ekstra 22795
--   SELECT kondisi_barang, count(*) FROM stg_import_pm_ekstra_dinkes GROUP BY 1; -- Baik 22795
--   -- baris kosong tak ikut terbawa (keempatnya HARUS 0):
--   SELECT count(*) FILTER (WHERE nibar IS NULL)   AS a,
--          count(*) FILTER (WHERE kode IS NULL)    AS b,
--          count(*) FILTER (WHERE skpd_id IS NULL) AS c,
--          count(*) FILTER (WHERE nilai_perolehan IS NULL OR nilai_perolehan <= 0) AS d
--     FROM stg_import_pm_ekstra_dinkes;
--   -- angkanya utuh & sudah 2 desimal (kelimanya HARUS 0):
--   -- kolom integer benar-benar bulat (derau float sudah dibulatkan) — 0:
--   SELECT count(*) FILTER (WHERE sisa_masa_manfaat_smt IS NULL AND masa_manfaat_smt IS NOT NULL) AS sisa_hilang
--     FROM stg_import_pm_ekstra_dinkes;
--   SELECT count(*) FILTER (WHERE nilai_buku_awal <> nilai_perolehan - akumulasi_2025) AS a,
--          count(*) FILTER (WHERE jumlah * harga_satuan <> nilai_perolehan)            AS b,
--          count(*) FILTER (WHERE akumulasi_2025 > nilai_perolehan)                    AS c,
--          count(*) FILTER (WHERE sisa_masa_manfaat_smt > masa_manfaat_smt)            AS d,
--          count(*) FILTER (WHERE scale(nilai_perolehan) > 2 OR scale(akumulasi_2025) > 2
--                              OR scale(beban_penyusutan_per_smt) > 2)                 AS e
--     FROM stg_import_pm_ekstra_dinkes;
--   -- totalnya cocok dgn CSV (SUDAH dibulatkan, bukan angka mentah berkas asli):
--   SELECT round(sum(nilai_perolehan),2) AS perolehan,   -- 2798479468.99
--          round(sum(akumulasi_2025),2)  AS akumulasi,   -- 2370173730.23
--          round(sum(nilai_buku_awal),2) AS nilai_buku   --  428305738.76
--     FROM stg_import_pm_ekstra_dinkes;
