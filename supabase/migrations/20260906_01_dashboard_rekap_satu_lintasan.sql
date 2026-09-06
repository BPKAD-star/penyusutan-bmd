-- ============================================================================
-- Dashboard "Rekap aset gagal dimuat — canceling statement due to statement
-- timeout" yang MUNCUL-HILANG (dilaporkan user 2026-09-06).
--
-- Gejalanya khas: kadang halaman normal, kadang strip merah + semua kartu 0.
-- Yang muncul-hilang bukan datanya, melainkan RENCANA & BIAYA query-nya.
--
-- ⚠️ SEMUA ANGKA DI BAWAH DIUKUR KE PRODUKSI, RLS AKTIF, sebagai admin pemda
-- (`d6e5ea72-e34d-4be5-9bda-da4ffada3dfd`) — rules.md §4.3. Bukan perkiraan.
-- Keadaan `aset` saat diukur: **471.761 baris (471.393 aktif), heap 276 MB**
-- (CLAUDE.md & schema.md masih menulis 418rb — sudah basi, ikut dibetulkan).
--
-- ── TEMUAN UTAMA: MARGINNYA TINGGAL 8% ─────────────────────────────────────
--                                    LAMA          SESUDAH (terpasang + VACUUM)
--   admin pemda .................. 7.326 ms  →  **271 ms**   (27×)
--   pengurus Dinas Pendidikan .... 5.199 ms  →  **210 ms**   (25×)
--   Heap Fetches per lintasan ....   56.493  →      2.981
--   lintasan pemindaian register .        2  →          1
--   pagu `statement_timeout` role `authenticated`: **8.000 ms**
--   → margin yang tadinya tinggal 8% kini 97%.
--
-- Diverifikasi sesudah migrasi ini benar-benar dijalankan (2026-09-06):
-- `Index Only Scan using idx_aset_dashboard_rekap` (SATU node, dulu dua),
-- `proconfig` masih {search_path=public, work_mem=64MB}, ketiga setelan
-- autovacuum menempel, `n_ins_since_vacuum` kembali 0, dan keluaran
-- `fn_dashboard_rekap()` IDENTIK karakter-per-karakter dgn sebelum migrasi.
--
-- ⚠️ Run PERTAMA sesudahnya tetap terlihat lambat (3.240 ms) karena indexnya
-- masih dingin — 3.966 blok dibaca dari disk. Jangan menilai dari satu
-- pengukuran; run kedua 271 ms tanpa satu pun baca disk.
--
-- Jadi Dashboard bukan "kadang lambat" — ia SUDAH berdiri di bibir pagu (sisa
-- 8% untuk admin), dan beban serentak sedikit saja atau cache yang mendingin
-- langsung menjatuhkannya. Itulah kenapa gejalanya muncul-hilang tanpa pola.
--
-- ⚠️ Cabang NON-ADMIN ikut memburuk tanpa ada yang sadar: 20260818_06 mencatat
-- 434 ms, hari ini **5.199 ms — 12× lebih lambat**. Jadi ini bukan cuma
-- masalah admin; seluruh pengguna Dashboard sedang berjalan di tepi yang sama.
--
-- ⚠️ Angka "BARU" di atas diukur dengan index yang BARU SAJA dibangun (3.967
-- blok masih dibaca dari disk) DAN 56.493 heap fetches yang belum hilang —
-- `VACUUM` mustahil dijalankan di dalam transaksi uji. Sesudah langkah 2 di
-- kaki berkas ini, heap fetches jatuh ke ~0 & buffer tinggal ±3.970 (ukuran
-- indexnya sendiri), jadi angka sesungguhnya akan jauh di bawah ini.
--
-- ── SEBAB 1: dua lintasan untuk satu pertanyaan ────────────────────────────
-- Badan `fn_dashboard_rekap` (20260810_02) berisi DUA subquery ber-qual SAMA
-- PERSIS (`status='aktif' AND (v_is_admin OR …)`) — satu GROUP BY golongan,
-- satu GROUP BY cara_perolehan. Postgres tak bisa menyatukannya sendiri, jadi
-- register 471rb baris disapu DUA KALI:
--     Index Only Scan using idx_aset_rekap_bmd   … 471.393 baris
--     Index Only Scan using idx_aset_skpd_rekap  … 471.393 baris
--     Buffers total: 18.900 hit + 1.611 read
--
-- ⚠️ Dugaan awal saya keliru & sengaja dicatat di sini supaya tak diulang:
-- saya kira subquery `cara` jatuh ke **Seq Scan** karena `cara_perolehan` cuma
-- ada di `idx_aset_skpd_rekap` yang berkunci `skpd_id`. Ternyata TIDAK —
-- Postgres tetap memakainya sebagai Index Only Scan dengan
-- `Index Cond: (status='aktif')` pada kolom kunci KEDUA. Jadi biang beratnya
-- bukan seq scan, melainkan **dua sapuan penuh + heap fetches** di bawah.
-- (Pelajaran yang sama untuk kesekian kali: jangan simpulkan rencana query
-- dari membaca kode — ukur.)
--
-- ── SEBAB 2: visibility map basi, & inilah sumber "kadang"-nya ─────────────
--     Heap Fetches: **56.493 di SETIAP lintasan** → 112.986 kunjungan heap ACAK
-- Artinya "Index Only Scan"-nya sudah berhenti jadi index-only. Sebabnya:
--     n_ins_since_vacuum ... **53.609 baris**
--     last_vacuum ......... 2026-08-10   (27 hari sebelum diukur)
--     last_autovacuum ..... 2026-07-29   (38 hari!)
-- Import 20260904_02 & 20260905_06 (PM ekstrakomptabel, 22.795 baris Dinkes
-- saja) tak ditutup `VACUUM`, dan autovacuum bawaan baru menyala sesudah 20%
-- tabel berubah — di 471rb baris itu ±94rb, jadi tak pernah terpicu. Halaman
-- baru tak ditandai all-visible, dan setiap agregat di aplikasi ini diam-diam
-- membayar kunjungan heap untuk tiap barisnya.
-- (`last_autoanalyze` 2026-09-05 → statistiknya justru segar; yang tertinggal
-- khusus VACUUM-nya. Ambang autoanalyze memang lebih rendah.)
--
-- ── OBAT: TIGA LAPIS ───────────────────────────────────────────────────────
--   (1) satu index penutup khusus, PARTIAL `WHERE status='aktif'` (31 MB);
--   (2) fungsinya menyapu SEKALI lewat GROUPING SETS;
--   (3) autovacuum `aset`/`transaksi_bmd`/`aset_awal_2026` disetel supaya tak
--       menunggu 20% tabel berubah — INI yang mencabut sebab "kadang"-nya;
--       (1) & (2) memperlebar marginnya.
--
-- Diuji dengan index dipasang di dalam transaksi lalu di-ROLLBACK (produksi,
-- RLS aktif): satu Index Only Scan menggantikan dua, buffer 20.511 → 9.821.
-- Heap Fetches-nya masih 56.493 — itu jatah langkah (3)/VACUUM, dan itu pula
-- sebabnya langkah 2 di kaki berkas ini WAJIB, bukan pelengkap.
--
-- ── KESETARAAN HASIL — DIBUKTIKAN DI DATA PRODUKSI, BUKAN DIASUMSIKAN ──────
-- Fungsi versi baru dibuat berdampingan (`fn_dashboard_rekap_uji`) di dalam
-- transaksi, keluarannya dibandingkan dengan fungsi yang HIDUP, lalu ROLLBACK:
--   · sebagai admin pemda ............... **identik** (8 golongan + 3 cara,
--     cocok sampai desimal terakhir, mis. 1.3.2 n=269.548 rp=1.371.403.141.111,94)
--   · sebagai pengurus Dinas Pendidikan .. **identik**
-- Yang diubah migrasi ini murni BERAPA KALI register dilewati & INDEX MANA
-- yang dipakai — bukan apa yang dihitung.
-- ============================================================================

