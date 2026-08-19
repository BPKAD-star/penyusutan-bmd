-- ============================================================================
-- Import Gedung & Bangunan EKSTRAKOMPTABEL 2025 (golongan 1.3.3)
-- TAHAP 1: staging (2026-08-19).
--
-- Sumber: `Import GB Esktrakom 2025.xlsx` (sheet 'Import', 1.832 baris isi,
-- 40 kolom) → dibersihkan ke `arsip-import/stg_import_gb_ekstra.csv`
-- (23 kolom). Kolom yang 100% KOSONG atau 100% berisi placeholder '-' di
-- SELURUH file DIBUANG: created_at, spesifikasi_lainnya, merek_tipe,
-- no_polisi/bpkb/rangka/mesin, nomor/tanggal/nama dokumen kepemilikan,
-- jenis_hak, wilayah_kode, latitude, longitude, foto_paths, pemanfaatan.
-- ⚠️ `arsip-import/` GITIGNORED — data aset live pemda, jangan pernah
-- di-commit. Berkas xlsx sumbernya juga jangan ditaruh di root repo.
--
-- Pola SAMA dgn import ATL Diknas (20260720_01/02): staging → aset_awal_2026
-- → aset → transaksi_bmd ('saldo_awal', 2025-S2, 2025-12-31, retroaktif —
-- sudah di-whitelist migrasi 20260710_10).
--
-- ⚠️ CATATAN ISI FILE (hasil analisis PENUH atas 1.832 baris, bukan asumsi):
--   1. **Gedung & Bangunan (1.3.3) DISUSUTKAN** — beda mendasar dari batch ATL
--      1.3.5 sebelumnya. Karena itu masa_manfaat_smt / sisa_masa_manfaat_smt /
--      beban_penyusutan_per_smt / akumulasi_2025 WAJIB ikut ke snapshot DAN ke
--      payload ledger. Kalau dikosongkan seperti pola ATL, seluruh 1.832 barang
--      akan mulai disusutkan dari nol pada 2026 — akumulasi Rp4,6 miliar hilang
--      tanpa satu pun pesan error.
--   2. intra_ekstra 100% "Ekstra" di file → PAKAI apa adanya (di-lowercase-kan
--      jadi 'ekstra' saat CSV dibuat). TIDAK dihitung ulang dari
--      batas_kapitalisasi — pelajaran migrasi 20260716_04. Kepala NIBAR-nya
--      juga `12023506` (segmen ke-2 = 02 = ekstra), jadi file & NIBAR sepakat.
--   3. kondisi_barang 100% "Baik" (cocok CHECK aset_kondisi_barang_check).
--      golongan 100% '1.3.3'. satuan 100% "Unit". jumlah 100% 1.
--   4. **Empat identitas aritmetika diuji, SEMUANYA 0 pelanggaran:**
--        nilai_buku_awal = nilai_perolehan - akumulasi_2025
--        jumlah x harga_satuan = nilai_perolehan
--        beban_per_smt = nilai_perolehan / masa_manfaat_smt
--        akumulasi_2025 = beban_per_smt x (masa_manfaat_smt - sisa)
--      Jadi akumulasi_2025 diambil APA ADANYA dari file, tidak diturunkan.
--   5. masa_manfaat_smt seragam 100 (50 tahun); sisa 0..99.
--   6. tgl_perolehan 1912-06-30 s.d. 2025-12-30 — tidak ada yang di masa depan,
--      aman untuk baris ledger retroaktif 2025-S2.
--   7. NIBAR 100% unik di dalam file (1.832 = 1.832), semuanya 45 digit,
--      kepala `12023506`. **Tidak ada satu pun yang bentrok** dgn NIBAR yang
--      sudah ada di `aset`/`aset_awal_2026` (dicek: 9 NIBAR ber-kepala
--      `12023506` yang sudah ada semuanya milik barang lain — 7 Lapak UMKM,
--      1 BKAD dihapus, 1 buku ATL).
--   8. skpd_id mencakup **593 SKPD** (sekolah/UPT) — SEMUANYA sudah terdaftar
--      di `admin_skpd` (dicek, 0 yang tak dikenal).
--   9. 76 kode barang, **SEMUANYA sudah terdaftar** di `admin_kodefikasi_bmd`
--      (dicek, 0 yang tak dikenal) → TIDAK perlu remap '.001'→'.999' seperti
--      batch ATL Diknas.
--  10. `luas` terisi sungguhan (1.406 baris ber-nilai, 426 baris nol) → ikut.
--      `keterangan` cuma 2 baris berisi ("26 meter", "55 meter") → tetap ikut.
--  11. ⚠️ **2 baris `nama_barang`-nya KOSONG** di file: Rumah Genset (UPTD
--      Puskesmas Puncu, skpd 171) & Paving (UPTD Puskesmas Tanon, skpd 165);
--      NIBAR lengkapnya ada di VERIFIKASI AKHIR no. 6 pada TAHAP 2.
--      `aset_awal_2026.nama_barang` NOT NULL, jadi TAHAP 2 menjatuhkannya ke
--      `uraian_barang`. Itu substitusi supaya import tak gagal total, BUKAN
--      data asli — betulkan lewat Edit Spesifikasi sesudah import.
--
-- NILAI BATCH: 1.832 barang · perolehan Rp7.944.580.205,60 ·
-- akumulasi 2025 Rp4.615.763.603,37 · nilai buku awal Rp3.328.816.602,23.
--
-- PRASYARAT (WAJIB, urut):
--   (a) 20260710_10_whitelist_saldo_awal_retroaktif.sql SUDAH dijalankan
--       (sudah dipakai batch-batch sebelumnya, harusnya sudah live).
--   (b) Jalankan migrasi INI (bikin tabel staging).
--   (c) Isi `stg_import_gb_ekstra` 1.832 baris dari
--       `arsip-import/stg_import_gb_ekstra.csv` lewat Supabase
--       Table Editor → Import data from CSV.
--   (d) Blok VERIFIKASI PRA-SYARAT di TAHAP 2 (20260819_05) menghasilkan aman.
-- Re-runnable / idempotent (semua guard NOT EXISTS ada di TAHAP 2).
-- ============================================================================

