-- ============================================================================
-- Modul INVENTARISASI BMD (Permendagri 47/2021) — Fase 1.
--
-- SIFAT: NON-LEDGER. Modul ini TIDAK pernah menulis `transaksi_bmd` maupun
--   mengubah `aset` (termasuk `aset.kondisi_barang`). Hasil inventarisasi
--   hanya menghasilkan TEMUAN + REKOMENDASI; eksekusi tindak lanjutnya
--   (kapitalisasi/koreksi/penghapusan/dst) tetap lewat menu masing-masing yang
--   sudah punya guard rantai pembatalan & pola ber-SK. Keputusan user
--   2026-07-25 — sengaja begini supaya guard yang sudah stabil tidak
--   diduplikasi di jalur baru.
--
-- MODEL DATA: LKI = SUMBER, LHI = TURUNAN.
--   Lembar Kerja Inventarisasi (LKI, Format III.A.1–III.A.7) adalah form
--   PER-BARANG berisi checklist bagian A–R. Laporan Hasil Inventarisasi
--   (LHI, Format III.B.1–III.B.11) TIDAK diinput terpisah — seluruhnya
--   diturunkan dari jawaban LKI (lihat klasifikasiLhi di lib/inventarisasi.ts).
--   Satu baris LKI boleh muncul di BEBERAPA LHI sekaligus.
--
-- LINGKUP: per SKPD × tahun × golongan (kodeLevel3). Pemda menginventarisasi
--   satu jenis aset per tahun (2025 Tanah, 2026 Gedung & Bangunan, dst).
--
-- Jalankan di Supabase SQL Editor SETELAH 20260725_07.
-- ============================================================================

-- ── Header ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS inventarisasi (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  skpd_id        bigint NOT NULL REFERENCES admin_skpd(id),
  tahun          int    NOT NULL,
  golongan       text   NOT NULL,              -- kodeLevel3, mis. '1.3.3'
  status         text   NOT NULL DEFAULT 'draft'
                 CHECK (status IN ('draft','diajukan','divalidasi','dikembalikan')),
  catatan_validator text,                      -- alasan saat dikembalikan
  -- Tim pelaksana (blok tanda tangan LKI). SATU tim per inventarisasi (bukan
  -- per barang) — dipilih dari admin_pegawai: [{pegawai_id, nama, nip, jabatan}]
  petugas        jsonb  NOT NULL DEFAULT '[]'::jsonb,
  keterangan     text,
  diajukan_at    timestamptz,
  divalidasi_at  timestamptz,
  divalidasi_by  uuid,
  created_by     uuid DEFAULT auth.uid(),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (skpd_id, tahun, golongan)             -- 1 inventarisasi per kombinasi
);
CREATE INDEX IF NOT EXISTS idx_inventarisasi_skpd   ON inventarisasi(skpd_id);
CREATE INDEX IF NOT EXISTS idx_inventarisasi_status ON inventarisasi(status);

DROP TRIGGER IF EXISTS trg_inventarisasi_updated ON inventarisasi;
CREATE TRIGGER trg_inventarisasi_updated BEFORE UPDATE ON inventarisasi
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- ── Baris = satu lembar LKI (satu barang) ───────────────────────────────────
-- `snapshot` DIBEKUKAN saat baris digenerate: jadi nilai "SEBELUM Inventarisasi"
--   di Format III.B.7 (kondisi fisik) & III.B.8 (perubahan data) tetap stabil
--   walau `aset` berubah setelahnya.
-- `jawaban` menampung SELURUH isian LKI bagian A–R sbg jsonb — sengaja bukan
--   ~40 kolom, karena isian berbeda per golongan (P&M punya No.Polisi/Rangka/
--   Mesin; GB punya bagian N "di atas tanah milik"; Tanah tanpa Merek/Tipe).
--   Volume kecil (puluhan–ratusan baris per SKPD) & klasifikasi LHI dihitung
--   saat render, jadi tak perlu kolom indeks. Idiom sama dgn jurnal_header.payload.
CREATE TABLE IF NOT EXISTS inventarisasi_baris (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inventarisasi_id uuid NOT NULL REFERENCES inventarisasi(id) ON DELETE CASCADE,
  -- NULL = "BMD Belum Tercatat" (Format III.A.7) — barangnya memang belum ada
  -- di `aset`, jadi tak bisa digenerate & tak punya NIBAR.
  aset_id          uuid REFERENCES aset(id),
  snapshot         jsonb NOT NULL DEFAULT '{}'::jsonb,
  jawaban          jsonb NOT NULL DEFAULT '{}'::jsonb,
  foto_paths       text[] NOT NULL DEFAULT '{}',
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (inventarisasi_id, aset_id)            -- 1 lembar per barang (NULL bebas)
);
CREATE INDEX IF NOT EXISTS idx_inventarisasi_baris_hdr  ON inventarisasi_baris(inventarisasi_id);
CREATE INDEX IF NOT EXISTS idx_inventarisasi_baris_aset ON inventarisasi_baris(aset_id);