-- ── 1. Index penutup khusus Dashboard ──────────────────────────────────────
-- PARTIAL `WHERE status='aktif'`, bukan `status` sebagai kolom kunci: qual di
-- fungsi berbentuk literal, jadi planner bisa MEMBUKTIKAN implikasinya &
-- predikatnya selesai di tingkat index — tanpa menyimpan 368 baris
-- 'dihapus'/'draft' yang tak pernah ditanyakan halaman ini.
--
-- Kunci `skpd_id` (bukan `status`) supaya SATU index melayani DUA cabang:
--   · admin      → qual habis oleh predikat → pemindaian index-only PENUH;
--   · non-admin  → `skpd_id = ANY(scope)` tetap bisa jadi index-cond.
-- INCLUDE memuat PERSIS kolom yang dibaca fungsinya (`id` & `skpd_id` untuk
-- qual cabang non-admin; `golongan`, `cara_perolehan`, `nilai_perolehan` untuk
-- agregatnya) — heap tak perlu disentuh sama sekali. Terukur **31 MB**.
--
-- ⚠️ PLAIN, bukan CONCURRENTLY: SQL Editor membungkus skrip jadi satu
-- transaksi, dan CONCURRENTLY di dalam transaksi GAGAL SENYAP (rules.md §5.3).
CREATE INDEX IF NOT EXISTS idx_aset_dashboard_rekap
  ON aset (skpd_id)
  INCLUDE (id, golongan, cara_perolehan, nilai_perolehan)
  WHERE status = 'aktif';

