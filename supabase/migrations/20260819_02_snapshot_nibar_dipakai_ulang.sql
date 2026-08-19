-- ============================================================================
-- Snapshot Saldo Awal: satu NIBAR dipakai DUA barang berbeda.
-- Akibatnya 1 barang tercatat dua kali & 1 barang hilang sama sekali.
--
-- Ditemukan user 2026-08-19 saat mengadu Daftar Barang Awal (1.3.3) dengan
-- berkas Excel-nya sendiri: 6.516 vs 6.518 barang, Rp2.123.426.002.703,02 vs
-- Rp2.126.400.413.752,02 (selisih Rp2.974.411.049). Setelah migrasi
-- 20260819_01 dijalankan, Rp1.997.697.349 dari selisih itu sudah terjelaskan
-- (dua duplikat Import Gedung yang memang dibuang). Yang TERSISA:
-- **Rp976.713.700**, dan sebabnya lain sama sekali.
--
-- -- Duduk perkaranya ---------------------------------------------------------
-- NIBAR `120135062200000000000020211330401040010000001`
-- (Dinas Pariwisata dan Kebudayaan, kode 1.3.3.04.01.04.001):
--
--   di `aset_awal_2026` -> "PAGAR PENUTUP PINTU MASUK LOKET LAMA"
--                          tgl 2021-12-17, Rp198.500.000
--                          (baris asli impor baseline, dibuat 2026-06-18)
--   di `aset`           -> "Pagar Keliling Kawasan Sri Aji Joyoboyo."
--                          tgl 2021-08-23, Rp1.175.213.700
--                          (dibuat 2026-07-10 oleh Import Gedung Lengkap)
--
-- PAGAR PENUTUP sendiri di register ber-NIBAR ...0009, bukan ...0001 — nomornya
-- bergeser antara pemuatan baseline (18 Juni) dan pemuatan register (2 Juli),
-- lalu nomor ...0001 yang ditinggalkannya dipakai ulang oleh barang lain pada
-- 10 Juli. Snapshot tak pernah ikut bergeser.
--
-- Yang membuatnya tak ketahuan selama sebulan: **`nibar` adalah PRIMARY KEY
-- `aset_awal_2026`**, dan migrasi 20260812_03 memakai `NOT EXISTS per NIBAR`
-- sebagai penjaga idempotensi. Untuk Pagar Keliling Joyoboyo — yang memang
-- punya baris ledger `saldo_awal` #9873 dan seharusnya ikut di-backfill — uji
-- itu menjawab "sudah ada", karena NIBAR-nya memang sudah ada di tabel: milik
-- barang LAIN. Jadi ia dilewati DIAM-DIAM. Sementara PAGAR PENUTUP justru
-- dapat baris kedua (...0009, 2026-08-12) karena NIBAR barunya belum ada.
--
-- Hasil akhirnya di Saldo Awal 1.3.3:
--   PAGAR PENUTUP tercatat DUA KALI     : +198.500.000 kelebihan
--   Pagar Keliling Joyoboyo HILANG      : -1.175.213.700 kekurangan
--   bersih                              : -976.713.700 (kurang catat)
--
-- Migrasi 20260812_07 tak menangkapnya: uji "snapshot yatim" di sana mencari
-- NIBAR yang TAK PUNYA pasangan di register, sedangkan ...0001 punya pasangan —
-- cuma pasangan yang salah barang.
--
-- -- Sapuan se-basis data -----------------------------------------------------
-- Diuji ke seluruh 418rb baris snapshot: NIBAR yang barang register-nya berbeda
-- (nilai atau tgl perolehan) hanya **2 baris**, dan yang kedua cuma artefak
-- pembulatan float (Jalan JAMBEAN - PURWODADI, beda 1e-7). Jadi kasus ini
-- SATU-SATUNYA. Snapshot yatim: 0. Aset `aktif` ber-`saldo_awal` yang tak punya
-- baris snapshot: 0 (202 yang tersisa semuanya `dihapus`, memang sengaja).
--
-- -- Obatnya ------------------------------------------------------------------
-- 1. BUANG baris snapshot ...0001 yang basi (isinya PAGAR PENUTUP, padahal
--    PAGAR PENUTUP sudah punya barisnya sendiri di ...0009).
-- 2. ISI baris snapshot untuk Pagar Keliling Joyoboyo dari baris ledger
--    `saldo_awal` #9873 — bentuk SELECT-nya disalin apa adanya dari migrasi
--    20260812_03 supaya aturannya persis sama (nilai & kolom penyusutan dari
--    LEDGER, bukan dari `aset` sekarang).
--
-- `skpd_id` diambil dari register apa adanya: aset ini tak punya satu pun baris
-- `pengalihan_status`/`mutasi_internal` (dicek), jadi pemiliknya akhir 2025 =
-- pemiliknya sekarang. Tak perlu CTE `skpd_2025` seperti 20260812_03.
--
-- Urutan DELETE lalu INSERT DISENGAJA: `nibar` primary key, jadi barisnya harus
-- kosong dulu sebelum diisi pemilik yang benar.
--
-- Idempoten: DELETE disaring nama+nilai barang yang basi (kalau sudah pernah
-- jalan, tak ada yang cocok); INSERT dijaga `NOT EXISTS` per NIBAR.
-- Tak ada perubahan skema & tak ada perubahan kode -> urutan deploy bebas.
-- Engine TIDAK perlu di-run ulang: `aset_awal_2026` display-only, tak pernah
-- dibaca engine (engine replay dari ledger, dan ledgernya sudah benar sejak
-- awal — itu sebabnya Laporan BMD & Rekonsiliasi tak pernah ikut salah).
-- ============================================================================

