-- ============================================================================
-- Modul KIR (Kartu Inventaris Ruangan) — Format III.K.2.
--
-- SIFAT: NON-LEDGER (pola Inventarisasi, migrasi 20260725_08). Modul ini TIDAK
--   pernah menulis `transaksi_bmd` dan TIDAK mengubah kolom apa pun di `aset`.
--   Penempatan barang di ruangan = data DESKRIPTIF/administratif (siapa memegang
--   fisik barang di ruangan mana), bukan peristiwa akuntansi: tidak mengubah
--   nilai, penyusutan, kepemilikan SKPD, maupun visibilitas barang. Karena itu
--   baris di sini boleh di-UPDATE/DELETE biasa (user minta: edit nama ruangan,
--   hapus barang dari ruangan, hapus ruangan) — aturan append-only `transaksi_bmd`
--   TIDAK berlaku & TIDAK dilanggar, karena tabel ini bukan ledger.
--
-- BEDA DGN PENGAMANAN: Pengamanan = kustodi HUKUM ke seorang pegawai lewat BAST +
--   Pakta Integritas (ber-dokumen, ber-ledger, jadi butuh jejak permanen). KIR =
--   penempatan FISIK di ruangan (administratif, sering berubah saat barang
--   dipindah antar ruang). Keduanya berdiri sendiri: satu barang boleh punya
--   kustodian Pengamanan sekaligus tercatat di sebuah ruangan.
--
-- SATU BARANG = SATU RUANGAN (keputusan user 2026-07-27) — ditegakkan DB lewat
--   UNIQUE (aset_id) di kir_ruangan_aset, bukan cuma filter picker di client.
--   Barang harus dikeluarkan dari ruangan lama sebelum masuk ruangan baru.
--
-- Jalankan di Supabase SQL Editor SEBELUM deploy kode (halaman KIR langsung
-- query tabel ini). SETELAH 20260727_01_approval_bukan_pembuat.sql.
-- ============================================================================

