-- ============================================================================
-- Aktif/nonaktif per kode kodefikasi — antisipasi salah pilih kode barang
-- saat entry (mis. cari "printer" nyasar ke Sub Rincian Objek yang salah,
-- padahal harusnya di Peralatan Komputer). Admin bisa nonaktifkan kode yang
-- membingungkan lewat halaman Admin > Kodefikasi BMD (satu-satunya field yang
-- masih boleh diedit di halaman itu — sisanya view only, lihat migrasi
-- 20260710_16).
--
-- Default TRUE (fail-open) supaya semua 15.353 kode existing tetap kepilih
-- spt biasa begitu migrasi ini jalan — admin nonaktifkan manual satu-satu yang
-- memang perlu, bukan sebaliknya.
--
-- HANYA memengaruhi pencarian kode BARU saat entry (Cara Perolehan: Pengadaan/
-- Hibah/Tukar Menukar/Hasil Inventarisasi/Perolehan Lainnya; Pengelolaan:
-- Reklasifikasi). Barang yang SUDAH tercatat pakai kode ini tidak terpengaruh
-- sama sekali (aset.kode tidak ada FK ke kolom ini, engine tetap baca semua
-- kode apa adanya).
-- ============================================================================

ALTER TABLE admin_kodefikasi_bmd ADD COLUMN IF NOT EXISTS aktif boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_kodefikasi_bmd_aktif ON admin_kodefikasi_bmd(aktif);
