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
-- ⚠️ Index-only scan baru benar-benar terjadi kalau visibility map-nya segar,
-- dan itu butuh `VACUUM`. TAPI **`VACUUM` TIDAK BOLEH ADA DI BERKAS INI** —
-- lihat langkah 2 di bawah. Percobaan pertama (2026-08-10) menaruhnya di sini
-- dan SELURUH migrasi gagal: `ERROR 25001: VACUUM cannot run inside a
-- transaction block`. Karena SQL Editor membungkus skrip jadi satu transaksi,
-- `CREATE INDEX` di atasnya ikut ter-rollback — tidak ada yang setengah jadi,
-- tapi juga tidak ada yang jadi.
--
-- Bedakan baik-baik, keduanya sering dikira sama:
--   * `ANALYZE`  → BOLEH di dalam transaksi → aman di berkas migrasi.
--   * `VACUUM`   → TIDAK BOLEH → wajib dijalankan sebagai perintah lepas.
-- ============================================================================

-- ── LANGKAH 1 (berkas ini) ──────────────────────────────────────────────────

-- PLAIN, bukan CONCURRENTLY: Supabase SQL Editor membungkus skrip jadi satu
-- transaksi, dan CONCURRENTLY di dalam transaksi GAGAL SENYAP (rules.md §5.3).
-- Kalau dijalankan lewat psql dan ingin tanpa mengunci tulis, boleh diganti
-- CONCURRENTLY — tapi jangan lewat SQL Editor.
CREATE INDEX IF NOT EXISTS idx_aset_rekap_golongan
  ON aset (status, golongan)
  INCLUDE (nilai_perolehan, intra_ekstra);

-- ── Saldo Awal: tabel LAIN, masalah yang SAMA, dan lebih parah ─────────────
-- `fn_rekap_saldo_awal` membaca `aset_awal_2026`, bukan `aset`, jadi index di
-- atas tidak menolongnya sama sekali. Terukur 2026-08-10 SEBELUM perbaikan:
-- **14.431 ms** — jauh di atas statement_timeout 8 dtk role `authenticated`,
-- artinya Rekapitulasi Saldo Awal se-kabupaten memang PASTI gagal (dan
-- gagalnya diam-diam tampil sebagai nol; lihat perbaikan fail-closed
-- 2026-08-10). Planner memilih `idx_saldo_skpd` demi urutan presorted, lalu
-- membayar 91.251 akses buffer ACAK ke heap — lebih mahal daripada seq scan.
--
-- Kolom kunci `(skpd_id, kode)`: skpd_id memberi urutan presorted yang memang
-- dipakai GROUP BY, kode dipakai menurunkan golongan. Sisanya INCLUDE.
CREATE INDEX IF NOT EXISTS idx_sa2026_rekap
  ON aset_awal_2026 (skpd_id, kode)
  INCLUDE (nilai_perolehan, akumulasi_2025, beban_penyusutan_per_smt, nilai_buku_awal, intra_ekstra);

-- ── Laporan BMD (`fn_rekap_bmd`) — dua index lagi ──────────────────────────
-- Halaman ini TETAP timeout sesudah dua index di atas, dan EXPLAIN menunjukkan
-- sebabnya ada di tempat lain sama sekali (2026-08-10, total 10.150 ms):
--     Index Scan `penyusutan_semester` (241.912 baris) ....  6.117 ms
--     Seq Scan `aset` .....................................  2.465 ms
--     Hash aggregate TUMPAH ke disk (estimasi 139rb vs nyata 418rb)
--
-- (a) `penyusutan_semester`: `idx_ps_periode` cuma memuat `periode`, jadi tiap
--     baris harus diambil dari heap satu per satu. Jadikan index-only.
CREATE INDEX IF NOT EXISTS idx_ps_periode_rekap
  ON penyusutan_semester (periode)
  INCLUDE (aset_id, nilai_perolehan, akumulasi, beban, nilai_buku_akhir);

-- (b) `aset`: `idx_aset_rekap_golongan` di atas TIDAK terpakai di sini —
--     fn_rekap_bmd juga butuh `skpd_id`, `tgl_perolehan`, dan `id`. Index
--     terpisah, bukan memperlebar yang pertama: yang pertama sengaja tetap
--     ramping supaya agregat Dashboard tetap secepat mungkin.
CREATE INDEX IF NOT EXISTS idx_aset_rekap_bmd
  ON aset (status)
  INCLUDE (id, kode, nilai_perolehan, skpd_id, intra_ekstra, tgl_perolehan);

-- Statistik planner. ANALYZE boleh di dalam transaksi, jadi aman di sini
-- (rules.md §4.4 — tiap perubahan besar ditutup ANALYZE).
ANALYZE aset;
ANALYZE aset_awal_2026;
ANALYZE penyusutan_semester;

-- ── LANGKAH 2 (JALANKAN TERPISAH, satu perintah sendiri) ────────────────────
-- WAJIB, dan TIDAK BOLEH digabung ke berkas di atas:
--
--   VACUUM (ANALYZE) aset;
--   VACUUM (ANALYZE) aset_awal_2026;
--   VACUUM (ANALYZE) penyusutan_semester;
--
-- Ini yang menyegarkan visibility map. Tanpanya index di atas memang terbentuk,
-- tapi Postgres tetap mengintip heap tiap baris dan perbaikannya nyaris tak
-- terasa ("Heap Fetches" besar di EXPLAIN).
--
-- Di Supabase SQL Editor: buka tab BARU, isi HANYA baris VACUUM itu, Run.
-- Kalau tetap kena `25001`, jalankan lewat psql.

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
--
-- ── HASIL SESUDAH DIJALANKAN (2026-08-10, service_role, cache hangat) ───────
--
--   agregat `aset`, tanpa filter komptabel   1.441 ms →   173 ms   (8×)
--   agregat `aset`, filter 'ekstra'          1.819 ms →    42 ms  (43×)
--   agregat `aset_awal_2026` per SKPD       14.431 ms → 1.025 ms  (14×)
--   `fn_rekap_bmd` 2026-S2 intra            10.150 ms → 1.901 ms   (5×)
--
--   blok dibaca `aset`            : 33.665 → 2.465   · Heap Fetches 1.077
--   blok dibaca `aset_awal_2026`  : 91.251 → 4.295   · Heap Fetches 0
--   `penyusutan_semester` di fn_rekap_bmd   : 6.117 ms → 66 ms · Heap Fetches 0
--   `aset` di fn_rekap_bmd                  : 2.465 ms → 476 ms
--   ukuran index: 19 + 33 + 31 + 38 MB = 121 MB (DB 1.097 → 1.199 MB)
--
-- ⚠️ Angka di atas TANPA beban RLS. Untuk non-admin, `fn_skpd_visible`
-- dievaluasi PER BARIS dan itu biaya terpisah yang TIDAK disentuh index ini —
-- lihat rules.md §4.1 (InitPlan). Uji ulang sebagai pengurus barang SKPD
-- TERBESAR sebelum menyatakan selesai (rules.md §4.5).
--
-- ⚠️ Run PERTAMA sesudah index dibuat justru terlihat LEBIH LAMBAT (1.989 ms)
-- karena indexnya masih dingin & cache baru di-VACUUM. Jangan menilai dari satu
-- pengukuran — ulangi sampai `Buffers` menunjukkan `hit` tanpa `read`.
