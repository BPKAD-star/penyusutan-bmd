-- ============================================================================
-- Kolom spesifikasi tambahan (Peralatan & Mesin, Tanah) + foto barang.
-- Kolom di `aset` sengaja dibuat nullable lebar — satu tabel utk semua golongan,
-- laporan tinggal SELECT kolom yang relevan per golongan (lihat lib/asetFields.ts).
-- Jalankan SETELAH 20260704_12_approval_pengadaan.sql.
-- ============================================================================

-- ── 1. Kolom spesifikasi Peralatan & Mesin (kendaraan dkk) ──────────────────
ALTER TABLE aset ADD COLUMN IF NOT EXISTS no_polisi text;
ALTER TABLE aset ADD COLUMN IF NOT EXISTS no_bpkb text;
ALTER TABLE aset ADD COLUMN IF NOT EXISTS no_rangka text;
ALTER TABLE aset ADD COLUMN IF NOT EXISTS no_mesin text;

-- ── 2. Kolom tambahan Tanah (lengkapi migrasi 10) ───────────────────────────
ALTER TABLE aset ADD COLUMN IF NOT EXISTS titik_koordinat text;
ALTER TABLE aset ADD COLUMN IF NOT EXISTS lokasi text;

-- ── 3. Foto barang (array path Storage, bisa >1 foto per barang) ───────────
ALTER TABLE aset ADD COLUMN IF NOT EXISTS foto_paths text[] NOT NULL DEFAULT '{}';

-- ── 4. Bucket Storage utk foto barang — privat, limit 10MB, hanya image ────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('aset-foto', 'aset-foto', false, 10485760, ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO UPDATE SET file_size_limit = 10485760, allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp'];

-- RLS storage.objects: authenticated boleh lihat/upload/hapus foto di bucket ini.
-- App ini internal admin pemda (semua user login = staf terverifikasi), jadi
-- scoping cukup di level "authenticated", sama seperti pola akses tabel lain.
DROP POLICY IF EXISTS "aset_foto_select" ON storage.objects;
CREATE POLICY "aset_foto_select" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'aset-foto');
DROP POLICY IF EXISTS "aset_foto_insert" ON storage.objects;
CREATE POLICY "aset_foto_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'aset-foto');
DROP POLICY IF EXISTS "aset_foto_delete" ON storage.objects;
CREATE POLICY "aset_foto_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'aset-foto');

-- ── 5. Kolom koreksi_spesifikasi payload: lib/transaksi.ts sudah handle
-- no_sertifikat/atas_nama_sertifikat/hak_kepemilikan/tgl_sertifikat/luas_tanah;
-- tambahkan no_polisi/no_bpkb/no_rangka/no_mesin/titik_koordinat/lokasi juga
-- di sisi aplikasi (lihat lib/transaksi.ts) — tidak perlu perubahan skema lagi.