DROP TRIGGER IF EXISTS trg_inventarisasi_baris_updated ON inventarisasi_baris;
CREATE TRIGGER trg_inventarisasi_baris_updated BEFORE UPDATE ON inventarisasi_baris
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- Pola admin_usulan_pengurus (20260723_01): SKPD kelola subtree-nya sendiri;
-- admin/pengawas lihat semua. fn_is_admin()/fn_is_viewer() KONSTAN → dibungkus
-- InitPlan `(SELECT ...)` supaya dievaluasi SEKALI, bukan per baris (aturan
-- performa CLAUDE.md). fn_skpd_visible per-baris (subtree).
-- Menulis hanya selama status <> 'divalidasi'; transisi ke 'divalidasi'
-- ditangani RPC SECURITY DEFINER di bawah.
ALTER TABLE inventarisasi ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "inventarisasi_select" ON inventarisasi;
CREATE POLICY "inventarisasi_select" ON inventarisasi FOR SELECT TO authenticated
  USING ((SELECT fn_is_admin()) OR (SELECT fn_is_viewer()) OR fn_skpd_visible(skpd_id));

DROP POLICY IF EXISTS "inventarisasi_insert" ON inventarisasi;
CREATE POLICY "inventarisasi_insert" ON inventarisasi FOR INSERT TO authenticated
  WITH CHECK ((SELECT fn_is_admin()) OR fn_skpd_visible(skpd_id));

DROP POLICY IF EXISTS "inventarisasi_update" ON inventarisasi;
CREATE POLICY "inventarisasi_update" ON inventarisasi FOR UPDATE TO authenticated
  USING ((SELECT fn_is_admin()) OR (fn_skpd_visible(skpd_id) AND status <> 'divalidasi'))
  WITH CHECK ((SELECT fn_is_admin()) OR (fn_skpd_visible(skpd_id) AND status <> 'divalidasi'));

DROP POLICY IF EXISTS "inventarisasi_delete" ON inventarisasi;
CREATE POLICY "inventarisasi_delete" ON inventarisasi FOR DELETE TO authenticated
  USING ((SELECT fn_is_admin()) OR (fn_skpd_visible(skpd_id) AND status IN ('draft','dikembalikan')));

-- Baris mengikuti izin headernya.
ALTER TABLE inventarisasi_baris ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "inventarisasi_baris_select" ON inventarisasi_baris;
CREATE POLICY "inventarisasi_baris_select" ON inventarisasi_baris FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM inventarisasi h WHERE h.id = inventarisasi_id
      AND ((SELECT fn_is_admin()) OR (SELECT fn_is_viewer()) OR fn_skpd_visible(h.skpd_id))
  ));

DROP POLICY IF EXISTS "inventarisasi_baris_insert" ON inventarisasi_baris;
CREATE POLICY "inventarisasi_baris_insert" ON inventarisasi_baris FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM inventarisasi h WHERE h.id = inventarisasi_id
      AND ((SELECT fn_is_admin()) OR (fn_skpd_visible(h.skpd_id) AND h.status <> 'divalidasi'))
  ));