-- ── 2. Fungsinya: dua lintasan → satu ──────────────────────────────────────
-- ⚠️⚠️ `SET work_mem TO '64MB'` WAJIB IKUT DITULIS DI SINI. Setelan itu dipasang
-- 20260818_06 lewat `ALTER FUNCTION … SET`, dan `CREATE OR REPLACE FUNCTION`
-- MENGGANTI seluruh daftar konfigurasi fungsi — menghilangkannya dari badan
-- baru berarti membatalkan perbaikan 5.741 → 434 ms itu DIAM-DIAM, tanpa satu
-- pun error. Diperiksa ke produksi sebelum menulis ini: `pg_proc.proconfig`
-- fungsi ini memang `{search_path=public, work_mem=64MB}`. Jebakan yang sama
-- berlaku untuk SETIAP `CREATE OR REPLACE` atas fungsi yang pernah kena
-- `ALTER FUNCTION … SET` — cek `proconfig` dulu, salin ulang seluruh isinya.
--
-- `statement_timeout` SENGAJA TIDAK dinaikkan (alasan lengkap di 20260818_06):
-- pagu 8 dtk itu satu-satunya alarm yang akan berteriak kalau kelak ada regresi
-- 20×. Menaikkannya = membungkam alarm alih-alih memperbaiki sebabnya. Justru
-- alarm itulah yang hari ini berbunyi dengan benar.
CREATE OR REPLACE FUNCTION public.fn_dashboard_rekap()
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET work_mem TO '64MB'
AS $function$
DECLARE
  v_is_admin boolean := fn_is_admin();
  -- Scope SKPD SEKALI, bukan per baris. Viewer → kosong; COALESCE wajib karena
  -- `x = ANY(NULL::bigint[])` menghasilkan NULL, bukan false (20260810_02).
  v_scope bigint[] := CASE WHEN fn_is_viewer() THEN ARRAY[]::bigint[]
                           ELSE COALESCE(fn_my_skpd_scope(), ARRAY[]::bigint[]) END;
  -- Aset yang PERNAH dikelola (pengalihan status) — sekali juga.
  v_pernah uuid[] := CASE WHEN v_is_admin THEN ARRAY[]::uuid[] ELSE (
      SELECT COALESCE(array_agg(DISTINCT t.aset_id), ARRAY[]::uuid[])
      FROM transaksi_bmd t
      WHERE t.jenis = 'pengalihan_status'
        AND (t.skpd_asal = ANY(v_scope) OR t.skpd_tujuan = ANY(v_scope))
    ) END;
  v_result json;
