-- ============================================================================
-- Tambal 307 baris yang hilang dari snapshot `aset_awal_2026`.
--
-- Permintaan user 2026-08-12, setelah selisih 93 vs 95 di Bagian Umum ditelusuri.
--
-- ── Duduk perkaranya ───────────────────────────────────────────────────────
-- Backfill 2026-07-10 (payload `Import Gedung Bangunan Lengkap.xlsx`, keterangan
-- "Baseline tambahan — Gedung/Bangunan yang kelewat di baseline 2025 awal")
-- menulis ke `aset` DAN ke ledger `saldo_awal`, tapi TIDAK ke `aset_awal_2026`.
--
-- Engine tak terpengaruh — ia me-replay ledger, dan baris ledgernya ada. Yang
-- timpang cuma menu **Saldo Awal** (Rekapitulasi & Daftar Barang Awal), satu-
-- satunya pembaca tabel snapshot ini. Karena itu cacatnya diam sebulan: Daftar
-- Barang & Penyusutan tampak wajar, cuma Saldo Awal yang kurang.
-- Contoh yang memicu penelusuran: Bagian Umum 1.3.3 → snapshot 93, register &
-- data mentah 95.
--
-- ── Siapa yang ditambal, siapa yang TIDAK ──────────────────────────────────
-- Syaratnya: punya baris ledger `saldo_awal`/`saldo_awal_checkpoint` — itulah
-- bukti barangnya SUDAH ADA pada akhir 2025. 307 baris, Rp223.572.043.354,66.
--
-- ⚠️ 11 aset yang juga tak ada di snapshot SENGAJA DIKECUALIKAN: ledgernya cuma
-- `pemecahan_masuk` (pecahan hasil Pemecahan Barang — Lapak UMKM Diskopusmik,
-- Tanah Bagian Kesra, Drainase Perkim). Pecahan itu LAHIR di 2026; induknya yang
-- sudah duduk di baseline. Menambahkannya = menghitung nilai yang sama dua kali
-- di Saldo Awal. Mereka mewarisi `cara_perolehan='saldo_awal'` dari induk, jadi
-- penyaringnya WAJIB keberadaan baris ledger, bukan kolom `cara_perolehan`.
--
-- 1 baris berstatus `dihapus` IKUT ditambal (induk Lapak UMKM yang dipecah
-- 2026): snapshot ini foto posisi AKHIR 2025, dan pada saat itu barangnya masih
-- ada. Konvensinya memang begitu — snapshot yang sekarang sudah memuat 202 baris
-- yang asetnya kini berstatus dihapus.
--
-- ── Angka mana yang dipakai ────────────────────────────────────────────────
-- `nilai_perolehan` & seluruh kolom penyusutan diambil dari BARIS LEDGER
-- `saldo_awal` (nilai + payload), BUKAN dari `aset` yang sekarang. Ini bukan
-- kerewelan: "Perbaikan Perkerasan Halaman Rumah Dinas Bupati" bernilai
-- 213.847.888 pada akhir 2025 lalu dinaikkan jadi 1.828.592.000 oleh
-- `koreksi_nilai` di Juli 2026. Menyalin nilai sekarang akan menyelundupkan
-- mutasi 2026 ke dalam baseline yang seharusnya BEKU.
--
-- `skpd_id` = pemilik pada akhir 2025, bukan pemilik sekarang: diambil dari
-- `skpd_asal` perpindahan PERTAMA aset itu (24 baris kena). Tanpa ini, 6 barang
-- yang Juni 2026 dialihkan Perkim → Setda → Bagian Umum akan tercatat di
-- baseline Bagian Umum, padahal akhir 2025 masih milik Perkim — dan pengalihan
-- 2026 memang TIDAK boleh menggeser baseline (CLAUDE.md: Saldo Awal sengaja
-- tidak period-aware).
--
-- Kolom deskriptif disalin apa adanya dari `aset`. Yang bisa berubah oleh
-- koreksi spesifikasi 2026 memang boleh ikut — tabel ini yang BEKU angkanya,
-- spesifikasinya justru boleh dikoreksi (migrasi 20260728_01). `pemanfaatan`
-- sengaja TIDAK disalin: ia cache keadaan sekarang, bukan fakta 2025.
--
-- ── Aman dijalankan ulang ──────────────────────────────────────────────────
-- `NOT EXISTS` pada nibar membuatnya idempoten. Trigger `trg_aset_awal_2026_
-- spek_only` cuma BEFORE UPDATE, jadi INSERT ini tak tersentuh olehnya.
-- Tak ada perubahan skema & tak ada yang dibaca engine → urutan deploy bebas.
-- ============================================================================

