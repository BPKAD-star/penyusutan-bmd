-- ============================================================================
-- BMD — Header jurnal untuk menu ber-SK (Penghapusan, Kapitalisasi, dst.)
-- Jalankan SETELAH 20260702_06_batal_kapitalisasi.sql.
--
-- Kenapa tabel terpisah?
--   transaksi_bmd = ledger APPEND-ONLY (UPDATE/DELETE diblokir trigger). No SK &
--   tanggal jurnal butuh bisa DIEDIT → tidak boleh disimpan di ledger. Header ini
--   jadi "sampul" jurnal yang editable, sementara baris ledger tetap beku.
--
-- Aturan disiplin (keputusan operator):
--   - Edit No SK / tanggal DIPERBOLEHKAN selama tetap di SEMESTER yang sama.
--   - Pindah semester TIDAK diizinkan lewat edit → operator wajib batal & entry
--     ulang. Ini melindungi periode yang mungkin sudah dilaporkan.
--   - Trigger di bawah menegakkan aturan ini di level DB (bukan cuma di UI).
-- ============================================================================

-- ── 0. Helper: periode (YYYY-S1/S2) dari tanggal ────────────────────────────
-- S1 = Jan–Jun, S2 = Jul–Des. Cocok dgn lib/bmd.ts periodeDariTanggal().
CREATE OR REPLACE FUNCTION fn_periode_dari_tanggal(d date) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT EXTRACT(YEAR FROM d)::int::text
      || '-S'
      || CASE WHEN EXTRACT(MONTH FROM d) <= 6 THEN '1' ELSE '2' END
$$;

-- ── 1. Tabel header jurnal ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS jurnal_header (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  skpd_id     bigint NOT NULL REFERENCES skpd(id),
  kategori    text NOT NULL CHECK (kategori IN ('penghapusan','kapitalisasi')),
  jenis       text,                 -- sub-jenis header (mis. penghapusan_pemindahtanganan)
  sub_jenis   text,                 -- mis. hibah|penjualan|tukar_menukar|penyertaan_modal
  no_sk       text NOT NULL,        -- No. SK / No. Dokumen
  tanggal     date NOT NULL,
  periode     text NOT NULL,        -- BEKU per semester; diisi otomatis dari tanggal
  keterangan  text,
  created_by  uuid REFERENCES auth.users(id) DEFAULT auth.uid(),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_jh_skpd     ON jurnal_header(skpd_id);
CREATE INDEX IF NOT EXISTS idx_jh_kategori ON jurnal_header(kategori);

-- Baris ledger menunjuk ke header-nya (nullable: transaksi non-jurnal tetap boleh).
ALTER TABLE transaksi_bmd ADD COLUMN IF NOT EXISTS header_id uuid REFERENCES jurnal_header(id);
CREATE INDEX IF NOT EXISTS idx_trx_header ON transaksi_bmd(header_id);

-- ── 2. Guard: periode beku + kunci semester saat edit ───────────────────────
CREATE OR REPLACE FUNCTION fn_jurnal_header_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.periode := fn_periode_dari_tanggal(NEW.tanggal);
    RETURN NEW;
  END IF;

  -- UPDATE: skpd & kategori tak boleh berubah (itu = jurnal lain, harus entry ulang).
  IF NEW.skpd_id IS DISTINCT FROM OLD.skpd_id
     OR NEW.kategori IS DISTINCT FROM OLD.kategori THEN
    RAISE EXCEPTION 'jurnal_header: skpd_id/kategori tidak boleh diubah — batalkan & buat jurnal baru.';
  END IF;

  -- Tanggal baru wajib jatuh di semester yang sama dgn periode beku header.
  IF fn_periode_dari_tanggal(NEW.tanggal) <> OLD.periode THEN
    RAISE EXCEPTION
      'Tanggal (%) di luar semester jurnal (%). Untuk pindah semester, batalkan jurnal & entry ulang.',
      NEW.tanggal, OLD.periode;
  END IF;

  NEW.periode    := OLD.periode;   -- periode tetap beku
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_jurnal_header_guard ON jurnal_header;
CREATE TRIGGER trg_jurnal_header_guard
  BEFORE INSERT OR UPDATE ON jurnal_header
  FOR EACH ROW EXECUTE FUNCTION fn_jurnal_header_guard();

-- ── 3. RLS per SKPD (samakan pola dgn aset) ─────────────────────────────────
ALTER TABLE jurnal_header ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "jh_select" ON jurnal_header;
CREATE POLICY "jh_select" ON jurnal_header FOR SELECT TO authenticated
  USING (fn_is_admin() OR fn_skpd_visible(skpd_id));

DROP POLICY IF EXISTS "jh_insert" ON jurnal_header;
CREATE POLICY "jh_insert" ON jurnal_header FOR INSERT TO authenticated
  WITH CHECK (fn_is_admin() OR fn_skpd_visible(skpd_id));

DROP POLICY IF EXISTS "jh_update" ON jurnal_header;
CREATE POLICY "jh_update" ON jurnal_header FOR UPDATE TO authenticated
  USING (fn_is_admin() OR fn_skpd_visible(skpd_id));

DROP POLICY IF EXISTS "jh_delete" ON jurnal_header;
CREATE POLICY "jh_delete" ON jurnal_header FOR DELETE TO authenticated
  USING (fn_is_admin() OR fn_skpd_visible(skpd_id));
