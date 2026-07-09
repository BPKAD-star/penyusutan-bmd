-- ============================================================================
-- 20260710_13: Retire 3 tanah versi LAMA (skpd_id salah) yang nyisa aktif
-- setelah Import Tanah Lengkap.
--
-- File "Import Tanah Lengkap" membetulkan skpd_id 3 tanah ini (jadi NIBAR-nya
-- ikut berubah di segmen lokasi). Import langkah-tindes (migrasi 11 langkah 2)
-- GAK match karena kunci identitas termasuk skpd_id yang berubah -> versi baru
-- ke-INSERT (langkah 3), versi lama (skpd salah) nyisa aktif. Akibatnya count
-- Tanah 2735, harusnya 2732.
--
-- Nilai+tanggal+nama IDENTIK antara versi lama & versi file (cuma skpd beda) =
-- pasti tanah yang sama. Retire versi lama: soft-delete + koreksi_pencatatan_
-- ganda (append-only, gak boleh DELETE), backdate ke tgl perolehan, survivor =
-- versi file. 3 NIBAR eksplisit (deterministik). Re-runnable (dijaga NOT EXISTS).
-- ============================================================================

WITH pasangan(old_nibar, survivor_nibar) AS (VALUES
  ('120135060200000029000019901310101040060000001','120135060200000029000019901310101040060000002'), -- Puskesmas Pembantu Plemahan (skpd 3 -> 170)
  ('120135060100000026000119281310101040020000001','120135060100000026000119281310101040020000003'), -- SDN Badas I (skpd 2 -> 802)
  ('120135060900000000000020211310101040020000001','120135060100000081000020211310101040020000001')  -- SMPN 3 Mojo (skpd 2 -> 141)
)
INSERT INTO transaksi_bmd (aset_id, jenis, periode, tanggal, nilai, payload, keterangan)
SELECT a.id, 'koreksi_pencatatan_ganda', fn_periode_dari_tanggal(a.tgl_perolehan), a.tgl_perolehan, 0,
       jsonb_build_object('survivor_nibar', p.survivor_nibar,
                          'sumber', 'Retire versi skpd lama - Import Tanah 2026-07-10'),
       'Duplikat versi skpd lama, digantikan versi file impor (skpd sudah dibetulkan)'
FROM pasangan p
JOIN aset a ON a.nibar = p.old_nibar
WHERE a.status = 'aktif'
  AND NOT EXISTS (SELECT 1 FROM transaksi_bmd t WHERE t.aset_id = a.id AND t.jenis = 'koreksi_pencatatan_ganda');

UPDATE aset a SET status = 'dihapus'
FROM (VALUES
  ('120135060200000029000019901310101040060000001'),
  ('120135060100000026000119281310101040020000001'),
  ('120135060900000000000020211310101040020000001')
) AS x(old_nibar)
WHERE a.nibar = x.old_nibar AND a.status = 'aktif';

-- Verifikasi: HARUS 2732
--   SELECT count(*) FROM aset WHERE kode LIKE '1.3.1%' AND status='aktif';