-- ── Ruangan ─────────────────────────────────────────────────────────────────
-- `pegawai_id` = Penanggung Jawab Ruangan, dipilih dari admin_pegawai (peran
--   'penanggung_jawab_ruangan' diusulkan lewat menu Usulan Pengurus Barang).
--   ON DELETE SET NULL: pegawai pindah/dihapus tidak boleh menghilangkan ruangan
--   beserta isinya.
-- `pj_nama/pj_nip/pj_jabatan` = SNAPSHOT saat ditetapkan — sengaja denormalisasi
--   supaya blok tanda tangan di KIR yang sudah dicetak tetap sesuai dokumen fisik
--   walau data pegawai berubah belakangan (idiom sama: inventarisasi.petugas).
CREATE TABLE IF NOT EXISTS kir_ruangan (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  skpd_id       bigint NOT NULL REFERENCES admin_skpd(id),
  nama          text   NOT NULL,
  kode_ruangan  text,                        -- opsional, mis. nomor ruang internal
  pegawai_id    uuid   REFERENCES admin_pegawai(id) ON DELETE SET NULL,
  pj_nama       text,
  pj_nip        text,
  pj_jabatan    text,
  keterangan    text,
  created_by    uuid DEFAULT auth.uid(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (skpd_id, nama)                     -- nama ruangan unik dalam satu SKPD
);
CREATE INDEX IF NOT EXISTS idx_kir_ruangan_skpd    ON kir_ruangan(skpd_id);
CREATE INDEX IF NOT EXISTS idx_kir_ruangan_pegawai ON kir_ruangan(pegawai_id);

DROP TRIGGER IF EXISTS trg_kir_ruangan_updated ON kir_ruangan;
CREATE TRIGGER trg_kir_ruangan_updated BEFORE UPDATE ON kir_ruangan
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- ── Isi ruangan (barang) ────────────────────────────────────────────────────
-- ON DELETE CASCADE dari ruangan: hapus ruangan → isinya ikut lepas (barangnya
--   sendiri di `aset` TIDAK tersentuh sama sekali — cuma penempatannya hilang).
-- FK ke aset TANPA cascade: `aset` tidak pernah di-DELETE (soft-delete), jadi
--   cascade tak akan pernah terpakai; biarkan restrict sebagai jaring pengaman.
CREATE TABLE IF NOT EXISTS kir_ruangan_aset (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ruangan_id uuid NOT NULL REFERENCES kir_ruangan(id) ON DELETE CASCADE,
  aset_id    uuid NOT NULL REFERENCES aset(id),
  keterangan text,                           -- kolom 11 KIR (kondisi/catatan)
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (aset_id)                           -- 1 barang hanya boleh di 1 ruangan
);
CREATE INDEX IF NOT EXISTS idx_kir_ruangan_aset_ruangan ON kir_ruangan_aset(ruangan_id);

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- Pola inventarisasi (20260725_08): SKPD kelola subtree-nya sendiri; admin lihat
-- & tulis semua; pengawas baca semua. fn_is_admin()/fn_is_viewer() KONSTAN →
-- dibungkus InitPlan `(SELECT ...)` supaya dievaluasi SEKALI, bukan per baris
-- (aturan performa CLAUDE.md). fn_skpd_visible per-baris (subtree).
ALTER TABLE kir_ruangan ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "kir_ruangan_select" ON kir_ruangan;
CREATE POLICY "kir_ruangan_select" ON kir_ruangan FOR SELECT TO authenticated
  USING ((SELECT fn_is_admin()) OR (SELECT fn_is_viewer()) OR fn_skpd_visible(skpd_id));

DROP POLICY IF EXISTS "kir_ruangan_insert" ON kir_ruangan;
CREATE POLICY "kir_ruangan_insert" ON kir_ruangan FOR INSERT TO authenticated
  WITH CHECK ((SELECT fn_is_admin()) OR fn_skpd_visible(skpd_id));

DROP POLICY IF EXISTS "kir_ruangan_update" ON kir_ruangan;
CREATE POLICY "kir_ruangan_update" ON kir_ruangan FOR UPDATE TO authenticated
  USING ((SELECT fn_is_admin()) OR fn_skpd_visible(skpd_id))
  WITH CHECK ((SELECT fn_is_admin()) OR fn_skpd_visible(skpd_id));

DROP POLICY IF EXISTS "kir_ruangan_delete" ON kir_ruangan;
CREATE POLICY "kir_ruangan_delete" ON kir_ruangan FOR DELETE TO authenticated
  USING ((SELECT fn_is_admin()) OR fn_skpd_visible(skpd_id));

-- Baris isi ruangan mengikuti izin ruangannya.
ALTER TABLE kir_ruangan_aset ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "kir_ruangan_aset_select" ON kir_ruangan_aset;
CREATE POLICY "kir_ruangan_aset_select" ON kir_ruangan_aset FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM kir_ruangan r WHERE r.id = ruangan_id
      AND ((SELECT fn_is_admin()) OR (SELECT fn_is_viewer()) OR fn_skpd_visible(r.skpd_id))
  ));

DROP POLICY IF EXISTS "kir_ruangan_aset_insert" ON kir_ruangan_aset;
CREATE POLICY "kir_ruangan_aset_insert" ON kir_ruangan_aset FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM kir_ruangan r WHERE r.id = ruangan_id
      AND ((SELECT fn_is_admin()) OR fn_skpd_visible(r.skpd_id))
  ));

DROP POLICY IF EXISTS "kir_ruangan_aset_update" ON kir_ruangan_aset;
CREATE POLICY "kir_ruangan_aset_update" ON kir_ruangan_aset FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM kir_ruangan r WHERE r.id = ruangan_id
      AND ((SELECT fn_is_admin()) OR fn_skpd_visible(r.skpd_id))
  ));

DROP POLICY IF EXISTS "kir_ruangan_aset_delete" ON kir_ruangan_aset;
CREATE POLICY "kir_ruangan_aset_delete" ON kir_ruangan_aset FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM kir_ruangan r WHERE r.id = ruangan_id
      AND ((SELECT fn_is_admin()) OR fn_skpd_visible(r.skpd_id))
  ));

-- Verifikasi:
--   SELECT to_regclass('public.kir_ruangan'), to_regclass('public.kir_ruangan_aset');
--   -- keduanya TIDAK boleh NULL
