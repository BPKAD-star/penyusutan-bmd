-- ============================================================================
-- Import ATL Dinas Pendidikan PEROLEHAN 2025 (1.3.5) — TAHAP 2: EKSEKUSI
-- PER BATCH (2026-10-07). Lanjutan 20261007_01.
--
-- Alur per barang: stg_import_atl_diknas_2025 → aset_awal_2026 → aset →
-- transaksi_bmd ('saldo_awal', periode 2025-S2, tanggal 2025-12-31).
--
-- ⚠️ KENAPA PER BATCH: versi sekali-jalan kena "SQL query ran into an
-- upstream timeout" di SQL Editor (2026-10-07). Bukan macet — DIUKUR: ±14 ms
-- per barang (trigger kode register di `aset` + guard tahun buku di ledger),
-- jadi 17.771 barang ≈ 4–5 menit, lewat batas gateway SQL Editor. Transaksi
-- itu ROLLBACK utuh (diverifikasi: 0 baris di ketiga tabel).
--
-- CARA PAKAI: tekan RUN BERULANG sampai tabel hasil di bawah menunjukkan
-- `sisa = 0` dan `status = '✅ SELESAI ...'`. Tiap Run memproses ≤ BATCH
-- barang (± 30 detik) — ketiga tabel untuk barang-barang itu ditulis dalam
-- SATU transaksi, jadi tak pernah ada aset tanpa ledger (insiden 20260820_02).
-- Run yang gagal di tengah ROLLBACK sendiri; tekan Run lagi melanjutkan dari
-- sisa yang belum masuk. Pemeriksaan akhir menyeluruh berjalan otomatis pada
-- Run yang menghabiskan sisanya.
--
-- Bentuk baseline SAMA PERSIS dgn batch ATL Diknas 20260720_02: ATL tidak
-- disusutkan → akumulasi_2025 = 0, nilai_buku_awal = nilai_perolehan,
-- masa_manfaat/sisa/beban NULL di payload. ENGINE TIDAK PERLU di-run ulang.
-- ============================================================================

DO $$
DECLARE
  -- Diuji ke produksi (dry-run ROLLBACK): 2.500 barang = 39 dtk. 2.000 dipilih
  -- supaya ada ruang kalau server sedang lambat (~9 kali Run). Turunkan ke
  -- 1000 kalau masih kena upstream timeout.
  BATCH    CONSTANT int := 2000;
  N        CONSTANT int := 17771;
  N_INTRA  CONSTANT int := 6974;
  N_EKSTRA CONSTANT int := 10797;
  SUMBER   CONSTANT text := 'DB ATL Dinas Pendidikan 2025.xlsx — backfill 2026-10-07';
  v_n      int;
  v_cek    int;
  v_total  numeric;
