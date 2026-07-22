-- ============================================================================
-- LRA — Realisasi Belanja (bahan Rekonsiliasi Belanja Modal). Fase A.
-- Lihat docs/lra-plan.md.
--
-- PRINSIP KUNCI (kenapa AMAN & terpisah dari ledger):
--   Ini data referensi hasil IMPORT dari akuntansi (LRA), BUKAN ledger BMD.
--   SENGAJA di luar transaksi_bmd/aset — tidak pernah masuk ledger, tidak
--   menyentuh saldo/penyusutan. Bukan subjek trigger Tahun Buku (data historis
--   realisasi, bukan transaksi ber-tanggal-ledger). Baris BEBAS di-UPSERT/DELETE
--   (beda total dgn transaksi_bmd yg append-only) — memang gitu, ini bahan cek.
--
--   Kolom TANDA (klasifikasi/jenis_tujuan) dipakai Fase B (Kapitalisasi/Reklas)
--   — sudah disiapkan di sini supaya re-import (upsert) tidak menimpanya
--   (payload upsert TIDAK menyertakan kolom tanda → ON CONFLICT DO UPDATE hanya
--   menyentuh kolom yang dikirim, tanda tetap).
--
-- Anti-dobel: natural key (skpd_id, no_bukti, kode_rekening) → upsert.
-- Jalankan di Supabase SQL Editor SETELAH 20260722_02_pengamanan_kolom.sql.
-- ============================================================================

CREATE TABLE IF NOT EXISTS lra_realisasi (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  skpd_id        bigint NOT NULL REFERENCES admin_skpd(id),
  tanggal        date   NOT NULL,
  -- turunan tanggal (dipakai rekap per bulan) — immutable, aman sbg generated.
  tahun          int  GENERATED ALWAYS AS (EXTRACT(YEAR  FROM tanggal)::int) STORED,
  bulan          int  GENERATED ALWAYS AS (EXTRACT(MONTH FROM tanggal)::int) STORED,
  no_bukti       text NOT NULL,
  kode_rekening  text NOT NULL,                     -- 5.2.02.05.001.00005
  -- 3 segmen pertama (5.2.02) → jenis aset; kelompok modal(5.2)/barjas(5.1).
  kode_grup3     text GENERATED ALWAYS AS (substring(kode_rekening from '^[0-9]+\.[0-9]+\.[0-9]+')) STORED,
  kelompok       text GENERATED ALWAYS AS (
                   CASE WHEN kode_rekening LIKE '5.2.%' THEN 'modal'
                        WHEN kode_rekening LIKE '5.1.%' THEN 'barjas'
                        ELSE 'lain' END) STORED,
  uraian         text,
  keterangan     text,
  debit          numeric(18,2) NOT NULL DEFAULT 0 CHECK (debit >= 0),
  -- TANDA rekonsiliasi (Fase B) — NULL default, tidak diisi saat import.
  klasifikasi    text CHECK (klasifikasi IN ('kapitalisasi','reklas_keluar')),
  jenis_tujuan   text,                              -- 5.2.0x (utk kapitalisasi)
  created_by     uuid DEFAULT auth.uid(),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (skpd_id, no_bukti, kode_rekening)         -- natural key anti-dobel
);
CREATE INDEX IF NOT EXISTS idx_lra_skpd_tahun ON lra_realisasi(skpd_id, tahun);
CREATE INDEX IF NOT EXISTS idx_lra_tahun      ON lra_realisasi(tahun);
CREATE INDEX IF NOT EXISTS idx_lra_kelompok   ON lra_realisasi(kelompok, tahun);

-- updated_at (reuse fn_set_updated_at yg sudah ada).
DROP TRIGGER IF EXISTS trg_lra_updated ON lra_realisasi;
CREATE TRIGGER trg_lra_updated BEFORE UPDATE ON lra_realisasi
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- ── RLS: per-SKPD (subtree), admin & pengawas(viewer) baca semua ────────────
-- fn_is_admin()/fn_is_viewer() konstan per-query → bungkus InitPlan (SELECT ...)
-- supaya dievaluasi sekali. fn_skpd_visible(skpd_id) per-baris (subtree operator);
-- utk pengawas ia mengembalikan false, makanya baca pengawas lewat fn_is_viewer.
ALTER TABLE lra_realisasi ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "lra_select" ON lra_realisasi;
CREATE POLICY "lra_select" ON lra_realisasi FOR SELECT TO authenticated
  USING ((SELECT fn_is_admin()) OR (SELECT fn_is_viewer()) OR fn_skpd_visible(skpd_id));

DROP POLICY IF EXISTS "lra_insert" ON lra_realisasi;
CREATE POLICY "lra_insert" ON lra_realisasi FOR INSERT TO authenticated
  WITH CHECK ((SELECT fn_is_admin()) OR fn_skpd_visible(skpd_id));

DROP POLICY IF EXISTS "lra_update" ON lra_realisasi;
CREATE POLICY "lra_update" ON lra_realisasi FOR UPDATE TO authenticated
  USING ((SELECT fn_is_admin()) OR fn_skpd_visible(skpd_id))
  WITH CHECK ((SELECT fn_is_admin()) OR fn_skpd_visible(skpd_id));

DROP POLICY IF EXISTS "lra_delete" ON lra_realisasi;
CREATE POLICY "lra_delete" ON lra_realisasi FOR DELETE TO authenticated
  USING ((SELECT fn_is_admin()) OR fn_skpd_visible(skpd_id));
