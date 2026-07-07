-- ============================================================================
-- BMD — Menu Pengadaan (ber-SK) memakai pola jurnal_header yang sama dgn
-- Penghapusan/Kapitalisasi. Jalankan SETELAH 20260704_07_jurnal_header.sql.
--
-- Beda Pengadaan dari Penghapusan:
--   - Penghapusan MEMILIH aset yang sudah ada lalu men-soft-delete-nya.
--   - Pengadaan MEMBUAT aset baru (cara_perolehan='pengadaan') + transaksi
--     ledger 'pengadaan' ber-header_id. Kuantitas > 1 → di-split jadi N aset
--     (masing-masing jumlah=1) di sisi aplikasi.
--
-- Header pengadaan (jurnal_header) menyimpan data kontrak & BAST:
--   - no_sk     = Nomor Kontrak
--   - tanggal   = Tanggal Kontrak (dipakai guard kunci-semester, sama spt SK lain)
--   - jenis     = sumber pengadaan (kwitansi|bukti_pembelian|surat_pesanan|spk)
--   - keterangan= keterangan kontrak
--   - payload   = { program, kegiatan, sub_kegiatan, nama_penyedia, nama_ppk,
--                   no_bast, tgl_bast, ket_bast }  (program/kegiatan teks-bebas dulu)
-- Baris ledger transaksi_bmd 'pengadaan' tetap beku (append-only). Tanggal
-- perolehan aset & periode ledger memakai TANGGAL BAST (serah terima) — bukan
-- tanggal kontrak — supaya penyusutan mulai dari serah terima (fallback: tgl kontrak).
-- ============================================================================

-- ── 1. Izinkan kategori 'pengadaan' di jurnal_header ────────────────────────
-- Drop CHECK lama apa pun namanya (cari yang menyebut kolom kategori), lalu
-- pasang ulang dgn 'pengadaan'. Aman kalau nama auto-generate-nya berbeda.
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
  CHECK (kategori IN ('penghapusan','kapitalisasi','pengadaan'));

-- ── 2. Kolom payload untuk field ber-SK tambahan (pengadaan: kontrak+BAST) ──
-- Aman untuk baris penghapusan/kapitalisasi lama (default '{}').
ALTER TABLE jurnal_header ADD COLUMN IF NOT EXISTS payload jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Tidak ada perubahan pada aset/transaksi_bmd: kolom untuk pengadaan sudah ada
-- (kode, nama_barang, spesifikasi, merek_tipe, jumlah, satuan, harga_satuan,
--  nilai_perolehan, tgl_perolehan, intra_ekstra, cara_perolehan). Enum
-- jenis_transaksi_bmd sudah memuat 'pengadaan', cara_perolehan sudah memuat
-- 'pengadaan'. NIBAR dibiarkan NULL saat entry, diisi belakangan lewat edit.
