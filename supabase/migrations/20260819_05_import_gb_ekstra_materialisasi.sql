-- ============================================================================
-- Import Gedung & Bangunan EKSTRAKOMPTABEL 2025 (1.3.3)
-- TAHAP 2: materialisasi (2026-08-19).
-- Lanjutan 20260819_04 (stg_import_gb_ekstra terisi 1.832 baris).
--
-- Alur: staging → aset_awal_2026 → aset → transaksi_bmd ('saldo_awal',
-- periode 2025-S2, tanggal 2025-12-31 — retroaktif, di-whitelist migrasi
-- 20260710_10). intra_ekstra & kondisi_barang dipertahankan APA ADANYA dari
-- file (lihat catatan TAHAP 1) — TIDAK dihitung ulang dari batas kapitalisasi.
--
-- ⚠️ BEDA POKOK dari import ATL Diknas (20260720_02): **Gedung & Bangunan
-- DISUSUTKAN**, jadi masa_manfaat_smt / sisa_masa_manfaat_smt / beban_per_smt /
-- akumulasi_2025 IKUT ke snapshot DAN ke payload ledger. Di batch ATL keempatnya
-- sengaja NULL karena 1.3.5 memang tak pernah disusutkan; menyalin pola itu ke
-- sini akan membuat 1.832 barang mulai disusutkan dari nol pada 2026 dan
-- menghapus akumulasi Rp4,6 miliar tanpa satu pun pesan error.
--
-- ⚠️ `aset.golongan` GENERATED ALWAYS dari `kode` → JANGAN dimasukkan ke daftar
-- kolom INSERT (ditolak Postgres). `aset_awal_2026.golongan` kolom biasa dan
-- WAJIB diisi — ia yang dipakai `idx_sa2026_gol_urut` & filter Jenis Aset di
-- Daftar Barang Awal, dan dijaga CHECK `aset_awal_2026_golongan_cocok_kode`.
-- ============================================================================

-- ============================================================================
-- ⚠️ VERIFIKASI PRA-SYARAT — jalankan SEMUA, aman baru lanjut STEP 1.
--
--   -- (a) staging terisi utuh — HARUS 1832 / 1832:
--   SELECT count(*), count(DISTINCT nibar) FROM stg_import_gb_ekstra;
--
--   -- (b) skpd_id valid — HARUS 0 baris:
--   SELECT DISTINCT s.skpd_id FROM stg_import_gb_ekstra s
--     LEFT JOIN admin_skpd sk ON sk.id = s.skpd_id WHERE sk.id IS NULL;
--
--   -- (c) kode valid — HARUS 0 baris (dicek 2026-08-19: 76 kode, semua ada):
--   SELECT DISTINCT s.kode FROM stg_import_gb_ekstra s
--     LEFT JOIN admin_kodefikasi_bmd k ON k.kode = s.kode WHERE k.kode IS NULL;
--
--   -- (d) NIBAR bentrok dgn yang SUDAH ada — HARUS 0 (dicek: 0):
--   SELECT count(*) FROM stg_import_gb_ekstra s JOIN aset a ON a.nibar = s.nibar;
--   SELECT count(*) FROM stg_import_gb_ekstra s JOIN aset_awal_2026 x ON x.nibar = s.nibar;
--
--   -- (e) identitas aritmetika masih utuh sesudah lewat CSV — HARUS 0 semua:
--   SELECT count(*) FROM stg_import_gb_ekstra WHERE abs((nilai_perolehan - akumulasi_2025) - nilai_buku_awal) > 0.5;
--   SELECT count(*) FROM stg_import_gb_ekstra WHERE abs(jumlah * harga_satuan - nilai_perolehan) > 0.5;
--   SELECT count(*) FROM stg_import_gb_ekstra WHERE masa_manfaat_smt IS NOT NULL
--     AND abs(beban_penyusutan_per_smt * (masa_manfaat_smt - sisa_masa_manfaat_smt) - akumulasi_2025) > 1;
--
--   -- (f) tak ada akumulasi melebihi perolehan — HARUS 0. Ini alarm yang dulu
--   --     tak pernah ada dan membuat satu aset lolos dgn nilai buku dipaksa 0
--   --     (lihat CLAUDE.md, insiden Import Gedung 10 Juli):
--   SELECT count(*) FROM stg_import_gb_ekstra WHERE akumulasi_2025 > nilai_perolehan + 0.5;
--
--   -- (g) baseline SEBELUM (catat, bandingkan dgn verifikasi akhir):
--   SELECT count(*) AS gb_aset_sebelum FROM aset WHERE kode LIKE '1.3.3.%' AND status <> 'draft';
--   SELECT count(*) AS gb_snapshot_sebelum, sum(nilai_perolehan) AS nilai_sebelum
--     FROM aset_awal_2026 WHERE golongan = '1.3.3';
--   -- HASIL 2026-08-19 sebelum import: aset 6.726 · snapshot 6.518 ·
--   --   Rp2.124.402.716.403,02
--
--   -- (h) SPOT-CHECK DOBEL-HITUNG — barang identik (nilai+tgl+skpd) yang sudah
--   --     aktif di register. Kalau besar, periksa manual sebelum lanjut:
--   SELECT count(*) FROM stg_import_gb_ekstra s
--     WHERE EXISTS (SELECT 1 FROM aset a WHERE a.status='aktif' AND a.nibar <> s.nibar
--       AND a.nilai_perolehan = s.nilai_perolehan AND a.tgl_perolehan = s.tgl_perolehan
--       AND a.skpd_id = s.skpd_id);
-- ============================================================================

