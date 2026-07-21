-- ============================================================================
-- Pengamanan BMD — perluas jurnal_header.kategori dgn 'pengamanan' + kolom cache
-- aset.pengamanan.
--
-- 1 penyerahan pengamanan = 1 jurnal_header kategori 'pengamanan' (pegawai
-- penanggung jawab + BAST + Pakta Integritas di payload). Barang = baris
-- transaksi_bmd jenis 'pengamanan' ber-header_id sama. Ikut guard kunci-semester
-- fn_jurnal_header_guard yang sudah ada.
--
-- aset.pengamanan (text) = CACHE ringkas kustodian saat ini (mis. "Budi (NIP
-- 1980...)"), di-set saat serah, di-null saat kembali/batal. Dipakai picker
-- (.is('pengamanan', null) → hanya barang belum berkustodi yg bisa diserahkan,
-- menegakkan alur kembalikan-dulu-baru-serahkan). BUKAN sumber kebenaran — ledger
-- tetap otoritatif.
--
-- Jalankan SETELAH 20260722_01_pengamanan_enum.sql. Pola drop-by-name + re-add,
-- daftar kategori = superset terakhir (pemanfaatan) + 'pengamanan'.
-- ============================================================================

ALTER TABLE aset ADD COLUMN IF NOT EXISTS pengamanan text;

DO $$
DECLARE cname text;
BEGIN
  SELECT conname INTO cname
  FROM pg_constraint
  WHERE conrelid = 'jurnal_header'::regclass AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%kategori%';
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE jurnal_header DROP CONSTRAINT %I', cname);
  END IF;
END $$;

ALTER TABLE jurnal_header
  ADD CONSTRAINT jurnal_header_kategori_check
  CHECK (kategori IN ('penghapusan','kapitalisasi','pengadaan','pengalihan_status',
                       'hibah_masuk','tukar_menukar','hasil_inventarisasi','perolehan_lainnya',
                       'mutasi_internal','reklasifikasi','koreksi','konstruksi','pemanfaatan','pengamanan'));
