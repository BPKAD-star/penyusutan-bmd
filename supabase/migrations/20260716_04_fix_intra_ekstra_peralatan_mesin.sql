-- ============================================================================
-- Koreksi intra_ekstra Peralatan & Mesin (2026-07-16) — lanjutan
-- 20260716_03_import_peralatan_mesin_materialisasi.sql.
--
-- SALAH DI MIGRASI SEBELUMNYA: STEP 1 di 20260716_03 menghitung ULANG
-- intra_ekstra dari admin_kodefikasi_bmd.batas_kapitalisasi, karena file
-- sumber isinya 100% "Intra" di seluruh 218.251 baris dicurigai bukan hasil
-- klasifikasi asli. TERNYATA itu memang benar — dikonfirmasi user (2026-07-16):
-- seluruh golongan 1.3.2 ini sengaja 100% intrakomptabel karena ada pergantian
-- kebijakan akuntansi; batas_kapitalisasi SEKARANG tidak boleh diterapkan
-- MUNDUR ke barang lama (banyak tgl_perolehan sampai 1928-2009) — klasifikasi
-- ikut aturan/pencatatan yang berlaku SAAT barang itu diperoleh, bukan
-- dihitung ulang pakai threshold hari ini. Hasil hitung ulang keliru
-- mereklasifikasi 61.639 baris jadi "ekstra" yang seharusnya tetap "intra".
--
-- ⚠️ PELAJARAN utk import baseline/backfill berikutnya: kalau file sumber
-- punya intra_ekstra yang seragam, JANGAN otomatis dianggap "tidak reliable"
-- dan dihitung ulang (beda dari kasus Gedung/Jalan yang kolomnya memang
-- MAYORITAS KOSONG, bukan seragam terisi) — tanya dulu ke user apakah
-- keseragaman itu memang kebijakan yang disengaja. batas_kapitalisasi cuma
-- relevan utk klasifikasi barang BARU (jalur Cara Perolehan/Pengadaan), bukan
-- utk barang baseline/lama yang sudah py klasifikasi tercatat dari asalnya.
--
-- Aman: intra_ekstra TIDAK disimpan di payload transaksi_bmd (cek STEP 3 di
-- 20260716_03 — payload cuma akumulasi_2025/nilai_buku_awal/dst), dan TIDAK
-- mempengaruhi perhitungan penyusutan (intra & ekstra dihitung sama persis,
-- CLAUDE.md — beda cuma di filter laporan Neraca). Jadi cukup UPDATE 2 tabel
-- ini, tidak perlu sentuh ledger atau re-run engine.
-- ============================================================================

UPDATE aset_awal_2026 SET intra_ekstra = 'intra'
WHERE nibar IN (SELECT nibar FROM stg_import_peralatan_mesin) AND intra_ekstra <> 'intra';

UPDATE aset SET intra_ekstra = 'intra', updated_at = now()
WHERE nibar IN (SELECT nibar FROM stg_import_peralatan_mesin) AND intra_ekstra <> 'intra';

-- Verifikasi — harus 218251 baris, semuanya 'intra':
--   SELECT intra_ekstra, count(*) FROM aset
--     WHERE nibar IN (SELECT nibar FROM stg_import_peralatan_mesin) GROUP BY 1;
