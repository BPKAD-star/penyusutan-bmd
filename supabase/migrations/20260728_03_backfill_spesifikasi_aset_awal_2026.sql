-- ============================================================================
-- BACKFILL ULANG kolom SPESIFIKASI aset_awal_2026 dari register `aset`
-- (2026-07-28). Lanjutan migrasi 20260704_20 yang backfill-nya sudah usang.
--
-- TEMUAN (SQL Editor, 2026-07-28) — Tanah 1.3.1:
--   aset_awal_2026 : 2.732 baris → luas 0, alamat 0, jenis hak 0
--   aset (register): 2.733 baris → luas 2.733, alamat 2.677, jenis hak 2.716
-- Jadi datanya ADA, cuma tidak pernah sampai ke snapshot: backfill 20260704_20
-- jalan 4 Juli, sementara kolom-kolom Tanah di register agaknya baru diisi
-- sesudah itu. Golongan lain senasib (1.3.3 Gedung & 1.5.3 ATB nol semua).
--
-- ── KENAPA INI AMAN ────────────────────────────────────────────────────────
-- `aset_awal_2026` TIDAK dibaca engine penyusutan sama sekali (engine replay
-- dari ledger `saldo_awal`/`saldo_awal_checkpoint` — lihat CLAUDE.md), dan cuma
-- dipakai 2 halaman menu Saldo Awal. Mengubah kolom DESKRIPTIF di sini nol efek
-- ke perhitungan, ledger, maupun laporan angka. Trigger
-- `fn_aset_awal_2026_spek_only` sengaja dilewati untuk `postgres` → skrip ini
-- tidak akan ditolak dari SQL Editor.
--
-- ── TIGA PENGAMAN YANG WAJIB ADA (beda dari 20260704_20) ───────────────────
-- 1. KOLOM ANGKA TIDAK IKUT. Jangan pernah menyalin nilai_perolehan,
--    akumulasi_2025, nilai_buku_awal, masa_manfaat_smt, beban_penyusutan_per_smt,
--    sisa_masa_manfaat_smt, jumlah, harga_satuan, tgl_perolehan, kode, skpd_id,
--    intra_ekstra dari `aset`. Itu angka BEKU posisi 31 Des 2025, sedangkan
--    kolom yang sama di `aset` sudah bergerak kena kapitalisasi/koreksi 2026.
--    Sekali tertimpa, tidak ada cara mengembalikannya.
-- 2. LINTAS-GOLONGAN DITOLAK (`left(kode,5)` harus sama). Aset yang pernah
--    `reklas_kode`/`reklas_golongan` punya kode berbeda golongan di register;
--    menyalin kolom spesifikasinya bisa mengisi kolom milik golongan yang salah.
--    Ini kerusakan (b) yang sudah diantisipasi di migrasi 20260728_01.
-- 3. ISI YANG KOSONG SAJA (COALESCE + NULLIF), BUKAN TIMPA. Sejak 20260728_01
--    operator boleh mengoreksi spesifikasi langsung di snapshot; backfill yang
--    menimpa bisa menghapus koreksi yang baru saja dikerjakan. Efek samping yang
--    diinginkan: skrip ini AMAN DI-RUN ULANG (idempotent).
--
-- Konsekuensi yang DITERIMA (sama seperti 20260704_20): yang masuk ke snapshot
-- adalah spesifikasi versi TERKINI, bukan versi yang benar-benar ada per 31 Des
-- 2025 — `aset` tidak versioned, tak ada cara menelusuri versi historisnya.
-- Untuk kolom deskriptif, itu jauh lebih berguna daripada kosong.
--
-- ── CARA MENJALANKAN ───────────────────────────────────────────────────────
-- ⚠️ Project ini sedang EXCEEDING USAGE LIMITS di Supabase free tier, dan
-- aset_awal_2026 isinya ~418rb baris. UPDATE besar bikin dead tuple (tabel
-- membengkak sampai di-VACUUM). JANGAN sekali jalan untuk semua golongan —
-- BAGIAN 2 dipecah 3 giliran lewat daftar golongan di baris terakhirnya:
--   giliran 1  '1.3.1'                                    2.732 baris  ✔ SUDAH
--   giliran 2  '1.3.3','1.3.4','1.3.6','1.5.3','1.5.4'   23.657 baris  ✔ SUDAH
-- Rincian giliran 2: 1.5.3 ATB 120 · 1.3.6 KDP 233 · 1.3.3 Gedung 6.518 ·
-- 1.3.4 Jalan 8.127 · 1.5.4 Lain-Lain 8.659.
--
-- ❌ 1.3.5 (173.262) & 1.3.2 (218.251) — **TIDAK PERLU DIJALANKAN**, terukur
-- 2026-07-28. Pratinjau BAGIAN 1 untuk dua golongan ini: cocok_nibar 100%
-- (218.251 & 173.262, tak ada NIBAR yatim), dilewati_beda_golongan 0, TAPI
-- akan_isi_merek / penggunaan / spek / keterangan SEMUANYA 0 — register `aset`
-- sama kosongnya dengan snapshot, jadi tak ada yang bisa disalin. Menjalankannya
-- = UPDATE 391rb baris untuk nol perubahan, plus dead tuple di project yang
-- sedang lewat batas free tier. Sebabnya beda asal-usul: Tanah/Gedung diisi
-- belakangan lewat aplikasi (GIS, Koreksi) sehingga register maju duluan,
-- sementara P&M & ATL lahir dari impor massal e-BMD (20260716_03, 20260718_02,
-- 20260719_02) yang file sumbernya memang tak punya kolom Merek/Tipe &
-- Penggunaan. Mengisinya harus dari sumber LUAR (impor Excel), bukan dari
-- register. Kalau suatu saat register dua golongan ini terisi, jalankan ulang
-- pratinjaunya dulu — skrip ini idempotent, aman di-run kapan pun.
--
-- ⚠️ JEBAKAN (kena 2026-07-28): prefiks golongan muncul di DUA tempat — di
-- UPDATE (BAGIAN 2) dan di SELECT verifikasi sesudahnya. Mengganti yang di
-- verifikasi saja bikin hasilnya terlihat "nol semua" padahal UPDATE-nya memang
-- belum pernah dijalankan untuk golongan itu. Sejak revisi ini keduanya pakai
-- daftar `IN (...)` yang sama persis supaya sekali ganti langsung kena dua-duanya.
--
-- Sesudah semua golongan selesai, jalankan BAGIAN 3 (VACUUM) di tab TERPISAH,
-- sendirian — VACUUM tidak boleh berada dalam transaction block, sementara SQL
-- Editor membungkus skrip yang di-Run jadi satu transaksi.
-- ============================================================================

