-- ============================================================================
-- BMD Kabupaten Kediri — Core Schema Expansion
-- Jalankan di Supabase SQL Editor SETELAH schema existing (profiles.sql).
-- Urutan: 01_bmd_core → 02_overhaul_band_seed → 03_saldo_awal_ke_ledger
--
-- Prinsip (PLAN §1):
--   - transaksi_bmd = ledger append-only (UPDATE/DELETE diblokir trigger)
--   - masa manfaat di DB disimpan dalam TAHUN; konversi ×2 hanya di engine
-- ============================================================================

-- ── 0. Koreksi mapping jenis_aset_id di kodefikasi_bmd ─────────────────────
-- ETL lama salah map: 1.5.2 (Pemanfaatan) ke-tag ATB, 1.5.3 (ATB: Goodwill,
-- Lisensi, Hak Cipta, Software — masa manfaat 5 th) ke-tag Aset Lain-lain.
-- Verifikasi data 2026-07-02: semua baris 1.5.3 punya masa_manfaat_tahun > 0.
UPDATE kodefikasi_bmd SET jenis_aset_id = 7    WHERE kode_jenis = '1.5.3';
UPDATE kodefikasi_bmd SET jenis_aset_id = 8    WHERE kode_jenis = '1.5.4';
UPDATE kodefikasi_bmd SET jenis_aset_id = NULL WHERE kode_jenis IN ('1.5.2','1.5.5','1.5.6','1.3.7');

-- ── 1. profiles: identitas operator per SKPD (PLAN §10) ────────────────────
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS nip text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS pangkat_golongan text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS username text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS skpd_id bigint REFERENCES skpd(id);

