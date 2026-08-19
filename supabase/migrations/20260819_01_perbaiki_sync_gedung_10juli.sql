-- ============================================================================
-- Batalkan 2 `koreksi_nilai` salah-cocok + nonaktifkan 2 duplikat yang lahir
-- dari batch "Import Gedung Bangunan Lengkap.xlsx" 2026-07-10.
--
-- Dilaporkan user 2026-08-19: Laporan BMD Model 3, Gedung & Bangunan (1.3.3),
-- Pengurangan -> "Koreksi Nilai (berkurang) 948.955.351" atas PEMBANGUNAN
-- TAMAN KEPALA KERETA API DI SLG (Dinas LH). User tidak pernah mencatat
-- koreksi itu -- dan memang tidak: `created_by` NULL, `header_id` NULL, tak ada
-- kartu di menu Koreksi. Barisnya lahir dari SQL massal 10 Juli, bukan dari
-- aplikasi.
--
-- -- Duduk perkaranya ---------------------------------------------------------
-- Batch 10 Juli memperlakukan file itu sebagai daftar gedung yang LENGKAP:
-- 196 aset baru dibuat dari file (`saldo_awal` 2025-S2, id 9702..9897), 195
-- aset lama yang tidak ada di file dinonaktifkan (`koreksi_pencatatan_ganda`).
-- Untuk DUA aset ia melakukan hal ketiga -- "sinkron nilai" -- dan di situlah
-- rusaknya: pencocokannya lewat KODE BARANG, yang dipakai banyak barang.
--
--   A. Dinas Lingkungan Hidup - ddcb4b1b (NIBAR ...0001)
--      "PEMBANGUNAN TAMAN KEPALA KERETA API DI SLG", kode 1.3.3.01.01.37.001
--      baseline e-BMD 1.118.060.700 -> dipaksa jadi 169.105.349 (#10098)
--      PERHATIAN: 169.105.349 itu nilai BARANG LAIN berkode sama: 91fab3d3
--         "Rehab DLH (pos jaga & Gudang TPA Sekoto)" -- yang justru
--         dinonaktifkan hari itu juga karena tak ada di file.
--      Sementara baris file yang BENAR-BENAR milik aset ini masuk sebagai
--      aset BARU c9720381 (NIBAR ...0009) bernama "Desa Tugurejo Kecamatan
--      Ngasem" -- nilai 1.118.060.700 dgn payload baseline SAMA PERSIS
--      (beban 11.180.607, akumulasi_2025 245.973.354, nilai buku 872.087.346,
--      100 smt, sisa 78). Nama itu jelas kolom LOKASI yang salah petak.
--
--   B. Bagian Umum - 1e110cb3 (NIBAR ...0001)
--      "Perbaikan Perkerasan Halaman Rumah Dinas Bupati",
--      kode 1.3.3.01.01.01.001
--      baseline 213.847.888 -> dipaksa jadi 1.828.592.000 (#10099)
--      PERHATIAN: 1.828.592.000 itu nilai 83f000a0 "Pembangunan Gedung
--         Serbaguna Kab. Kediri" -- berkode sama, juga dinonaktifkan hari itu.
--      Duplikatnya fdbbda7a (NIBAR ...0005), nama & tgl perolehan identik,
--      nilai 213.847.888.
--
-- Jadi tiap aset kena DUA kali: nilainya ditimpa milik barang lain, DAN
-- dirinya sendiri masuk lagi sebagai barang baru. Disapu se-golongan
-- (join skpd+kode+tgl_perolehan+nilai+akumulasi baseline): PERSIS 2 pasang,
-- tak ada yang ketiga.
--
-- -- Akibatnya di angka yang dilaporkan ---------------------------------------
--   Dinas LH 1.3.3   : seharusnya 1.118.060.700
--                      tercatat   169.105.349 + 1.118.060.700 = 1.287.166.049
--                      lebih catat   169.105.349
--   Bagian Umum 1.3.3: seharusnya   213.847.888
--                      tercatat   1.828.592.000 + 213.847.888 = 2.042.439.888
--                      lebih catat 1.828.592.000
--   TOTAL 1.3.3 lebih catat Rp1.997.697.349 sejak 2026-07-10.
--
-- Ditambah satu keadaan yang mustahil dan SATU-SATUNYA di seluruh basis data:
-- aset A punya akumulasi 257.153.961 di atas nilai perolehan 169.105.349,
-- jadi engine memaksa nilai buku ke 0 dan beban ke 0. Identitas
-- `perolehan - akumulasi = nilai buku` patah sebesar 88.048.612, tanpa satu
-- pun pesan error. (Dicek: SELECT count(*) FROM penyusutan_semester WHERE
-- periode='2026-S2' AND akumulasi > nilai_perolehan + 0.5  -> 1 baris.)
--
-- -- Obatnya ------------------------------------------------------------------
-- 1. Anulir #10098 & #10099 dgn `batal_koreksi_nilai` + kembalikan
--    `aset.nilai_perolehan` ke nilai baseline. Sesudah ini dua baris "Koreksi
--    Nilai" hilang dari Model 3 -- bukan disembunyikan, tapi karena
--    peristiwanya memang tak pernah terjadi.
-- 2. Nonaktifkan kedua DUPLIKAT dgn `koreksi_pencatatan_ganda` -- mekanisme
--    yang SAMA dgn 195 saudaranya hari itu, dan yang seharusnya kena ke salah
--    satu dari tiap pasang sejak awal. Dibackdate ke `tgl_perolehan` (2023),
--    persis pola 195 baris itu, supaya duplikatnya lenyap dari SEMUA periode --
--    termasuk 2026-S1 di `fn_rekap_bmd` yang replay SEMBUNYI-nya period-aware.
--    `koreksi_pencatatan_ganda` memang di-whitelist `fn_cek_tahun_buku` untuk
--    backdate ke tahun terkunci, jadi tak perlu membuka kunci 2023.
--    PERHATIAN: yang DIPERTAHANKAN sengaja yang lama (NIBAR ...0001): dia yang
--    bernama benar, yang punya kode register, riwayat penyusutan, & baris
--    snapshot. Yang dibuang justru yang baru -- kebalikan dari naluri "yang
--    terakhir paling benar".
-- 3. Buang 2 baris `aset_awal_2026` milik duplikat (masuk lewat backfill
--    20260812_03). Kalau tidak, menu Saldo Awal tetap menghitung dobel
--    sementara Laporan BMD sudah benar. Preseden DELETE di tabel snapshot:
--    migrasi 20260812_07.
--
-- PERHATIAN: guard baku "batal hanya untuk transaksi TERBARU" dilewati:
-- sesudah #10098 ada 2 baris `batal_koreksi_nilai` dari migrasi 20260812_06.
-- Aman KHUSUS di sini karena keduanya menganulir pasangan +D/-D yang saling
-- meniadakan dan tak menyentuh state engine; #10098/#10099 tetap peristiwa
-- terakhir yang mengubah nilai. Guardnya client-side & ini perbaikan data
-- lewat migrasi. Jangan jadikan preseden untuk membatalkan baris di tengah
-- rantai hidup.
--
-- PERHATIAN: `aset.nilai_perolehan` di-UPDATE langsung -- `nilai_perolehan`
-- TIDAK ada di klausa `UPDATE OF` milik `trg_aset_kode_register`, jadi kode
-- register tak ikut terbit ulang. `status` MEMANG ada di klausa itu -- dan itu
-- benar: aset `dihapus` membekukan kode terakhirnya, sama spt 195 saudaranya.
--
-- Idempoten: `WHERE NOT EXISTS` per target. Aman dijalankan ulang.
-- Tak ada perubahan skema/enum -> urutan deploy bebas, tak ada perubahan kode.
-- SESUDAH migrasi ini WAJIB run ulang engine penyusutan untuk 2026-S1 &
-- 2026-S2 -- 4 aset berubah basisnya dan `penyusutan_semester` tak ikut
-- bergerak sendiri.
-- ============================================================================

-- -- 1. Anulir dua koreksi_nilai salah-cocok ---------------------------------
INSERT INTO transaksi_bmd (aset_id, jenis, periode, tanggal, nilai, header_id, payload, keterangan)
SELECT
  t.aset_id,
  'batal_koreksi_nilai',
  fn_periode_dari_tanggal(current_date),
  current_date,
  0,                                    -- pola 20260812_06: baris batal tak pernah dijumlahkan
  NULL,
  jsonb_build_object(
    'target_trx_id',        t.id,
    'nilai_dianulir',       t.nilai,
    'nilai_perolehan_baru', v.baseline, -- nilai yang dipulihkan (jejak audit)
    'sumber',               'Batal sinkron salah-cocok Import Gedung 2026-07-10 (migrasi 20260819_01)'
  ),
  'Batal koreksi nilai - nilai yang disalin ternyata milik barang lain berkode sama'
FROM transaksi_bmd t
JOIN (VALUES
        (10098::bigint, 1118060700::numeric),  -- Taman Kepala Kereta Api (Dinas LH)
        (10099::bigint,  213847888::numeric)   -- Perbaikan Perkerasan Halaman R. Dinas Bupati
      ) AS v(trx_id, baseline) ON v.trx_id = t.id
WHERE t.jenis = 'koreksi_nilai'
  AND NOT EXISTS (
    SELECT 1 FROM transaksi_bmd b
    WHERE b.jenis = 'batal_koreksi_nilai'
      AND (b.payload->>'target_trx_id')::bigint = t.id
  );

UPDATE aset SET nilai_perolehan = 1118060700
WHERE id = 'ddcb4b1b-b379-43ca-8896-a2b69ac82025' AND nilai_perolehan <> 1118060700;

UPDATE aset SET nilai_perolehan = 213847888
WHERE id = '1e110cb3-0f02-466c-a0e8-5f1e0d816841' AND nilai_perolehan <> 213847888;

-- -- 2. Nonaktifkan kedua duplikat hasil import ------------------------------
INSERT INTO transaksi_bmd (aset_id, jenis, periode, tanggal, nilai, header_id, payload, keterangan)
SELECT
  a.id,
  'koreksi_pencatatan_ganda',
  fn_periode_dari_tanggal(a.tgl_perolehan),
  a.tgl_perolehan,                      -- backdate: pola 195 baris 2026-07-10
  0,
  NULL,
  jsonb_build_object(
    'duplikat_dari', d.induk,
    'sumber',        'Duplikat Import Gedung 2026-07-10 - barang yang sama sudah tercatat (migrasi 20260819_01)'
  ),
  'Pencatatan ganda - aset ini salinan barang yang sudah ada; barang aslinya dipertahankan'
FROM aset a
JOIN (VALUES
        ('c9720381-4904-4001-b9c6-5f8284a9e8b6'::uuid, 'ddcb4b1b-b379-43ca-8896-a2b69ac82025'::uuid),
        ('fdbbda7a-7348-4450-af5c-4960e79709f8'::uuid, '1e110cb3-0f02-466c-a0e8-5f1e0d816841'::uuid)
      ) AS d(dup, induk) ON d.dup = a.id
WHERE NOT EXISTS (
  SELECT 1 FROM transaksi_bmd t
  WHERE t.aset_id = a.id AND t.jenis = 'koreksi_pencatatan_ganda'
);

UPDATE aset SET status = 'dihapus'
WHERE id IN ('c9720381-4904-4001-b9c6-5f8284a9e8b6',
             'fdbbda7a-7348-4450-af5c-4960e79709f8')
  AND status <> 'dihapus';

-- -- 3. Buang baris snapshot milik duplikat ----------------------------------
-- Sah di sini: `aset_awal_2026` tabel snapshot display-only, bukan ledger
-- append-only, dan yang dibuang bukan angka sebuah barang melainkan salinan
-- kedua dari barang yang barisnya masih utuh (NIBAR ...0001).
DELETE FROM aset_awal_2026
WHERE nibar IN ('120135061200000000000020231330101370010000009',   -- "Desa Tugurejo Kecamatan Ngasem"
                '120135062500000006000020231330101010010000005');  -- Perkerasan Halaman R. Dinas Bupati (salinan)

-- -- Pemeriksaan sesudah dijalankan ------------------------------------------
-- 1. Nilai dua aset asli kembali ke baseline:
--      SELECT nama_barang, nilai_perolehan FROM aset
--      WHERE id IN ('ddcb4b1b-b379-43ca-8896-a2b69ac82025',
--                   '1e110cb3-0f02-466c-a0e8-5f1e0d816841');
--      -- harus 1.118.060.700 dan 213.847.888
-- 2. Duplikatnya mati:
--      SELECT nama_barang, status FROM aset
--      WHERE id IN ('c9720381-4904-4001-b9c6-5f8284a9e8b6',
--                   'fdbbda7a-7348-4450-af5c-4960e79709f8');  -- dua-duanya 'dihapus'
-- 3. Snapshot tak dobel lagi:
--      SELECT count(*) FROM aset_awal_2026
--      WHERE nama_barang ILIKE '%Perkerasan Halaman Rumah Dinas Bupati%';  -- 1
-- 4. RUN ULANG ENGINE 2026-S1 & 2026-S2, lalu:
--      SELECT count(*) FROM penyusutan_semester
--      WHERE periode='2026-S2' AND akumulasi > nilai_perolehan + 0.5;      -- 0
-- 5. Laporan BMD Model 3, 1.3.3, 2026-S2: baris "Koreksi Nilai (berkurang)"
--    & "Koreksi Nilai (bertambah)" untuk kedua barang itu HILANG, dan
--    Pengurangan 1.3.3 turun 948.955.351 (sisa: Reklas Keluar 5.846.579.000
--    + Pemecahan 167.324.933 = 6.013.903.933).
-- 6. Rekonsiliasi BMD & Laporan BMD tetap selisih 0,00 di 8 golongan.
