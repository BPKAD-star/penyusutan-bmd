-- 20260814_06_daftar_barang_pisah_rekap.sql
-- Lanjutan 20260814_05. Fungsinya SUDAH BENAR (total_count 218.251 &
-- grand_total 1.363.714.539.056,01 cocok persis dgn fn_dashboard_rekap), tapi
-- masih 9.821 ms. Dua sebab, dua obat — keduanya terukur dgn RLS aktif.
--
-- ═══ SEBAB 1: window function menahan LIMIT ════════════════════════════════
-- `count(*) OVER()` / `sum(...) OVER()` memaksa SELURUH 218.251 baris
-- dimaterialisasi & disortir sebelum baris pertama keluar — terlihat sbg
-- `temp read=12897 written=6546` (tumpah ke disk). `LIMIT 50` jadi tak pernah
-- bisa berhenti lebih awal. Tanpa window: 9.821 -> 3.592 ms.
-- OBAT: halaman & rekap DIPISAH jadi dua fungsi. Klien memanggil rekap SEKALI
-- saat filter berubah, lalu pindah halaman cuma memanggil yang murah.
--
-- ═══ SEBAB 2: `jenis = ANY(...)` menyapu seluruh ledger ════════════════════
--   CTE ev -> Seq Scan on transaksi_bmd, Rows Removed by Filter: 418.380
--   (3.545 dari 3.592 ms) demi mengambil 289 baris event visibilitas.
-- Ini RONDE KEEMPAT dari cerita yang sama (idx_trx_pindah_id 20260729_01,
-- idx_trx_reklas_id, idx_trx_penghapusan_id 20260814_03): qual `jenis` tak bisa
-- jadi index-cond, jadi kolektor yang filternya CUMA `jenis` PASTI menyapu
-- seluruh ledger. OBAT: partial index, sama seperti tiga ronde sebelumnya.
--
-- Sesudah keduanya, `Index Scan using idx_aset_gol_urut` yang sudah terbukti
-- 39 ms untuk 50 baris tinggal berdiri sendiri.

-- ── 1. PARTIAL INDEX event visibilitas ──────────────────────────────────────
-- ⚠️ Predikatnya KEMBAR dgn `ev` di fn_dbar_hidden di bawah, dan dgn
-- SEMBUNYI_DAFTAR_BARANG + MUNCUL + LAHIR di lib/visibilitas.ts. Ubah satu,
-- ubah SEMUA — kalau tidak, planner tak bisa membuktikan implikasinya dan
-- indexnya diabaikan DIAM-DIAM (halaman balik lambat tanpa satu pun error).
-- Kunci (aset_id, periode, id) melayani sekaligus pengelompokan per aset &
-- urutan replay kronologisnya.
CREATE INDEX IF NOT EXISTS idx_trx_visibilitas
  ON transaksi_bmd (aset_id, periode, id)
  WHERE jenis IN (
    'kapitalisasi_serap','penghapusan_pemindahtanganan','penghapusan_sebab_lain',
    'batal_pengadaan','koreksi_pencatatan_ganda','batal_hibah_masuk',
    'batal_tukar_menukar','batal_hasil_inventarisasi','batal_perolehan_lainnya',
    'pemecahan_keluar','batal_pemecahan_masuk','penggabungan_keluar',
    'kdp_selesai_keluar','batal_kapitalisasi','batal_penghapusan','batal_pemecahan',
    'batal_koreksi_pencatatan_ganda','batal_penggabungan',
    'pemecahan_masuk','kdp_selesai_masuk'
  );

