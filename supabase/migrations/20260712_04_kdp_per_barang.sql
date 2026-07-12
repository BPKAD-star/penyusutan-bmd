-- ============================================================================
-- KDP — Fase 4: MODEL PER-BARANG (redesign, keputusan user 2026-07-12).
--
-- Perubahan model: KDP dicatat PER BARANG (per rincian objek), bukan satu
-- gumpalan per paket. Sesuai praktik e-BMD/SIMDA & agar tiap KDP barang tampil
-- di Daftar Barang dgn kode + spesifikasinya sendiri.
--   Paket (proyek_konstruksi) = sampul (kontrak/program/penyedia).
--   KDP Barang               = baris `aset` (1.3.6), ditautkan ke paket lewat
--                              tabel `proyek_barang` (+ komponen).
--   Termin/BAST              = pembayaran terhadap SATU KDP barang; termin ke
--                              barang yang sama meng-akumulasi nilainya.
--   Reklas "siap digunakan"  = gabung beberapa KDP barang → aset tetap (spec
--                              baru); biaya bersama boleh dibagi proporsional
--                              ke >1 aset tetap (lewat event kdp_selesai_*).
--
-- Kolom lama `proyek_konstruksi.kode_kdp` & `aset_kdp_id` (model gumpalan)
-- DIBIARKAN (tidak dipakai lagi) — tak di-drop supaya migrasi ini murni aditif
-- & aman; paket lama model gumpalan sebaiknya dihapus dari UI sebelum pakai.
--
-- Jalankan SETELAH 20260712_03_proyek_kdp_fields.sql.
-- ============================================================================

-- ── 1. Tautan paket ↔ KDP barang (aset 1.3.6) ───────────────────────────────
CREATE TABLE IF NOT EXISTS proyek_barang (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proyek_id   uuid NOT NULL REFERENCES proyek_konstruksi(id) ON DELETE CASCADE,
  aset_id     uuid NOT NULL REFERENCES aset(id),
  komponen    text NOT NULL CHECK (komponen IN ('perencanaan','fisik','biaya_umum','pengawasan')),
  status      text NOT NULL DEFAULT 'kdp' CHECK (status IN ('kdp','selesai')),  -- selesai = habis direklas
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (proyek_id, aset_id)
);
CREATE INDEX IF NOT EXISTS idx_proyek_barang_proyek ON proyek_barang(proyek_id);
CREATE INDEX IF NOT EXISTS idx_proyek_barang_aset   ON proyek_barang(aset_id);

DROP TRIGGER IF EXISTS trg_proyek_barang_updated ON proyek_barang;
CREATE TRIGGER trg_proyek_barang_updated BEFORE UPDATE ON proyek_barang
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- ── 2. Termin: tautkan ke barang + kode rekening (free-form utk sekarang) ────
ALTER TABLE proyek_termin
  ADD COLUMN IF NOT EXISTS barang_id     uuid REFERENCES proyek_barang(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS kode_rekening text;
CREATE INDEX IF NOT EXISTS idx_termin_barang ON proyek_termin(barang_id);

-- ── 3. RLS proyek_barang (mengikuti paket induknya, pola proyek_termin) ─────
ALTER TABLE proyek_barang ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pb_select" ON proyek_barang;
CREATE POLICY "pb_select" ON proyek_barang FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM proyek_konstruksi p WHERE p.id = proyek_barang.proyek_id
                 AND (fn_is_admin() OR fn_skpd_visible(p.skpd_id))));
DROP POLICY IF EXISTS "pb_insert" ON proyek_barang;
CREATE POLICY "pb_insert" ON proyek_barang FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM proyek_konstruksi p WHERE p.id = proyek_barang.proyek_id
                 AND (fn_is_admin() OR fn_skpd_visible(p.skpd_id))));
DROP POLICY IF EXISTS "pb_update" ON proyek_barang;
CREATE POLICY "pb_update" ON proyek_barang FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM proyek_konstruksi p WHERE p.id = proyek_barang.proyek_id
                 AND (fn_is_admin() OR fn_skpd_visible(p.skpd_id))));
DROP POLICY IF EXISTS "pb_delete" ON proyek_barang;
CREATE POLICY "pb_delete" ON proyek_barang FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM proyek_konstruksi p WHERE p.id = proyek_barang.proyek_id
                 AND (fn_is_admin() OR fn_skpd_visible(p.skpd_id))));
