-- ============================================================================
-- Import P&M EKSTRAKOMPTABEL 2025 — DINAS PERTANIAN & PERKEBUNAN + DINAS
-- PERDAGANGAN & PERINDUSTRIAN (1.3.2) — TAHAP 2: EKSEKUSI SEKALI JALAN
-- (2026-09-10). Lanjutan 20260910_01.
--
-- Alur: stg_import_pm_ekstra_disdag_pertanian → aset_awal_2026 → aset →
-- transaksi_bmd ('saldo_awal', periode 2025-S2, tanggal 2025-12-31).
--
-- ⚠️ SATU BLOK TRANSAKSIONAL (pola 20260905_06): ketiga tabel dikunci jadi
-- satu. Setiap assertion yang meleset memicu RAISE EXCEPTION → SELURUH skrip
-- ROLLBACK (SQL Editor Supabase membungkus skrip dalam satu transaksi) →
-- database kembali persis seperti sebelum dijalankan. Tidak ada keadaan
-- setengah jadi (mis. aset berdiri di register tanpa baris ledger — insiden
-- 20260820_02).
--
-- ⚠️ AMAN DIJALANKAN ULANG: ketiga INSERT ber-guard NOT EXISTS, assertion
-- memeriksa KEADAAN AKHIR (bukan "berapa baris baru masuk"). Kalau sebagian
-- sudah masuk dari percobaan sebelumnya, ia melengkapi sisanya lalu tetap lulus.
--
-- ⚠️ ENGINE WAJIB DI-RUN ULANG SESUDAH MIGRASI INI (2026-S1 lalu 2026-S2, menu
-- Penyusutan → "Jalankan Engine"). Tanpa itu 888 barang ini TIDAK punya baris
-- `penyusutan_semester` 2026 — Penyusutan & Laporan BMD menampilkannya dgn
-- akumulasi 0 & nilai buku = nilai perolehan: SALAH tapi tidak error.
--
-- Angka penyusutan diambil APA ADANYA dari berkas (sudah dibulatkan 2 desimal
-- di TAHAP 1), TIDAK dihitung ulang — alasan yang sama dgn checkpoint Tutup
-- Tahun & `checkpointBekas`: angka yang sudah masuk neraca tak boleh ikut
-- bergerak kalau kelak masa manfaat kodefikasi berubah.
--
-- PRASYARAT: `stg_import_pm_ekstra_disdag_pertanian` sudah terisi 888 baris
-- dari `arsip-import/stg_import_pm_ekstra_disdag_pertanian.csv` (lihat
-- 20260910_01). Kalau belum 888 → TRUNCATE & import ulang.
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
  v_ekstra_before int;
  v_ekstra_after  int;
  v_snap         int;
  v_aset         int;
  v_ledger       int;
  v_beda_payload int;
  v_yatim        int;