-- ── BAGIAN 0. Prasyarat: NIBAR harus unik di `aset` ─────────────────────────
-- `UPDATE ... FROM` dengan pasangan ganda = baris mana yang menang tidak
-- ditentukan. Harus 0. Kalau bukan 0, HENTIKAN & benahi duplikatnya dulu.
SELECT count(*) AS nibar_ganda_di_aset
FROM (SELECT nibar FROM aset WHERE nibar IS NOT NULL GROUP BY nibar HAVING count(*) > 1) x;

-- ── BAGIAN 1. Pratinjau: berapa baris yang BAKAL keisi (tidak mengubah apa pun) ──
SELECT left(s.kode, 5) AS gol,
       count(*)                                                                            AS baris,
       count(*) FILTER (WHERE s.luas IS NULL AND a.luas IS NOT NULL)                       AS akan_isi_luas,
       count(*) FILTER (WHERE nullif(btrim(s.alamat_detail), '') IS NULL
                          AND nullif(btrim(a.alamat_detail), '') IS NOT NULL)              AS akan_isi_alamat,
       count(*) FILTER (WHERE nullif(btrim(s.wilayah_kode), '') IS NULL
                          AND nullif(btrim(a.wilayah_kode), '') IS NOT NULL)               AS akan_isi_wilayah,
       count(*) FILTER (WHERE nullif(btrim(s.jenis_hak), '') IS NULL
                          AND nullif(btrim(a.jenis_hak), '') IS NOT NULL)                  AS akan_isi_jenis_hak,
       count(*) FILTER (WHERE nullif(btrim(s.merek_tipe), '') IS NULL
                          AND nullif(btrim(a.merek_tipe), '') IS NOT NULL)                 AS akan_isi_merek,
       count(*) FILTER (WHERE nullif(btrim(s.penggunaan_pengamanan), '') IS NULL
                          AND nullif(btrim(a.penggunaan_pengamanan), '') IS NOT NULL)      AS akan_isi_penggunaan,
       count(*) FILTER (WHERE left(s.kode, 5) <> left(a.kode, 5))                          AS dilewati_beda_golongan
FROM aset_awal_2026 s
JOIN aset a ON a.nibar = s.nibar
GROUP BY 1
ORDER BY 1;