-- ── 2. ATURAN VISIBILITAS — SATU RUMAH ──────────────────────────────────────
-- Dipisah jadi fungsi sendiri supaya halaman & rekap TIDAK menyalin aturannya.
-- Hasilnya kecil (227 baris se-produksi), jadi memanggilnya dua kali murah.
-- SECURITY DEFINER: RLS `transaksi_bmd` menyembunyikan baris ledger milik SKPD
-- lain, padahal justru baris itulah alasan sebuah barang harus disembunyikan —
-- kalau ikut RLS, guard-nya bocor. Pola yang sama dgn fn_aset_awal_2026_terkunci.
CREATE OR REPLACE FUNCTION fn_dbar_hidden(p_periode text)
RETURNS TABLE (aset_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  WITH ev AS (
    SELECT t.aset_id, t.id AS trx_id, t.periode, t.jenis
    FROM transaksi_bmd t
    WHERE t.jenis IN (
      'kapitalisasi_serap','penghapusan_pemindahtanganan','penghapusan_sebab_lain',
      'batal_pengadaan','koreksi_pencatatan_ganda','batal_hibah_masuk',
      'batal_tukar_menukar','batal_hasil_inventarisasi','batal_perolehan_lainnya',
      'pemecahan_keluar','batal_pemecahan_masuk','penggabungan_keluar',
      'kdp_selesai_keluar','batal_kapitalisasi','batal_penghapusan','batal_pemecahan',
      'batal_koreksi_pencatatan_ganda','batal_penggabungan',
      'pemecahan_masuk','kdp_selesai_masuk')
  ),
  -- `lahirSetelah`: event kelahiran PALING AWAL sesudah periode → belum ada.
  lahir AS (
    SELECT e.aset_id FROM ev e
    WHERE e.jenis IN ('pemecahan_masuk','kdp_selesai_masuk')
    GROUP BY e.aset_id
    HAVING min(e.periode) > p_periode
  ),
  -- `tersembunyiPada`: replay kronologis (periode lalu id), baris TERAKHIR
  -- menang. BUKAN dikelompokkan sembunyi-dulu-baru-muncul — siklus
  -- hapus→batal→hapus dalam satu periode harus ikut aksi terakhir.
  sembunyi AS (
    SELECT x.aset_id FROM (
      SELECT DISTINCT ON (e.aset_id) e.aset_id, e.jenis
      FROM ev e
      WHERE e.periode <= p_periode
        AND e.jenis NOT IN ('pemecahan_masuk','kdp_selesai_masuk')
      ORDER BY e.aset_id, e.periode DESC, e.trx_id DESC
    ) x
    WHERE x.jenis IN (
      'kapitalisasi_serap','penghapusan_pemindahtanganan','penghapusan_sebab_lain',
      'batal_pengadaan','koreksi_pencatatan_ganda','batal_hibah_masuk',
      'batal_tukar_menukar','batal_hasil_inventarisasi','batal_perolehan_lainnya',
      'pemecahan_keluar','batal_pemecahan_masuk','penggabungan_keluar',
      'kdp_selesai_keluar')
  )
  SELECT aset_id FROM lahir
  UNION
  SELECT aset_id FROM sembunyi
$$;

-- Kepemilikan period-aware (lib/pengalihan.ts). Kecil (≤150 baris).
CREATE OR REPLACE FUNCTION fn_dbar_owner(p_periode text)
RETURNS TABLE (aset_id uuid, owner_skpd bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  WITH pindah_raw AS (
    SELECT t.aset_id, t.id AS trx_id, t.periode, t.skpd_asal, t.skpd_tujuan,
           t.jenis, t.payload
    FROM transaksi_bmd t
    WHERE t.jenis IN ('pengalihan_status','mutasi_internal','batal_pengalihan')
  ),
  -- `buangYangDibatalkan`: baris yang id-nya disebut payload.target_trx_ids
  -- sebuah `batal_pengalihan` dianggap TAK PERNAH TERJADI.
  dibatalkan AS (
    SELECT DISTINCT (jsonb_array_elements_text(p.payload->'target_trx_ids'))::bigint AS trx_id
    FROM pindah_raw p
    WHERE p.jenis = 'batal_pengalihan'
      AND jsonb_typeof(p.payload->'target_trx_ids') = 'array'
  ),
  pindah AS (
    SELECT p.* FROM pindah_raw p
    WHERE p.jenis <> 'batal_pengalihan'
      AND NOT EXISTS (SELECT 1 FROM dibatalkan d WHERE d.trx_id = p.trx_id)
  )
  -- `ownersAt`: skpd_tujuan baris TERAKHIR ber-periode <= V; kalau belum ada,
  -- skpd_asal baris PALING AWAL. Baris pengembalian (`payload.reversal`)
  -- sengaja diperlakukan sbg perpindahan biasa — asal & tujuannya memang sudah
  -- tertukar di barisnya sendiri.
  SELECT p.aset_id,
    COALESCE(
      (array_agg(p.skpd_tujuan ORDER BY p.periode DESC, p.trx_id DESC)
         FILTER (WHERE p.periode <= p_periode))[1],
      (array_agg(p.skpd_asal ORDER BY p.periode ASC, p.trx_id ASC))[1]
    )
  FROM pindah p
  GROUP BY p.aset_id
$$;

REVOKE ALL ON FUNCTION fn_dbar_hidden(text) FROM public;
REVOKE ALL ON FUNCTION fn_dbar_owner(text)  FROM public;
GRANT EXECUTE ON FUNCTION fn_dbar_hidden(text) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_dbar_owner(text)  TO authenticated;

-- ── 2b. GERBANG DUA MODE & CAKUPAN — juga satu rumah ────────────────────────
-- Aturan user 2026-08-14: Daftar Barang TIDAK BOLEH menampilkan semua jenis
-- aset x semua SKPD sekaligus. Yang sah cuma dua:
--   (A) satu SKPD      -> boleh semua jenis aset
--   (B) se-kabupaten   -> WAJIB pilih satu jenis aset
-- Penegaknya di DB, bukan cuma tombol yang di-disable: gerbang yang cuma ada di
-- UI selalu bisa dilewati pemanggil berikutnya.
CREATE OR REPLACE FUNCTION fn_dbar_guard(p_skpd_ids bigint[], p_golongan text)
RETURNS void
LANGUAGE plpgsql IMMUTABLE
AS $$
BEGIN
  IF (p_skpd_ids IS NULL OR cardinality(p_skpd_ids) = 0)
     AND (p_golongan IS NULL OR p_golongan = '') THEN
    RAISE EXCEPTION 'Daftar Barang: pilih SKPD, atau pilih jenis aset kalau ingin melihat se-kabupaten.'
      USING ERRCODE = 'check_violation';
  END IF;
END;
$$;

-- Cerminan RLS `aset_select` + `aset_viewer_select`. Fungsi pemanggil SECURITY
-- DEFINER, jadi RLS TIDAK ikut jalan — pembatasannya wajib ditulis ulang, dan
-- ditulis SEKALI di sini supaya halaman & rekap tak bisa menyimpang.
-- `pernah` dihitung SEKALI, bukan `fn_aset_pernah_dikelola(a.id)` per baris —
-- pemanggilan per baris itu yang dulu bikin Dashboard timeout total untuk
-- pengurus barang (rules.md §4.1).
CREATE OR REPLACE FUNCTION fn_dbar_scope(p_lihat_semua boolean)
RETURNS TABLE (scope bigint[], pernah uuid[])
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT
    CASE WHEN p_lihat_semua THEN NULL
         ELSE COALESCE(fn_my_skpd_scope(), ARRAY[]::bigint[]) END,
    CASE WHEN p_lihat_semua THEN ARRAY[]::uuid[] ELSE (
      SELECT COALESCE(array_agg(DISTINCT t.aset_id), ARRAY[]::uuid[])
      FROM transaksi_bmd t
      WHERE t.jenis = 'pengalihan_status'
        AND (t.skpd_asal = ANY(COALESCE(fn_my_skpd_scope(), ARRAY[]::bigint[]))
          OR t.skpd_tujuan = ANY(COALESCE(fn_my_skpd_scope(), ARRAY[]::bigint[])))
    ) END
$$;

REVOKE ALL ON FUNCTION fn_dbar_guard(bigint[], text) FROM public;
REVOKE ALL ON FUNCTION fn_dbar_scope(boolean) FROM public;
GRANT EXECUTE ON FUNCTION fn_dbar_guard(bigint[], text) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_dbar_scope(boolean) TO authenticated;

-- ── 3. HALAMAN (tanpa window function) ──────────────────────────────────────
DROP FUNCTION IF EXISTS fn_daftar_barang(text, bigint[], text, text, text, integer, integer);

CREATE OR REPLACE FUNCTION fn_daftar_barang(
  p_periode text, p_skpd_ids bigint[] DEFAULT NULL, p_golongan text DEFAULT NULL,
  p_komptabel text DEFAULT NULL, p_search text DEFAULT NULL,
  p_limit integer DEFAULT 50, p_offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid, nibar text, kode_register text, kode text, nama_barang text,
  spesifikasi_lainnya text, alamat_detail text, merek_tipe text,
  nilai_perolehan numeric, tgl_perolehan date, intra_ekstra text,
  asal_usul text, cara_perolehan text, penggunaan_pengamanan text,
  keterangan text, status text, skpd_id bigint, owner_skpd bigint,
  luas numeric, nomor_dokumen_kepemilikan text, tanggal_dokumen_kepemilikan date,
  nama_dokumen_kepemilikan text, jenis_hak text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_lihat_semua boolean := fn_is_admin() OR fn_is_viewer();
  v_scope bigint[]; v_pernah uuid[];
BEGIN
  PERFORM fn_dbar_guard(p_skpd_ids, p_golongan);
  SELECT s.scope, s.pernah INTO v_scope, v_pernah FROM fn_dbar_scope(v_lihat_semua) s;

  RETURN QUERY
  WITH hidden AS MATERIALIZED (SELECT h.aset_id FROM fn_dbar_hidden(p_periode) h),
       ownr   AS MATERIALIZED (SELECT o.aset_id, o.owner_skpd FROM fn_dbar_owner(p_periode) o)
  SELECT
    a.id, a.nibar, a.kode_register, a.kode, a.nama_barang,
    a.spesifikasi_lainnya, a.alamat_detail, a.merek_tipe,
    a.nilai_perolehan, a.tgl_perolehan, a.intra_ekstra,
    a.asal_usul, a.cara_perolehan, a.penggunaan_pengamanan,
    a.keterangan, a.status, a.skpd_id,
    COALESCE(o.owner_skpd, a.skpd_id),
    a.luas, a.nomor_dokumen_kepemilikan, a.tanggal_dokumen_kepemilikan,
    a.nama_dokumen_kepemilikan, a.jenis_hak
  FROM aset a
  LEFT JOIN ownr o ON o.aset_id = a.id
  WHERE a.status <> 'draft'
    AND (p_golongan IS NULL OR p_golongan = '' OR a.golongan = p_golongan)
    AND (p_komptabel IS NULL OR p_komptabel = '' OR a.intra_ekstra = p_komptabel)
    AND (p_search IS NULL OR p_search = ''
         OR a.nama_barang ILIKE '%' || p_search || '%'
         OR a.nibar       ILIKE '%' || p_search || '%'
         OR a.kode        ILIKE p_search || '%')
    AND (v_lihat_semua OR a.skpd_id = ANY(v_scope) OR a.id = ANY(v_pernah))
    AND (p_skpd_ids IS NULL OR cardinality(p_skpd_ids) = 0
         OR COALESCE(o.owner_skpd, a.skpd_id) = ANY(p_skpd_ids))
    AND NOT EXISTS (SELECT 1 FROM hidden h WHERE h.aset_id = a.id)
    AND (a.tgl_perolehan IS NULL
         OR fn_periode_dari_tanggal(a.tgl_perolehan) <= p_periode)
  -- ⚠️ KEMBAR dgn `bandingKode` di klien & dgn urutan kolom idx_aset_gol_urut /
  -- idx_aset_skpd_urut (20260814_05). Beda sedikit → node Sort muncul lagi &
  -- LIMIT berhenti berguna, DIAM-DIAM.
  ORDER BY a.kode, a.nilai_perolehan DESC, a.id
  LIMIT p_limit OFFSET COALESCE(p_offset, 0);
END;
$function$;

-- ── 4. REKAP (dipanggil SEKALI per perubahan filter) ────────────────────────
-- ⚠️⚠️ KLAUSA `WHERE`-nya WAJIB SAMA PERSIS dgn fn_daftar_barang di atas.
-- Kalau menyimpang, jumlah di kaki tabel tak lagi cocok dgn isi halamannya —
-- dan tak ada yang error. Setiap kali menyunting salah satunya, sunting
-- dua-duanya, lalu jalankan pemeriksaan silang di kaki berkas ini.
CREATE OR REPLACE FUNCTION fn_daftar_barang_rekap(
  p_periode text, p_skpd_ids bigint[] DEFAULT NULL, p_golongan text DEFAULT NULL,
  p_komptabel text DEFAULT NULL, p_search text DEFAULT NULL
)
RETURNS TABLE (total_count bigint, grand_total numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_lihat_semua boolean := fn_is_admin() OR fn_is_viewer();
  v_scope bigint[]; v_pernah uuid[];
BEGIN
  PERFORM fn_dbar_guard(p_skpd_ids, p_golongan);
  SELECT s.scope, s.pernah INTO v_scope, v_pernah FROM fn_dbar_scope(v_lihat_semua) s;

  RETURN QUERY
  WITH hidden AS MATERIALIZED (SELECT h.aset_id FROM fn_dbar_hidden(p_periode) h),
       ownr   AS MATERIALIZED (SELECT o.aset_id, o.owner_skpd FROM fn_dbar_owner(p_periode) o)
  SELECT count(*)::bigint, COALESCE(sum(a.nilai_perolehan), 0)
  FROM aset a
  LEFT JOIN ownr o ON o.aset_id = a.id
  WHERE a.status <> 'draft'
    AND (p_golongan IS NULL OR p_golongan = '' OR a.golongan = p_golongan)
    AND (p_komptabel IS NULL OR p_komptabel = '' OR a.intra_ekstra = p_komptabel)
    AND (p_search IS NULL OR p_search = ''
         OR a.nama_barang ILIKE '%' || p_search || '%'
         OR a.nibar       ILIKE '%' || p_search || '%'
         OR a.kode        ILIKE p_search || '%')
    AND (v_lihat_semua OR a.skpd_id = ANY(v_scope) OR a.id = ANY(v_pernah))
    AND (p_skpd_ids IS NULL OR cardinality(p_skpd_ids) = 0
         OR COALESCE(o.owner_skpd, a.skpd_id) = ANY(p_skpd_ids))
    AND NOT EXISTS (SELECT 1 FROM hidden h WHERE h.aset_id = a.id)
    AND (a.tgl_perolehan IS NULL
         OR fn_periode_dari_tanggal(a.tgl_perolehan) <= p_periode);
END;
$function$;

REVOKE ALL ON FUNCTION fn_daftar_barang(text, bigint[], text, text, text, integer, integer) FROM public;
REVOKE ALL ON FUNCTION fn_daftar_barang_rekap(text, bigint[], text, text, text) FROM public;
GRANT EXECUTE ON FUNCTION fn_daftar_barang(text, bigint[], text, text, text, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_daftar_barang_rekap(text, bigint[], text, text, text) TO authenticated;

-- ── PEMERIKSAAN SILANG (jalankan tiap kali salah satu fungsi disunting) ─────
-- Jumlah baris halaman-demi-halaman HARUS sama dgn total_count dari rekap:
--
--   SELECT (SELECT total_count FROM fn_daftar_barang_rekap('2026-S1', NULL, '1.3.2'))
--          AS dari_rekap,
--          (SELECT count(*) FROM fn_daftar_barang('2026-S1', NULL, '1.3.2', NULL, NULL,
--                                                 1000000, 0)) AS dari_halaman;
--
-- Dua angka itu berbeda = klausa WHERE kedua fungsi sudah menyimpang.
