-- ============================================================================
-- Import ATL (Aset Tetap Lainnya, golongan 1.3.5) Lengkap (2026-07-16)
-- Sumber: `Import ATL Lengkap.xlsx` (23.416 baris) → dibersihkan ke
-- `stg_import_atl.csv` (17 kolom; kolom yang 100% placeholder "-"/kosong di
-- SELURUH file DIBUANG — merek/no_polisi/bpkb/rangka/mesin, luas, dokumen
-- kepemilikan, jenis_hak, wilayah/lat/long, foto, keterangan, pemanfaatan).
-- Impor CSV manual ke `stg_import_atl` via Table Editor SEBELUM migrasi ini.
--
-- Pola SAMA dgn Import Tanah/Gedung/Jalan Lengkap (20260710_11/_18, 20260713_02):
-- enrich yang SUDAH ADA (by NIBAR), INSERT yang benar-benar baru + ledger
-- 'saldo_awal' (periode 2025-S2, tanggal 2025-12-31 — retroaktif, sudah
-- di-whitelist migrasi 20260710_10_whitelist_saldo_awal_retroaktif.sql).
-- **BUKAN** drop/replace: ledger append-only mutlak (fn_transaksi_bmd_immutable).
--
-- ⚠️ CATATAN KHUSUS ATL (beda dari Tanah/Gedung/Jalan):
--   1. ATL (1.3.5) TIDAK disusutkan (perlakuanKode → 'tidak'). Semua kolom
--      penyusutan di file KOSONG (masa_manfaat/akumulasi/sisa/beban), dan
--      nilai_buku_awal = nilai_perolehan. Payload saldo_awal tetap ditulis utk
--      konsistensi, tapi engine memang mengabaikannya utk 1.3.5.
--   2. nama_barang di file cuma terisi 46% (buku sering tanpa nama, cuma
--      kategori di uraian_barang) → nama_barang = COALESCE(nama, uraian, kode)
--      supaya tidak NULL/kosong.
--   3. intra_ekstra: PAKAI nilai dari file ('intra' — e-bmd menandai semua ATL
--      intra). TIDAK dihitung ulang dari batas_kapitalisasi (beda dari migrasi
--      Jalan). Kalau mau reklasifikasi ekstra utk barang < batas, itu keputusan
--      terpisah lewat menu Reklasifikasi, jangan bulk di sini.
--   4. LANGKAH 2 (koreksi NIBAR by identitas) dari migrasi Jalan SENGAJA
--      DIHILANGKAN: NIBAR file ini 100% unik & bersih, dan ATL diduga kuat
--      BELUM ada di baseline (23.416 >> total baseline ~6.518), jadi step-2
--      cuma menambah risiko salah-cocok. Cuma enrich exact-NIBAR (langkah 1)
--      + insert baru (langkah 3).
--
-- ⚠️ SKALA: 23.416 baris, mayoritas diduga INSERT BARU (SKPD 21 sendiri 17.417
--    baris — kemungkinan Perpustakaan). Jumlah `aset` bisa naik ~4x. WAJIB catat
--    count SEBELUM & SESUDAH (query di bawah) dan pastikan kenaikannya masuk akal.
--
-- PRASYARAT (WAJIB, urut):
--   (a) 20260710_10_whitelist_saldo_awal_retroaktif.sql SUDAH dijalankan.
--   (b) stg_import_atl terisi 23.416 baris dari stg_import_atl.csv.
--   (c) Blok VERIFIKASI PRA-SYARAT di bawah menghasilkan 0 baris keduanya.
-- Re-runnable / idempotent (semua guard NOT EXISTS).
-- ============================================================================

CREATE TABLE IF NOT EXISTS stg_import_atl (
  nibar                 text,
  kode                  text,
  nama_barang           text,
  skpd_id               bigint,
  intra_ekstra          text,
  nilai_perolehan       numeric,
  tgl_perolehan         date,
  nilai_buku_awal       numeric,
  spesifikasi_lainnya   text,
  uraian_barang         text,
  jumlah                numeric,
  satuan                text,
  harga_satuan          numeric,
  penggunaan_pengamanan text,
  asal_usul             text,
  kondisi_barang        text,
  tahun_pengadaan       int
);

-- ============================================================================
-- ⚠️ VERIFIKASI PRA-SYARAT — jalankan DULU, pastikan KEDUANYA 0 baris. Kalau ada
-- hasil, benerin dulu (skpd_id salah / kode belum terdaftar di kodefikasi).
--
--   SELECT DISTINCT s.skpd_id FROM stg_import_atl s
--     LEFT JOIN admin_skpd sk ON sk.id = s.skpd_id
--     WHERE sk.id IS NULL;
--
--   SELECT DISTINCT s.kode FROM stg_import_atl s
--     LEFT JOIN admin_kodefikasi_bmd k ON k.kode = s.kode
--     WHERE k.kode IS NULL;
--
--   -- Catat count SEBELUM (bandingkan dgn sesudah):
--   SELECT count(*) AS atl_sebelum FROM aset WHERE kode LIKE '1.3.5%';
-- ============================================================================

