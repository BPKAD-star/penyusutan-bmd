-- ============================================================================
-- Import Aset Tetap Lainnya (ATL, golongan 1.3.5) EKSTRAKOMPTABEL 2025 —
-- TAHAP 2: EKSEKUSI SEKALI JALAN (2026-09-15). Lanjutan 20260915_01.
--
-- Alur: stg_import_atl_ekstrakom → aset_awal_2026 → aset → transaksi_bmd
-- ('saldo_awal', periode 2025-S2, tanggal 2025-12-31 — retroaktif, sudah
-- di-whitelist fn_cek_tahun_buku). Pola SAMA dgn ATL Diknas (20260720_02):
-- akumulasi_2025 dihitung dari identitas nilai_buku = perolehan − akumulasi
-- (utk batch ini SELALU 0, krn nilai_buku_awal == nilai_perolehan di seluruh
-- 667 baris — ATL tak pernah disusutkan); payload masa_manfaat/sisa/beban
-- NULL (engine mengabaikannya utk golongan 1.3.5, lihat `perlakuanKode`).
--
-- ⚠️ SATU BLOK TRANSAKSIONAL (pola 20260910_02/20260914_04): ketiga tabel
-- dikunci jadi satu. Setiap assertion yang meleset memicu RAISE EXCEPTION →
-- SELURUH skrip ROLLBACK → database kembali persis seperti sebelum dijalankan.
-- Batch ini kecil (667 baris) — TIDAK butuh pemecahan batch 7.000-baris spt
-- pelajaran disk-exhaustion 2026-09-14 (itu utk 40rb+ baris sekaligus).
--
-- ⚠️ AMAN DIJALANKAN ULANG: ketiga INSERT ber-guard NOT EXISTS, assertion
-- memeriksa KEADAAN AKHIR (bukan "berapa baris baru masuk").
--
-- ⚠️ ENGINE WAJIB DI-RUN ULANG SESUDAH MIGRASI INI (2026-S1 lalu 2026-S2, menu
-- Penyusutan → "Jalankan Engine"). Tanpa itu 667 barang ini TIDAK punya baris
-- `penyusutan_semester` 2026 — meski ATL tak disusutkan (akumulasi tetap 0),
-- baris engine tetap perlu ada supaya Daftar Barang/Penyusutan/Laporan BMD
-- menampilkan posisinya dgn benar per periode (bukan sekadar "tak apa-apa
-- kalau kosong" — pola yg sama ditegaskan di 20260914_04).
--
-- PRASYARAT: stg_import_atl_ekstrakom sudah terisi 667 baris dari 20260915_01.
-- ============================================================================

DO $$
DECLARE
  v_stg           int;
  v_kepala        int;
  v_skpd_invalid  int;
  v_kode_invalid  int;
  v_bentrok_aset  int;
  v_bentrok_snap  int;
  v_intra_before  int;
  v_intra_after   int;
  v_ekstra_before int;
  v_ekstra_after  int;
  v_snap          int;
  v_aset          int;
  v_ledger        int;
  v_beda_payload  int;
  v_yatim         int;
BEGIN
  -- ══ 0. PRA-SYARAT ══════════════════════════════════════════════════════
  SELECT count(*) INTO v_stg FROM stg_import_atl_ekstrakom;
  IF v_stg <> 667 THEN
    RAISE EXCEPTION 'Staging berisi % baris, harusnya 667. Jalankan ulang 20260915_01.', v_stg;
  END IF;

  SELECT count(DISTINCT left(nibar, 8)) INTO v_kepala FROM stg_import_atl_ekstrakom;
  IF v_kepala <> 1 OR NOT EXISTS (SELECT 1 FROM stg_import_atl_ekstrakom WHERE left(nibar,8) = '12023506') THEN
    RAISE EXCEPTION 'Kepala NIBAR tidak seragam 12023506 (% varian) — staging bukan berkas yang benar.', v_kepala;
  END IF;

  IF EXISTS (SELECT 1 FROM stg_import_atl_ekstrakom WHERE length(nibar) <> 45) THEN
    RAISE EXCEPTION 'Ada NIBAR yang panjangnya bukan 45 digit.';
  END IF;

  IF EXISTS (SELECT 1 FROM stg_import_atl_ekstrakom WHERE golongan <> '1.3.5') THEN
    RAISE EXCEPTION 'Ada baris ber-golongan di luar 1.3.5 — berkas salah.';
  END IF;

  IF EXISTS (SELECT 1 FROM stg_import_atl_ekstrakom WHERE intra_ekstra <> 'ekstra') THEN
    RAISE EXCEPTION 'Ada baris ber-intra_ekstra di luar ekstra — berkas salah.';
  END IF;

  SELECT count(*) INTO v_skpd_invalid FROM stg_import_atl_ekstrakom s
    LEFT JOIN admin_skpd sk ON sk.id = s.skpd_id WHERE sk.id IS NULL;
  IF v_skpd_invalid > 0 THEN
    RAISE EXCEPTION '% baris ber-skpd_id yang tidak terdaftar di admin_skpd.', v_skpd_invalid;
  END IF;

  SELECT count(DISTINCT s.kode) INTO v_kode_invalid FROM stg_import_atl_ekstrakom s
    LEFT JOIN admin_kodefikasi_bmd k ON k.kode = s.kode WHERE k.kode IS NULL;
  IF v_kode_invalid > 0 THEN
    RAISE EXCEPTION '% kode barang tidak terdaftar di admin_kodefikasi_bmd. Jalankan: SELECT DISTINCT s.kode FROM stg_import_atl_ekstrakom s LEFT JOIN admin_kodefikasi_bmd k ON k.kode=s.kode WHERE k.kode IS NULL;', v_kode_invalid;
  END IF;

  -- Tabrakan NIBAR — sudah dibuktikan 0 di TAHAP 1 lewat query eksplisit;
  -- diperiksa ULANG di sini terhadap isi staging yang benar-benar dieksekusi
  -- (pelajaran 20260819_02: NIBAR bisa berpindah pemilik).
  SELECT count(*) INTO v_bentrok_aset FROM stg_import_atl_ekstrakom s JOIN aset a ON a.nibar = s.nibar;
  SELECT count(*) INTO v_bentrok_snap FROM stg_import_atl_ekstrakom s JOIN aset_awal_2026 x ON x.nibar = s.nibar;
  IF v_bentrok_aset > 0 OR v_bentrok_snap > 0 THEN
    RAISE EXCEPTION 'Tabrakan NIBAR: % di aset, % di aset_awal_2026. PERIKSA DULU isinya sebelum melanjutkan.', v_bentrok_aset, v_bentrok_snap;
  END IF;

  -- Baseline 1.3.5 SEBELUM — batch ini ekstrakomptabel, jadi angka INTRA
  -- wajib tak bergeser sedikit pun sesudahnya; EKSTRA wajib bertambah tepat
  -- 667.
  SELECT count(*) INTO v_intra_before  FROM aset WHERE golongan='1.3.5' AND intra_ekstra='intra'  AND status <> 'draft';
  SELECT count(*) INTO v_ekstra_before FROM aset WHERE golongan='1.3.5' AND intra_ekstra='ekstra' AND status <> 'draft';

  RAISE NOTICE 'Pra-syarat lolos. Staging % baris; 1.3.5 sebelum: intra % / ekstra %.', v_stg, v_intra_before, v_ekstra_before;

  -- ══ 1. staging → aset_awal_2026 ════════════════════════════════════════
  INSERT INTO aset_awal_2026 (
    nibar, kode, nama_barang, skpd_id, nilai_perolehan, intra_ekstra, tgl_perolehan,
    akumulasi_2025, nilai_buku_awal, spesifikasi_lainnya, merek_tipe,
    uraian_barang, keterangan, jumlah, satuan, harga_satuan,
    penggunaan_pengamanan, asal_usul, kondisi_barang, tahun_pengadaan, golongan
  )
  SELECT
    s.nibar, s.kode, s.nama_barang, s.skpd_id, s.nilai_perolehan,
    s.intra_ekstra, s.tgl_perolehan,
    COALESCE(s.nilai_perolehan - s.nilai_buku_awal, 0), s.nilai_buku_awal,
    NULLIF(s.spesifikasi_lainnya, ''), NULLIF(s.merek_tipe, ''),
    COALESCE(NULLIF(s.uraian_barang, ''), s.kode), NULLIF(s.keterangan, ''),
    COALESCE(s.jumlah, 1), NULLIF(s.satuan, ''), s.harga_satuan,
    NULLIF(s.penggunaan_pengamanan, ''), NULLIF(s.asal_usul, ''),
    NULLIF(s.kondisi_barang, ''), s.tahun_pengadaan, s.golongan
  FROM stg_import_atl_ekstrakom s
  WHERE NOT EXISTS (SELECT 1 FROM aset_awal_2026 x WHERE x.nibar = s.nibar);

  SELECT count(*) INTO v_snap FROM aset_awal_2026 x
   WHERE x.nibar IN (SELECT nibar FROM stg_import_atl_ekstrakom);
  IF v_snap <> 667 THEN
    RAISE EXCEPTION 'aset_awal_2026 terisi % dari 667 — DIBATALKAN.', v_snap;
  END IF;
  RAISE NOTICE 'STEP 1 selesai: aset_awal_2026 % baris.', v_snap;

  -- ══ 2. aset_awal_2026 → aset ══════════════════════════════════════════
  -- cara_perolehan='saldo_awal' (baseline), BUKAN dari kolom asal_usul
  -- berkas ("Pembelian"/"Pengadaan APBD") — dua kolom berbeda & sengaja tak
  -- disinkronkan (CLAUDE.md). Trigger trg_aset_kode_register menerbitkan
  -- kode_register otomatis di sini.
  INSERT INTO aset (
    nibar, kode, nama_barang, nilai_perolehan, tgl_perolehan, skpd_id, intra_ekstra,
    cara_perolehan, status, jumlah, satuan, harga_satuan,
    spesifikasi_lainnya, merek_tipe, uraian_barang, keterangan,
    penggunaan_pengamanan, asal_usul, kondisi_barang, tahun_pengadaan
  )
  SELECT
    x.nibar, x.kode, x.nama_barang, x.nilai_perolehan, x.tgl_perolehan, x.skpd_id, x.intra_ekstra,
    'saldo_awal', 'aktif', x.jumlah, x.satuan, x.harga_satuan,
    x.spesifikasi_lainnya, x.merek_tipe, x.uraian_barang, x.keterangan,
    x.penggunaan_pengamanan, x.asal_usul, x.kondisi_barang, x.tahun_pengadaan
  FROM aset_awal_2026 x
  WHERE x.nibar IN (SELECT nibar FROM stg_import_atl_ekstrakom)
    AND NOT EXISTS (SELECT 1 FROM aset a WHERE a.nibar = x.nibar);

  SELECT count(*) INTO v_aset FROM aset a
   WHERE a.nibar IN (SELECT nibar FROM stg_import_atl_ekstrakom);
  IF v_aset <> 667 THEN
    RAISE EXCEPTION 'aset terisi % dari 667 — DIBATALKAN.', v_aset;
  END IF;
  RAISE NOTICE 'STEP 2 selesai: aset % baris.', v_aset;

  -- ══ 3. ledger 'saldo_awal' (2025-S2, 2025-12-31) ═════════════════════
  -- ATL tidak disusutkan → sisa_masa_manfaat_smt/masa_manfaat_smt/
  -- beban_per_smt NULL (pola ATL Diknas 20260720_02).
  INSERT INTO transaksi_bmd (aset_id, jenis, periode, tanggal, nilai, skpd_tujuan, payload, keterangan)
  SELECT a.id, 'saldo_awal', '2025-S2', DATE '2025-12-31', a.nilai_perolehan, a.skpd_id,
         jsonb_build_object(
           'akumulasi_2025',        x.akumulasi_2025,
           'nilai_buku_awal',       x.nilai_buku_awal,
           'sisa_masa_manfaat_smt', NULL,
           'masa_manfaat_smt',      NULL,
           'beban_per_smt',         NULL,
           'sumber',                'Import ATL Ekstrakom - Copy.xlsx — backfill 2026-09-15'
         ),
         'Baseline — ATL (1.3.5) ekstrakomptabel, tidak disusutkan'
  FROM aset a
  JOIN aset_awal_2026 x ON x.nibar = a.nibar
  WHERE a.cara_perolehan = 'saldo_awal'
    AND a.nibar IN (SELECT nibar FROM stg_import_atl_ekstrakom)
    AND NOT EXISTS (SELECT 1 FROM transaksi_bmd t WHERE t.aset_id = a.id AND t.jenis = 'saldo_awal');

  SELECT count(*) INTO v_ledger
    FROM transaksi_bmd t JOIN aset a ON a.id = t.aset_id
   WHERE t.jenis = 'saldo_awal' AND a.nibar IN (SELECT nibar FROM stg_import_atl_ekstrakom);
  IF v_ledger <> 667 THEN
    RAISE EXCEPTION 'transaksi_bmd terisi % dari 667 — DIBATALKAN.', v_ledger;
  END IF;
  RAISE NOTICE 'STEP 3 selesai: transaksi_bmd % baris.', v_ledger;

  -- ══ 4. VERIFIKASI AKHIR — semuanya harus lolos, kalau tidak ROLLBACK ═══
  -- (a) tak ada aset batch ini yang tanpa baris ledger (alarm 20260820_02)
  SELECT count(*) INTO v_yatim FROM aset a
   WHERE a.nibar IN (SELECT nibar FROM stg_import_atl_ekstrakom)
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
     AND a.nibar IN (SELECT nibar FROM stg_import_atl_ekstrakom)
     AND ( (t.payload->>'akumulasi_2025')::numeric IS DISTINCT FROM x.akumulasi_2025
        OR t.nilai                                  IS DISTINCT FROM x.nilai_perolehan );
  IF v_beda_payload > 0 THEN
    RAISE EXCEPTION '% baris payload ledger tidak cocok dgn aset_awal_2026 — DIBATALKAN.', v_beda_payload;
  END IF;

  -- (c) intrakomptabel 1.3.5 TIDAK BOLEH bergeser; ekstra bertambah TEPAT 667
  SELECT count(*) INTO v_intra_after  FROM aset WHERE golongan='1.3.5' AND intra_ekstra='intra'  AND status <> 'draft';
  SELECT count(*) INTO v_ekstra_after FROM aset WHERE golongan='1.3.5' AND intra_ekstra='ekstra' AND status <> 'draft';
  IF v_intra_after <> v_intra_before THEN
    RAISE EXCEPTION 'Intrakomptabel 1.3.5 bergeser % → % — DIBATALKAN.', v_intra_before, v_intra_after;
  END IF;
  IF v_ekstra_after <> v_ekstra_before + 667 THEN
    RAISE EXCEPTION 'Ekstrakomptabel 1.3.5 % → % (harusnya +667) — DIBATALKAN.', v_ekstra_before, v_ekstra_after;
  END IF;

  RAISE NOTICE '✅ SELESAI. aset_awal_2026 %, aset %, transaksi_bmd % — 1.3.5 intra tetap %, ekstra % → %.',
    v_snap, v_aset, v_ledger, v_intra_after, v_ekstra_before, v_ekstra_after;
  RAISE NOTICE '⚠️ LANGKAH BERIKUTNYA: jalankan ENGINE 2026-S1 lalu 2026-S2 (menu Penyusutan). Batch kecil (667 baris) — VACUUM eksplisit TIDAK wajib (jauh di bawah ambang 53.609 baris yang memicu insiden 2026-09-06), tapi aman dijalankan kalau ingin jaring pengaman.';
END $$;

-- ============================================================================
-- CEK AKHIR (jalankan terpisah, di luar blok DO):
--
--   -- 1. ketiga tabel — harus 667 / 667 / 667:
--   SELECT
--     (SELECT count(*) FROM aset_awal_2026 WHERE nibar IN (SELECT nibar FROM stg_import_atl_ekstrakom)) AS snapshot,
--     (SELECT count(*) FROM aset          WHERE nibar IN (SELECT nibar FROM stg_import_atl_ekstrakom)) AS aset,
--     (SELECT count(*) FROM transaksi_bmd t JOIN aset a ON a.id=t.aset_id
--        WHERE t.jenis='saldo_awal' AND a.nibar IN (SELECT nibar FROM stg_import_atl_ekstrakom))       AS ledger;
--
--   -- 2. keranjang 1.3.5 sesudahnya:
--   SELECT intra_ekstra, count(*) AS n, round(sum(nilai_perolehan)) AS nilai
--     FROM aset WHERE golongan='1.3.5' AND status <> 'draft' GROUP BY 1;
--   -- HARUS: intra tak bergeser dari sebelum migrasi (173.262);
--   --        ekstra bertambah tepat 667 baris / Rp233.642.913,48
--
--   -- 3. angka baseline utuh sampai ke payload ledger (kedua HARUS 0):
--   SELECT count(*) FILTER (WHERE (t.payload->>'akumulasi_2025')::numeric <> x.akumulasi_2025) AS a,
--          count(*) FILTER (WHERE t.nilai <> x.nilai_perolehan)                                 AS b
--     FROM transaksi_bmd t JOIN aset a ON a.id=t.aset_id
--     JOIN aset_awal_2026 x ON x.nibar=a.nibar
--    WHERE t.jenis='saldo_awal' AND a.nibar IN (SELECT nibar FROM stg_import_atl_ekstrakom);
--
--   -- 4. ⚠️ JALANKAN ENGINE 2026-S1 lalu 2026-S2, sesudahnya HARUS 0:
--   SELECT count(*) FROM aset a
--     WHERE a.nibar IN (SELECT nibar FROM stg_import_atl_ekstrakom)
--       AND NOT EXISTS (SELECT 1 FROM penyusutan_semester p
--                        WHERE p.aset_id=a.id AND p.periode='2026-S2');
--
--   -- 5. Uji Konsistensi (Pelaporan) 2026-S1 & 2026-S2, komptabel EKSTRA —
--   --    Rekonsiliasi BMD vs Laporan BMD harus tetap 0,00 selisih di semua
--   --    golongan.
--
--   -- 6. Spot-check di layar: Daftar Barang → Jenis 1.3.5, Komptabel
--   --    EKSTRAKOMPTABEL — kelima SDN/UPTD Kearsipan harus tampil, merek_tipe
--   --    ikut terlihat utk 105 baris "Dinas Kearsipan dan Perpustakaan".
--
-- ══ ROLLBACK ═══════════════════════════════════════════════════════════════
--   -- (i) kalau blok DO gagal di tengah: sudah otomatis ROLLBACK, tak ada
--   --     yang perlu dibersihkan.
--   -- (ii) kalau blok DO SUKSES tapi ingin ditarik SEBELUM engine di-run
--   --      (urut: aset dulu — FK transaksi_bmd/penyusutan_semester → aset):
--   --   DELETE FROM transaksi_bmd WHERE jenis='saldo_awal' AND aset_id IN
--   --     (SELECT id FROM aset WHERE nibar IN (SELECT nibar FROM stg_import_atl_ekstrakom));
--   --   -- ⚠️ ledger append-only: DELETE di atas DITOLAK trigger
--   --   --    trg_transaksi_bmd_immutable. Begitu STEP 3 sukses, baris ledger
--   --   --    PERMANEN. Untuk menariknya perlakukan seperti salah catat:
--   --   --    koreksi_pencatatan_ganda di-backdate ke 2025 (di-whitelist
--   --   --    fn_cek_tahun_buku) — barang tersembunyi dari SEMUA periode,
--   --   --    ledger tetap utuh. JANGAN matikan trg_transaksi_bmd_immutable.
--   --   DELETE FROM aset           WHERE nibar IN (SELECT nibar FROM stg_import_atl_ekstrakom);
--   --   DELETE FROM aset_awal_2026 WHERE nibar IN (SELECT nibar FROM stg_import_atl_ekstrakom);
-- ============================================================================
