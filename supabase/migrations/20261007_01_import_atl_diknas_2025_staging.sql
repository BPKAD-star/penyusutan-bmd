-- ============================================================================
-- Import ATL Dinas Pendidikan PEROLEHAN 2025 (golongan 1.3.5) — TAHAP 1:
-- staging (2026-10-07).
--
-- Sumber: `DB ATL Dinas Pendidikan 2025.xlsx` (Sheet1, 17.771 baris, 40 kolom
-- — header IDENTIK dgn batch "Dibawah 2025" 20260720_01) → dibersihkan ke
-- `arsip-import/stg_import_atl_diknas_2025.csv` (19 kolom; 21 kolom yang 100%
-- kosong di SELURUH berkas dibuang). CSV itu gitignored — data aset live
-- pemda, JANGAN di-commit.
--
-- Pelengkap batch 20260720 (yang isinya barang DIPEROLEH SEBELUM 2025): berkas
-- ini HANYA barang ber-tgl_perolehan 2025. Pola SAMA dgn 20260914_03/04:
-- staging → aset_awal_2026 → aset → transaksi_bmd ('saldo_awal', 2025-S2,
-- 2025-12-31 — whitelisted `fn_cek_tahun_buku`).
--
-- ══ HASIL ANALISIS PENUH BERKAS (17.771/17.771 baris, bukan sampel) ════════
--   1. NIBAR 100% unik di dalam berkas, semua 45 digit numerik, susunan
--      STANDAR `[12][01|02][3506][SKPD 14][2025][kode 12][urut 7]`.
--      Kepala: 12013506 (intra) 6.974 · 12023506 (ekstra) 10.797 — cocok
--      PERSIS dgn kolom intra_ekstra di 100% baris. Segmen kode-barang NIBAR
--      cocok PERSIS dgn kolom `kode` di 100% baris.
--   2. TABRAKAN NIBAR thd DB = MUSTAHIL, DIBUKTIKAN (MCP Supabase, 2026-10-07):
--      semua NIBAR berkas berpola tahun 2025 + kode 135, jadi tabrakan hanya
--      mungkin dgn barang di DB yang NIBAR-nya juga begitu. Isinya cuma 771
--      barang (Dinas Kearsipan 770, DPMD 1) — segmen SKPD-nya `14…`/`20…`,
--      sedangkan seluruh berkas ini `01…` (Diknas). Diperiksa ULANG terhadap
--      isi staging yang benar-benar ter-upload di TAHAP 2.
--   3. Barang ATL Diknas ber-tgl_perolehan 2025 di DB (aset & aset_awal_2026)
--      = 0 — belum pernah diimpor lewat pintu mana pun (bukan cuma beda
--      NIBAR). Barang Diknas 2025 yang sudah ada hanya golongan 1.3.1/1.3.2/
--      1.3.3, jadi tak ada risiko dobel-hitung lintas golongan.
--   4. skpd_id: 641 SKPD, SEMUA terdaftar & SEMUA di subtree Dinas Pendidikan
--      (id 2). Segmen SKPD NIBAR == digit `admin_skpd.kode_skpd` di 641/641 →
--      trigger `trg_aset_kode_register` MEWARISI NIBAR sbg kode register untuk
--      SELURUH baris (tak ada yang tampil ⚠ "bergeser"). Counter
--      `kode_register_seq` utk prefiks ini belum ada (0) — tak ada bentrok.
--   5. kode: 67 kode, SEMUA terdaftar di `admin_kodefikasi_bmd` (tak perlu
--      remap '.001'→'.999' seperti batch Juli — di sini '.001' kode yang SAH:
--      Monograf, Agama Islam, Peta, dst.). ⚠️ 26 kode berstatus NONAKTIF
--      (3.349 baris, Rp2.703.693.500), mis. 1.3.5.01.01.01.999. DIBAWA APA
--      ADANYA: tak ada trigger yang menolak kode nonaktif, dan 16.999 barang
--      ATL aktif di DB sudah memakai kode-kode nonaktif yang sama (warisan
--      e-BMD). Me-remap ke kode lain = mengarang klasifikasi.
--   6. intra_ekstra DIPERTAHANKAN dari berkas, di-lowercase (CHECK hanya
--      menerima huruf kecil). TIDAK dihitung ulang dari batas_kapitalisasi —
--      pelajaran 20260716_04.
--   7. Angka: Σ nilai_perolehan Rp11.217.056.855 (intra Rp4.956.976.347 ·
--      ekstra Rp6.260.080.508), semuanya bilangan bulat, min 4.000, maks
--      50.810.100, 0 baris ≤ 0. jumlah SELALU 1; jumlah × harga_satuan ==
--      nilai_perolehan di 100% baris. ATL TIDAK disusutkan → kolom
--      penyusutan berkas 100% kosong; akumulasi_2025 = 0 & nilai_buku_awal =
--      nilai_perolehan diisi di TAHAP 2 (bentuk SAMA dgn batch 20260720).
--   8. kondisi_barang 100% "Baik"; asal_usul 100% "Pengadaan APBD";
--      satuan Paket 11.444 · Unit 6.327; tgl 2025-01-01 s.d. 2025-12-30.
--   9. Kolom berkas `merk_tipe` → `merek_tipe` (nama kolom di DB).
--  10. ⚠️ BARANG IDENTIK di dalam berkas: 558 grup / 1.642 baris
--      (Rp412.902.615) ber-(skpd, kode, nama, nilai, tgl) sama tapi NIBAR
--      berbeda — terbanyak 44× "buku literasi" Rp45.000 di skpd 277. Polanya
--      sama dgn batch Juli (buku beberapa eksemplar/paket dicatat terpisah).
--      Diimpor apa adanya; KONFIRMASI ke pengurus barang Diknas kalau ragu.
--
-- PRASYARAT TAHAP 2: tabel ini terisi 17.771 baris dari CSV di atas lewat
-- Table Editor → stg_import_atl_diknas_2025 → Insert → Import data from CSV.
-- ============================================================================

