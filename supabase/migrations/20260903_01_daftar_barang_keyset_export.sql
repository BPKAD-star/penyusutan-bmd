-- 20260903_01_daftar_barang_keyset_export.sql
-- PERBAIKAN: Export Daftar Barang GAGAL TOTAL untuk golongan besar.
--
-- ═══ SEBAB ═════════════════════════════════════════════════════════════════
-- `fn_daftar_barang` cuma bisa dipaginasi lewat LIMIT/OFFSET, dan Export
-- memanggilnya 219 kali dengan offset yang makin dalam (0, 1000, 2000, ...).
-- OFFSET bukan "loncat" — Postgres tetap MERAKIT tiap baris yang dilewati
-- (heap fetch 23 kolom + LEFT JOIN pemilik + anti-join `hidden`) lalu
-- membuangnya. Diukur sebagai admin, RLS aktif, 1.3.2 se-kabupaten, 2026-S2:
--
--     offset       0 ->  1.067 ms
--     offset  50.000 -> 51.221 ms   <- pagu statement_timeout cuma 8 dtk
--     offset 120.000 -> 20.009 ms
--     offset 210.000 ->  5.608 ms
--
-- Jadi export golongan besar SELALU mati di sekitar halaman ke-20 dengan
-- "canceling statement due to statement timeout" (57014). Ini pola yang sudah
-- lama tertulis di CLAUDE.md — ".range()/OFFSET, makin dalam makin lambat" —
-- cuma di sini ongkos tiap baris yang dilewati jauh lebih mahal daripada di
-- query tabel biasa, karena tiap baris melewati dua join.
--
-- Menarik semuanya sekali jalan juga tidak bisa: `p_limit => 1000000,
-- p_offset => 0` untuk 1.3.2 = 26.798 ms, tetap 3x di atas pagu.
--
-- ═══ OBAT: KURSOR (KEYSET), BUKAN OFFSET ═══════════════════════════════════
-- Parameter baru `p_after_id` = `aset.id` baris TERAKHIR halaman sebelumnya.
-- Halaman berikutnya = baris yang urutannya SESUDAH baris itu, jadi tak ada
-- satu pun baris yang dirakit lalu dibuang.
--
-- ⚠️ Kursornya SATU kolom (id), dan `kode`/`nilai_perolehan`-nya DILIHAT SENDIRI
-- oleh fungsi ini — sengaja BUKAN dikirim klien. Alasannya bukan kerapian:
-- `nilai_perolehan` itu `numeric`, sedangkan angka JSON di peramban itu float64.
-- Ada 1 baris di produksi (Jalan JAMBEAN - PURWODADI, 1.3.4) bernilai
-- 1427689804.3600001 yang berubah jadi 1427689804.36 begitu lewat JavaScript.
-- Kalau angka itu yang dikirim balik sebagai kursor, baris ber-nilai
-- 1427689804.36 yang sah akan TERLEWAT dari berkas Excel — tanpa satu pun
-- error. Dengan kursor berupa id, angkanya tak pernah meninggalkan Postgres.
--
-- ⚠️ Kursor yang tak ketemu → RAISE, bukan diam-diam mulai dari awal. Kalau
-- dibiarkan, export akan mengulang dari baris pertama & berkasnya berisi ribuan
-- baris DOBEL yang kelihatan sah.
--
-- ⚠️ Kenapa DUA CABANG (UNION ALL), bukan satu WHERE ber-OR:
-- urutannya `kode ASC, nilai_perolehan DESC, id ASC` — ARAHNYA CAMPUR, jadi
-- perbandingan baris `(kode,nilai,id) > (...)` tak bisa dipakai DAN bentuk OR
-- biasa tak bisa turun jadi index condition. Yang terjadi kalau dipaksa
-- (dua-duanya benar-benar diukur, bukan dugaan):
--   * OR polos             -> Index Cond cuma `golongan=...`, dan
--                             "Rows Removed by Filter: 103.035" TIAP halaman;
--   * OR + seek `kode>=K`  -> planner memilih BitmapOr + Bitmap Heap Scan +
--                             top-N sort 68.261 baris = 3.549 ms, dan rencana
--                             semacam itu bisa berbalik kapan saja begitu
--                             statistik bergeser.
-- Dipecah dua, masing-masing punya SATU seek yang tak bisa salah baca:
--   cabang 1 — sisa baris pada kode kursor : golongan=g AND kode=K
--              AND nilai_perolehan <= N      (prefix idx_aset_gol_urut)
--   cabang 2 — kode berikutnya              : golongan=g AND kode > K
-- Semua baris kode K yang tersisa pasti mendahului semua baris kode > K, jadi
-- menggabung keduanya lalu mengambil LIMIT p_limit teratas memberi halaman yang
-- PERSIS SAMA dengan versi offset.
--
-- ⚠️ Sisa yang dibuang cabang 1 dibatasi banyaknya baris ber-(kode, nilai)
-- KEMBAR. Diukur di produksi: terbesar 5.481 baris, dan cuma 11 grup yang di
-- atas 1.000 — jadi ongkos per halaman benar-benar rata. Bandingkan KODE
-- terbesar yang 112.421 baris (1.3.5.01.01.01.003): itulah alasan seek
-- `kode >= K` saja TIDAK cukup, dan kenapa cabang 1 wajib ada.
--
-- ⚠️ KLAUSA WHERE-nya sekarang KEMBAR TIGA (dua cabang di sini + fungsi
-- `fn_daftar_barang_rekap` yang sengaja tidak disentuh migrasi ini). Kalau
-- salah satu disunting sendirian, isi halaman berhenti cocok dgn jumlah di kaki
-- tabel ATAU export berhenti cocok dgn layar — dua-duanya TANPA satu pun error.
-- Pemeriksaan silangnya ada di kaki berkas ini; jalankan tiap kali menyentuh
-- salah satu dari ketiganya.
--
-- ═══ HASIL PENGUKURAN (admin, RLS aktif, 2026-S2, halaman 1.000 baris) ═════
--   1.3.2 se-kabupaten  218.257 baris  220 halaman  terburuk   428 ms  total 11,3 dtk
--   Diknas 1.3.2 intra  132.694 baris  133 halaman  terburuk 1.105 ms  total  8,0 dtk
--   1.3.5 se-kabupaten  173.262 baris  174 halaman  terburuk 3.382 ms  (memuat
--                       kode 112.421 baris; 3,4 dtk itu halaman pertama, cache dingin)
-- Dicocokkan KOLOM-PER-KOLOM (md5 seluruh baris) dengan jalur offset lama —
-- 1.3.1 / 1.3.3 / 1.3.4 / 1.3.5 / 1.3.6 / 1.3.2, dengan & tanpa filter SKPD,
-- komptabel, pencarian, ukuran halaman 7 s.d. 1.000, sebagai admin MAUPUN
-- sebagai pengurus barang Dinas Pendidikan: jumlah SAMA, isi SAMA, URUTAN SAMA,
-- 0 baris beda.
--
-- ⚠️ Fungsinya DI-DROP dulu, bukan CREATE OR REPLACE: menambah parameter
-- membuat OVERLOAD baru, dan PostgREST yang memanggil pakai argumen bernama
-- akan menolak dgn "function is not unique" (pelajaran fn_rkbmd_standar_simpan).
--
-- ⚠️ DEPLOY-ORDERING: migrasi ini WAJIB jalan SEBELUM deploy kode. Parameter
-- barunya ber-DEFAULT NULL, jadi kode LAMA yang masih memanggil dengan 7
-- argumen tetap jalan persis seperti sebelumnya selama jendela di antaranya.
-- Kalau urutannya dibalik, layar & Export Daftar Barang sama-sama mati
-- ("Could not find the function ... in the schema cache") sampai migrasi jalan.

