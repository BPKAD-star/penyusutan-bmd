-- ============================================================================
-- Isi `kondisi_barang` kosong untuk seluruh Tanah (1.3.1) jadi 'Baik'
-- (permintaan user 2026-09-24), di kedua tabel yang menampilkan kolom ini:
-- `aset` (Daftar Barang, register HIDUP) & `aset_awal_2026` (Saldo Awal,
-- baseline BEKU 2025). Non-ledger, murni kolom deskriptif — sama seperti
-- koreksi spesifikasi lain lewat pintu Saldo Awal (20260728_01) & Koreksi.
--
-- DIVERIFIKASI ke produksi SEBELUM dijalankan: seluruh Tanah cuma punya DUA
-- keadaan — `NULL` atau sudah `'Baik'`. TIDAK ADA satu pun baris berkondisi
-- 'Rusak Ringan'/'Rusak Berat'/'Hilang'/'Tidak Ditemukan' yang bisa tertimpa.
-- Jadi ini murni mengisi kekosongan, bukan menimpa penilaian kondisi yang
-- sudah ada — makanya predikatnya tetap `WHERE kondisi_barang IS NULL`
-- (bukan tanpa syarat), supaya kalau suatu saat ada nilai lain yang sempat
-- masuk di antara verifikasi & eksekusi, ia tidak ikut tertimpa diam-diam.
--
-- SCOPE: `aset` HANYA `status='aktif'` (yang tampil di Daftar Barang) — Tanah
-- `status='dihapus'` (6 baris NULL) sengaja DILEWATI, barang yang sudah keluar
-- register tak perlu kondisi baru. `aset_awal_2026` tak punya kolom status
-- (snapshot beku), jadi seluruh barisnya diisi.
--
-- Posisi terukur SEBELUM (produksi, 2026-09-24):
--   aset          aktif   Baik=126   NULL=2615
--   aset          dihapus Baik=34    NULL=6   (dilewati)
--   aset          draft   Baik=6     NULL=0
--   aset_awal_2026        Baik=118   NULL=2614
--
-- SESUDAH (diverifikasi):
--   aset aktif Tanah      : 2741 baris, semuanya 'Baik'   (126+2615)
--   aset_awal_2026 Tanah  : 2732 baris, semuanya 'Baik'   (118+2614)
--   aset dihapus Tanah    : 6 baris tetap NULL (tak disentuh)
--
-- Tak menyentuh ledger, tak butuh backfill engine — kolom ini di luar
-- perhitungan penyusutan/Laporan BMD sama sekali.
-- ============================================================================

UPDATE aset SET kondisi_barang = 'Baik'
WHERE kode LIKE '1.3.1.%' AND status = 'aktif' AND kondisi_barang IS NULL;

UPDATE aset_awal_2026 SET kondisi_barang = 'Baik'
WHERE golongan = '1.3.1' AND kondisi_barang IS NULL;
