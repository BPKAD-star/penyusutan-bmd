-- Backfill `aset.uraian_barang` yang kosong dari `admin_kodefikasi_bmd`.
--
-- Latar: menu Koreksi → Pemecahan Barang membuat aset pecahan TANPA mengisi
-- `uraian_barang` (Pengadaan & Perolehan Manual mengisinya; pemecahan kelewat).
-- Akibatnya KIBAR — daftar & kartu cetaknya — menampilkan "-" di kolom Uraian
-- Barang, karena KIBAR membaca kolom TERSIMPAN itu, bukan lookup kodefikasi
-- seperti Daftar Barang & Penyusutan. Sama untuk KIR (kolom 5 "Nama Barang").
--
-- Perbaikan kodenya ada dua lapis (dua-duanya sudah dipasang):
--   1. Koreksi.tsx pemecahan kini mengisi `uraian_barang` dari kodefikasi;
--   2. KIBAR (daftar + kartu) kini melihat kodefikasi dulu, kolom tersimpan
--      cuma jadi cadangan.
-- Migrasi ini membereskan baris yang TERLANJUR dibuat, supaya menu lain yang
-- membaca kolom tersimpan (KIR, Kendaraan, kartu Pengadaan, Reklasifikasi,
-- Inventarisasi) ikut benar tanpa perlu diubah satu per satu.
--
-- Skala: per 2026-08-03 cuma 11 baris dari 418.160 (7 pemecahan hari ini + 4
-- pemecahan lama). Kecil — tak ada risiko WAL/disk seperti backfill kode
-- register (20260729_04).
--
-- Aman terhadap trigger kode register: `trg_aset_kode_register` dipasang
-- `UPDATE OF skpd_id, kode, intra_ekstra, status, tgl_perolehan` — `uraian_barang`
-- tidak termasuk, jadi tak ada nomor register yang terbit ulang.

BEGIN;

UPDATE aset a
SET uraian_barang = k.uraian
FROM admin_kodefikasi_bmd k
WHERE k.kode = a.kode
  AND k.uraian IS NOT NULL
  AND k.uraian <> ''
  AND (a.uraian_barang IS NULL OR a.uraian_barang = '');

COMMIT;

-- Verifikasi: sisa yang masih kosong hanya boleh baris yang kodenya memang tak
-- punya uraian di kodefikasi (atau kodenya tak terdaftar sama sekali).
SELECT count(*) AS masih_kosong
FROM aset
WHERE uraian_barang IS NULL OR uraian_barang = '';
