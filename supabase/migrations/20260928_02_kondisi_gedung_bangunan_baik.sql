-- ============================================================================
-- 20260928_02 — Kondisi Gedung & Bangunan (1.3.3) diisi 'Baik'
--
-- Permintaan user 2026-09-28: isi kondisi_barang yang kosong untuk seluruh
-- Gedung & Bangunan (1.3.3) jadi 'Baik', di Daftar Barang live (aset) DAN
-- Saldo Awal (aset_awal_2026). Non-ledger, murni kolom deskriptif — pola sama
-- dgn Kondisi Tanah (migrasi 20260924_01).
--
-- Diverifikasi ke produksi SEBELUM dijalankan: golongan 1.3.3 cuma punya DUA
-- keadaan — NULL atau sudah 'Baik' (1.852 baris aktif, 1.851 baris baseline
-- sudah 'Baik' sebelum migrasi ini). Tidak ada satu pun baris berkondisi
-- 'Rusak Ringan'/'Rusak Berat'/'Hilang'/'Tidak Ditemukan' yang bisa tertimpa —
-- predikat tetap WHERE kondisi_barang IS NULL, bukan tanpa syarat.
--
-- ⚠️ BEDA dari 20260924_01 — baseline HANYA diisi utk NIBAR yang BELUM
-- terkunci (`fn_aset_awal_2026_terkunci_batch`, migrasi 20260918_01):
-- permintaan user eksplisit "kalo di saldo awal sudah ada transaksi di
-- depannya, di daftar barang livenya aja". Register live (`aset`) tetap
-- diisi utk SEMUA baris aktif, terkunci di baseline atau tidak — kuncinya
-- cuma menjaga `aset_awal_2026` (foto beku 2025), bukan register hidup.
--
-- Diuji transaksi+ROLLBACK dulu sebelum dijalankan permanen via MCP Supabase.
-- Hasil TERUKUR: aset aktif 1.852→8.352 baris 'Baik' (6.500 diisi, 0 NULL
-- tersisa); aset_awal_2026 1.851→8.314 baris 'Baik' (6.463 diisi), 36 baris
-- tetap NULL (terkunci — sudah ada transaksi lain di depannya, mis. reklas/
-- pengalihan/koreksi spesifikasi yang belum dibatalkan).
--
-- Tak menyentuh ledger, tak butuh run ulang engine — kolom ini di luar
-- perhitungan penyusutan & Laporan BMD sepenuhnya. Idempotent (WHERE ... IS
-- NULL) — aman dijalankan ulang, sudah tak ada baris tersisa utk diisi
-- kecuali barang baru masuk NULL sesudah tanggal ini.
-- ============================================================================

WITH kandidat AS (
  SELECT nibar FROM aset_awal_2026 WHERE golongan = '1.3.3' AND kondisi_barang IS NULL
),
terkunci AS (
  SELECT nibar FROM fn_aset_awal_2026_terkunci_batch((SELECT array_agg(nibar) FROM kandidat))
)
UPDATE aset_awal_2026
   SET kondisi_barang = 'Baik'
 WHERE golongan = '1.3.3'
   AND kondisi_barang IS NULL
   AND nibar NOT IN (SELECT nibar FROM terkunci);

UPDATE aset
   SET kondisi_barang = 'Baik'
 WHERE golongan = '1.3.3'
   AND status = 'aktif'
   AND kondisi_barang IS NULL;
