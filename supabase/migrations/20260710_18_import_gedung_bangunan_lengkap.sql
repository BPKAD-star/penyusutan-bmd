-- ============================================================================
-- Import Gedung Bangunan Lengkap (2026-07-10) — TINDES data golongan 1.3.3
-- (Gedung dan Bangunan) dari stg_import_gedung (6.518 baris, diimpor manual
-- via Table Editor SEBELUM migrasi ini jalan — lihat file
-- `stg_import_gedung.csv` yang sudah disiapkan).
--
-- Pola SAMA PERSIS dgn Import Tanah Lengkap (20260710_11_import_tanah_lengkap.sql):
-- TINDES yang lama (termasuk NIBAR kalau file membetulkan), isi kolom yang
-- kosong/kurang dari file. BUKAN insert baru kalau barangnya sudah ada.
-- **BUKAN drop tabel/replace total** — ledger append-only mutlak
-- (fn_transaksi_bmd_immutable), banyak aset 1.3.3 kemungkinan sudah punya
-- transaksi susulan (penghapusan/kapitalisasi/pengalihan) setelah baseline
-- 2025, jadi hapus paksa `aset` bakal mematahkan jejak itu. Koreksi = enrich
-- in-place, bukan hapus lalu tulis ulang.
--
-- Kolom yang DIENRICH di aset yg SUDAH ADA (file menang kalau isinya bukan
-- placeholder "-"/kosong):
--   luas, alamat_detail, uraian_barang, penggunaan_pengamanan, asal_usul,
--   tahun_pengadaan, satuan, harga_satuan
-- Kolom yang SENGAJA TIDAK disentuh (walau ada di file):
--   - spesifikasi_lainnya/merek_tipe/no_polisi/no_bpkb/no_rangka/no_mesin/
--     keterangan/nomor_dokumen_kepemilikan/tanggal_dokumen_kepemilikan/
--     nama_dokumen_kepemilikan/jenis_hak/pemanfaatan/wilayah_kode/latitude/
--     longitude/foto_paths — dicek: 100% placeholder "-"/kosong di SELURUH
--     6.518 baris file, jadi nggak ada apa pun buat di-enrich. Tidak
--     dimasukkan ke stg_import_gedung sama sekali.
--   - kondisi_barang — file isinya SERAGAM "Baik" di semua 6.518 baris (bukan
--     hasil survei per-gedung, kelihatan cuma default kosongan) — kalau
--     ditulis bisa nge-timpa data "Rusak Ringan/Berat" yang sudah benar di
--     DB. Kalau memang mau di-enrich, isi manual per kasus lewat menu
--     Koreksi, jangan bulk dari file ini.
--   - intra_ekstra — file 58% baris kosong (nggak reliable buat enrich data
--     lama). Untuk baris BARU di langkah 3, dihitung ULANG otomatis dari
--     nilai per-unit vs admin_kodefikasi_bmd.batas_kapitalisasi (sama logika
--     dgn klasifikasiKomptabel() di lib/bmd.ts), bukan dari kolom file.
--   - nilai_perolehan/tgl_perolehan/skpd_id/nama_barang/kode — ini identitas
--     + angka finansial yang sudah terkunci di ledger (transaksi_bmd
--     immutable) — dipakai buat MENCOCOKKAN baris (langkah 2), bukan buat
--     ditimpa. Baseline finansial (akumulasi_2025/nilai_buku_awal/dst) HANYA
--     ditulis utk baris yang BENERAN baru (langkah 3) — utk baris yang sudah
--     match, ledger `saldo_awal` yang sudah ada tidak disentuh sama sekali.
--
-- 3 langkah (identik pola Tanah):
--   1. NIBAR sama dgn live → enrich in-place kolom di atas.
--   2. NIBAR beda (dibetulkan di file) → cari kembaran identitas
--      (nama_barang+skpd_id+tgl_perolehan+nilai_perolehan) yang unik di KEDUA
--      sisi dlm golongan 1.3.3 → TINDES NIBAR-nya + enrich.
--   3. Beneran baru (NIBAR gak match & gak ada kembaran identitas) → INSERT
--      aset + transaksi_bmd jenis 'saldo_awal' (periode 2025-S2, tanggal
--      2025-12-31 — retroaktif, sudah di-whitelist migrasi
--      20260710_10_whitelist_saldo_awal_retroaktif.sql).
--
-- ⚠️ WAJIB jalankan blok VERIFIKASI PRA-SYARAT di paling bawah file ini
-- DULU (sebelum langkah 3) — cek skpd_id & kode di file beneran ada di
-- admin_skpd / admin_kodefikasi_bmd. Belum sempat divalidasi lewat DB live
-- pas migrasi ini ditulis.
--
-- PRASYARAT: stg_import_gedung sudah terisi 6.518 baris dari
-- stg_import_gedung.csv. Re-runnable / idempotent (semua guard NOT EXISTS).
-- ============================================================================

