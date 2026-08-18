-- Fase 4 — pindahkan pembacaan halaman PENYUSUTAN ke server.
-- Meneruskan pola yang sudah terbukti di Daftar Barang (migrasi 20260814_05..08).
--
-- ── UKURAN SEBELUM (Dinas Pendidikan, 1.3.2, intra, 2026-S1) ────────────────
-- 707 unit · 132.694 aset yang lolos filter. Satu kali "Tampilkan" menembakkan
-- ±1.466 permintaan PostgREST: fetchAllBase 133 (batch 1.000) + fetchPeny 664
-- (batch 200) + fetchHiddenIds 664 (batch 200) + kap/uraian ±5 — dan SELURUH
-- 132.694 baris menyeberang ke browser untuk disortir & disaring di sana.
-- Bandingkan Daftar Barang sebelum diperbaiki: 219 permintaan.
--
-- ⚠️ JANGAN pakai `fn_daftar_barang` untuk Penyusutan. Ia BASI & menyimpang dari
-- lib/visibilitas.ts (tak punya `LAHIR`, `owner_at`-nya abai `mutasi_internal`).
-- Yang dipakai di sini justru fungsi-fungsi HASIL migrasi 20260814_05..08
-- (`fn_dbar_hidden`/`fn_dbar_owner`/`fn_dbar_scope`) yang memang sudah kembar
-- dengan modul TS-nya.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. fn_dbar_hidden — kini BER-VARIAN
-- ═══════════════════════════════════════════════════════════════════════════
-- Daftar Barang & Penyusutan SENGAJA beda satu jenis: `kdp_selesai_keluar` HANYA
-- menyembunyikan di Daftar Barang. Aset KDP yang sudah di-carve-out jadi aset
-- tetap tak lagi didaftar di register, tapi penyusutannya masih harus terbaca.
-- Perbedaan itu sudah ada sejak sebelum lib/visibilitas.ts lahir (lihat
-- SEMBUNYI_PENYUSUTAN vs SEMBUNYI_DAFTAR_BARANG) — jangan disamakan.
--
-- ⚠️ Menyambungkan Penyusutan ke varian Daftar Barang apa adanya akan
-- MENYEMBUNYIKAN aset KDP yang seharusnya masih tampil, TANPA satu pun error.
-- Per 2026-08-18 `kdp_selesai_keluar` = 0 baris, jadi hari ini bedanya laten —
-- itu justru alasan parameter ini dipasang SEKARANG, sebelum carve-out KDP
-- dipakai dan bedanya jadi selisih angka yang tak bersuara.
--
-- ⚠️ DROP dulu, bukan CREATE OR REPLACE: menambah parameter ber-DEFAULT tanpa
-- membuang versi 1-argumen membuat pemanggilan lama ambigu ("function is not
-- unique") — pelajaran dari `fn_rkbmd_standar_simpan` (migrasi 20260813_03).
-- Badan `fn_daftar_barang` berupa string, jadi Postgres tak menahan DROP ini dan
-- panggilan 1-argumennya otomatis mendarat di versi baru lewat DEFAULT.
DROP FUNCTION IF EXISTS fn_dbar_hidden(text);

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
  v_lahir jenis_transaksi_bmd[] := ARRAY[
    'pemecahan_masuk','kdp_selesai_masuk'
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

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. fn_penyusutan — satu halaman baris, sudah tersaring & terurut di server
-- ═══════════════════════════════════════════════════════════════════════════
-- Bentuknya SENGAJA meniru `fn_daftar_barang` baris per baris, termasuk dua
-- jebakan yang di sana sudah memakan korban:
--   (1) filter SKPD TIDAK ditulis di atas `COALESCE(owner_skpd, skpd_id)` —
--       nilai itu baru ada sesudah join, indexnya tak terpakai, dan satu-SKPD
--       langsung timeout. Dipecah dua: `skpd_id ∈ scope AND bukan override`
--       (lewat index) OR `id ∈ daftar override dalam scope` (kecil).
--   (2) TANPA window function (`count(*) OVER()`) — ia memaksa materialisasi
--       seluruh baris & membuat LIMIT berhenti berguna. Hitungannya dipisah ke
--       `fn_penyusutan_rekap`, dipanggil sekali per perubahan filter.
--
-- LEFT JOIN ke `penyusutan_semester`: aset yang BELUM dihitung engine tetap
-- tampil dengan kolom angka NULL — sama dengan perilaku klien sekarang (`p?`
-- opsional). Mengubahnya jadi INNER JOIN akan menghilangkan barang dari daftar
-- hanya karena engine belum dijalankan.
--
-- SENGAJA TANPA `fn_dbar_guard`: aturan dua mode (satu SKPD ATAU satu jenis
-- aset) ditetapkan user 2026-08-14 untuk DAFTAR BARANG. Memberlakukannya ke
-- Penyusutan diam-diam berarti mengubah aturan pakai tanpa diminta. Paginasi di
-- server sudah membuat se-kabupaten × semua jenis tak lagi berbahaya untuk
-- halaman barisnya; yang mahal tinggal rekapnya.
CREATE OR REPLACE FUNCTION fn_penyusutan(
  p_periode   text,
  p_skpd_ids  bigint[] DEFAULT NULL,
  p_golongan  text     DEFAULT NULL,
  p_komptabel text     DEFAULT NULL,
  p_search    text     DEFAULT NULL,
  p_limit     integer  DEFAULT 100,
  p_offset    integer  DEFAULT 0
)
RETURNS TABLE(
  id uuid, nibar text, kode_register text, kode_barang text, nama_barang text,
  skpd_id bigint, owner_skpd bigint,
  nilai_perolehan numeric, intra_ekstra text, tgl_perolehan date,
  merek_tipe text, alamat_detail text,
  -- Angka engine (NULL = belum dihitung engine untuk periode ini).
  p_nilai_perolehan numeric, p_beban numeric, p_akumulasi numeric,
  -- ⚠️ `masa_manfaat_tahun` NUMERIC (bukan integer) & `sisa_semester` INTEGER —
  -- diverifikasi ke information_schema 2026-08-18. Salah tipe di sini tidak
  -- ketahuan saat CREATE, hanya saat RPC-nya dipanggil.
  p_nilai_buku_akhir numeric, p_sisa_semester integer, p_masa_manfaat_tahun numeric
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_lihat_semua boolean := fn_is_admin() OR fn_is_viewer();
  v_scope bigint[]; v_pernah uuid[];
  v_akhir date := fn_akhir_periode(p_periode);
  v_ovr_all uuid[];
  v_ovr_in  uuid[];
BEGIN
  SELECT s.scope, s.pernah INTO v_scope, v_pernah FROM fn_dbar_scope(v_lihat_semua) s;

  SELECT COALESCE(array_agg(o.aset_id), ARRAY[]::uuid[]),
         COALESCE(array_agg(o.aset_id) FILTER (WHERE o.owner_skpd = ANY(p_skpd_ids)), ARRAY[]::uuid[])
    INTO v_ovr_all, v_ovr_in
    FROM fn_dbar_owner(p_periode) o;

  RETURN QUERY
  WITH hidden AS MATERIALIZED (SELECT h.aset_id FROM fn_dbar_hidden(p_periode, 'penyusutan') h),
       ownr   AS MATERIALIZED (SELECT o.aset_id, o.owner_skpd FROM fn_dbar_owner(p_periode) o)
  SELECT
    a.id, a.nibar, a.kode_register, a.kode, a.nama_barang,
    a.skpd_id, COALESCE(o.owner_skpd, a.skpd_id),
    a.nilai_perolehan, a.intra_ekstra, a.tgl_perolehan,
    a.merek_tipe, a.alamat_detail,
    ps.nilai_perolehan, ps.beban, ps.akumulasi,
    ps.nilai_buku_akhir, ps.sisa_semester, ps.masa_manfaat_tahun
  FROM aset a
  LEFT JOIN ownr o ON o.aset_id = a.id
  LEFT JOIN penyusutan_semester ps ON ps.aset_id = a.id AND ps.periode = p_periode
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
  -- Kembar dengan `bandingKode` di klien: kode → nilai turun → id sbg pemecah
  -- seri. Tanpa kunci UNIK di ujung, isi halaman ke-N bisa berpindah tiap query.
  ORDER BY a.kode, a.nilai_perolehan DESC, a.id
  LIMIT p_limit OFFSET COALESCE(p_offset, 0);
END;
$function$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. fn_penyusutan_rekap — hitungan & total, DIPISAH dari query halaman
-- ═══════════════════════════════════════════════════════════════════════════
-- Dipanggil sekali per perubahan filter, bukan per halaman. Filternya WAJIB
-- sama persis dengan fn_penyusutan — kalau menyimpang, jumlah di kaki tabel
-- tak lagi menjelaskan baris yang tampil di atasnya.
CREATE OR REPLACE FUNCTION fn_penyusutan_rekap(
  p_periode   text,
  p_skpd_ids  bigint[] DEFAULT NULL,
  p_golongan  text     DEFAULT NULL,
  p_komptabel text     DEFAULT NULL,
  p_search    text     DEFAULT NULL
)
RETURNS TABLE(
  jumlah_baris    bigint,
  total_perolehan numeric,
  total_beban     numeric,
  total_akumulasi numeric,
  total_nilai_buku numeric,
  -- Berapa baris yang BELUM punya hasil engine. Bukan hiasan: nol di kolom
  -- angka bisa berarti "sudah habis disusutkan" ATAU "engine belum dijalankan",
  -- dan hanya angka ini yang bisa membedakannya di layar.
  tanpa_hasil_engine bigint
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
-- ⚠️ `work_mem` dinaikkan KHUSUS untuk fungsi ini, bukan untuk seluruh basis
-- data. Terukur 2026-08-18 (Dinas Pendidikan, 1.3.2, intra, 2026-S1 = 132.694
-- baris), RLS aktif:
--   nested loop 132.694 lookup ................ 5.237 ms
--   CTE MATERIALIZED, work_mem bawaan ......... 6.112 ms  (hash tumpah, Batches 4)
--   CTE MATERIALIZED, work_mem 64MB ........... 1.049 ms  (Batches 1)
-- Pemakaian nyatanya 8,3 MB, jadi 64 MB sudah berlebih. JANGAN dinaikkan lagi
-- "biar aman": work_mem berlaku per-node-per-koneksi, dan dengan target 100–150
-- pengguna serentak angka besar di sini berubah jadi masalah memori server.
SET work_mem TO '64MB'
AS $function$
DECLARE
  v_lihat_semua boolean := fn_is_admin() OR fn_is_viewer();
  v_scope bigint[]; v_pernah uuid[];
  v_akhir date := fn_akhir_periode(p_periode);
  v_ovr_all uuid[];
  v_ovr_in  uuid[];
BEGIN
  SELECT s.scope, s.pernah INTO v_scope, v_pernah FROM fn_dbar_scope(v_lihat_semua) s;

  SELECT COALESCE(array_agg(o.aset_id), ARRAY[]::uuid[]),
         COALESCE(array_agg(o.aset_id) FILTER (WHERE o.owner_skpd = ANY(p_skpd_ids)), ARRAY[]::uuid[])
    INTO v_ovr_all, v_ovr_in
    FROM fn_dbar_owner(p_periode) o;

  RETURN QUERY
  WITH hidden AS MATERIALIZED (SELECT h.aset_id FROM fn_dbar_hidden(p_periode, 'penyusutan') h)
  ,
  -- ⚠️ `AS MATERIALIZED` BERPASANGAN dengan `SET work_mem` di kepala fungsi —
  -- perlu keduanya; salah satu saja justru lebih lambat dari nested loop biasa.
  -- Materialisasi membuat sisi ini dibaca SEKALI lewat covering index
  -- `idx_ps_periode_rekap` (index-only, Heap Fetches 0) lalu di-hash join;
  -- work_mem yang menjaga hash-nya tak tumpah ke disk. Keempat kolom di bawah
  -- SENGAJA persis isi INCLUDE index itu — menambah kolom lain (mis.
  -- `sisa_semester`) membatalkan index-only-nya.
  ps AS MATERIALIZED (
    SELECT x.aset_id, x.nilai_perolehan, x.beban, x.akumulasi, x.nilai_buku_akhir
    FROM penyusutan_semester x
    WHERE x.periode = p_periode
  )
  -- ⚠️ ATURAN PER BARIS, bukan penjumlahan kolom mentah. Golongan yang TAK
  -- PERNAH disusutkan (1.3.1 Tanah, 1.3.5 ATL, 1.3.6 KDP) tak punya baris
  -- engine, jadi beban/akumulasinya NOL dan **nilai bukunya = nilai
  -- perolehan** — bukan nol. Menjumlah `ps.nilai_buku_akhir` apa adanya
  -- mengulang persis cacat yang bikin Uji Konsistensi menuduh Tanah & ATL
  -- "TIDAK COCOK" (2026-08-16, lihat lib/rekapBmd.ts).
  --
  -- ⚠️ Daftar golongan di bawah KEMBAR dengan `perlakuanKode()` di lib/bmd.ts —
  -- ia mengembalikan 'tidak' untuk selain kelima ini. Ubah satu, ubah dua-duanya.
  -- Kembar dengan `tot` di app/dashboard/penyusutan/page.tsx (baris ~370) pula:
  -- kaki tabel & rekap server WAJIB memakai aturan yang sama, kalau tidak
  -- jumlah di kaki tabel berhenti menjelaskan baris di atasnya.
  SELECT
    count(*)::bigint,
    COALESCE(sum(COALESCE(ps.nilai_perolehan, a.nilai_perolehan)), 0),
    COALESCE(sum(ps.beban)     FILTER (WHERE a.golongan IN ('1.3.2','1.3.3','1.3.4','1.5.3','1.5.4')), 0),
    COALESCE(sum(ps.akumulasi) FILTER (WHERE a.golongan IN ('1.3.2','1.3.3','1.3.4','1.5.3','1.5.4')), 0),
    COALESCE(sum(CASE WHEN a.golongan IN ('1.3.2','1.3.3','1.3.4','1.5.3','1.5.4') AND ps.aset_id IS NOT NULL
                      THEN ps.nilai_buku_akhir ELSE a.nilai_perolehan END), 0),
    count(*) FILTER (WHERE ps.aset_id IS NULL)::bigint
  FROM aset a
  LEFT JOIN ps ON ps.aset_id = a.id
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
    AND (a.tgl_perolehan IS NULL OR a.tgl_perolehan <= v_akhir);
END;
$function$;

GRANT EXECUTE ON FUNCTION fn_dbar_hidden(text, text)                                   TO authenticated;
GRANT EXECUTE ON FUNCTION fn_penyusutan(text, bigint[], text, text, text, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_penyusutan_rekap(text, bigint[], text, text, text)         TO authenticated;
