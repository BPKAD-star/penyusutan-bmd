-- ============================================================================
-- Import Peralatan & Mesin EKSTRAKOMPTABEL 2025 — DINAS PERTANIAN & PERKEBUNAN
-- + DINAS PERDAGANGAN & PERINDUSTRIAN (golongan 1.3.2) — TAHAP 1: staging
-- (2026-09-10).
--
-- Batch KEKURANGAN DATA — dua SKPD yang belum ikut batch P&M ekstra sebelumnya
-- (20260904_01/02 = 28.502 baris/61 SKPD; 20260905_04..06 = Dinkes 22.795).
-- Sumber: `Import PM Ekstrakom 2025 Disdag - Pertanian.xlsx` (sheet 'Import',
-- 28.505 baris termasuk 27.617 baris kosong di ekor → **888 baris data**,
-- 40 kolom) → dibersihkan ke
-- `arsip-import/stg_import_pm_ekstra_disdag_pertanian.csv` (28 kolom).
-- Pola SAMA PERSIS dgn 20260905_04: staging → aset_awal_2026 → aset →
-- transaksi_bmd ('saldo_awal', periode 2025-S2, tanggal 2025-12-31 —
-- retroaktif, sudah di-whitelist `fn_cek_tahun_buku`).
--
-- ⚠️ 1.3.2 DISUSUTKAN & ekstrakomptabel IKUT disusutkan (CLAUDE.md), jadi
-- masa_manfaat_smt / akumulasi_2025 / sisa_masa_manfaat_smt / beban per
-- semester WAJIB ikut ke payload ledger — TIDAK boleh NULL. Konsekuensinya
-- ENGINE WAJIB DI-RUN ULANG (2026-S1 lalu 2026-S2) sesudah TAHAP 2.
--
-- ══ HASIL ANALISIS PENUH BERKAS (888/888 baris, bukan sampel) ═════════════
--   1. 27.617 baris kosong di ekor (seluruh 40 kolom NULL) — DIBUANG saat CSV
--      dibuat, tidak dibawa ke staging.
--   2. NIBAR 100% unik (888 nilai), semua 45 digit, kepala SERAGAM `12023506`
--      = [12][02=ekstra][3506=Kab. Kediri]. Segmen SKPD: `23…` (Dinas
--      Pertanian) & `24…` (Dinas Perdagangan) — sesuai `kode_skpd` keduanya.
--      Tak perlu normalisasi kepala seperti revisi pertama 20260904.
--   3. **Tabrakan NIBAR terhadap `aset`/`aset_awal_2026` = 0, DIBUKTIKAN
--      EKSAK.** NIBAR DB berprefix-SKPD sama (`1202350623%` / `1202350624%`)
--      ada **12 baris** (3 Pertanian + 9 Perdagangan) — SEMUANYA bersegmen
--      kode `133` (Gedung & Bangunan ekstra, batch 20260819_04/05). Seluruh
--      888 NIBAR berkas ini bersegmen `132`. Dicek satu per satu: 0 overlap.
--      (Pelajaran 20260819_02: NIBAR bisa berpindah pemilik → yang diperiksa
--      NIBAR PERSISnya, bukan sekadar "SKPD-nya belum punya P&M ekstra".)
--   4. Kedua SKPD (id 24 = "Dinas Pertanian dan Perkebunan", 25 = "Dinas
--      Perdagangan dan Perindustrian"; keduanya top-level, parent_id NULL) per
--      2026-09-10 punya **0 baris** `aset` golongan 1.3.2 EKSTRAKOMPTABEL →
--      batch ini mengisi keranjang yang benar-benar kosong. (Keduanya punya
--      4.882 baris 1.3.2 INTRA aktif — tak disentuh batch ini.)
--   5. Identitas angka UTUH sesudah pembulatan, 0 pengecualian:
--        nilai_buku_awal = nilai_perolehan − akumulasi_2025 ......... 0 beda
--        jumlah × harga_satuan = nilai_perolehan ................... 0 beda
--        akumulasi_2025 > nilai_perolehan (ALARM CLAUDE.md) ........ 0 baris
--        nilai_perolehan <= 0 ...................................... 0 baris
--        sisa_masa_manfaat_smt > masa_manfaat_smt .................. 0 baris
--        masa_manfaat_smt / beban_per_smt NULL ..................... 0 baris
--      TOTAL (sesudah dibulatkan): perolehan Rp263.057.744,48 ·
--        akumulasi Rp244.000.796,98 · nilai buku Rp19.056.947,50
--   6. intra_ekstra 100% "Ekstra" → di-lowercase 'ekstra' saat CSV dibuat
--      (CHECK `saldo_awal_2026_intra_ekstra_check` cuma menerima huruf kecil).
--      TIDAK dihitung ulang dari `batas_kapitalisasi` — pelajaran 20260716_04.
--   7. golongan 100% "1.3.2"; kondisi_barang 100% "Baik"; jumlah SELALU 1;
--      satuan: unit 490 · Buah 396 · set 2.
--   8. asal_usul: Pengadaan APBD 696 · Hibah 192. Kolom BEBAS (tak ber-CHECK),
--      dipertahankan apa adanya — `cara_perolehan` sendiri diisi 'saldo_awal'
--      di TAHAP 2 (CLAUDE.md: dua kolom berbeda, sengaja TIDAK disinkronkan).
--   9. tgl_perolehan 1960-06-30 s.d. 2025-10-08 — tak ada yang di masa depan,
--      aman untuk ledger retroaktif 2025-S2.
--  10. `tahun_pengadaan` di berkas = TANGGAL serial Excel (bukan tahun
--      telanjang seperti sebagian baris Dinkes). Diambil `.year`-nya saat CSV
--      dibuat: rentang 1960–2025, 0 NULL, **0 baris berbeda tahun dari
--      `tgl_perolehan`**, semua lolos CHECK `aset_awal_2026_tahun_pengadaan_
--      check` (1900..2100).
--  11. 40 kode barang berbeda — SEMUANYA terdaftar di `admin_kodefikasi_bmd`
--      (diperiksa eksak 2026-09-10, 0 yang tak terdaftar). Diperiksa ULANG di
--      TAHAP 2 terhadap isi staging yang benar-benar ter-upload.
--  12. 2 skpd_id: id 24 (827 baris) & id 25 (61 baris). Keduanya VALID di
--      `admin_skpd`.
--
-- ══ DIBULATKAN KE 2 DESIMAL SAAT CSV DIBUAT ═══════════════════════════════
-- 130 baris menyimpan hasil pembagian floating-point mentah (mis.
-- `283910.52632`, sampai 5 desimal). `nilai_perolehan`, `akumulasi_2025`,
-- `beban_penyusutan_per_smt` dibulatkan (ROUND_HALF_UP) ke 2 desimal;
-- `nilai_buku_awal` **DITURUNKAN** dari kedua angka yang SUDAH dibulatkan
-- (`nilai_perolehan − akumulasi_2025`), dan `harga_satuan` diturunkan dari
-- `nilai_perolehan / jumlah` (jumlah selalu 1 → identik). Sama seperti
-- 20260905_04, supaya identitas `nilai_buku = perolehan − akumulasi` yang
-- dipakai Rekonsiliasi & Uji Konsistensi tetap eksak. Sesudah cara ini
-- (dibaca ULANG dari CSV hasilnya): 0 baris meleset, 0 kolom money berdesimal
-- > 2, 0 kolom integer masih pecahan.
--
-- ══ KOLOM INTEGER — 0 derau float (BEDA dari Dinkes) ═════════════════════
-- `masa_manfaat_smt`, `sisa_masa_manfaat_smt`, `jumlah`, `tahun_pengadaan`,
-- `skpd_id` diperiksa: ke-5-nya sudah bulat di berkas, 0 baris menyimpang.
-- Tetap di-`round()` saat CSV dibuat sebagai jaring pengaman.
--
-- ══ KOLOM YANG DIBUANG SAAT PEMBERSIHAN (bukan kelalaian) ═════════════════
--   · 100% KOSONG di seluruh berkas : created_at, foto_paths
--   · 100% berisi literal "-"       : luas, nomor/tanggal/nama_dokumen_
--     kepemilikan, jenis_hak, wilayah_kode, latitude, longitude, pemanfaatan
--   · alamat_detail : 841 kosong, 17 berisi "~", 30 berisi teks alamat.
--     DIBUANG — konsisten dgn seluruh batch P&M ekstra sebelumnya (20260904,
--     20260905): P&M itu barang BERGERAK, alamat tak bermakna, dan 17 "~" jelas
--     derau. Kolom `aset.alamat_detail` tetap NULL untuk 888 baris ini.
-- "-" DIJADIKAN KOSONG: kolom numerik menolak "-", kolom text menyimpan tanda
-- hubung yang lalu tampil di layar & Excel seolah data.
--
-- PRASYARAT (WAJIB, urut):
--   (a) `fn_cek_tahun_buku` sudah mem-whitelist 'saldo_awal' retroaktif
--       (sudah dipakai batch 20260904/20260905, terverifikasi ada di produksi).
--   (b) Import `arsip-import/stg_import_pm_ekstra_disdag_pertanian.csv` (~200 KB)
--       lewat Table Editor → Import data from CSV ke tabel
--       `stg_import_pm_ekstra_disdag_pertanian` yang dibuat di bawah.
--   (c) Blok VERIFIKASI PRA-SYARAT di TAHAP 2 (20260910_02) menghasilkan
--       hasil aman.
-- Re-runnable / idempotent (guard NOT EXISTS ada di TAHAP 2; TRUNCATE di bawah
-- aman diulang — staging bukan tabel append-only).
--
-- ⚠️ TABEL STAGING SENDIRI (bukan menumpang batch sebelumnya): asal berkas &
-- tanggal verifikasi berbeda. Kalau menumpang, verifikasi "berapa baris batch
-- ini" & rollback per-batch jadi mustahil dibedakan.
-- ============================================================================

CREATE TABLE IF NOT EXISTS stg_import_pm_ekstra_disdag_pertanian (
  nibar                    text,
  kode                     text,
  nama_barang              text,
  skpd_id                  bigint,
  intra_ekstra             text,
  nilai_perolehan          numeric,
  tgl_perolehan            date,
  masa_manfaat_smt         smallint,
  akumulasi_2025           numeric,
  nilai_buku_awal          numeric,
  sisa_masa_manfaat_smt    smallint,
  beban_penyusutan_per_smt numeric,
  spesifikasi_lainnya      text,
  merek_tipe               text,
  no_polisi                text,
  no_bpkb                  text,
  no_rangka                text,
  no_mesin                 text,
  uraian_barang            text,
  keterangan               text,
  jumlah                   int,
  satuan                   text,
  harga_satuan             numeric,
  penggunaan_pengamanan    text,
  asal_usul                text,
  kondisi_barang           text,
  tahun_pengadaan          smallint,
  golongan                 text
);

-- Aman diulang (mis. kalau CSV perlu di-import ulang karena berkasnya direvisi).
TRUNCATE TABLE stg_import_pm_ekstra_disdag_pertanian;

-- ── Verifikasi SESUDAH CSV diimpor (jalankan semua sebelum TAHAP 2) ────────
--   SELECT count(*) FROM stg_import_pm_ekstra_disdag_pertanian;                 -- 888
--   SELECT count(DISTINCT nibar) FROM stg_import_pm_ekstra_disdag_pertanian;    -- 888
--   SELECT left(nibar,8) AS kepala, count(*) FROM stg_import_pm_ekstra_disdag_pertanian
--     GROUP BY 1;                                             -- HANYA 12023506
--   SELECT count(*) FROM stg_import_pm_ekstra_disdag_pertanian WHERE length(nibar)<>45; -- 0
--   SELECT skpd_id, count(*) FROM stg_import_pm_ekstra_disdag_pertanian GROUP BY 1;
--     -- 24 -> 827 ; 25 -> 61
--   SELECT count(*) FROM stg_import_pm_ekstra_disdag_pertanian WHERE golongan<>'1.3.2';    -- 0
--   SELECT intra_ekstra, count(*) FROM stg_import_pm_ekstra_disdag_pertanian GROUP BY 1;   -- ekstra 888
--   SELECT kondisi_barang, count(*) FROM stg_import_pm_ekstra_disdag_pertanian GROUP BY 1; -- Baik 888
--   -- baris kosong tak ikut terbawa (keempatnya HARUS 0):
--   SELECT count(*) FILTER (WHERE nibar IS NULL)   AS a,
--          count(*) FILTER (WHERE kode IS NULL)    AS b,
--          count(*) FILTER (WHERE skpd_id IS NULL) AS c,
--          count(*) FILTER (WHERE nilai_perolehan IS NULL OR nilai_perolehan <= 0) AS d
--     FROM stg_import_pm_ekstra_disdag_pertanian;
--   -- identitas & presisi (kelimanya HARUS 0):
--   SELECT count(*) FILTER (WHERE nilai_buku_awal <> nilai_perolehan - akumulasi_2025) AS a,
--          count(*) FILTER (WHERE jumlah * harga_satuan <> nilai_perolehan)            AS b,
--          count(*) FILTER (WHERE akumulasi_2025 > nilai_perolehan)                    AS c,
--          count(*) FILTER (WHERE sisa_masa_manfaat_smt > masa_manfaat_smt)            AS d,
--          count(*) FILTER (WHERE scale(nilai_perolehan) > 2 OR scale(akumulasi_2025) > 2
--                              OR scale(beban_penyusutan_per_smt) > 2)                 AS e
--     FROM stg_import_pm_ekstra_disdag_pertanian;
--   -- totalnya cocok dgn CSV (SUDAH dibulatkan):
--   SELECT round(sum(nilai_perolehan),2) AS perolehan,   -- 263057744.48
--          round(sum(akumulasi_2025),2)  AS akumulasi,   -- 244000796.98
--          round(sum(nilai_buku_awal),2) AS nilai_buku   --  19056947.50
--     FROM stg_import_pm_ekstra_disdag_pertanian;
