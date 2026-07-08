-- Dua rename kontan, blast radius kecil (sudah diverifikasi manual referensi
-- kodenya sebelum migrasi ini ditulis):
--
-- 1. aset.penggunaan -> aset.penggunaan_pengamanan: antisipasi menu Pengamanan
--    BMD yang akan datang, biar nama kolom sudah jelas konteksnya dari awal.
--    Kolom ini murni field spesifikasi bebas teks (lib/asetFields.ts), tidak
--    dipakai fungsi SQL/RLS mana pun — aman di-rename langsung, ikuti kolom.
--
-- 2. dokumen_siklus -> admin_dokumen: rename tabel yang baru dibuat migrasi
--    20260710_01 (belum ada data produksi, cuma dipakai halaman Dokumen
--    Sumber) — bagian dari penataan ulang penamaan tabel referensi/admin
--    dengan prefix admin_ biar terklasifikasi di daftar tabel Supabase.
--    RLS policy & index ikut pindah otomatis (ALTER TABLE RENAME menjaga OID).

ALTER TABLE aset RENAME COLUMN penggunaan TO penggunaan_pengamanan;
ALTER TABLE dokumen_siklus RENAME TO admin_dokumen;
