-- ============================================================================
-- Import Peralatan dan Mesin (golongan 1.3.2) — TAHAP 2: materialisasi
-- (2026-07-16). Lanjutan `20260716_02_import_peralatan_mesin_staging.sql`
-- (stg_import_peralatan_mesin sudah terisi 218.251 baris, tervalidasi).
--
-- PRASYARAT (sudah dicek manual di SQL Editor sebelum menulis migrasi ini):
--   - SELECT count(*) FROM aset WHERE kode LIKE '1.3.2%';                → 18
--   - SELECT count(*) FROM stg_import_peralatan_mesin s
--       WHERE EXISTS (SELECT 1 FROM aset a WHERE a.nibar = s.nibar);     → 0
--     (0 overlap — 18 baris lama itu TIDAK ada satu pun yang cocok NIBAR-nya
--     dgn file ini, jadi nyaris seluruh 218.251 baris = insert baru murni.
--     Beda dari Tanah/Gedung/Jalan yang sebagian besar sudah ada & tinggal
--     dilengkapi.)
--   - Validasi skpd_id vs admin_skpd → 0 baris bermasalah.
--   - Validasi kode vs admin_kodefikasi_bmd → 0 baris bermasalah.
--
-- ⚠️ POLA BEDA dari Tanah/Gedung/Jalan/ATL (yang cuma nyentuh aset+transaksi_bmd):
-- migrasi ini pakai pola LAMA (persis ATB 20260704_08 / KDP 20260704_09) —
-- staging → aset_awal_2026 DULU (baseline resmi 31 Des 2025) → aset diturunkan
-- DARI aset_awal_2026 → transaksi_bmd ledger 'saldo_awal'. Ini yang diminta user
-- dari awal (3 tabel: aset, aset_awal_2026, transaksi_bmd), dan lebih tepat
-- secara arsitektur karena aset_awal_2026 memang dimaksudkan sbg "foto 31 Des
-- 2025" yang lengkap — bukan cuma cocok-cocokan sisa golongan yang sebagian
-- sudah dicover baseline asli (beda situasi dgn Tanah/Gedung/Jalan yang memang
-- cuma menambal data yang sudah 90%+ ada).
--
-- intra_ekstra: file sumber isinya 100% "Intra" di seluruh 218.251 baris —
-- dicurigai bukan hasil klasifikasi asli, jadi TIDAK dipakai. Dihitung ULANG
-- dari admin_kodefikasi_bmd.batas_kapitalisasi (sama logika klasifikasiKomptabel()
-- di lib/bmd.ts), sekali di STEP 1, lalu diwariskan apa adanya ke aset di STEP 2
-- (biar aset_awal_2026 & aset konsisten, tidak dihitung dua kali beda cara).
--
-- Ketiga step DIBATASI ke nibar yang ada di stg_import_peralatan_mesin (bukan
-- "semua orphan aset_awal_2026") — sengaja lebih ketat dari pola ATB, supaya
-- migrasi ini tidak tanpa sengaja ikut memproses baris orphan lain yang
-- kebetulan ada di aset_awal_2026 dari golongan/insiden lain yang tidak
-- berhubungan. Re-runnable (semua guard NOT EXISTS).
--
-- ⚠️ SETELAH INI SELESAI DAN TERVERIFIKASI: WAJIB jalankan "Jalankan Engine"
-- di menu Penyusutan (periode 2025-S2 s.d. periode berjalan) supaya
-- penyusutan_semester ke-generate utk 218 ribu aset baru ini. Golongan 1.3.2
-- disusutkan (beda dari ATL kemarin yg tidak).
-- ============================================================================

-- ── STEP 1: staging → aset_awal_2026 (baseline, intra_ekstra dihitung ulang) ─
INSERT INTO aset_awal_2026 (
  nibar, kode, nama_barang, skpd_id, nilai_perolehan, intra_ekstra, tgl_perolehan,
  masa_manfaat_smt, akumulasi_2025, nilai_buku_awal, sisa_masa_manfaat_smt,
  beban_penyusutan_per_smt, spesifikasi_lainnya, merek_tipe, no_polisi, no_bpkb,
  no_rangka, uraian_barang, jumlah, satuan, harga_satuan, asal_usul,
  kondisi_barang, tahun_pengadaan, golongan
)
SELECT
  s.nibar, s.kode, s.nama_barang, s.skpd_id, s.nilai_perolehan,
  CASE
    WHEN k.batas_kapitalisasi IS NULL THEN 'intra'
    WHEN s.nilai_perolehan / GREATEST(COALESCE(s.jumlah, 1), 1) >= k.batas_kapitalisasi THEN 'intra'
    ELSE 'ekstra'
  END,
  s.tgl_perolehan, s.masa_manfaat_smt, s.akumulasi_2025, s.nilai_buku_awal,
  s.sisa_masa_manfaat_smt, s.beban_penyusutan_per_smt,
  NULLIF(s.spesifikasi_lainnya, ''), NULLIF(s.merek_tipe, ''), NULLIF(s.no_polisi, ''),
  NULLIF(s.no_bpkb, ''), NULLIF(s.no_rangka, ''),
  COALESCE(NULLIF(s.uraian_barang, ''), s.kode),
  COALESCE(s.jumlah, 1), NULLIF(s.satuan, ''), s.harga_satuan,
  NULLIF(s.asal_usul, ''), NULLIF(s.kondisi_barang, ''), s.tahun_pengadaan, s.golongan
