-- ============================================================================
-- Import Peralatan & Mesin EKSTRAKOMPTABEL 2025 (1.3.2) — TAHAP 2:
-- materialisasi (2026-09-04, REVISI KEDUA). Lanjutan 20260904_01.
--
-- Alur: stg_import_pm_ekstra → aset_awal_2026 → aset → transaksi_bmd
-- ('saldo_awal', periode 2025-S2, tanggal 2025-12-31).
--
-- ⚠️ BEDA DARI IMPOR ATL (20260720_02): 1.3.2 DISUSUTKAN dan ekstrakomptabel
-- IKUT disusutkan, jadi masa_manfaat_smt / sisa_masa_manfaat_smt /
-- beban_per_smt DIISI di payload ledger (di ATL semuanya NULL). Angka-angka
-- itu diambil APA ADANYA dari file (sudah dibulatkan 2 desimal saat CSV
-- dibuat, TAHAP 1) — TIDAK dihitung ulang. Alasannya sama dengan checkpoint
-- Tutup Tahun & `checkpointBekas`: angka yang sudah masuk neraca tak boleh
-- ikut bergerak kalau kelak masa manfaat kodefikasi berubah.
--
-- ⚠️ ENGINE WAJIB DI-RUN ULANG SESUDAH MIGRASI INI (lihat langkah 4 di kaki
-- berkas). Tanpa itu 28.502 barang ini TIDAK punya baris `penyusutan_semester`
-- 2026 sama sekali — Penyusutan & Laporan BMD akan menampilkannya dengan
-- akumulasi 0 & nilai buku = nilai perolehan, yaitu SALAH tapi tidak error.
--
-- ⚠️ REVISI KEDUA vs revisi pertama (dijalankan pagi 2026-09-04): kepala NIBAR
-- sudah dibetulkan USER SENDIRI di sistem sumber (lihat 20260904_01) — bukan
-- lagi dinormalkan lewat UPDATE di sini. STEP yang dulu bernama "STEP 0"
-- (normalisasi) DICABUT, diganti VERIFIKASI keras yang GAGAL (bukan
-- memperbaiki diam-diam) kalau kepalanya ternyata tak seragam `12023506` —
-- itu satu-satunya cara mendeteksi kalau CSV yang ter-upload ternyata masih
-- revisi lama atau berkas lain.
-- ============================================================================