CREATE TABLE IF NOT EXISTS stg_import_gedung (
  nibar                     text,
  kode                      text,
  nama_barang               text,
  skpd_id                   bigint,
  nilai_perolehan           numeric,
  tgl_perolehan             date,
  masa_manfaat_smt          numeric,
  akumulasi_2025            numeric,
  nilai_buku_awal           numeric,
  sisa_masa_manfaat_smt     numeric,
  beban_penyusutan_per_smt  numeric,
  luas                      numeric,
  alamat_detail             text,
  uraian_barang             text,
  penggunaan_pengamanan     text,
  asal_usul                 text,
  tahun_pengadaan           int,
  satuan                    text,
  harga_satuan              numeric,
  jumlah                    int
);

-- ── 1. NIBAR sama dgn live → enrich in-place ────────────────────────────────
UPDATE aset a SET
  luas                  = COALESCE(s.luas, a.luas),
  alamat_detail         = COALESCE(NULLIF(NULLIF(s.alamat_detail, '-'), ''), a.alamat_detail),
  uraian_barang         = COALESCE(NULLIF(NULLIF(s.uraian_barang, '-'), ''), a.uraian_barang),
  penggunaan_pengamanan = COALESCE(NULLIF(NULLIF(s.penggunaan_pengamanan, '-'), ''), a.penggunaan_pengamanan),
  asal_usul             = COALESCE(NULLIF(NULLIF(s.asal_usul, '-'), ''), a.asal_usul),
  tahun_pengadaan       = COALESCE(s.tahun_pengadaan, a.tahun_pengadaan),
  satuan                = COALESCE(NULLIF(NULLIF(s.satuan, '-'), ''), a.satuan),
  harga_satuan          = COALESCE(s.harga_satuan, a.harga_satuan)
FROM stg_import_gedung s
WHERE a.nibar = s.nibar;

-- ── 2. NIBAR beda (dibetulkan di file) → cari kembaran identitas, tindes NIBAR ─
-- "changed" = baris file yang NIBAR-nya belum ada di live.
-- "uniq" = changed yang identitasnya (nama+skpd+tgl+nilai) muncul PERSIS 1x di
-- staging DAN persis 1x di aset live golongan 1.3.3 — biar gak salah nindes.
WITH changed AS (
  SELECT s.* FROM stg_import_gedung s
  WHERE NOT EXISTS (SELECT 1 FROM aset a WHERE a.nibar = s.nibar)
),
uniq AS (
  SELECT c.* FROM changed c
  WHERE (SELECT count(*) FROM changed c2
         WHERE c2.nama_barang = c.nama_barang AND c2.skpd_id = c.skpd_id
           AND c2.tgl_perolehan = c.tgl_perolehan AND c2.nilai_perolehan = c.nilai_perolehan) = 1
    AND (SELECT count(*) FROM aset a
         WHERE a.nama_barang = c.nama_barang AND a.skpd_id = c.skpd_id
           AND a.tgl_perolehan = c.tgl_perolehan AND a.nilai_perolehan = c.nilai_perolehan
           AND a.kode LIKE '1.3.3%') = 1
)
UPDATE aset a SET
  nibar                 = u.nibar,
  luas                  = COALESCE(u.luas, a.luas),
  alamat_detail         = COALESCE(NULLIF(NULLIF(u.alamat_detail, '-'), ''), a.alamat_detail),
  uraian_barang         = COALESCE(NULLIF(NULLIF(u.uraian_barang, '-'), ''), a.uraian_barang),
  penggunaan_pengamanan = COALESCE(NULLIF(NULLIF(u.penggunaan_pengamanan, '-'), ''), a.penggunaan_pengamanan),
  asal_usul             = COALESCE(NULLIF(NULLIF(u.asal_usul, '-'), ''), a.asal_usul),
  tahun_pengadaan       = COALESCE(u.tahun_pengadaan, a.tahun_pengadaan),
  satuan                = COALESCE(NULLIF(NULLIF(u.satuan, '-'), ''), a.satuan),
  harga_satuan          = COALESCE(u.harga_satuan, a.harga_satuan)
FROM uniq u
WHERE a.nama_barang = u.nama_barang AND a.skpd_id = u.skpd_id
  AND a.tgl_perolehan = u.tgl_perolehan AND a.nilai_perolehan = u.nilai_perolehan
  AND a.kode LIKE '1.3.3%';