WITH kandidat AS (
  SELECT
    a.id,
    -- Baris baseline TERBARU (pola hitungJadwalAset: checkpoint terbaru menang).
    (SELECT t.id FROM transaksi_bmd t
      WHERE t.aset_id = a.id AND t.jenis IN ('saldo_awal', 'saldo_awal_checkpoint')
      ORDER BY t.id DESC LIMIT 1) AS sa_id,
    -- Pemilik akhir 2025 = asal perpindahan PERTAMA; kalau tak pernah pindah,
    -- pemilik sekarang.
    COALESCE(
      (SELECT t2.skpd_asal FROM transaksi_bmd t2
        WHERE t2.aset_id = a.id AND t2.jenis IN ('pengalihan_status', 'mutasi_internal')
        ORDER BY t2.id ASC LIMIT 1),
      a.skpd_id
    ) AS skpd_2025
  FROM aset a
  WHERE a.cara_perolehan = 'saldo_awal'
    AND NOT EXISTS (SELECT 1 FROM aset_awal_2026 w WHERE w.nibar = a.nibar)
)
INSERT INTO aset_awal_2026 (
  nibar, kode, nama_barang, skpd_id, intra_ekstra, nilai_perolehan, tgl_perolehan,
  masa_manfaat_smt, akumulasi_2025, nilai_buku_awal, sisa_masa_manfaat_smt,
  beban_penyusutan_per_smt,
  spesifikasi_lainnya, merek_tipe, no_polisi, no_bpkb, no_rangka, no_mesin, luas,
  nomor_dokumen_kepemilikan, tanggal_dokumen_kepemilikan, nama_dokumen_kepemilikan,
  jenis_hak, wilayah_kode, alamat_detail, latitude, longitude, foto_paths,
  uraian_barang, keterangan, jumlah, satuan, harga_satuan, penggunaan_pengamanan,
  asal_usul, kondisi_barang, tahun_pengadaan, golongan
)
SELECT
  a.nibar, a.kode, a.nama_barang, k.skpd_2025, a.intra_ekstra,
  t.nilai,                                   -- nilai BEKU akhir 2025, bukan a.nilai_perolehan
  a.tgl_perolehan,
  NULLIF(t.payload->>'masa_manfaat_smt', '')::numeric::smallint,
  COALESCE(NULLIF(t.payload->>'akumulasi_2025', '')::numeric, 0),
  -- Nilai buku wajib NOT NULL. Kalau payload-nya tak memuatnya (baris baseline
  -- lama), turunkan — JANGAN jatuh ke 0, itu akan tampil sebagai barang yang
  -- tersusut habis padahal belum.
  COALESCE(
    NULLIF(t.payload->>'nilai_buku_awal', '')::numeric,
    t.nilai - COALESCE(NULLIF(t.payload->>'akumulasi_2025', '')::numeric, 0)
  ),
  NULLIF(t.payload->>'sisa_masa_manfaat_smt', '')::numeric::smallint,
  NULLIF(t.payload->>'beban_per_smt', '')::numeric,
  a.spesifikasi_lainnya, a.merek_tipe, a.no_polisi, a.no_bpkb, a.no_rangka, a.no_mesin, a.luas,
  a.nomor_dokumen_kepemilikan, a.tanggal_dokumen_kepemilikan, a.nama_dokumen_kepemilikan,
  a.jenis_hak, a.wilayah_kode, a.alamat_detail, a.latitude, a.longitude,
  COALESCE(a.foto_paths, '{}'),
  a.uraian_barang, a.keterangan, COALESCE(a.jumlah, 1), a.satuan, a.harga_satuan,
  a.penggunaan_pengamanan, a.asal_usul, a.kondisi_barang, a.tahun_pengadaan, a.golongan
FROM kandidat k
JOIN aset a ON a.id = k.id
JOIN transaksi_bmd t ON t.id = k.sa_id;   -- INNER JOIN = penyaring pecahan 2026

-- Sesudah dijalankan, angkanya wajib cocok:
--   SELECT count(*) FROM aset_awal_2026 w JOIN admin_skpd s ON s.id=w.skpd_id
--   WHERE s.nama='Bagian Umum' AND w.kode LIKE '1.3.3.%';   -- harus 95
