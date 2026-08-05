-- Backfill `intra_ekstra` golongan 1.3.6 (Konstruksi Dalam Pengerjaan) → 'intra'.
--
-- ✅ SUDAH DIJALANKAN di produksi 2026-08-05 (manual lewat SQL Editor, sebelum
--    berkas ini ditulis). Berkas ini catatan permanennya + bisa dijalankan ulang
--    dengan aman: `WHERE intra_ekstra IS NULL` jadi 0 baris, dan
--    `CREATE TABLE IF NOT EXISTS` TIDAK menimpa tabel backup yang sudah berisi
--    113 baris nilai lama itu. Jangan ganti jadi `CREATE TABLE` polos atau
--    `DROP … CASCADE` — satu-satunya jejak nilai sebelum perbaikan ada di situ.
--
-- Hasil setelah dijalankan (diverifikasi):
--   · aset & aset_awal_2026: 233 baris KDP, semua 'intra', Rp 195.710.710.149;
--   · kode register terbit untuk 113 baris (berkode 120 → 233);
--   · sisa `intra_ekstra IS NULL` di SELURUH kedua tabel: 0;
--   · aset tanpa `kode_register` di seluruh register: 0 — ke-113 KDP ini
--     ternyata barang TERAKHIR di database yang belum berkode register.
--
-- Latar: dari impor e-BMD, 113 dari 233 baris KDP tidak pernah punya nilai
-- `intra_ekstra` sama sekali (NULL) — di `aset` MAUPUN di snapshot
-- `aset_awal_2026`, barang yang sama persis (cocok 1:1 by NIBAR), senilai
-- Rp 1.848.098.606. Ditemukan user 2026-08-05 saat mencocokkan Saldo Awal vs
-- Daftar Barang; keputusan "KDP intra semua" dari user di sesi yang sama.
--
-- KENAPA ITU BERBAHAYA, bukan sekadar kolom kosong:
--
--  1. DUA PEMBACA MENAFSIRKANNYA BERBEDA — ini sumber selisihnya.
--     Rekonsiliasi BMD memperlakukan NULL sebagai INTRA (`kompOf` di
--     lib/rekon.ts: apa pun yang bukan 'ekstra' → intra), sedangkan filter SQL
--     `intra_ekstra = 'intra'` (Daftar Barang, fn_rekap_bmd, dll) MEMBUANG NULL
--     — perbandingan dengan NULL bernilai NULL, bukan TRUE. Jadi dua tampilan
--     berbeda persis sebesar Rp 1.848.098.606 tanpa satu pun pesan error.
--
--  2. KODE REGISTERNYA TAK PERNAH TERBIT. `fn_prefix_kode_register` sengaja
--     fail-closed: `COALESCE(p_intra_ekstra,'') NOT IN ('intra','ekstra')` →
--     prefix NULL → `fn_aset_kode_register_sync` `RETURN NEW` lebih awal →
--     nomor tak dialokasikan. Terbukti di data: ke-113 baris itu
--     `kode_register IS NULL`, sementara 120 baris ber-intra semuanya berkode.
--     Begitu kolomnya diisi, trigger `trg_aset_kode_register` (yang memang
--     memuat `intra_ekstra` di klausa `UPDATE OF`) menerbitkan nomornya
--     OTOMATIS — itu efek yang DIINGINKAN di sini, bukan kecelakaan.
--
--     Penting: karena `OLD.kode_register IS NULL`, cabang pencatatan riwayat di
--     fungsi trigger itu TIDAK jalan (syaratnya `OLD.kode_register IS NOT NULL`).
--     Jadi tak ada baris `aset_kode_register` yang tercipta — tepat, sebab ini
--     PENERBITAN PERTAMA, bukan perpindahan. Riwayat kode register tetap bersih.
--
-- KENAPA UPDATE LANGSUNG, BUKAN LEDGER `reklas_komptabel`:
-- ini melengkapi data impor yang tak pernah terisi, bukan memindahkan barang
-- antar keranjang laporan. Kalau dicatat sebagai reklas bertanggal hari ini,
-- Rekonsiliasi BMD 2026-S2 akan menampilkan mutasi Rp1,8 M yang TIDAK PERNAH
-- TERJADI. Konsekuensi yang diterima: perbaikan ini tak punya jejak ledger —
-- karena itu jejaknya ada di berkas migrasi ini + tabel backup di bawah.
--
-- KENAPA `aset_awal_2026` IKUT walau baseline itu BEKU: yang beku adalah
-- ANGKANYA (nilai perolehan, akumulasi, dst). Di sini yang diisi kolom
-- KLASIFIKASI yang memang tak pernah punya nilai, dan snapshot harus tetap
-- sinkron dengan register — kalau cuma salah satu dibetulkan, selisihnya bukan
-- hilang melainkan PINDAH. `intra_ekstra` termasuk kolom terkunci
-- (trigger `fn_aset_awal_2026_spek_only` + GRANT UPDATE per-kolom), tapi
-- penguncinya sengaja dilewati saat `current_user <> 'authenticated'` — persis
-- untuk keperluan "benerin baseline" seperti ini. Karena itu migrasi ini WAJIB
-- dijalankan dari SQL Editor / service-role, dan TIDAK BISA dari aplikasi.
--
-- Skala: 113 baris × 2 tabel. Kecil — tak ada risiko WAL/disk seperti backfill
-- kode register (20260729_04, ±700 MB WAL).
--
-- Idempoten: `WHERE intra_ekstra IS NULL` — dijalankan ulang tidak mengubah apa
-- pun & tidak menerbitkan nomor register baru.

