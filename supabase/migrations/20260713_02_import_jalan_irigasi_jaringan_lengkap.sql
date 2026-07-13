-- ============================================================================
-- Import Jalan, Irigasi dan Jaringan Lengkap (2026-07-13) — TINDES data
-- golongan 1.3.4 dari stg_import_jalan_irigasi (8.127 baris, sumber file
-- `Import Jalan Irigasi Jaringan Lengkap.xlsx` — diimpor manual ke
-- stg_import_jalan_irigasi via Table Editor SEBELUM migrasi ini jalan. CSV
-- sudah dibersihkan (lihat `stg_import_jalan_irigasi.csv` — presisi angka
-- dijaga penuh, TIDAK dibulatkan, TIDAK notasi ilmiah).
--
-- Pola SAMA PERSIS dgn Import Tanah/Gedung Bangunan Lengkap
-- (20260710_11 / 20260710_18): TINDES yang lama (termasuk NIBAR kalau file
-- membetulkan), isi kolom yang kosong/kurang dari file. BUKAN insert baru
-- kalau barangnya sudah ada. **BUKAN drop tabel/replace total** — ledger
-- append-only mutlak (fn_transaksi_bmd_immutable), aset 1.3.4 kemungkinan
-- sudah punya transaksi susulan (penghapusan/kapitalisasi/pengalihan)
-- setelah baseline 2025 — hapus paksa `aset` bakal mematahkan jejak itu.
-- Koreksi = enrich in-place, bukan hapus lalu tulis ulang.
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
--     8.127 baris file, jadi nggak ada apa pun buat di-enrich. Tidak
--     dimasukkan ke stg_import_jalan_irigasi sama sekali.
--   - kondisi_barang — file isinya SERAGAM "Baik" di semua 8.127 baris (bukan
--     hasil survei per-barang, kelihatan cuma default kosongan) — kalau
--     ditulis bisa nge-timpa data "Rusak Ringan/Berat" yang sudah benar di
--     DB. Kalau memang mau di-enrich, isi manual per kasus lewat menu
--     Koreksi, jangan bulk dari file ini.
--   - intra_ekstra — TIDAK ADA di file sama sekali (kolom Excel-nya 66%
--     kosong, jadi sejak awal tidak reliable buat enrich data lama, tidak
--     dimasukkan ke staging). Untuk baris BARU di langkah 3, dihitung ULANG
--     otomatis dari nilai per-unit vs admin_kodefikasi_bmd.batas_kapitalisasi
--     (sama logika dgn klasifikasiKomptabel() di lib/bmd.ts).
--   - nilai_perolehan/tgl_perolehan/skpd_id/nama_barang/kode — identitas +
--     angka finansial yang sudah terkunci di ledger (transaksi_bmd
--     immutable) — dipakai buat MENCOCOKKAN baris (langkah 2), bukan buat
--     ditimpa. Baseline finansial (akumulasi_2025/nilai_buku_awal/dst) HANYA
--     ditulis utk baris yang BENERAN baru (langkah 3).
--
-- ⚠️ CAVEAT identitas ganda: 924 baris di file punya identitas kembar PERSIS
-- (nama_barang+skpd_id+tgl_perolehan+nilai_perolehan sama, mis. beberapa
-- "Cek Dam" Rp20.000.000 tgl 2000-06-30 skpd sama — kemungkinan besar memang
-- barang fisik berbeda dgn deskripsi kebetulan identik, BUKAN duplikat entri).
-- Baris begini otomatis DILEWATI di langkah 2 (uniq CTE mensyaratkan identitas
-- unik 1x di kedua sisi) — kalau NIBAR-nya juga tak ketemu di live, baris ini
-- masuk sbg INSERT BARU di langkah 3 pakai NIBAR dari file. Risiko: kalau
-- barang itu SUDAH ada di live dgn NIBAR beda, bisa tercatat dobel. Jalankan
-- query verifikasi akhir (paling bawah) & cek manual by SKPD kalau count
-- golongan 1.3.4 naik jauh melebihi ekspektasi.
--
-- 3 langkah (identik pola Tanah/Gedung):
--   1. NIBAR sama dgn live → enrich in-place kolom di atas.
--   2. NIBAR beda (dibetulkan di file) → cari kembaran identitas
--      (nama_barang+skpd_id+tgl_perolehan+nilai_perolehan) yang unik di KEDUA
--      sisi dlm golongan 1.3.4 → TINDES NIBAR-nya + enrich.
--   3. Beneran baru (NIBAR gak match & gak ada kembaran identitas) → INSERT
--      aset + transaksi_bmd jenis 'saldo_awal' (periode 2025-S2, tanggal
--      2025-12-31 — retroaktif, sudah di-whitelist migrasi
--      20260710_10_whitelist_saldo_awal_retroaktif.sql).
--
-- ⚠️ WAJIB jalankan blok VERIFIKASI PRA-SYARAT di bawah DULU (sebelum
-- langkah 3) — cek skpd_id & kode di file beneran ada di admin_skpd /
-- admin_kodefikasi_bmd. Belum sempat divalidasi lewat DB live pas migrasi
-- ini ditulis.
--
-- PRASYARAT: stg_import_jalan_irigasi sudah terisi 8.127 baris dari
-- stg_import_jalan_irigasi.csv. Re-runnable / idempotent (semua guard NOT EXISTS).
-- ============================================================================

CREATE TABLE IF NOT EXISTS stg_import_jalan_irigasi (
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
  jumlah                    numeric
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
FROM stg_import_jalan_irigasi s
WHERE a.nibar = s.nibar;

-- ── 2. NIBAR beda (dibetulkan di file) → cari kembaran identitas, tindes NIBAR ─
-- "changed" = baris file yang NIBAR-nya belum ada di live.
-- "uniq" = changed yang identitasnya (nama+skpd+tgl+nilai) muncul PERSIS 1x di
-- staging DAN persis 1x di aset live golongan 1.3.4 — biar gak salah nindes.
WITH changed AS (
  SELECT s.* FROM stg_import_jalan_irigasi s
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
           AND a.kode LIKE '1.3.4%') = 1
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
  AND a.kode LIKE '1.3.4%';

-- ============================================================================
-- ⚠️ VERIFIKASI PRA-SYARAT — jalankan & pastikan KEDUANYA 0 baris SEBELUM
-- lanjut ke langkah 3 di bawah. Kalau ada hasil, benerin datanya dulu
-- (skpd_id salah / kode belum terdaftar) baru lanjut.
--
--   SELECT DISTINCT s.skpd_id FROM stg_import_jalan_irigasi s
--     LEFT JOIN admin_skpd sk ON sk.id = s.skpd_id
--     WHERE NOT EXISTS (SELECT 1 FROM aset a WHERE a.nibar = s.nibar) -- cuma yg bakal di-insert baru
--       AND sk.id IS NULL;
--
--   SELECT DISTINCT s.kode FROM stg_import_jalan_irigasi s
--     LEFT JOIN admin_kodefikasi_bmd k ON k.kode = s.kode
--     WHERE NOT EXISTS (SELECT 1 FROM aset a WHERE a.nibar = s.nibar)
--       AND k.kode IS NULL;
-- ============================================================================

-- ── 3. Yang beneran baru (NIBAR tetap gak match SETELAH langkah 2, & gak ada
--       kembaran identitas) → INSERT baseline + ledger saldo_awal ─────────────
-- jumlah pakai COALESCE(...,1): kolom aset.jumlah NOT NULL DEFAULT 1, sementara
-- 5.395 dari 8.127 baris file kosong di kolom jumlah/satuan (data lawas e-bmd
-- tidak konsisten diisi) — insert NULL eksplisit akan gagal constraint.
INSERT INTO aset (
  nibar, kode, nama_barang, nilai_perolehan, tgl_perolehan, skpd_id, intra_ekstra,
  cara_perolehan, status, jumlah, satuan, harga_satuan,
  luas, alamat_detail, uraian_barang, penggunaan_pengamanan, asal_usul, tahun_pengadaan
)
SELECT
  s.nibar, s.kode, s.nama_barang, s.nilai_perolehan, s.tgl_perolehan, s.skpd_id,
  CASE
    WHEN k.batas_kapitalisasi IS NULL THEN 'intra'
    WHEN s.nilai_perolehan / GREATEST(COALESCE(s.jumlah, 1), 1) >= k.batas_kapitalisasi THEN 'intra'
    ELSE 'ekstra'
  END,
  'saldo_awal', 'aktif', COALESCE(s.jumlah, 1), NULLIF(NULLIF(s.satuan, '-'), ''), s.harga_satuan,
  s.luas, NULLIF(NULLIF(s.alamat_detail, '-'), ''),
  COALESCE(NULLIF(NULLIF(s.uraian_barang, '-'), ''), k.uraian),
  NULLIF(NULLIF(s.penggunaan_pengamanan, '-'), ''), NULLIF(NULLIF(s.asal_usul, '-'), ''), s.tahun_pengadaan
FROM stg_import_jalan_irigasi s
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
         'sumber',                'Import Jalan Irigasi Jaringan Lengkap.xlsx — backfill 2026-07-13'
       ),
       'Baseline tambahan — Jalan/Irigasi/Jaringan yang kelewat di baseline 2025 awal'
FROM aset a
JOIN stg_import_jalan_irigasi s ON s.nibar = a.nibar
WHERE a.cara_perolehan = 'saldo_awal'
  AND NOT EXISTS (SELECT 1 FROM transaksi_bmd tb WHERE tb.aset_id = a.id AND tb.jenis = 'saldo_awal');

-- Verifikasi akhir:
--   SELECT count(*) FROM aset WHERE kode LIKE '1.3.4%';
--     -- naik cuma sejumlah barang yg BENERAN baru (bandingkan sebelum/sesudah)
--   SELECT count(*) FROM stg_import_jalan_irigasi s LEFT JOIN aset a ON a.nibar = s.nibar
--     WHERE a.id IS NULL;
--     -- HARUS 0 (semua NIBAR file sudah ada di live setelah langkah 1-3)
--   SELECT count(*) FROM aset a JOIN stg_import_jalan_irigasi s ON s.nibar = a.nibar
--     WHERE a.cara_perolehan = 'saldo_awal'
--       AND NOT EXISTS (SELECT 1 FROM transaksi_bmd t WHERE t.aset_id = a.id AND t.jenis = 'saldo_awal');
--     -- HARUS 0 (setiap aset saldo_awal baru harus punya transaksi saldo_awal-nya)
--   SELECT a.nama_barang, a.skpd_id, a.tgl_perolehan, a.nilai_perolehan, count(*)
--     FROM aset a WHERE a.kode LIKE '1.3.4%' AND a.cara_perolehan = 'saldo_awal'
--     GROUP BY 1,2,3,4 HAVING count(*) > 1 ORDER BY count(*) DESC;
--     -- Tinjau manual: kembaran identitas (lihat CAVEAT di atas) — pastikan
--     -- masing-masing memang barang fisik berbeda, bukan hasil insert dobel.