CREATE TABLE IF NOT EXISTS stg_import_gb_ekstra (
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
  luas                     numeric,
  uraian_barang            text,
  keterangan               text,
  jumlah                   int,
  satuan                   text,
  harga_satuan             numeric,
  penggunaan_pengamanan    text,
  asal_usul                text,
  kondisi_barang           text,
  tahun_pengadaan          int,
  golongan                 text
);

-- Verifikasi setelah CSV diimpor (SEMUA harus sesuai sebelum lanjut TAHAP 2):
--   SELECT count(*) FROM stg_import_gb_ekstra;                             -- 1832
--   SELECT count(DISTINCT nibar) FROM stg_import_gb_ekstra;                -- 1832
--   SELECT count(*) FROM stg_import_gb_ekstra WHERE golongan <> '1.3.3';   -- 0
--   SELECT intra_ekstra, count(*) FROM stg_import_gb_ekstra GROUP BY 1;    -- 100% ekstra
--   SELECT kondisi_barang, count(*) FROM stg_import_gb_ekstra GROUP BY 1;  -- 100% Baik
--   SELECT sum(nilai_perolehan), sum(akumulasi_2025) FROM stg_import_gb_ekstra;
--     -- 7944580205.60 dan 4615763603.37
--   -- identitas aritmetika harus tetap 0 sesudah lewat CSV:
--   SELECT count(*) FROM stg_import_gb_ekstra
--     WHERE abs((nilai_perolehan - akumulasi_2025) - nilai_buku_awal) > 0.5;  -- 0
