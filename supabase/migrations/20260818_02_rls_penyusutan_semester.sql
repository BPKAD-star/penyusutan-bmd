-- RLS `penyusutan_semester` — InitPlan + buang panggilan fungsi PER BARIS.
--
-- ── UKURAN SEBELUM (2026-08-18, RLS aktif sbg pengurus Dinas Pendidikan) ────
-- Agregat 132.694 baris (golongan 1.3.2 intra, 2026-S1) yang membaca
-- `penyusutan_semester` langsung: **114.941 ms**. Plannya:
--   Filter: (fn_is_admin() OR EXISTS(SubPlan 9) OR fn_is_viewer())
--     SubPlan 9 -> Index Scan aset_pkey ... (loops=132694)
--                  Filter: ... AND fn_skpd_visible(skpd_id)
--   Buffers: shared hit=3.163.008 read=21.843
--
-- Tiga cacat sekaligus, semuanya sudah pernah menggigit di repo ini:
--   1. `fn_is_admin()` & `fn_is_viewer()` TELANJANG → dievaluasi per baris,
--      bukan sekali (CLAUDE.md §PERFORMA; migrasi 20260717_02, 20260718_05/06).
--   2. `fn_skpd_visible(a.skpd_id)` dipanggil PER BARIS, dan di dalamnya ada
--      query ltree lagi → 132.694 × (lookup aset + query admin_skpd).
--   3. Akibatnya halaman Penyusutan yang membaca tabel ini batch-200 membayar
--      ongkos itu 664 kali per satu kali "Tampilkan".
--
-- ⚠️ Ini tabel yang KELEWAT dari tiga ronde perbaikan InitPlan sebelumnya —
-- pola yang persis sama dengan `aset_awal_2026` (migrasi 20260728_02), yang juga
-- baru ketahuan ketika ada halaman membacanya LANGSUNG dalam jumlah besar.
-- Kalau menambah policy di tabel jalur panas, bungkus InitPlan.

-- ── 1. Policy viewer: cukup dibungkus InitPlan ──────────────────────────────
DROP POLICY IF EXISTS penyusutan_semester_viewer_select ON penyusutan_semester;
CREATE POLICY penyusutan_semester_viewer_select ON penyusutan_semester
  FOR SELECT TO authenticated
  USING ((SELECT fn_is_viewer()));

-- ── 2. Policy utama: InitPlan + ganti fn_skpd_visible per-baris ─────────────
-- `fn_skpd_visible(a.skpd_id)` diganti `a.skpd_id = ANY((SELECT fn_my_skpd_scope()))`:
-- scope-nya dihitung SEKALI jadi array, lalu sisanya tinggal perbandingan
-- kesetaraan atas kolom terindeks — bukan panggilan fungsi ber-query di dalam
-- loop. EXISTS-nya sendiri tetap ada (pengecekan memang per baris), tapi kini
-- cuma satu lookup `aset_pkey`.
--
-- Setara secara semantik untuk yang penting:
--   · admin  → ruas pertama true, EXISTS tak pernah dijalankan (sama spt dulu);
--   · operator → `fn_my_skpd_scope()` = subtree SKPD-nya, persis himpunan yang
--     dulu dijawab `fn_skpd_visible` satu per satu;
--   · admin ber-scope NULL → `x = ANY(NULL)` menghasilkan NULL (bukan true),
--     jadi tak ada kebocoran lewat jalur ini.
--   · pengawas (viewer) tetap melihat semuanya lewat policy nomor 1 di atas —
--     dulu `fn_skpd_visible` sengaja mengembalikan false untuk viewer, dan
--     policy terpisah itulah yang memberinya akses. Tidak berubah.
DROP POLICY IF EXISTS ps_select ON penyusutan_semester;
CREATE POLICY ps_select ON penyusutan_semester
  FOR SELECT TO authenticated
  USING (
    (SELECT fn_is_admin())
    OR EXISTS (
      SELECT 1 FROM aset a
      -- ⚠️ `COALESCE(...)` di sini WAJIB, bukan kerapian. `ANY ((SELECT fn(...)))`
      -- polos terbaca Postgres sebagai bentuk SUBQUERY dari ANY, bukan bentuk
      -- ARRAY — hasilnya `operator does not exist: bigint = bigint[]`.
      -- Membungkusnya dgn COALESCE menjadikannya ekspresi bertipe bigint[],
      -- sekaligus menjinakkan scope NULL (admin) jadi himpunan kosong.
      -- InitPlan-nya tetap: subquery skalar di dalam dievaluasi SEKALI.
      -- Pola yang sama sudah dipakai `fn_dbar_scope`.
      WHERE a.id = penyusutan_semester.aset_id
        AND a.skpd_id = ANY (COALESCE((SELECT fn_my_skpd_scope()), ARRAY[]::bigint[]))
    )
  );

-- ⚠️ SESUDAH menjalankan ini, UKUR ULANG dengan RLS AKTIF — bukan sebagai
-- admin/service_role. Sebagai superuser query yang rusak ini tetap cepat, jadi
-- EXPLAIN tanpa RLS akan bilang "beres" padahal belum; itu yang dulu membuat
-- migrasi 20260728_05 lolos verifikasi.
--
--   begin;
--   set local role authenticated;
--   set local request.jwt.claims = '{"sub":"<uid pengurus SKPD terbesar>","role":"authenticated"}';
--   explain (analyze, timing off, buffers)
--   select count(*), sum(ps.beban) from aset a
--   join penyusutan_semester ps on ps.aset_id = a.id and ps.periode = '2026-S1'
--   where a.status <> 'draft' and a.golongan = '1.3.2' and a.intra_ekstra = 'intra';
--   rollback;
