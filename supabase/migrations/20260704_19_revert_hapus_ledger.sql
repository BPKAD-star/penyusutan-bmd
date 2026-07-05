-- 20260704_19_revert_hapus_ledger.sql
-- REVERT migrasi 17 & 18: escape hatch DELETE transaksi_bmd ternyata BERBAHAYA
-- di praktiknya. Daftar Barang & Penyusutan menyembunyikan barang BUKAN via cek
-- aset.status langsung, tapi via REPLAY EVENT LEDGER (SEMBUNYI termasuk
-- 'batal_pengadaan', lihat CLAUDE.md). Begitu baris batal_pengadaan (bukti
-- "barang ini harus disembunyikan") ikut dihapus, replay-nya kehilangan jejak
-- itu — barang yg sudah status='dihapus' malah MUNCUL LAGI di kedua laporan
-- itu, padahal harusnya permanen hilang. Fix yg benar: "Hapus Kontrak
-- Sepenuhnya" TIDAK BOLEH menyentuh transaksi_bmd sama sekali — cukup arsipkan
-- jurnal_header (set approval_status='ditolak', sudah otomatis disembunyikan
-- dari tampilan Pengadaan + dikecualikan dari cek No SK/BAST dipakai, tanpa
-- perlu skema baru). Lihat komponen Pengadaan.tsx.

-- Kembalikan trigger ke larangan MUTLAK (persis migrasi 01, tanpa pengecualian).
CREATE OR REPLACE FUNCTION fn_transaksi_bmd_immutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'transaksi_bmd bersifat append-only: % dilarang. Buat transaksi koreksi baru.', TG_OP;
END $$;

-- Copot policy DELETE yg ditambah migrasi 18 — balik ke "tanpa policy DELETE
-- sama sekali" (pertahanan berlapis, spt semula).
DROP POLICY IF EXISTS "trx_delete" ON transaksi_bmd;

-- ── Perbaikan data yg SUDAH kena dampak bug (sebelum revert di atas berlaku) ─
-- Aset berstatus 'dihapus' asal pengadaan tapi TIDAK PUNYA baris ledger sama
-- sekali (yatim krn baris batal_pengadaan-nya sempat ikut terhapus oleh fitur
-- "Hapus Kontrak Sepenuhnya" yg buggy) → insert ULANG bukti batal_pengadaan-nya
-- (murni INSERT, sah di bawah append-only) supaya Daftar Barang/Penyusutan
-- kembali menyembunyikannya lewat replay SEMBUNYI seperti seharusnya.
INSERT INTO transaksi_bmd (aset_id, jenis, periode, tanggal, nilai, header_id, payload, keterangan)
SELECT a.id, 'batal_pengadaan', fn_periode_dari_tanggal(a.tgl_perolehan), a.tgl_perolehan, 0, NULL,
       '{}'::jsonb, 'Perbaikan data: pulihkan jejak ledger yang hilang akibat bug "Hapus Kontrak Sepenuhnya" (migrasi 17/18)'
FROM aset a
WHERE a.status = 'dihapus'
  AND a.cara_perolehan = 'pengadaan'
  AND a.tgl_perolehan IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM transaksi_bmd t WHERE t.aset_id = a.id);
