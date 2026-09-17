-- ============================================================================
-- Import Peralatan & Mesin EKSTRAKOMPTABEL 2025 — DINAS PENDIDIKAN (1.3.2) —
-- TAHAP 2: EKSEKUSI BER-BATCH (2026-09-16). Lanjutan 20260916_02.
--
-- ⚠️⚠️ BEDA BENTUK dari SEMUA batch sebelumnya (20260904/20260905/20260910/
-- 20260914) — yang itu semua SATU blok `DO $$ ... $$` transaksional (aman utk
-- 888–41.820 baris). Batch ini **390.282 baris** — hampir 10× yang terbesar
-- sebelumnya (41.820) yang JUSTRU insiden itulah yang menghabiskan disk
-- project sampai 97% & ~30 menit downtime (lihat memori
-- import_besar_disk_supabase, 2026-09-14). Karena itu di sini: TIGA
-- PROSEDUR ber-LOOP yang commit tiap ±7.000 baris — bukan satu transaksi
-- raksasa.
--
-- ⚠️⚠️ WAJIB DIJALANKAN LEWAT psql, **connection string mode "Session"**
-- (BUKAN Transaction pooler port 6543, BUKAN SQL Editor Supabase Dashboard).
-- Dua alasan sekaligus: (1) SQL Editor membungkus SELURUH skrip dalam SATU
-- transaksi — `COMMIT` di dalam prosedur akan DITOLAK di situ; (2) COMMIT
-- di tengah prosedur butuh koneksi langsung yang stabil ke server Postgres —
-- pooler mode "Transaction" bisa menukar koneksi server di setiap batas
-- transaksi & merusak urutan LOOP-nya.
--
-- Alur: stg_import_pm_ekstra_diknas → aset_awal_2026 → aset → transaksi_bmd
-- ('saldo_awal', periode 2025-S2, tanggal 2025-12-31).
--
-- ⚠️ AMAN DIJALANKAN ULANG / DIHENTIKAN DI TENGAH: tiap `CALL` me-LOOP sampai
-- 0 baris tersisa, ber-guard `NOT EXISTS`, commit tiap batch. Beda dari pola
-- "satu blok, all-or-nothing" — kalau proses mati di tengah (mis. koneksi
-- putus), batch2 yang SUDAH commit tetap ada; panggil ulang `CALL` yang sama
-- dan ia melanjutkan dari sisanya, BUKAN mengulang dari nol.
--
-- ⚠️ ENGINE WAJIB DI-RUN ULANG SESUDAH MIGRASI INI (2026-S1 lalu 2026-S2, menu
-- Penyusutan → "Jalankan Engine"). Tanpa itu 390.282 barang ini TIDAK punya
-- baris `penyusutan_semester` 2026. Mengingat skalanya, PERTIMBANGKAN
-- menjalankan per periode & pantau — kalau UI/API py batas waktu, ini yang
-- paling mungkin kena duluan.
--
-- PRASYARAT: `stg_import_pm_ekstra_diknas` sudah terisi 390.282 baris (lihat
-- 20260916_02) + index nibar/skpd_id sudah dibuat + ANALYZE sudah jalan.
-- ============================================================================

-- ══ 0. PRA-SYARAT — jalankan lebih dulu, READ-ONLY, aman sbg satu blok ═════
DO $$
DECLARE
  v_stg           int;
  v_kepala        int;
  v_skpd_invalid  int;
  v_kode_invalid  int;
  v_bentrok_aset  int;
  v_bentrok_snap  int;
  v_ekstra_before int;
  v_intra_before  int;