BEGIN
  -- ══ 0. PRA-SYARAT ══════════════════════════════════════════════════════
  SELECT count(*) INTO v_stg FROM stg_import_pm_ekstra_disdag_pertanian;
  IF v_stg <> 888 THEN
    RAISE EXCEPTION 'Staging berisi % baris, harusnya 888. CSV belum ter-import utuh — TRUNCATE lalu import ulang (20260910_01).', v_stg;
  END IF;

  SELECT count(DISTINCT left(nibar, 8)) INTO v_kepala FROM stg_import_pm_ekstra_disdag_pertanian;
  IF v_kepala <> 1 OR NOT EXISTS (SELECT 1 FROM stg_import_pm_ekstra_disdag_pertanian WHERE left(nibar,8) = '12023506') THEN
    RAISE EXCEPTION 'Kepala NIBAR tidak seragam 12023506 (% varian) — CSV yang ter-upload bukan berkas yang benar.', v_kepala;
  END IF;

  IF EXISTS (SELECT 1 FROM stg_import_pm_ekstra_disdag_pertanian WHERE length(nibar) <> 45) THEN
    RAISE EXCEPTION 'Ada NIBAR yang panjangnya bukan 45 digit.';
  END IF;

  IF EXISTS (SELECT 1 FROM stg_import_pm_ekstra_disdag_pertanian WHERE skpd_id NOT IN (24, 25)) THEN
    RAISE EXCEPTION 'Ada baris ber-skpd_id di luar {24 (Dinas Pertanian), 25 (Dinas Perdagangan)} — berkas salah.';
  END IF;

  SELECT count(*) INTO v_skpd_invalid FROM stg_import_pm_ekstra_disdag_pertanian s
    LEFT JOIN admin_skpd sk ON sk.id = s.skpd_id WHERE sk.id IS NULL;
  IF v_skpd_invalid > 0 THEN
    RAISE EXCEPTION '% baris ber-skpd_id yang tidak terdaftar di admin_skpd.', v_skpd_invalid;
  END IF;

  -- Kode barang — kalau ada yang tak terdaftar, FK aset_kode_fkey akan
  -- menolaknya di tengah STEP 2. Ditangkap di sini supaya pesannya jelas.
  SELECT count(DISTINCT s.kode) INTO v_kode_invalid FROM stg_import_pm_ekstra_disdag_pertanian s
    LEFT JOIN admin_kodefikasi_bmd k ON k.kode = s.kode WHERE k.kode IS NULL;
  IF v_kode_invalid > 0 THEN
    RAISE EXCEPTION '% kode barang tidak terdaftar di admin_kodefikasi_bmd. Jalankan: SELECT DISTINCT s.kode FROM stg_import_pm_ekstra_disdag_pertanian s LEFT JOIN admin_kodefikasi_bmd k ON k.kode=s.kode WHERE k.kode IS NULL;', v_kode_invalid;
  END IF;

  -- Tabrakan NIBAR — sudah dibuktikan 0 di muka (12 NIBAR DB berprefix-SKPD
  -- sama, semuanya golongan 1.3.3/Gedung; 0 overlap eksak). Diperiksa ULANG
  -- terhadap isi staging yang benar-benar ter-upload — pelajaran 20260819_02,
  -- NIBAR bisa berpindah pemilik & uji "NOT EXISTS" menelan kasus itu diam-diam.
  SELECT count(*) INTO v_bentrok_aset FROM stg_import_pm_ekstra_disdag_pertanian s JOIN aset a ON a.nibar = s.nibar;
  SELECT count(*) INTO v_bentrok_snap FROM stg_import_pm_ekstra_disdag_pertanian s JOIN aset_awal_2026 x ON x.nibar = s.nibar;
  IF v_bentrok_aset > 0 OR v_bentrok_snap > 0 THEN
    RAISE EXCEPTION 'Tabrakan NIBAR: % di aset, % di aset_awal_2026. PERIKSA DULU isinya sebelum melanjutkan.', v_bentrok_aset, v_bentrok_snap;
  END IF;

  -- Baseline 1.3.2 SEBELUM — batch ini ekstrakomptabel, jadi angka INTRA wajib
  -- tak bergeser sedikit pun sesudahnya; EKSTRA wajib bertambah tepat 888.
  SELECT count(*) INTO v_intra_before  FROM aset WHERE golongan='1.3.2' AND intra_ekstra='intra'  AND status <> 'draft';
  SELECT count(*) INTO v_ekstra_before FROM aset WHERE golongan='1.3.2' AND intra_ekstra='ekstra' AND status <> 'draft';

  RAISE NOTICE 'Pra-syarat lolos. Staging % baris; 1.3.2 sebelum: intra % / ekstra %.', v_stg, v_intra_before, v_ekstra_before;

  -- ══ 1. staging → aset_awal_2026 ════════════════════════════════════════
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
  FROM stg_import_pm_ekstra_disdag_pertanian s
  WHERE NOT EXISTS (SELECT 1 FROM aset_awal_2026 x WHERE x.nibar = s.nibar);

  SELECT count(*) INTO v_snap FROM aset_awal_2026 x
   WHERE x.nibar IN (SELECT nibar FROM stg_import_pm_ekstra_disdag_pertanian);
  IF v_snap <> 888 THEN
    RAISE EXCEPTION 'aset_awal_2026 terisi % dari 888 — DIBATALKAN.', v_snap;
  END IF;
  RAISE NOTICE 'STEP 1 selesai: aset_awal_2026 % baris.', v_snap;

  -- ══ 2. aset_awal_2026 → aset ══════════════════════════════════════════
  -- `cara_perolehan='saldo_awal'` (baseline), BUKAN dari kolom `asal_usul`
  -- berkas ("Pengadaan APBD"/"Hibah") — dua kolom berbeda & sengaja tak
  -- disinkronkan (CLAUDE.md). Trigger `trg_aset_kode_register` menerbitkan
  -- `kode_register` otomatis di sini (butuh skpd_id, kode, intra_ekstra,
  -- tgl_perolehan — keempatnya diisi).
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
  WHERE x.nibar IN (SELECT nibar FROM stg_import_pm_ekstra_disdag_pertanian)
    AND NOT EXISTS (SELECT 1 FROM aset a WHERE a.nibar = x.nibar);

  SELECT count(*) INTO v_aset FROM aset a
   WHERE a.nibar IN (SELECT nibar FROM stg_import_pm_ekstra_disdag_pertanian);
  IF v_aset <> 888 THEN
    RAISE EXCEPTION 'aset terisi % dari 888 — DIBATALKAN.', v_aset;
  END IF;
  RAISE NOTICE 'STEP 2 selesai: aset % baris.', v_aset;

  -- ══ 3. ledger 'saldo_awal' (2025-S2, 2025-12-31) ═════════════════════
  -- Payload BENTUKNYA SAMA PERSIS dgn batch P&M intra (20260716_01) & ekstra
  -- 20260904_02 / 20260905_06 — engine membaca kelima kunci itu lewat cabang
  -- `saldo_awal` di `hitungJadwalAset`.
  INSERT INTO transaksi_bmd (aset_id, jenis, periode, tanggal, nilai, skpd_tujuan, payload, keterangan)
  SELECT a.id, 'saldo_awal', '2025-S2', DATE '2025-12-31', a.nilai_perolehan, a.skpd_id,
         jsonb_build_object(
           'akumulasi_2025',        x.akumulasi_2025,
           'nilai_buku_awal',       x.nilai_buku_awal,
           'sisa_masa_manfaat_smt', x.sisa_masa_manfaat_smt,
           'masa_manfaat_smt',      x.masa_manfaat_smt,
           'beban_per_smt',         x.beban_penyusutan_per_smt,
           'sumber',                'Import PM Ekstrakom 2025 Disdag - Pertanian.xlsx — backfill 2026-09-10'
         ),
         'Baseline — Peralatan dan Mesin (1.3.2) ekstrakomptabel Dinas Pertanian & Perdagangan'
  FROM aset a
  JOIN aset_awal_2026 x ON x.nibar = a.nibar
  WHERE a.cara_perolehan = 'saldo_awal'
    AND a.nibar IN (SELECT nibar FROM stg_import_pm_ekstra_disdag_pertanian)
    AND NOT EXISTS (SELECT 1 FROM transaksi_bmd t WHERE t.aset_id = a.id AND t.jenis = 'saldo_awal');

  SELECT count(*) INTO v_ledger
    FROM transaksi_bmd t JOIN aset a ON a.id = t.aset_id
   WHERE t.jenis = 'saldo_awal' AND a.nibar IN (SELECT nibar FROM stg_import_pm_ekstra_disdag_pertanian);
  IF v_ledger <> 888 THEN
    RAISE EXCEPTION 'transaksi_bmd terisi % dari 888 — DIBATALKAN.', v_ledger;
  END IF;
  RAISE NOTICE 'STEP 3 selesai: transaksi_bmd % baris.', v_ledger;

  -- ══ 4. VERIFIKASI AKHIR — semuanya harus lolos, kalau tidak ROLLBACK ═══
  -- (a) tak ada aset batch ini yang tanpa baris ledger (alarm 20260820_02)
  SELECT count(*) INTO v_yatim FROM aset a
   WHERE a.nibar IN (SELECT nibar FROM stg_import_pm_ekstra_disdag_pertanian)
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
     AND a.nibar IN (SELECT nibar FROM stg_import_pm_ekstra_disdag_pertanian)
     AND ( (t.payload->>'akumulasi_2025')::numeric IS DISTINCT FROM x.akumulasi_2025
        OR (t.payload->>'masa_manfaat_smt')::int   IS DISTINCT FROM x.masa_manfaat_smt
        OR (t.payload->>'beban_per_smt')::numeric  IS DISTINCT FROM x.beban_penyusutan_per_smt
        OR t.nilai                                  IS DISTINCT FROM x.nilai_perolehan );
  IF v_beda_payload > 0 THEN
    RAISE EXCEPTION '% baris payload ledger tidak cocok dgn aset_awal_2026 — DIBATALKAN.', v_beda_payload;
  END IF;

  -- (c) intrakomptabel 1.3.2 TIDAK BOLEH bergeser; ekstra bertambah TEPAT 888
  SELECT count(*) INTO v_intra_after  FROM aset WHERE golongan='1.3.2' AND intra_ekstra='intra'  AND status <> 'draft';
  SELECT count(*) INTO v_ekstra_after FROM aset WHERE golongan='1.3.2' AND intra_ekstra='ekstra' AND status <> 'draft';
  IF v_intra_after <> v_intra_before THEN
    RAISE EXCEPTION 'Intrakomptabel 1.3.2 bergeser % → % — DIBATALKAN.', v_intra_before, v_intra_after;
  END IF;
  IF v_ekstra_after <> v_ekstra_before + 888 THEN
    RAISE EXCEPTION 'Ekstrakomptabel 1.3.2 % → % (harusnya +888) — DIBATALKAN.', v_ekstra_before, v_ekstra_after;
  END IF;

  RAISE NOTICE '✅ SELESAI. aset_awal_2026 %, aset %, transaksi_bmd % — 1.3.2 intra tetap %, ekstra % → %.',
    v_snap, v_aset, v_ledger, v_intra_after, v_ekstra_before, v_ekstra_after;
  RAISE NOTICE '⚠️ LANGKAH BERIKUTNYA: (1) VACUUM (ANALYZE) aset, aset_awal_2026, transaksi_bmd;  (2) jalankan ENGINE 2026-S1 lalu 2026-S2.';
