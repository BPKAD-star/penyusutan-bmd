-- ============================================================================
-- Tambah nilai enum 'koreksi_pencatatan_ganda' ke jenis_transaksi_bmd — dipakai
-- modul Koreksi utk gabung barang yang kecatat dua kali (duplikat). Efeknya di
-- engine SAMA PERSIS dgn 'batal_pengadaan' (soft-delete retroaktif, penyusutan
-- berhenti sejak awal) — dipisah jenisnya sendiri cuma biar kebeda di laporan/
-- audit (kenapa barang ini hilang: dibatalkan krn duplikat, bukan krn kontrak
-- dibuka kunci). Lihat lib/engine/penyusutan.ts & lib/transaksi.ts.
--
-- SENGAJA file terpisah sendirian: nilai enum baru tidak aman dipakai dalam
-- statement DML pada transaksi yang sama saat ditambahkan.
-- Jalankan SETELAH 20260708_02_reklasifikasi_jurnal_header.sql.
-- ============================================================================

ALTER TYPE jenis_transaksi_bmd ADD VALUE IF NOT EXISTS 'koreksi_pencatatan_ganda';
