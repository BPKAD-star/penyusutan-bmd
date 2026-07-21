-- ============================================================================
-- Pemanfaatan BMD — nilai enum jenis_transaksi_bmd baru.
--
--   • pemanfaatan          → barang mulai dimanfaatkan pihak ketiga (sewa,
--                            pinjam pakai, KSP, BGS/BSG, KSPI). NETRAL: tidak
--                            mengubah nilai/penyusutan, BUKAN event SEMBUNYI —
--                            barang tetap muncul & tetap disusutkan (persis
--                            pola pengalihan_status). Cuma overlay atribut.
--   • pemanfaatan_selesai  → pemanfaatan berakhir / diakhiri lebih awal
--                            (append-only, pola batal). Mengeluarkan barang
--                            dari kartu pemanfaatan & meng-null cache
--                            aset.pemanfaatan.
--
-- ⚠️ DEPLOY-ORDERING: file ini WAJIB dijalankan SEBELUM deploy kode — komponen
-- Pemanfaatan & KIBAR sudah memfilter jenis pakai nilai enum baru ini. ADD VALUE
-- tidak boleh di dalam blok transaksi & nilainya tak aman dipakai DML pada
-- transaksi yang sama → file sendirian, tanpa statement lain (pola migrasi
-- 20260708_01 / 20260719_03).
-- ============================================================================

ALTER TYPE jenis_transaksi_bmd ADD VALUE IF NOT EXISTS 'pemanfaatan';
ALTER TYPE jenis_transaksi_bmd ADD VALUE IF NOT EXISTS 'pemanfaatan_selesai';
