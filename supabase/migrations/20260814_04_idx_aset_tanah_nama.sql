-- 20260814_04_idx_aset_tanah_nama.sql
-- Index urutan utk GIS Tanah (app/dashboard/gis/page.tsx).
--
-- Duduk perkaranya (diukur ke DB dgn RLS aktif, 2026-08-14, admin BKAD):
--   SELECT ... FROM aset WHERE kode LIKE '1.3.1.%' AND status='aktif'
--   ORDER BY nama_barang LIMIT 1000
--     ->  Index Scan using idx_aset_tanah_skpd  (rows=2733)
--     ->  Sort  Sort Key: nama_barang  (top-N heapsort)
--   Execution Time: 523 ms   ← per halaman, dan halamannya 3 (2.733 baris)
--
-- `idx_aset_tanah_skpd` (20260727_03) sudah menyelesaikan predikat golongannya,
-- jadi bagian LIKE-nya TIDAK lagi jadi masalah — yang tersisa mahal adalah
-- SORT-nya: seluruh 2.733 baris harus ditarik & diurutkan dulu sebelum 1.000
-- baris pertama bisa dikirim. Index ini memuat kunci urutnya, jadi barisnya
-- sudah datang terurut & LIMIT bisa berhenti lebih awal — pola yang sama dgn
-- `idx_sa2026_gol_urut` (20260812_08) untuk Daftar Barang Awal.
--
-- ⚠️ Kunci keduanya `id` BUKAN hiasan — ia PEMECAH SERI. Dari 2.733 tanah aktif
-- cuma ada 2.326 nama unik (diverifikasi 2026-08-14), jadi ~407 baris bernama
-- kembar. Halaman ditarik `.range()` per 1.000; dengan urutan yang TIDAK TOTAL,
-- Postgres tak menjamin baris bernama kembar jatuh di halaman yang sama tiap
-- query → ada yang terlewat & ada yang dobel TANPA SUARA. Kode di
-- app/dashboard/gis/page.tsx sekarang `.order('nama_barang').order('id')`;
-- urutan kolom index ini WAJIB sama persis dengan itu.
--
-- ⚠️ Predikatnya KEMBAR dgn qual di kode (`.like('kode','1.3.1.%')` +
-- `.eq('status','aktif')`) dan dgn `idx_aset_tanah_skpd`. Beda sedikit saja,
-- planner tak bisa membuktikan implikasinya & indexnya diabaikan DIAM-DIAM.
--
-- ⚠️ PLAIN, bukan CONCURRENTLY — Supabase SQL Editor membungkus skrip dalam satu
-- transaksi, dan CONCURRENTLY di dalam transaksi GAGAL SENYAP (migrasi 20260718_06).

CREATE INDEX IF NOT EXISTS idx_aset_tanah_nama
  ON aset (nama_barang, id)
  WHERE kode LIKE '1.3.1.%' AND status = 'aktif';

-- Verifikasi WAJIB dgn RLS AKTIF (sbg service_role query yang rusak pun tetap
-- cepat, jadi EXPLAIN tanpa RLS akan bilang "beres" padahal belum):
--
--   BEGIN;
--     SET LOCAL role authenticated;
--     SET LOCAL request.jwt.claims TO '{"sub":"<uid>","role":"authenticated"}';
--     EXPLAIN (ANALYZE, BUFFERS)
--       SELECT id, nibar, kode, nama_barang, nilai_perolehan, latitude, longitude, skpd_id
--       FROM aset WHERE kode LIKE '1.3.1.%' AND status='aktif'
--       ORDER BY nama_barang, id LIMIT 1000;
--   ROLLBACK;
--
-- Yang dicari: `Index Scan using idx_aset_tanah_nama` dan TIDAK ADA node `Sort`.
-- Kalau node Sort masih muncul, berarti urutan di kode & di index tidak sama.
