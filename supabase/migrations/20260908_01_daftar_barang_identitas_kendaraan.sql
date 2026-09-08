-- 20260908_01_daftar_barang_identitas_kendaraan.sql
-- `fn_daftar_barang` MENGEMBALIKAN no_polisi / no_rangka / no_mesin / no_bpkb.
--
-- ═══ KENAPA ════════════════════════════════════════════════════════════════
-- Permintaan user 2026-09-08: di **Aset Lain-Lain (1.5.4)** kolom Daftar Barang
-- harus LENGKAP — luas & dokumen kepemilikan (yang sudah ada di fungsi ini)
-- DITAMBAH identitas kendaraan. Sebabnya golongan itu memang campuran: isinya
-- barang yang direklasifikasi dari SEMUA golongan lain (Tanah, Peralatan &
-- Mesin, Gedung, Jalan/Jaringan, Aset Tetap Lainnya), jadi satu tabel 1.5.4
-- memuat sekaligus barang berluas DAN barang bernomor rangka. Aturan itu
-- sendiri sudah lama tertulis di kode — `ASET_LAIN_LAIN_EXTRA`
-- (lib/asetFields.ts) sudah menambahkan sembilan field yang sama ke form
-- Koreksi Spesifikasi sejak awal — yang belum ikut cuma TAMPILANNYA.
--
-- Diukur ke produksi (aset aktif golongan 1.5.4, 8.659 baris): no_polisi 113,
-- no_rangka 113, no_bpkb 94, no_mesin 17, luas 16, jenis_hak 13, dokumen
-- kepemilikan 33. Terisinya memang sedikit — justru itu gunanya kolomnya
-- kelihatan: selama tak pernah tampil, tak ada yang tahu mana yang masih kosong.
--
-- ═══ KENAPA HARUS MIGRASI ══════════════════════════════════════════════════
-- Layar & Export Daftar Barang tidak lagi men-`select` tabel `aset` sejak
-- paginasi pindah ke server (20260814_05..08): keduanya membaca
-- `fn_daftar_barang`. Jadi kolom yang tidak ada di RETURNS TABLE-nya MUSTAHIL
-- ditampilkan halaman, seberapa pun kodenya disunting. Empat kolom ini murni
-- TAMBAHAN — tak ada perubahan filter, urutan, visibilitas, maupun kursor.
--
-- ⚠️ DI-DROP dulu, bukan CREATE OR REPLACE: mengubah RETURNS TABLE tak bisa
-- lewat OR REPLACE ("cannot change return type of existing function"). Karena
-- di-DROP, GRANT-nya ikut hilang → di-GRANT ulang di bawah, dan
-- `SET search_path TO 'public'` WAJIB ditulis ulang di badan fungsinya
-- (CLAUDE.md: setelan `ALTER FUNCTION … SET` lenyap tiap fungsi dibuat ulang).
--
-- ⚠️ Tanda tangan argumennya TIDAK berubah (8 argumen, sama persis) — jadi tak
-- ada overload baru & PostgREST tetap mencocokkannya seperti sebelumnya.
--
-- ⚠️ Biaya: NOL secara rencana query. `idx_aset_gol_urut` memang bukan index
-- penutup untuk fungsi ini (nama_barang, keterangan, spesifikasi_lainnya, dst.
-- tak ada di dalamnya), jadi heap fetch-nya sudah terjadi sejak dulu; empat
-- kolom teks tambahan cuma ikut terbaca dari halaman yang sudah dikunjungi.
--
-- ⚠️ DEPLOY-ORDERING: migrasi ini WAJIB jalan SEBELUM deploy kode. Kalau
-- terbalik, keempat kolom baru di layar 1.5.4 tampil "-" untuk SEMUA baris —
-- dan itu terbaca operator sebagai "datanya memang kosong", bukan sebagai
-- "migrasinya belum jalan". Tidak ada error yang muncul.

DROP FUNCTION IF EXISTS fn_daftar_barang(text, bigint[], text, text, text, integer, integer, uuid);

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
  nama_dokumen_kepemilikan text, jenis_hak text,
  -- BARU 2026-09-08 — dipakai kolom Aset Lain-Lain (1.5.4). Ditaruh di EKOR
  -- daftar: klien membaca hasilnya lewat NAMA properti JSON sehingga posisinya
  -- tak mengikat, tapi menaruhnya di belakang membuat diff terhadap versi
  -- sebelumnya (20260903_01) terbaca sebagai penambahan murni.
  no_polisi text, no_rangka text, no_mesin text, no_bpkb text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_lihat_semua boolean := fn_is_admin() OR fn_is_viewer();
  v_scope bigint[]; v_pernah uuid[];
  v_akhir date := fn_akhir_periode(p_periode);
  v_ovr_all uuid[];  -- semua aset yang pemilik-pada-periodenya BEDA dari skpd_id-nya
  v_ovr_in  uuid[];  -- di antaranya, yang pemiliknya jatuh di dalam scope
  v_kode text;       -- kode & nilai baris kursor, DIBACA DI SINI (lihat 20260903_01)
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
         u.nama_dokumen_kepemilikan, u.jenis_hak,
         u.no_polisi, u.no_rangka, u.no_mesin, u.no_bpkb
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
        a.nama_dokumen_kepemilikan, a.jenis_hak,
        a.no_polisi, a.no_rangka, a.no_mesin, a.no_bpkb
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
        a.nama_dokumen_kepemilikan, a.jenis_hak,
        a.no_polisi, a.no_rangka, a.no_mesin, a.no_bpkb
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
-- (1) Isi & urutan halaman TIDAK boleh bergeser sedikit pun dari sebelum migrasi:
--       SELECT count(*) FROM fn_daftar_barang('2026-S2', NULL, '1.3.2', NULL, NULL, 50, 0);
--       -> 50
-- (2) Halaman & rekap tetap sepakat (klausa WHERE-nya kembar tiga — dua cabang
--     di sini + fn_daftar_barang_rekap yang sengaja tidak disentuh):
--       SELECT (SELECT total_count FROM fn_daftar_barang_rekap('2026-S2', NULL, '1.5.4')) AS dari_rekap,
--              (SELECT count(*) FROM fn_daftar_barang('2026-S2', NULL, '1.5.4', NULL, NULL, 1000000, 0)) AS dari_halaman;
-- (3) Kolom barunya benar-benar terisi untuk 1.5.4 (bandingkan dgn angka di
--     kepala berkas ini):
--       SELECT count(no_polisi) nopol, count(no_rangka) rangka,
--              count(no_mesin) mesin, count(no_bpkb) bpkb, count(luas) luas
--         FROM fn_daftar_barang('2026-S2', NULL, '1.5.4', NULL, NULL, 1000000, 0);
-- (4) Kursor masih menghasilkan halaman yang SAMA PERSIS dgn offset — harus 0:
--       WITH k AS (
--         SELECT id FROM fn_daftar_barang('2026-S2', NULL, '1.5.4', NULL, NULL, 1000, 0)
--          ORDER BY kode, nilai_perolehan DESC, id OFFSET 999 LIMIT 1)
--       SELECT count(*) AS harus_nol FROM (
--         SELECT id FROM fn_daftar_barang('2026-S2', NULL, '1.5.4', NULL, NULL, 1000, 1000)
--         EXCEPT ALL
--         SELECT x.id FROM k, LATERAL fn_daftar_barang('2026-S2', NULL, '1.5.4', NULL, NULL,
--                                      1000, 0, k.id) x) z;
