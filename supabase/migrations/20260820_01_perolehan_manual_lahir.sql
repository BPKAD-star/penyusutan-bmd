-- ============================================================================
-- 2026-08-20 — Cara Perolehan manual: barang BEKAS yang diterima pertengahan umur
--
-- MAKSUD: mendaftarkan `hibah_masuk`, `tukar_menukar`, `hasil_inventarisasi`,
-- `perolehan_lainnya` sebagai EVENT KELAHIRAN (v_lahir) di `fn_dbar_hidden`,
-- kembar dengan `LAHIR` di lib/visibilitas.ts.
--
-- ⚠️ WAJIB DIJALANKAN SEBELUM DEPLOY KODE. Sejak perubahan kode yang menyertainya,
-- baris ledger keempat jenis itu dicatat pada TANGGAL BAST, bukan tanggal
-- perolehan barang. Kalau migrasi ini belum jalan sementara kodenya sudah
-- tayang, barang hibah bertanggal perolehan 2024 yang diterima 2026 akan
-- MUNCUL DI LAPORAN 2024 & 2025 — tahun yang sudah dikunci dan sudah
-- dilaporkan — sementara Daftar Barang (yang sudah pakai LAHIR versi TS) sudah
-- menyembunyikannya. Dua laporan Lapis 1 berhenti sepakat, tanpa satu pun error.
--
-- LATAR: sampai hari ini baris ledger dicatat pada tanggal perolehan barang,
-- sehingga periode ledger SELALU sama dengan periode `tgl_perolehan` dan
-- `belumAdaPada` sudah cukup untuk menentukan visibilitas. Dua akibatnya:
--   (1) barang yang dibangun pihak pemberi sebelum tahun berjalan MUSTAHIL
--       dicatat — guard tahun buku menolaknya ("Tahun 2024 sudah tutup buku");
--   (2) tak ada cara membedakan "kapan barang dibuat" dari "kapan ia jadi milik
--       pemkab", padahal yang pertama menentukan penyusutan & yang kedua
--       menentukan ia muncul di periode laporan mana.
--
-- KOMPATIBILITAS BARIS LAMA: aman. Untuk baris yang dicatat sebelum perubahan
-- ini, periode ledger memang SAMA dengan periode `tgl_perolehan`, jadi
-- `min(periode) > p_periode` menjawab persis seperti sebelumnya. Tak ada angka
-- historis yang bergeser.
--
-- TIDAK ADA fungsi lain yang perlu disunting: fn_daftar_barang,
-- fn_daftar_barang_rekap, fn_penyusutan, fn_rekon_pos, fn_rekon_rekap, dan
-- fn_rekap_bmd SEMUANYA sudah memanggil fn_dbar_hidden (diverifikasi
-- 2026-08-20). Salinan daftar yang masih tersisa di migrasi 20260814_05/06
-- adalah definisi LAMA yang sudah tertimpa — jangan ikut disunting.
-- ============================================================================

-- ── 1. PARTIAL INDEX event visibilitas — WAJIB ikut diperlebar ──────────────
-- Predikat index harus mencakup SELURUH jenis yang di-query `ev`. Query-nya
-- kini menyaring 24 jenis sementara index lama cuma memuat 20 → tak ada lagi
-- jaminan setiap baris yang dicari ada di index, jadi planner MENGABAIKANNYA
-- dan jatuh ke seq scan 418rb baris. Tanpa satu pun error; gejalanya cuma
-- Daftar Barang & Penyusutan mendadak lambat lalu timeout.
--
-- Predikat index tak bisa di-ALTER → DROP lalu CREATE. Aman: ini partial index
-- atas segelintir jenis peristiwa, bukan seluruh ledger.
-- PLAIN, bukan CONCURRENTLY — Supabase SQL Editor membungkus skrip dalam satu
-- transaksi & CONCURRENTLY akan gagal senyap di sana (CLAUDE.md, migrasi 20260718_06).
DROP INDEX IF EXISTS idx_trx_visibilitas;

CREATE INDEX idx_trx_visibilitas
  ON transaksi_bmd (aset_id, periode, id)
  WHERE jenis IN (
    'kapitalisasi_serap','penghapusan_pemindahtanganan','penghapusan_sebab_lain',
    'batal_pengadaan','koreksi_pencatatan_ganda','batal_hibah_masuk',
    'batal_tukar_menukar','batal_hasil_inventarisasi','batal_perolehan_lainnya',
    'pemecahan_keluar','batal_pemecahan_masuk','penggabungan_keluar',
    'kdp_selesai_keluar','batal_kapitalisasi','batal_penghapusan','batal_pemecahan',
    'batal_koreksi_pencatatan_ganda','batal_penggabungan',
    'pemecahan_masuk','kdp_selesai_masuk',
    -- BARU 2026-08-20 — kembar dgn v_lahir di fn_dbar_hidden & LAHIR di TS.
    'hibah_masuk','tukar_menukar','hasil_inventarisasi','perolehan_lainnya'
  );

