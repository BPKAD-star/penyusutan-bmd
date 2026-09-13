-- 20260913_01_kode_register_period_aware.sql
-- KODE REGISTER jadi PERIOD-AWARE di Daftar Barang & Penyusutan.
--
-- ═══ KENAPA ════════════════════════════════════════════════════════════════
-- CLAUDE.md ("Kode Register", butir "BELUM SELESAI") mencatat sejak 2026-07-29:
-- tampilan menampilkan kode register TERKINI walau membuka periode lampau, dan
-- alasan ia dibiarkan adalah *"belum terasa karena tabel riwayat masih nyaris
-- kosong"*. Diukur ke produksi 2026-09-13, alasan itu **sudah tidak berlaku**:
--
--   aset_kode_register           188 baris / 67 aset
--   kode register berubah         67 aset (66 masih `aktif`)
--   periode perpindahannya        SEMUANYA 2026-S2
--
-- Artinya begitu operator membuka Daftar Barang / Penyusutan / Export untuk
-- **2026-S1** — semester yang sudah dilaporkan — 66 barang itu menampilkan kode
-- register 2026-S2, kode yang pada periode itu BELUM TERBIT. Tanpa satu pun
-- error. Persis yang diperingatkan CLAUDE.md sendiri: *"berkas periode lampau
-- untuk BPK menyebut kode yang saat itu belum terbit."*
--
-- Ini pelanggaran aturan lintas-fitur "PERISTIWA BERLAKU SEJAK PERIODENYA,
-- TIDAK SURUT" — kelas yang sama dengan `skpd_id` terkini (sudah ditutup
-- `fn_dbar_owner`), `aset.kode` terkini (sudah ditutup `fn_dbar_kode_at`), dan
-- visibilitas (sudah ditutup `fn_dbar_hidden`). Kode register tinggal satu-
-- satunya kolom identitas di kedua halaman itu yang masih membaca posisi
-- terakhir.
--
-- ═══ ATURAN BACANYA ════════════════════════════════════════════════════════
-- KEMBAR dengan `ownersAt()` (lib/pengalihan.ts), `kodePada()` (lib/reklasKode.ts),
-- & `fn_dbar_kode_at` — dan itu memang sudah tertulis di CLAUDE.md:
--
--   kode pada periode V = `kode_register` baris TERAKHIR ber-`periode <= V`;
--   kalau semua perpindahannya justru SESUDAH V → `kode_lama` baris PALING AWAL
--   (= kode semula); tak pernah pindah → `aset.kode_register`.
--
-- ⚠️ BEDA PENTING dari `fn_dbar_kode_at`: di sini **TIDAK ADA penyaringan
-- `batal_*`**, dan itu bukan kelalaian. `fn_dbar_kode_at` membaca LEDGER, jadi
-- ia wajib membuang baris yang dianulir `batal_reklas`. `aset_kode_register`
-- bukan ledger — ia riwayat yang ditulis trigger `trg_aset_kode_register`, dan
-- pembatalan MENAMBAH BARIS BARU yang memulihkan kode lama (cabang GUC
-- `app.batal_pengalihan`). Diverifikasi ke produksi: aset
-- 808efb32-3e16-4e3e-b402-9018d8e0896e punya 4 baris
--   pindah unit → pindah unit → **batal pengalihan** → pindah unit
-- dan rantainya utuh (`kode_register` baris ke-n == `kode_lama` baris ke-n+1).
-- Jadi "baris terakhir menang" sudah benar dengan sendirinya; menambahkan
-- penyaringan batal di sini justru akan MENGANULIR pemulihannya.
--
-- ⚠️ `kode_register IS NULL` DIPERTAHANKAN NULL, tidak diisi dari riwayat.
-- Barang `draft` sengaja belum berkode ("nomor tak dibakar untuk yang mungkin
-- tak jadi", CLAUDE.md), tapi riwayatnya BISA sudah berisi — kontrak KDP yang
-- dibuka kunci (`unapproveKontrakKonstruksi`) mengembalikan status ke `draft` &
-- meng-NULL-kan kolomnya, sementara baris riwayatnya tetap ada (terukur: 1 aset,
-- "Rehab Gedung Kantor BKAD"). Tanpa penjaga ini fungsi ini akan MENERBITKAN
-- kode untuk barang yang justru belum resmi. Hari ini efeknya nol — `draft`
-- disaring di kedua RPC ini DAN di kedua jalur mentah klien — jadi ini penjaga
-- makna, bukan tambalan gejala.
--
-- ═══ BIAYA — DIUKUR, BUKAN DIPERKIRAKAN ════════════════════════════════════
-- `aset_kode_register` 188 baris / 40 kB. Seq Scan penuh memang yang benar di
-- ukuran itu, dan biayanya ikut jumlah PERPINDAHAN — bukan besar register
-- (473.623 aset) maupun ledger (474.518 baris). Karena itu TIDAK ada index baru:
-- `idx_akr_aset_id (aset_id, id)` yang sudah ada tak akan dipakai untuk agregasi
-- seluruh tabel, dan menambah index di tabel 188 baris cuma menambah ongkos
-- tulis di trigger. Kalau kelak tabel ini tumbuh ke puluhan ribu baris,
-- pertimbangkan `(aset_id, periode DESC, id DESC) INCLUDE (kode_lama,
-- kode_register)` — bukan sekarang.
--
-- ⚠️⚠️ SECURITY DEFINER DI SINI BUKAN PILIHAN GAYA — DUA-DUANYA DIUKUR.
-- Pola & alasannya sama dgn `fn_dbar_kode_at`/`fn_dbar_owner`, tapi di tabel ini
-- akibatnya jauh lebih tajam karena policy `akr_select` menengok `aset` PER
-- BARIS (`EXISTS` + `fn_aset_pernah_dikelola`). Query yang SAMA, `EXPLAIN
-- (ANALYZE, BUFFERS)` di produksi 2026-09-13:
--
--   sbg pemilik fungsi (= SECURITY DEFINER)   0,718 ms ·     16 buffer · 67 baris
--   sbg `authenticated` (= INVOKER, Diknas)   424     ms · 18.942 buffer ·  3 baris
--
-- **591× lebih lambat, dan yang lebih penting: JAWABANNYA SALAH.** Sbg INVOKER
-- ia cuma melihat 3 dari 67 aset (`Rows Removed by Filter: 185`), jadi 64 aset
-- sisanya akan diam-diam JATUH KE `aset.kode_register` — yaitu persis bug yang
-- migrasi ini hendak menutup, cuma sekarang bersembunyi di balik fungsi yang
-- kelihatan sudah benar. Tak ada satu pun error yang muncul.
-- **Jangan pernah "memperbaiki" fungsi ini jadi SECURITY INVOKER.**
--
-- Keamanannya dijaga PEMANGGIL, bukan oleh policy tabel ini: `fn_daftar_barang`
-- & `fn_penyusutan` sudah membatasi baris mana yang keluar (scope SKPD +
-- visibilitas + `status <> 'draft'`), dan fungsi ini cuma dipakai sebagai LEFT
-- JOIN di atas baris yang SUDAH lolos saringan itu — ia tak pernah memperlebar
-- himpunan barisnya, cuma mengganti nilai satu kolom.
--
-- ═══ DEPLOY-ORDERING: AMAN DUA ARAH (jarang, jadi dicatat) ═════════════════
-- Bentuk `RETURNS TABLE` kedua RPC **TIDAK berubah** — yang berubah NILAI kolom
-- `kode_register`, bukan daftar kolomnya. Jadi:
--   migrasi dulu → klien lama langsung menampilkan kode yang benar (ia cuma
--                  merender kolom yang sama), tak ada yang rusak;
--   kode dulu    → layar & Export RPC berperilaku seperti sekarang; yang belum
--                  benar hanya jalur mentah klien, persis seperti hari ini.
-- Karena itu ini SATU-SATUNYA migrasi RPC di repo ini yang tak perlu
-- deploy-ordering. Tetap: jalankan migrasi dulu, karena itu yang menutup
-- Lapis 1 (layar + Export Daftar Barang, yang sepenuhnya lewat RPC).
--
-- ⚠️ `CREATE OR REPLACE`, BUKAN `DROP` + `CREATE` — sengaja, dan bedanya nyata:
-- `RETURNS TABLE` tak berubah sehingga OR REPLACE sah, dan dengan begitu GRANT
-- kedua fungsi TIDAK hilang (20260908_01 harus men-DROP karena menambah kolom,
-- lalu wajib GRANT ulang). `SET search_path TO 'public'` tetap DITULIS ULANG di
-- badan tiap fungsi: CLAUDE.md — setelan `ALTER FUNCTION … SET` lenyap tiap
-- badan fungsi dibuat ulang, dan diverifikasi lewat `pg_proc.proconfig`
-- sesudahnya (lihat PEMERIKSAAN SILANG di bawah).

-- ── 1. Kode register efektif pada sebuah periode ───────────────────────────
CREATE OR REPLACE FUNCTION fn_dbar_kode_register_at(p_periode text)
RETURNS TABLE (aset_id uuid, kode_reg_eff text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT r.aset_id,
    COALESCE(
      (array_agg(r.kode_register ORDER BY r.periode DESC, r.id DESC)
         FILTER (WHERE r.periode <= p_periode))[1],
      (array_agg(r.kode_lama ORDER BY r.periode ASC, r.id ASC))[1]
    ) AS kode_reg_eff
  FROM aset_kode_register r GROUP BY r.aset_id;
$function$;

GRANT EXECUTE ON FUNCTION fn_dbar_kode_register_at(text) TO anon, authenticated, service_role;

-- ── 2. fn_daftar_barang — layar & Export Daftar Barang ─────────────────────
-- Badan fungsinya DISALIN APA ADANYA dari 20260903_01 + 20260908_01; yang
-- berubah HANYA empat hal yang ditandai komentar "BARU 2026-09-13" & blok CASE
-- di bawah. Filter, urutan, kursor dua-cabang, guard, visibilitas, & pemilik-
-- pada-periode TIDAK disentuh sebaris pun.
CREATE OR REPLACE FUNCTION fn_daftar_barang(
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
       ownr   AS MATERIALIZED (SELECT o.aset_id, o.owner_skpd FROM fn_dbar_owner(p_periode) o),
       -- BARU 2026-09-13 — kode register PADA periode ini, bukan posisi terakhir.
       -- MATERIALIZED mengikuti dua CTE di atasnya: isinya kecil (188 baris di
       -- produksi) & dipakai sebagai LEFT JOIN di LUAR, jadi menghitungnya sekali
       -- jauh lebih murah daripada membiarkan planner melipatnya ke dalam join.
       kodereg AS MATERIALIZED (SELECT k.aset_id, k.kode_reg_eff FROM fn_dbar_kode_register_at(p_periode) k)
  SELECT u.id, u.nibar,
         -- ⚠️ `u.kode_register IS NULL` DIPERTAHANKAN NULL: barang `draft` sengaja
         -- belum berkode, tapi riwayatnya bisa sudah berisi (kontrak KDP yang
         -- dibuka kunci). Lihat kepala berkas ini. Fungsi ini tak pernah
         -- MENERBITKAN kode untuk barang yang belum resmi.
         CASE WHEN u.kode_register IS NULL THEN NULL
              ELSE COALESCE(kr.kode_reg_eff, u.kode_register) END,
         u.kode, u.nama_barang,
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
  LEFT JOIN kodereg kr ON kr.aset_id = u.id
  ORDER BY u.kode, u.nilai_perolehan DESC, u.id
  LIMIT p_limit;
END;
$function$;

-- ── 3. fn_penyusutan — layar Penyusutan ────────────────────────────────────
-- Badan fungsinya DISALIN dari definisi hidupnya (20260818_01); yang berubah
-- hanya CTE `kodereg`, join-nya, & satu kolom keluaran. `SET search_path`
-- ditulis ulang (wajib — lihat kepala berkas).
CREATE OR REPLACE FUNCTION fn_penyusutan(
  p_periode text, p_skpd_ids bigint[] DEFAULT NULL, p_golongan text DEFAULT NULL,
  p_komptabel text DEFAULT NULL, p_search text DEFAULT NULL,
  p_limit integer DEFAULT 100, p_offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid, nibar text, kode_register text, kode_barang text, nama_barang text,
  skpd_id bigint, owner_skpd bigint, nilai_perolehan numeric, intra_ekstra text,
  tgl_perolehan date, merek_tipe text, alamat_detail text,
  p_nilai_perolehan numeric, p_beban numeric, p_akumulasi numeric,
  p_nilai_buku_akhir numeric, p_sisa_semester integer, p_masa_manfaat_tahun numeric
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
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
  -- ⚠️ varian 'penyusutan' — SENGAJA tanpa `kdp_selesai_keluar`. Jangan
  -- disamakan dgn varian Daftar Barang (CLAUDE.md / 20260818_01).
  WITH hidden AS MATERIALIZED (SELECT h.aset_id FROM fn_dbar_hidden(p_periode, 'penyusutan') h),
       ownr   AS MATERIALIZED (SELECT o.aset_id, o.owner_skpd FROM fn_dbar_owner(p_periode) o),
       -- BARU 2026-09-13 — kode register PADA periode ini, bukan posisi terakhir.
       kodereg AS MATERIALIZED (SELECT k.aset_id, k.kode_reg_eff FROM fn_dbar_kode_register_at(p_periode) k)
  SELECT
    a.id, a.nibar,
    -- ⚠️ NULL tetap NULL — barang `draft` tak pernah diterbitkan kode dari
    -- riwayat. Alasan lengkapnya di kepala berkas ini.
    CASE WHEN a.kode_register IS NULL THEN NULL
         ELSE COALESCE(kr.kode_reg_eff, a.kode_register) END,
    a.kode, a.nama_barang,
    a.skpd_id, COALESCE(o.owner_skpd, a.skpd_id),
    a.nilai_perolehan, a.intra_ekstra, a.tgl_perolehan,
    a.merek_tipe, a.alamat_detail,
    ps.nilai_perolehan, ps.beban, ps.akumulasi,
    ps.nilai_buku_akhir, ps.sisa_semester, ps.masa_manfaat_tahun
  FROM aset a
  LEFT JOIN ownr o ON o.aset_id = a.id
  LEFT JOIN kodereg kr ON kr.aset_id = a.id
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

-- ── PEMERIKSAAN SILANG (wajib dijalankan sesudah migrasi ini) ──────────────
-- ⚠️ SEMUANYA dgn RLS AKTIF. Sbg service_role, `fn_dbar_scope` tak mengembalikan
-- apa pun sehingga kedua RPC ini terlihat KOSONG — bukan rusak, cuma tak bisa
-- dipakai memverifikasi (kebalikan dari jebakan biasa; lihat catatan
-- `fn_lra_belanja_modal` di CLAUDE.md).
--
--   BEGIN;
--   SET LOCAL role authenticated;
--   SET LOCAL request.jwt.claims TO
--     '{"sub":"b8faba40-150f-4419-809f-504366055a61","role":"authenticated"}';
--   -- ^ pengurus barang Dinas PM & PTSP (skpd 20): 29 aset ber-riwayat, kasus
--   --   terbesar di produksi & paling gampang dilihat di layar.
--
-- (1) PERIODE BERJALAN TIDAK BOLEH BERGESER SEANGKA PUN. Ini pemeriksaan yang
--     paling penting — sebelum migrasi terukur 0 baris bergeser di 2026-S2:
--       SELECT count(*) FILTER (WHERE d.kode_register <> a.kode_register) AS harus_0
--         FROM fn_daftar_barang('2026-S2', ARRAY[20]::bigint[], '1.3.2', 'intra',
--                               NULL, 1000000, 0) d
--         JOIN aset a ON a.id = d.id;
--       -> 0
--
-- (2) PERIODE LAMPAU HARUS BERUBAH, dan tepat sebanyak yang diukur. Sebelum
--     migrasi: 29 dari 618 baris menampilkan kode 2026-S2 di layar 2026-S1.
--       SELECT count(*) AS baris,
--              count(*) FILTER (WHERE d.kode_register <> a.kode_register) AS ikut_periode
--         FROM fn_daftar_barang('2026-S1', ARRAY[20]::bigint[], '1.3.2', 'intra',
--                               NULL, 1000000, 0) d
--         JOIN aset a ON a.id = d.id;
--       -> baris 618, ikut_periode 29
--
-- (3) Jumlah baris & rekap TIDAK berubah (klausa WHERE tak disentuh; rekapnya
--     sengaja tidak ikut dimigrasi karena tak mengembalikan kode register):
--       SELECT (SELECT total_count FROM fn_daftar_barang_rekap('2026-S1', ARRAY[20]::bigint[], '1.3.2', 'intra')) AS dari_rekap,
--              (SELECT count(*) FROM fn_daftar_barang('2026-S1', ARRAY[20]::bigint[], '1.3.2', 'intra', NULL, 1000000, 0)) AS dari_halaman;
--       -> keduanya SAMA
--
-- (4) Penyusutan ikut & sepakat dgn Daftar Barang untuk aset yang sama:
--       SELECT count(*) AS beda_harus_0
--         FROM fn_penyusutan('2026-S1', ARRAY[20]::bigint[], '1.3.2', 'intra', NULL, 1000000, 0) p
--         JOIN fn_daftar_barang('2026-S1', ARRAY[20]::bigint[], '1.3.2', 'intra', NULL, 1000000, 0) d
--           ON d.id = p.id
--        WHERE p.kode_register IS DISTINCT FROM d.kode_register;
--       -> 0
--
--   ROLLBACK;
--
-- (5) `SET search_path` bertahan di KETIGA fungsi (dijalankan tanpa SET role) —
--     CLAUDE.md: setelan `ALTER FUNCTION … SET` lenyap tiap badan dibuat ulang.
--     `fn_penyusutan_rekap` ikut dicek karena ia satu-satunya di keluarga ini
--     yang ber-`work_mem` & TIDAK disentuh migrasi ini:
--       SELECT proname, proconfig FROM pg_proc
--        WHERE proname IN ('fn_dbar_kode_register_at','fn_daftar_barang',
--                          'fn_penyusutan','fn_penyusutan_rekap');
--       -> ketiga yang disentuh: {search_path=public}
--       -> fn_penyusutan_rekap TETAP {search_path=public, work_mem=64MB}
--
-- (6) GRANT `fn_daftar_barang`/`fn_penyusutan` TIDAK hilang — OR REPLACE memang
--     mempertahankannya, tapi periksa, jangan percaya:
--       SELECT p.proname, array_agg(a.privilege_type) FROM pg_proc p
--         JOIN information_schema.routine_privileges a ON a.routine_name = p.proname
--        WHERE p.proname IN ('fn_daftar_barang','fn_penyusutan','fn_dbar_kode_register_at')
--        GROUP BY p.proname;
--       -> ketiganya EXECUTE untuk anon, authenticated, service_role
