-- ============================================================================
-- Izinkan tahun_buku dibaca SEBELUM login (anon) — dipakai pemilih "Tahun
-- Kerja" di halaman login (app/login/page.tsx). Tidak ada data sensitif di
-- tabel ini (cuma tahun/status/catatan admin), jadi aman dibuka read-only.
-- Jalankan SETELAH 20260704_25_tutup_tahun.sql.
-- ============================================================================
DROP POLICY IF EXISTS "tb_select" ON tahun_buku;
CREATE POLICY "tb_select" ON tahun_buku FOR SELECT TO anon, authenticated USING (true);
