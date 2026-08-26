-- ============================================================================
-- 2026-08-26 — dropdown "Periode" di Laporan Pengadaan kosong, dan Laporan
-- Reklasifikasi/Kapitalisasi diam-diam SUDAH timeout duluan
--
-- GEJALA yang dilaporkan: menu Pelaporan → Laporan Perolehan → Pengadaan →
-- Format Permendagri (Model 3), dropdown "Periode" cuma berisi "Semua
-- Periode" — tak ada satu semester pun bisa dipilih, padahal transaksinya ADA
-- (43 baris jenis 'pengadaan').
--
-- SEBAB (diukur ke DB, RLS aktif, sbg admin BKAD):
-- Kolektor daftar periode di components/LaporanPerolehan.tsx &
-- components/LaporanTransaksi.tsx memakai `.order('periode', {ascending:
-- false})`. `jenis` (ENUM) tak bisa jadi index-cond di bawah RLS (CLAUDE.md
-- "ronde 3"), jadi ORDER BY periode memaksa planner menyusuri
-- idx_trx_periode MUNDUR sambil membuang ~421rb baris jenis lain:
--     Execution Time: 14.408 ms          -- pagu statement_timeout 8 dtk
-- TIMEOUT nyata, dan `.then(({data}) => ...)` di kode menelan errornya diam-
-- diam — dropdown jatuh ke array kosong tanpa satu pun pesan.
--
-- DIPERBAIKI DI KODE (commit terpisah): `.order('id')` menggantikan
-- `.order('periode')` — sama dgn buildQuery() yang sudah dilindungi index
-- parsial per-jenis, lalu periodenya diurutkan di JS. Hibah/Tukar Menukar/
-- Hasil Inventarisasi/Perolehan Lainnya ikut terlindungi index parsial
-- Cara Perolehan (migrasi 20260820_03) yang sudah ada.
--
-- TAPI menyisir jenisList tiap menu di LaporanTransaksi.tsx ke index yang
-- ADA menemukan bug SENDIRI, lebih parah — order('id') pun TETAP timeout,
-- karena predikat indexnya sudah menyimpang atau tak pernah dibuat:
--
--   (1) idx_trx_reklas_id (dibuat 20260811_01 untuk fn_dbar_kode_at, BUKAN
--       untuk laporan ini) cuma memuat reklas_kode/reklas_golongan/
--       batal_reklas — Laporan Reklasifikasi menyaring TIGA jenis TERMASUK
--       'reklas_komptabel', yang tak ada di predikat itu.
--         reklas_kode/komptabel/golongan: 9.708 ms → 8,4 ms sesudah diperluas
--   (2) 'kapitalisasi' TAK PERNAH punya index parsial sama sekali —
--       Laporan Kapitalisasi timeout SEJAK MENUNYA ADA, bukan regresi baru.
--         kapitalisasi: 13.950 ms → 17,9 ms sesudah index baru dibuat
--   (3) Grup Koreksi (koreksi_nilai/koreksi_spesifikasi/
--       koreksi_pencatatan_ganda/pemecahan_keluar/pemecahan_masuk/
--       batal_pemecahan/batal_pemecahan_masuk — dipakai menu Laporan Koreksi)
--       juga tak punya index yang cocok.
--         grup koreksi: (baris amat sedikit) → 2,0 ms sesudah index baru dibuat
--
-- Predikat KETIGANYA WAJIB kembar dengan prop `jenisList` di halaman React
-- masing-masing (app/dashboard/pelaporan/pengelolaan/*/page.tsx) — dikunci
-- lib/sinkronisasiRpc.test.ts §7. Menu Pengelolaan BARU yang menambah jenis
-- ke laporan ledgernya tanpa memperlebar index ini akan timeout dgn gejala
-- yang sama persis, dan TAK ADA APA PUN yang gagal di sisi kode.
--
-- ⚠️ PLAIN, bukan CONCURRENTLY: Supabase SQL Editor membungkus skrip dalam
-- transaksi, dan CONCURRENTLY di dalam transaksi gagal SENYAP (migrasi
-- 20260718_06).
-- ============================================================================

-- (1) idx_trx_reklas_id: predikat parsial tak bisa di-ALTER → drop & buat
-- ulang. Menambah 'reklas_komptabel' aman untuk fn_dbar_kode_at (§3) — index
-- yang predikatnya LEBIH LEBAR dari daftar yang dipakai fungsi itu tetap sah,
-- Postgres cuma butuh predikat index MENYIRATKAN qual query, bukan sama persis.
DROP INDEX IF EXISTS idx_trx_reklas_id;
CREATE INDEX IF NOT EXISTS idx_trx_reklas_id
  ON transaksi_bmd (id)
  WHERE jenis IN ('reklas_kode', 'reklas_golongan', 'reklas_komptabel', 'batal_reklas');

-- (2) Kapitalisasi — baru, tak pernah ada sebelumnya.
CREATE INDEX IF NOT EXISTS idx_trx_kapitalisasi_id
  ON transaksi_bmd (id)
  WHERE jenis IN ('kapitalisasi');

-- (3) Koreksi (Nilai/Spesifikasi/Pencatatan Ganda) + Pemecahan Barang — baru.
CREATE INDEX IF NOT EXISTS idx_trx_koreksi_id
  ON transaksi_bmd (id)
  WHERE jenis IN ('koreksi_nilai', 'koreksi_spesifikasi', 'koreksi_pencatatan_ganda',
                  'pemecahan_keluar', 'pemecahan_masuk',
                  'batal_pemecahan', 'batal_pemecahan_masuk');

-- Statistik saja; TIDAK ada VACUUM di sini — SQL Editor membungkus skrip
-- dalam satu transaksi dan VACUUM akan gagal keras (25001).
ANALYZE transaksi_bmd;

-- ── Verifikasi: harus menyebut index barunya, BUKAN transaksi_bmd_pkey ──────
--   BEGIN;
--   SET LOCAL role authenticated;
--   SET LOCAL request.jwt.claims TO '{"sub":"<uid admin>","role":"authenticated"}';
--   EXPLAIN ANALYZE SELECT periode FROM transaksi_bmd WHERE jenis = 'kapitalisasi' ORDER BY id DESC LIMIT 500;
--   ROLLBACK;
