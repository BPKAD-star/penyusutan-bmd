-- ============================================================================
-- FIX KEAMANAN: aset_awal_2026 (baseline saldo awal 2026) SELECT policy
-- sebelumnya `USING (true)` — SEMUA user authenticated (termasuk role 'user'
-- non-admin) bisa baca baris SKPD MANA PUN, bukan cuma milik/subtree sendiri.
-- Beda dari `aset` yang sudah benar pakai fn_is_admin() OR fn_skpd_visible().
--
-- Ditemukan 2026-07-11: operator Pengurus Barang (role='user') Dinas
-- Perhubungan tetap melihat data se-kabupaten di menu Saldo Awal >
-- Rekapitulasi, karena halaman itu hanya menambahkan filter skpd_id kalau
-- combobox SKPD diisi (default kosong = "Semua") — RLS-lah yang seharusnya
-- jadi penjaga sesungguhnya, bukan filter UI. Sama seperti aset/transaksi_bmd/
-- jurnal_header/rkbmd, RLS wajib membatasi baris yang dikembalikan DB, bukan
-- mengandalkan UI untuk sopan mem-filter dirinya sendiri.
--
-- Tidak ada policy INSERT/UPDATE/DELETE di tabel ini (import baseline hanya
-- lewat service-role, yang bypass RLS) — jadi cukup perbaiki SELECT saja.
-- ============================================================================

DROP POLICY IF EXISTS "sa_select" ON aset_awal_2026;
CREATE POLICY "sa_select" ON aset_awal_2026 FOR SELECT TO authenticated
  USING (fn_is_admin() OR fn_skpd_visible(skpd_id));
