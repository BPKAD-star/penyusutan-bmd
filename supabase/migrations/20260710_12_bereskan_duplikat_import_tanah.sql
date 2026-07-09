-- ============================================================================
-- 20260710_09: Bereskan duplikat sisa Import Tanah (2026-07-10).
--
-- Migrasi 08 langkah 3 salah meng-INSERT ~27 tanah sbg "baru" — padahal itu
-- tanah yg SUDAH ADA di DB dgn NIBAR LAMA (kode barang lama). Langkah "tindes
-- NIBAR" (08 langkah 2) sengaja skip mereka krn identitasnya (nama+skpd+tgl+
-- nilai) GAK UNIK — banyak tanah kembar ("Tanah waduk", "Tanah Transfer Depo
-- Sampah", tanah sekolah dgn nama+nilai persis sama) — biar gak salah nindes.
-- Akibatnya tiap tanah ini kini kecatat 2x: versi NIBAR LAMA + versi NIBAR FILE.
--
-- Keputusan user: FILE = kebenaran. SIMPAN versi FILE (NIBAR ADA di
-- stg_import_tanah, deskriptifnya sudah lengkap dari import), RETIRE versi LAMA
-- (NIBAR-nya TIDAK ada di file). Ledger append-only -> gak boleh DELETE, jadi
-- soft-delete pakai jenis 'koreksi_pencatatan_ganda' (memang utk "barang
-- kecatat 2x"), dicatat MUNDUR ke tgl perolehan asli (SEMBUNYI di engine ->
-- gak double-count), survivor = NIBAR versi file.
--
-- PENTING: visibilitas Daftar Barang/Penyusutan ditentukan REPLAY LEDGER
-- (event SEMBUNYI), BUKAN aset.status langsung — makanya WAJIB insert baris
-- koreksi_pencatatan_ganda, bukan cuma set status='dihapus'. status di-set jg
-- utk konsistensi state "sekarang".
--
-- Jalankan SETELAH 20260710_08. stg_import_tanah masih harus ada.
-- Re-runnable: dijaga NOT EXISTS koreksi_pencatatan_ganda per aset.
-- ============================================================================

-- Kandidat: aset Tanah LAMA (nibar gak ada di file) yang punya kembaran versi
-- FILE (nibar ada di file) dgn identitas sama persis. DISTINCT ON biar 1 baris
-- lama = 1 keputusan (survivor = nibar file terkecil, deterministik).
CREATE TEMP TABLE tmp_stale_tanah AS
SELECT DISTINCT ON (a_old.id)
       a_old.id            AS old_id,
       a_old.tgl_perolehan AS tgl,
       a_new.nibar         AS survivor_nibar
FROM aset a_old
JOIN aset a_new
  ON a_new.id <> a_old.id
 AND a_new.nama_barang     = a_old.nama_barang
 AND a_new.skpd_id         = a_old.skpd_id
 AND a_new.tgl_perolehan   = a_old.tgl_perolehan
 AND a_new.nilai_perolehan = a_old.nilai_perolehan
 AND a_new.kode LIKE '1.3.1%'
 AND EXISTS (SELECT 1 FROM stg_import_tanah s WHERE s.nibar = a_new.nibar)   -- kembaran = versi FILE
WHERE a_old.kode LIKE '1.3.1%'
  AND a_old.status = 'aktif'
  AND NOT EXISTS (SELECT 1 FROM stg_import_tanah s WHERE s.nibar = a_old.nibar)  -- ini versi LAMA (bukan file)
ORDER BY a_old.id, a_new.nibar;

-- Ledger SEMBUNYI (soft-delete duplikat lama), backdate ke tgl perolehan asli.
INSERT INTO transaksi_bmd (aset_id, jenis, periode, tanggal, nilai, payload, keterangan)
SELECT t.old_id, 'koreksi_pencatatan_ganda', fn_periode_dari_tanggal(t.tgl), t.tgl, 0,
       jsonb_build_object('survivor_nibar', t.survivor_nibar,
                          'sumber', 'Bereskan duplikat Import Tanah 2026-07-10'),
       'Gabung duplikat — versi NIBAR lama diretire, versi file (import) jadi survivor'
FROM tmp_stale_tanah t
WHERE NOT EXISTS (
  SELECT 1 FROM transaksi_bmd tb WHERE tb.aset_id = t.old_id AND tb.jenis = 'koreksi_pencatatan_ganda'
);

-- Set state "sekarang" konsisten.
UPDATE aset a SET status = 'dihapus'
FROM tmp_stale_tanah t WHERE a.id = t.old_id AND a.status = 'aktif';

DROP TABLE tmp_stale_tanah;

-- Verifikasi setelah run — HARUS 0 baris (gak ada lagi identitas tanah dobel
-- yg dua-duanya aktif):
--   SELECT nama_barang, skpd_id, tgl_perolehan, nilai_perolehan, count(*)
--   FROM aset WHERE kode LIKE '1.3.1%' AND status='aktif'
--   GROUP BY 1,2,3,4 HAVING count(*) > 1;
