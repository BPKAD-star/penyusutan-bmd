-- ============================================================================
-- Pengamanan BMD — nilai enum jenis_transaksi_bmd baru.
--
--   • pengamanan              → barang diserahkan ke seorang pegawai (penanggung
--                               jawab pengamanan fisik) via BAST + Pakta
--                               Integritas. NETRAL: tidak mengubah nilai/
--                               penyusutan, BUKAN event SEMBUNYI (barang tetap
--                               muncul & disusutkan) — overlay atribut, pola
--                               pemanfaatan/pengalihan_status.
--   • pengembalian_pengamanan → pegawai mengembalikan barang (lepas dari
--                               kustodi). Barang tetap jadi RIWAYAT di kartu
--                               (status "Dikembalikan"). Null cache. Setelah
--                               kembali, barang bebas diserahkan ke pegawai
--                               BARU (buat kartu pengamanan baru).
--   • batal_pengamanan        → KOREKSI salah catat (pola batal_pemanfaatan):
--                               barang hilang total dari kartu (dianggap tak
--                               pernah diserahkan). Null cache.
--
-- ⚠️ DEPLOY-ORDERING: file ini WAJIB dijalankan SEBELUM deploy kode. ADD VALUE
-- tak boleh di blok transaksi & tak aman dipakai DML pada transaksi yang sama →
-- file sendirian (pola 20260721_01).
-- ============================================================================

ALTER TYPE jenis_transaksi_bmd ADD VALUE IF NOT EXISTS 'pengamanan';
ALTER TYPE jenis_transaksi_bmd ADD VALUE IF NOT EXISTS 'pengembalian_pengamanan';
ALTER TYPE jenis_transaksi_bmd ADD VALUE IF NOT EXISTS 'batal_pengamanan';
