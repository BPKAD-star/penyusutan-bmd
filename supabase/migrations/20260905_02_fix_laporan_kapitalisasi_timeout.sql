-- ============================================================================
-- 2026-09-05 — Laporan Kapitalisasi macet selamanya di "Memuat data..."
--
-- SEBAB: LaporanTransaksi.tsx memanggil
-- `fetchBatalTargets(supabase, BATAL_TARGET_JENIS.kapitalisasi)` — yaitu
-- `jenis IN ('batal_kapitalisasi')` — TANPA scope aset_id, jadi ia menyapu
-- SELURUH `transaksi_bmd` per halaman 1000 baris. Migrasi 20260826_01 sudah
-- membuat `idx_trx_kapitalisasi_id` untuk laporan ini, TAPI predikatnya cuma
-- `jenis IN ('kapitalisasi')` — tidak memuat `batal_kapitalisasi`. Ronde
-- "jenis (ENUM) tak bisa jadi index-cond di bawah RLS" (CLAUDE.md) berlaku
-- lagi: query itu jatuh ke seq-scan/PK-scan mundur → statement timeout →
-- promise `fetchBatalTargets(...).then(setBatalTargets)` REJECT tanpa
-- `.catch()` di pemanggilnya → `batalTargets` tak pernah terisi →
-- `if (!batalTargets) return` di efek berikutnya tak pernah lolos →
-- `loading` tak pernah `false` → halaman macet SELAMANYA, tanpa satu pun
-- pesan error (persis kelas bug "kolektor melempar tanpa try/catch").
--
-- Laporan Koreksi (jenisList sama pola-nya) py cacat KEMBAR: `idx_trx_koreksi_id`
-- tidak memuat `batal_koreksi_nilai`/`batal_koreksi_spesifikasi`/
-- `batal_koreksi_pencatatan_ganda` — belum ada laporan yang melaporkannya
-- (mungkin belum ada yang membatalkan koreksi lewat menu itu), tapi bom waktu
-- yang sama persis. Ditambal sekalian di sini, bukan menunggu laporan kedua.
--
-- Laporan Reklasifikasi TIDAK kena — `idx_trx_reklas_id` (migrasi 20260826_01)
-- SUDAH memuat 'batal_reklas' di predikatnya sejak awal.
--
-- Predikat parsial tak bisa di-ALTER → drop & buat ulang (pola established).
-- ============================================================================

DROP INDEX IF EXISTS idx_trx_kapitalisasi_id;
CREATE INDEX IF NOT EXISTS idx_trx_kapitalisasi_id
  ON transaksi_bmd (id)
  WHERE jenis IN ('kapitalisasi', 'batal_kapitalisasi');

DROP INDEX IF EXISTS idx_trx_koreksi_id;
CREATE INDEX IF NOT EXISTS idx_trx_koreksi_id
  ON transaksi_bmd (id)
  WHERE jenis IN ('koreksi_nilai', 'koreksi_spesifikasi', 'koreksi_pencatatan_ganda',
                  'pemecahan_keluar', 'pemecahan_masuk',
                  'batal_pemecahan', 'batal_pemecahan_masuk',
                  'batal_koreksi_nilai', 'batal_koreksi_spesifikasi', 'batal_koreksi_pencatatan_ganda');

ANALYZE transaksi_bmd;

-- ── Verifikasi: harus menyebut index barunya, BUKAN transaksi_bmd_pkey ──────
--   BEGIN;
--   SET LOCAL role authenticated;
--   SET LOCAL request.jwt.claims TO '{"sub":"<uid admin>","role":"authenticated"}';
--   EXPLAIN ANALYZE SELECT id FROM transaksi_bmd WHERE jenis = 'batal_kapitalisasi' ORDER BY id DESC LIMIT 500;
--   ROLLBACK;