DROP FUNCTION IF EXISTS fn_daftar_barang(text, bigint[], text, text, text, integer, integer);

CREATE FUNCTION fn_daftar_barang(
  p_periode text, p_skpd_ids bigint[] DEFAULT NULL, p_golongan text DEFAULT NULL,
  p_komptabel text DEFAULT NULL, p_search text DEFAULT NULL,
  p_limit integer DEFAULT 50, p_offset integer DEFAULT 0,
  -- Kursor keyset: id baris TERAKHIR halaman sebelumnya. NULL = mulai dari awal
  -- (perilaku lama, dipakai layar yang memang melompat ke halaman ke-N).
  p_after_id uuid DEFAULT NULL
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
  v_akhir date := fn_akhir_periode(p_periode);
  v_ovr_all uuid[];  -- semua aset yang pemilik-pada-periodenya BEDA dari skpd_id-nya
  v_ovr_in  uuid[];  -- di antaranya, yang pemiliknya jatuh di dalam scope
  v_kode text;       -- kode & nilai baris kursor, DIBACA DI SINI (lihat catatan atas)
  v_nilai numeric;
BEGIN
  PERFORM fn_dbar_guard(p_skpd_ids, p_golongan);
  SELECT s.scope, s.pernah INTO v_scope, v_pernah FROM fn_dbar_scope(v_lihat_semua) s;

  SELECT COALESCE(array_agg(o.aset_id), ARRAY[]::uuid[]),
         COALESCE(array_agg(o.aset_id) FILTER (WHERE o.owner_skpd = ANY(p_skpd_ids)), ARRAY[]::uuid[])
    INTO v_ovr_all, v_ovr_in
    FROM fn_dbar_owner(p_periode) o;

  IF p_after_id IS NOT NULL THEN
    SELECT a.kode, a.nilai_perolehan INTO v_kode, v_nilai FROM aset a WHERE a.id = p_after_id;
    IF v_kode IS NULL THEN
      -- Gagal KERAS. Kursor hilang lalu diperlakukan sbg "mulai dari awal" akan
      -- membuat export mengulang dari baris pertama & berkas Excel-nya berisi
      -- ribuan baris dobel yang kelihatan sah.
      RAISE EXCEPTION 'kursor daftar barang tidak dikenal: aset % tidak ada', p_after_id;
    END IF;
  END IF;

  RETURN QUERY
  WITH hidden AS MATERIALIZED (SELECT h.aset_id FROM fn_dbar_hidden(p_periode) h),
       ownr   AS MATERIALIZED (SELECT o.aset_id, o.owner_skpd FROM fn_dbar_owner(p_periode) o)
  SELECT u.id, u.nibar, u.kode_register, u.kode, u.nama_barang,
         u.spesifikasi_lainnya, u.alamat_detail, u.merek_tipe,
         u.nilai_perolehan, u.tgl_perolehan, u.intra_ekstra,
         u.asal_usul, u.cara_perolehan, u.penggunaan_pengamanan,
         u.keterangan, u.status, u.skpd_id, u.owner_skpd,
         u.luas, u.nomor_dokumen_kepemilikan, u.tanggal_dokumen_kepemilikan,
         u.nama_dokumen_kepemilikan, u.jenis_hak
  FROM (
    -- ── CABANG 1: sisa baris pada KODE KURSOR ───────────────────────────────
    -- `kode = K AND nilai_perolehan <= N` itu prefix idx_aset_gol_urut, jadi
    -- index LANGSUNG MELOMPAT ke posisi kursor. Tanpa kursor cabang ini kosong
    -- seketika (`kode = NULL` tak pernah benar) & tak memakan biaya apa pun.
    ( SELECT
        a.id, a.nibar, a.kode_register, a.kode, a.nama_barang,
        a.spesifikasi_lainnya, a.alamat_detail, a.merek_tipe,
        a.nilai_perolehan, a.tgl_perolehan, a.intra_ekstra,
        a.asal_usul, a.cara_perolehan, a.penggunaan_pengamanan,
        a.keterangan, a.status, a.skpd_id,
        COALESCE(o.owner_skpd, a.skpd_id) AS owner_skpd,
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
             OR (a.skpd_id = ANY(p_skpd_ids) AND NOT (a.id = ANY(v_ovr_all)))
             OR a.id = ANY(v_ovr_in))
        AND NOT EXISTS (SELECT 1 FROM hidden h WHERE h.aset_id = a.id)
        AND (a.tgl_perolehan IS NULL OR a.tgl_perolehan <= v_akhir)
        AND a.kode = v_kode
        AND a.nilai_perolehan <= v_nilai
        AND (a.nilai_perolehan < v_nilai OR a.id > p_after_id)
      ORDER BY a.nilai_perolehan DESC, a.id
      LIMIT p_limit )
    UNION ALL
    -- ── CABANG 2: KODE BERIKUTNYA (tanpa kursor = seluruh hasil) ────────────
    ( SELECT
        a.id, a.nibar, a.kode_register, a.kode, a.nama_barang,
        a.spesifikasi_lainnya, a.alamat_detail, a.merek_tipe,
        a.nilai_perolehan, a.tgl_perolehan, a.intra_ekstra,
        a.asal_usul, a.cara_perolehan, a.penggunaan_pengamanan,
        a.keterangan, a.status, a.skpd_id,
        COALESCE(o.owner_skpd, a.skpd_id) AS owner_skpd,
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
             OR (a.skpd_id = ANY(p_skpd_ids) AND NOT (a.id = ANY(v_ovr_all)))
             OR a.id = ANY(v_ovr_in))
        AND NOT EXISTS (SELECT 1 FROM hidden h WHERE h.aset_id = a.id)
        AND (a.tgl_perolehan IS NULL OR a.tgl_perolehan <= v_akhir)
        AND (p_after_id IS NULL OR a.kode > v_kode)
      ORDER BY a.kode, a.nilai_perolehan DESC, a.id
      -- ⚠️ OFFSET hanya sah kalau TIDAK ada kursor. Layar (lompat ke halaman N)
      -- tetap memakainya; Export memakai kursor dan SELALU p_offset = 0.
      -- Tanpa CASE ini, memakai kursor & offset bersamaan diam-diam melewatkan
      -- baris — tepat jenis kesalahan yang paling mahal di modul ini.
      LIMIT p_limit OFFSET CASE WHEN p_after_id IS NULL THEN COALESCE(p_offset, 0) ELSE 0 END )
  ) u
  ORDER BY u.kode, u.nilai_perolehan DESC, u.id
  LIMIT p_limit;
