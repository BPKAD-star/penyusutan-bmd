-- ============================================================================
-- Samakan kolom spesifikasi saldo_awal_2026 dengan aset (agar Daftar Barang
-- Awal bisa menampilkan detail yang sama seperti Daftar Barang biasa).
--
-- Kolom yang DITAMBAH (semua nullable, murni additive — aman utk 9.9xx baris
-- live): spesifikasi_lainnya, merek_tipe, no_polisi, no_bpkb, no_rangka,
-- no_mesin, luas, nomor_dokumen_kepemilikan, tanggal_dokumen_kepemilikan,
-- nama_dokumen_kepemilikan, jenis_hak, wilayah_kode, alamat_detail, latitude,
-- longitude, foto_paths, uraian_barang, keterangan.
--
-- TIDAK ikut disamakan: id/cara_perolehan/status/created_at/updated_at (kolom
-- meta aset, tak relevan utk baris baseline) dan titik_koordinat/lokasi
-- (deprecated di aset — tak perlu diwariskan ke tabel baru).
--
-- PENTING soal makna "beku" (lihat CLAUDE.md): saldo_awal_2026 = foto posisi
-- 31 Des 2025, tak pernah disentuh transaksi apa pun. Backfill di bawah ini
-- SEKALI JALAN menarik nilai dari `aset` SAAT INI (by NIBAR) — utk barang yang
-- spesifikasinya baru dilengkapi/dikoreksi belakangan (mis. foto, koordinat,
-- no. rangka baru diisi lewat menu Koreksi setelah 2025), nilai yang masuk ke
-- saldo_awal_2026 adalah versi TERKINI itu, bukan yang benar-benar ada per 31
-- Des 2025 (tidak ada cara menelusuri versi historisnya krn aset tidak
-- versioned). Setelah migrasi ini jalan, saldo_awal_2026 TIDAK ikut ter-update
-- lagi walau aset diedit lagi nanti — snapshot ini kembali beku persis seperti
-- kolom lama.
-- ============================================================================

-- ── 1. Tambah kolom (nullable, additive) ────────────────────────────────────
ALTER TABLE saldo_awal_2026 ADD COLUMN IF NOT EXISTS spesifikasi_lainnya text;
ALTER TABLE saldo_awal_2026 ADD COLUMN IF NOT EXISTS merek_tipe text;
ALTER TABLE saldo_awal_2026 ADD COLUMN IF NOT EXISTS no_polisi text;
ALTER TABLE saldo_awal_2026 ADD COLUMN IF NOT EXISTS no_bpkb text;
ALTER TABLE saldo_awal_2026 ADD COLUMN IF NOT EXISTS no_rangka text;
ALTER TABLE saldo_awal_2026 ADD COLUMN IF NOT EXISTS no_mesin text;
ALTER TABLE saldo_awal_2026 ADD COLUMN IF NOT EXISTS luas numeric;
ALTER TABLE saldo_awal_2026 ADD COLUMN IF NOT EXISTS nomor_dokumen_kepemilikan text;
ALTER TABLE saldo_awal_2026 ADD COLUMN IF NOT EXISTS tanggal_dokumen_kepemilikan date;
ALTER TABLE saldo_awal_2026 ADD COLUMN IF NOT EXISTS nama_dokumen_kepemilikan text;
ALTER TABLE saldo_awal_2026 ADD COLUMN IF NOT EXISTS jenis_hak text;
ALTER TABLE saldo_awal_2026 ADD COLUMN IF NOT EXISTS wilayah_kode text REFERENCES wilayah(kode);
ALTER TABLE saldo_awal_2026 ADD COLUMN IF NOT EXISTS alamat_detail text;
ALTER TABLE saldo_awal_2026 ADD COLUMN IF NOT EXISTS latitude numeric;
ALTER TABLE saldo_awal_2026 ADD COLUMN IF NOT EXISTS longitude numeric;
ALTER TABLE saldo_awal_2026 ADD COLUMN IF NOT EXISTS foto_paths text[] NOT NULL DEFAULT '{}';
ALTER TABLE saldo_awal_2026 ADD COLUMN IF NOT EXISTS uraian_barang text;
ALTER TABLE saldo_awal_2026 ADD COLUMN IF NOT EXISTS keterangan text;

CREATE INDEX IF NOT EXISTS idx_sa2026_wilayah ON saldo_awal_2026(wilayah_kode);

-- ── 2. Backfill sekali jalan dari `aset` SAAT INI, dicocokkan via NIBAR ─────
-- Guard `s.uraian_barang IS NULL` dkk tidak dipakai supaya re-run migrasi ini
-- (mis. re-run manual) tetap menarik versi teraktual; kalau tidak ingin
-- backfill diulang, jalankan migrasi ini SEKALI saja seperti migrasi lain.
UPDATE saldo_awal_2026 s
SET spesifikasi_lainnya         = a.spesifikasi_lainnya,
    merek_tipe                  = a.merek_tipe,
    no_polisi                   = a.no_polisi,
    no_bpkb                     = a.no_bpkb,
    no_rangka                   = a.no_rangka,
    no_mesin                    = a.no_mesin,
    luas                        = a.luas,
    nomor_dokumen_kepemilikan   = a.nomor_dokumen_kepemilikan,
    tanggal_dokumen_kepemilikan = a.tanggal_dokumen_kepemilikan,
    nama_dokumen_kepemilikan    = a.nama_dokumen_kepemilikan,
    jenis_hak                   = a.jenis_hak,
    wilayah_kode                = a.wilayah_kode,
    alamat_detail               = a.alamat_detail,
    latitude                    = a.latitude,
    longitude                   = a.longitude,
    foto_paths                  = a.foto_paths,
    uraian_barang               = a.uraian_barang,
    keterangan                  = a.keterangan
FROM aset a
WHERE a.nibar = s.nibar;

-- Verifikasi:
--   SELECT count(*) FROM saldo_awal_2026 WHERE uraian_barang IS NOT NULL; -- harus mendekati jumlah aset yg py uraian_barang & nibar cocok
