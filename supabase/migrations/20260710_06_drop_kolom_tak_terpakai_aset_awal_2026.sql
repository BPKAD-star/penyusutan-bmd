-- 20260710_06_drop_kolom_tak_terpakai_aset_awal_2026.sql
-- Drop 3 kolom di `aset_awal_2026` yang terbukti tidak pernah dipakai:
-- status_validasi, flag_kapitalisasi, catatan_anomali.
--
-- Diverifikasi sebelum drop (bukan tebakan):
--   - Grep menyeluruh ke seluruh kode aplikasi (semua migrasi + frontend):
--     TIDAK ADA satu pun tempat yang baca/tulis ke 3 kolom ini. Bahkan tabel
--     `aset_awal_2026` sendiri tidak dibuat lewat migrasi yang ter-track di
--     repo — sepertinya hasil import CSV/Table Editor langsung saat baseline
--     e-BMD awal, bukan hasil desain skema aplikasi ini.
--   - Query data (2026-07-10) atas 9.603 baris: status_validasi &
--     flag_kapitalisasi cuma punya 1 nilai unik masing-masing (default statis
--     dari proses import, bukan hasil validasi per-baris beneran), dan
--     catatan_anomali NOL baris berisi apa pun. Kolom murni kosong/seragam,
--     tidak menyimpan informasi apa pun yang bisa hilang.
--
-- `aset_awal_2026` = foto baseline saldo akhir 2025 (display-only, tak pernah
-- disentuh transaksi — lihat CLAUDE.md) — drop kolom di sini SAMA SEKALI tidak
-- menyentuh ledger (transaksi_bmd) atau engine penyusutan.

ALTER TABLE aset_awal_2026 DROP COLUMN IF EXISTS status_validasi;
ALTER TABLE aset_awal_2026 DROP COLUMN IF EXISTS flag_kapitalisasi;
ALTER TABLE aset_awal_2026 DROP COLUMN IF EXISTS catatan_anomali;