END;
$function$;

GRANT EXECUTE ON FUNCTION fn_daftar_barang(text, bigint[], text, text, text, integer, integer, uuid)
  TO anon, authenticated, service_role;

-- ── PEMERIKSAAN SILANG (wajib dijalankan sesudah migrasi ini) ───────────────
-- (1) Jalur LAMA (layar) tidak boleh bergeser sedikit pun:
--       SELECT count(*) FROM fn_daftar_barang('2026-S2', NULL, '1.3.2', NULL, NULL, 50, 0);
--       -> 50, isinya sama dgn sebelum migrasi.
-- (2) Halaman & rekap tetap sepakat:
--       SELECT (SELECT total_count FROM fn_daftar_barang_rekap('2026-S2', NULL, '1.3.3')) AS dari_rekap,
--              (SELECT count(*) FROM fn_daftar_barang('2026-S2', NULL, '1.3.3', NULL, NULL, 1000000, 0)) AS dari_halaman;
-- (3) Kursor menghasilkan halaman yang SAMA PERSIS dgn offset. Ini yang paling
--     penting: kalau meleset, berkas Excel-nya kurang/lebih baris TANPA satu pun
--     error. Contoh untuk halaman kedua golongan 1.3.3 — harus 0:
--       WITH k AS (
--         SELECT id FROM fn_daftar_barang('2026-S2', NULL, '1.3.3', NULL, NULL, 1000, 0)
--          ORDER BY kode, nilai_perolehan DESC, id OFFSET 999 LIMIT 1)
--       SELECT count(*) AS harus_nol FROM (
--         SELECT id FROM fn_daftar_barang('2026-S2', NULL, '1.3.3', NULL, NULL, 1000, 1000)
--         EXCEPT ALL
--         SELECT x.id FROM k, LATERAL fn_daftar_barang('2026-S2', NULL, '1.3.3', NULL, NULL,
--                                      1000, 0, k.id) x) z;
-- (4) Kursor yang tidak ada harus DITOLAK, bukan diam-diam mulai dari awal:
--       SELECT * FROM fn_daftar_barang('2026-S2', NULL, '1.3.3', NULL, NULL, 10, 0,
--                                      '00000000-0000-0000-0000-000000000000');
--       -> ERROR: kursor daftar barang tidak dikenal