-- ============================================================================
-- ⚠️ VERIFIKASI PRA-SYARAT — jalankan SEMUA, aman baru lanjut STEP 1.
--
-- URUTAN: pra-syarat (a)(b)(c)(d)(e)(f) → STEP 1 → STEP 2 → verifikasi →
-- STEP 3 → run engine.
--
--   -- (a) staging terisi utuh, KEPALA NIBAR SERAGAM — gantinya STEP 0 lama.
--   --     HARUS 28502 baris, 28502 NIBAR unik, TEPAT SATU baris kepala:
--   SELECT count(*) AS baris, count(DISTINCT nibar) AS nibar_unik FROM stg_import_pm_ekstra;
--   SELECT left(nibar,8) AS kepala, count(*) FROM stg_import_pm_ekstra GROUP BY 1;
--   -- Kalau muncul kepala SELAIN '12023506' (mis. '12025306'/'12013506' dari
--   -- revisi pertama) → STAGING BELUM DI-TRUNCATE & DI-IMPOR ULANG dgn CSV
--   -- revisi kedua. JANGAN lanjut — kembali ke 20260904_01, jalankan TRUNCATE,
--   -- impor ulang CSV, baru kembali ke sini.
--
--   -- (b) skpd_id valid — HARUS 0 baris:
--   SELECT DISTINCT s.skpd_id FROM stg_import_pm_ekstra s
--     LEFT JOIN admin_skpd sk ON sk.id = s.skpd_id WHERE sk.id IS NULL;
--
--   -- (c) kode valid — HARUS 0 baris (sudah dicek dari berkas: 324/324 ada):
--   SELECT DISTINCT s.kode FROM stg_import_pm_ekstra s
--     LEFT JOIN admin_kodefikasi_bmd k ON k.kode = s.kode WHERE k.kode IS NULL;
--
--   -- (d) tabrakan NIBAR dgn yang sudah ada — HARUS 0 & 0. Diperiksa di muka
--   --     dari berkas (2026-09-04): satu-satunya baris `aset` berkepala
--   --     `12023506` bersegmen-kode `132` adalah entri uji "Lap Top" milik
--   --     operator (status='dihapus', bukan bagian batch ini — NIBAR persisnya
--   --     dicek TIDAK ada di 28.502 baris file). `aset_awal_2026` nol baris
--   --     berkepala itu sama sekali. Query ini pembuktian ULANG, bukan
--   --     formalitas — kalau staging-nya berubah lagi sebelum migrasi
--   --     dijalankan, di sinilah ketahuan:
--   SELECT (SELECT count(*) FROM stg_import_pm_ekstra s JOIN aset a ON a.nibar=s.nibar) AS bentrok_aset,
--          (SELECT count(*) FROM stg_import_pm_ekstra s JOIN aset_awal_2026 x ON x.nibar=s.nibar) AS bentrok_snapshot;
--   -- kalau > 0, lihat isinya dulu — barang yang sama atau NIBAR dipakai ulang
--   -- (pelajaran 20260819_02: NIBAR bisa berpindah pemilik, dan uji
--   -- "NOT EXISTS per NIBAR" menelan kasus itu DIAM-DIAM):
--   SELECT s.nibar, s.kode AS kode_file, a.kode AS kode_db,
--          s.nilai_perolehan AS nilai_file, a.nilai_perolehan AS nilai_db,
--          s.tgl_perolehan AS tgl_file, a.tgl_perolehan AS tgl_db
--     FROM stg_import_pm_ekstra s JOIN aset a ON a.nibar = s.nibar LIMIT 50;
--
--   -- (e) baseline SEBELUM — CATAT, dibandingkan di verifikasi akhir:
--   SELECT intra_ekstra, count(*) AS n, round(sum(nilai_perolehan)) AS nilai
--     FROM aset WHERE golongan='1.3.2' AND status <> 'draft' GROUP BY 1;
--   -- per 2026-09-04: intra 218.305 / Rp1.369.667.160.256 ;
--   --                 ekstra 1 / Rp50.000 (entri uji "Lap Top", status dihapus)
--
--   -- (f) sisa disk (CLAUDE.md: backfill 418rb baris pernah mendorong disk
--   --     54%→96% → project READ-ONLY → seluruh app mati). Batch ini ~28,5rb
--   --     baris × 3 tabel, jauh lebih kecil, tapi tetap dicek DULU:
--   SELECT pg_size_pretty(pg_database_size(current_database())) AS ukuran_db;
-- ============================================================================

-- ── STEP 1: staging → aset_awal_2026 ────────────────────────────────────────
-- Angka penyusutan baseline (masa manfaat, akumulasi, sisa, beban) dibawa APA
-- ADANYA dari staging (sudah dibulatkan 2 desimal di TAHAP 1) — 1.3.2
-- disusutkan & ekstrakomptabel ikut disusutkan. Identitas nilai_buku =
-- perolehan − akumulasi sudah diverifikasi 0 beda di seluruh 28.502 baris,
-- jadi keduanya disalin langsung (tidak saling dihitung ulang di sini).
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
FROM stg_import_pm_ekstra s
WHERE NOT EXISTS (SELECT 1 FROM aset_awal_2026 x WHERE x.nibar = s.nibar);

-- ── STEP 2: aset_awal_2026 → aset (dibatasi ke batch ini) ───────────────────
-- ⚠️ `cara_perolehan = 'saldo_awal'` (baseline), BUKAN diturunkan dari kolom
-- `asal_usul` file ("Hibah"/"Pengadaan APBD"/"Perolehan Lainnya"). Keduanya
-- kolom BERBEDA & sengaja tidak disinkronkan — lihat CLAUDE.md. `asal_usul`
-- tetap dibawa apa adanya sebagai keterangan asal barangnya.
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
WHERE x.nibar IN (SELECT nibar FROM stg_import_pm_ekstra)
  AND NOT EXISTS (SELECT 1 FROM aset a WHERE a.nibar = x.nibar);

