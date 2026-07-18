-- ============================================================================
-- Import Aset Lain-Lain (golongan 1.5.4) — TAHAP 1: staging saja (2026-07-18).
-- Sumber: `Import Aset Lain Lain Lengkap.xlsx` (2.732 baris mentah, sheet
-- 'ALL' — 774 baris di antaranya KOSONG TOTAL/artefak ekor file, DIBUANG saat
-- dibersihkan → `stg_import_aset_lain_lain.csv` (1.958 baris valid, 33 kolom).
--
-- ⚠️ BEDA dari import Peralatan & Mesin (20260716_02/03): kolom yang DIBUANG
-- dari staging cuma yang 100% kosong di SELURUH 1.958 baris (wilayah_kode,
-- latitude, longitude, foto_paths, pemanfaatan, kondisi_barang, created_at) —
-- kolom lain (luas, no_mesin, dokumen kepemilikan, jenis_hak, dst) TETAP
-- dipakai walau jarang terisi, karena 1.5.4 bisa menampung reklas dari
-- golongan MANA PUN (tanah/gedung/kendaraan/dll), bukan cuma pola kendaraan.
--
-- ⚠️ intra_ekstra KALI INI DIPERTAHANKAN dari file (100% "Intra" di seluruh
-- 1.958 baris) — DIKONFIRMASI user (2026-07-18) ini kebijakan akuntansi asli,
-- BUKAN keseragaman mencurigakan seperti kasus Peralatan & Mesin kemarin
-- (yang ternyata SALAH dihitung ulang, lihat migrasi 20260716_04 & memory
-- feedback_intra_ekstra_baseline_import.md). Jangan dihitung ulang dari
-- batas_kapitalisasi utk golongan ini.
--
-- ⚠️ SEMANTIK PENYUSUTAN — golongan 1.5.4 BEKU (lib/engine/penyusutan.ts:319-334,
-- guard `perlakuan !== 'lain_lain'`): begitu materialisasi TAHAP 2 (menyusul)
-- menulis ledger 'saldo_awal' dgn kode=1.5.4.x, engine OTOMATIS tidak pernah
-- akrual lagi sejak baseline — nilai_buku_awal/akumulasi_2025 yang diimpor DI
-- SINI adalah angka yang akan FROZEN SELAMANYA (sampai reklas keluar dari
-- 1.5.4). TIDAK ADA perubahan kode engine yang diperlukan — sudah handled.
-- 1.801 dari 1.958 baris punya nilai_buku_awal > 0 (belum habis disusutkan
-- saat direklas jadi 1.5.4 — freeze di tengah jalan, BUKAN selalu di titik 0).
--
-- ⚠️ 1.868 dari 1.958 baris (95%) nama_barang-nya menyebut "Kode Asal:
-- 1.3.x..." — barang ini fisiknya SAMA dgn yg tadinya golongan lain, tapi
-- NIBAR-nya BEDA (di-generate ulang khusus utk 1.5.4). User sudah konfirmasi
-- (2026-07-18) file sumber e-BMD asal SUDAH mengeluarkan barang ini dari
-- daftar golongan lamanya (tidak dobel), TAPI migrasi TAHAP 2 tetap
-- menyertakan query spot-check pra-syarat sbg jaring pengaman sebelum insert.
--
-- TAHAP INI CUMA MENYIAPKAN WADAH — belum ada UPDATE/INSERT ke aset/
-- transaksi_bmd/aset_awal_2026 sama sekali. Aman dijalankan kapan pun.
--
-- LANGKAH IMPOR DATA (manual, di luar migrasi ini):
--   1. Jalankan migrasi ini (bikin tabel kosong).
--   2. Table Editor → stg_import_aset_lain_lain → Insert → Import data from CSV
--      → arsip-import/stg_import_aset_lain_lain.csv (1.958 baris, ~600 KB —
--      jauh lebih kecil dari import P&M kemarin, harusnya lancar sekali jalan).
--   3. Verifikasi jumlah baris (query di bawah) sebelum lanjut TAHAP 2.
-- ============================================================================

CREATE TABLE IF NOT EXISTS stg_import_aset_lain_lain (
  nibar                        text,
  kode                         text,
  nama_barang                  text,
  skpd_id                      bigint,
  intra_ekstra                 text,
  nilai_perolehan              numeric,
  tgl_perolehan                date,
  masa_manfaat_smt             numeric,
  akumulasi_2025               numeric,
  nilai_buku_awal              numeric,
  sisa_masa_manfaat_smt        numeric,
  beban_penyusutan_per_smt     numeric,
  spesifikasi_lainnya          text,
  merek_tipe                   text,
  no_polisi                    text,
  no_bpkb                      text,
  no_rangka                    text,
  no_mesin                     text,
  luas                         numeric,
  nomor_dokumen_kepemilikan    text,
  tanggal_dokumen_kepemilikan  date,
  nama_dokumen_kepemilikan     text,
  jenis_hak                    text,
  alamat_detail                text,
  uraian_barang                text,
  keterangan                   text,
  jumlah                       int,
  satuan                       text,
  harga_satuan                 numeric,
  penggunaan_pengamanan        text,
  asal_usul                    text,
  tahun_pengadaan              int,
  golongan                     text
);

-- Verifikasi setelah CSV diimpor:
--   SELECT count(*) FROM stg_import_aset_lain_lain;                    -- HARUS 1958
--   SELECT count(DISTINCT nibar) FROM stg_import_aset_lain_lain;       -- HARUS 1958 juga
--   SELECT count(*) FROM stg_import_aset_lain_lain WHERE golongan <> '1.5.4'; -- HARUS 0
--   SELECT intra_ekstra, count(*) FROM stg_import_aset_lain_lain GROUP BY 1;  -- harus 100% 'intra'
