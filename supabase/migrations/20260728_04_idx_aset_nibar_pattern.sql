-- ============================================================================
-- INDEX `nibar` utk pencarian prefiks — generator NIBAR bisa kena timeout dan
-- (dulu) diam-diam mengulang nomor urut dari 1 (2026-07-28).
--
-- GEJALA: Pengadaan → Setujui → "gagal membuat barang: duplicate key value
-- violates unique constraint aset_nibar_key". Kontrak Lemari Es (3 unit, BKAD)
-- pernah disetujui 21 Juli lalu dibuka kunci; 3 baris lamanya masih ada
-- (status 'dihapus', nomor urut 0000001-0000003 — NIBAR sengaja dipertahankan
-- untuk audit). Approve ulang MESTINYA lanjut ke 0000004, tapi yang digenerate
-- 0000001 lagi → bentrok.
--
-- SEBAB: `generateNibars` (lib/nibar.ts) mencari nomor urut terakhir dengan
--   SELECT nibar FROM aset WHERE nibar LIKE '<38 digit>%' ORDER BY nibar DESC LIMIT 1
-- `aset.nibar` cuma punya index dari constraint UNIQUE (`aset_nibar_key`) yang
-- memakai opclass DEFAULT — dan opclass default TIDAK bisa melayani
-- `LIKE 'prefix%'` di database ber-collation non-C. Jadi query itu seq scan
-- ~227rb baris, ditambah `~~` yang tidak leakproof sehingga dievaluasi SESUDAH
-- qual RLS → tembus statement timeout 8 dtk role `authenticated`. Persis
-- pelajaran `idx_aset_kode_pattern` (20260718_06), cuma di kolom yang berbeda.
--
-- Kenapa baru meledak sekarang: 21 Juli belum ada NIBAR berprefiks itu, jadi
-- "tidak ketemu apa-apa" memang jawaban yang BENAR — timeout menghasilkan
-- jawaban yang kebetulan tepat. Sekali ada baris lama yang harus ditemukan,
-- kegagalan yang sama jadi salah dan langsung menabrak constraint.
--
-- Perbaikan sisi kode (commit yang sama): `generateNibars` tidak lagi menelan
-- `error` — kalau lookup gagal ia MELEMPAR, jadi approve berhenti dengan pesan
-- jelas alih-alih menerbitkan NIBAR yang menimpa nomor terpakai. Constraint
-- UNIQUE-lah yang selama ini menyelamatkan; tanpa dia, nomor NIBAR bisa dobel
-- diam-diam dan itu jauh lebih parah daripada gagal approve.
--
-- PLAIN, bukan CONCURRENTLY: Supabase SQL Editor membungkus skrip jadi satu
-- transaksi, dan CONCURRENTLY tidak boleh di dalam transaction block (gagal
-- senyap / index INVALID — lihat 20260718_06). Lock tulis `aset` beberapa detik,
-- sekali jalan, aman di jam kerja sepi.
-- ============================================================================

DROP INDEX IF EXISTS idx_aset_nibar_pattern;
CREATE INDEX idx_aset_nibar_pattern ON aset (nibar text_pattern_ops);

ANALYZE aset;

-- Verifikasi (jalankan terpisah):
--   EXPLAIN ANALYZE SELECT nibar FROM aset
--     WHERE nibar LIKE '12013506270000000000002026132050204001%'
--     ORDER BY nibar DESC LIMIT 1;
--   -- harus Index Scan / Bitmap Index Scan, milidetik, bukan Seq Scan.