BEGIN
  -- SATU pemindaian register, DUA pengelompokan. `GROUPING SETS` menghitung
  -- kedua agregat dari aliran baris yang sama; kardinalitas keduanya kecil
  -- (8 golongan, 3 cara perolehan terpakai) jadi tabel hash-nya sepele —
  -- terukur `Batches: 1  Memory Usage: 32kB`.
  --
  -- ⚠️ `golongan` DIPAKAI LANGSUNG, bukan `split_part(kode,…)` seperti bentuk
  -- lama, dan itu BUKAN penyederhanaan yang mengubah arti: diperiksa ke
  -- produksi, `aset.golongan` adalah kolom **GENERATED ALWAYS … STORED** yang
  -- ekspresinya PERSIS
  --     split_part(kode,'.',1)||'.'||split_part(kode,'.',2)||'.'||split_part(kode,'.',3)
  -- — yaitu ekspresi yang sama huruf-per-huruf. Jadi keduanya setara MENURUT
  -- DEFINISI, bukan kebetulan; uji `golongan IS DISTINCT FROM <ekspresi>` atas
  -- 471.393 baris aktif memberi **0**. Untungnya dobel: kolomnya jauh lebih
  -- pendek dari `kode` (index lebih kecil) & ±1,4 juta panggilan split_part
  -- per pemuatan halaman hilang.
  -- ⚠️ JANGAN samakan dengan `aset_awal_2026.golongan`, yang dihitung dari
  -- `substring(kode from '^\d+\.\d+\.\d+')` — varian ITU memang bisa berbeda
  -- (kode < 3 segmen: NULL, bukan '1.3.').
  --
  -- `GROUPING(gol)` = 0 → baris milik grouping set (gol);
  --                 = 1 → gol diagregasi habis, jadi milik set (cara_perolehan).
  -- Itu yang memisahkan keduanya kembali di bawah — BUKAN `gol IS NULL`, yang
  -- tak bisa membedakan "diagregasi" dari "kode-nya memang NULL".
  --
  -- `src` dipisah semata-mata supaya qual-nya ditulis SEKALI; dirujuk sekali →
  -- di-inline planner, tak ada biaya materialisasi.
  WITH src AS (
    SELECT golongan AS gol, cara_perolehan, nilai_perolehan
    FROM aset
    WHERE status = 'aktif'
      AND (v_is_admin OR skpd_id = ANY(v_scope) OR id = ANY(v_pernah))
  ), agg AS (
    SELECT gol, cara_perolehan, GROUPING(gol) AS g_gol,
           count(*)::bigint AS count,
           COALESCE(sum(nilai_perolehan), 0) AS nilai
    FROM src
    GROUP BY GROUPING SETS ((gol), (cara_perolehan))
  )
  SELECT json_build_object(
    'gol', COALESCE((
      SELECT json_agg(json_build_object('golongan', gol, 'count', count, 'nilai', nilai))
      FROM agg WHERE g_gol = 0), '[]'::json),
    'cara', COALESCE((
      SELECT json_agg(json_build_object('cara_perolehan', cara_perolehan, 'count', count, 'nilai', nilai))
      FROM agg WHERE g_gol = 1), '[]'::json)
  ) INTO v_result;

  RETURN v_result;
END;
$function$;

-- ── 3. Autovacuum: mencabut sebab "kadang muncul kadang tidak" ─────────────
-- ⚠️ `autovacuum_vacuum_insert_scale_factor` yang PALING menentukan di sini,
-- dan justru itu yang paling sering terlewat: tabel-tabel ini nyaris tak
-- pernah di-UPDATE/DELETE (ledger append-only, register hampir selalu INSERT),
-- jadi ambang vacuum berbasis *dead tuple* nyaris tak pernah tersentuh —
-- buktinya `last_autovacuum` 2026-07-29 sementara 53.609 baris sudah masuk
-- sejak VACUUM terakhir. Yang menyegarkan visibility map cuma ambang INSERT.
--
-- 2% dari 471rb ≈ 9,4rb baris. Satu VACUUM atas tabel 276 MB itu hitungan
-- detik — jauh lebih murah daripada satu halaman Lapis 1 yang timeout.
DO $$
BEGIN
  IF current_setting('server_version_num')::int >= 130000 THEN
    EXECUTE 'ALTER TABLE aset            SET (autovacuum_vacuum_insert_scale_factor = 0.02)';
    EXECUTE 'ALTER TABLE transaksi_bmd   SET (autovacuum_vacuum_insert_scale_factor = 0.02)';
    EXECUTE 'ALTER TABLE aset_awal_2026  SET (autovacuum_vacuum_insert_scale_factor = 0.02)';
  ELSE
    RAISE NOTICE 'server_version < 13 — autovacuum_vacuum_insert_scale_factor dilewati.';
  END IF;
END $$;

ALTER TABLE aset            SET (autovacuum_analyze_scale_factor = 0.01,
                                 autovacuum_vacuum_scale_factor  = 0.05);
ALTER TABLE transaksi_bmd   SET (autovacuum_analyze_scale_factor = 0.01,
                                 autovacuum_vacuum_scale_factor  = 0.05);
ALTER TABLE aset_awal_2026  SET (autovacuum_analyze_scale_factor = 0.01,
                                 autovacuum_vacuum_scale_factor  = 0.05);

-- Statistik planner untuk index yang baru dibuat. ANALYZE boleh di dalam
-- transaksi; VACUUM TIDAK — lihat langkah terpisah di bawah.
ANALYZE aset;

