-- ============================================================================
-- Import P&M EKSTRAKOMPTABEL 2025 — DINAS KESEHATAN: EKSEKUSI SEKALI JALAN
-- (2026-09-05). Menggantikan langkah manual STEP 1/2/3 di 20260905_05.
--
-- ⚠️ KENAPA SATU BLOK TRANSAKSIONAL, bukan tiga langkah manual seperti
-- 20260905_05: permintaan user — "pastikan benar-benar ter-import ke 3 tabel".
-- Kalau dijalankan bertahap manual, ada jendela di mana STEP 1 & 2 sudah masuk
-- tapi STEP 3 gagal/terlupa, dan barangnya berdiri di register TANPA baris
-- ledger — persis keadaan yang jadi insiden 20260820_02 ("aset ber-status
-- <> draft yang tak punya satu pun baris transaksi_bmd harus SELALU 0").
-- Di sini ketiganya dikunci jadi satu: setiap assertion yang meleset memicu
-- RAISE EXCEPTION → SELURUH skrip ROLLBACK (SQL Editor Supabase membungkus
-- skrip dalam satu transaksi) → database kembali persis seperti sebelum
-- dijalankan. Tidak ada keadaan setengah jadi.
--
-- ⚠️ Skrip ini AMAN DIJALANKAN ULANG: ketiga INSERT-nya ber-guard NOT EXISTS,
-- dan assertion-nya memeriksa KEADAAN AKHIR (bukan "berapa baris yang baru
-- masuk"), jadi kalau sebagian sudah masuk dari percobaan sebelumnya ia
-- melengkapi sisanya lalu tetap lulus.
--
-- PRASYARAT: `stg_import_pm_ekstra_dinkes` sudah terisi 22.795 baris dari
-- `arsip-import/stg_import_pm_ekstra_dinkes.csv` (lihat 20260905_04).
--
-- SESUDAH SKRIP INI: WAJIB jalankan ENGINE untuk 2026-S1 lalu 2026-S2
-- (menu Penyusutan → "Jalankan Engine"). Tanpa itu 22.795 barang ini tak
-- punya baris `penyusutan_semester` 2026 sama sekali — Penyusutan & Laporan
-- BMD menampilkannya dgn akumulasi 0 & nilai buku = nilai perolehan: SALAH
-- tapi tidak error.
-- ============================================================================

DO $$
DECLARE
  v_stg          int;
  v_kepala       int;
  v_skpd_invalid int;
  v_kode_invalid int;
  v_bentrok_aset int;
  v_bentrok_snap int;
  v_intra_before int;
  v_intra_after  int;
  v_snap         int;
  v_aset         int;
  v_ledger       int;
  v_beda_payload int;
  v_yatim        int;
BEGIN
  -- ══ 0. PRA-SYARAT ════════════════════════════════════════════════════════
  SELECT count(*) INTO v_stg FROM stg_import_pm_ekstra_dinkes;
  IF v_stg <> 22795 THEN
    RAISE EXCEPTION 'Staging berisi % baris, harusnya 22795. CSV belum ter-import utuh — TRUNCATE lalu import ulang (20260905_04).', v_stg;
  END IF;

  SELECT count(DISTINCT left(nibar, 8)) INTO v_kepala FROM stg_import_pm_ekstra_dinkes;
  IF v_kepala <> 1 OR NOT EXISTS (SELECT 1 FROM stg_import_pm_ekstra_dinkes WHERE left(nibar,8) = '12023506') THEN
    RAISE EXCEPTION 'Kepala NIBAR tidak seragam 12023506 (% varian) — CSV yang ter-upload bukan berkas yang benar.', v_kepala;
  END IF;

  IF EXISTS (SELECT 1 FROM stg_import_pm_ekstra_dinkes WHERE length(nibar) <> 45) THEN
    RAISE EXCEPTION 'Ada NIBAR yang panjangnya bukan 45 digit.';
  END IF;

  SELECT count(*) INTO v_skpd_invalid FROM stg_import_pm_ekstra_dinkes s
    LEFT JOIN admin_skpd sk ON sk.id = s.skpd_id WHERE sk.id IS NULL;
  IF v_skpd_invalid > 0 THEN
    RAISE EXCEPTION '% baris ber-skpd_id yang tidak terdaftar di admin_skpd.', v_skpd_invalid;
  END IF;

  -- Pemeriksaan kode barang — inilah satu-satunya pra-syarat yang belum sempat
  -- diperiksa di muka. Kalau ada yang tak terdaftar, FK aset_kode_fkey akan
  -- menolaknya di tengah STEP 2; ditangkap di sini supaya pesannya jelas.
  SELECT count(DISTINCT s.kode) INTO v_kode_invalid FROM stg_import_pm_ekstra_dinkes s
    LEFT JOIN admin_kodefikasi_bmd k ON k.kode = s.kode WHERE k.kode IS NULL;
  IF v_kode_invalid > 0 THEN
    RAISE EXCEPTION '% kode barang tidak terdaftar di admin_kodefikasi_bmd. Jalankan: SELECT DISTINCT s.kode FROM stg_import_pm_ekstra_dinkes s LEFT JOIN admin_kodefikasi_bmd k ON k.kode=s.kode WHERE k.kode IS NULL;', v_kode_invalid;
  END IF;

  -- Tabrakan NIBAR — sudah dibuktikan 0 di muka (47 NIBAR DB berprefix sama,
  -- semuanya golongan 1.3.3/Gedung), tapi diperiksa ULANG terhadap isi staging
  -- yang benar-benar ter-upload. Pelajaran 20260819_02: NIBAR bisa berpindah
  -- pemilik, dan uji "NOT EXISTS" menelan kasus itu DIAM-DIAM.
  SELECT count(*) INTO v_bentrok_aset FROM stg_import_pm_ekstra_dinkes s JOIN aset a ON a.nibar = s.nibar;
  SELECT count(*) INTO v_bentrok_snap FROM stg_import_pm_ekstra_dinkes s JOIN aset_awal_2026 x ON x.nibar = s.nibar;
  IF v_bentrok_aset > 0 OR v_bentrok_snap > 0 THEN
    RAISE EXCEPTION 'Tabrakan NIBAR: % di aset, % di aset_awal_2026. PERIKSA DULU isinya sebelum melanjutkan.', v_bentrok_aset, v_bentrok_snap;
  END IF;

  -- Baseline intrakomptabel SEBELUM — batch ini ekstrakomptabel, jadi angka
  -- intra WAJIB tak bergeser sedikit pun sesudahnya.
  SELECT count(*) INTO v_intra_before FROM aset
   WHERE golongan = '1.3.2' AND intra_ekstra = 'intra' AND status <> 'draft';

  RAISE NOTICE 'Pra-syarat lolos. Staging % baris; intra 1.3.2 sebelum: % baris.', v_stg, v_intra_before;

  -- ══ 1. staging → aset_awal_2026 ══════════════════════════════════════════
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

  SELECT count(*) INTO v_snap FROM aset_awal_2026 x
   WHERE x.nibar IN (SELECT nibar FROM stg_import_pm_ekstra_dinkes);
  IF v_snap <> 22795 THEN
    RAISE EXCEPTION 'aset_awal_2026 terisi % dari 22795 — DIBATALKAN.', v_snap;
  END IF;
  RAISE NOTICE 'STEP 1 selesai: aset_awal_2026 % baris.', v_snap;

  -- ══ 2. aset_awal_2026 → aset ═════════════════════════════════════════════
  -- `cara_perolehan='saldo_awal'` (baseline), BUKAN dari kolom `asal_usul`
  -- berkas — dua kolom berbeda & sengaja tak disinkronkan (CLAUDE.md).
  -- Trigger `trg_aset_kode_register` menerbitkan `kode_register` otomatis.
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

  SELECT count(*) INTO v_aset FROM aset a
   WHERE a.nibar IN (SELECT nibar FROM stg_import_pm_ekstra_dinkes);
  IF v_aset <> 22795 THEN
    RAISE EXCEPTION 'aset terisi % dari 22795 — DIBATALKAN.', v_aset;
  END IF;
  RAISE NOTICE 'STEP 2 selesai: aset % baris.', v_aset;

  -- ══ 3. ledger 'saldo_awal' (2025-S2, 2025-12-31) ═════════════════════════
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

  SELECT count(*) INTO v_ledger
    FROM transaksi_bmd t JOIN aset a ON a.id = t.aset_id
   WHERE t.jenis = 'saldo_awal' AND a.nibar IN (SELECT nibar FROM stg_import_pm_ekstra_dinkes);
  IF v_ledger <> 22795 THEN
    RAISE EXCEPTION 'transaksi_bmd terisi % dari 22795 — DIBATALKAN.', v_ledger;
  END IF;
  RAISE NOTICE 'STEP 3 selesai: transaksi_bmd % baris.', v_ledger;

  -- ══ 4. VERIFIKASI AKHIR — semuanya harus lolos, kalau tidak ROLLBACK ═════
  -- (a) tak ada aset batch ini yang tanpa baris ledger (alarm 20260820_02)
  SELECT count(*) INTO v_yatim FROM aset a
   WHERE a.nibar IN (SELECT nibar FROM stg_import_pm_ekstra_dinkes)
     AND NOT EXISTS (SELECT 1 FROM transaksi_bmd t WHERE t.aset_id = a.id AND t.jenis = 'saldo_awal');
  IF v_yatim > 0 THEN
    RAISE EXCEPTION '% aset tanpa baris ledger — DIBATALKAN.', v_yatim;
  END IF;

  -- (b) angka baseline utuh sampai ke payload ledger
  SELECT count(*) INTO v_beda_payload
    FROM transaksi_bmd t
    JOIN aset a ON a.id = t.aset_id
    JOIN aset_awal_2026 x ON x.nibar = a.nibar
   WHERE t.jenis = 'saldo_awal'
     AND a.nibar IN (SELECT nibar FROM stg_import_pm_ekstra_dinkes)
     AND ( (t.payload->>'akumulasi_2025')::numeric IS DISTINCT FROM x.akumulasi_2025
        OR (t.payload->>'masa_manfaat_smt')::int   IS DISTINCT FROM x.masa_manfaat_smt
        OR (t.payload->>'beban_per_smt')::numeric  IS DISTINCT FROM x.beban_penyusutan_per_smt
        OR t.nilai                                  IS DISTINCT FROM x.nilai_perolehan );
  IF v_beda_payload > 0 THEN
    RAISE EXCEPTION '% baris payload ledger tidak cocok dgn aset_awal_2026 — DIBATALKAN.', v_beda_payload;
  END IF;

  -- (c) intrakomptabel TIDAK BOLEH bergeser sedikit pun
  SELECT count(*) INTO v_intra_after FROM aset
   WHERE golongan = '1.3.2' AND intra_ekstra = 'intra' AND status <> 'draft';
  IF v_intra_after <> v_intra_before THEN
    RAISE EXCEPTION 'Intrakomptabel 1.3.2 bergeser % → % — DIBATALKAN.', v_intra_before, v_intra_after;
  END IF;

  RAISE NOTICE '✅ SELESAI. aset_awal_2026 %, aset %, transaksi_bmd % — intra 1.3.2 tetap % baris.',
    v_snap, v_aset, v_ledger, v_intra_after;
  RAISE NOTICE '⚠️ LANGKAH BERIKUTNYA: jalankan ENGINE untuk 2026-S1 lalu 2026-S2.';
END $$;

-- ============================================================================
-- VERIFIKASI SESUDAHNYA (jalankan terpisah, di luar blok di atas):
--
--   -- 1. ketiga tabel — harus 22795 / 22795 / 22795:
--   SELECT
--     (SELECT count(*) FROM aset_awal_2026 WHERE nibar IN (SELECT nibar FROM stg_import_pm_ekstra_dinkes)) AS snapshot,
--     (SELECT count(*) FROM aset          WHERE nibar IN (SELECT nibar FROM stg_import_pm_ekstra_dinkes)) AS aset,
--     (SELECT count(*) FROM transaksi_bmd t JOIN aset a ON a.id=t.aset_id
--        WHERE t.jenis='saldo_awal' AND a.nibar IN (SELECT nibar FROM stg_import_pm_ekstra_dinkes))       AS ledger;
--
--   -- 2. keranjang 1.3.2 sesudahnya:
--   SELECT intra_ekstra, count(*) AS n, round(sum(nilai_perolehan)) AS nilai
--     FROM aset WHERE golongan='1.3.2' AND status <> 'draft' GROUP BY 1;
--   -- HARUS: intra  218.305 / 1.369.667.160.256  (TIDAK BERGESER)
--   --        ekstra  51.298 / 7.688.652.056      (28.503 + 22.795 baris)
--
--   -- 3. ⚠️ JALANKAN ENGINE 2026-S1 lalu 2026-S2, sesudahnya harus 0:
--   SELECT count(*) FROM aset a
--     WHERE a.nibar IN (SELECT nibar FROM stg_import_pm_ekstra_dinkes)
--       AND NOT EXISTS (SELECT 1 FROM penyusutan_semester p
--                        WHERE p.aset_id=a.id AND p.periode='2026-S2');
--   SELECT count(*) FROM penyusutan_semester WHERE akumulasi > nilai_perolehan + 0.5; -- 0
--
--   -- 4. Uji Konsistensi (Pelaporan) 2026-S1 & 2026-S2, komptabel EKSTRA —
--   --    Rekonsiliasi BMD vs Laporan BMD harus tetap 0,00 selisih.
-- ============================================================================
