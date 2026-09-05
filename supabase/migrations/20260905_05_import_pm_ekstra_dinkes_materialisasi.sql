-- ============================================================================
-- Import P&M EKSTRAKOMPTABEL 2025 — DINAS KESEHATAN (1.3.2) — TAHAP 2:
-- materialisasi (2026-09-05). Lanjutan 20260905_04.
--
-- Alur: stg_import_pm_ekstra_dinkes → aset_awal_2026 → aset → transaksi_bmd
-- ('saldo_awal', periode 2025-S2, tanggal 2025-12-31).
--
-- ⚠️ ENGINE WAJIB DI-RUN ULANG SESUDAH MIGRASI INI (langkah 4 di kaki berkas).
-- Tanpa itu 22.795 barang ini TIDAK punya baris `penyusutan_semester` 2026 sama
-- sekali — Penyusutan & Laporan BMD menampilkannya dgn akumulasi 0 & nilai buku
-- = nilai perolehan: SALAH tapi tidak error.
--
-- Angka penyusutan diambil APA ADANYA dari berkas (sudah dibulatkan 2 desimal
-- di TAHAP 1), TIDAK dihitung ulang — alasan yang sama dgn checkpoint Tutup
-- Tahun & `checkpointBekas`: angka yang sudah masuk neraca tak boleh ikut
-- bergerak kalau kelak masa manfaat kodefikasi berubah.
-- ============================================================================

-- ============================================================================
-- ⚠️ VERIFIKASI PRA-SYARAT — jalankan SEMUA, aman baru lanjut STEP 1.
-- URUTAN: (a)…(f) → STEP 1 → STEP 2 → verifikasi → STEP 3 → run engine.
--
--   -- (a) staging terisi utuh & kepala NIBAR seragam:
--   SELECT count(*) AS baris, count(DISTINCT nibar) AS nibar_unik
--     FROM stg_import_pm_ekstra_dinkes;                      -- 22795 / 22795
--   SELECT left(nibar,8) AS kepala, count(*) FROM stg_import_pm_ekstra_dinkes
--     GROUP BY 1;                                  -- TEPAT SATU baris: 12023506
--   -- kalau muncul kepala lain / jumlahnya bukan 22795 → CSV yang ter-upload
--   -- bukan yang benar. JANGAN lanjut; TRUNCATE & import ulang (20260905_04).
--
--   -- (b) skpd_id valid — HARUS 0 baris (sudah dicek di muka: 40/40 valid):
--   SELECT DISTINCT s.skpd_id FROM stg_import_pm_ekstra_dinkes s
--     LEFT JOIN admin_skpd sk ON sk.id = s.skpd_id WHERE sk.id IS NULL;
--
--   -- (c) kode barang valid — HARUS 0 baris. ⚠️ INI SATU-SATUNYA PEMERIKSAAN
--   --     PRA-SYARAT YANG BELUM SEMPAT DIJALANKAN DI MUKA (388 kode berbeda);
--   --     kalau ada yang keluar, JANGAN lanjut — kode tak terdaftar akan
--   --     ditolak FK `aset_kode_fkey` di tengah STEP 2 & meninggalkan
--   --     aset_awal_2026 terisi sebagian:
--   SELECT DISTINCT s.kode FROM stg_import_pm_ekstra_dinkes s
--     LEFT JOIN admin_kodefikasi_bmd k ON k.kode = s.kode WHERE k.kode IS NULL;
--
--   -- (d) tabrakan NIBAR — HARUS 0 & 0. Sudah dibuktikan tuntas di muka
--   --     (47 NIBAR DB berprefix sama, semuanya segmen kode 133/Gedung; 0 yang
--   --     sama persis dgn berkas). Ini pembuktian ULANG terhadap isi staging
--   --     yang benar-benar ter-upload — pelajaran 20260819_02, NIBAR bisa
--   --     berpindah pemilik & uji "NOT EXISTS" menelan kasus itu diam-diam:
--   SELECT (SELECT count(*) FROM stg_import_pm_ekstra_dinkes s JOIN aset a ON a.nibar=s.nibar) AS bentrok_aset,
--          (SELECT count(*) FROM stg_import_pm_ekstra_dinkes s JOIN aset_awal_2026 x ON x.nibar=s.nibar) AS bentrok_snapshot;
--   -- kalau > 0, LIHAT ISINYA dulu (barang yang sama, atau NIBAR dipakai ulang?):
--   SELECT s.nibar, s.kode AS kode_file, a.kode AS kode_db,
--          s.nilai_perolehan AS nilai_file, a.nilai_perolehan AS nilai_db,
--          s.tgl_perolehan AS tgl_file, a.tgl_perolehan AS tgl_db
--     FROM stg_import_pm_ekstra_dinkes s JOIN aset a ON a.nibar = s.nibar LIMIT 50;
--
--   -- (e) baseline SEBELUM — CATAT, dibandingkan di verifikasi akhir:
--   SELECT intra_ekstra, count(*) AS n, round(sum(nilai_perolehan)) AS nilai
--     FROM aset WHERE golongan='1.3.2' AND status <> 'draft' GROUP BY 1;
--   -- per 2026-09-05: intra 218.305 / Rp1.369.667.160.256
--   --                 ekstra  28.503 / Rp4.890.172.587  (28.502 batch
--   --                 20260904 + 1 entri uji "Lap Top" Rp50.000)
--   SELECT count(*) FROM aset WHERE golongan='1.3.2' AND intra_ekstra='ekstra'
--     AND status <> 'draft' AND skpd_id IN (3,142,144,145,146,147,148,149,150,
--     151,152,153,154,155,156,157,158,159,160,161,162,163,164,165,166,167,168,
--     169,170,171,172,173,174,175,176,177,178,179,180,181);            -- 0
--
--   -- (f) sisa disk (CLAUDE.md: backfill besar pernah mendorong disk 54%→96%
--   --     → project READ-ONLY → seluruh app mati). Per 2026-09-05: 1534 MB.
--   SELECT pg_size_pretty(pg_database_size(current_database())) AS ukuran_db;
-- ============================================================================

