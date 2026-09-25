-- ============================================================================
-- IPA — Aset idle di indikator Ekonomi DIPERSEMPIT (keputusan user 2026-09-25)
--
-- Semula aset idle = SELURUH Aset Lain-Lain "tidak digunakan dalam operasional
-- pemerintah" (1.5.4.01.01.02.*: tanah, P&M, gedung, JIJ, ATL, KDP). Sekarang
-- HANYA dua kode yang memang bisa menghasilkan pendapatan lewat pemanfaatan:
--   1.5.4.01.01.02.001  Tanah yang tidak digunakan dalam operasional pemerintah
--   1.5.4.01.01.02.003  Gedung & Bangunan yang tidak digunakan dalam operasional
-- Berlaku di pembilang (perjanjian pemanfaatan yang memuat barang itu) DAN
-- penyebut (nilai perolehannya) — kalau cuma satu sisi, rasionya tak berarti.
--
-- Text-surgery atas definisi HIDUP `fn_ipa_hitung_otomatis` (pola 20260914_03),
-- bukan menulis ulang badannya: `SET work_mem` & perubahan 20260925_03e ikut
-- terbawa. Penjaga di bawah menolak kalau polanya tak ditemukan TEPAT dua kali.
--
-- Sesudah dijalankan: Dashboard IPA → "Hitung Ulang Otomatis" (admin) supaya
-- snapshot bulan berjalan memakai definisi baru.
-- ============================================================================
DO $$
DECLARE
  d  text;
  d2 text;
  n  int;
BEGIN
  d := pg_get_functiondef('fn_ipa_hitung_otomatis(int, bigint)'::regprocedure);
  n := (length(d) - length(replace(d, 'x.kode LIKE ''1.5.4.01.01.02.%''', ''))) / length('x.kode LIKE ''1.5.4.01.01.02.%''');
  IF n <> 2 THEN
    RAISE EXCEPTION 'Pola aset idle ditemukan % kali (harus 2) — definisi fungsi tak sesuai harapan, migrasi dibatalkan.', n;
  END IF;
  d2 := replace(d, 'x.kode LIKE ''1.5.4.01.01.02.%''',
                   'x.kode IN (''1.5.4.01.01.02.001'', ''1.5.4.01.01.02.003'')');
  EXECUTE d2;
END $$;

UPDATE ipa_indikator
SET keterangan = 'Aset idle = Aset Lain-Lain berupa Tanah (1.5.4.01.01.02.001) dan Gedung & Bangunan (1.5.4.01.01.02.003) yang tidak digunakan dalam operasional pemerintah. Pendapatan = nilai perjanjian pemanfaatan berpendapatan ÷ masa tahun.'
WHERE kode = 'EKO_IDLE';

-- Pemeriksaan: setelan work_mem harus tetap ada & pola lama sudah tak tersisa.
DO $$
DECLARE d text; cfg text[];
BEGIN
  d := pg_get_functiondef('fn_ipa_hitung_otomatis(int, bigint)'::regprocedure);
  SELECT proconfig INTO cfg FROM pg_proc WHERE oid = 'fn_ipa_hitung_otomatis(int, bigint)'::regprocedure;
  IF position('1.5.4.01.01.02.%' IN d) > 0 THEN RAISE EXCEPTION 'pola lama masih tersisa'; END IF;
  IF NOT ('work_mem=64MB' = ANY (cfg)) THEN RAISE EXCEPTION 'work_mem hilang dari fungsi'; END IF;
END $$;