BEGIN
  -- ══ 0. PRA-SYARAT (murah, diulang tiap Run) ════════════════════════════
  IF (SELECT count(*) FROM stg_import_atl_diknas_2025) <> N
  OR (SELECT count(DISTINCT nibar) FROM stg_import_atl_diknas_2025) <> N THEN
    RAISE EXCEPTION 'Staging bukan % NIBAR unik. TRUNCATE lalu import ulang CSV (20261007_01).', N;
  END IF;

  SELECT count(*) INTO v_cek FROM stg_import_atl_diknas_2025
   WHERE nibar !~ '^\d{45}$'
      OR NOT ((left(nibar,8) = '12013506' AND intra_ekstra = 'intra')
           OR (left(nibar,8) = '12023506' AND intra_ekstra = 'ekstra'))
      OR golongan IS DISTINCT FROM '1.3.5'
      OR tgl_perolehan IS NULL OR tgl_perolehan NOT BETWEEN DATE '2025-01-01' AND DATE '2025-12-31'
      OR substring(nibar FROM 23 FOR 4) <> '2025'
      OR substring(nibar FROM 27 FOR 12) <> left(rpad(regexp_replace(kode,'\D','','g'),12,'0'),12)
      OR nilai_perolehan IS NULL OR nilai_perolehan <= 0
      OR jumlah IS DISTINCT FROM 1 OR harga_satuan IS DISTINCT FROM nilai_perolehan;
  IF v_cek > 0 THEN
    RAISE EXCEPTION '% baris staging tidak sesuai bentuk yang dianalisis.', v_cek;
  END IF;

  SELECT sum(nilai_perolehan) INTO v_total FROM stg_import_atl_diknas_2025;
  IF v_total <> 11217056855 THEN
    RAISE EXCEPTION 'Total nilai staging Rp% (harusnya Rp11.217.056.855).', v_total;
  END IF;

  SELECT count(*) INTO v_cek FROM stg_import_atl_diknas_2025 s
    LEFT JOIN admin_skpd sk ON sk.id = s.skpd_id
   WHERE sk.id IS NULL OR NOT (sk.path <@ (SELECT path FROM admin_skpd WHERE id = 2));
  IF v_cek > 0 THEN
    RAISE EXCEPTION '% baris ber-skpd_id tak terdaftar atau di LUAR subtree Dinas Pendidikan.', v_cek;
  END IF;

  SELECT count(DISTINCT s.kode) INTO v_cek FROM stg_import_atl_diknas_2025 s
    LEFT JOIN admin_kodefikasi_bmd k ON k.kode = s.kode WHERE k.kode IS NULL;
  IF v_cek > 0 THEN
    RAISE EXCEPTION '% kode barang tidak terdaftar di admin_kodefikasi_bmd.', v_cek;
  END IF;

  -- Konsistensi Run sebelumnya: setiap aset ber-NIBAR staging WAJIB punya
  -- ledger dari batch INI. Yang tak punya = barang ASING yang kebetulan ber-
  -- NIBAR sama (tabrakan sungguhan) → berhenti.
  SELECT count(*) INTO v_cek FROM aset a
   WHERE a.nibar IN (SELECT nibar FROM stg_import_atl_diknas_2025)
     AND NOT EXISTS (SELECT 1 FROM transaksi_bmd t WHERE t.aset_id = a.id
                      AND t.jenis = 'saldo_awal' AND t.payload->>'sumber' = SUMBER);
  IF v_cek > 0 THEN
    RAISE EXCEPTION 'Tabrakan: % aset ber-NIBAR staging bukan milik batch ini. PERIKSA DULU.', v_cek;
  END IF;

  -- ══ 1. PILIH BATCH: barang yang belum ada di `aset` ═══════════════════
  CREATE TEMP TABLE b_atl25 ON COMMIT DROP AS
    SELECT s.* FROM stg_import_atl_diknas_2025 s
     WHERE NOT EXISTS (SELECT 1 FROM aset a WHERE a.nibar = s.nibar)
     ORDER BY s.nibar
     LIMIT BATCH;
  SELECT count(*) INTO v_n FROM b_atl25;

  IF v_n > 0 THEN
    -- Tabrakan di dalam batch: snapshot ber-NIBAR sama, atau NIBAR yang sudah
    -- jadi kode register barang lain (trigger akan mewarisinya, UNIQUE).
    SELECT count(*) INTO v_cek FROM b_atl25 b
     WHERE EXISTS (SELECT 1 FROM aset_awal_2026 x WHERE x.nibar = b.nibar)
        OR EXISTS (SELECT 1 FROM aset a WHERE a.kode_register = b.nibar);
    IF v_cek > 0 THEN
      RAISE EXCEPTION 'Tabrakan: % NIBAR batch sudah ada di aset_awal_2026 / kode_register. PERIKSA DULU.', v_cek;
    END IF;

    -- ── 1a. → aset_awal_2026
    INSERT INTO aset_awal_2026 (
      nibar, kode, nama_barang, skpd_id, nilai_perolehan, intra_ekstra, tgl_perolehan,
      akumulasi_2025, nilai_buku_awal, spesifikasi_lainnya, merek_tipe, alamat_detail,
      uraian_barang, keterangan, jumlah, satuan, harga_satuan,
      asal_usul, kondisi_barang, tahun_pengadaan, golongan
    )
    SELECT
      b.nibar, b.kode, b.nama_barang, b.skpd_id, b.nilai_perolehan, b.intra_ekstra, b.tgl_perolehan,
      0, b.nilai_perolehan,
      NULLIF(b.spesifikasi_lainnya, ''), NULLIF(b.merek_tipe, ''), NULLIF(b.alamat_detail, ''),
      COALESCE(NULLIF(b.uraian_barang, ''), b.kode), NULLIF(b.keterangan, ''),
      b.jumlah, NULLIF(b.satuan, ''), b.harga_satuan,
      NULLIF(b.asal_usul, ''), NULLIF(b.kondisi_barang, ''), b.tahun_pengadaan, b.golongan
    FROM b_atl25 b;

    -- ── 1b. → aset (`cara_perolehan='saldo_awal'`, BUKAN dari `asal_usul`;
    --        trigger trg_aset_kode_register menerbitkan kode_register = NIBAR)
    INSERT INTO aset (
      nibar, kode, nama_barang, nilai_perolehan, tgl_perolehan, skpd_id, intra_ekstra,
      cara_perolehan, status, jumlah, satuan, harga_satuan,
      spesifikasi_lainnya, merek_tipe, alamat_detail, uraian_barang, keterangan,
      asal_usul, kondisi_barang, tahun_pengadaan
    )
    SELECT
      x.nibar, x.kode, x.nama_barang, x.nilai_perolehan, x.tgl_perolehan, x.skpd_id, x.intra_ekstra,
      'saldo_awal', 'aktif', x.jumlah, x.satuan, x.harga_satuan,
      x.spesifikasi_lainnya, x.merek_tipe, x.alamat_detail, x.uraian_barang, x.keterangan,
      x.asal_usul, x.kondisi_barang, x.tahun_pengadaan
    FROM aset_awal_2026 x
    WHERE x.nibar IN (SELECT nibar FROM b_atl25);

    -- ── 1c. → ledger 'saldo_awal' (payload SAMA PERSIS dgn 20260720_02)
    INSERT INTO transaksi_bmd (aset_id, jenis, periode, tanggal, nilai, skpd_tujuan, payload, keterangan)
    SELECT a.id, 'saldo_awal', '2025-S2', DATE '2025-12-31', a.nilai_perolehan, a.skpd_id,
           jsonb_build_object(
             'akumulasi_2025',        0,
             'nilai_buku_awal',       a.nilai_perolehan,
             'sisa_masa_manfaat_smt', NULL,
             'masa_manfaat_smt',      NULL,
             'beban_per_smt',         NULL,
             'sumber',                SUMBER
           ),
           'Baseline — ATL Diknas perolehan 2025 (1.3.5), tidak disusutkan'
    FROM aset a
    WHERE a.nibar IN (SELECT nibar FROM b_atl25);

    -- ── 1d. assertion batch: ketiga tabel tepat v_n, kode register = NIBAR
    SELECT count(*) INTO v_cek FROM aset_awal_2026 WHERE nibar IN (SELECT nibar FROM b_atl25);
    IF v_cek <> v_n THEN RAISE EXCEPTION 'Batch: aset_awal_2026 % dari % — DIBATALKAN.', v_cek, v_n; END IF;

    SELECT count(*) INTO v_cek FROM aset a
     WHERE a.nibar IN (SELECT nibar FROM b_atl25) AND a.kode_register = a.nibar;
    IF v_cek <> v_n THEN RAISE EXCEPTION 'Batch: aset ber-kode register = NIBAR % dari % — DIBATALKAN.', v_cek, v_n; END IF;

    SELECT count(*) INTO v_cek FROM transaksi_bmd t JOIN aset a ON a.id = t.aset_id
     WHERE t.jenis = 'saldo_awal' AND t.payload->>'sumber' = SUMBER
       AND a.nibar IN (SELECT nibar FROM b_atl25);
    IF v_cek <> v_n THEN RAISE EXCEPTION 'Batch: ledger % dari % — DIBATALKAN.', v_cek, v_n; END IF;
  END IF;

  -- ══ 2. VERIFIKASI AKHIR — hanya kalau semuanya sudah masuk ═════════════
  IF NOT EXISTS (SELECT 1 FROM stg_import_atl_diknas_2025 s
                  WHERE NOT EXISTS (SELECT 1 FROM aset a WHERE a.nibar = s.nibar)) THEN
    SELECT count(*) INTO v_cek FROM aset_awal_2026 WHERE nibar IN (SELECT nibar FROM stg_import_atl_diknas_2025);
    IF v_cek <> N THEN RAISE EXCEPTION 'Akhir: aset_awal_2026 % dari %.', v_cek, N; END IF;

    SELECT count(*) INTO v_cek FROM aset a
     WHERE a.nibar IN (SELECT nibar FROM stg_import_atl_diknas_2025)
       AND a.status = 'aktif' AND a.kode_register = a.nibar;
    IF v_cek <> N THEN RAISE EXCEPTION 'Akhir: aset aktif ber-kode register = NIBAR % dari %.', v_cek, N; END IF;

    IF (SELECT count(*) FROM aset WHERE intra_ekstra = 'intra'
          AND nibar IN (SELECT nibar FROM stg_import_atl_diknas_2025)) <> N_INTRA
    OR (SELECT count(*) FROM aset WHERE intra_ekstra = 'ekstra'
          AND nibar IN (SELECT nibar FROM stg_import_atl_diknas_2025)) <> N_EKSTRA THEN
      RAISE EXCEPTION 'Akhir: komposisi intra/ekstra di aset tidak % / %.', N_INTRA, N_EKSTRA;
    END IF;

    SELECT count(*) INTO v_cek
      FROM transaksi_bmd t
      JOIN aset a ON a.id = t.aset_id
      JOIN aset_awal_2026 x ON x.nibar = a.nibar
     WHERE t.jenis = 'saldo_awal' AND t.payload->>'sumber' = SUMBER
       AND ( (t.payload->>'nilai_buku_awal')::numeric IS DISTINCT FROM x.nilai_perolehan
          OR (t.payload->>'akumulasi_2025')::numeric  IS DISTINCT FROM 0
          OR t.nilai IS DISTINCT FROM x.nilai_perolehan
          OR a.nilai_perolehan IS DISTINCT FROM x.nilai_perolehan );
    IF v_cek > 0 THEN RAISE EXCEPTION 'Akhir: % baris angka ledger/register tidak cocok.', v_cek; END IF;

    IF (SELECT count(*) FROM transaksi_bmd WHERE jenis = 'saldo_awal' AND payload->>'sumber' = SUMBER) <> N THEN
      RAISE EXCEPTION 'Akhir: jumlah baris ledger batch ini bukan %.', N;
    END IF;

    IF (SELECT sum(a.nilai_perolehan) FROM aset a
         WHERE a.nibar IN (SELECT nibar FROM stg_import_atl_diknas_2025)) <> 11217056855 THEN
      RAISE EXCEPTION 'Akhir: total nilai di aset bukan Rp11.217.056.855.';
    END IF;
  END IF;
