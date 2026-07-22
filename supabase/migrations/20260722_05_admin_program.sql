-- ============================================================================
-- Master Nomenklatur Program–Kegiatan–Sub Kegiatan (admin_program) — referensi.
-- Sumber: "program.xlsx" (Kepmendagri 050-5889/2021 dst) — Urusan → Bidang
-- Urusan → Program → Kegiatan → Sub Kegiatan, level daun = Sub Kegiatan.
--
-- SIFAT: tabel REFERENSI/lookup (seperti admin_rekening, admin_kodefikasi_bmd).
--   Bukan ledger, tidak menyentuh transaksi_bmd/aset, bukan subjek Tahun Buku.
--   Dipakai untuk memilih Program/Kegiatan/Sub Kegiatan saat entry Pengadaan
--   (kartu Kontrak).
--
-- Flat/denormalisasi 1:1 dgn file (tiap baris bawa semua kode+uraian induknya)
-- — 1527 baris daun. PK = kode_sub_kegiatan (unik, dicek 1527/1527).
--
-- ALUR IMPORT (di Supabase):
--   1. Jalankan migrasi ini (buat tabel + RLS).
--   2. Table Editor → admin_program → Import data from CSV → program.csv
--      (header CSV sama persis dgn nama kolom di bawah; default aktif/timestamp
--       TIDAK ada di CSV → terisi otomatis).
--
-- Jalankan di Supabase SQL Editor SETELAH 20260722_04_admin_rekening.sql.
-- ============================================================================

CREATE TABLE IF NOT EXISTS admin_program (
  -- Level 1 — Urusan (mis. '1' Urusan Wajib Pelayanan Dasar).
  kode_urusan          text NOT NULL,
  uraian_urusan        text NOT NULL,
  -- Level 2 — Bidang Urusan (mis. '1.01' Pendidikan).
  kode_bidang          text NOT NULL,
  uraian_bidang        text NOT NULL,
  -- Level 3 — Program (mis. '1.01.01').
  kode_program         text NOT NULL,
  uraian_program       text NOT NULL,
  -- Level 4 — Kegiatan (mis. '1.01.01.2.01').
  kode_kegiatan        text NOT NULL,
  uraian_kegiatan      text NOT NULL,
  -- Level 5 — Sub Kegiatan (DAUN, mis. '1.01.01.2.01.0001').
  kode_sub_kegiatan    text PRIMARY KEY,
  uraian_sub_kegiatan  text NOT NULL,

  aktif      boolean     NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Cascading picker: daftar Kegiatan per Program, Sub Kegiatan per Kegiatan.
CREATE INDEX IF NOT EXISTS idx_admin_program_program  ON admin_program(kode_program);
CREATE INDEX IF NOT EXISTS idx_admin_program_kegiatan ON admin_program(kode_kegiatan);

-- updated_at (reuse fn_set_updated_at yg sudah ada).
DROP TRIGGER IF EXISTS trg_admin_program_updated ON admin_program;
CREATE TRIGGER trg_admin_program_updated BEFORE UPDATE ON admin_program
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- ── RLS: semua authenticated BACA; hanya admin yang tulis (pola tabel referensi) ─
-- fn_is_admin() dibungkus InitPlan (SELECT ...) → dievaluasi sekali, bukan
-- per-baris (aturan performa CLAUDE.md).
ALTER TABLE admin_program ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_program_select" ON admin_program;
CREATE POLICY "admin_program_select" ON admin_program FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "admin_program_insert" ON admin_program;
CREATE POLICY "admin_program_insert" ON admin_program FOR INSERT TO authenticated
  WITH CHECK ((SELECT fn_is_admin()));

DROP POLICY IF EXISTS "admin_program_update" ON admin_program;
CREATE POLICY "admin_program_update" ON admin_program FOR UPDATE TO authenticated
  USING ((SELECT fn_is_admin()));

DROP POLICY IF EXISTS "admin_program_delete" ON admin_program;
CREATE POLICY "admin_program_delete" ON admin_program FOR DELETE TO authenticated
  USING ((SELECT fn_is_admin()));