BEGIN
  SELECT count(*) INTO v_stg FROM stg_import_pm_ekstra_diknas;
  IF v_stg <> 390282 THEN
    RAISE EXCEPTION 'Staging berisi % baris, harusnya 390282. CSV belum ter-import utuh — TRUNCATE lalu import ulang (20260916_02).', v_stg;
  END IF;

  SELECT count(DISTINCT left(nibar, 8)) INTO v_kepala FROM stg_import_pm_ekstra_diknas;
  IF v_kepala <> 1 OR NOT EXISTS (SELECT 1 FROM stg_import_pm_ekstra_diknas WHERE left(nibar,8) = '12023506') THEN
    RAISE EXCEPTION 'Kepala NIBAR tidak seragam 12023506 (% varian) — CSV yang ter-upload bukan berkas yang benar.', v_kepala;
  END IF;

  IF EXISTS (SELECT 1 FROM stg_import_pm_ekstra_diknas WHERE length(nibar) <> 45) THEN
    RAISE EXCEPTION 'Ada NIBAR yang panjangnya bukan 45 digit.';
  END IF;

  IF EXISTS (SELECT 1 FROM stg_import_pm_ekstra_diknas WHERE golongan <> '1.3.2') THEN
    RAISE EXCEPTION 'Ada baris ber-golongan di luar 1.3.2 — berkas salah.';
  END IF;

  IF EXISTS (SELECT 1 FROM stg_import_pm_ekstra_diknas WHERE intra_ekstra <> 'ekstra') THEN
    RAISE EXCEPTION 'Ada baris ber-intra_ekstra di luar ekstra — berkas salah.';
  END IF;

  SELECT count(*) INTO v_skpd_invalid FROM stg_import_pm_ekstra_diknas s
    LEFT JOIN admin_skpd sk ON sk.id = s.skpd_id WHERE sk.id IS NULL;
  IF v_skpd_invalid > 0 THEN
    RAISE EXCEPTION '% baris ber-skpd_id yang tidak terdaftar di admin_skpd.', v_skpd_invalid;
  END IF;

  SELECT count(DISTINCT s.kode) INTO v_kode_invalid FROM stg_import_pm_ekstra_diknas s
    LEFT JOIN admin_kodefikasi_bmd k ON k.kode = s.kode WHERE k.kode IS NULL;
  IF v_kode_invalid > 0 THEN
    RAISE EXCEPTION '% kode barang tidak terdaftar di admin_kodefikasi_bmd. Jalankan: SELECT DISTINCT s.kode FROM stg_import_pm_ekstra_diknas s LEFT JOIN admin_kodefikasi_bmd k ON k.kode=s.kode WHERE k.kode IS NULL;', v_kode_invalid;
  END IF;

  -- Tabrakan NIBAR — 1.3.2 EKSTRA Diknas dibuktikan 0 baris SEBELUM batch ini
  -- (lihat 20260916_02 poin 5). Diperiksa ULANG terhadap isi staging yang
  -- benar-benar ter-upload — pelajaran 20260819_02: NIBAR bisa berpindah
  -- pemilik & uji "NOT EXISTS" menelan kasus itu diam-diam.
  SELECT count(*) INTO v_bentrok_aset FROM stg_import_pm_ekstra_diknas s JOIN aset a ON a.nibar = s.nibar;
  SELECT count(*) INTO v_bentrok_snap FROM stg_import_pm_ekstra_diknas s JOIN aset_awal_2026 x ON x.nibar = s.nibar;
  IF v_bentrok_aset > 0 OR v_bentrok_snap > 0 THEN
    RAISE EXCEPTION 'Tabrakan NIBAR: % di aset, % di aset_awal_2026. PERIKSA DULU isinya sebelum melanjutkan.', v_bentrok_aset, v_bentrok_snap;
  END IF;

  -- Baseline 1.3.2 SEBELUM (se-Kabupaten, bukan cuma Diknas — dibandingkan
  -- lagi di verifikasi akhir supaya golongan lain tak ikut bergeser).
  SELECT count(*) INTO v_intra_before  FROM aset WHERE golongan='1.3.2' AND intra_ekstra='intra'  AND status <> 'draft';
  SELECT count(*) INTO v_ekstra_before FROM aset WHERE golongan='1.3.2' AND intra_ekstra='ekstra' AND status <> 'draft';

  RAISE NOTICE 'Pra-syarat lolos. Staging % baris; 1.3.2 se-kab sebelum: intra % / ekstra %. Lanjut ke CALL batch_pm_diknas_step1_snapshot(); dst.', v_stg, v_intra_before, v_ekstra_before;
END $$;

-- ══ 1. PROSEDUR step 1: staging → aset_awal_2026 (commit tiap batch) ══════
CREATE OR REPLACE PROCEDURE batch_pm_diknas_step1_snapshot(p_batch_size int DEFAULT 7000)
LANGUAGE plpgsql
AS $proc$
DECLARE
  v_done int;
  v_total int := 0;