-- ── 1. NIBAR sama dgn live → enrich in-place (kolom deskriptif saja) ─────────
-- Financial/identitas (nilai_perolehan/tgl/nama/kode/skpd) TIDAK disentuh —
-- sudah terkunci di ledger. kondisi_barang TIDAK ditimpa (file seragam 'Baik',
-- bisa nge-timpa 'Rusak' yang sudah benar di DB).
UPDATE aset a SET
  spesifikasi_lainnya   = COALESCE(NULLIF(s.spesifikasi_lainnya, ''), a.spesifikasi_lainnya),
  uraian_barang         = COALESCE(NULLIF(s.uraian_barang, ''), a.uraian_barang),
  penggunaan_pengamanan = COALESCE(NULLIF(s.penggunaan_pengamanan, ''), a.penggunaan_pengamanan),
  asal_usul             = COALESCE(NULLIF(s.asal_usul, ''), a.asal_usul),
  satuan                = COALESCE(NULLIF(s.satuan, ''), a.satuan),
  harga_satuan          = COALESCE(s.harga_satuan, a.harga_satuan),
  tahun_pengadaan       = COALESCE(s.tahun_pengadaan, a.tahun_pengadaan)
FROM stg_import_atl s
WHERE a.nibar = s.nibar;

-- ── 2. Yang benar-benar baru → INSERT aset + ledger saldo_awal ───────────────
-- nama_barang: banyak kosong → pakai uraian_barang, lalu kode sbg fallback akhir.
-- intra_ekstra: pakai nilai file (default 'intra' kalau kosong).
-- jumlah: NOT NULL DEFAULT 1 → COALESCE ke 1.
INSERT INTO aset (
  nibar, kode, nama_barang, nilai_perolehan, tgl_perolehan, skpd_id, intra_ekstra,
  cara_perolehan, status, jumlah, satuan, harga_satuan,
  spesifikasi_lainnya, uraian_barang, penggunaan_pengamanan, asal_usul,
  kondisi_barang, tahun_pengadaan
)
SELECT
  s.nibar, s.kode,
  COALESCE(NULLIF(s.nama_barang, ''), NULLIF(s.uraian_barang, ''), s.kode),
  s.nilai_perolehan, s.tgl_perolehan, s.skpd_id,
  COALESCE(NULLIF(s.intra_ekstra, ''), 'intra'),
  'saldo_awal', 'aktif', COALESCE(s.jumlah, 1)::int,
  NULLIF(s.satuan, ''), s.harga_satuan,
  NULLIF(s.spesifikasi_lainnya, ''),
  COALESCE(NULLIF(s.uraian_barang, ''), s.kode),
  NULLIF(s.penggunaan_pengamanan, ''), NULLIF(s.asal_usul, ''),
  NULLIF(s.kondisi_barang, ''), s.tahun_pengadaan
FROM stg_import_atl s
WHERE NOT EXISTS (SELECT 1 FROM aset a WHERE a.nibar = s.nibar);

-- Ledger 'saldo_awal' per aset baru (baseline 2025-S2, tanggal 2025-12-31).
-- ATL tidak disusutkan → payload penyusutan null, nilai_buku_awal = nilai.
INSERT INTO transaksi_bmd (aset_id, jenis, periode, tanggal, nilai, skpd_tujuan, payload, keterangan)
SELECT a.id, 'saldo_awal', '2025-S2', DATE '2025-12-31', s.nilai_perolehan, s.skpd_id,
       jsonb_build_object(
         'akumulasi_2025',        NULL,
         'nilai_buku_awal',       COALESCE(s.nilai_buku_awal, s.nilai_perolehan),
         'sisa_masa_manfaat_smt', NULL,
         'masa_manfaat_smt',      NULL,
         'beban_per_smt',         NULL,
         'sumber',                'Import ATL Lengkap.xlsx — backfill 2026-07-16'
       ),
       'Baseline tambahan — ATL (1.3.5) yang kelewat di baseline 2025 awal'
FROM aset a
JOIN stg_import_atl s ON s.nibar = a.nibar
WHERE a.cara_perolehan = 'saldo_awal'
  AND NOT EXISTS (SELECT 1 FROM transaksi_bmd tb WHERE tb.aset_id = a.id AND tb.jenis = 'saldo_awal');

-- ============================================================================
-- VERIFIKASI AKHIR:
--   SELECT count(*) AS atl_sesudah FROM aset WHERE kode LIKE '1.3.5%';
--     -- kenaikan = jumlah baris yg BENERAN baru (bandingkan dgn atl_sebelum).
--
--   SELECT count(*) FROM stg_import_atl s LEFT JOIN aset a ON a.nibar = s.nibar
--     WHERE a.id IS NULL;                       -- HARUS 0 (semua NIBAR sudah masuk)
--
--   SELECT count(*) FROM aset a JOIN stg_import_atl s ON s.nibar = a.nibar
--     WHERE a.cara_perolehan = 'saldo_awal'
--       AND NOT EXISTS (SELECT 1 FROM transaksi_bmd t WHERE t.aset_id=a.id AND t.jenis='saldo_awal');
--                                               -- HARUS 0 (tiap aset baru punya ledger saldo_awal)
--
--   -- Spot-check muncul di Daftar Barang (harus tampil, ATL tak disusutkan):
--   SELECT nibar, nama_barang, uraian_barang, skpd_id, nilai_perolehan, intra_ekstra
--     FROM aset WHERE kode LIKE '1.3.5%' AND cara_perolehan='saldo_awal' LIMIT 20;
-- ============================================================================
