-- 20260704_14_wilayah_uraian_koordinat.sql
-- Penambahan kolom aset (SEMUA additive → aman utk data live 9.606 baris) +
-- tabel referensi wilayah Kemendagri. Tidak ada rename kolom: permintaan "ganti
-- nama" (Luas, Nomor/Tanggal/Nama Dokumen Kepemilikan, Jenis Hak, Spesifikasi
-- Lainnya) diterapkan sebagai LABEL di lib/asetFields.ts, nama kolom DB tetap.
--
-- Yang ditambah:
--   - aset.uraian_barang : nama baku dari kodefikasi_bmd (di-backfill dari kode)
--   - aset.latitude / longitude : pecahan titik_koordinat (siap GIS)
--   - aset.alamat_detail : nama jalan / detail alamat (di luar wilayah berjenjang)
--   - aset.wilayah_kode : FK ke tabel `wilayah` (lokasi fisik berjenjang)
--   - tabel `wilayah` : referensi provinsi→kab/kota→kecamatan→desa (kode Kemendagri)
-- Kolom lama `titik_koordinat` & `lokasi` SENGAJA tidak dihapus (irreversible) —
-- cukup tidak dipakai lagi di UI.

-- ── 1. Kolom baru di aset ────────────────────────────────────────────────────
ALTER TABLE aset ADD COLUMN IF NOT EXISTS uraian_barang text;   -- baku dari kodefikasi_bmd
ALTER TABLE aset ADD COLUMN IF NOT EXISTS latitude      numeric;
ALTER TABLE aset ADD COLUMN IF NOT EXISTS longitude     numeric;
ALTER TABLE aset ADD COLUMN IF NOT EXISTS alamat_detail text;

-- ── 2. Tabel referensi wilayah (kode Kemendagri Permendagri) ─────────────────
--   kode: '35' (prov) · '35.06' (kab/kota) · '35.06.01' (kec) · '35.06.01.2001' (desa)
CREATE TABLE IF NOT EXISTS wilayah (
  kode        text PRIMARY KEY,
  nama        text NOT NULL,
  level       smallint NOT NULL CHECK (level BETWEEN 1 AND 4), -- 1=prov 2=kab/kota 3=kec 4=desa/kel
  parent_kode text REFERENCES wilayah(kode)
);
CREATE INDEX IF NOT EXISTS idx_wilayah_parent ON wilayah(parent_kode);
CREATE INDEX IF NOT EXISTS idx_wilayah_level  ON wilayah(level);

ALTER TABLE aset ADD COLUMN IF NOT EXISTS wilayah_kode text REFERENCES wilayah(kode);
CREATE INDEX IF NOT EXISTS idx_aset_wilayah ON aset(wilayah_kode);

-- RLS wilayah: semua authenticated boleh baca (data referensi); tulis hanya admin
-- (seed via SQL Editor pakai role postgres → bypass RLS, tetap jalan).
ALTER TABLE wilayah ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY wilayah_read ON wilayah FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY wilayah_admin_write ON wilayah FOR ALL TO authenticated
    USING (fn_is_admin()) WITH CHECK (fn_is_admin());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 3. Backfill uraian_barang dari kodefikasi_bmd (match by kode) ─────────────
--   Baris dgn kode yang tak ada di kodefikasi tetap NULL (aman).
UPDATE aset a SET uraian_barang = k.uraian
FROM kodefikasi_bmd k
WHERE a.kode = k.kode AND a.uraian_barang IS NULL;