DROP POLICY IF EXISTS "inventarisasi_baris_update" ON inventarisasi_baris;
CREATE POLICY "inventarisasi_baris_update" ON inventarisasi_baris FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM inventarisasi h WHERE h.id = inventarisasi_id
      AND ((SELECT fn_is_admin()) OR (fn_skpd_visible(h.skpd_id) AND h.status <> 'divalidasi'))
  ));

DROP POLICY IF EXISTS "inventarisasi_baris_delete" ON inventarisasi_baris;
CREATE POLICY "inventarisasi_baris_delete" ON inventarisasi_baris FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM inventarisasi h WHERE h.id = inventarisasi_id
      AND ((SELECT fn_is_admin()) OR (fn_skpd_visible(h.skpd_id) AND h.status <> 'divalidasi'))
  ));

-- ── RPC: Validasi (admin/pengelola) ─────────────────────────────────────────
-- 'diajukan' → 'divalidasi'. Setelah ini SKPD tak bisa mengubah apa pun
-- (ditegakkan policy update di atas).
CREATE OR REPLACE FUNCTION fn_validasi_inventarisasi(p_id uuid, p_catatan text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_h inventarisasi%ROWTYPE;
BEGIN
  IF NOT fn_is_admin() THEN
    RAISE EXCEPTION 'Hanya admin/pengelola yang boleh memvalidasi inventarisasi.';
  END IF;

  SELECT * INTO v_h FROM inventarisasi WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Inventarisasi tidak ditemukan.'; END IF;
  IF v_h.status <> 'diajukan' THEN
    RAISE EXCEPTION 'Hanya inventarisasi berstatus "diajukan" yang bisa divalidasi (status sekarang: %).', v_h.status;
  END IF;

  UPDATE inventarisasi
  SET status = 'divalidasi', divalidasi_at = now(), divalidasi_by = auth.uid(),
      catatan_validator = p_catatan
  WHERE id = p_id;
END $$;

REVOKE ALL ON FUNCTION fn_validasi_inventarisasi(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION fn_validasi_inventarisasi(uuid, text) TO authenticated;

-- ── RPC: Kembalikan ke pengurus barang ──────────────────────────────────────
-- 'diajukan' ATAU 'divalidasi' → 'dikembalikan' (+ alasan wajib). Dari
-- 'divalidasi' berarti membuka kembali lembar yang sudah divalidasi — sengaja
-- diizinkan supaya salah validasi bisa diperbaiki tanpa hapus data.
CREATE OR REPLACE FUNCTION fn_kembalikan_inventarisasi(p_id uuid, p_catatan text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_h inventarisasi%ROWTYPE;
BEGIN
  IF NOT fn_is_admin() THEN
    RAISE EXCEPTION 'Hanya admin/pengelola yang boleh mengembalikan inventarisasi.';
  END IF;
  IF p_catatan IS NULL OR btrim(p_catatan) = '' THEN
    RAISE EXCEPTION 'Alasan pengembalian wajib diisi.';
  END IF;

  SELECT * INTO v_h FROM inventarisasi WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Inventarisasi tidak ditemukan.'; END IF;
  IF v_h.status NOT IN ('diajukan','divalidasi') THEN
    RAISE EXCEPTION 'Hanya inventarisasi "diajukan"/"divalidasi" yang bisa dikembalikan (status sekarang: %).', v_h.status;
  END IF;

  UPDATE inventarisasi
  SET status = 'dikembalikan', catatan_validator = p_catatan,
      divalidasi_at = NULL, divalidasi_by = NULL
  WHERE id = p_id;
END $$;

REVOKE ALL ON FUNCTION fn_kembalikan_inventarisasi(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION fn_kembalikan_inventarisasi(uuid, text) TO authenticated;

-- Verifikasi:
--   SELECT to_regclass('public.inventarisasi'), to_regclass('public.inventarisasi_baris');
--   -- keduanya TIDAK boleh NULL
