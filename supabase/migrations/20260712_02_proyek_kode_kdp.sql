-- ============================================================================
-- Proyek Konstruksi — Fase 2a: kolom kode_kdp
-- Aset penampung KDP butuh kode golongan 1.3.6.x (dari kodefikasi). Operator
-- pilih saat buat paket. Ketinggalan di migrasi Fase 1 (20260712_01), ditambah
-- di sini sebelum materialisasi (lib/kdp.ts) memakainya.
--
-- Jalankan SETELAH 20260712_01_proyek_konstruksi_kdp.sql.
-- ============================================================================
ALTER TABLE proyek_konstruksi
  ADD COLUMN IF NOT EXISTS kode_kdp text REFERENCES admin_kodefikasi_bmd(kode);
