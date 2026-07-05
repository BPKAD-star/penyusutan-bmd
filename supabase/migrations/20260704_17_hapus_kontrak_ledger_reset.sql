-- 20260704_17_hapus_kontrak_ledger_reset.sql
-- Escape hatch SEMPIT ke prinsip append-only: izinkan DELETE (bukan UPDATE —
-- itu tetap terlarang mutlak, tanpa pengecualian) baris transaksi_bmd HANYA
-- kalau SEMUA syarat berikut kepenuhi:
--   1. jenis = 'pengadaan' atau 'batal_pengadaan',
--   2. header_id terisi (bukan NULL) DAN jurnal_header terkait berstatus
--      'pending' (bukan 'disetujui' — ledger yg masih dilaporkan tetap
--      permanen seperti biasa),
--   3. aset yg dirujuk sudah soft-deleted (status='dihapus').
-- Skenario yg diizinkan: kontrak Pengadaan yg PERNAH disetujui lalu dibuka
-- kunci (unapprove → semua barangnya sudah batal_pengadaan/dihapus), dan
-- user ingin membuang kontrak itu SEPENUHNYA (No SK/BAST bisa dipakai ulang)
-- alih-alih menyetujuinya lagi. Tabel `aset` TIDAK ikut terhapus (baris
-- soft-deleted itu tetap ada, cuma jadi "yatim" tanpa jejak ledger — sama
-- seperti barang yg dihapus lewat menu Penghapusan biasa, datanya tak pernah
-- betul-betul hilang). Pola ini berlaku juga utk menu Cara Perolehan lain
-- (Hibah/Hasil Inventarisasi/Perolehan Lainnya) kalau nanti dibuatkan alur
-- draft-approve serupa — lihat CLAUDE.md.

-- ── 1. Backfill header_id utk baris batal_pengadaan LAMA ────────────────────
-- Sebelum migrasi ini, unapproveHeader tidak menyertakan header_id pada baris
-- reversal (batal_pengadaan) — perlu diisi dulu (dicocokkan lewat aset_id yg
-- sama dgn baris 'pengadaan' aslinya) supaya trigger baru bisa mengenalinya.
ALTER TABLE transaksi_bmd DISABLE TRIGGER trg_transaksi_bmd_immutable;
UPDATE transaksi_bmd t
SET header_id = p.header_id
FROM transaksi_bmd p
WHERE t.jenis = 'batal_pengadaan'
  AND t.header_id IS NULL
  AND p.jenis = 'pengadaan'
  AND p.aset_id = t.aset_id
  AND p.header_id IS NOT NULL;
ALTER TABLE transaksi_bmd ENABLE TRIGGER trg_transaksi_bmd_immutable;

-- ── 2. Trigger baru ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_transaksi_bmd_immutable() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_approval_status text;
  v_aset_status     text;
BEGIN
  IF TG_OP = 'DELETE' AND OLD.jenis IN ('pengadaan', 'batal_pengadaan') AND OLD.header_id IS NOT NULL THEN
    SELECT approval_status INTO v_approval_status FROM jurnal_header WHERE id = OLD.header_id;
    SELECT status INTO v_aset_status FROM aset WHERE id = OLD.aset_id;
    IF v_approval_status = 'pending' AND v_aset_status = 'dihapus' THEN
      RETURN OLD; -- diizinkan: kontrak sudah dibuka-kunci & barangnya sudah soft-deleted
    END IF;
  END IF;
  RAISE EXCEPTION 'transaksi_bmd bersifat append-only: % dilarang. Buat transaksi koreksi baru.', TG_OP;
END $$;
