-- ============================================================================
-- Cabut IPA versi LAMA (Kepmen ST1–ST4, migrasi 20260709_02/03) — digantikan
-- IPA lima aspek (20260925_03).
--
-- ⚠️ JALANKAN SESUDAH DEPLOY KODE BARU. Kode lama (Dashboard IPA versi Kepmen)
-- membaca tabel-tabel ini; kalau migrasi ini jalan duluan, halaman lama mati
-- selama jendela sebelum deploy.
--
-- Aman dari sisi data: seluruh tabel diverifikasi KOSONG 2026-09-25
-- (ipa_record 0, ipa_parameter_nilai 0; ipa_tahun_anggaran cuma 1 baris salah
-- input "tahun = 1"). Penjaga di bawah membatalkan migrasi kalau ternyata
-- sudah berisi — jangan dilewati.
--
-- Yang SENGAJA TIDAK dicabut: kolom `admin_profiles.ipa_role` (masih dibaca
-- layar Admin → Daftar User) & kolom `admin_skpd.kelompok_fpk`/`fpk_*` —
-- mencabut kolom di tabel inti butuh telaah tersendiri.
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM ipa_record) OR EXISTS (SELECT 1 FROM ipa_parameter_nilai)
     OR EXISTS (SELECT 1 FROM ipa_dokumen_bukti) THEN
    RAISE EXCEPTION 'Tabel IPA lama sudah berisi data — telaah dulu sebelum dicabut.';
  END IF;
END $$;

DROP TABLE IF EXISTS ipa_log;
DROP TABLE IF EXISTS ipa_dokumen_bukti;
DROP TABLE IF EXISTS ipa_parameter_nilai;
DROP TABLE IF EXISTS ipa_record;
DROP TABLE IF EXISTS ipa_tahun_anggaran;
