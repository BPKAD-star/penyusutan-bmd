-- ============================================================================
-- BMD Kabupaten Kediri — Pembatalan Penghapusan (jurnal SIMBADA-style)
-- Jalankan di Supabase SQL Editor SETELAH 20260702_03_saldo_awal_ke_ledger.sql
--
-- Menu Penghapusan diubah ke alur jurnal (header No SK + banyak barang).
-- Ikon sampah pada barang di jurnal = transaksi pembatalan yang mengembalikan
-- aset ke status 'aktif' dan melanjutkan penyusutan sejak periode pembatalan.
-- Tetap sesuai prinsip append-only (§1.1): batal = transaksi baru, bukan hapus.
-- ============================================================================

-- ADD VALUE tidak boleh di dalam blok transaksi; jalankan sebagai statement lepas.
ALTER TYPE jenis_transaksi_bmd ADD VALUE IF NOT EXISTS 'batal_penghapusan';
