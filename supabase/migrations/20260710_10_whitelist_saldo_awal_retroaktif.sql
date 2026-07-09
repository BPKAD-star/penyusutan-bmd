-- ============================================================================
-- fn_cek_tahun_buku(): tambah 'saldo_awal' ke whitelist retroaktif (migrasi 23).
-- Dibutuhkan utk backfill "Import Tanah Lengkap" (2026-07-10) — 16 barang
-- Tanah lama yang kelewat kecatat di baseline 2025 awal, harus ditulis dgn
-- ledger jenis 'saldo_awal' bertanggal 2025-12-31 (periode cutoff baseline,
-- sama pola dgn 20260702_03_saldo_awal_ke_ledger.sql) — bukan tanggal hari
-- ini, dan bukan tanggal perolehan asli (banyak dari 1970an-2000an, kalau
-- dipaksa lewat jalur Pengadaan/Perolehan Manual biasa bakal ditolak trigger
-- krn tahun2 itu gak pernah terdaftar 'terbuka' di tahun_buku).
-- Jalankan SETELAH 20260708_04_koreksi_pencatatan_ganda_whitelist.sql.
-- ============================================================================

CREATE OR REPLACE FUNCTION fn_cek_tahun_buku() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_tahun  int;
  v_status text;
  v_exempt boolean := false;
BEGIN
  -- Mutlak, tanpa kecuali apa pun (termasuk whitelist di bawah).
  IF NEW.tanggal > current_date THEN
    RAISE EXCEPTION 'Tanggal (%) tidak boleh di masa depan (hari ini %).', NEW.tanggal, current_date;
  END IF;

  v_tahun := EXTRACT(YEAR FROM NEW.tanggal)::int;
  SELECT status INTO v_status FROM tahun_buku WHERE tahun = v_tahun;
  IF v_status IS NULL THEN v_status := 'terkunci'; END IF; -- fail-closed: tahun tak terdaftar = terkunci

  IF v_status = 'terkunci' THEN
    -- WHITELIST koreksi/backfill retroaktif yang SUDAH ADA di aplikasi (per
    -- 2026-07-10): batal_pengadaan/batal_penghapusan/batal_kapitalisasi/
    -- koreksi_pencatatan_ganda/saldo_awal SENGAJA dicatat mundur ke tanggal
    -- kejadian/cutoff asli — supaya replay engine period-correct. TAMBAHKAN
    -- di sini kalau ada jenis lain yg perlu backdate ke tahun terkunci —
    -- daftar ini BELUM final.
    IF TG_TABLE_NAME = 'transaksi_bmd' AND NEW.jenis IN
      ('batal_pengadaan', 'batal_penghapusan', 'batal_kapitalisasi', 'koreksi_pencatatan_ganda', 'saldo_awal') THEN
      v_exempt := true;
    END IF;

    IF NOT v_exempt THEN
      RAISE EXCEPTION 'Tahun % sudah tutup buku (terkunci) — tidak bisa menambah % baru di tahun ini.',
        v_tahun, CASE WHEN TG_TABLE_NAME = 'transaksi_bmd' THEN 'transaksi' ELSE 'jurnal' END;
    END IF;
  END IF;

  RETURN NEW;
END $$;
