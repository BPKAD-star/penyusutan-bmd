-- ============================================================================
-- Import Aset Lain-Lain (golongan 1.5.4) — TAHAP 2: materialisasi (2026-07-18).
-- Lanjutan 20260718_01 (stg_import_aset_lain_lain harus sudah terisi 1.958
-- baris, tervalidasi). Pola SAMA PERSIS dgn Peralatan & Mesin (20260716_03):
-- staging → aset_awal_2026 (baseline resmi) → aset (register) → transaksi_bmd
-- (ledger 'saldo_awal', periode 2025-S2, tanggal 2025-12-31 — retroaktif,
-- sudah di-whitelist migrasi 20260710_10).
--
-- ⚠️ BEDA dari P&M: intra_ekstra DIPERTAHANKAN dari file (COALESCE ke 'intra'
-- kalau kosong), TIDAK dihitung ulang dari batas_kapitalisasi — dikonfirmasi
-- user, golongan ini memang sengaja 100% intra (lihat catatan di 20260718_01).
--
-- ⚠️ SEMANTIK BEKU: kode yang ditulis = kode 1.5.4.x FINAL (dari file, bukan
-- kode asal sebelum reklas). Begitu baris ini ada di `aset` + ledger
-- 'saldo_awal', engine (lib/engine/penyusutan.ts:319-334) OTOMATIS tidak
-- pernah akrual lagi — nilai_buku_awal/akumulasi_2025 yang ditulis di sini
-- FROZEN SELAMANYA sampai ada reklas_golongan keluar dari 1.5.4. TIDAK ADA
-- perubahan kode engine di migrasi ini — sudah tertangani oleh guard yang
-- sudah ada. sisa_masa_manfaat_smt/beban_penyusutan_per_smt boleh NULL
-- (97% baris file memang kosong) — field ini tidak pernah dipakai lagi
-- untuk hitungan begitu golongan=1.5.4 (guard blok sebelum sampai ke situ).
--
-- ⚠️ WAJIB jalankan BLOK VERIFIKASI PRA-SYARAT di bawah DULU — termasuk
-- spot-check dobel-hitung (1.868 dari 1.958 baris nama_barang-nya menyebut
-- "Kode Asal: 1.3.x..." — indikasi barang ini fisiknya sama dgn yg tadinya
-- golongan lain, TAPI NIBAR beda krn di-generate ulang khusus 1.5.4). User
-- sudah konfirmasi (2026-07-18) file sumber e-BMD SUDAH mengeluarkan barang
-- ini dari daftar golongan lamanya (tidak dobel) — blok ini jaring pengaman
-- terakhir sebelum data live ke-insert, BUKAN prasangka bahwa itu salah.
-- ============================================================================

-- ============================================================================
-- ⚠️ VERIFIKASI PRA-SYARAT — jalankan SEMUA, baru lanjut ke STEP 1 kalau aman.
--
--   -- (a) skpd_id valid — HARUS 0 baris:
--   SELECT DISTINCT s.skpd_id FROM stg_import_aset_lain_lain s
--     LEFT JOIN admin_skpd sk ON sk.id = s.skpd_id WHERE sk.id IS NULL;
--
--   -- (b) kode valid — HARUS 0 baris:
--   SELECT DISTINCT s.kode FROM stg_import_aset_lain_lain s
--     LEFT JOIN admin_kodefikasi_bmd k ON k.kode = s.kode WHERE k.kode IS NULL;
--
--   -- (c) Baseline SEBELUM (buat dibandingkan sesudah):
--   SELECT count(*) AS lain_lain_sebelum FROM aset WHERE kode LIKE '1.5.4%';
--
--   -- (d) SPOT-CHECK DOBEL-HITUNG: barang "Kode Asal" yg nilai+tgl+skpd IDENTIK
--   -- ke aset AKTIF golongan LAIN (indikasi masih ada dobel di golongan asal).
--   -- Kalau hasilnya BANYAK/besar nilainya, STOP dulu, cek manual sebelum
--   -- lanjut STEP 2/3 — bisa jadi barang ini belum bener2 dikeluarkan dari
--   -- golongan asalnya di e-BMD.
--   SELECT s.nibar AS nibar_baru, s.nama_barang, s.skpd_id, s.nilai_perolehan,
--          s.tgl_perolehan, a.nibar AS nibar_dicurigai_dobel, a.kode AS kode_lama
--     FROM stg_import_aset_lain_lain s
--     JOIN aset a ON a.status = 'aktif' AND a.kode NOT LIKE '1.5.4%'
--       AND a.nilai_perolehan = s.nilai_perolehan
--       AND a.tgl_perolehan = s.tgl_perolehan
--       AND a.skpd_id = s.skpd_id
--     WHERE s.nama_barang LIKE '%Kode Asal%'
--     ORDER BY s.nilai_perolehan DESC LIMIT 50;
-- ============================================================================

