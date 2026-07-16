-- ============================================================================
-- Import Peralatan dan Mesin (golongan 1.3.2) — TAHAP 1: staging saja
-- (2026-07-16). Sumber: `Import Peralatan Mesin Lengkap.xlsx` (218.251 baris,
-- sheet 'PM') → dibersihkan ke `stg_import_peralatan_mesin.csv` (24 kolom;
-- 13 kolom yang 100% null/placeholder di SELURUH 218.251 baris DIBUANG:
-- no_mesin, luas, nomor/tanggal/nama_dokumen_kepemilikan, jenis_hak,
-- wilayah_kode, alamat_detail, latitude, longitude, foto_paths,
-- penggunaan_pengamanan, pemanfaatan, keterangan — sama prinsip dgn
-- Tanah/Gedung/Jalan/ATL Lengkap).
--
-- ⚠️ intra_ekstra SENGAJA TIDAK dimasukkan ke staging (beda dari file sumber
-- yang isinya 100% "Intra" di semua 218.251 baris — mencurigakan seragam,
-- kemungkinan besar bukan hasil klasifikasi asli per barang). Materialisasi
-- nanti WAJIB hitung ulang dari admin_kodefikasi_bmd.batas_kapitalisasi
-- (pola Jalan/Gedung/Tanah), BUKAN pola ATL yang percaya kolom file.
--
-- ⚠️ nama_barang: 4.770 baris nilainya berupa ANGKA (bukan teks nama) di file
-- sumber — dikonfirmasi bug data entri e-BMD lama. Materialisasi TETAP jalan
-- (kolom nullable, bukan blocker), tapi tunggu perbaikan nama_barang manual
-- pasca-approve via UPDATE by nibar (lihat percakapan terpisah). Cara
-- import (COPY/Table Editor) TIDAK mengubah isinya, cuma dipindah apa adanya.
--
-- SKALA JAUH LEBIH BESAR dari import sebelumnya (Tanah 2.732 / Gedung 6.518 /
-- Jalan 8.127 / ATL 23.416 baris) — 218.251 baris. Golongan 1.3.2 Peralatan
-- & Mesin nyaris pasti SUDAH punya baseline besar di `aset` dari impor e-BMD
-- 2025 asli (beda dgn ATL yang diduga kuat belum ada). Makanya migrasi
-- materialisasi (TAHAP 2, MENYUSUL — belum ditulis di sini sesuai permintaan)
-- WAJIB pola 3-langkah penuh (enrich NIBAR-cocok → enrich identitas-kembar →
-- insert benar-benar baru), BUKAN pola insert-only ATL. Sebelum menulis TAHAP
-- 2, WAJIB catat dulu:
--   SELECT count(*) FROM aset WHERE kode LIKE '1.3.2%';   -- baseline SEBELUM
--
-- TAHAP INI CUMA MENYIAPKAN WADAH — belum ada UPDATE/INSERT ke aset/
-- transaksi_bmd/aset_awal_2026 sama sekali. Aman dijalankan kapan pun.
--
-- LANGKAH IMPOR DATA (dilakukan MANUAL oleh user, di luar migrasi ini):
--   1. Jalankan migrasi ini (bikin tabel kosong).
--   2. Supabase Studio → Table Editor → stg_import_peralatan_mesin → Insert →
--      Import data from CSV → pilih arsip-import/stg_import_peralatan_mesin.csv.
--      ⚠️ File 46 MB / 218.251 baris — ~9x lebih besar dari import ATL barusan
--      (23.416 baris) yang sudah terbukti jalan. Kalau proses ngadat/timeout di
--      browser, kabari — CSV bisa dipecah jadi beberapa bagian (mis. 5x ~44rb
--      baris) untuk diimpor bertahap ke tabel yang sama.
--   3. Verifikasi jumlah baris (lihat query paling bawah) sebelum lanjut ke
--      TAHAP 2 (materialisasi ke aset/transaksi_bmd) di sesi berikutnya.
-- ============================================================================

CREATE TABLE IF NOT EXISTS stg_import_peralatan_mesin (
  nibar                     text,
  kode                      text,
  nama_barang               text,
  skpd_id                   bigint,
  nilai_perolehan           numeric,
  tgl_perolehan             date,
  masa_manfaat_smt          numeric,
  akumulasi_2025            numeric,
  nilai_buku_awal           numeric,
  sisa_masa_manfaat_smt     numeric,
  beban_penyusutan_per_smt  numeric,
  spesifikasi_lainnya       text,
  merek_tipe                text,
  no_polisi                 text,
  no_bpkb                   text,
  no_rangka                 text,
  uraian_barang             text,
  jumlah                    int,
  satuan                    text,
  harga_satuan              numeric,
  asal_usul                 text,
  kondisi_barang            text,
  tahun_pengadaan           int,
  golongan                  text
);

-- Verifikasi setelah CSV diimpor (jalankan manual, cocokkan dgn ekspektasi):
--   SELECT count(*) FROM stg_import_peralatan_mesin;
--     -- HARUS 218251
--   SELECT count(DISTINCT nibar) FROM stg_import_peralatan_mesin;
--     -- HARUS 218251 juga (semua nibar unik, sudah divalidasi di file sumber)
--   SELECT count(*) FROM stg_import_peralatan_mesin WHERE golongan <> '1.3.2';
--     -- HARUS 0
