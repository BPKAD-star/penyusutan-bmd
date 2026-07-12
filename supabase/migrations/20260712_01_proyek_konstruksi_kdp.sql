-- ============================================================================
-- Proyek Konstruksi / KDP (Konstruksi Dalam Pengerjaan) — Fase 1: fondasi DB
-- Dasar: PSAP 08 (Akuntansi KDP). Pekerjaan fisik (gedung/jalan/jaringan) yang
-- biayanya menumpuk lintas termin & (mungkin) lintas tahun jadi SATU KDP,
-- lalu saat BAPP direklas ke aset tetap (full atau SEBAGIAN).
--
-- PRINSIP (ikut CLAUDE.md — TIDAK dilanggar):
--   - transaksi_bmd TETAP satu-satunya ledger. TIDAK ada ledger paralel. Tabel
--     di sini murni "lapisan kelola proyek" yang editable (pola sama jurnal_header
--     vs ledger beku). Angka finansial tetap ditulis sbg event di transaksi_bmd
--     lewat 4 jenis baru di bawah.
--   - Append-only: koreksi termin = event balik (batal_akumulasi_kdp), bukan
--     hapus baris ledger.
--   - Materialisasi (tulis transaksi_bmd + buat aset) dilakukan aplikasi/admin di
--     Fase 2 — migrasi ini hanya menyiapkan tabel, enum, guard, RLS.
--
-- Model event (dipakai Fase 2, di transaksi_bmd):
--   akumulasi_kdp        : termin disetujui → nilai KDP naik (di aset KDP 1.3.6),
--                          tgl = tgl termin (period-correct)
--   batal_akumulasi_kdp  : koreksi termin (event balik)
--   kdp_selesai_keluar   : carve-out → saldo KDP turun (di aset KDP)
--   kdp_selesai_masuk    : aset tetap hasil diakui pd tgl BAPP (di aset BARU) —
--                          jadi baseline penyusutan (engine mulai susut dari sini)
--
-- Jalankan di Supabase SQL Editor SETELAH 20260711_02_fix_rls_aset_awal_2026_skpd.sql.
-- ============================================================================

-- ── 1. Jenis transaksi baru (hanya DITAMBAH; belum dipakai di migrasi ini,
--    jadi aman dari batasan "enum value baru tak bisa dipakai di txn yg sama") ─
ALTER TYPE jenis_transaksi_bmd ADD VALUE IF NOT EXISTS 'akumulasi_kdp';
ALTER TYPE jenis_transaksi_bmd ADD VALUE IF NOT EXISTS 'batal_akumulasi_kdp';
ALTER TYPE jenis_transaksi_bmd ADD VALUE IF NOT EXISTS 'kdp_selesai_keluar';
ALTER TYPE jenis_transaksi_bmd ADD VALUE IF NOT EXISTS 'kdp_selesai_masuk';

