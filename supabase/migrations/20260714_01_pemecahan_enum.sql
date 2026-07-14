-- ============================================================================
-- Modul Koreksi: PEMECAHAN BARANG (1 induk → N pecahan).
-- Tambah 4 nilai enum ke jenis_transaksi_bmd. Model (append-only, tanpa DELETE):
--   - pemecahan_keluar      : pada INDUK. Induk di-retire (soft-delete,
--                             status='dihapus') & penyusutan BERHENTI sejak
--                             periode pemecahan. Masuk daftar SEMBUNYI.
--   - pemecahan_masuk       : pada tiap PECAHAN (aset baru). Baris BASELINE
--                             mid-life — payload bentuk checkpoint (nilai buku/
--                             akumulasi/sisa masa manfaat/beban) hasil ALOKASI
--                             PROPORSIONAL by nilai. Engine baca sbg seed
--                             (mulaiSetelah = periode SEBELUM event, jadi
--                             pecahan mulai akrual TEPAT di periode pemecahan —
--                             nyambung tanpa gap/overlap dgn induk yg berhenti).
--   - batal_pemecahan       : pada INDUK saat dibatalkan. Induk MUNCUL lagi &
--                             penyusutan lanjut (berhenti=false). Dicatat mundur
--                             ke tanggal pemecahan asli (period-correct).
--   - batal_pemecahan_masuk : pada tiap PECAHAN saat dibatalkan. Pecahan hilang
--                             (SEMBUNYI, soft-delete). Ledger pemecahan_masuk
--                             TETAP tersimpan utk audit (append-only).
--
-- Timing = TANGGAL DOKUMEN pemecahan (pola ber-SK, dikunci semester lewat
-- jurnal_header). SENGAJA TIDAK di-whitelist retroaktif di fn_cek_tahun_buku:
-- pemecahan/batal ke TAHUN TERKUNCI memang harus DITOLAK (lindungi periode yg
-- sudah dilaporkan) — sama disiplin dgn Koreksi Nilai/Penghapusan.
--
-- File sendirian: nilai enum baru tidak aman dipakai dalam DML pada transaksi
-- yang sama saat ditambahkan. Jalankan SETELAH 20260713_04_role_tiga_tingkat.sql.
-- ============================================================================

ALTER TYPE jenis_transaksi_bmd ADD VALUE IF NOT EXISTS 'pemecahan_keluar';
ALTER TYPE jenis_transaksi_bmd ADD VALUE IF NOT EXISTS 'pemecahan_masuk';
ALTER TYPE jenis_transaksi_bmd ADD VALUE IF NOT EXISTS 'batal_pemecahan';
ALTER TYPE jenis_transaksi_bmd ADD VALUE IF NOT EXISTS 'batal_pemecahan_masuk';