-- ── STEP 1: staging → aset_awal_2026 ────────────────────────────────────────
-- akumulasi_2025 diambil APA ADANYA dari file — identitasnya sudah diuji
-- (nilai_buku = perolehan - akumulasi, 0 pelanggaran di 1.832 baris), jadi
-- menurunkannya lagi cuma menambah peluang salah tanpa menambah kepastian.
INSERT INTO aset_awal_2026 (
  nibar, kode, nama_barang, skpd_id, intra_ekstra, nilai_perolehan, tgl_perolehan,
  masa_manfaat_smt, akumulasi_2025, nilai_buku_awal, sisa_masa_manfaat_smt,
  beban_penyusutan_per_smt, luas, uraian_barang, keterangan, jumlah, satuan,
  harga_satuan, penggunaan_pengamanan, asal_usul, kondisi_barang, tahun_pengadaan,
  golongan
)
SELECT
  s.nibar, s.kode,
  -- ⚠️ 2 baris `nama_barang`-nya KOSONG di file sumber (Rumah Genset UPTD
  -- Puskesmas Puncu & Paving UPTD Puskesmas Tanon), sedangkan kolomnya NOT
  -- NULL — tanpa cadangan ini SELURUH INSERT gagal. Jatuh ke `uraian_barang`
  -- (nomenklatur baku kodefikasi). Itu SUBSTITUSI, bukan data asli: sesudah
  -- import, betulkan keduanya lewat Saldo Awal → Daftar Barang Awal → Edit
  -- Spesifikasi. Query pencarinya ada di VERIFIKASI AKHIR no. 6.
  COALESCE(NULLIF(s.nama_barang, ''), NULLIF(s.uraian_barang, ''), s.kode),
  s.skpd_id,
  COALESCE(NULLIF(s.intra_ekstra, ''), 'ekstra'),
  s.nilai_perolehan, s.tgl_perolehan,
  s.masa_manfaat_smt, COALESCE(s.akumulasi_2025, 0), s.nilai_buku_awal,
  s.sisa_masa_manfaat_smt, s.beban_penyusutan_per_smt, s.luas,
  COALESCE(NULLIF(s.uraian_barang, ''), s.kode), NULLIF(s.keterangan, ''),
  COALESCE(s.jumlah, 1), NULLIF(s.satuan, ''), s.harga_satuan,
  NULLIF(s.penggunaan_pengamanan, ''), NULLIF(s.asal_usul, ''),
  NULLIF(s.kondisi_barang, ''), s.tahun_pengadaan, s.golongan
FROM stg_import_gb_ekstra s
WHERE NOT EXISTS (SELECT 1 FROM aset_awal_2026 x WHERE x.nibar = s.nibar);

-- ── STEP 2: aset_awal_2026 → aset (dibatasi ke batch ini) ───────────────────
-- `golongan` SENGAJA tidak ikut: GENERATED ALWAYS dari `kode`.
INSERT INTO aset (
  nibar, kode, nama_barang, nilai_perolehan, tgl_perolehan, skpd_id, intra_ekstra,
  cara_perolehan, status, jumlah, satuan, harga_satuan, luas, uraian_barang,
  keterangan, penggunaan_pengamanan, asal_usul, kondisi_barang, tahun_pengadaan
)
SELECT
  x.nibar, x.kode, x.nama_barang, x.nilai_perolehan, x.tgl_perolehan, x.skpd_id,
  x.intra_ekstra, 'saldo_awal', 'aktif', x.jumlah, x.satuan, x.harga_satuan,
  x.luas, x.uraian_barang, x.keterangan, x.penggunaan_pengamanan, x.asal_usul,
  x.kondisi_barang, x.tahun_pengadaan
FROM aset_awal_2026 x
WHERE x.nibar IN (SELECT nibar FROM stg_import_gb_ekstra)
  AND NOT EXISTS (SELECT 1 FROM aset a WHERE a.nibar = x.nibar);

