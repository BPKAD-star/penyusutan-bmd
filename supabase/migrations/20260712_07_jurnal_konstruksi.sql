-- ============================================================================
-- Pekerjaan Konstruksi (KDP) — MERGE ke Pengadaan via jurnal_header.
-- Model baru (keputusan user 2026-07-12): 1 kontrak konstruksi = 1 kartu
-- jurnal_header (kategori 'konstruksi'), pola sama Pengadaan non-fisik:
--   - Field kontrak + rincian pembayaran (komponen/BAST/rekening/nominal)
--     disimpan di payload (draft, editable saat pending).
--   - Approval PER KONTRAK (admin). Baru saat approve: materialize 1 aset KDP
--     (1.3.6) senilai TOTAL pembayaran + event akumulasi_kdp per pembayaran.
--     Sebelum approve TIDAK ada aset → tak bocor ke Daftar Barang.
--   - Reklas KDP→aset tetap TETAP lewat menu Reklasifikasi yang ada (di luar sini).
--
-- Semua data konstruksi (nama pekerjaan, program/kegiatan, PPK, penyedia, nilai
-- kontrak, kode_kdp, flag "nambah masa manfaat existing" utk INFO, array
-- pembayaran, spesifikasi, foto) muat di payload JSON — tak perlu kolom baru.
-- Enum event akumulasi_kdp / batal_akumulasi_kdp sudah ada (migrasi 20260712_01).
-- Tabel proyek_konstruksi/barang/termin lama TIDAK dipakai lagi (di-retire; tak
-- di-drop supaya aman).
--
-- Jalankan SETELAH 20260712_06_aset_status_draft.sql.
-- ============================================================================
DO $$
DECLARE cname text;
BEGIN
  SELECT conname INTO cname FROM pg_constraint
  WHERE conrelid = 'jurnal_header'::regclass AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%kategori%';
  IF cname IS NOT NULL THEN EXECUTE format('ALTER TABLE jurnal_header DROP CONSTRAINT %I', cname); END IF;
END $$;

ALTER TABLE jurnal_header
  ADD CONSTRAINT jurnal_header_kategori_check
  CHECK (kategori IN ('penghapusan','kapitalisasi','pengadaan','pengalihan_status',
                       'hibah_masuk','tukar_menukar','hasil_inventarisasi','perolehan_lainnya',
                       'mutasi_internal','reklasifikasi','koreksi','konstruksi'));
