-- Drop kolom lama titik_koordinat & lokasi di aset — sudah DEPRECATED sejak
-- migrasi 20260704_14_wilayah_uraian_koordinat.sql (digantikan latitude/
-- longitude/alamat_detail+wilayah_kode), dan sekarang dikonfirmasi KOSONG di
-- seluruh baris live (dicek manual via SQL Editor sebelum migrasi ini ditulis:
-- count(*) filter (where titik_koordinat/lokasi is not null and <> '') = 0
-- utk keduanya) — jadi tidak ada data yang hilang, tidak perlu backfill.
ALTER TABLE aset DROP COLUMN IF EXISTS titik_koordinat;
ALTER TABLE aset DROP COLUMN IF EXISTS lokasi;