-- ── STEP 1: staging → aset_awal_2026 ────────────────────────────────────────
INSERT INTO aset_awal_2026 (
  nibar, kode, nama_barang, skpd_id, nilai_perolehan, intra_ekstra, tgl_perolehan,
  masa_manfaat_smt, akumulasi_2025, nilai_buku_awal, sisa_masa_manfaat_smt,
  beban_penyusutan_per_smt, spesifikasi_lainnya, merek_tipe,
  no_polisi, no_bpkb, no_rangka, no_mesin,
  uraian_barang, keterangan, jumlah, satuan, harga_satuan,
  penggunaan_pengamanan, asal_usul, kondisi_barang, tahun_pengadaan, golongan
)
SELECT
  s.nibar, s.kode, s.nama_barang, s.skpd_id, s.nilai_perolehan,
  s.intra_ekstra, s.tgl_perolehan,
  s.masa_manfaat_smt, s.akumulasi_2025, s.nilai_buku_awal, s.sisa_masa_manfaat_smt,
  s.beban_penyusutan_per_smt,
  NULLIF(s.spesifikasi_lainnya, ''), NULLIF(s.merek_tipe, ''),
  NULLIF(s.no_polisi, ''), NULLIF(s.no_bpkb, ''), NULLIF(s.no_rangka, ''), NULLIF(s.no_mesin, ''),
  COALESCE(NULLIF(s.uraian_barang, ''), s.kode), NULLIF(s.keterangan, ''),
  COALESCE(s.jumlah, 1), NULLIF(s.satuan, ''), s.harga_satuan,
  NULLIF(s.penggunaan_pengamanan, ''), NULLIF(s.asal_usul, ''),
  NULLIF(s.kondisi_barang, ''), s.tahun_pengadaan, s.golongan
FROM stg_import_pm_ekstra_dinkes s
WHERE NOT EXISTS (SELECT 1 FROM aset_awal_2026 x WHERE x.nibar = s.nibar);

-- ── STEP 2: aset_awal_2026 → aset (dibatasi ke batch ini) ───────────────────
-- ⚠️ `cara_perolehan = 'saldo_awal'` (baseline), BUKAN diturunkan dari kolom
-- `asal_usul` berkas ("Pengadaan APBD"/"Hibah"/"Perolehan Lainnya"). Dua kolom
-- BERBEDA & sengaja tidak disinkronkan — CLAUDE.md.
-- ⚠️ Trigger `trg_aset_kode_register` menerbitkan `kode_register` otomatis di
-- sini (butuh skpd_id, kode, intra_ekstra, tgl_perolehan — keempatnya diisi).
INSERT INTO aset (
  nibar, kode, nama_barang, nilai_perolehan, tgl_perolehan, skpd_id, intra_ekstra,
  cara_perolehan, status, jumlah, satuan, harga_satuan,
  spesifikasi_lainnya, merek_tipe, no_polisi, no_bpkb, no_rangka, no_mesin,
  uraian_barang, keterangan, penggunaan_pengamanan, asal_usul, kondisi_barang, tahun_pengadaan
)
SELECT
  x.nibar, x.kode, x.nama_barang, x.nilai_perolehan, x.tgl_perolehan, x.skpd_id, x.intra_ekstra,
  'saldo_awal', 'aktif', x.jumlah, x.satuan, x.harga_satuan,
  x.spesifikasi_lainnya, x.merek_tipe, x.no_polisi, x.no_bpkb, x.no_rangka, x.no_mesin,
  x.uraian_barang, x.keterangan, x.penggunaan_pengamanan, x.asal_usul, x.kondisi_barang, x.tahun_pengadaan