-- ── 2. Register aset (master tiap barang) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS aset (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nibar            text UNIQUE,
  kode             text NOT NULL,          -- FK ke kodefikasi_bmd ditambah NOT VALID di migrasi 03
  nama_barang      text,
  spesifikasi      text,
  merek_tipe       text,
  jumlah           numeric NOT NULL DEFAULT 1,
  satuan           text,
  harga_satuan     numeric,
  nilai_perolehan  numeric NOT NULL DEFAULT 0,  -- basis penyusutan; bertambah saat kapitalisasi
  tgl_perolehan    date,
  skpd_id          bigint REFERENCES skpd(id),
  intra_ekstra     text,                   -- 'intra' | 'ekstra' (ekstrakomptabel tidak disusutkan)
  cara_perolehan   text NOT NULL DEFAULT 'saldo_awal'
                   CHECK (cara_perolehan IN ('saldo_awal','pengadaan','hibah_masuk','hasil_inventarisasi','perolehan_lainnya')),
  status           text NOT NULL DEFAULT 'aktif' CHECK (status IN ('aktif','dihapus')),
  keterangan       text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_aset_skpd   ON aset(skpd_id);
CREATE INDEX IF NOT EXISTS idx_aset_kode   ON aset(kode);
CREATE INDEX IF NOT EXISTS idx_aset_status ON aset(status);

-- ── 3. Ledger transaksi append-only (PLAN §1.1, §5) ─────────────────────────
DO $$ BEGIN
  CREATE TYPE jenis_transaksi_bmd AS ENUM (
    'saldo_awal',
    -- Cara perolehan (§5A)
    'pengadaan', 'hibah_masuk', 'hasil_inventarisasi', 'perolehan_lainnya',
    -- Pengelolaan (§5B)
    'mutasi_internal',            -- no.6/7: pindah antar sub-SKPD dalam induk sama
    'pengalihan_status',          -- no.11b/5: transfer antar SKPD (pengguna barang)
    'reklas_kode',                -- no.8a
    'reklas_komptabel',           -- no.8b: DEFERRED — enum disiapkan, logika belum
    'koreksi_nilai',              -- no.9a
    'koreksi_spesifikasi',        -- no.9b
    'koreksi_kuantitas',          -- no.9c: DEFERRED di alokasi akum penyusutan
    'kapitalisasi',               -- no.10: rehab/penambahan masa manfaat
    'penghapusan_pemindahtanganan',  -- no.11a (payload.sub_jenis: hibah|penjualan|tukar_menukar|penyertaan_modal)
    'penghapusan_sebab_lain'         -- no.11c: force majeure
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS transaksi_bmd (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  aset_id      uuid NOT NULL REFERENCES aset(id),
  jenis        jenis_transaksi_bmd NOT NULL,
  periode      text NOT NULL,               -- 'YYYY-S1' | 'YYYY-S2'
  tanggal      date NOT NULL DEFAULT current_date,
  nilai        numeric NOT NULL DEFAULT 0,  -- nilai transaksi (perolehan/rehab/delta koreksi)
  skpd_asal    bigint REFERENCES skpd(id),
  skpd_tujuan  bigint REFERENCES skpd(id),
  payload      jsonb NOT NULL DEFAULT '{}'::jsonb,  -- detail per jenis (BAST, penyedia, sub_jenis, dll)
  keterangan   text,
  created_by   uuid REFERENCES auth.users(id) DEFAULT auth.uid(),
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_trx_aset    ON transaksi_bmd(aset_id);
CREATE INDEX IF NOT EXISTS idx_trx_jenis   ON transaksi_bmd(jenis);
CREATE INDEX IF NOT EXISTS idx_trx_periode ON transaksi_bmd(periode);
CREATE INDEX IF NOT EXISTS idx_trx_skpd    ON transaksi_bmd(skpd_asal, skpd_tujuan);

-- Aturan keras §1.1: transaksi TIDAK PERNAH di-UPDATE/DELETE.
-- Koreksi = transaksi baru yang membalik/menyesuaikan.
CREATE OR REPLACE FUNCTION fn_transaksi_bmd_immutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'transaksi_bmd bersifat append-only: % dilarang. Buat transaksi koreksi baru.', TG_OP;
END $$;

DROP TRIGGER IF EXISTS trg_transaksi_bmd_immutable ON transaksi_bmd;
CREATE TRIGGER trg_transaksi_bmd_immutable
  BEFORE UPDATE OR DELETE ON transaksi_bmd
  FOR EACH ROW EXECUTE FUNCTION fn_transaksi_bmd_immutable();

-- ── 4. Hasil penyusutan per aset per semester (engine event-driven) ─────────
CREATE TABLE IF NOT EXISTS penyusutan_semester (
  id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  aset_id            uuid NOT NULL REFERENCES aset(id),
  periode            text NOT NULL,
  metode             text NOT NULL DEFAULT 'penyusutan' CHECK (metode IN ('penyusutan','amortisasi','tidak')),
  nilai_perolehan    numeric NOT NULL DEFAULT 0,
  nilai_buku_awal    numeric NOT NULL DEFAULT 0,
  beban              numeric NOT NULL DEFAULT 0,
  akumulasi          numeric NOT NULL DEFAULT 0,
  nilai_buku_akhir   numeric NOT NULL DEFAULT 0,
  sisa_semester      integer NOT NULL DEFAULT 0,   -- counter integer, dikurangi 1 tiap periode (§6.3)
  masa_manfaat_tahun numeric,                      -- canonical TAHUN (§6 step 3)
  dihitung_pada      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (aset_id, periode)
);
CREATE INDEX IF NOT EXISTS idx_ps_periode ON penyusutan_semester(periode);

-- ── 5. Band overhaul/kapitalisasi (PLAN §6.1) ───────────────────────────────
CREATE TABLE IF NOT EXISTS overhaul_band (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kode_prefix    text NOT NULL,     -- prefix kode aset (level sub-rincian, mis. '1.3.2.01.01'; ATB: '1.5.3')
  uraian         text,
  band_no        smallint NOT NULL, -- urutan band (1 = persentase terkecil)
  label          text,              -- label asli sheet, mis. '>30% - 45%'
  pct_min        numeric NOT NULL,  -- batas bawah (eksklusif)
  pct_max        numeric,           -- batas atas (inklusif); NULL = open-ended
  tambahan_tahun smallint NOT NULL,
  UNIQUE (kode_prefix, band_no)
);

-- ── 6. RLS per SKPD (PLAN §10) ──────────────────────────────────────────────
-- Helper: path ltree SKPD milik user login (NULL kalau tidak di-set).
CREATE OR REPLACE FUNCTION fn_my_skpd_path() RETURNS ltree
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.path FROM profiles p JOIN skpd s ON s.id = p.skpd_id WHERE p.id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION fn_is_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
$$;

-- SKPD dalam subtree user (descendant-or-self dari SKPD user).
CREATE OR REPLACE FUNCTION fn_skpd_visible(p_skpd_id bigint) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN p_skpd_id IS NULL THEN false
    ELSE EXISTS (SELECT 1 FROM skpd s WHERE s.id = p_skpd_id AND s.path <@ fn_my_skpd_path())
  END
$$;

ALTER TABLE aset ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "aset_select" ON aset;
CREATE POLICY "aset_select" ON aset FOR SELECT TO authenticated
  USING (fn_is_admin() OR fn_skpd_visible(skpd_id));
DROP POLICY IF EXISTS "aset_insert" ON aset;
CREATE POLICY "aset_insert" ON aset FOR INSERT TO authenticated
  WITH CHECK (fn_is_admin() OR fn_skpd_visible(skpd_id));
DROP POLICY IF EXISTS "aset_update" ON aset;
CREATE POLICY "aset_update" ON aset FOR UPDATE TO authenticated
  USING (fn_is_admin() OR fn_skpd_visible(skpd_id));
-- Tidak ada policy DELETE: penghapusan = soft-delete via transaksi (status='dihapus').

ALTER TABLE transaksi_bmd ENABLE ROW LEVEL SECURITY;
-- SKPD asal & tujuan sama-sama bisa lihat histori transfer (§5 no.5/7).
DROP POLICY IF EXISTS "trx_select" ON transaksi_bmd;
CREATE POLICY "trx_select" ON transaksi_bmd FOR SELECT TO authenticated
  USING (
    fn_is_admin()
    OR fn_skpd_visible(skpd_asal)
    OR fn_skpd_visible(skpd_tujuan)
    OR EXISTS (SELECT 1 FROM aset a WHERE a.id = aset_id AND fn_skpd_visible(a.skpd_id))
  );
DROP POLICY IF EXISTS "trx_insert" ON transaksi_bmd;
CREATE POLICY "trx_insert" ON transaksi_bmd FOR INSERT TO authenticated
  WITH CHECK (
    fn_is_admin()
    OR EXISTS (SELECT 1 FROM aset a WHERE a.id = aset_id AND fn_skpd_visible(a.skpd_id))
  );
-- UPDATE/DELETE: tidak ada policy + trigger immutable = append-only berlapis.

ALTER TABLE penyusutan_semester ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ps_select" ON penyusutan_semester;
CREATE POLICY "ps_select" ON penyusutan_semester FOR SELECT TO authenticated
  USING (fn_is_admin() OR EXISTS (SELECT 1 FROM aset a WHERE a.id = aset_id AND fn_skpd_visible(a.skpd_id)));
-- INSERT/UPDATE hanya service role (engine via API).

ALTER TABLE overhaul_band ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ob_select" ON overhaul_band;
CREATE POLICY "ob_select" ON overhaul_band FOR SELECT TO authenticated USING (true);

-- saldo_awal_2026 dibaca engine & laporan
ALTER TABLE saldo_awal_2026 ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "sa_select" ON saldo_awal_2026;
CREATE POLICY "sa_select" ON saldo_awal_2026 FOR SELECT TO authenticated USING (true);

-- updated_at otomatis
CREATE OR REPLACE FUNCTION fn_set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END $$;
DROP TRIGGER IF EXISTS trg_aset_updated_at ON aset;
CREATE TRIGGER trg_aset_updated_at BEFORE UPDATE ON aset
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