BEGIN
  LOOP
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
    FROM stg_import_pm_ekstra_diknas s
    WHERE NOT EXISTS (SELECT 1 FROM aset_awal_2026 x WHERE x.nibar = s.nibar)
    ORDER BY s.nibar
    LIMIT p_batch_size;

    GET DIAGNOSTICS v_done = ROW_COUNT;
    v_total := v_total + v_done;
    RAISE NOTICE '[step1 aset_awal_2026] batch: % baris — total sejauh ini: %', v_done, v_total;
    COMMIT;
    EXIT WHEN v_done = 0;
  END LOOP;
  RAISE NOTICE '[step1 aset_awal_2026] SELESAI — % baris total.', v_total;
END $proc$;

-- ══ 2. PROSEDUR step 2: aset_awal_2026 → aset (commit tiap batch) ═════════
-- `cara_perolehan='saldo_awal'` (baseline), BUKAN dari kolom `asal_usul`
-- berkas — dua kolom berbeda & sengaja tak disinkronkan (CLAUDE.md). Trigger
-- `trg_aset_kode_register` menerbitkan `kode_register` otomatis di sini.
CREATE OR REPLACE PROCEDURE batch_pm_diknas_step2_aset(p_batch_size int DEFAULT 7000)
LANGUAGE plpgsql
AS $proc$
DECLARE
  v_done int;
  v_total int := 0;
BEGIN
  LOOP
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
    JOIN stg_import_pm_ekstra_diknas s ON s.nibar = x.nibar
    WHERE NOT EXISTS (SELECT 1 FROM aset a WHERE a.nibar = x.nibar)
    ORDER BY x.nibar
    LIMIT p_batch_size;

    GET DIAGNOSTICS v_done = ROW_COUNT;
    v_total := v_total + v_done;
    RAISE NOTICE '[step2 aset] batch: % baris — total sejauh ini: %', v_done, v_total;
    COMMIT;
    EXIT WHEN v_done = 0;
  END LOOP;
  RAISE NOTICE '[step2 aset] SELESAI — % baris total.', v_total;
END $proc$;

-- ══ 3. PROSEDUR step 3: aset → transaksi_bmd 'saldo_awal' (commit tiap batch) ══
-- Payload BENTUKNYA SAMA PERSIS dgn batch2 ekstra sebelumnya (20260904_02 /
-- 20260905_06 / 20260910_02 / 20260914_04) — engine membaca kelima kunci itu
-- lewat cabang `saldo_awal` di `hitungJadwalAset`.
CREATE OR REPLACE PROCEDURE batch_pm_diknas_step3_ledger(p_batch_size int DEFAULT 7000)
LANGUAGE plpgsql
AS $proc$
DECLARE
  v_done int;
  v_total int := 0;
BEGIN
  LOOP
    INSERT INTO transaksi_bmd (aset_id, jenis, periode, tanggal, nilai, skpd_tujuan, payload, keterangan)
    SELECT a.id, 'saldo_awal', '2025-S2', DATE '2025-12-31', a.nilai_perolehan, a.skpd_id,
           jsonb_build_object(
             'akumulasi_2025',        x.akumulasi_2025,
             'nilai_buku_awal',       x.nilai_buku_awal,
             'sisa_masa_manfaat_smt', x.sisa_masa_manfaat_smt,
             'masa_manfaat_smt',      x.masa_manfaat_smt,
             'beban_per_smt',         x.beban_penyusutan_per_smt,
             'sumber',                'PM Ekstrakom Diknas.xlsx — backfill 2026-09-16'
           ),
           'Baseline — Peralatan dan Mesin (1.3.2) ekstrakomptabel Dinas Pendidikan'
    FROM aset a
    JOIN aset_awal_2026 x ON x.nibar = a.nibar
    JOIN stg_import_pm_ekstra_diknas s ON s.nibar = a.nibar
    WHERE a.cara_perolehan = 'saldo_awal'
      AND NOT EXISTS (SELECT 1 FROM transaksi_bmd t WHERE t.aset_id = a.id AND t.jenis = 'saldo_awal')
    ORDER BY a.nibar
    LIMIT p_batch_size;

    GET DIAGNOSTICS v_done = ROW_COUNT;
    v_total := v_total + v_done;
    RAISE NOTICE '[step3 transaksi_bmd] batch: % baris — total sejauh ini: %', v_done, v_total;
    COMMIT;
    EXIT WHEN v_done = 0;
  END LOOP;
  RAISE NOTICE '[step3 transaksi_bmd] SELESAI — % baris total.', v_total;
