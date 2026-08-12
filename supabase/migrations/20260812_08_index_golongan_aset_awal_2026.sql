-- Daftar Barang Awal: filter jenis aset pindah dari `kode LIKE 'gol.%'` ke
-- `golongan = 'gol'`, plus index yang melayani filter DAN urutannya sekaligus.
--
-- MASALAHNYA (diukur 2026-08-12, RLS aktif sbg admin, statement_timeout 8s):
--   SELECT <25 kolom> FROM aset_awal_2026 WHERE kode LIKE '1.3.5.%'
--   ORDER BY kode, nilai_perolehan DESC, nibar LIMIT 50 OFFSET 0;
--   → Index Scan using idx_saldo_kode, Rows Removed by Filter: 235.828
--   → Execution Time: 9.518 ms  ← LEWAT batas 8 dtk, halaman PERTAMA pun gagal
--
-- Sebabnya aturan lama repo ini: `~~` (LIKE) TIDAK leakproof, jadi Postgres
-- selalu mengevaluasinya SESUDAH qual RLS — berapa pun index pattern yang ada,
-- `kode LIKE` tak pernah bisa jadi index-cond. Karena ORDER BY-nya diawali
-- `kode`, planner memilih idx_saldo_kode lalu menyusurinya DARI KODE PALING
-- AWAL sambil membuang 235.828 baris satu per satu, tiap baris menengok heap.
-- Ini ronde ke-4 dari cerita yang sama (lihat CLAUDE.md: GIS Tanah, Kendaraan,
-- fetchOwnerOverrides).
--
-- OBATNYA beda dari tiga ronde sebelumnya, dan lebih bersih: tabel ini SUDAH
-- punya kolom `golongan` yang terisi penuh (418.102 baris, 0 NULL) dan 100%
-- cocok dengan `substring(kode from '^\d+\.\d+\.\d+')` — diverifikasi
-- 2026-08-12. `=` pada text itu **leakproof**, jadi ia BOLEH turun jadi
-- index-cond di bawah RLS. Tak perlu 8 partial index (satu per golongan):
-- satu index biasa melayani kedelapan-delapannya.
--
-- HASIL (diukur dgn index ini, RLS aktif, cold):
--   halaman 1   : 9.518 ms → 18 ms      (Index Cond, TANPA sort sama sekali)
--   halaman 3466: —        → 819 ms     (OFFSET 173.200, terdalam)
--   count exact : 8.916 ms → 2.755 ms   (Index Only Scan, Heap Fetches 166)
--
-- ⚠️ Predikat di kode WAJIB `.eq('golongan', gol)` — kalau nanti ada yang
-- mengembalikannya jadi `.like('kode', ...)`, index ini diabaikan DIAM-DIAM dan
-- halamannya timeout lagi tanpa ada yang sadar.

-- 1) Index: kolom kunci = filter + SELURUH kunci urut, urutan & arahnya SAMA
--    PERSIS dgn ORDER BY di halaman (kode ASC, nilai_perolehan DESC, nibar ASC).
--    Karena cocok, LIMIT 50 dilayani tanpa node Sort — itu yang bikin 18 ms.
--    INCLUDE (skpd_id) BUKAN hiasan: `skpd_id` dipakai qual RLS
--    (`fn_skpd_visible(skpd_id)`), dan tanpa dia count(*) terpaksa Index Scan
--    + 173rb kunjungan heap (8,9 dtk). Dengan dia → Index Only Scan (2,8 dtk).
--    PLAIN, bukan CONCURRENTLY — SQL Editor membungkus skrip jadi satu
--    transaksi, jadi CONCURRENTLY gagal senyap.
CREATE INDEX IF NOT EXISTS idx_sa2026_gol_urut
  ON aset_awal_2026 (golongan, kode, nilai_perolehan DESC, nibar)
  INCLUDE (skpd_id);

-- 2) Kunci invariannya. Mulai sekarang tampilan bersandar pada `golongan`,
--    padahal yang otoritatif tetap `kode` — kalau keduanya sempat menyimpang,
--    barang tampil di jenis aset yang salah TANPA satu pun pesan error. Praktis
--    memang tak bisa menyimpang (tabel baseline beku: tak ada INSERT baru, dan
--    `kode` termasuk kolom terkunci trigger fn_aset_awal_2026_spek_only + GRANT
--    per-kolom) — tapi "praktis tak bisa" itu persis bunyi asumsi yang di repo
--    ini sudah berkali-kali terbukti salah. Divalidasi 0 pelanggaran hari ini.
ALTER TABLE aset_awal_2026
  DROP CONSTRAINT IF EXISTS aset_awal_2026_golongan_cocok_kode;
ALTER TABLE aset_awal_2026
  ADD CONSTRAINT aset_awal_2026_golongan_cocok_kode
  CHECK (golongan = substring(kode from '^\d+\.\d+\.\d+'));

ANALYZE aset_awal_2026;
