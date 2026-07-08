-- ============================================================================
-- Entry manual utk Hibah, Tukar Menukar (baru), Hasil Inventarisasi, Perolehan
-- Lainnya (pola sama Pengadaan: jurnal_header draft+approval, materialize ke
-- aset+transaksi_bmd) + kolom aset.penggunaan.
-- Jalankan SETELAH 20260707_01_admin_master_data.sql.
-- ============================================================================

-- ── 1. aset.penggunaan (field spesifikasi baru, muncul di atas Keterangan) ──
ALTER TABLE aset ADD COLUMN IF NOT EXISTS penggunaan text;

-- ── 2. aset.cara_perolehan: tambah 'tukar_menukar' ──────────────────────────
DO $$
DECLARE cname text;
BEGIN
  SELECT conname INTO cname
  FROM pg_constraint
  WHERE conrelid = 'aset'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%cara_perolehan%';
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE aset DROP CONSTRAINT %I', cname);
  END IF;
END $$;

ALTER TABLE aset ADD CONSTRAINT aset_cara_perolehan_check
  CHECK (cara_perolehan IN ('saldo_awal','pengadaan','hibah_masuk','hasil_inventarisasi','perolehan_lainnya','tukar_menukar'));

-- ── 3. jenis_transaksi_bmd: 'tukar_menukar' (sisi perolehan) + 4 nilai batal_
--    (pola unapprove, ikut batal_pengadaan) ─────────────────────────────────
ALTER TYPE jenis_transaksi_bmd ADD VALUE IF NOT EXISTS 'tukar_menukar';
ALTER TYPE jenis_transaksi_bmd ADD VALUE IF NOT EXISTS 'batal_hibah_masuk';
ALTER TYPE jenis_transaksi_bmd ADD VALUE IF NOT EXISTS 'batal_tukar_menukar';
ALTER TYPE jenis_transaksi_bmd ADD VALUE IF NOT EXISTS 'batal_hasil_inventarisasi';
ALTER TYPE jenis_transaksi_bmd ADD VALUE IF NOT EXISTS 'batal_perolehan_lainnya';

-- ── 4. jurnal_header.kategori: tambah 4 kategori perolehan baru ─────────────
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
                       'hibah_masuk','tukar_menukar','hasil_inventarisasi','perolehan_lainnya'));

-- ── 5. fn_cek_tahun_buku: perluas whitelist backdate ke tahun terkunci ──────
-- Hibah/Tukar Menukar/Hasil Inventarisasi/Perolehan Lainnya butuh backdate per
-- barang (tanggal perolehan bisa jauh di tahun lama, ketemu belakangan) —
-- sama seperti batal_pengadaan dkk, penyusutannya di-restate mundur oleh
-- engine (Skenario A, docs/PLAN-period-lock.md §3) sampai lapsem resmi mulai.
CREATE OR REPLACE FUNCTION fn_cek_tahun_buku() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_tahun  int;
  v_status text;
  v_exempt boolean := false;
BEGIN
  IF NEW.tanggal > current_date THEN
    RAISE EXCEPTION 'Tanggal (%) tidak boleh di masa depan (hari ini %).', NEW.tanggal, current_date;
  END IF;

  v_tahun := EXTRACT(YEAR FROM NEW.tanggal)::int;
  SELECT status INTO v_status FROM tahun_buku WHERE tahun = v_tahun;
  IF v_status IS NULL THEN v_status := 'terkunci'; END IF;

  IF v_status = 'terkunci' THEN
    IF TG_TABLE_NAME = 'transaksi_bmd' AND NEW.jenis IN (
      'batal_pengadaan', 'batal_penghapusan', 'batal_kapitalisasi',
      'hibah_masuk', 'tukar_menukar', 'hasil_inventarisasi', 'perolehan_lainnya',
      'batal_hibah_masuk', 'batal_tukar_menukar', 'batal_hasil_inventarisasi', 'batal_perolehan_lainnya'
    ) THEN
      v_exempt := true;
    END IF;

    IF NOT v_exempt THEN
      RAISE EXCEPTION 'Tahun % sudah tutup buku (terkunci) — tidak bisa menambah % baru di tahun ini.',
        v_tahun, CASE WHEN TG_TABLE_NAME = 'transaksi_bmd' THEN 'transaksi' ELSE 'jurnal' END;
    END IF;
  END IF;

  RETURN NEW;
END $$;