END $proc$;

-- ══ CARA MENJALANKAN (psql, mode Session) ═════════════════════════════════
--   psql "$SUPABASE_DB_URL"
--   \i supabase/migrations/20260916_03_import_pm_ekstra_diknas_eksekusi.sql
--   -- blok PRA-SYARAT & ketiga CREATE PROCEDURE otomatis jalan lewat \i di atas.
--   -- Baru KEMUDIAN, satu per satu (tunggu tiap CALL selesai sebelum lanjut):
--   CALL batch_pm_diknas_step1_snapshot();
--   CALL batch_pm_diknas_step2_aset();
--   CALL batch_pm_diknas_step3_ledger();
--   -- (opsional) pantau progres di sesi psql lain sambil menunggu:
--   --   SELECT count(*) FROM aset_awal_2026 a JOIN stg_import_pm_ekstra_diknas s ON s.nibar=a.nibar;
--   --   SELECT count(*) FROM aset a JOIN stg_import_pm_ekstra_diknas s ON s.nibar=a.nibar;
-- ============================================================================

-- ── (WAJIB, di luar transaksi — VACUUM tak boleh dalam transaksi, 25001) ────
-- Batch ini JAUH lebih besar dari ambang "boleh dilewatkan" (888 baris) —
-- ikuti aturan "import massal WAJIB DITUTUP VACUUM (ANALYZE)" (CLAUDE.md,
-- insiden 2026-09-06: n_ins_since_vacuum besar tanpa VACUUM = Index Only Scan
-- berhenti index-only, "Heap Fetches" meledak, halaman jadi "kadang lambat").
-- Jalankan sesudah KETIGA CALL di atas selesai, sbg perintah LEPAS (psql, di
-- luar `\i` manapun yg sedang membungkusnya dlm transaksi):
--   VACUUM (ANALYZE) aset;
--   VACUUM (ANALYZE) aset_awal_2026;
--   VACUUM (ANALYZE) transaksi_bmd;

