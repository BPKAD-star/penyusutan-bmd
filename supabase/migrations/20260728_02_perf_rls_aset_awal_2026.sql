-- ============================================================================
-- FIX PERFORMA: RLS `aset_awal_2026` — fn_is_admin()/fn_is_viewer() masih
-- TELANJANG, dievaluasi per baris atas ~227rb baris baseline (2026-07-28).
--
-- GEJALA: Saldo Awal → Daftar Barang Awal, filter "Semua SKPD" + satu jenis
-- aset (mis. 1.3.1 Tanah) → "0 barang / Tidak ada data untuk filter ini",
-- padahal datanya jelas ada (Rekapitulasi di menu yang sama menampilkannya).
-- Halaman itu mengabaikan `error` dari supabase-js, jadi statement timeout 8s
-- role `authenticated` tampil sebagai "kosong", bukan sebagai kegagalan.
-- (Sisi kodenya ikut dibetulkan di commit yang sama: error sekarang ditampilkan.)
--
-- SEBAB: persis akar masalah yang sudah 3x dibereskan di tabel lain —
--   20260716_07 (fn_rekap_* jadi SECURITY DEFINER + fn_is_admin sekali),
--   20260717_02 (aset_select → InitPlan),
--   20260718_05/06 (trx_select & *_viewer_select → InitPlan).
-- `aset_awal_2026` KELEWAT di ketiganya karena satu-satunya pembacanya yang
-- berat (Rekapitulasi) lewat RPC SECURITY DEFINER `fn_rekap_saldo_awal`, jadi
-- policy-nya tak pernah kena beban. Begitu Daftar Barang Awal (2026-07-28)
-- membaca TABELNYA LANGSUNG, dua policy di bawah ini dievaluasi per baris:
--   sa_select                  : fn_is_admin() OR fn_skpd_visible(skpd_id)   (20260711_02)
--   aset_awal_2026_viewer_select: fn_is_viewer()                             (20260714_04)
-- Keduanya permissive & di-OR — jadi utk SETIAP baris yang diperiksa, Postgres
-- menembak query ke admin_profiles 2x. Dgn SKPD terpilih (skpd_id IN (...))
-- barisnya sedikit → halaman terasa normal; tanpa filter SKPD → 227rb baris →
-- tembus timeout. Itu sebabnya "cuma bisa kalau di-filter per SKPD".
--
-- FIX: bungkus jadi subquery skalar tanpa korelasi → dipromosikan jadi InitPlan
-- (dievaluasi SEKALI di awal query, hasilnya dipakai ulang semua baris). Untuk
-- admin nilainya true → OR short-circuit → fn_skpd_visible TAK PERNAH jalan.
--
-- ⚠️ SEMANTIK KEAMANAN TIDAK BERUBAH SEDIKIT PUN. Aturannya identik: admin
-- lihat semua; pengawas (viewer) lihat semua secara read-only; sisanya cuma
-- subtree SKPD-nya. Yang berubah HANYA berapa kali fungsinya dipanggil.
-- Reversible: CREATE ulang versi lama (ada di 20260711_02 & 20260714_04).
--
-- SENGAJA TIDAK menambah index `kode text_pattern_ops` di sini. Pelajaran
-- 20260727_03 (CLAUDE.md): `kode LIKE 'gol.%'` TAK PERNAH bisa jadi index-cond
-- di bawah RLS — operator `~~` tidak leakproof, jadi selalu dievaluasi SESUDAH
-- qual RLS. Indexnya bakal jadi beban tulis tanpa pernah kepakai dari aplikasi.
-- Sesudah InitPlan, seq scan 227rb baris dgn qual murah = ratusan ms, cukup.
-- Kalau nanti satu jenis aset tertentu terbukti masih berat utk SKPD besar,
-- obatnya PARTIAL INDEX ala 20260727_03 (`ON aset_awal_2026 (skpd_id) WHERE
-- kode LIKE '<prefix>'`), bukan index kode polos.
--
-- CARA UKUR SEBELUM/SESUDAH (aman, di-ROLLBACK):
--   BEGIN;
--   SET LOCAL role authenticated;
--   SET LOCAL request.jwt.claims = '{"sub":"<uuid admin>","role":"authenticated"}';
--   EXPLAIN ANALYZE
--   SELECT nibar, kode, nama_barang FROM aset_awal_2026
--   WHERE kode LIKE '1.3.1.%' ORDER BY nilai_perolehan DESC LIMIT 50;
--   ROLLBACK;
-- Sesudah migrasi ini plan-nya harus memunculkan InitPlan utk fn_is_admin/
-- fn_is_viewer dan Execution Time turun drastis (dari >8000ms → ratusan ms).
-- ============================================================================

-- ── 1. Policy utama (pengganti versi 20260711_02) ───────────────────────────
DROP POLICY IF EXISTS "sa_select" ON aset_awal_2026;
CREATE POLICY "sa_select" ON aset_awal_2026 FOR SELECT TO authenticated
  USING (
    (SELECT fn_is_admin())
    OR fn_skpd_visible(skpd_id)
  );

-- ── 2. Policy pengawas (pengganti versi 20260714_04) ────────────────────────
DROP POLICY IF EXISTS "aset_awal_2026_viewer_select" ON aset_awal_2026;
CREATE POLICY "aset_awal_2026_viewer_select" ON aset_awal_2026 FOR SELECT TO authenticated
  USING ((SELECT fn_is_viewer()));

-- ── 3. Index skpd_id (kalau memang belum ada) ───────────────────────────────
-- `aset_awal_2026` tidak dibuat lewat migrasi yang ter-track di repo (hasil
-- import baseline e-BMD lewat Table Editor — lihat 20260710_06), jadi indexnya
-- tak bisa dipastikan dari berkas migrasi. Dicek dulu ke katalog supaya tidak
-- bikin index kembar kalau ternyata sudah ada dgn nama lain.
-- Ini yang menolong jalur non-admin & jalur "filter per SKPD": `skpd_id = ANY(...)`
-- itu leakproof & terindeks, jadi boleh jadi index-cond di bawah RLS.
DO $$
DECLARE v_ada boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM pg_index i
    JOIN pg_class c ON c.oid = i.indrelid
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = i.indkey[0]
    WHERE c.relname = 'aset_awal_2026'
      AND i.indnkeyatts = 1
      AND a.attname = 'skpd_id'
  ) INTO v_ada;

  IF v_ada THEN
    RAISE NOTICE 'aset_awal_2026: index skpd_id sudah ada — dilewati.';
  ELSE
    EXECUTE 'CREATE INDEX idx_aset_awal_2026_skpd ON aset_awal_2026 (skpd_id)';
    RAISE NOTICE 'aset_awal_2026: idx_aset_awal_2026_skpd dibuat.';
  END IF;
END $$;

ANALYZE aset_awal_2026;

-- Verifikasi (SQL Editor):
--   SELECT polname, pg_get_expr(polqual, polrelid) FROM pg_policy
--     WHERE polrelid = 'aset_awal_2026'::regclass;   -- dua-duanya harus pakai (SELECT fn_...())
--   SELECT indexrelid::regclass FROM pg_index WHERE indrelid = 'aset_awal_2026'::regclass;
