-- ============================================================================
-- Admin: Daftar Pegawai, Daftar Satuan, RLS write utk master data, path SKPD
-- Jalankan di Supabase SQL Editor SETELAH 20260702_01..06.
--
-- Latar: profiles.id terikat 1:1 ke auth.users, jadi tidak bisa menampung
-- pegawai yang belum/tidak perlu akun login (Role BMD "Pengguna Barang").
-- Migrasi ini memisahkan data pegawai (independen) dari akun login (profiles).
-- ============================================================================

-- ── 1. Tabel pegawai (master, independen dari auth.users) ──────────────────
CREATE TABLE IF NOT EXISTS pegawai (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nip        text UNIQUE NOT NULL,
  nama       text NOT NULL,
  pangkat    text,
  golongan   text,
  jabatan    text,
  role_bmd   text NOT NULL DEFAULT 'pengurus_barang'
             CHECK (role_bmd IN (
               'pengguna_barang', 'kuasa_pengguna_barang', 'pengurus_barang',
               'pembantu_pengurus_barang', 'penyimpan_barang'
             )),
  skpd_id    bigint REFERENCES skpd(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pegawai_skpd ON pegawai(skpd_id);

DROP TRIGGER IF EXISTS trg_pegawai_updated_at ON pegawai;
CREATE TRIGGER trg_pegawai_updated_at BEFORE UPDATE ON pegawai
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

ALTER TABLE pegawai ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pegawai_select" ON pegawai;
CREATE POLICY "pegawai_select" ON pegawai FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "pegawai_insert" ON pegawai;
CREATE POLICY "pegawai_insert" ON pegawai FOR INSERT TO authenticated WITH CHECK (fn_is_admin());
DROP POLICY IF EXISTS "pegawai_update" ON pegawai;
CREATE POLICY "pegawai_update" ON pegawai FOR UPDATE TO authenticated USING (fn_is_admin());
DROP POLICY IF EXISTS "pegawai_delete" ON pegawai;
CREATE POLICY "pegawai_delete" ON pegawai FOR DELETE TO authenticated USING (fn_is_admin());

-- ── 2. Backfill pegawai dari profiles existing, lalu rework profiles ────────
INSERT INTO pegawai (nip, nama, pangkat, skpd_id)
SELECT p.nip, p.nama, p.pangkat_golongan, p.skpd_id
FROM profiles p
WHERE p.nip IS NOT NULL
ON CONFLICT (nip) DO NOTHING;

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS pegawai_id uuid REFERENCES pegawai(id);

UPDATE profiles p
SET pegawai_id = pg.id
FROM pegawai pg
WHERE p.nip IS NOT NULL AND p.nip = pg.nip AND p.pegawai_id IS NULL;

-- Kolom nama/nip/pangkat_golongan sudah pindah ke pegawai (join via pegawai_id).
-- profiles.skpd_id TIDAK dihapus — fn_my_skpd_path() baca kolom ini langsung.
ALTER TABLE profiles DROP COLUMN IF EXISTS nama;
ALTER TABLE profiles DROP COLUMN IF EXISTS nip;
ALTER TABLE profiles DROP COLUMN IF EXISTS pangkat_golongan;

-- ── 3. Tabel satuan_bmd (master satuan aset) ────────────────────────────────
CREATE TABLE IF NOT EXISTS satuan_bmd (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nama        text UNIQUE NOT NULL,
  keterangan  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE satuan_bmd ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "satuan_select" ON satuan_bmd;
CREATE POLICY "satuan_select" ON satuan_bmd FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "satuan_insert" ON satuan_bmd;
CREATE POLICY "satuan_insert" ON satuan_bmd FOR INSERT TO authenticated WITH CHECK (fn_is_admin());
DROP POLICY IF EXISTS "satuan_update" ON satuan_bmd;
CREATE POLICY "satuan_update" ON satuan_bmd FOR UPDATE TO authenticated USING (fn_is_admin());
DROP POLICY IF EXISTS "satuan_delete" ON satuan_bmd;
CREATE POLICY "satuan_delete" ON satuan_bmd FOR DELETE TO authenticated USING (fn_is_admin());

INSERT INTO satuan_bmd (nama) VALUES
  ('Buah'), ('Unit'), ('Set'), ('Meter'), ('M2'), ('M3'), ('Buku'), ('Bidang'), ('Paket')
ON CONFLICT (nama) DO NOTHING;

-- ── 4. RLS write (admin) utk tabel referensi yang sebelumnya read-only ─────
DROP POLICY IF EXISTS "ob_insert" ON overhaul_band;
CREATE POLICY "ob_insert" ON overhaul_band FOR INSERT TO authenticated WITH CHECK (fn_is_admin());
DROP POLICY IF EXISTS "ob_update" ON overhaul_band;
CREATE POLICY "ob_update" ON overhaul_band FOR UPDATE TO authenticated USING (fn_is_admin());
DROP POLICY IF EXISTS "ob_delete" ON overhaul_band;
CREATE POLICY "ob_delete" ON overhaul_band FOR DELETE TO authenticated USING (fn_is_admin());

DROP POLICY IF EXISTS "kodefikasi_update" ON kodefikasi_bmd;
CREATE POLICY "kodefikasi_update" ON kodefikasi_bmd FOR UPDATE TO authenticated USING (fn_is_admin());

DROP POLICY IF EXISTS "skpd_insert" ON skpd;
CREATE POLICY "skpd_insert" ON skpd FOR INSERT TO authenticated WITH CHECK (fn_is_admin());
DROP POLICY IF EXISTS "skpd_update" ON skpd;
CREATE POLICY "skpd_update" ON skpd FOR UPDATE TO authenticated USING (fn_is_admin());
DROP POLICY IF EXISTS "skpd_delete" ON skpd;
CREATE POLICY "skpd_delete" ON skpd FOR DELETE TO authenticated USING (fn_is_admin());

-- ── 5. Auto-hitung level & path (ltree) SKPD dari parent_id ─────────────────
-- Supaya halaman CRUD SKPD tidak perlu hitung ltree manual di client.
-- Cascade: kalau parent_id sebuah node diubah, semua descendant ikut di-reparent.
CREATE OR REPLACE FUNCTION fn_skpd_set_path() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_parent_path  ltree;
  v_parent_level int;
  v_old_path     ltree;
BEGIN
  -- Baris ini datang dari cascade UPDATE di bawah (path/level di-set langsung,
  -- parent_id tidak berubah) -> jangan hitung ulang dari parent_id, supaya
  -- trigger yang re-fire per baris descendant tidak salah hitung urutan.
  IF TG_OP = 'UPDATE' AND NEW.parent_id IS NOT DISTINCT FROM OLD.parent_id
     AND NEW.path IS DISTINCT FROM OLD.path THEN
    RETURN NEW;
  END IF;

  IF NEW.parent_id IS NULL THEN
    NEW.path  := text2ltree(NEW.id::text);
    NEW.level := 1;
  ELSE
    SELECT path, level INTO v_parent_path, v_parent_level
    FROM skpd WHERE id = NEW.parent_id;

    IF v_parent_path IS NULL THEN
      RAISE EXCEPTION 'parent_id % tidak valid (SKPD tidak ditemukan)', NEW.parent_id;
    END IF;

    IF TG_OP = 'UPDATE' AND v_parent_path <@ OLD.path THEN
      RAISE EXCEPTION 'SKPD % tidak boleh dipindah jadi anak dari descendant-nya sendiri', NEW.id;
    END IF;

    NEW.path  := v_parent_path || text2ltree(NEW.id::text);
    NEW.level := v_parent_level + 1;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    v_old_path := OLD.path;
    IF v_old_path IS DISTINCT FROM NEW.path THEN
      UPDATE skpd
      SET path  = NEW.path || subpath(path, nlevel(v_old_path)),
          level = NEW.level + (nlevel(path) - nlevel(v_old_path))
      WHERE path <@ v_old_path AND id <> NEW.id;
    END IF;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_skpd_set_path ON skpd;
CREATE TRIGGER trg_skpd_set_path BEFORE INSERT OR UPDATE ON skpd
  FOR EACH ROW EXECUTE FUNCTION fn_skpd_set_path();