FROM aset_awal_2026 x
WHERE x.nibar IN (SELECT nibar FROM stg_import_pm_ekstra_dinkes)
  AND NOT EXISTS (SELECT 1 FROM aset a WHERE a.nibar = x.nibar);

-- ── STEP 3: ledger 'saldo_awal' (2025-S2, 2025-12-31) ───────────────────────
-- ⚠️ JALANKAN HANYA SESUDAH STEP 1 & 2 diverifikasi — sesudah ini barisnya
-- PERMANEN (lihat blok ROLLBACK di kaki berkas).
-- Payload BENTUKNYA SAMA PERSIS dgn batch P&M intra (20260716_01) & batch
-- ekstra 20260904_02 — engine membaca kelima kunci itu lewat cabang
-- `saldo_awal` di `hitungJadwalAset`.
INSERT INTO transaksi_bmd (aset_id, jenis, periode, tanggal, nilai, skpd_tujuan, payload, keterangan)
SELECT a.id, 'saldo_awal', '2025-S2', DATE '2025-12-31', a.nilai_perolehan, a.skpd_id,
       jsonb_build_object(
         'akumulasi_2025',        x.akumulasi_2025,
         'nilai_buku_awal',       x.nilai_buku_awal,
         'sisa_masa_manfaat_smt', x.sisa_masa_manfaat_smt,
         'masa_manfaat_smt',      x.masa_manfaat_smt,
         'beban_per_smt',         x.beban_penyusutan_per_smt,
         'sumber',                'Import PM Ekstrakom 2025 Dinkes.xlsx — backfill 2026-09-05'
       ),
       'Baseline — Peralatan dan Mesin (1.3.2) ekstrakomptabel Dinas Kesehatan'
FROM aset a
JOIN aset_awal_2026 x ON x.nibar = a.nibar
WHERE a.cara_perolehan = 'saldo_awal'
  AND a.nibar IN (SELECT nibar FROM stg_import_pm_ekstra_dinkes)
  AND NOT EXISTS (SELECT 1 FROM transaksi_bmd t WHERE t.aset_id = a.id AND t.jenis = 'saldo_awal');

