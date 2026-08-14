-- 20260814_05_daftar_barang_paginasi_server.sql
-- Paginasi Daftar Barang PINDAH KE SERVER + `fn_daftar_barang` ditulis ULANG.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- KENAPA VERSI LAMA DIBUANG, BUKAN DITAMBAL
-- ═══════════════════════════════════════════════════════════════════════════
-- `fn_daftar_barang` versi lama ADA di DB tapi TIDAK DIPAKAI halaman mana pun,
-- dan isinya sudah menyimpang jauh dari sumber kebenaran (`lib/visibilitas.ts`
-- + `lib/pengalihan.ts`). Diverifikasi ke DB produksi 2026-08-14:
--
--   * TAK PUNYA `LAHIR` sama sekali — cuma `tgl_perolehan <= periode`. Pecahan
--     hasil Pemecahan Barang MEWARISI tgl_perolehan induknya, jadi ini persis
--     insiden 2026-08-05: terukur 11 pecahan / Rp5.369.844.028 akan tampil
--     DOBEL di 2026-S1 bersama induknya yang saat itu masih utuh.
--   * `owner_at` cuma membaca 'pengalihan_status' — mengabaikan
--     `mutasi_internal` (12 baris) DAN tidak membuang yang kena
--     `batal_pengalihan` (59 baris) → atribusi SKPD salah.
--   * `v_sembunyi` kurang `penggabungan_keluar`; `v_muncul` kurang
--     `batal_koreksi_pencatatan_ganda` & `batal_penggabungan` (ketiganya masih
--     0 baris per 2026-08-14 → laten, tapi menyala begitu fiturnya dipakai).
--   * `jenis::text = ANY(...)` — cast ke text MEMATIKAN `idx_trx_jenis_id`,
--     persis yang dilarang CLAUDE.md.
--
-- ⚠️ Daftar jenis di bawah KEMBAR dengan `lib/visibilitas.ts`,
-- `lib/pengalihan.ts`, dan `fn_rekap_bmd`. Ubah satu, ubah SEMUA. Kelalaian
-- menjaga kekembaran itulah yang membuat versi lama jadi seperti di atas.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- ATURAN DUA MODE (keputusan user 2026-08-14) — DITEGAKKAN DI DB
-- ═══════════════════════════════════════════════════════════════════════════
-- Daftar Barang TIDAK BOLEH menampilkan semua jenis aset × semua SKPD
-- sekaligus. Yang sah cuma dua:
--   (A) satu SKPD  → boleh semua jenis aset
--   (B) se-kabupaten → WAJIB pilih satu jenis aset
-- Penegaknya `RAISE EXCEPTION` di sini, bukan cuma tombol yang di-disable:
-- gerbang yang cuma ada di UI selalu bisa dilewati pemanggil berikutnya.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- KENAPA INI BISA CEPAT
-- ═══════════════════════════════════════════════════════════════════════════
-- Seluruh event visibilitas di ledger cuma 289 baris (koreksi ganda 200, batal
-- pengadaan 40, sisanya belasan) dan event perpindahan 183 baris. Jadi bagian
-- yang "pintar" itu MURAH — himpunan koreksinya kecil & di-hash.
-- Yang mahal cuma menyusuri 218rb baris `aset` lalu MENGURUTKANNYA. Dua index
-- di bawah memuat kunci urut yang sama persis dengan `ORDER BY`-nya, jadi baris
-- datang sudah terurut & `LIMIT 50` berhenti lebih awal — tak pernah menyentuh
-- 218rb-nya. Pola yang sama dgn `idx_sa2026_gol_urut` (20260812_08).

