-- ============================================================================
-- jurnal_header.kategori: tambah 'reklasifikasi' — dipakai modul Reklasifikasi
-- baru (4 alasan: komptabel intra<->ekstra, perubahan fungsi BMD, kesalahan
-- kodefikasi). Sama-SKPD, tanpa draft/approval (beda dari pengalihan_status/
-- mutasi_internal) — cukup widen CHECK, TIDAK perlu cabang baru di
-- fn_jurnal_header_guard() (guard semester generik sudah berlaku otomatis
-- utk semua kategori).
-- Jalankan SETELAH 20260708_01_reklas_golongan_enum.sql.
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
                       'mutasi_internal','reklasifikasi'));
