-- ============================================================================
-- Migrasi data: saldo_awal_2026 → register aset + transaksi 'saldo_awal'
-- (PLAN §11: 6.518 aset existing JANGAN hilang; generate transaksi saldo_awal
--  sintetis biar konsisten dengan model ledger.)
-- Re-runnable: guard NOT EXISTS di kedua insert.
-- ============================================================================

-- 1. Register aset dari baseline e-bmd
INSERT INTO aset (nibar, kode, nama_barang, nilai_perolehan, tgl_perolehan,
                  skpd_id, intra_ekstra, cara_perolehan, status)
SELECT s.nibar, s.kode_barang, s.nama_barang, COALESCE(s.nilai_perolehan, 0),
       s.tgl_perolehan, s.skpd_id, s.intra_ekstra, 'saldo_awal', 'aktif'
FROM saldo_awal_2026 s
WHERE s.nibar IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM aset a WHERE a.nibar = s.nibar);

-- 2. Transaksi saldo_awal per aset (baseline ledger, periode cutoff 2025-S2).
--    Payload menyimpan angka baseline yang dipakai engine buat lanjut maju:
--    akumulasi 2025, nilai buku awal, sisa smt, beban per smt (dari e-bmd).
INSERT INTO transaksi_bmd (aset_id, jenis, periode, tanggal, nilai, skpd_tujuan, payload, keterangan)
SELECT a.id, 'saldo_awal', '2025-S2', DATE '2025-12-31', COALESCE(s.nilai_perolehan, 0), s.skpd_id,
       jsonb_build_object(
         'akumulasi_2025',        s.akumulasi_2025,
         'nilai_buku_awal',       s.nilai_buku_awal,
         'sisa_masa_manfaat_smt', s.sisa_masa_manfaat_smt,
         'masa_manfaat_smt',      s.masa_manfaat_smt,
         'beban_per_smt',         s.beban_penyusutan_per_smt,
         'sumber',                'e-bmd baseline 2026'
       ),
       'Saldo awal 2026 — import baseline dari e-bmd'
FROM saldo_awal_2026 s
JOIN aset a ON a.nibar = s.nibar
WHERE NOT EXISTS (
  SELECT 1 FROM transaksi_bmd t WHERE t.aset_id = a.id AND t.jenis = 'saldo_awal'
);

-- 3. FK kode → kodefikasi_bmd, NOT VALID: baris lama warisan e-bmd yang kodenya
--    tidak ada di kodefikasi TIDAK divalidasi ulang (kekacauan e-bmd diterima
--    sebagai baseline), tapi semua tulisan baru wajib kode valid.
DO $$ BEGIN
  ALTER TABLE aset
    ADD CONSTRAINT fk_aset_kodefikasi FOREIGN KEY (kode)
    REFERENCES kodefikasi_bmd(kode) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Verifikasi:
--   SELECT count(*) FROM aset;                                   -- ≈ 6518
--   SELECT count(*) FROM transaksi_bmd WHERE jenis='saldo_awal'; -- sama
--   SELECT count(*) FROM aset a LEFT JOIN kodefikasi_bmd k ON k.kode=a.kode
--     WHERE k.kode IS NULL;                                      -- kode anomali warisan
