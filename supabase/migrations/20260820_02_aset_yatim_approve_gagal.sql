-- ============================================================================
-- 2026-08-20 — ASET YATIM sisa approve yang GAGAL (Hibah SDHI, Dinas PU)
--
-- GEJALA: Daftar Barang menampilkan 15 barang DOBEL (Tanah Jalan RD 1..6,
-- Jalan Road Diversion 1..6, Jembatan Gowa/Dahu, Peningkatan Jalan PB.
-- Sudirman) — sepasang-sepasang, nilainya sama persis, NIBAR-nya beda nomor
-- urut. Bareng itu Laporan BMD Model 3 SALDO AWAL 2026-S1 lebih besar dari
-- Saldo Awal → Rekapitulasi, tepat sebesar Rp275.415.118.752:
--     1.3.1  486.003.869.578,8 vs 324.140.201.961,8  → beda 161.863.667.617
--     1.3.4  3.506.859.086.704,22 vs 3.393.307.635.569,22 → beda 113.551.451.135
-- Dua angka itu SAMA PERSIS dengan kolom Penambahan golongan yang sama, jadi
-- barangnya benar-benar kehitung dua kali: sekali di Saldo Awal (kembaran
-- yatim), sekali di Penambahan (baris yang sah).
--
-- SEBABNYA rollback approve yang setengah jalan. `approveHeader`
-- (PerolehanManual.tsx) menulis `aset` DULU, baru `transaksi_bmd`. Percobaan
-- approve 2026-08-19 23:29:58 UTC gagal di langkah kedua — guard tahun buku
-- menolak baris bertanggal 2024 — dan rollback-nya menyetel
-- `aset.status = 'dihapus'`. Approve kedua (2026-08-20 00:10:40 UTC, sesudah
-- perbaikan tanggal BAST) berhasil dan membuat 15 aset LAGI.
--
-- Kenapa yang 'dihapus' tetap tampil: Daftar Barang, Penyusutan, Laporan BMD,
-- & Rekonsiliasi TIDAK membaca `aset.status` untuk memutuskan sembunyi — mereka
-- me-REPLAY event ledger (`fn_dbar_hidden`), dan saringan status-nya cuma
-- `status <> 'draft'`. Aset yatim ini TAK PUNYA SATU PUN BARIS LEDGER, jadi
-- tak ada `SEMBUNYI` yang bisa direplay dan ia lolos semua penyaring. Ini
-- persis kerusakan yang sudah pernah terjadi & didokumentasikan di CLAUDE.md
-- (migrasi 20260704_19: "barang yg sudah status='dihapus' MUNCUL LAGI").
--
-- ── KENAPA 'draft', BUKAN BARIS LEDGER `koreksi_pencatatan_ganda` ───────────
-- Naluri pertama adalah mengikuti migrasi 20260819_01 (nonaktifkan duplikat
-- lewat `koreksi_pencatatan_ganda` yang dibackdate). Di SINI itu keliru:
-- duplikat 20260819_01 PUNYA baris ledger `saldo_awal` & riwayat sungguhan,
-- jadi memang harus dikoreksi di ledger. Yang ini NOL baris ledger — barangnya
-- tak pernah sampai tercatat sebagai peristiwa apa pun. Menuliskan
-- `koreksi_pencatatan_ganda` berarti mengarang peristiwa akuntansi yang tak
-- pernah terjadi, lalu menaruhnya PERMANEN di ledger yang append-only.
--
-- `draft` = "barang belum resmi, JANGAN pernah tampil" — arti yang memang
-- sudah dipakai repo ini, dan rollback approve Konstruksi/KDP (lib/kdp.ts)
-- SUDAH memakainya sejak awal. Diverifikasi ke DB hidup 2026-08-20: SEMUA
-- pembaca Lapis 1 menyaringnya — fn_daftar_barang, fn_daftar_barang_rekap,
-- fn_penyusutan, fn_rekap_bmd, fn_rekon_pos (fn_rekon_rekap lewat fn_rekon_pos)
-- semuanya `status <> 'draft'`; fn_dashboard_rekap malah `status = 'aktif'`.
-- Sisi klien pun: seluruh picker & halaman register `eq('status','aktif')`.
--
-- AMAN dari trigger kode register: `fn_aset_kode_register_sync` punya cabang
-- paling awal `IF NEW.status = 'draft' THEN kode_register := NULL; RETURN` —
-- tak membakar nomor counter & tak menulis baris riwayat. Kolom `nibar`
-- SENGAJA dibiarkan utuh: ia UNIQUE dan tetap jadi batas atas `generateNibars`,
-- jadi nomor urut 1..6 tak akan dipakai ulang, sekaligus menyisakan jejak apa
-- yang sempat dicoba.
--
-- LEDGER TIDAK DISENTUH SAMA SEKALI. Tak ada baris ditambah/diubah/dihapus.
--
-- IDEMPOTEN & SWA-BATAS: predikatnya "tak punya satu pun baris ledger DAN
-- status 'dihapus'". Barang yang dihapus SUNGGUHAN selalu punya baris
-- penghapusan, jadi mustahil ikut kesapu. Dijalankan dua kali → 0 baris.
-- ============================================================================

DO $$
DECLARE v_n int; v_nilai numeric;
BEGIN
  SELECT count(*), COALESCE(sum(nilai_perolehan), 0) INTO v_n, v_nilai
  FROM aset a
  WHERE a.status = 'dihapus'
    AND NOT EXISTS (SELECT 1 FROM transaksi_bmd t WHERE t.aset_id = a.id);

  RAISE NOTICE 'Aset yatim (status dihapus, TANPA baris ledger): % baris, Rp%', v_n, v_nilai;

  -- Sabuk pengaman: kalau yang kena jauh lebih banyak dari yang diselidiki,
  -- BATALKAN. Lebih baik migrasi gagal daripada menyembunyikan barang sah.
  IF v_n > 50 THEN
    RAISE EXCEPTION 'Dibatalkan: % aset yatim, jauh di atas 15 yang diselidiki. Selidiki dulu.', v_n;
  END IF;

  UPDATE aset a SET status = 'draft'
  WHERE a.status = 'dihapus'
    AND NOT EXISTS (SELECT 1 FROM transaksi_bmd t WHERE t.aset_id = a.id);

  GET DIAGNOSTICS v_n = ROW_COUNT;
  RAISE NOTICE 'Selesai: % aset disetel ke draft (hilang dari SEMUA laporan).', v_n;
END $$;

-- ── Verifikasi: ketiganya WAJIB 0 ───────────────────────────────────────────
SELECT
  (SELECT count(*) FROM aset a
     WHERE a.status = 'dihapus'
       AND NOT EXISTS (SELECT 1 FROM transaksi_bmd t WHERE t.aset_id = a.id)) AS sisa_yatim,
  (SELECT count(*) FROM aset WHERE status = 'draft' AND kode_register IS NOT NULL) AS draft_masih_berkode,
  (SELECT count(*) FROM aset a
     WHERE a.status = 'draft'
       AND EXISTS (SELECT 1 FROM transaksi_bmd t WHERE t.aset_id = a.id)) AS draft_kena_salah_sapu;