-- ── STEP 3: ledger 'saldo_awal' (2025-S2, 2025-12-31) ───────────────────────
-- Keempat kunci penyusutan WAJIB terisi — inilah satu-satunya sumber posisi
-- akhir 2025 yang dibaca engine (`hitungJadwalAset` mulai replay SESUDAH baris
-- ini). `aset_awal_2026` tidak pernah dibaca engine.
INSERT INTO transaksi_bmd (aset_id, jenis, periode, tanggal, nilai, skpd_tujuan, payload, keterangan)
SELECT a.id, 'saldo_awal', '2025-S2', DATE '2025-12-31', a.nilai_perolehan, a.skpd_id,
       jsonb_build_object(
         'akumulasi_2025',        x.akumulasi_2025,
         'nilai_buku_awal',       x.nilai_buku_awal,
         'sisa_masa_manfaat_smt', x.sisa_masa_manfaat_smt,
         'masa_manfaat_smt',      x.masa_manfaat_smt,
         'beban_per_smt',         x.beban_penyusutan_per_smt,
         'sumber',                'Import GB Esktrakom 2025.xlsx — backfill 2026-08-19'
       ),
       'Baseline — Gedung & Bangunan ekstrakomptabel (1.3.3)'
FROM aset a
JOIN aset_awal_2026 x ON x.nibar = a.nibar
WHERE a.cara_perolehan = 'saldo_awal'
  AND a.nibar IN (SELECT nibar FROM stg_import_gb_ekstra)
  AND NOT EXISTS (SELECT 1 FROM transaksi_bmd t WHERE t.aset_id = a.id AND t.jenis = 'saldo_awal');

-- ============================================================================
-- VERIFIKASI AKHIR:
--   -- 1. Semua baris mendarat di ketiga tempat — ketiganya HARUS 0:
--   SELECT count(*) FROM stg_import_gb_ekstra s
--     LEFT JOIN aset_awal_2026 x ON x.nibar = s.nibar WHERE x.nibar IS NULL;
--   SELECT count(*) FROM stg_import_gb_ekstra s
--     LEFT JOIN aset a ON a.nibar = s.nibar WHERE a.id IS NULL;
--   SELECT count(*) FROM aset a WHERE a.nibar IN (SELECT nibar FROM stg_import_gb_ekstra)
--     AND NOT EXISTS (SELECT 1 FROM transaksi_bmd t WHERE t.aset_id = a.id AND t.jenis='saldo_awal');
--
--   -- 2. Saldo Awal → Rekapitulasi, 1.3.3:
--   SELECT count(*), sum(nilai_perolehan), sum(akumulasi_2025)
--     FROM aset_awal_2026 WHERE golongan = '1.3.3';
--   -- HARUS 8.350 barang (6.518 + 1.832) dan Rp2.132.347.296.608,62
--   --   (2.124.402.716.403,02 + 7.944.580.205,60)
--
--   -- 3. Semuanya ekstrakomptabel & NIBAR-nya sepakat — HARUS 100% ekstra, 0:
--   SELECT intra_ekstra, count(*) FROM aset
--     WHERE nibar IN (SELECT nibar FROM stg_import_gb_ekstra) GROUP BY 1;
--   SELECT count(*) FROM aset WHERE nibar IN (SELECT nibar FROM stg_import_gb_ekstra)
--     AND NOT (nibar LIKE '12023506%' AND intra_ekstra = 'ekstra');
--
--   -- 4. RUN ULANG ENGINE 2026-S1 & 2026-S2 — WAJIB. Gedung & Bangunan
--   --    disusutkan; tanpa run ulang 1.832 barang ini tak punya baris
--   --    `penyusutan_semester` sama sekali dan akan tampil berakumulasi NOL
--   --    di Penyusutan, Laporan BMD, & Rekonsiliasi.
--   --    Sesudahnya, alarm kesehatan data HARUS tetap 0:
--   SELECT count(*) FROM penyusutan_semester
--     WHERE periode = '2026-S2' AND akumulasi > nilai_perolehan + 0.5;
--
--   -- 6. Dua barang yang `nama_barang`-nya kosong di file & terpaksa diisi
--   --    uraian baku — BETULKAN lewat Edit Spesifikasi sesudah import:
--   SELECT nibar, nama_barang, uraian_barang, penggunaan_pengamanan
--     FROM aset_awal_2026
--    WHERE nibar IN ('120235060200000030000020251330101300120000001',
--                    '120235060200000024000020241330101300130000001');
--
--   -- 5. Laporan BMD (filter Komptabel = Ekstrakomptabel) & Rekonsiliasi
--   --    1.3.3 naik Rp7.944.580.205,60 di kolom Saldo Awal MAUPUN Saldo Akhir
--   --    (baris ledgernya 2025-S2, jadi ia masuk baseline — bukan mutasi 2026).
--   --    Uji Konsistensi harus tetap selisih 0,00.
-- ============================================================================
