-- ============================================================================
-- Tahun Buku — kunci tahun akuntansi + cegah entry tanggal masa depan.
-- Jalankan SETELAH 20260704_22_pengalihan_kembalikan.sql.
--
-- Prinsip (didiskusikan dgn user 2026-07-07):
--   - Model data TETAP satu ledger kontinu (transaksi_bmd/aset TIDAK dipecah
--     per tahun) — tahun_buku murni tabel KONTROL, bukan partisi data.
--   - "Tutup tahun" = checkpoint (Opsi B): begitu tahun dikunci, angka
--     penyusutan_semester-nya beku selamanya (engine tak menimpanya lagi,
--     lihat migrasi checkpoint berikutnya) DAN tak ada transaksi/jurnal baru
--     boleh masuk ke tahun itu — KECUALI whitelist koreksi retroaktif di bawah.
--   - Tahun yang BELUM terdaftar di tahun_buku dianggap TERKUNCI (fail-closed)
--     — lebih aman drpd fail-open. Makanya migrasi ini WAJIB langsung seed
--     baris utk tahun yg sedang berjalan (lihat STEP 3), supaya kerja normal
--     tidak mendadak terblokir begitu migrasi ini di-deploy.
--   - TIDAK ADA forward-dating, TANPA KECUALI (bahkan whitelist retroaktif di
--     bawah tidak bisa melewati batas ini) — tanggal transaksi/jurnal wajib
--     <= current_date.
-- ============================================================================

-- ── 1. Tabel kontrol ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tahun_buku (
  tahun         int PRIMARY KEY,
  status        text NOT NULL DEFAULT 'terbuka' CHECK (status IN ('terbuka','terkunci')),
  ditutup_pada  timestamptz,
  ditutup_oleh  uuid REFERENCES auth.users(id),
  catatan       text
);

-- Log append-only perubahan status — jejak audit "siapa menutup/membuka tahun,
-- kapan, kenapa". Beda dari tahun_buku.status (snapshot terkini): log ini histori.
CREATE TABLE IF NOT EXISTS tahun_buku_log (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tahun      int NOT NULL,
  aksi       text NOT NULL CHECK (aksi IN ('tutup','buka')),
  oleh       uuid REFERENCES auth.users(id) DEFAULT auth.uid(),
  pada       timestamptz NOT NULL DEFAULT now(),
  catatan    text
);

CREATE OR REPLACE FUNCTION fn_tahun_buku_log_immutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'tahun_buku_log bersifat append-only: % dilarang.', TG_OP;
END $$;

DROP TRIGGER IF EXISTS trg_tahun_buku_log_immutable ON tahun_buku_log;
CREATE TRIGGER trg_tahun_buku_log_immutable
  BEFORE UPDATE OR DELETE ON tahun_buku_log
  FOR EACH ROW EXECUTE FUNCTION fn_tahun_buku_log_immutable();

-- ── 2. RLS: semua authenticated baca; tulis hanya admin ─────────────────────
ALTER TABLE tahun_buku ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tb_select" ON tahun_buku;
CREATE POLICY "tb_select" ON tahun_buku FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "tb_write" ON tahun_buku;
CREATE POLICY "tb_write" ON tahun_buku FOR ALL TO authenticated
  USING (fn_is_admin()) WITH CHECK (fn_is_admin());

ALTER TABLE tahun_buku_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tbl_select" ON tahun_buku_log;
CREATE POLICY "tbl_select" ON tahun_buku_log FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "tbl_insert" ON tahun_buku_log;
CREATE POLICY "tbl_insert" ON tahun_buku_log FOR INSERT TO authenticated WITH CHECK (fn_is_admin());

-- ── 3. Seed tahun berjalan — WAJIB, supaya migrasi ini tidak memblokir kerja
--    normal begitu di-deploy (tahun tak terdaftar = default TERKUNCI).
--    2025 = baseline e-BMD, sudah final/teraudit → terkunci sejak awal.
--    2026 = tahun berjalan saat migrasi ini ditulis → terbuka.
INSERT INTO tahun_buku (tahun, status, catatan) VALUES
  (2025, 'terkunci', 'Baseline e-BMD (saldo_awal_2026) — final sejak migrasi diterapkan, bukan hasil aksi Tutup Tahun formal.'),
  (2026, 'terbuka', 'Tahun berjalan saat fitur Tahun Buku diterapkan.')
ON CONFLICT (tahun) DO NOTHING;

-- ── 4. Guard: no forward-date (mutlak) + no entry ke tahun terkunci (kecuali
--    whitelist koreksi retroaktif yang SUDAH ADA di aplikasi — lihat CLAUDE.md
--    pola APPROVAL & pola jurnal ber-SK). Dipasang di transaksi_bmd (ledger)
--    DAN jurnal_header (kartu jurnal) — dua-duanya menyimpan `tanggal` yang
--    dipakai turunkan `periode`.
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
    -- WHITELIST koreksi retroaktif yang SUDAH ADA di aplikasi (per 2026-07-07):
    -- batal_pengadaan/batal_penghapusan/batal_kapitalisasi SENGAJA dicatat mundur
    -- ke tanggal kejadian asli (lihat lib/transaksi.ts, Kapitalisasi.tsx,
    -- Penghapusan.tsx) — supaya replay engine period-correct. TAMBAHKAN di sini
    -- kalau ada jenis lain yg perlu backdate ke tahun terkunci (user 2026-07-07:
    -- "pengecualian akan dijelaskan lebih lanjut" — daftar ini BELUM final).
    IF TG_TABLE_NAME = 'transaksi_bmd' AND NEW.jenis IN ('batal_pengadaan', 'batal_penghapusan', 'batal_kapitalisasi') THEN
      v_exempt := true;
    END IF;

    IF NOT v_exempt THEN
      RAISE EXCEPTION 'Tahun % sudah tutup buku (terkunci) — tidak bisa menambah % baru di tahun ini.',
        v_tahun, CASE WHEN TG_TABLE_NAME = 'transaksi_bmd' THEN 'transaksi' ELSE 'jurnal' END;
    END IF;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_transaksi_bmd_tahun_buku ON transaksi_bmd;
CREATE TRIGGER trg_transaksi_bmd_tahun_buku
  BEFORE INSERT ON transaksi_bmd
  FOR EACH ROW EXECUTE FUNCTION fn_cek_tahun_buku();

DROP TRIGGER IF EXISTS trg_jurnal_header_tahun_buku ON jurnal_header;
CREATE TRIGGER trg_jurnal_header_tahun_buku
  BEFORE INSERT ON jurnal_header
  FOR EACH ROW EXECUTE FUNCTION fn_cek_tahun_buku();

-- Catatan: guard ini HANYA berlaku saat INSERT (baris baru). Untuk jurnal_header,
-- UPDATE (edit No SK/tanggal) sudah dijaga terpisah oleh fn_jurnal_header_guard
-- (migrasi 07) — tanggal baru wajib tetap di semester yg sama dgn periode beku
-- header, jadi otomatis tak bisa "kabur" ke tahun lain lewat edit.