-- ── STEP 1: staging → aset_awal_2026 (baseline, intra_ekstra dari file) ─────
INSERT INTO aset_awal_2026 (
  nibar, kode, nama_barang, skpd_id, nilai_perolehan, intra_ekstra, tgl_perolehan,
  masa_manfaat_smt, akumulasi_2025, nilai_buku_awal, sisa_masa_manfaat_smt,
  beban_penyusutan_per_smt, spesifikasi_lainnya, merek_tipe, no_polisi, no_bpkb,
  no_rangka, no_mesin, luas, nomor_dokumen_kepemilikan, tanggal_dokumen_kepemilikan,
  nama_dokumen_kepemilikan, jenis_hak, alamat_detail, uraian_barang, keterangan,
  jumlah, satuan, harga_satuan, penggunaan_pengamanan, asal_usul, tahun_pengadaan, golongan
)
SELECT
  s.nibar, s.kode, s.nama_barang, s.skpd_id, s.nilai_perolehan,
  COALESCE(NULLIF(s.intra_ekstra, ''), 'intra'),
  s.tgl_perolehan, s.masa_manfaat_smt, s.akumulasi_2025, s.nilai_buku_awal,
  s.sisa_masa_manfaat_smt, s.beban_penyusutan_per_smt,
  NULLIF(s.spesifikasi_lainnya, ''), NULLIF(s.merek_tipe, ''), NULLIF(s.no_polisi, ''),
  NULLIF(s.no_bpkb, ''), NULLIF(s.no_rangka, ''), NULLIF(s.no_mesin, ''), s.luas,
  NULLIF(s.nomor_dokumen_kepemilikan, ''), s.tanggal_dokumen_kepemilikan,
  NULLIF(s.nama_dokumen_kepemilikan, ''), NULLIF(s.jenis_hak, ''), NULLIF(s.alamat_detail, ''),
  COALESCE(NULLIF(s.uraian_barang, ''), s.kode), NULLIF(s.keterangan, ''),
  COALESCE(s.jumlah, 1), NULLIF(s.satuan, ''), s.harga_satuan,
  NULLIF(s.penggunaan_pengamanan, ''), NULLIF(s.asal_usul, ''), s.tahun_pengadaan, s.golongan
FROM stg_import_aset_lain_lain s
WHERE NOT EXISTS (SELECT 1 FROM aset_awal_2026 x WHERE x.nibar = s.nibar);

-- ── STEP 2: aset_awal_2026 → aset (register), dibatasi ke batch import ini ──
INSERT INTO aset (
  nibar, kode, nama_barang, nilai_perolehan, tgl_perolehan, skpd_id, intra_ekstra,
  cara_perolehan, status, jumlah, satuan, harga_satuan,
  spesifikasi_lainnya, merek_tipe, no_polisi, no_bpkb, no_rangka, no_mesin, luas,
  nomor_dokumen_kepemilikan, tanggal_dokumen_kepemilikan, nama_dokumen_kepemilikan, jenis_hak,
  alamat_detail, uraian_barang, keterangan, penggunaan_pengamanan, asal_usul, tahun_pengadaan
)
SELECT
  x.nibar, x.kode, x.nama_barang, x.nilai_perolehan, x.tgl_perolehan, x.skpd_id, x.intra_ekstra,
  'saldo_awal', 'aktif', x.jumlah, x.satuan, x.harga_satuan,
  x.spesifikasi_lainnya, x.merek_tipe, x.no_polisi, x.no_bpkb, x.no_rangka, x.no_mesin, x.luas,
  x.nomor_dokumen_kepemilikan, x.tanggal_dokumen_kepemilikan, x.nama_dokumen_kepemilikan, x.jenis_hak,
  x.alamat_detail, x.uraian_barang, x.keterangan, x.penggunaan_pengamanan, x.asal_usul, x.tahun_pengadaan
FROM aset_awal_2026 x
WHERE x.nibar IN (SELECT nibar FROM stg_import_aset_lain_lain)
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
         'sumber',                'Import Aset Lain Lain Lengkap.xlsx — backfill 2026-07-18'
       ),
       'Baseline — Aset Lain-Lain (1.5.4), beku sejak baseline (tidak akrual lagi)'
FROM aset a
JOIN aset_awal_2026 x ON x.nibar = a.nibar
WHERE a.cara_perolehan = 'saldo_awal'
  AND a.nibar IN (SELECT nibar FROM stg_import_aset_lain_lain)
  AND NOT EXISTS (SELECT 1 FROM transaksi_bmd t WHERE t.aset_id = a.id AND t.jenis = 'saldo_awal');

-- ============================================================================
-- VERIFIKASI AKHIR:
--   SELECT count(*) FROM aset_awal_2026 WHERE nibar IN (SELECT nibar FROM stg_import_aset_lain_lain);
--     -- HARUS 1958
--   SELECT count(*) FROM aset WHERE kode LIKE '1.5.4%';
--     -- kenaikan = jumlah baris yg beneran baru (bandingkan dgn lain_lain_sebelum)
--   SELECT count(*) FROM stg_import_aset_lain_lain s
--     LEFT JOIN aset a ON a.nibar = s.nibar WHERE a.id IS NULL;
--     -- HARUS 0 (semua nibar staging sudah terdaftar di aset)
--   SELECT count(*) FROM aset a
--     WHERE a.nibar IN (SELECT nibar FROM stg_import_aset_lain_lain)
--       AND NOT EXISTS (SELECT 1 FROM transaksi_bmd t WHERE t.aset_id=a.id AND t.jenis='saldo_awal');
--     -- HARUS 0 (tiap aset baru punya ledger saldo_awal)
--   SELECT intra_ekstra, count(*) FROM aset
--     WHERE nibar IN (SELECT nibar FROM stg_import_aset_lain_lain) GROUP BY 1;
--     -- harus 100% 'intra' (sesuai file, tidak dihitung ulang)
--   -- Spot-check tampil di Daftar Barang, dan penyusutan_semester TIDAK
--   -- akrual (beban selalu 0 tiap periode setelah baseline) begitu Engine dijalankan:
--   SELECT nibar, nama_barang, uraian_barang, skpd_id, nilai_perolehan, intra_ekstra
--     FROM aset WHERE kode LIKE '1.5.4%' AND cara_perolehan='saldo_awal' LIMIT 20;
-- ============================================================================