-- ══ CEK AKHIR (jalankan terpisah, di luar transaksi apa pun) ═══════════════
--   -- 1. ketiga tabel — harus 390282 / 390282 / 390282:
--   SELECT
--     (SELECT count(*) FROM aset_awal_2026 x JOIN stg_import_pm_ekstra_diknas s ON s.nibar=x.nibar) AS snapshot,
--     (SELECT count(*) FROM aset          a JOIN stg_import_pm_ekstra_diknas s ON s.nibar=a.nibar) AS aset,
--     (SELECT count(*) FROM transaksi_bmd t JOIN aset a ON a.id=t.aset_id
--        JOIN stg_import_pm_ekstra_diknas s ON s.nibar=a.nibar
--        WHERE t.jenis='saldo_awal') AS ledger;
--
--   -- 2. keranjang 1.3.2 sesudahnya (se-Kabupaten):
--   SELECT intra_ekstra, count(*) AS n, round(sum(nilai_perolehan)) AS nilai
--     FROM aset WHERE golongan='1.3.2' AND status <> 'draft' GROUP BY 1;
--   -- HARUS: intra TIDAK BERGESER dari sebelum migrasi;
--   --        ekstra bertambah tepat 390.282 baris / Rp33.624.949.449,55
--
--   -- 3. angka baseline utuh sampai ke payload ledger (keempatnya HARUS 0):
--   SELECT count(*) FILTER (WHERE (t.payload->>'akumulasi_2025')::numeric <> x.akumulasi_2025)          AS a,
--          count(*) FILTER (WHERE (t.payload->>'masa_manfaat_smt')::int   <> x.masa_manfaat_smt)         AS b,
--          count(*) FILTER (WHERE (t.payload->>'beban_per_smt')::numeric  <> x.beban_penyusutan_per_smt) AS c,
--          count(*) FILTER (WHERE t.nilai <> x.nilai_perolehan)                                          AS d
--     FROM transaksi_bmd t JOIN aset a ON a.id=t.aset_id
--     JOIN aset_awal_2026 x ON x.nibar=a.nibar
--     JOIN stg_import_pm_ekstra_diknas s ON s.nibar=a.nibar
--    WHERE t.jenis='saldo_awal';
--
--   -- 4. tak ada aset batch ini yang tanpa baris ledger (alarm 20260820_02) — HARUS 0:
--   SELECT count(*) FROM aset a JOIN stg_import_pm_ekstra_diknas s ON s.nibar=a.nibar
--     WHERE NOT EXISTS (SELECT 1 FROM transaksi_bmd t WHERE t.aset_id=a.id AND t.jenis='saldo_awal');
--
--   -- 5. ⚠️ JALANKAN ENGINE 2026-S1 lalu 2026-S2, sesudahnya HARUS 0:
--   SELECT count(*) FROM aset a JOIN stg_import_pm_ekstra_diknas s ON s.nibar=a.nibar
--     WHERE NOT EXISTS (SELECT 1 FROM penyusutan_semester p
--                        WHERE p.aset_id=a.id AND p.periode='2026-S2');
--   SELECT count(*) FROM penyusutan_semester WHERE akumulasi > nilai_perolehan + 0.5; -- 0
--
--   -- 6. Uji Konsistensi (Pelaporan) 2026-S1 & 2026-S2, komptabel EKSTRA —
--   --    Rekonsiliasi BMD vs Laporan BMD harus tetap 0,00 selisih di semua golongan.
--
--   -- 7. Spot-check di layar: Daftar Barang → Jenis 1.3.2, Komptabel
--   --    EKSTRAKOMPTABEL, SKPD "Dinas Pendidikan" (+ beberapa sub-unit acak,
--   --    mis. salah satu SMPN dari daftar skpd_id di 20260916_02).
--
--   -- 8. (opsional, setelah selesai & tak diperlukan lagi) hapus prosedur:
--   DROP PROCEDURE IF EXISTS batch_pm_diknas_step1_snapshot(int);
--   DROP PROCEDURE IF EXISTS batch_pm_diknas_step2_aset(int);
--   DROP PROCEDURE IF EXISTS batch_pm_diknas_step3_ledger(int);
--
-- ══ ROLLBACK ═══════════════════════════════════════════════════════════════
--   -- (i) kalau salah satu CALL berhenti di tengah (mis. koneksi putus):
--   --     batch2 yg SUDAH ter-commit TETAP ADA — panggil ulang CALL yang
--   --     sama, ia melanjutkan dari sisanya (guard NOT EXISTS), BUKAN
--   --     rollback otomatis spt pola blok DO tunggal di batch2 sebelumnya.
--   -- (ii) kalau SEMUA step sukses tapi ingin ditarik SEBELUM engine di-run
--   --      (urut: aset dulu — FK transaksi_bmd/penyusutan_semester → aset):
--   --   DELETE FROM transaksi_bmd WHERE jenis='saldo_awal' AND aset_id IN
--   --     (SELECT a.id FROM aset a JOIN stg_import_pm_ekstra_diknas s ON s.nibar=a.nibar);
--   --   -- ⚠️ ledger append-only: DELETE di atas DITOLAK trigger
--   --   --    trg_transaksi_bmd_immutable. Begitu STEP 3 sukses utk sebagian
--   --   --    baris, baris ledger itu PERMANEN. Untuk menariknya perlakukan
--   --   --    spt salah catat: koreksi_pencatatan_ganda di-backdate ke 2025
--   --   --    (di-whitelist fn_cek_tahun_buku) — barang tersembunyi dari
--   --   --    SEMUA periode, ledger tetap utuh. JANGAN matikan
--   --   --    trg_transaksi_bmd_immutable (escape hatch yg sudah direvert,
--   --   --    migrasi 20260704_19).
--   --   DELETE FROM aset           WHERE nibar IN (SELECT nibar FROM stg_import_pm_ekstra_diknas);
--   --   DELETE FROM aset_awal_2026 WHERE nibar IN (SELECT nibar FROM stg_import_pm_ekstra_diknas);
-- ============================================================================