END $$;

-- ── PROGRES (ditampilkan di tab Results tiap Run) ───────────────────────────
SELECT
  (SELECT count(*) FROM aset WHERE nibar IN (SELECT nibar FROM stg_import_atl_diknas_2025)) AS sudah_masuk,
  17771 - (SELECT count(*) FROM aset WHERE nibar IN (SELECT nibar FROM stg_import_atl_diknas_2025)) AS sisa,
  CASE WHEN (SELECT count(*) FROM aset WHERE nibar IN (SELECT nibar FROM stg_import_atl_diknas_2025)) = 17771
       THEN '✅ SELESAI — lolos verifikasi akhir. Lanjut VACUUM (ANALYZE) ketiga tabel.'
       ELSE '⏳ Belum selesai — tekan Run lagi.' END AS status;

-- ── (WAJIB sesudah SELESAI, di luar blok — VACUUM tak boleh dalam transaksi)
-- Aturan "import massal WAJIB DITUTUP VACUUM (ANALYZE)" (CLAUDE.md, insiden
-- 2026-09-06). Jalankan sbg perintah LEPAS, satu per satu, di tab baru:
--   VACUUM (ANALYZE) aset;
--   VACUUM (ANALYZE) aset_awal_2026;
--   VACUUM (ANALYZE) transaksi_bmd;
--
-- Spot-check layar: Daftar Barang → Dinas Pendidikan → 1.3.5, Semester
-- 2026-S1, Komptabel Intra lalu Ekstra — tgl perolehan 2025 harus tampil.
-- Saldo Awal → Rekapitulasi Diknas 1.3.5 naik Rp11.217.056.855
-- (intra Rp4.956.976.347 · ekstra Rp6.260.080.508).
--
-- Sesudah lolos & dicek, staging boleh dibuang:
--   DROP TABLE stg_import_atl_diknas_2025;
--
-- ══ ROLLBACK ═══════════════════════════════════════════════════════════════
--   (i) Run gagal di tengah → batch itu otomatis ROLLBACK; Run lagi lanjut.
--   (ii) Sudah masuk tapi ingin ditarik: ledger append-only (trigger
--        trg_transaksi_bmd_immutable), jadi perlakukan seperti salah catat —
--        koreksi_pencatatan_ganda di-backdate ke 2025 (whitelisted
--        fn_cek_tahun_buku). JANGAN matikan trigger immutable.
-- ============================================================================