-- ── 1. INDEX ────────────────────────────────────────────────────────────────
-- `status <> 'draft'` = 418.154 dari 418.160 baris (draft cuma 6), jadi predikat
-- parsial ini praktis mencakup seluruh tabel — ia ada supaya predikatnya bisa
-- dibuktikan planner, bukan untuk memperkecil index.
--
-- ⚠️ Urutan kolomnya KEMBAR dengan `ORDER BY` di fungsi bawah DAN dengan
-- `bandingKode` di app/dashboard/daftar-barang/page.tsx (kode → nilai turun →
-- kunci unik, keputusan user 2026-07-30). Beda sedikit → node Sort muncul lagi
-- & LIMIT berhenti berguna, DIAM-DIAM.

-- Mode B: se-kabupaten, satu jenis aset.
CREATE INDEX IF NOT EXISTS idx_aset_gol_urut
  ON aset (golongan, kode, nilai_perolehan DESC, id)
  INCLUDE (skpd_id, intra_ekstra, tgl_perolehan)
  WHERE status <> 'draft';

-- Mode A: satu SKPD, semua/satu jenis aset.
CREATE INDEX IF NOT EXISTS idx_aset_skpd_urut
  ON aset (skpd_id, kode, nilai_perolehan DESC, id)
  INCLUDE (golongan, intra_ekstra, tgl_perolehan)
  WHERE status <> 'draft';

-- ── 2. FUNGSI ───────────────────────────────────────────────────────────────
-- DROP dulu: bentuk kembaliannya berubah, jadi CREATE OR REPLACE tak bisa.
-- Aman — tak ada satu pun pemanggil versi lama (sudah diperiksa 2026-08-14).
DROP FUNCTION IF EXISTS fn_daftar_barang(text, text, bigint[], text, text, integer, integer);