END $$;

-- ── (opsional, di luar blok — VACUUM tak boleh dalam transaksi, 25001) ──────
-- Batch ini kecil (888 baris di tabel 470rb+), jadi VACUUM tak wajib —
-- autovacuum_*_insert_scale_factor untuk ketiga tabel sudah disetel 20260906_01.
-- Tetap disarankan sebagai penutup, konsisten dgn aturan "import massal ditutup
-- VACUUM" (CLAUDE.md). Jalankan sebagai perintah LEPAS:
--   VACUUM (ANALYZE) aset;
--   VACUUM (ANALYZE) aset_awal_2026;
--   VACUUM (ANALYZE) transaksi_bmd;

-- ============================================================================
-- CEK AKHIR (jalankan terpisah, di luar blok DO):
--
--   -- 1. ketiga tabel — harus 888 / 888 / 888:
--   SELECT
--     (SELECT count(*) FROM aset_awal_2026 WHERE nibar IN (SELECT nibar FROM stg_import_pm_ekstra_disdag_pertanian)) AS snapshot,
--     (SELECT count(*) FROM aset          WHERE nibar IN (SELECT nibar FROM stg_import_pm_ekstra_disdag_pertanian)) AS aset,
--     (SELECT count(*) FROM transaksi_bmd t JOIN aset a ON a.id=t.aset_id
--        WHERE t.jenis='saldo_awal' AND a.nibar IN (SELECT nibar FROM stg_import_pm_ekstra_disdag_pertanian))       AS ledger;
--
--   -- 2. keranjang 1.3.2 sesudahnya:
--   SELECT intra_ekstra, count(*) AS n, round(sum(nilai_perolehan)) AS nilai
--     FROM aset WHERE golongan='1.3.2' AND status <> 'draft' GROUP BY 1;
--   -- HARUS: intra  219.254 / 1.376.838.612.470   (TIDAK BERGESER)
--   --        ekstra  52.192 / 7.955.379.800       (51.304 + 888 baris;
--   --                7.692.322.056 + 263.057.744,48)
--
--   -- 3. per SKPD (Saldo Awal → Rekapitulasi, komptabel EKSTRA, 1.3.2):
--   SELECT skpd_id, count(*) n, round(sum(nilai_perolehan)) nilai
--     FROM aset WHERE nibar IN (SELECT nibar FROM stg_import_pm_ekstra_disdag_pertanian)
--     GROUP BY 1;   -- 24 -> 827 ; 25 -> 61
--
--   -- 4. angka baseline utuh sampai ke payload ledger (keempatnya HARUS 0):
--   SELECT count(*) FILTER (WHERE (t.payload->>'akumulasi_2025')::numeric <> x.akumulasi_2025)          AS a,
--          count(*) FILTER (WHERE (t.payload->>'masa_manfaat_smt')::int   <> x.masa_manfaat_smt)         AS b,
--          count(*) FILTER (WHERE (t.payload->>'beban_per_smt')::numeric  <> x.beban_penyusutan_per_smt) AS c,
--          count(*) FILTER (WHERE t.nilai <> x.nilai_perolehan)                                          AS d
--     FROM transaksi_bmd t JOIN aset a ON a.id=t.aset_id
--     JOIN aset_awal_2026 x ON x.nibar=a.nibar
--    WHERE t.jenis='saldo_awal' AND a.nibar IN (SELECT nibar FROM stg_import_pm_ekstra_disdag_pertanian);
--
--   -- 5. ⚠️ JALANKAN ENGINE 2026-S1 lalu 2026-S2, sesudahnya HARUS 0:
--   SELECT count(*) FROM aset a
--     WHERE a.nibar IN (SELECT nibar FROM stg_import_pm_ekstra_disdag_pertanian)
--       AND NOT EXISTS (SELECT 1 FROM penyusutan_semester p
--                        WHERE p.aset_id=a.id AND p.periode='2026-S2');
--   SELECT count(*) FROM penyusutan_semester WHERE akumulasi > nilai_perolehan + 0.5; -- 0
--
--   -- 6. Uji Konsistensi (Pelaporan) 2026-S1 & 2026-S2, komptabel EKSTRA —
--   --    Rekonsiliasi BMD vs Laporan BMD harus tetap 0,00 selisih di semua
--   --    golongan.
--
--   -- 7. Spot-check di layar: Daftar Barang → Jenis 1.3.2, Komptabel
--   --    EKSTRAKOMPTABEL, SKPD "Dinas Pertanian dan Perkebunan" / "Dinas
--   --    Perdagangan dan Perindustrian".
--
-- ══ ROLLBACK ═══════════════════════════════════════════════════════════════
--   -- (i) kalau blok DO gagal di tengah: sudah otomatis ROLLBACK, tak ada
--   --     yang perlu dibersihkan.
--   -- (ii) kalau blok DO SUKSES tapi ingin ditarik SEBELUM engine di-run
--   --      (urut: aset dulu — FK transaksi_bmd/penyusutan_semester → aset):
--   --   DELETE FROM transaksi_bmd WHERE jenis='saldo_awal' AND aset_id IN
--   --     (SELECT id FROM aset WHERE nibar IN (SELECT nibar FROM stg_import_pm_ekstra_disdag_pertanian));
--   --   -- ⚠️ ledger append-only: DELETE di atas DITOLAK trigger
--   --   --    trg_transaksi_bmd_immutable. Begitu STEP 3 sukses, baris ledger
--   --   --    PERMANEN. Untuk menariknya perlakukan seperti salah catat:
--   --   --    koreksi_pencatatan_ganda di-backdate ke 2025 (di-whitelist
--   --   --    fn_cek_tahun_buku) — barang tersembunyi dari SEMUA periode,
--   --   --    ledger tetap utuh. JANGAN matikan trg_transaksi_bmd_immutable
--   --   --    (escape hatch yg sudah direvert, migrasi 20260704_19).
--   --   DELETE FROM aset           WHERE nibar IN (SELECT nibar FROM stg_import_pm_ekstra_disdag_pertanian);
--   --   DELETE FROM aset_awal_2026 WHERE nibar IN (SELECT nibar FROM stg_import_pm_ekstra_disdag_pertanian);
-- ============================================================================
