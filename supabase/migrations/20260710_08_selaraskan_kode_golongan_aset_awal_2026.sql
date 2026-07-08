-- Lanjutan penyamaan aset_awal_2026 dgn aset:
--   1. Rename kode_barang -> kode, biar konsisten dgn nama kolom di `aset`
--      (bukan sebaliknya — aset.kode dipakai puluhan file + FK ke
--      kodefikasi_bmd, blast radius jauh lebih kecil kalau yang diubah
--      aset_awal_2026 saja).
--   2. Tambah kolom golongan (text) + backfill dari aset via NIBAR — sekadar
--      konsistensi; catatan: aset.golongan sendiri sudah tidak dibaca kode
--      manapun saat ini (app selalu hitung golongan on-the-fly dari `kode`).
--
-- SENGAJA TIDAK ditambah (sudah dikonfirmasi user 2026-07-10): cara_perolehan,
-- status — dua-duanya metadata siklus hidup `aset` yang nilainya konstan utk
-- semua baris baseline (selalu 'saldo_awal'/'aktif'), nol informasi tambahan.

ALTER TABLE aset_awal_2026 RENAME COLUMN kode_barang TO kode;

ALTER TABLE aset_awal_2026 ADD COLUMN IF NOT EXISTS golongan text;
UPDATE aset_awal_2026 s SET golongan = a.golongan
FROM aset a
WHERE a.nibar = s.nibar;
