-- ============================================================================
-- BMD Kabupaten Kediri — Pembatalan Kapitalisasi
-- Jalankan di Supabase SQL Editor SETELAH 20260702_05_kapitalisasi_serap.sql
--
-- Delete transaksi kapitalisasi = transaksi 'batal_kapitalisasi' (append-only §1.1):
--   - di induk: payload.target_trx_id menandai kapitalisasi mana yang dibatalkan;
--     engine MENGABAIKAN kapitalisasi itu saat replay → nilai/masa manfaat induk
--     kembali seperti semula. payload.nilai_perolehan_baru mengembalikan nilai aset.
--   - di barang anak: mengembalikan status ke 'aktif' (batal diserap) & penyusutan
--     anak lanjut lagi.
-- ============================================================================

-- ADD VALUE tidak boleh di dalam blok transaksi; jalankan sebagai statement lepas.
ALTER TYPE jenis_transaksi_bmd ADD VALUE IF NOT EXISTS 'batal_kapitalisasi';
