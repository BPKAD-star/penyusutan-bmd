-- ============================================================================
-- Proyek Konstruksi — Fase 3a: field tambahan paket & termin (koreksi user).
--   Paket : Program, Kegiatan, Sub Kegiatan, Nama Penyedia, PPK (Pejabat
--           Pembuat Komitmen).
--   Termin: Nomor BAST (tanggal BAST = kolom `tanggal` yg sudah ada).
-- Spesifikasi KDP (Tanah-like) TIDAK butuh kolom baru di sini — disimpan di
-- aset KDP (kolom aset lebar yg sudah ada), diedit lewat EditSpesifikasiModal.
--
-- Jalankan SETELAH 20260712_02_proyek_kode_kdp.sql.
-- ============================================================================
ALTER TABLE proyek_konstruksi
  ADD COLUMN IF NOT EXISTS program       text,
  ADD COLUMN IF NOT EXISTS kegiatan      text,
  ADD COLUMN IF NOT EXISTS sub_kegiatan  text,
  ADD COLUMN IF NOT EXISTS nama_penyedia text,
  ADD COLUMN IF NOT EXISTS ppk           text;

ALTER TABLE proyek_termin
  ADD COLUMN IF NOT EXISTS no_bast text;
