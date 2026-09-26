-- ============================================================================
-- IPA — KDP (1.3.6): tukar wajib Merek/Tipe ↔ Luas di INT_KELENGKAPAN
-- (keputusan user 2026-09-26)
--
-- KDP (Pekerjaan Konstruksi) selama ini WAJIB mengisi Merek/Tipe padahal form
-- entry-nya (`KDP_KONSTRUKSI_FIELDS`, lib/asetFields.ts) TIDAK PERNAH
-- menawarkan field itu — barang KDP tak bisa mencapai 100% Kelengkapan Data
-- walau seluruh yang BISA diisi sudah terisi. Sebaliknya Luas — yang memang
-- ADA & DIMINTA di form KDP ("Luas & lokasi TETAP ada... itu justru yang
-- dibutuhkan saat pekerjaan berjalan", komentar KDP_KONSTRUKSI_FIELDS) — sama
-- sekali tak ditagih. Golongan lain (Tanah/PM/Gedung/JIJ/ATL/ATB/Aset
-- Lain-Lain) TIDAK berubah — swap ini KHUSUS 1.3.6.
--
-- Text-surgery atas definisi HIDUP (pola 20260914_03/20260925_05), BUKAN
-- menulis ulang badannya dari berkas migrasi. 20260925_05 sudah membuktikan
-- kelasnya: berkas `20260925_03_ipa_lima_aspek.sql` di repo BASI begitu
-- fungsinya dipatch lewat text-surgery — menyalin ulang dari file akan
-- MENGEMBALIKAN aset idle ke bentuk lama (1.5.4.01.01.02.%) tanpa satu pun
-- error. `pg_get_functiondef` membawa `SET work_mem` & seluruh patch
-- sebelumnya apa adanya.
--
-- Dua fungsi WAJIB diubah BERSAMAAN — predikatnya sengaja "kembar":
--   fn_ipa_hitung_otomatis  → skor snapshot bulanan
--   fn_ipa_rincian          → daftar per-barang di pop-up 👁 (20260926_01)
--
-- Sesudah dijalankan: Dashboard IPA → "Hitung Ulang Otomatis" (admin) supaya
-- snapshot bulan berjalan memakai definisi baru — barisnya lama tetap memakai
-- angka lama sampai dihitung ulang (bukan bug, sama pola dgn 20260925_05).
-- ============================================================================

-- ── fn_ipa_hitung_otomatis ───────────────────────────────────────────────────
DO $$
DECLARE
  d  text;
  d2 text;
  nm int;
  nl int;
BEGIN
  d := pg_get_functiondef('fn_ipa_hitung_otomatis(int, bigint)'::regprocedure);
  nm := (length(d) - length(replace(d, 'x.golongan IN (''1.3.2'',''1.3.5'',''1.3.6'',''1.5.3'',''1.5.4'') AS merek,', '')))
        / length('x.golongan IN (''1.3.2'',''1.3.5'',''1.3.6'',''1.5.3'',''1.5.4'') AS merek,');
  nl := (length(d) - length(replace(d, 'x.golongan IN (''1.3.1'',''1.3.3'',''1.3.4'') AS luas,', '')))
        / length('x.golongan IN (''1.3.1'',''1.3.3'',''1.3.4'') AS luas,');
  IF nm <> 1 OR nl <> 1 THEN
    RAISE EXCEPTION 'fn_ipa_hitung_otomatis: pola merek/luas ditemukan % / % kali (harus 1/1) — definisi tak sesuai harapan, migrasi dibatalkan.', nm, nl;
  END IF;
  d2 := replace(d, 'x.golongan IN (''1.3.2'',''1.3.5'',''1.3.6'',''1.5.3'',''1.5.4'') AS merek,',
                   'x.golongan IN (''1.3.2'',''1.3.5'',''1.5.3'',''1.5.4'') AS merek,');
  d2 := replace(d2, 'x.golongan IN (''1.3.1'',''1.3.3'',''1.3.4'') AS luas,',
                    'x.golongan IN (''1.3.1'',''1.3.3'',''1.3.4'',''1.3.6'') AS luas,');
  EXECUTE d2;
END $$;

-- ── fn_ipa_rincian (predikat kembar, 20260926_01) ───────────────────────────
DO $$
DECLARE
  d  text;
  d2 text;
  nm int;
  nl int;
BEGIN
  d := pg_get_functiondef('fn_ipa_rincian(int, bigint, text, int)'::regprocedure);
  nm := (length(d) - length(replace(d, 'x.golongan IN (''1.3.2'',''1.3.5'',''1.3.6'',''1.5.3'',''1.5.4'') AS merek,', '')))
        / length('x.golongan IN (''1.3.2'',''1.3.5'',''1.3.6'',''1.5.3'',''1.5.4'') AS merek,');
  nl := (length(d) - length(replace(d, 'x.golongan IN (''1.3.1'',''1.3.3'',''1.3.4'') AS luas,', '')))
        / length('x.golongan IN (''1.3.1'',''1.3.3'',''1.3.4'') AS luas,');
  IF nm <> 1 OR nl <> 1 THEN
    RAISE EXCEPTION 'fn_ipa_rincian: pola merek/luas ditemukan % / % kali (harus 1/1) — definisi tak sesuai harapan, migrasi dibatalkan.', nm, nl;
  END IF;
  d2 := replace(d, 'x.golongan IN (''1.3.2'',''1.3.5'',''1.3.6'',''1.5.3'',''1.5.4'') AS merek,',
                   'x.golongan IN (''1.3.2'',''1.3.5'',''1.5.3'',''1.5.4'') AS merek,');
  d2 := replace(d2, 'x.golongan IN (''1.3.1'',''1.3.3'',''1.3.4'') AS luas,',
                    'x.golongan IN (''1.3.1'',''1.3.3'',''1.3.4'',''1.3.6'') AS luas,');
  EXECUTE d2;
END $$;

-- Deskripsi indikator ikut disebutkan tweak-nya, supaya layar Capaian SKPD
-- (yang menampilkan keterangan ini apa adanya di bawah nama indikator) tak
-- lagi bilang "luas (tanah/gedung/jalan)" padahal KDP kini ikut, & tak lagi
-- membiarkan pembaca menyimpulkan merek/tipe berlaku ke KDP.
UPDATE ipa_indikator
SET keterangan = 'Dihitung dari register hidup: spesifikasi nama barang, merk/tipe (Peralatan&Mesin/ATL/ATB/Aset Lain-Lain), spesifikasi lainnya, no polisi/rangka/mesin/BPKB (kendaraan bermotor), luas (tanah/gedung/jalan/KDP), wilayah, alamat, titik koordinat, kondisi, penggunaan, keterangan, foto.'
WHERE kode = 'INT_KELENGKAPAN';

-- Pemeriksaan: pola baru ada TEPAT sekali di kedua fungsi, pola lama hilang
-- total, & work_mem tetap terpasang (CREATE OR REPLACE lewat EXECUTE definisi
-- utuh mempertahankannya — ini cuma jaring pengaman kalau asumsi itu meleset).
DO $$
DECLARE d text; cfg text[];
BEGIN
  d := pg_get_functiondef('fn_ipa_hitung_otomatis(int, bigint)'::regprocedure);
  IF position('''1.3.2'',''1.3.5'',''1.3.6'',''1.5.3'',''1.5.4'') AS merek' IN d) > 0 THEN
    RAISE EXCEPTION 'fn_ipa_hitung_otomatis: pola merek lama masih tersisa'; END IF;
  IF position('''1.3.1'',''1.3.3'',''1.3.4'') AS luas' IN d) > 0 THEN
    RAISE EXCEPTION 'fn_ipa_hitung_otomatis: pola luas lama masih tersisa'; END IF;
  IF position('''1.3.2'',''1.3.5'',''1.5.3'',''1.5.4'') AS merek' IN d) = 0 THEN
    RAISE EXCEPTION 'fn_ipa_hitung_otomatis: pola merek baru tidak ditemukan'; END IF;
  IF position('''1.3.1'',''1.3.3'',''1.3.4'',''1.3.6'') AS luas' IN d) = 0 THEN
    RAISE EXCEPTION 'fn_ipa_hitung_otomatis: pola luas baru tidak ditemukan'; END IF;
  SELECT proconfig INTO cfg FROM pg_proc WHERE oid = 'fn_ipa_hitung_otomatis(int, bigint)'::regprocedure;
  IF NOT ('work_mem=64MB' = ANY (cfg)) THEN RAISE EXCEPTION 'work_mem hilang dari fn_ipa_hitung_otomatis'; END IF;

  d := pg_get_functiondef('fn_ipa_rincian(int, bigint, text, int)'::regprocedure);
  IF position('''1.3.2'',''1.3.5'',''1.3.6'',''1.5.3'',''1.5.4'') AS merek' IN d) > 0 THEN
    RAISE EXCEPTION 'fn_ipa_rincian: pola merek lama masih tersisa'; END IF;
  IF position('''1.3.1'',''1.3.3'',''1.3.4'') AS luas' IN d) > 0 THEN
    RAISE EXCEPTION 'fn_ipa_rincian: pola luas lama masih tersisa'; END IF;
  IF position('''1.3.2'',''1.3.5'',''1.5.3'',''1.5.4'') AS merek' IN d) = 0 THEN
    RAISE EXCEPTION 'fn_ipa_rincian: pola merek baru tidak ditemukan'; END IF;
  IF position('''1.3.1'',''1.3.3'',''1.3.4'',''1.3.6'') AS luas' IN d) = 0 THEN
    RAISE EXCEPTION 'fn_ipa_rincian: pola luas baru tidak ditemukan'; END IF;
  SELECT proconfig INTO cfg FROM pg_proc WHERE oid = 'fn_ipa_rincian(int, bigint, text, int)'::regprocedure;
  IF NOT ('work_mem=64MB' = ANY (cfg)) THEN RAISE EXCEPTION 'work_mem hilang dari fn_ipa_rincian'; END IF;
END $$;
