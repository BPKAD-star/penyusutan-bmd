-- ============================================================================
-- Import Aset Lain-Lain Diknas (golongan 1.5.4) — TAHAP 1: staging (2026-07-19).
-- Sumber: `Import Aset Lain Lain Diknas.xlsx` (6.701 baris, sheet 'ALL', 0 baris
-- kosong) → `stg_import_aset_lain_lain_diknas.csv` (30 kolom).
--
-- Batch KEDUA golongan 1.5.4 (setelah 20260718_01/02 "Lengkap" 1.958 baris).
-- Khusus Dinas Pendidikan — mayoritas buku perpustakaan ("Eksemplar") &
-- barang rusak berat, direklas dari golongan lain.
--
-- ⚠️ intra_ekstra DIPERTAHANKAN dari file (100% "Intra" di 6.701 baris) — sama
-- keputusan dgn import 1.5.4 & ATL sebelumnya (kebijakan akuntansi asli, BUKAN
-- dihitung ulang dari batas_kapitalisasi). Lihat memory
-- feedback_intra_ekstra_baseline_import.md.
--
-- ⚠️ SEMANTIK BEKU (1.5.4): begitu materialisasi TAHAP 2 nulis ledger
-- 'saldo_awal' dgn kode=1.5.4.x, engine (lib/engine/penyusutan.ts, guard
-- perlakuan='lain_lain') OTOMATIS tidak akrual lagi. nilai_buku_awal/
-- akumulasi_2025 yg diimpor = FROZEN. 2.539 dari 6.701 baris nilai_buku_awal>0
-- (beku mid-life), 4.162 sudah 0. TIDAK perlu perubahan kode engine.
-- Kolom masa_manfaat/sisa/beban 100% kosong di file ini → NULL (tak dipakai
-- utk 1.5.4).
--
-- ⚠️ RISIKO DOBEL-HITUNG LEBIH BESAR dari batch sebelumnya: 4.161 dari 6.701
-- baris nama-nya "Kode Asal: 1.3.2..." (dari Peralatan & Mesin — yg baru kita
-- import 218rb kemarin), 2.507 dari 1.3.5 (ATL), 3 dari 1.3.1. TAHAP 2 WAJIB
-- jalankan spot-check dobel-hitung (query pra-syarat) SEBELUM insert.
--
-- Tabel staging TERPISAH (`_diknas`) dari batch "Lengkap" sebelumnya — biar
-- jelas & tak campur. NOT EXISTS guard di TAHAP 2 tetap lindungi kalau ada
-- NIBAR yg overlap dgn 1.5.4 yg sudah masuk.
--
-- LANGKAH IMPOR (manual): jalankan migrasi ini → Table Editor →
-- stg_import_aset_lain_lain_diknas → Import CSV (~2,2 MB, lancar) →
-- verifikasi count 6701 → lanjut TAHAP 2.
-- ============================================================================

CREATE TABLE IF NOT EXISTS stg_import_aset_lain_lain_diknas (
  nibar                        text,
  kode                         text,
  nama_barang                  text,
  skpd_id                      bigint,
  intra_ekstra                 text,
  nilai_perolehan              numeric,
  tgl_perolehan                date,
  akumulasi_2025               numeric,
  nilai_buku_awal              numeric,
  spesifikasi_lainnya          text,
  merek_tipe                   text,
  no_polisi                    text,
  no_bpkb                      text,
  no_rangka                    text,
  no_mesin                     text,
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
  kondisi_barang               text,
  tahun_pengadaan              int,
  golongan                     text
);

-- Verifikasi setelah CSV diimpor:
--   SELECT count(*) FROM stg_import_aset_lain_lain_diknas;                 -- 6701
--   SELECT count(DISTINCT nibar) FROM stg_import_aset_lain_lain_diknas;    -- 6701
--   SELECT count(*) FROM stg_import_aset_lain_lain_diknas WHERE golongan<>'1.5.4'; -- 0
--   SELECT intra_ekstra, count(*) FROM stg_import_aset_lain_lain_diknas GROUP BY 1; -- 100% intra
