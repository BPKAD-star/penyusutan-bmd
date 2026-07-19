-- ============================================================================
-- Batal Koreksi — 3 jenis ledger pembalik (2026-07-19).
--
-- Membalik koreksi (Nilai Perolehan / Spesifikasi / Pencatatan Ganda) TANPA
-- hapus baris (append-only mutlak). Semua dicatat tanggal HARI INI (current_date)
-- → selalu di tahun terbuka, TIDAK perlu whitelist retroaktif di
-- fn_cek_tahun_buku (beda dgn batal_penghapusan yg backdate).
--
--   batal_koreksi_nilai
--     Engine MENGABAIKAN koreksi_nilai target (payload.target_trx_id) saat replay
--     → nilai perolehan kembali seperti sebelum koreksi (pola SAMA batal_reklas/
--     batal_kapitalisasi). aset.nilai_perolehan dikembalikan ke nilai_lama.
--
--   batal_koreksi_spesifikasi
--     Kembalikan field aset ke nilai SEBELUM koreksi (payload.prev — disimpan saat
--     koreksi dibuat). Tanpa efek engine/penyusutan.
--
--   batal_koreksi_pencatatan_ganda
--     Barang duplikat yg tadinya digabung (soft-delete, SEMBUNYI) MUNCUL & aktif
--     lagi (pola SAMA batal_penghapusan): aset.status='aktif', engine berhenti=false,
--     event MUNCUL di visibilitas Daftar Barang/Penyusutan.
--
-- Aturan (lihat CLAUDE.md "Aturan lintas-fitur"):
--   - UI WAJIB blokir batal kalau aset punya transaksi LEBIH BARU setelah koreksi
--     yg dibatalkan (guard rantai — sah cuma utk event terbaru aset). Ini penting
--     utk koreksi_nilai: delta berantai, cuma yg TERAKHIR yg boleh dibatalkan.
--   - WAJIB "Jalankan Engine" ulang setelah batal supaya penyusutan_semester
--     dihitung ulang.
--
-- File sendirian: nilai enum baru tidak aman dipakai dalam DML pada transaksi
-- yang sama saat ditambahkan (sama catatan migrasi 20260719_03). Jalankan
-- migrasi ini sendiri, sebelum UI Batal Koreksi dipakai.
-- ============================================================================

ALTER TYPE jenis_transaksi_bmd ADD VALUE IF NOT EXISTS 'batal_koreksi_nilai';
ALTER TYPE jenis_transaksi_bmd ADD VALUE IF NOT EXISTS 'batal_koreksi_spesifikasi';
ALTER TYPE jenis_transaksi_bmd ADD VALUE IF NOT EXISTS 'batal_koreksi_pencatatan_ganda';
