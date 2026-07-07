-- ============================================================================
-- Tambah nilai enum 'reklas_golongan' ke jenis_transaksi_bmd — dipakai modul
-- Reklasifikasi baru utk kasus "Perubahan Fungsi BMD" (lintas golongan/rumpun,
-- mis. KDP → Gedung Bangunan, atau golongan apa pun → Aset Lain-Lain).
--
-- BEDA dari 'reklas_kode' (Kesalahan Kodefikasi, tetap satu rumpun, retroaktif):
-- 'reklas_golongan' butuh dukungan engine terpisah di hitungJadwalAset supaya
-- barang yang tadinya KDP (tidak disusutkan) baru MULAI dihitung penyusutannya
-- sejak tanggal reklas — bukan direcompute retroaktif dari tanggal perolehan
-- asli spt reklas_kode. Lihat lib/engine/penyusutan.ts.
--
-- SENGAJA file terpisah sendirian: nilai enum baru tidak aman dipakai dalam
-- statement DML pada transaksi yang sama saat ditambahkan.
-- Jalankan SETELAH 20260707_04_kolom_asal_usul_kondisi.sql.
-- ============================================================================

ALTER TYPE jenis_transaksi_bmd ADD VALUE IF NOT EXISTS 'reklas_golongan';