-- ── 2. fn_dbar_hidden — v_lahir diperlebar ─────────────────────────────────
-- Badannya disalin UTUH dari migrasi 20260818_01 (definisi yang berlaku); yang
-- berubah HANYA isi `v_lahir`. Tanda tangannya tidak berubah, jadi cukup
-- CREATE OR REPLACE — tak perlu DROP seperti 20260818_01 yang waktu itu
-- menambah parameter.
CREATE OR REPLACE FUNCTION fn_dbar_hidden(
  p_periode text,
  p_varian  text DEFAULT 'daftar_barang'
)
RETURNS TABLE(aset_id uuid)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  -- ⚠️ Bertipe ENUM, bukan text. `jenis::text = ANY(...)` mematikan
  -- `idx_trx_jenis_id` → seq scan 418rb baris tiap panggil (CLAUDE.md §fn_rekap_bmd).
  v_sembunyi jenis_transaksi_bmd[] := ARRAY[
    'kapitalisasi_serap','penghapusan_pemindahtanganan','penghapusan_sebab_lain',
    'batal_pengadaan','koreksi_pencatatan_ganda','batal_hibah_masuk',
    'batal_tukar_menukar','batal_hasil_inventarisasi','batal_perolehan_lainnya',
    'pemecahan_keluar','batal_pemecahan_masuk','penggabungan_keluar'
  ]::jenis_transaksi_bmd[];
  v_muncul jenis_transaksi_bmd[] := ARRAY[
    'batal_kapitalisasi','batal_penghapusan','batal_pemecahan',
    'batal_koreksi_pencatatan_ganda','batal_penggabungan'
  ]::jenis_transaksi_bmd[];
  -- ⚠️ KEMBAR dengan `LAHIR` di lib/visibilitas.ts — ubah satu, ubah dua-duanya,
  -- DAN predikat idx_trx_visibilitas di atas.
  --
  -- Keempat jenis Cara Perolehan manual masuk sejak 2026-08-20: barisnya kini
  -- dicatat pada tanggal BAST, sedangkan `aset.tgl_perolehan` tetap tanggal
  -- pembuatan barang oleh pihak pemberi. Tanpa terdaftar di sini, barang yang
  -- dibangun 2024 & dihibahkan 2026 akan terbaca "sudah ada sejak 2024".
  --
  -- `pengadaan` SENGAJA TIDAK ikut: di menu Pengadaan, tanggal perolehan efektif
  -- MEMANG tanggal BAST-nya sendiri, jadi tak ada dua tanggal yang berbeda.
  v_lahir jenis_transaksi_bmd[] := ARRAY[
    'pemecahan_masuk','kdp_selesai_masuk',
    'hibah_masuk','tukar_menukar','hasil_inventarisasi','perolehan_lainnya'
  ]::jenis_transaksi_bmd[];
BEGIN
  -- Varian ngawur DITOLAK, bukan diam-diam jatuh ke default: salah ketik yang
  -- jatuh ke default persis kegagalan senyap yang parameter ini mau cegah.
  IF p_varian IS NULL OR p_varian NOT IN ('daftar_barang','penyusutan') THEN
    RAISE EXCEPTION 'varian visibilitas tak dikenal: % (sah: daftar_barang, penyusutan)', p_varian
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_varian = 'daftar_barang' THEN
    v_sembunyi := v_sembunyi || 'kdp_selesai_keluar'::jenis_transaksi_bmd;
  END IF;

  RETURN QUERY
  WITH ev AS (
    SELECT t.aset_id AS a_id, t.id AS trx_id, t.periode, t.jenis
    FROM transaksi_bmd t
    WHERE t.jenis = ANY(v_sembunyi || v_muncul || v_lahir)
  ),
  -- `lahirSetelah`: event kelahiran PALING AWAL sesudah periode → belum ada.
  lahir AS (
    SELECT e.a_id FROM ev e
    WHERE e.jenis = ANY(v_lahir)
    GROUP BY e.a_id
    HAVING min(e.periode) > p_periode
  ),
  -- `tersembunyiPada`: replay kronologis (periode lalu id ledger), baris
  -- TERAKHIR menang. BUKAN dikelompokkan sembunyi-dulu-baru-muncul — siklus
  -- hapus→batal→hapus dalam satu periode harus ikut aksi terakhir.
  sembunyi AS (
    SELECT x.a_id FROM (
      SELECT DISTINCT ON (e.a_id) e.a_id, e.jenis
      FROM ev e
      WHERE e.periode <= p_periode
        AND NOT (e.jenis = ANY(v_lahir))
      ORDER BY e.a_id, e.periode DESC, e.trx_id DESC
    ) x
    WHERE x.jenis = ANY(v_sembunyi)
  )
  SELECT l.a_id FROM lahir l
  UNION
  SELECT s.a_id FROM sembunyi s;
END;
$function$;
