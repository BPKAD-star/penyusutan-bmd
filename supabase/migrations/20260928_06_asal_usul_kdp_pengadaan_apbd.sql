-- ============================================================================
-- 20260928_06 — Asal Usul KDP (1.3.6) diisi 'Pengadaan APBD'
--
-- Permintaan user 2026-09-28 — kelewat saat migrasi Kondisi/Tahun Pengadaan
-- KDP sebelumnya (20260928_03/05). Non-ledger, murni kolom deskriptif.
--
-- Diverifikasi ke produksi SEBELUM dijalankan: 228 dari 229 baris aktif
-- ber-`cara_perolehan = 'saldo_awal'` — konsisten "Pengadaan APBD" sesuai
-- info user. SATU baris (hibah_masuk, "Perencanaan Jembatan Gantung Surat")
-- SENGAJA DIKECUALIKAN — sama pola dgn pengecualian tahun_pengadaan di
-- 20260928_05: barang itu berasal dari Hibah, bukan APBD, jadi "Pengadaan
-- APBD" akan salah catat kalau ikut diisi. Dibiarkan kosong utk diisi manual
-- oleh pengurus barang.
--
-- Baseline (`aset_awal_2026`): SEMUA 233 baris kosong ternyata cocok ke aset
-- ber-`cara_perolehan='saldo_awal'` via NIBAR — barang hibah itu tak ada di
-- baseline sama sekali (baru masuk 2026, sesudah snapshot akhir 2025) — aman
-- diisi semua, kecuali 5 yang terkunci (`fn_aset_awal_2026_terkunci_batch`,
-- 5 baris yang sama dgn migrasi Kondisi/Tahun Pengadaan sebelumnya).
--
-- Diuji transaksi+ROLLBACK dulu sebelum dijalankan permanen via MCP Supabase.
-- Hasil TERUKUR: aset aktif 228 diisi (1 hibah_masuk tetap kosong);
-- aset_awal_2026 228 diisi, 5 tetap kosong (terkunci).
--
-- Tak menyentuh ledger, tak butuh run ulang engine. Idempotent
-- (WHERE asal_usul IS NULL OR asal_usul = '') — aman dijalankan ulang.
-- ============================================================================

UPDATE aset
   SET asal_usul = 'Pengadaan APBD'
 WHERE golongan = '1.3.6'
   AND status = 'aktif'
   AND (asal_usul IS NULL OR asal_usul = '')
   AND (cara_perolehan IS NULL OR cara_perolehan NOT IN ('hibah_masuk','tukar_menukar','hasil_inventarisasi','perolehan_lainnya'));

WITH kandidat AS (
  SELECT nibar FROM aset_awal_2026 WHERE golongan = '1.3.6' AND (asal_usul IS NULL OR asal_usul = '')
),
terkunci AS (
  SELECT nibar FROM fn_aset_awal_2026_terkunci_batch((SELECT array_agg(nibar) FROM kandidat))
)
UPDATE aset_awal_2026
   SET asal_usul = 'Pengadaan APBD'
 WHERE golongan = '1.3.6'
   AND (asal_usul IS NULL OR asal_usul = '')
   AND nibar NOT IN (SELECT nibar FROM terkunci);