-- -- 1. Buang baris snapshot yang NIBAR-nya sudah pindah pemilik -------------
DELETE FROM aset_awal_2026
WHERE nibar = '120135062200000000000020211330401040010000001'
  AND nama_barang = 'PAGAR PENUTUP PINTU MASUK LOKET LAMA'
  AND nilai_perolehan = 198500000
  -- Jangan dibuang kalau barisnya justru satu-satunya jejak barang itu.
  AND EXISTS (
    SELECT 1 FROM aset_awal_2026 w2
    WHERE w2.nibar = '120135062200000000000020211330401040010000009'
      AND w2.nama_barang = 'PAGAR PENUTUP PINTU MASUK LOKET LAMA'
  );

-- -- 2. Isi baris snapshot untuk barang yang selama ini hilang ---------------
INSERT INTO aset_awal_2026 (
  nibar, kode, nama_barang, skpd_id, intra_ekstra, nilai_perolehan, tgl_perolehan,
  masa_manfaat_smt, akumulasi_2025, nilai_buku_awal, sisa_masa_manfaat_smt,
  beban_penyusutan_per_smt,
  spesifikasi_lainnya, merek_tipe, no_polisi, no_bpkb, no_rangka, no_mesin, luas,
  nomor_dokumen_kepemilikan, tanggal_dokumen_kepemilikan, nama_dokumen_kepemilikan,
  jenis_hak, wilayah_kode, alamat_detail, latitude, longitude, foto_paths,
  uraian_barang, keterangan, jumlah, satuan, harga_satuan, penggunaan_pengamanan,
  asal_usul, kondisi_barang, tahun_pengadaan, golongan
)
SELECT
  a.nibar, a.kode, a.nama_barang, a.skpd_id, a.intra_ekstra,
  t.nilai,                                   -- nilai BEKU akhir 2025, bukan a.nilai_perolehan
  a.tgl_perolehan,
  NULLIF(t.payload->>'masa_manfaat_smt', '')::numeric::smallint,
  COALESCE(NULLIF(t.payload->>'akumulasi_2025', '')::numeric, 0),
  COALESCE(
    NULLIF(t.payload->>'nilai_buku_awal', '')::numeric,
    t.nilai - COALESCE(NULLIF(t.payload->>'akumulasi_2025', '')::numeric, 0)
  ),
  NULLIF(t.payload->>'sisa_masa_manfaat_smt', '')::numeric::smallint,
  NULLIF(t.payload->>'beban_per_smt', '')::numeric,
  a.spesifikasi_lainnya, a.merek_tipe, a.no_polisi, a.no_bpkb, a.no_rangka, a.no_mesin, a.luas,
  a.nomor_dokumen_kepemilikan, a.tanggal_dokumen_kepemilikan, a.nama_dokumen_kepemilikan,
  a.jenis_hak, a.wilayah_kode, a.alamat_detail, a.latitude, a.longitude,
  COALESCE(a.foto_paths, '{}'),
  a.uraian_barang, a.keterangan, COALESCE(a.jumlah, 1), a.satuan, a.harga_satuan,
  a.penggunaan_pengamanan, a.asal_usul, a.kondisi_barang, a.tahun_pengadaan, a.golongan
FROM aset a
JOIN transaksi_bmd t ON t.aset_id = a.id AND t.jenis = 'saldo_awal'
WHERE a.id = 'a44d77e5-0e04-45a3-90df-0fca1a4b16c0'   -- Pagar Keliling Kawasan Sri Aji Joyoboyo.
  AND NOT EXISTS (SELECT 1 FROM aset_awal_2026 w WHERE w.nibar = a.nibar);

-- -- Pemeriksaan sesudah dijalankan ------------------------------------------
-- 1. Dua barang, dua baris, nilainya masing-masing:
--      SELECT nibar, nama_barang, nilai_perolehan FROM aset_awal_2026
--      WHERE skpd_id = 23 AND kode = '1.3.3.04.01.04.001' ORDER BY nibar;
--      -- ...0001 Pagar Keliling Kawasan Sri Aji Joyoboyo.   1.175.213.700
--      -- ...0008 Pembangunan Pagar Rest Area Dholo             214.128.000
--      -- ...0009 PAGAR PENUTUP PINTU MASUK LOKET LAMA          198.500.000
-- 2. Tak ada lagi NIBAR yang barang register-nya berbeda (sisanya cuma artefak
--    pembulatan float pada satu baris Jalan):
--      SELECT count(*) FROM aset_awal_2026 w JOIN aset a ON a.nibar = w.nibar
--      WHERE a.tgl_perolehan <> w.tgl_perolehan;                     -- 0
-- 3. Saldo Awal -> Rekapitulasi, 1.3.3 Gedung dan Bangunan:
--      kuantitas TETAP 6.516 (satu dibuang, satu ditambah)
--      Harga Perolehan 2.123.426.002.703,02 -> 2.124.402.716.403,02
--    dan angka itu sama persis dengan berkas Excel user sesudah dua duplikat
--    Import Gedung dikeluarkan (2.126.400.413.752,02 - 1.997.697.349).
-- 4. Laporan BMD & Rekonsiliasi TIDAK bergerak — keduanya membaca ledger,
--    bukan tabel snapshot ini.