-- ============================================================================
-- VERIFIKASI AKHIR (jalankan semua):
--
--   -- 1. ketiga tabel terisi & tak ada yang tertinggal:
--   SELECT count(*) FROM aset_awal_2026
--     WHERE nibar IN (SELECT nibar FROM stg_import_pm_ekstra_dinkes);             -- 22795
--   SELECT count(*) FROM stg_import_pm_ekstra_dinkes s
--     LEFT JOIN aset a ON a.nibar = s.nibar WHERE a.id IS NULL;                   -- 0
--   SELECT count(*) FROM aset a WHERE a.nibar IN (SELECT nibar FROM stg_import_pm_ekstra_dinkes)
--     AND NOT EXISTS (SELECT 1 FROM transaksi_bmd t WHERE t.aset_id=a.id AND t.jenis='saldo_awal'); -- 0
--
--   -- 2. keranjang 1.3.2 sesudahnya — intra TIDAK BERGESER SEDIKIT PUN:
--   SELECT intra_ekstra, count(*) AS n, round(sum(nilai_perolehan)) AS nilai
--     FROM aset WHERE golongan='1.3.2' AND status <> 'draft' GROUP BY 1;
--   -- HARUS: intra  218.305 / 1.369.667.160.256  (SAMA PERSIS dgn pra-syarat (e))
--   --        ekstra  51.298 / 7.688.652.056
--   --                (28.503 + 22.795 baris; 4.890.172.587 + 2.798.479.469)
--
--   -- 3. angka baseline utuh sampai ke ledger (keempatnya HARUS 0):
--   SELECT count(*) FILTER (WHERE (t.payload->>'akumulasi_2025')::numeric <> x.akumulasi_2025)          AS a,
--          count(*) FILTER (WHERE (t.payload->>'masa_manfaat_smt')::int   <> x.masa_manfaat_smt)         AS b,
--          count(*) FILTER (WHERE (t.payload->>'beban_per_smt')::numeric  <> x.beban_penyusutan_per_smt) AS c,
--          count(*) FILTER (WHERE t.nilai <> x.nilai_perolehan)                                          AS d
--     FROM transaksi_bmd t JOIN aset a ON a.id=t.aset_id
--     JOIN aset_awal_2026 x ON x.nibar=a.nibar
--    WHERE t.jenis='saldo_awal' AND a.nibar IN (SELECT nibar FROM stg_import_pm_ekstra_dinkes);
--
--   -- 4. ⚠️ JALANKAN ENGINE untuk 2026-S1 lalu 2026-S2 (menu Penyusutan →
--   --    "Jalankan Engine", atau POST /api/engine/run). Sesudahnya HARUS 0:
--   SELECT count(*) FROM aset a
--     WHERE a.nibar IN (SELECT nibar FROM stg_import_pm_ekstra_dinkes)
--       AND NOT EXISTS (SELECT 1 FROM penyusutan_semester p
--                        WHERE p.aset_id=a.id AND p.periode='2026-S2');
--   --    dan alarm CLAUDE.md tetap bersih:
--   SELECT count(*) FROM penyusutan_semester WHERE akumulasi > nilai_perolehan + 0.5; -- 0
--
--   -- 5. Uji Konsistensi (Pelaporan → Uji Konsistensi) 2026-S1 & 2026-S2,
--   --    komptabel EKSTRA — Rekonsiliasi BMD vs Laporan BMD harus tetap 0,00
--   --    selisih di semua golongan.
--
--   -- 6. Spot-check di layar (Daftar Barang → Jenis 1.3.2, Komptabel
--   --    EKSTRAKOMPTABEL — bawaannya 'intra', jadi harus diganti dulu):
--   SELECT nibar, kode, nama_barang, skpd_id, nilai_perolehan, intra_ekstra, kode_register
--     FROM aset WHERE nibar IN (SELECT nibar FROM stg_import_pm_ekstra_dinkes) LIMIT 20;
--
-- ══ ROLLBACK — baca dulu, urutannya menentukan bisa/tidaknya ═══════════════
-- ⚠️ SELAMA STEP 3 BELUM DIJALANKAN, batch ini masih bisa ditarik bersih.
--    BEGITU STEP 3 JALAN, BARIS LEDGERNYA PERMANEN — trigger
--    `trg_transaksi_bmd_immutable` menolak DELETE & UPDATE untuk SEMUA role.
--    Karena itu: **jalankan STEP 1 & 2 dulu, verifikasi, baru STEP 3.**
--
--   -- (i) kalau baru STEP 1 yang jalan:
--   DELETE FROM aset_awal_2026 WHERE nibar IN (SELECT nibar FROM stg_import_pm_ekstra_dinkes);
--
--   -- (ii) kalau STEP 1 & 2 sudah jalan tapi STEP 3 BELUM (urut: aset dulu —
--   --      FK transaksi_bmd/penyusutan_semester → aset tanpa CASCADE):
--   DELETE FROM aset            WHERE nibar IN (SELECT nibar FROM stg_import_pm_ekstra_dinkes);
--   DELETE FROM aset_awal_2026  WHERE nibar IN (SELECT nibar FROM stg_import_pm_ekstra_dinkes);
--
--   -- (iii) kalau STEP 3 SUDAH jalan: ledger tak bisa dihapus lewat jalur
--   --       normal. Yang benar BUKAN mematikan triggernya, melainkan
--   --       memperlakukan barangnya seperti salah catat biasa —
--   --       `koreksi_pencatatan_ganda` di-backdate (jenis itu ada di whitelist
--   --       `fn_cek_tahun_buku`, jadi boleh bertanggal 2025) sehingga barangnya
--   --       tersembunyi dari SEMUA periode, ledgernya tetap utuh, dan jejaknya
--   --       terbaca sebagai peristiwa yang memang terjadi. Mematikan
--   --       `trg_transaksi_bmd_immutable` = escape hatch yang sudah pernah
--   --       dicoba & direvert (migrasi 17/18 → 20260704_19). Jangan.
-- ============================================================================