CREATE TABLE IF NOT EXISTS stg_import_atl_diknas_2025 (
  nibar                text,
  kode                 text,
  nama_barang          text,
  skpd_id              bigint,
  intra_ekstra         text,
  nilai_perolehan      numeric,
  tgl_perolehan        date,
  spesifikasi_lainnya  text,
  merek_tipe           text,
  alamat_detail        text,
  uraian_barang        text,
  keterangan           text,
  jumlah               int,
  satuan               text,
  harga_satuan         numeric,
  asal_usul            text,
  kondisi_barang       text,
  tahun_pengadaan      smallint,
  golongan             text
);

-- Aman diulang (mis. kalau CSV perlu di-import ulang).
TRUNCATE TABLE stg_import_atl_diknas_2025;

-- ── Verifikasi SESUDAH CSV diimpor (jalankan semua sebelum TAHAP 2) ────────
--   SELECT count(*), count(DISTINCT nibar) FROM stg_import_atl_diknas_2025;   -- 17771 / 17771
--   SELECT left(nibar,8) AS kepala, intra_ekstra, count(*)
--     FROM stg_import_atl_diknas_2025 GROUP BY 1,2;
--     -- 12013506 intra 6974 ; 12023506 ekstra 10797 (HANYA dua baris ini)
--   SELECT count(*) FROM stg_import_atl_diknas_2025
--    WHERE length(nibar)<>45 OR golongan<>'1.3.5' OR tgl_perolehan NOT BETWEEN '2025-01-01' AND '2025-12-31'; -- 0
--   SELECT count(*) FILTER (WHERE nibar IS NULL)   AS a,
--          count(*) FILTER (WHERE kode IS NULL)    AS b,
--          count(*) FILTER (WHERE skpd_id IS NULL) AS c,
--          count(*) FILTER (WHERE nilai_perolehan IS NULL OR nilai_perolehan <= 0) AS d,
--          count(*) FILTER (WHERE jumlah * harga_satuan <> nilai_perolehan)        AS e
--     FROM stg_import_atl_diknas_2025;                                        -- semua 0
--   SELECT sum(nilai_perolehan) AS total,                                     -- 11217056855
--          sum(nilai_perolehan) FILTER (WHERE intra_ekstra='intra')  AS intra, --  4956976347
--          sum(nilai_perolehan) FILTER (WHERE intra_ekstra='ekstra') AS ekstra --  6260080508
--     FROM stg_import_atl_diknas_2025;
-- ============================================================================