CREATE OR REPLACE FUNCTION fn_daftar_barang(
  p_periode   text,
  p_skpd_ids  bigint[] DEFAULT NULL,
  p_golongan  text     DEFAULT NULL,
  p_komptabel text     DEFAULT NULL,
  p_search    text     DEFAULT NULL,
  p_limit     integer  DEFAULT 50,
  p_offset    integer  DEFAULT 0
)
RETURNS TABLE (
  id uuid, nibar text, kode_register text, kode text, nama_barang text,
  spesifikasi_lainnya text, alamat_detail text, merek_tipe text,
  nilai_perolehan numeric, tgl_perolehan date, intra_ekstra text,
  asal_usul text, cara_perolehan text, penggunaan_pengamanan text,
  keterangan text, status text, skpd_id bigint, owner_skpd bigint,
  luas numeric, nomor_dokumen_kepemilikan text, tanggal_dokumen_kepemilikan date,
  nama_dokumen_kepemilikan text, jenis_hak text,
  total_count bigint, grand_total numeric
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  -- ⚠️ KEMBAR dgn SEMBUNYI_DAFTAR_BARANG di lib/visibilitas.ts — varian Daftar
  -- Barang, yaitu SEMBUNYI_PENYUSUTAN PLUS `kdp_selesai_keluar`. Perbedaan itu
  -- SENGAJA & sudah begitu sejak sebelum modul itu ada; jangan disamakan.
  v_sembunyi jenis_transaksi_bmd[] := ARRAY[
    'kapitalisasi_serap','penghapusan_pemindahtanganan','penghapusan_sebab_lain',
    'batal_pengadaan','koreksi_pencatatan_ganda','batal_hibah_masuk',
    'batal_tukar_menukar','batal_hasil_inventarisasi','batal_perolehan_lainnya',
    'pemecahan_keluar','batal_pemecahan_masuk','penggabungan_keluar',
    'kdp_selesai_keluar'
  ]::jenis_transaksi_bmd[];
  -- ⚠️ KEMBAR dgn MUNCUL di lib/visibilitas.ts.
  v_muncul jenis_transaksi_bmd[] := ARRAY[
    'batal_kapitalisasi','batal_penghapusan','batal_pemecahan',
    'batal_koreksi_pencatatan_ganda','batal_penggabungan'
  ]::jenis_transaksi_bmd[];
  -- ⚠️ KEMBAR dgn LAHIR di lib/visibilitas.ts. `penggabungan_masuk` SENGAJA
  -- TIDAK di sini: hasil gabungan ADALAH induknya sendiri, yang memang sudah
  -- ada sejak tgl perolehannya.
  v_lahir jenis_transaksi_bmd[] := ARRAY[
    'pemecahan_masuk','kdp_selesai_masuk'
  ]::jenis_transaksi_bmd[];
  -- ⚠️ KEMBAR dgn JENIS_PINDAH + JENIS_BATAL_PINDAH di lib/pengalihan.ts, DAN
  -- dgn predikat partial index `idx_trx_pindah_id` (20260729_01/07).
  v_pindah jenis_transaksi_bmd[] := ARRAY[
    'pengalihan_status','mutasi_internal'
  ]::jenis_transaksi_bmd[];

  -- Cerminan RLS `aset_select` + `aset_viewer_select`. Fungsi ini SECURITY
  -- DEFINER, jadi RLS TIDAK ikut jalan — pembatasannya wajib ditulis di sini.
  -- Viewer (`pengawas`) memang melihat semuanya, sesuai policy aset_viewer_select.
  v_lihat_semua boolean := fn_is_admin() OR fn_is_viewer();
  v_scope  bigint[];
  v_pernah uuid[];
BEGIN
  -- Gerbang dua mode (lihat kepala berkas). Ditegakkan di DB.
  IF (p_skpd_ids IS NULL OR cardinality(p_skpd_ids) = 0)
     AND (p_golongan IS NULL OR p_golongan = '') THEN
    RAISE EXCEPTION 'Daftar Barang: pilih SKPD, atau pilih jenis aset kalau ingin melihat se-kabupaten.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_lihat_semua THEN
    v_scope  := NULL;
    v_pernah := ARRAY[]::uuid[];
  ELSE
    v_scope := COALESCE(fn_my_skpd_scope(), ARRAY[]::bigint[]);
    -- Dihitung SEKALI, bukan `fn_aset_pernah_dikelola(a.id)` per baris —
    -- pemanggilan per baris itu yang dulu bikin Dashboard timeout total untuk
    -- pengurus barang (rules.md §4.1).
    v_pernah := (
      SELECT COALESCE(array_agg(DISTINCT t.aset_id), ARRAY[]::uuid[])
      FROM transaksi_bmd t
      WHERE t.jenis = 'pengalihan_status'::jenis_transaksi_bmd
        AND (t.skpd_asal = ANY(v_scope) OR t.skpd_tujuan = ANY(v_scope))
    );
  END IF;

  RETURN QUERY
  WITH
  -- ── Visibilitas: himpunan KECIL (289 baris ledger se-produksi) ───────────
  ev AS (
    SELECT t.aset_id, t.id AS trx_id, t.periode, t.jenis
    FROM transaksi_bmd t
    WHERE t.jenis = ANY(v_sembunyi || v_muncul || v_lahir)
  ),
  -- `lahirSetelah`: event kelahiran PALING AWAL sesudah periode → belum ada.
  -- `periode` berbentuk 'YYYY-S1'/'YYYY-S2' jadi urutan leksikografis = urutan
  -- kronologis, sama dgn comparePeriode di JS.
  lahir AS (
    SELECT e.aset_id FROM ev e
    WHERE e.jenis = ANY(v_lahir)
    GROUP BY e.aset_id
    HAVING min(e.periode) > p_periode
  ),
  -- `tersembunyiPada`: replay KRONOLOGIS (periode lalu id ledger), baris
  -- TERAKHIR yang menang — BUKAN dikelompokkan sembunyi-dulu-baru-muncul.
  -- Siklus hapus→batal→hapus dalam satu periode harus ikut aksi terakhir.
  sembunyi AS (
    SELECT x.aset_id FROM (
      SELECT DISTINCT ON (e.aset_id) e.aset_id, e.jenis
      FROM ev e
      WHERE e.jenis = ANY(v_sembunyi || v_muncul) AND e.periode <= p_periode
      ORDER BY e.aset_id, e.periode DESC, e.trx_id DESC
    ) x
    WHERE x.jenis = ANY(v_sembunyi)
  ),
  hidden AS (
    SELECT aset_id FROM lahir
    UNION
    SELECT aset_id FROM sembunyi
  ),
  -- ── Kepemilikan period-aware (lib/pengalihan.ts) ─────────────────────────
  pindah_raw AS (
    SELECT t.aset_id, t.id AS trx_id, t.periode, t.skpd_asal, t.skpd_tujuan,
           t.jenis, t.payload
    FROM transaksi_bmd t
    WHERE t.jenis = ANY(v_pindah || ARRAY['batal_pengalihan']::jenis_transaksi_bmd[])
  ),
  -- `buangYangDibatalkan`: baris yang id-nya disebut di payload.target_trx_ids
  -- sebuah `batal_pengalihan` dianggap TAK PERNAH TERJADI.
  dibatalkan AS (
    SELECT DISTINCT (jsonb_array_elements_text(p.payload->'target_trx_ids'))::bigint AS trx_id
    FROM pindah_raw p
    WHERE p.jenis = 'batal_pengalihan'::jenis_transaksi_bmd
      AND jsonb_typeof(p.payload->'target_trx_ids') = 'array'
  ),
  pindah AS (
    SELECT p.* FROM pindah_raw p
    WHERE p.jenis <> 'batal_pengalihan'::jenis_transaksi_bmd
      AND NOT EXISTS (SELECT 1 FROM dibatalkan d WHERE d.trx_id = p.trx_id)
  ),
  -- `ownersAt`: skpd_tujuan baris TERAKHIR ber-periode <= V; kalau belum ada
  -- satu pun, skpd_asal baris PALING AWAL (pemilik semula). Baris pengembalian
  -- (`payload.reversal`) sengaja diperlakukan sbg perpindahan biasa — asal &
  -- tujuannya memang sudah tertukar di barisnya sendiri.
  owner_at AS (
    SELECT p.aset_id,
      COALESCE(
        (array_agg(p.skpd_tujuan ORDER BY p.periode DESC, p.trx_id DESC)
           FILTER (WHERE p.periode <= p_periode))[1],
        (array_agg(p.skpd_asal ORDER BY p.periode ASC, p.trx_id ASC))[1]
      ) AS owner_skpd
    FROM pindah p
    GROUP BY p.aset_id
  ),
  visible AS (
    SELECT
      a.id, a.nibar, a.kode_register, a.kode, a.nama_barang,
      a.spesifikasi_lainnya, a.alamat_detail, a.merek_tipe,
      a.nilai_perolehan, a.tgl_perolehan, a.intra_ekstra,
      a.asal_usul, a.cara_perolehan, a.penggunaan_pengamanan,
      a.keterangan, a.status, a.skpd_id,
      COALESCE(oa.owner_skpd, a.skpd_id) AS eff_owner,
      a.luas, a.nomor_dokumen_kepemilikan, a.tanggal_dokumen_kepemilikan,
      a.nama_dokumen_kepemilikan, a.jenis_hak
    FROM aset a
    LEFT JOIN owner_at oa ON oa.aset_id = a.id
    WHERE a.status <> 'draft'
      -- `golongan` (bukan `kode LIKE`): `=` pada text itu leakproof, jadi ia
      -- boleh turun jadi index-cond. Kolomnya 100% cocok dgn kode (0 null,
      -- 0 tidak cocok dari 418.160 baris, diverifikasi 2026-08-14).
      AND (p_golongan IS NULL OR p_golongan = '' OR a.golongan = p_golongan)
      AND (p_komptabel IS NULL OR p_komptabel = '' OR a.intra_ekstra = p_komptabel)
      AND (p_search IS NULL OR p_search = ''
           OR a.nama_barang ILIKE '%' || p_search || '%'
           OR a.nibar       ILIKE '%' || p_search || '%'
           OR a.kode        ILIKE p_search || '%')
      -- Cerminan RLS aset_select / aset_viewer_select.
      AND (v_lihat_semua OR a.skpd_id = ANY(v_scope) OR a.id = ANY(v_pernah))
      -- Filter SKPD dipakai atas pemilik PADA PERIODE, bukan pemilik terkini:
      -- barang yang saat itu milik scope tapi kini sudah pindah keluar tetap
      -- ikut; yang kini di scope tapi saat itu milik SKPD lain dibuang.
      -- Ini pengganti partitionByPeriodOwner di klien.
      AND (p_skpd_ids IS NULL OR cardinality(p_skpd_ids) = 0
           OR COALESCE(oa.owner_skpd, a.skpd_id) = ANY(p_skpd_ids))
      AND NOT EXISTS (SELECT 1 FROM hidden h WHERE h.aset_id = a.id)
      -- Cadangan untuk barang TANPA event kelahiran (perolehan biasa & baseline).
      AND (a.tgl_perolehan IS NULL
           OR fn_periode_dari_tanggal(a.tgl_perolehan) <= p_periode)
  )
  SELECT
    v.id, v.nibar, v.kode_register, v.kode, v.nama_barang,
    v.spesifikasi_lainnya, v.alamat_detail, v.merek_tipe,
    v.nilai_perolehan, v.tgl_perolehan, v.intra_ekstra,
    v.asal_usul, v.cara_perolehan, v.penggunaan_pengamanan,
    v.keterangan, v.status, v.skpd_id, v.eff_owner,
    v.luas, v.nomor_dokumen_kepemilikan, v.tanggal_dokumen_kepemilikan,
    v.nama_dokumen_kepemilikan, v.jenis_hak,
    count(*) OVER()::bigint,
    COALESCE(sum(v.nilai_perolehan) OVER(), 0)
  FROM visible v
  -- ⚠️ KEMBAR dgn `bandingKode` di klien & dgn urutan kolom kedua index di atas.
  ORDER BY v.kode, v.nilai_perolehan DESC, v.id
  LIMIT p_limit OFFSET COALESCE(p_offset, 0);
END;
$function$;

REVOKE ALL ON FUNCTION fn_daftar_barang(text, bigint[], text, text, text, integer, integer) FROM public;
GRANT EXECUTE ON FUNCTION fn_daftar_barang(text, bigint[], text, text, text, integer, integer) TO authenticated;

-- ── 3. VERIFIKASI (WAJIB, dgn RLS aktif) ────────────────────────────────────
-- Sebagai service_role/superuser query yang rusak pun tetap cepat & lolos, jadi
-- EXPLAIN tanpa RLS akan bilang "beres" padahal belum.
--
--   BEGIN;
--     SET LOCAL role authenticated;
--     SET LOCAL request.jwt.claims TO '{"sub":"<uid>","role":"authenticated"}';
--     EXPLAIN (ANALYZE, BUFFERS)
--       SELECT * FROM fn_daftar_barang('2026-S1', NULL, '1.3.2', NULL, NULL, 50, 0);
--   ROLLBACK;
--
-- Yang dicari: waktu eksekusi PULUHAN milidetik, bukan detik.
--
-- ⚠️ Yang JAUH lebih penting daripada kecepatan: hasilnya harus SAMA PERSIS
-- dengan yang ditampilkan klien hari ini. Cocokkan `total_count` &
-- `grand_total` per (golongan × periode) dengan angka di layar Daftar Barang
-- SEBELUM halamannya disambungkan ke fungsi ini. Halaman Lapis 1 yang cepat
-- tapi angkanya bergeser jauh lebih mahal daripada halaman lambat.
