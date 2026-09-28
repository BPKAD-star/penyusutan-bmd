-- ============================================================================
-- 20260928_03 — Kondisi Aset Tidak Berwujud (1.5.3) & KDP (1.3.6) diisi 'Baik'
--
-- Permintaan user 2026-09-28: isi kondisi_barang yang kosong untuk seluruh
-- Aset Tidak Berwujud (1.5.3) & Konstruksi Dalam Pengerjaan (1.3.6) jadi
-- 'Baik', di Daftar Barang live (aset) DAN Saldo Awal (aset_awal_2026).
-- Non-ledger, murni kolom deskriptif — pola sama dgn Kondisi Tanah
-- (20260924_01) & Gedung/Bangunan (20260928_02).
--
-- Diverifikasi ke produksi SEBELUM dijalankan: kedua golongan cuma punya DUA
-- keadaan — NULL atau sudah 'Baik'. Tidak ada satu pun baris berkondisi
-- 'Rusak Ringan'/'Rusak Berat'/'Hilang'/'Tidak Ditemukan' yang bisa tertimpa —
-- predikat tetap WHERE kondisi_barang IS NULL, bukan tanpa syarat.
--
-- Baseline (aset_awal_2026) HANYA diisi utk NIBAR yang BELUM terkunci
-- (`fn_aset_awal_2026_terkunci_batch`, migrasi 20260918_01) — pola yang sama
-- dgn 20260928_02. Register live (`aset`) tetap diisi utk SEMUA baris aktif,
-- terkunci di baseline atau tidak.
--
-- Diuji transaksi+ROLLBACK dulu sebelum dijalankan permanen via MCP Supabase.
-- Hasil TERUKUR: aset aktif 1.3.6 1→229 baris 'Baik' (228 diisi, 0 NULL
-- tersisa); 1.5.3 90→120 (30 diisi, 0 NULL tersisa). aset_awal_2026
-- 1.3.6 0→228 (228 diisi), 5 baris tetap NULL (terkunci — sudah ada transaksi
-- lain di depannya); 1.5.3 90→120 (30 diisi), 0 terkunci.
--
-- Tak menyentuh ledger, tak butuh run ulang engine. Idempotent (WHERE ... IS
-- NULL) — aman dijalankan ulang.
-- ============================================================================

WITH kandidat AS (
  SELECT nibar FROM aset_awal_2026 WHERE golongan IN ('1.5.3','1.3.6') AND kondisi_barang IS NULL
),
terkunci AS (
  SELECT nibar FROM fn_aset_awal_2026_terkunci_batch((SELECT array_agg(nibar) FROM kandidat))
)
UPDATE aset_awal_2026
   SET kondisi_barang = 'Baik'
 WHERE golongan IN ('1.5.3','1.3.6')
   AND kondisi_barang IS NULL
   AND nibar NOT IN (SELECT nibar FROM terkunci);

UPDATE aset
   SET kondisi_barang = 'Baik'
 WHERE golongan IN ('1.5.3','1.3.6')
   AND status = 'aktif'
   AND kondisi_barang IS NULL;
