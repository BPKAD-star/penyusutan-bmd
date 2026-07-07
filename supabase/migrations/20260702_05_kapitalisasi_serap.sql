-- ============================================================================
-- BMD Kabupaten Kediri — Kapitalisasi jurnal (induk + barang anak diserap)
-- Jalankan di Supabase SQL Editor SETELAH 20260702_04_batal_penghapusan.sql
--
-- Menu Kapitalisasi diubah ke alur jurnal: pilih induk + barang anak (penambahan
-- masa manfaat). Nilai anak diserap ke induk; barang anak lalu ditandai TERSERAP
-- ('kapitalisasi_serap') → berhenti disusutkan & hilang dari laporan agar nilainya
-- tidak terhitung dobel. Tetap append-only (§1.1): serap = transaksi baru.
-- ============================================================================

-- ADD VALUE tidak boleh di dalam blok transaksi; jalankan sebagai statement lepas.
ALTER TYPE jenis_transaksi_bmd ADD VALUE IF NOT EXISTS 'kapitalisasi_serap';