-- ============================================================================
-- ⚠️ VERIFIKASI PRA-SYARAT — jalankan & pastikan KEDUANYA 0 baris SEBELUM
-- lanjut ke langkah 3 di bawah. Kalau ada hasil, benerin datanya dulu
-- (skpd_id salah / kode belum terdaftar) baru lanjut.
--
--   SELECT DISTINCT s.skpd_id FROM stg_import_gedung s
--     LEFT JOIN admin_skpd sk ON sk.id = s.skpd_id
--     WHERE NOT EXISTS (SELECT 1 FROM aset a WHERE a.nibar = s.nibar) -- cuma yg bakal di-insert baru
--       AND sk.id IS NULL;
--
--   SELECT DISTINCT s.kode FROM stg_import_gedung s
--     LEFT JOIN admin_kodefikasi_bmd k ON k.kode = s.kode
--     WHERE NOT EXISTS (SELECT 1 FROM aset a WHERE a.nibar = s.nibar)
--       AND k.kode IS NULL;
-- ============================================================================

-- ── 3. Yang beneran baru (NIBAR tetap gak match SETELAH langkah 2, & gak ada
--       kembaran identitas) → INSERT baseline + ledger saldo_awal ─────────────
INSERT INTO aset (
  nibar, kode, nama_barang, nilai_perolehan, tgl_perolehan, skpd_id, intra_ekstra,
  cara_perolehan, status, jumlah, satuan, harga_satuan,
  luas, alamat_detail, uraian_barang, penggunaan_pengamanan, asal_usul, tahun_pengadaan
)
SELECT
  s.nibar, s.kode, s.nama_barang, s.nilai_perolehan, s.tgl_perolehan, s.skpd_id,
  CASE
    WHEN k.batas_kapitalisasi IS NULL THEN 'intra'
    WHEN s.nilai_perolehan / GREATEST(s.jumlah, 1) >= k.batas_kapitalisasi THEN 'intra'
    ELSE 'ekstra'
  END,
  'saldo_awal', 'aktif', s.jumlah, NULLIF(NULLIF(s.satuan, '-'), ''), s.harga_satuan,
  s.luas, NULLIF(NULLIF(s.alamat_detail, '-'), ''), NULLIF(NULLIF(s.uraian_barang, '-'), ''),
  NULLIF(NULLIF(s.penggunaan_pengamanan, '-'), ''), NULLIF(NULLIF(s.asal_usul, '-'), ''), s.tahun_pengadaan
FROM stg_import_gedung s
LEFT JOIN admin_kodefikasi_bmd k ON k.kode = s.kode
WHERE NOT EXISTS (SELECT 1 FROM aset a WHERE a.nibar = s.nibar);

INSERT INTO transaksi_bmd (aset_id, jenis, periode, tanggal, nilai, skpd_tujuan, payload, keterangan)
SELECT a.id, 'saldo_awal', '2025-S2', DATE '2025-12-31', s.nilai_perolehan, s.skpd_id,
       jsonb_build_object(
         'akumulasi_2025',        s.akumulasi_2025,
         'nilai_buku_awal',       s.nilai_buku_awal,
         'sisa_masa_manfaat_smt', s.sisa_masa_manfaat_smt,
         'masa_manfaat_smt',      s.masa_manfaat_smt,
         'beban_per_smt',         s.beban_penyusutan_per_smt,
         'sumber',                'Import Gedung Bangunan Lengkap.xlsx — backfill 2026-07-10'
       ),
       'Baseline tambahan — Gedung/Bangunan yang kelewat di baseline 2025 awal'
FROM aset a
JOIN stg_import_gedung s ON s.nibar = a.nibar
WHERE a.cara_perolehan = 'saldo_awal'
  AND NOT EXISTS (SELECT 1 FROM transaksi_bmd tb WHERE tb.aset_id = a.id AND tb.jenis = 'saldo_awal');

-- Verifikasi akhir:
--   SELECT count(*) FROM aset WHERE kode LIKE '1.3.3%';
--     -- naik cuma sejumlah barang yg BENERAN baru (bandingkan sebelum/sesudah)
--   SELECT count(*) FROM stg_import_gedung s LEFT JOIN aset a ON a.nibar = s.nibar
--     WHERE a.id IS NULL;
--     -- HARUS 0 (semua NIBAR file sudah ada di live setelah langkah 1-3)
--   SELECT count(*) FROM aset a JOIN stg_import_gedung s ON s.nibar = a.nibar
--     WHERE a.cara_perolehan = 'saldo_awal'
--       AND NOT EXISTS (SELECT 1 FROM transaksi_bmd t WHERE t.aset_id = a.id AND t.jenis = 'saldo_awal');
--     -- HARUS 0 (setiap aset saldo_awal baru harus punya transaksi saldo_awal-nya)
