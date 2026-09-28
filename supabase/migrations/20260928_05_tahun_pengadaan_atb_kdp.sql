-- ============================================================================
-- 20260928_05 — Tahun Pengadaan ATB (1.5.3) & KDP (1.3.6) diisi dari
-- tahun Tanggal Perolehan
--
-- Permintaan user 2026-09-28. Non-ledger, murni kolom deskriptif — sama
-- pola dgn migrasi Kondisi sebelumnya (20260928_02/03).
--
-- Diverifikasi ke produksi SEBELUM dijalankan: golongan ini tak punya barang
-- "bekas" (Hibah/Tukar Menukar/Hasil Inventarisasi/Perolehan Lainnya) yang
-- tgl_perolehan-nya BERBEDA dari tahun masuk pemda — KECUALI 1 baris KDP
-- (hibah_masuk, "Perencanaan Jembatan Gantung Surat") yang SENGAJA
-- DIKECUALIKAN dari pengisian otomatis ini. Alasannya aturan "BARANG BEKAS
-- YANG DITERIMA" (2026-08-20, lihat CLAUDE.md): utk keempat cara perolehan
-- itu, `aset.tgl_perolehan` = tanggal barang DIBUAT, bukan tanggal masuk ke
-- pemda ini (itu tanggal BAST, tersimpan di baris ledger) — jadi tak bisa
-- dipakai sbg tahun_pengadaan tanpa risiko salah. Sisanya (saldo_awal,
-- mayoritas) aman karena cara perolehan itu tak membawa nuansa "barang bekas
-- dari pihak lain". Baris hibah_masuk yang dikecualikan dibiarkan kosong utk
-- diisi manual oleh pengurus barang lewat Koreksi/Edit Spesifikasi.
--
-- Baseline (`aset_awal_2026`) tak punya kolom `cara_perolehan` sama sekali
-- (murni snapshot pra-app, tak ada nuansa "cara perolehan 2026"), jadi SEMUA
-- baris kosong di sana aman diisi — kecuali yang terkunci
-- (`fn_aset_awal_2026_terkunci_batch`, pola sama dgn 20260928_02/03).
--
-- Diuji transaksi+ROLLBACK dulu sebelum dijalankan permanen via MCP Supabase.
-- Hasil TERUKUR: aset aktif 1.3.6 228 diisi (1 hibah_masuk sengaja dilewati,
-- tetap kosong); 1.5.3 40 diisi (0 dilewati, 0 kosong tersisa).
-- aset_awal_2026 1.3.6 228 diisi, 5 tetap kosong (terkunci); 1.5.3 40 diisi,
-- 0 terkunci, 0 kosong tersisa.
--
-- Tak menyentuh ledger, tak butuh run ulang engine — kolom ini murni
-- deskriptif, tak pernah dipakai perhitungan penyusutan/Laporan BMD/
-- Rekonsiliasi. Idempotent (WHERE ... IS NULL) — aman dijalankan ulang.
-- ============================================================================

UPDATE aset
   SET tahun_pengadaan = extract(year from tgl_perolehan)
 WHERE golongan IN ('1.5.3','1.3.6')
   AND status = 'aktif'
   AND tahun_pengadaan IS NULL
   AND tgl_perolehan IS NOT NULL
   AND (cara_perolehan IS NULL OR cara_perolehan NOT IN ('hibah_masuk','tukar_menukar','hasil_inventarisasi','perolehan_lainnya'));

WITH kandidat AS (
  SELECT nibar FROM aset_awal_2026 WHERE golongan IN ('1.5.3','1.3.6') AND tahun_pengadaan IS NULL
),
terkunci AS (
  SELECT nibar FROM fn_aset_awal_2026_terkunci_batch((SELECT array_agg(nibar) FROM kandidat))
)
UPDATE aset_awal_2026
   SET tahun_pengadaan = extract(year from tgl_perolehan)
 WHERE golongan IN ('1.5.3','1.3.6')
   AND tahun_pengadaan IS NULL
   AND tgl_perolehan IS NOT NULL
   AND nibar NOT IN (SELECT nibar FROM terkunci);
