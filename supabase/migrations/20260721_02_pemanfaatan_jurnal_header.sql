-- ============================================================================
-- Pemanfaatan BMD — perluas jurnal_header.kategori dgn 'pemanfaatan'.
--
-- 1 perjanjian pemanfaatan = 1 jurnal_header kategori 'pemanfaatan' (No/Tgl
-- dokumen + payload: jenis, mitra, alamat, mulai, masa, berakhir, peruntukan,
-- jenis dokumen). Barang = baris transaksi_bmd jenis 'pemanfaatan' ber-header_id
-- sama (lingkup Seluruh/Sebagian di payload baris). Ikut guard kunci-semester
-- fn_jurnal_header_guard yang sudah ada — tak perlu trigger baru.
--
-- Jalankan SETELAH 20260721_01_pemanfaatan_enum.sql. Pola drop-by-name lalu
-- re-add (nama constraint bisa beda antar-lingkungan) — identik migrasi
-- 20260708_05 / 20260712_07. Daftar kategori = superset terakhir (konstruksi)
-- + 'pemanfaatan'; JANGAN buang satu pun yang lama (memblok menu lain).
-- ============================================================================

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
                       'mutasi_internal','reklasifikasi','koreksi','konstruksi','pemanfaatan'));
