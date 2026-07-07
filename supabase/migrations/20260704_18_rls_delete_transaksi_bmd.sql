-- 20260704_18_rls_delete_transaksi_bmd.sql
-- Fix: migrasi 17 menambah pengecualian sempit di trigger
-- fn_transaksi_bmd_immutable utk izinkan DELETE (kontrak Pengadaan pending yg
-- pernah disetujui-lalu-dibuka-kunci, semua barangnya sudah dihapus) — TAPI
-- transaksi_bmd sejak awal SENGAJA tidak punya policy RLS utk DELETE sama
-- sekali ("tidak ada policy + trigger immutable = append-only berlapis").
-- Tanpa policy, RLS diam-diam menyaring SEMUA baris dari DELETE (0 rows
-- affected, TANPA error) SEBELUM sempat sampai ke trigger — jadi baris ledger
-- tak pernah benar-benar terhapus, dan DELETE jurnal_header berikutnya gagal
-- FK (transaksi_bmd_header_id_fkey) krn baris itu masih ada.
--
-- Fix: tambah policy DELETE (admin only — sama spt policy jurnal_header/aset
-- lain). Aturan SPESIFIK ttg kontrak mana yg boleh dihapus tetap ditegakkan
-- oleh trigger (migrasi 17), bukan di sini — RLS cuma jaga soal SIAPA.
CREATE POLICY "trx_delete" ON transaksi_bmd FOR DELETE TO authenticated
  USING (fn_is_admin());