FROM stg_import_peralatan_mesin s
LEFT JOIN admin_kodefikasi_bmd k ON k.kode = s.kode
WHERE NOT EXISTS (SELECT 1 FROM aset_awal_2026 x WHERE x.nibar = s.nibar);

-- ── STEP 2: aset_awal_2026 → aset (register), dibatasi ke batch import ini ──
INSERT INTO aset (
  nibar, kode, nama_barang, nilai_perolehan, tgl_perolehan, skpd_id, intra_ekstra,
  cara_perolehan, status, jumlah, satuan, harga_satuan,
  spesifikasi_lainnya, merek_tipe, no_polisi, no_bpkb, no_rangka,
  uraian_barang, asal_usul, kondisi_barang, tahun_pengadaan
)
SELECT
  x.nibar, x.kode, x.nama_barang, x.nilai_perolehan, x.tgl_perolehan, x.skpd_id, x.intra_ekstra,
  'saldo_awal', 'aktif', x.jumlah, x.satuan, x.harga_satuan,
  x.spesifikasi_lainnya, x.merek_tipe, x.no_polisi, x.no_bpkb, x.no_rangka,
  x.uraian_barang, x.asal_usul, x.kondisi_barang, x.tahun_pengadaan
FROM aset_awal_2026 x
WHERE x.nibar IN (SELECT nibar FROM stg_import_peralatan_mesin)
  AND NOT EXISTS (SELECT 1 FROM aset a WHERE a.nibar = x.nibar);

-- ── STEP 3: ledger 'saldo_awal' (periode 2025-S2, tanggal 2025-12-31) ───────
INSERT INTO transaksi_bmd (aset_id, jenis, periode, tanggal, nilai, skpd_tujuan, payload, keterangan)
SELECT a.id, 'saldo_awal', '2025-S2', DATE '2025-12-31', a.nilai_perolehan, a.skpd_id,
       jsonb_build_object(
         'akumulasi_2025',        x.akumulasi_2025,
         'nilai_buku_awal',       x.nilai_buku_awal,
         'sisa_masa_manfaat_smt', x.sisa_masa_manfaat_smt,
         'masa_manfaat_smt',      x.masa_manfaat_smt,
         'beban_per_smt',         x.beban_penyusutan_per_smt,
         'sumber',                'Import Peralatan Mesin Lengkap.xlsx — backfill 2026-07-16'
       ),
       'Baseline — Peralatan dan Mesin (1.3.2)'
FROM aset a
JOIN aset_awal_2026 x ON x.nibar = a.nibar
WHERE a.cara_perolehan = 'saldo_awal'
  AND a.nibar IN (SELECT nibar FROM stg_import_peralatan_mesin)
  AND NOT EXISTS (SELECT 1 FROM transaksi_bmd t WHERE t.aset_id = a.id AND t.jenis = 'saldo_awal');

-- ============================================================================
-- VERIFIKASI AKHIR (jalankan berurutan, catat tiap angka):
--   SELECT count(*) FROM aset_awal_2026 WHERE nibar IN (SELECT nibar FROM stg_import_peralatan_mesin);
--     -- HARUS 218251
--   SELECT count(*) FROM aset WHERE kode LIKE '1.3.2%';
--     -- HARUS 18 + 218251 = 218269 (kecuali sebagian dari 18 lama ternyata
--     -- bukan '1.3.2%' murni / ada anomali kode — cek manual kalau meleset)
--   SELECT count(*) FROM stg_import_peralatan_mesin s
--     LEFT JOIN aset a ON a.nibar = s.nibar WHERE a.id IS NULL;
--     -- HARUS 0 (semua nibar staging sudah terdaftar di aset)
--   SELECT count(*) FROM aset a
--     WHERE a.nibar IN (SELECT nibar FROM stg_import_peralatan_mesin)
--       AND NOT EXISTS (SELECT 1 FROM transaksi_bmd t WHERE t.aset_id=a.id AND t.jenis='saldo_awal');
--     -- HARUS 0 (tiap aset baru punya ledger saldo_awal)
--   SELECT intra_ekstra, count(*) FROM aset
--     WHERE nibar IN (SELECT nibar FROM stg_import_peralatan_mesin) GROUP BY 1;
--     -- cek distribusi intra/ekstra hasil hitung ulang (harusnya TIDAK 100% intra
--     -- lagi kalau ada barang di bawah batas_kapitalisasi)
--   -- Spot-check tampil di Daftar Barang (golongan 1.3.2):
--   SELECT nibar, nama_barang, uraian_barang, skpd_id, nilai_perolehan, intra_ekstra
--     FROM aset WHERE kode LIKE '1.3.2%' AND cara_perolehan='saldo_awal' LIMIT 20;
-- ============================================================================
