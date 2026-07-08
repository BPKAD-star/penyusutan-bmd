-- Backfill sekali jalan utk 8 kolom yang baru ditambah migrasi 20260710_05
-- (jumlah, satuan, harga_satuan, penggunaan_pengamanan, asal_usul,
-- pemanfaatan, kondisi_barang, tahun_pengadaan), dicocokkan via NIBAR — pola
-- persis sama dgn backfill migrasi 20260704_20_saldo_awal_2026_kolom_aset.sql.
--
-- ⚠️ Sama seperti backfill sebelumnya: ini menarik nilai `aset` SAAT INI, bukan
-- posisi 31 Des 2025 yang sebenarnya (aset tidak versioned, jadi tidak ada cara
-- menelusuri versi historisnya). Kalau barangnya sudah dikoreksi lewat menu
-- Koreksi setelah 2025 (mis. kondisi_barang baru diisi 2026), nilai yang masuk
-- ke aset_awal_2026 adalah versi TERKINI itu. Setelah migrasi ini jalan,
-- aset_awal_2026 kembali beku persis seperti kolom lain di tabel ini.
--
-- Jalankan SETELAH 20260710_05_selaraskan_kolom_aset_awal_2026.sql.

UPDATE aset_awal_2026 s
SET jumlah                 = a.jumlah,
    satuan                 = a.satuan,
    harga_satuan           = a.harga_satuan,
    penggunaan_pengamanan  = a.penggunaan_pengamanan,
    asal_usul              = a.asal_usul,
    pemanfaatan            = a.pemanfaatan,
    kondisi_barang         = a.kondisi_barang,
    tahun_pengadaan        = a.tahun_pengadaan
FROM aset a
WHERE a.nibar = s.nibar;

-- Verifikasi:
--   SELECT count(*) FROM aset_awal_2026 WHERE kondisi_barang IS NOT NULL;
--   -- bandingkan dgn: SELECT count(*) FROM aset WHERE kondisi_barang IS NOT NULL;
