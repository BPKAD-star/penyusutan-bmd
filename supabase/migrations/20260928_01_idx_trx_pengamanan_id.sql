-- ============================================================================
-- Partial index untuk ledger Pengamanan — menutup timeout tab Format
-- Permendagri (IV.J), 2026-09-28.
--
-- `muatLaporanPengamanan` (lib/laporanPengamanan.ts) menyapu SELURUH
-- `transaksi_bmd` lewat `.in('jenis', ['pengamanan','pengembalian_pengamanan',
-- 'batal_pengamanan']).gt('id', terakhir).order('id').limit(1000)` — pola yang
-- sama persis dgn `fetchOwnerOverrides`/`hibah_masuk`/reklas/penghapusan/
-- koreksi yang sudah berkali-kali timeout di repo ini (lihat CLAUDE.md).
--
-- ⚠️ `jenis` (ENUM) TAK BISA jadi index-cond di bawah RLS — operator `=` pada
-- enum sendiri leakproof, tapi tanpa index yang memuat kolom itu di posisi
-- predikat, planner jatuh ke seq scan / index scan mundur PRIMARY KEY sambil
-- menyaring. Ledger pengamanan cuma segelintir baris di antara jutaan baris
-- ledger lain (dominan `saldo_awal`), jadi `id > N ORDER BY id LIMIT 1000`
-- menyusuri hampir seluruh tabel sebelum LIMIT terpenuhi.
--
-- Obatnya PARTIAL INDEX, pola yang sama dgn partial index keluarga lain
-- (Cara Perolehan 20260820_03, Perpindahan 20260729_01, Reklas 20260826_01,
-- Penghapusan 20260814_03, Koreksi): jenis selesai di index, sisa `id > N`
-- + `ORDER BY id` dilayani index itu sendiri.
--
-- ⚠️ Nama-nama index keluarga lain SENGAJA tidak dikutip literal di komentar
-- ini — lib/sinkronisasiRpc.test.ts memindai migrasi lewat substring nama
-- index, dan sebuah migrasi BARU yang cuma MENYEBUT nama index LAMA di
-- komentarnya akan ikut tertangkap sbg "migrasi terakhir" test itu lalu
-- membuatnya gagal mencari `CREATE INDEX` sungguhan di berkas yang salah.
--
-- ⚠️ Predikatnya KEMBAR dgn `JENIS_PENGAMANAN` di lib/laporanPengamanan.ts —
-- ubah satu, ubah dua-duanya.
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_trx_pengamanan_id
  ON transaksi_bmd (id)
  WHERE jenis IN ('pengamanan', 'pengembalian_pengamanan', 'batal_pengamanan');
