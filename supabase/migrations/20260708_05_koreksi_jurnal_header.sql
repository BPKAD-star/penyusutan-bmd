-- ============================================================================
-- jurnal_header.kategori: tambah 'koreksi' — Koreksi Nilai Perolehan &
-- Koreksi Pencatatan Ganda direstrukturisasi jadi alur ber-SK (sama pola
-- dgn Reklasifikasi/Penghapusan/Kapitalisasi): SKPD → jurnal (No Dokumen
-- Koreksi + tanggal + keterangan) → pilih barang. Sama-SKPD, tanpa draft/
-- approval — cukup widen CHECK, TIDAK perlu cabang baru di
-- fn_jurnal_header_guard() (guard semester generik sudah berlaku otomatis
-- utk semua kategori). "Koreksi Spesifikasi" TIDAK ikut pola ini, tetap
-- alur lama tanpa jurnal_header.
-- Jalankan SETELAH 20260708_04_koreksi_pencatatan_ganda_whitelist.sql.
-- ============================================================================

DO $$
DECLARE cname text;
BEGIN
  SELECT conname INTO cname
  FROM pg_constraint
  WHERE conrelid = 'jurnal_header'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%kategori%';
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE jurnal_header DROP CONSTRAINT %I', cname);
  END IF;
END $$;

ALTER TABLE jurnal_header
  ADD CONSTRAINT jurnal_header_kategori_check
  CHECK (kategori IN ('penghapusan','kapitalisasi','pengadaan','pengalihan_status',
                       'hibah_masuk','tukar_menukar','hasil_inventarisasi','perolehan_lainnya',
                       'mutasi_internal','reklasifikasi','koreksi'));