-- ── STEP 3: ledger 'saldo_awal' (2025-S2, 2025-12-31) ───────────────────────
-- Payload BENTUKNYA SAMA PERSIS dgn batch P&M intra (20260716_01) — engine
-- membaca kelima kunci itu lewat cabang `saldo_awal` di `hitungJadwalAset`.
INSERT INTO transaksi_bmd (aset_id, jenis, periode, tanggal, nilai, skpd_tujuan, payload, keterangan)
SELECT a.id, 'saldo_awal', '2025-S2', DATE '2025-12-31', a.nilai_perolehan, a.skpd_id,
       jsonb_build_object(
         'akumulasi_2025',        x.akumulasi_2025,
         'nilai_buku_awal',       x.nilai_buku_awal,
         'sisa_masa_manfaat_smt', x.sisa_masa_manfaat_smt,
         'masa_manfaat_smt',      x.masa_manfaat_smt,
         'beban_per_smt',         x.beban_penyusutan_per_smt,
         'sumber',                'Import PM Esktrakom 2025.xlsx — backfill 2026-09-04'
       ),
       'Baseline — Peralatan dan Mesin (1.3.2) ekstrakomptabel'
FROM aset a
JOIN aset_awal_2026 x ON x.nibar = a.nibar
WHERE a.cara_perolehan = 'saldo_awal'
  AND a.nibar IN (SELECT nibar FROM stg_import_pm_ekstra)
  AND NOT EXISTS (SELECT 1 FROM transaksi_bmd t WHERE t.aset_id = a.id AND t.jenis = 'saldo_awal');

