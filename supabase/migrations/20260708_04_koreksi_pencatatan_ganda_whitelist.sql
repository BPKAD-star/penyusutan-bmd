-- ============================================================================
-- fn_cek_tahun_buku(): tambah 'koreksi_pencatatan_ganda' ke whitelist retroaktif
-- (migrasi 23) — barang duplikat dibatalkan MUNDUR ke tanggal perolehan ASLI-
-- nya (sama pola dgn batal_pengadaan/batal_penghapusan/batal_kapitalisasi),
-- yang bisa jatuh di tahun yang sudah terkunci. Tanpa ini, trigger bakal
-- nolak insert baris koreksi_pencatatan_ganda kalau barangnya diperoleh di
-- tahun yang sudah tutup buku.
-- Jalankan SETELAH 20260708_03_koreksi_pencatatan_ganda_enum.sql.
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
    -- WHITELIST koreksi retroaktif yang SUDAH ADA di aplikasi (per 2026-07-08):
    -- batal_pengadaan/batal_penghapusan/batal_kapitalisasi/koreksi_pencatatan_ganda
    -- SENGAJA dicatat mundur ke tanggal kejadian asli (lihat lib/transaksi.ts,
    -- Kapitalisasi.tsx, Penghapusan.tsx, Koreksi.tsx) — supaya replay engine
    -- period-correct. TAMBAHKAN di sini kalau ada jenis lain yg perlu backdate
    -- ke tahun terkunci — daftar ini BELUM final.
    IF TG_TABLE_NAME = 'transaksi_bmd' AND NEW.jenis IN
      ('batal_pengadaan', 'batal_penghapusan', 'batal_kapitalisasi', 'koreksi_pencatatan_ganda') THEN
      v_exempt := true;
    END IF;

    IF NOT v_exempt THEN
      RAISE EXCEPTION 'Tahun % sudah tutup buku (terkunci) — tidak bisa menambah % baru di tahun ini.',
        v_tahun, CASE WHEN TG_TABLE_NAME = 'transaksi_bmd' THEN 'transaksi' ELSE 'jurnal' END;
    END IF;
  END IF;

  RETURN NEW;
END $$;
