-- ============================================================================
-- Drop tabel KDP/proyek konstruksi model per-termin (Opsi B) yang RETIRED.
--
-- Konteks: redesign 2026-07-13 memakai Opsi A — 1 kontrak konstruksi = 1 kartu
-- jurnal_header (kategori 'konstruksi') berisi array barang KDP di payload JSON;
-- approve/unapprove ATOMIK per kontrak (lib/kdp.ts approveKontrakKonstruksi /
-- unapproveKontrakKonstruksi). Tabel proyek_konstruksi/proyek_barang/
-- proyek_termin (migrasi 20260712_01..04) TIDAK PERNAH disambungkan ke UI mana
-- pun (dead) — migrasi 20260712_07 sudah me-"retire" tanpa drop. Dibuang di sini
-- untuk mengurangi permukaan bug & menghapus mekanisme approval ganda.
--
-- AMAN: guard di bawah MEMBATALKAN drop kalau tabelnya masih berisi data —
-- tinjau manual dulu kalau itu terjadi. Kalau tabel memang tak pernah dibuat di
-- DB ini, DROP ... IF EXISTS jadi no-op.
--
-- Model ledger TIDAK berubah: event akumulasi_kdp / batal_akumulasi_kdp tetap
-- ada (dipakai Opsi A), enum-nya tidak di-drop.
-- ============================================================================
DO $$
DECLARE n bigint;
BEGIN
  IF to_regclass('public.proyek_termin') IS NOT NULL THEN
    EXECUTE 'select count(*) from proyek_termin' INTO n;
    IF n > 0 THEN RAISE EXCEPTION 'proyek_termin berisi % baris — drop dibatalkan; tinjau data dulu.', n; END IF;
  END IF;
  IF to_regclass('public.proyek_barang') IS NOT NULL THEN
    EXECUTE 'select count(*) from proyek_barang' INTO n;
    IF n > 0 THEN RAISE EXCEPTION 'proyek_barang berisi % baris — drop dibatalkan; tinjau data dulu.', n; END IF;
  END IF;
  IF to_regclass('public.proyek_konstruksi') IS NOT NULL THEN
    EXECUTE 'select count(*) from proyek_konstruksi' INTO n;
    IF n > 0 THEN RAISE EXCEPTION 'proyek_konstruksi berisi % baris — drop dibatalkan; tinjau data dulu.', n; END IF;
  END IF;
END $$;

DROP TABLE IF EXISTS proyek_termin CASCADE;
DROP TABLE IF EXISTS proyek_barang CASCADE;
DROP TABLE IF EXISTS proyek_konstruksi CASCADE;