-- ============================================================================
-- VERIFIKASI AKHIR (jalankan semua):
--
--   -- 1. ketiga tabel terisi & tak ada yang tertinggal:
--   SELECT count(*) FROM aset_awal_2026 WHERE nibar IN (SELECT nibar FROM stg_import_pm_ekstra); -- 28502
--   SELECT count(*) FROM stg_import_pm_ekstra s
--     LEFT JOIN aset a ON a.nibar = s.nibar WHERE a.id IS NULL;                                  -- 0
--   SELECT count(*) FROM aset a WHERE a.nibar IN (SELECT nibar FROM stg_import_pm_ekstra)
--     AND NOT EXISTS (SELECT 1 FROM transaksi_bmd t WHERE t.aset_id=a.id AND t.jenis='saldo_awal'); -- 0
--
--   -- 2. keranjang ekstra 1.3.2 muncul, intra TIDAK BERGESER SEDIKIT PUN:
--   SELECT intra_ekstra, count(*) AS n, round(sum(nilai_perolehan)) AS nilai
--     FROM aset WHERE golongan='1.3.2' AND status <> 'draft' GROUP BY 1;
--   -- harus: intra 218.305 / 1.369.667.160.256 (SAMA dgn pra-syarat (e))
--   --        ekstra 28.503 / (4.890.122.583 + 50.000 dari entri uji lama)
--
--   -- 3. angka baseline utuh sampai ke ledger (ketiganya HARUS 0):
--   SELECT count(*) FILTER (WHERE (t.payload->>'akumulasi_2025')::numeric <> x.akumulasi_2025)   AS a,
--          count(*) FILTER (WHERE (t.payload->>'masa_manfaat_smt')::int   <> x.masa_manfaat_smt)  AS b,
--          count(*) FILTER (WHERE (t.payload->>'beban_per_smt')::numeric  <> x.beban_penyusutan_per_smt) AS c
--     FROM transaksi_bmd t JOIN aset a ON a.id=t.aset_id
--     JOIN aset_awal_2026 x ON x.nibar=a.nibar
--    WHERE t.jenis='saldo_awal' AND a.nibar IN (SELECT nibar FROM stg_import_pm_ekstra);
--
--   -- 4. ⚠️ JALANKAN ENGINE untuk 2026-S1 lalu 2026-S2 (menu Penyusutan →
--   --    "Jalankan Engine", atau POST /api/engine/run). Tanpa ini, 28.502
--   --    barang ini tak punya baris penyusutan 2026 sama sekali.
--   --    Sesudahnya HARUS 0:
--   SELECT count(*) FROM aset a
--     WHERE a.nibar IN (SELECT nibar FROM stg_import_pm_ekstra)
--       AND NOT EXISTS (SELECT 1 FROM penyusutan_semester p
--                        WHERE p.aset_id=a.id AND p.periode='2026-S2');
--   --    dan alarm CLAUDE.md tetap bersih:
--   SELECT count(*) FROM penyusutan_semester WHERE akumulasi > nilai_perolehan + 0.5; -- 0
--
--   -- 5. Uji Konsistensi (Pelaporan → Uji Konsistensi) untuk 2026-S1 & 2026-S2,
--   --    komptabel EKSTRA — Rekonsiliasi BMD vs Laporan BMD harus tetap 0,00
--   --    selisih di semua golongan.
--
--   -- 6. Spot-check tampil di layar (default filter Komptabel = 'intra', jadi
--   --    pilih Ekstrakomptabel dulu supaya barangnya kelihatan):
--   SELECT nibar, kode, nama_barang, skpd_id, nilai_perolehan, intra_ekstra, kode_register
--     FROM aset WHERE nibar IN (SELECT nibar FROM stg_import_pm_ekstra) LIMIT 20;
--
-- ══ ROLLBACK — baca dulu, urutannya menentukan bisa/tidaknya ═══════════════
-- ⚠️ SELAMA STEP 3 BELUM DIJALANKAN, batch ini masih bisa ditarik bersih.
--    BEGITU STEP 3 JALAN, BARIS LEDGERNYA PERMANEN. Trigger
--    `trg_transaksi_bmd_immutable` menolak DELETE & UPDATE untuk SEMUA role
--    (tak ada pengecualian `current_user` seperti di aset_awal_2026) — jadi
--    JANGAN menulis rencana rollback yang mengandalkan DELETE dari
--    `transaksi_bmd`; ia akan gagal di tengah jalan.
--    Karena itu: **jalankan STEP 1 & 2 dulu, verifikasi, baru STEP 3.**
--
--   -- (i) kalau baru STEP 1 yang jalan:
--   DELETE FROM aset_awal_2026 WHERE nibar IN (SELECT nibar FROM stg_import_pm_ekstra);
--
--   -- (ii) kalau STEP 1 & 2 sudah jalan tapi STEP 3 BELUM (urut: aset dulu —
--   --      FK transaksi_bmd/penyusutan_semester → aset tanpa CASCADE):
--   DELETE FROM aset            WHERE nibar IN (SELECT nibar FROM stg_import_pm_ekstra);
--   DELETE FROM aset_awal_2026  WHERE nibar IN (SELECT nibar FROM stg_import_pm_ekstra);
--
--   -- (iii) kalau STEP 3 SUDAH jalan: ledger tak bisa dihapus lewat jalur
--   --       normal. Yang benar BUKAN mematikan triggernya, melainkan
--   --       memperlakukan barangnya seperti salah catat biasa —
--   --       `koreksi_pencatatan_ganda` di-backdate (jenis itu ada di whitelist
--   --       `fn_cek_tahun_buku`, jadi boleh bertanggal 2025) sehingga barangnya
--   --       tersembunyi dari SEMUA periode, ledgernya tetap utuh, dan jejaknya
--   --       terbaca sebagai peristiwa yang memang terjadi.
--   --       Mematikan `trg_transaksi_bmd_immutable` memang bisa dilakukan
--   --       pemilik tabel, TAPI itu persis escape hatch yang sudah pernah
--   --       dicoba & direvert (migrasi 17/18 → 20260704_19): begitu baris
--   --       ledger hilang, replay visibilitas kehilangan jejaknya dan barang
--   --       yang seharusnya tersembunyi MUNCUL LAGI di laporan. Jangan.
-- ============================================================================
