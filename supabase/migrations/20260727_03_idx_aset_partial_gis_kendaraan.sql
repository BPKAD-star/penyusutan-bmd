-- ============================================================================
-- FIX PERFORMA (lanjutan 20260720_01): GIS Tanah & Kendaraan timeout LAGI untuk
-- pengurus barang SKPD BESAR (2026-07-27).
--
-- GEJALA: login pengurus_barang Dinas Pendidikan → GIS Tanah "Gagal memuat data
-- tanah — canceling statement due to statement timeout". Admin normal. SKPD
-- kecil normal. Jadi BEDA dari gejala Juli lalu (dulu semua non-admin kena).
--
-- KENAPA FIX 20260720_01 TIDAK CUKUP LAGI:
-- Migrasi itu membereskan dua lapis: (1) RLS per-baris → set-membership, dan
-- (2) menyuntik `.in('skpd_id', fn_my_skpd_scope())` di sisi kode supaya ada
-- qual leakproof + terindeks (idx_aset_skpd), karena `kode LIKE 'x%'` TIDAK
-- bisa jadi index-cond di bawah RLS (operator `~~` tidak leakproof).
-- Itu bekerja SELAMA `skpd_id IN (...)` selektif.
--
-- Di HARI YANG SAMA, migrasi 20260720_02 mengimpor 149.846 baris ATL yang
-- tersebar di 694 SKPD di bawah Dinas Pendidikan. Sejak itu, untuk pengurus
-- barang Diknas `skpd_id IN (694 id)` TIDAK selektif lagi — cocok dengan
-- ~150rb baris. Plannernya: Index Scan idx_aset_skpd → tarik SEMUA baris
-- Diknas → baru filter `kode LIKE '1.3.1.%'` (tanah, cuma ratusan) → Sort by
-- nama_barang → timeout. Volume datanya yang tumbuh, bukan policy-nya berubah.
--
-- SOLUSI: PARTIAL INDEX supaya predikat golongan ikut terselesaikan DI INDEX,
-- bukan jadi filter setelah ribuan baris ditarik. Planner membuktikan qual
-- query (`kode LIKE '1.3.1.%' AND status='aktif'`) IMPLIED BY predikat indeks
-- → kedua qual itu dibuang, sisa `skpd_id = ANY(...)` jadi index-cond (operator
-- kesetaraan = leakproof, sah di bawah RLS). Indeksnya mungil (cuma baris
-- tanah/angkutan aktif, bukan 400rb+ baris) → hitungan milidetik, dan TIDAK
-- ikut membengkak walau `aset` terus tumbuh.
--
-- ⚠️ PREDIKAT HARUS SAMA PERSIS dengan qual di kode, kalau tidak planner tak
-- bisa membuktikan implikasinya & indeks ini diabaikan diam-diam:
--   GIS       app/dashboard/gis/page.tsx      .like('kode','1.3.1.%').eq('status','aktif')
--   Kendaraan app/dashboard/kendaraan/page.tsx .like('kode','1.3.2.02.%').eq('status','aktif')
-- Kalau prefix di kode diubah, indeks di bawah WAJIB ikut diubah.
--
-- ⚠️ PLAIN, BUKAN CONCURRENTLY — Supabase SQL Editor membungkus statement dalam
-- transaksi, dan CONCURRENTLY gagal senyap di dalam transaksi (lihat catatan
-- idx_aset_kode_pattern di CLAUDE.md). Konsekuensi: CREATE INDEX mengambil
-- ACCESS EXCLUSIVE lock — `aset` terkunci beberapa detik (tabel 400rb+ baris,
-- perkiraan 10–30 dtk). Jalankan di jam sepi.
--
-- Aditif & reversible: hanya menambah indeks, tidak menyentuh policy/data.
--   Batal: DROP INDEX idx_aset_tanah_skpd, idx_aset_angkutan_skpd;
-- Jalankan SETELAH 20260727_02_kir_ruangan.sql.
-- ============================================================================

-- ── GIS Tanah (golongan 1.3.1) ──────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_aset_tanah_skpd
  ON aset (skpd_id)
  WHERE kode LIKE '1.3.1.%' AND status = 'aktif';

-- ── Kendaraan / Alat Angkutan (1.3.2.02) ────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_aset_angkutan_skpd
  ON aset (skpd_id)
  WHERE kode LIKE '1.3.2.02.%' AND status = 'aktif';

ANALYZE aset;

-- ============================================================================
-- VERIFIKASI (aman, read-only, dibungkus ROLLBACK) — jalankan sebagai
-- pengurus_barang Dinas Pendidikan, yaitu akun yang tadi timeout.
--
--   BEGIN;
--   -- ganti <UUID> dengan admin_profiles.id akun Diknas yang bermasalah:
--   --   SELECT p.id, p.role, s.nama FROM admin_profiles p
--   --     JOIN admin_skpd s ON s.id = p.skpd_id WHERE s.nama ILIKE '%pendidikan%';
--   SELECT set_config('request.jwt.claims',
--     json_build_object('sub','<UUID>','role','authenticated')::text, true);
--   SET LOCAL ROLE authenticated;
--
--   EXPLAIN (ANALYZE, BUFFERS)
--   SELECT id,kode,nama_barang,skpd_id FROM aset
--   WHERE kode LIKE '1.3.1.%' AND status='aktif'
--     AND skpd_id = ANY (fn_my_skpd_scope())
--   ORDER BY nama_barang;
--   ROLLBACK;
--
-- YANG DICARI: baris `Index Scan using idx_aset_tanah_skpd` dan Execution Time
-- ratusan milidetik. Kalau masih `Seq Scan on aset` atau masih pakai
-- idx_aset_skpd dengan `Rows Removed by Filter` puluhan/ratusan ribu, berarti
-- predikat indeks TIDAK match qual query — kabari, jangan dibiarkan.
-- ============================================================================