-- ── BAGIAN 2. Backfill — GANTI DAFTAR GOLONGAN DI BARIS BERTANDA <<< ────────
UPDATE aset_awal_2026 s
SET spesifikasi_lainnya         = COALESCE(nullif(btrim(s.spesifikasi_lainnya), ''),       a.spesifikasi_lainnya),
    merek_tipe                  = COALESCE(nullif(btrim(s.merek_tipe), ''),                a.merek_tipe),
    uraian_barang               = COALESCE(nullif(btrim(s.uraian_barang), ''),             a.uraian_barang),
    nama_barang                 = COALESCE(nullif(btrim(s.nama_barang), ''),               a.nama_barang),
    no_polisi                   = COALESCE(nullif(btrim(s.no_polisi), ''),                 a.no_polisi),
    no_bpkb                     = COALESCE(nullif(btrim(s.no_bpkb), ''),                   a.no_bpkb),
    no_rangka                   = COALESCE(nullif(btrim(s.no_rangka), ''),                 a.no_rangka),
    no_mesin                    = COALESCE(nullif(btrim(s.no_mesin), ''),                  a.no_mesin),
    luas                        = COALESCE(s.luas,                                         a.luas),
    jenis_hak                   = COALESCE(nullif(btrim(s.jenis_hak), ''),                 a.jenis_hak),
    nomor_dokumen_kepemilikan   = COALESCE(nullif(btrim(s.nomor_dokumen_kepemilikan), ''), a.nomor_dokumen_kepemilikan),
    nama_dokumen_kepemilikan    = COALESCE(nullif(btrim(s.nama_dokumen_kepemilikan), ''),  a.nama_dokumen_kepemilikan),
    tanggal_dokumen_kepemilikan = COALESCE(s.tanggal_dokumen_kepemilikan,                  a.tanggal_dokumen_kepemilikan),
    wilayah_kode                = COALESCE(nullif(btrim(s.wilayah_kode), ''),              a.wilayah_kode),
    alamat_detail               = COALESCE(nullif(btrim(s.alamat_detail), ''),             a.alamat_detail),
    latitude                    = COALESCE(s.latitude,                                     a.latitude),
    longitude                   = COALESCE(s.longitude,                                    a.longitude),
    asal_usul                   = COALESCE(nullif(btrim(s.asal_usul), ''),                 a.asal_usul),
    penggunaan_pengamanan       = COALESCE(nullif(btrim(s.penggunaan_pengamanan), ''),     a.penggunaan_pengamanan),
    kondisi_barang              = COALESCE(nullif(btrim(s.kondisi_barang), ''),            a.kondisi_barang),
    satuan                      = COALESCE(nullif(btrim(s.satuan), ''),                    a.satuan),
    tahun_pengadaan             = COALESCE(s.tahun_pengadaan,                              a.tahun_pengadaan),
    keterangan                  = COALESCE(nullif(btrim(s.keterangan), ''),                a.keterangan),
    foto_paths                  = CASE WHEN coalesce(cardinality(s.foto_paths), 0) = 0
                                       THEN a.foto_paths ELSE s.foto_paths END
FROM aset a
WHERE a.nibar = s.nibar
  AND left(a.kode, 5) = left(s.kode, 5)   -- pengaman 2: jangan salin lintas golongan
  AND left(s.kode, 5) IN ('1.3.1');       -- <<< GANTI DAFTAR GOLONGAN DI SINI

-- Verifikasi SELURUH golongan sekaligus — sengaja tidak ikut difilter, supaya
-- ketahuan mana yang sudah dijalankan & mana yang belum (baris yang masih nol
-- berarti UPDATE di atas belum pernah jalan untuk golongan itu).
SELECT left(kode, 5) AS gol, count(*) AS baris,
       count(*) FILTER (WHERE nullif(btrim(alamat_detail), '') IS NOT NULL) AS ada_alamat,
       count(*) FILTER (WHERE luas IS NOT NULL)                             AS ada_luas,
       count(*) FILTER (WHERE nullif(btrim(asal_usul), '') IS NOT NULL)     AS ada_asal_usul,
       count(*) FILTER (WHERE nullif(btrim(merek_tipe), '') IS NOT NULL)    AS ada_merek
FROM aset_awal_2026
GROUP BY 1
ORDER BY 1;

-- ── BAGIAN 3. Sesudah SEMUA golongan selesai — jalankan SENDIRIAN ───────────
-- (satu tab SQL Editor, cuma baris ini, tanpa perintah lain — VACUUM tidak
-- boleh di dalam transaction block.) Merapikan dead tuple hasil UPDATE massal;
-- penting karena project ini sedang di atas batas free tier.
--   VACUUM (ANALYZE) aset_awal_2026;