-- ============================================================================
-- LANGKAH 2 — WAJIB, JALANKAN TERPISAH (tab SQL Editor BARU, hanya baris ini)
--
--   VACUUM (ANALYZE) aset;
--
-- **Ini bagian terpenting dari seluruh perbaikan.** Index di atas memangkas
-- 7.326 → 3.516 ms; yang menghabisi sisa 56.493 heap fetches per lintasan cuma
-- baris ini. Tanpanya indexnya tetap terbentuk tapi Postgres masih mengintip
-- heap tiap baris, dan gejala "kadang timeout" bisa kembali.
-- ⚠️ TIDAK BOLEH digabung ke berkas di atas: `VACUUM cannot run inside a
-- transaction block` (25001) akan me-ROLLBACK SELURUH migrasi ini.
--
-- Sekalian, masing-masing baris sendiri:
--   VACUUM (ANALYZE) transaksi_bmd;
--   VACUUM (ANALYZE) aset_awal_2026;
--
-- ⚠️ ATURAN BARU: **setiap migrasi import massal ditutup `VACUUM (ANALYZE)`
-- atas tabel yang diisinya.** 20260904_02 & 20260905_06 tidak melakukannya,
-- dan itulah yang membuat Dashboard mulai timeout muncul-hilang beberapa hari
-- sesudahnya.
-- ============================================================================

-- ============================================================================
-- VERIFIKASI (WAJIB dengan RLS aktif — rules.md §4.3; sebagai service_role,
-- query yang rusak pun tetap terlihat sehat)
--
--   -- (a) ANGKANYA TIDAK BOLEH BERGESER. Jalankan SEBELUM & SESUDAH migrasi
--   --     sebagai user yang sama, lalu bandingkan. Ini pemeriksaan terpenting.
--   BEGIN;
--   SET LOCAL role authenticated;
--   SET LOCAL request.jwt.claims = '{"sub":"d6e5ea72-e34d-4be5-9bda-da4ffada3dfd","role":"authenticated"}';
--   SELECT fn_dashboard_rekap();
--   ROLLBACK;
--
--   -- (b) rencana query — yang dicari: SATU "Index Only Scan using
--   --     idx_aset_dashboard_rekap" (dulu DUA scan) + "Heap Fetches" yang
--   --     kecil sesudah VACUUM.
--   EXPLAIN (ANALYZE, BUFFERS) SELECT fn_dashboard_rekap();
--
--   -- (c) ULANGI sebagai PENGURUS BARANG SKPD TERBESAR (rules.md §4.5) —
--   --     Dinas Pendidikan, uid 306a752a-34e5-4c18-8d26-66237325d002.
--   --     Cabang non-admin (dulu 434 ms) TIDAK BOLEH mundur.
--
--   -- (d) setelan autovacuum menempel:
--   SELECT relname, reloptions FROM pg_class
--    WHERE relname IN ('aset','transaksi_bmd','aset_awal_2026');
--
--   -- (e) work_mem TIDAK hilang oleh CREATE OR REPLACE:
--   SELECT proname, proconfig FROM pg_proc WHERE proname='fn_dashboard_rekap';
--   -- HARUS memuat search_path=public DAN work_mem=64MB.
--
-- Jalankan dua kali — run pertama sesudah index dibuat selalu terlihat lambat
-- karena indexnya masih dingin.
-- ============================================================================

-- ── UTANG YANG DISENGAJA: `idx_aset_skpd_rekap` (47 MB) ────────────────────
-- Index itu dibuat 20260810_02 KHUSUS untuk fn_dashboard_rekap, dan statistik
-- pemakaiannya mendukung itu: 836 pemindaian / 307 juta tuple dibaca — rasio
-- ±367rb tuple per pemindaian, yaitu sapuan PENUH, bukan pencarian terarah.
-- Sesudah migrasi ini ia mestinya tak terpakai lagi.
-- **Sengaja TIDAK di-drop di sini**: satu perubahan satu kali, dan selama ia
-- ada, rencana lama tetap jadi jaring pengaman kalau index baru meleset.
-- Cara memutuskannya nanti — catat `idx_scan` kedua index hari ini, tunggu
-- sepekan pemakaian normal, lalu bandingkan:
--   SELECT indexrelname, idx_scan FROM pg_stat_user_indexes
--    WHERE relname='aset' AND indexrelname IN
--          ('idx_aset_skpd_rekap','idx_aset_dashboard_rekap');
-- Kalau `idx_aset_skpd_rekap` benar-benar berhenti bertambah, baru drop.
