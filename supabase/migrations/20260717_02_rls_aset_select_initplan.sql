-- ============================================================================
-- RLS `aset_select`: panggil fn_is_admin() SEKALI, bukan per baris (2026-07-17).
-- Lanjutan `20260717_01_index_kode_pattern.sql` — index sudah memperbaiki seq
-- scan (2.226ms → 75ms, terbukti EXPLAIN ANALYZE), TAPI GIS Tanah MASIH
-- timeout. Sebabnya: EXPLAIN itu jalan sebagai role `postgres` yang MELEWATI
-- RLS. Browser jalan sebagai `authenticated` → kena policy di bawah ini, dan
-- sisa biayanya ada di situ.
--
-- POLICY LAMA (migrasi 20260704_22):
--   USING (fn_is_admin() OR fn_skpd_visible(skpd_id) OR fn_aset_pernah_dikelola(id))
--
-- MASALAH: `fn_is_admin()` TIDAK bergantung baris (tidak punya argumen kolom) —
-- hasilnya sama untuk seluruh tabel. Tapi ditulis sebagai pemanggilan fungsi
-- telanjang di USING, Postgres mengevaluasinya ULANG untuk SETIAP baris yang
-- diperiksa; tiap panggilan = satu query ke admin_profiles. Sialnya
-- `fn_aset_pernah_dikelola(id)` jauh lebih mahal lagi (subquery ke
-- transaksi_bmd — kini ~259rb baris ledger — plus 2x fn_skpd_visible di
-- dalamnya), dan dievaluasi per baris juga selama OR belum terpenuhi.
--
-- SOLUSI: bungkus jadi `(SELECT fn_is_admin())`. Ini bukan kosmetik — subquery
-- skalar tanpa korelasi dipromosikan Postgres jadi InitPlan: dievaluasi SEKALI
-- di awal query, hasilnya dipakai ulang untuk semua baris. Untuk admin nilainya
-- true, sehingga OR langsung short-circuit dan `fn_skpd_visible` /
-- `fn_aset_pernah_dikelola` yang mahal itu TIDAK PERNAH dievaluasi sama sekali.
-- Ini teknik yang memang direkomendasikan Supabase untuk RLS performance, dan
-- pola yang sama sudah dipakai di repo ini: `20260716_07_rekap_security_
-- definer_admin_sekali.sql` ("fn_is_admin sekali, hindari timeout 500").
--
-- ⚠️ SEMANTIK KEAMANAN TIDAK BERUBAH SAMA SEKALI. Aturannya identik: admin
-- lihat semua; non-admin lihat aset di subtree SKPD-nya; plus aset yang pernah
-- dikelola (pengalihan/mutasi) supaya SKPD pengirim tetap bisa membaca barang
-- yang sudah pindah (alasan migrasi 22). Yang berubah HANYA berapa kali
-- fn_is_admin() dipanggil — sekali, bukan sekali per baris. Tidak ada
-- pelonggaran akses: kalau fn_is_admin() false, dua cabang OR sisanya tetap
-- dievaluasi per baris persis seperti sebelumnya.
--
-- Tidak menyentuh data, kolom, maupun ledger. Reversible: tinggal CREATE ulang
-- policy versi lama (ada di 20260704_22_pengalihan_kembalikan.sql).
--
-- CARA UKUR SEBELUM/SESUDAH (jalankan di SQL Editor; aman, di-ROLLBACK):
--   BEGIN;
--   SET LOCAL role authenticated;
--   SET LOCAL request.jwt.claims = '{"sub":"d6e5ea72-e34d-4be5-9bda-da4ffada3dfd","role":"authenticated"}';
--   EXPLAIN ANALYZE
--   SELECT id, nibar, kode, nama_barang FROM aset
--   WHERE kode LIKE '1.3.1.%' AND status = 'aktif'
--   ORDER BY nama_barang ASC LIMIT 1000;
--   ROLLBACK;
-- Sesudah migrasi ini, plan-nya harus memunculkan InitPlan utk fn_is_admin dan
-- Execution Time turun drastis (target: mendekati angka tanpa RLS, ~75-200ms).
-- ============================================================================

DROP POLICY IF EXISTS "aset_select" ON aset;
CREATE POLICY "aset_select" ON aset FOR SELECT TO authenticated
  USING (
    (SELECT fn_is_admin())
    OR fn_skpd_visible(skpd_id)
    OR fn_aset_pernah_dikelola(id)
  );