-- ── 2. Header paket pekerjaan (editable, non-ledger) ────────────────────────
CREATE TABLE IF NOT EXISTS proyek_konstruksi (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  skpd_id         bigint NOT NULL REFERENCES admin_skpd(id),
  no_kontrak      text,
  tgl_kontrak     date,
  nama_pekerjaan  text NOT NULL,
  nilai_kontrak   numeric,                      -- pagu/nilai kontrak (cross-check, opsional)
  aset_kdp_id     uuid REFERENCES aset(id),      -- KDP (1.3.6) penampung; diisi saat termin pertama disetujui
  status          text NOT NULL DEFAULT 'berjalan'
                    CHECK (status IN ('berjalan','selesai')),
  keterangan      text,
  created_by      uuid REFERENCES auth.users(id) DEFAULT auth.uid(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_proyek_skpd   ON proyek_konstruksi(skpd_id);
CREATE INDEX IF NOT EXISTS idx_proyek_status ON proyek_konstruksi(status);
CREATE INDEX IF NOT EXISTS idx_proyek_kdp    ON proyek_konstruksi(aset_kdp_id);

-- ── 3. Rincian biaya per komponen/termin (tiap termin di-approve sendiri) ────
CREATE TABLE IF NOT EXISTS proyek_termin (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proyek_id   uuid NOT NULL REFERENCES proyek_konstruksi(id) ON DELETE CASCADE,
  komponen    text NOT NULL CHECK (komponen IN
                ('perencanaan','fisik','biaya_umum','pengawasan')),
  uraian      text,
  tanggal     date NOT NULL,                     -- tgl BAST/realisasi termin (period-correct)
  nilai       numeric NOT NULL CHECK (nilai >= 0),
  status      text NOT NULL DEFAULT 'draft'
                CHECK (status IN ('draft','disetujui')),
  trx_id      bigint REFERENCES transaksi_bmd(id), -- event akumulasi_kdp hasil materialisasi
  created_by  uuid REFERENCES auth.users(id) DEFAULT auth.uid(),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_termin_proyek ON proyek_termin(proyek_id);
CREATE INDEX IF NOT EXISTS idx_termin_status ON proyek_termin(status);

-- ── 4. updated_at (reuse fn_set_updated_at) ─────────────────────────────────
DROP TRIGGER IF EXISTS trg_proyek_updated ON proyek_konstruksi;
CREATE TRIGGER trg_proyek_updated BEFORE UPDATE ON proyek_konstruksi
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
DROP TRIGGER IF EXISTS trg_termin_updated ON proyek_termin;
CREATE TRIGGER trg_termin_updated BEFORE UPDATE ON proyek_termin
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- ── 5. Guard termin: approve hanya admin + kunci setelah disetujui ──────────
-- Operator SKPD input draft; admin (BKAD) yang menyetujui → itu memicu
-- materialisasi ke ledger (Fase 2). Setelah disetujui, field inti terkunci
-- (sudah nempel event); koreksi = termin balik / batal_akumulasi_kdp.
CREATE OR REPLACE FUNCTION fn_proyek_termin_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- transisi ke 'disetujui' = wewenang admin (Pengelola/BKAD)
    IF NEW.status = 'disetujui' AND OLD.status IS DISTINCT FROM 'disetujui'
       AND NOT fn_is_admin() THEN
      RAISE EXCEPTION 'Hanya admin (BKAD) yang boleh menyetujui termin.';
    END IF;
    -- termin yang sudah disetujui: field inti beku (sudah ada event ledger)
    IF OLD.status = 'disetujui' AND (
         NEW.komponen  IS DISTINCT FROM OLD.komponen
      OR NEW.tanggal   IS DISTINCT FROM OLD.tanggal
      OR NEW.nilai     IS DISTINCT FROM OLD.nilai
      OR NEW.proyek_id IS DISTINCT FROM OLD.proyek_id) THEN
      RAISE EXCEPTION 'Termin sudah disetujui — terkunci. Koreksi lewat termin balik / batalkan.';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_proyek_termin_guard ON proyek_termin;
CREATE TRIGGER trg_proyek_termin_guard BEFORE UPDATE ON proyek_termin
  FOR EACH ROW EXECUTE FUNCTION fn_proyek_termin_guard();

-- Termin yang sudah disetujui tidak boleh DIHAPUS (event ledger-nya tetap ada).
CREATE OR REPLACE FUNCTION fn_proyek_termin_no_delete_approved() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = 'disetujui' THEN
    RAISE EXCEPTION 'Termin sudah disetujui — tidak bisa dihapus (event ledger permanen).';
  END IF;
  RETURN OLD;
END $$;

DROP TRIGGER IF EXISTS trg_proyek_termin_no_delete ON proyek_termin;
CREATE TRIGGER trg_proyek_termin_no_delete BEFORE DELETE ON proyek_termin
  FOR EACH ROW EXECUTE FUNCTION fn_proyek_termin_no_delete_approved();

-- ── 6. RLS per-SKPD (pola jurnal_header/rkbmd) ──────────────────────────────
ALTER TABLE proyek_konstruksi ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "proyek_select" ON proyek_konstruksi;
CREATE POLICY "proyek_select" ON proyek_konstruksi FOR SELECT TO authenticated
  USING (fn_is_admin() OR fn_skpd_visible(skpd_id));
DROP POLICY IF EXISTS "proyek_insert" ON proyek_konstruksi;
CREATE POLICY "proyek_insert" ON proyek_konstruksi FOR INSERT TO authenticated
  WITH CHECK (fn_is_admin() OR fn_skpd_visible(skpd_id));
DROP POLICY IF EXISTS "proyek_update" ON proyek_konstruksi;
CREATE POLICY "proyek_update" ON proyek_konstruksi FOR UPDATE TO authenticated
  USING (fn_is_admin() OR fn_skpd_visible(skpd_id));
DROP POLICY IF EXISTS "proyek_delete" ON proyek_konstruksi;
CREATE POLICY "proyek_delete" ON proyek_konstruksi FOR DELETE TO authenticated
  USING (fn_is_admin() OR fn_skpd_visible(skpd_id));

-- Termin: visibilitas & tulis mengikuti proyek induknya.
ALTER TABLE proyek_termin ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "termin_select" ON proyek_termin;
CREATE POLICY "termin_select" ON proyek_termin FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM proyek_konstruksi p WHERE p.id = proyek_termin.proyek_id
                 AND (fn_is_admin() OR fn_skpd_visible(p.skpd_id))));
DROP POLICY IF EXISTS "termin_insert" ON proyek_termin;
CREATE POLICY "termin_insert" ON proyek_termin FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM proyek_konstruksi p WHERE p.id = proyek_termin.proyek_id
                 AND (fn_is_admin() OR fn_skpd_visible(p.skpd_id))));
DROP POLICY IF EXISTS "termin_update" ON proyek_termin;
CREATE POLICY "termin_update" ON proyek_termin FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM proyek_konstruksi p WHERE p.id = proyek_termin.proyek_id
                 AND (fn_is_admin() OR fn_skpd_visible(p.skpd_id))));
DROP POLICY IF EXISTS "termin_delete" ON proyek_termin;
CREATE POLICY "termin_delete" ON proyek_termin FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM proyek_konstruksi p WHERE p.id = proyek_termin.proyek_id
                 AND (fn_is_admin() OR fn_skpd_visible(p.skpd_id))));
