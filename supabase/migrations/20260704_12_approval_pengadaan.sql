-- ============================================================================
-- Pola APPROVAL untuk menu Cara Perolehan (Pengadaan sekarang; Hibah/Hasil
-- Inventarisasi/Perolehan Lainnya menyusul dgn pola sama). Lihat CLAUDE.md.
--
-- Prinsip: barang yang diinput operator TIDAK langsung masuk aset/ledger.
-- Ditampung sbg draft di jurnal_header.payload.draft_items (JSON, bebas
-- diedit/dihapus — bukan ledger, jadi TIDAK melanggar append-only). Baru saat
-- admin approve, sistem generate aset + transaksi_bmd sekaligus (materialize),
-- pakai tgl BAST sbg tgl perolehan efektif. Ini menghindari perlu nge-filter
-- "belum approve" di semua halaman pembaca (Daftar Barang/Penyusutan/Laporan/
-- Engine) — mereka tetap baca aset/transaksi_bmd apa adanya seperti biasa,
-- karena yang belum di-approve memang belum pernah masuk situ.
--
-- Jalankan SETELAH 20260704_11_jurnal_pengadaan.sql.
-- ============================================================================

-- ── 1. Kolom approval di jurnal_header ──────────────────────────────────────
-- Default 'disetujui' supaya SEMUA baris lama (penghapusan/kapitalisasi/
-- pengadaan yg sudah sempat dibuat langsung) tetap tampil seperti biasa —
-- draft/pending hanya berlaku utk baris BARU yg dibuat lewat alur draft ini.
ALTER TABLE jurnal_header ADD COLUMN IF NOT EXISTS approval_status text
  NOT NULL DEFAULT 'disetujui'
  CHECK (approval_status IN ('pending','disetujui','ditolak'));
ALTER TABLE jurnal_header ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES auth.users(id);
ALTER TABLE jurnal_header ADD COLUMN IF NOT EXISTS approved_at timestamptz;
ALTER TABLE jurnal_header ADD COLUMN IF NOT EXISTS rejected_reason text;

CREATE INDEX IF NOT EXISTS idx_jh_approval ON jurnal_header(approval_status);

-- ── 2. Jenis ledger baru: batal_pengadaan (koreksi pasca-approve) ──────────
-- Dipakai kalau kesalahan (mis. kuantitas kelebihan) baru ketahuan SETELAH
-- kontrak di-approve & barang sudah masuk ledger. Beda dari penghapusan_*
-- (itu utk disposal sungguhan: hibah/jual/rusak) — ini murni koreksi input,
-- dicatat mundur ke tanggal pengadaan aslinya (retroaktif), bukan hari ini,
-- supaya barang dianggap "tidak pernah ada" sejak awal (bukan cuma berhenti
-- dari sekarang).
ALTER TYPE jenis_transaksi_bmd ADD VALUE IF NOT EXISTS 'batal_pengadaan';

-- ── 3. RLS: approve hanya admin ─────────────────────────────────────────────
-- Kebijakan UPDATE jurnal_header sudah ada (fn_is_admin() OR fn_skpd_visible),
-- jadi operator SKPD tetap bisa edit draft-nya sendiri (payload/draft_items).
-- Batasan "hanya admin yang boleh approve" ditegakkan di APLIKASI (tombol
-- Setujui/Tolak hanya dirender utk admin) + guard tambahan di bawah supaya
-- operator non-admin TIDAK bisa mengubah approval_status/approved_by sendiri.
CREATE OR REPLACE FUNCTION fn_jurnal_header_approval_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.approval_status IS DISTINCT FROM OLD.approval_status AND NOT fn_is_admin() THEN
    RAISE EXCEPTION 'Hanya admin yang boleh mengubah status persetujuan.';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_jurnal_header_approval_guard ON jurnal_header;
CREATE TRIGGER trg_jurnal_header_approval_guard
  BEFORE UPDATE ON jurnal_header
  FOR EACH ROW EXECUTE FUNCTION fn_jurnal_header_approval_guard();
