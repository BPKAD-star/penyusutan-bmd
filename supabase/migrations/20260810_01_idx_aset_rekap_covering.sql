-- ============================================================================
-- INDEX PENUTUP (covering) untuk agregat rekap per golongan.
--
-- MASALAH TERUKUR (2026-08-06, sebagai service_role tanpa beban RLS):
--   SELECT golongan, count(*), sum(nilai_perolehan)
--   FROM aset WHERE status='aktif' GROUP BY golongan;
--     → Parallel Seq Scan, 33.665 blok dibaca, Execution Time 1.441 ms
--   Tambah `AND intra_ekstra='ekstra'`:
--     → Parallel Seq Scan, 33.757 blok, 1.819 ms
--
-- Artinya: **filter Semua/Intra/Ekstra BUKAN sumber beratnya.** Ketiganya
-- menyapu seluruh tabel dengan jumlah blok yang praktis sama. Yang mahal adalah
-- membaca ~275 MB heap (33.665 blok × 8 KB) hanya untuk menjumlah 3 kolom.
-- Karena itu JANGAN membuat index pada `intra_ekstra` saja — ia tidak akan
-- menyelesaikan apa pun.
--
-- YANG DILAKUKAN INDEX INI: memungkinkan **index-only scan**. Ketiga kolom yang
-- dibutuhkan agregat (golongan untuk GROUP BY, nilai_perolehan untuk SUM,
-- intra_ekstra untuk filter komptabel) ada di dalam index, jadi heap-nya tidak
-- perlu disentuh sama sekali. Perkiraan ukuran index ±20 MB lawan ±275 MB heap.
--
-- ⚠️ `intra_ekstra` sengaja di INCLUDE, bukan jadi kolom kunci. Alasannya
-- konkret: qual di `fn_rekap_bmd`/`fn_rekap_saldo_awal` berbentuk
--     (p_komptabel IS NULL OR p_komptabel = '' OR a.intra_ekstra = p_komptabel)
-- — sebuah OR ber-PARAMETER. Postgres tidak bisa memakai itu sebagai kondisi
-- kunci index (dan partial index ber-predikat `intra_ekstra='ekstra'` juga TAK
-- AKAN terpakai, karena implikasinya tak bisa dibuktikan dari sebuah parameter).
-- Sebagai kolom INCLUDE ia tetap tersedia untuk disaring di dalam index scan,
-- yang justru yang kita butuhkan.
--
-- ⚠️ Kabar baik yang membedakan kasus ini dari INS-11: `intra_ekstra` bertipe
-- **text**, dan `texteq` itu **leakproof** (diverifikasi di pg_proc) — beda dari
-- `enum_eq` dan `~~` yang tidak. Jadi filter komptabel TIDAK terkena larangan
-- "tak pernah bisa jadi index-cond di bawah RLS" (rules.md §4.2).
--
-- ⚠️ Index-only scan baru benar-benar terjadi kalau visibility map-nya segar.
-- Sesudah import massal WAJIB `VACUUM ANALYZE aset` — tanpa itu Postgres tetap
-- mengintip heap dan perbaikannya tidak terasa.
-- ============================================================================

-- PLAIN, bukan CONCURRENTLY: Supabase SQL Editor membungkus skrip jadi satu
-- transaksi, dan CONCURRENTLY di dalam transaksi GAGAL SENYAP (rules.md §5.3).
-- Kalau dijalankan lewat psql dan ingin tanpa mengunci tulis, boleh diganti
-- CONCURRENTLY — tapi jangan lewat SQL Editor.
CREATE INDEX IF NOT EXISTS idx_aset_rekap_golongan
  ON aset (status, golongan)
  INCLUDE (nilai_perolehan, intra_ekstra);

-- Statistik & visibility map. ANALYZE wajib (rules.md §4.4); VACUUM di sini
-- yang membuat index-only scan benar-benar bisa dipakai.
VACUUM ANALYZE aset;

-- ── VERIFIKASI ──────────────────────────────────────────────────────────────
-- Jalankan terpisah. Yang dicari: "Index Only Scan using idx_aset_rekap_golongan"
-- dan "Heap Fetches" yang kecil. Kalau masih "Seq Scan", index ini TIDAK
-- terpakai — jangan dibiarkan, cari sebabnya.
--
--   EXPLAIN (ANALYZE, BUFFERS)
--   SELECT golongan, count(*), sum(nilai_perolehan)
--   FROM aset WHERE status='aktif' GROUP BY golongan;
--
-- Ulangi juga dengan `AND intra_ekstra='intra'` dan `='ekstra'`.
--
-- ⚠️ Verifikasi yang sesungguhnya WAJIB dengan RLS AKTIF (rules.md §4.3) —
-- sebagai service_role query yang rusak pun tetap terlihat sehat:
--   BEGIN;
--   SET LOCAL role authenticated;
--   SET LOCAL request.jwt.claims = '{"sub":"<UUID-user>","role":"authenticated"}';
--   EXPLAIN ANALYZE <query di atas>;
--   ROLLBACK;
