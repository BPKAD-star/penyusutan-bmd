-- ============================================================================
-- Master Bagan Akun Belanja Daerah (admin_rekening) — data referensi.
-- Sumber: "Rekening Belanja.xlsx" (Kepmendagri 050-5889/2021 dst) — bagan akun
-- BELANJA (akun 5) berjenjang, level daun = Sub Rincian Objek.
--
-- SIFAT: murni tabel REFERENSI/lookup (seperti admin_kodefikasi_bmd, satuan_bmd).
--   Bukan ledger, tidak menyentuh transaksi_bmd/aset, bukan subjek Tahun Buku.
--   Dipakai untuk memvalidasi/memilih kode rekening (mis. kode_rekening di
--   lra_realisasi '5.2.02.05.001.00005' = kode_sub_rincian di tabel ini).
--
-- Tiap baris Excel sudah DENORMALISASI (membawa semua kode+uraian induknya),
-- jadi tabel ini juga flat/denormalisasi 1:1 dengan file — 406 baris daun.
-- PK = kode_sub_rincian (unik, sudah dicek 406/406 unik di sumber).
--
-- ALUR IMPORT (di Supabase):
--   1. Jalankan migrasi ini (buat tabel + RLS).
--   2. Table Editor → admin_rekening → Import data from CSV → rekening_belanja.csv
--      (header CSV sudah sama persis dengan nama kolom di bawah; kolom generated
--       `kelompok` & default `aktif`/timestamp TIDAK ada di CSV — biar terisi
--       otomatis).
--
-- Jalankan di Supabase SQL Editor SETELAH 20260722_03_lra_realisasi.sql.
-- ============================================================================

CREATE TABLE IF NOT EXISTS admin_rekening (
  -- Level 1 — Akun (Excel: "Kode/Uraian rekening"), selalu '5' BELANJA DAERAH.
  kode_rekening        text NOT NULL,
  uraian_rekening      text NOT NULL,
  -- Level 2 — Kelompok (Excel: "Kode/Uraian Klasifikasi"): 5.1 Operasi, 5.2
  -- Modal, 5.3 Tak Terduga, 5.4 Transfer.
  kode_klasifikasi     text NOT NULL,
  uraian_klasifikasi   text NOT NULL,
  -- Level 3 — Jenis.
  kode_jenis           text NOT NULL,
  uraian_jenis         text NOT NULL,
  -- Level 4 — Objek.
  kode_objek           text NOT NULL,
  uraian_objek         text NOT NULL,
  -- Level 5 — Rincian Objek.
  kode_rincian_objek   text NOT NULL,
  uraian_rincian_objek text NOT NULL,
  -- Level 6 — Sub Rincian Objek (DAUN, kode penuh mis. 5.1.01.01.001.00001).
  kode_sub_rincian     text PRIMARY KEY,
  uraian_sub_rincian   text NOT NULL,

  -- Turunan kenyamanan (immutable → aman sbg generated), selaras lra_realisasi.
  kelompok text GENERATED ALWAYS AS (
             CASE WHEN kode_sub_rincian LIKE '5.1.%' THEN 'operasi'
                  WHEN kode_sub_rincian LIKE '5.2.%' THEN 'modal'
                  WHEN kode_sub_rincian LIKE '5.3.%' THEN 'tak_terduga'
                  WHEN kode_sub_rincian LIKE '5.4.%' THEN 'transfer'
                  ELSE 'lain' END) STORED,

  aktif      boolean     NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Pencarian by prefix golongan (mis. hanya belanja modal '5.2.%') & join LRA.
CREATE INDEX IF NOT EXISTS idx_admin_rekening_kelompok ON admin_rekening(kelompok);
CREATE INDEX IF NOT EXISTS idx_admin_rekening_klasifikasi ON admin_rekening(kode_klasifikasi);
-- LIKE 'x.%' by prefix kode → text_pattern_ops (pola idx_aset_kode_pattern).
CREATE INDEX IF NOT EXISTS idx_admin_rekening_kode_pattern
  ON admin_rekening(kode_sub_rincian text_pattern_ops);

-- updated_at (reuse fn_set_updated_at yg sudah ada).
DROP TRIGGER IF EXISTS trg_admin_rekening_updated ON admin_rekening;
CREATE TRIGGER trg_admin_rekening_updated BEFORE UPDATE ON admin_rekening
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- ── RLS: semua authenticated BACA; hanya admin yang tulis (pola tabel referensi) ─
-- fn_is_admin() konstan per-query → bungkus InitPlan (SELECT ...) supaya
-- dievaluasi sekali, bukan per-baris (aturan performa CLAUDE.md).
ALTER TABLE admin_rekening ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_rekening_select" ON admin_rekening;
CREATE POLICY "admin_rekening_select" ON admin_rekening FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "admin_rekening_insert" ON admin_rekening;
CREATE POLICY "admin_rekening_insert" ON admin_rekening FOR INSERT TO authenticated
  WITH CHECK ((SELECT fn_is_admin()));

DROP POLICY IF EXISTS "admin_rekening_update" ON admin_rekening;
CREATE POLICY "admin_rekening_update" ON admin_rekening FOR UPDATE TO authenticated
  USING ((SELECT fn_is_admin()));

DROP POLICY IF EXISTS "admin_rekening_delete" ON admin_rekening;
CREATE POLICY "admin_rekening_delete" ON admin_rekening FOR DELETE TO authenticated
  USING ((SELECT fn_is_admin()));