BEGIN;

-- Backup dulu (nilai lama + kode register lama), supaya perbaikan tanpa ledger
-- ini tetap bisa ditelusuri & dibalik.
CREATE TABLE IF NOT EXISTS backup_kdp_komptabel_20260805 AS
SELECT a.id AS aset_id, a.nibar, a.kode, a.nama_barang, a.skpd_id,
       a.intra_ekstra  AS aset_intra_ekstra_lama,
       a.kode_register AS aset_kode_register_lama,
       s.intra_ekstra  AS snapshot_intra_ekstra_lama
FROM aset a
LEFT JOIN aset_awal_2026 s ON s.nibar = a.nibar
WHERE a.kode LIKE '1.3.6.%' AND a.intra_ekstra IS NULL;

-- Register hidup. Trigger kode register ikut jalan di sini (disengaja) →
-- 113 kode register terbit.
UPDATE aset SET intra_ekstra = 'intra'
WHERE kode LIKE '1.3.6.%' AND intra_ekstra IS NULL;

-- Snapshot saldo awal 2025/2026 — harus ikut supaya tetap sinkron.
UPDATE aset_awal_2026 SET intra_ekstra = 'intra'
WHERE kode LIKE '1.3.6.%' AND intra_ekstra IS NULL;

COMMIT;

-- ── Verifikasi ──────────────────────────────────────────────────────────────
-- Diharapkan SATU baris per tabel: komptabel 'intra', jml 233,
-- nilai 195.710.710.149, dan `berkode` 233 (bukan 120 lagi).
-- Kalau `berkode` masih 120, trigger kode registernya tidak jalan — periksa
-- `trg_aset_kode_register` sebelum menganggap migrasi ini selesai.
SELECT 'aset' AS tabel, COALESCE(intra_ekstra, '(NULL)') AS komptabel,
       count(*) AS jml, count(kode_register) AS berkode,
       sum(nilai_perolehan)::numeric AS nilai
FROM aset WHERE kode LIKE '1.3.6.%' AND status <> 'draft' GROUP BY 1, 2
UNION ALL
SELECT 'aset_awal_2026', COALESCE(intra_ekstra, '(NULL)'),
       count(*), NULL, sum(nilai_perolehan)
FROM aset_awal_2026 WHERE kode LIKE '1.3.6.%' GROUP BY 1, 2
ORDER BY 1, 2;

-- Sisa golongan lain yang komptabelnya masih NULL — BUKAN bagian migrasi ini
-- (KDP saja yang diputuskan user), tapi ditampilkan supaya ketahuan kalau
-- masalah yang sama mengendap di golongan lain.
SELECT split_part(kode,'.',1)||'.'||split_part(kode,'.',2)||'.'||split_part(kode,'.',3) AS golongan,
       count(*) AS jml, sum(nilai_perolehan)::numeric AS nilai
FROM aset
WHERE intra_ekstra IS NULL AND status <> 'draft'
GROUP BY 1 ORDER BY 1;
