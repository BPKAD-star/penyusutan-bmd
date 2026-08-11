-- `fn_rekap_bmd` — GOLONGAN ikut posisi pada periode, bukan posisi TERKINI.
--
-- Lanjutan langsung migrasi 20260805_02, yang sudah membuat visibilitas,
-- kepemilikan SKPD, dan kelahiran barang period-correct — tapi MELEWATKAN satu
-- dimensi lagi: golongannya sendiri. Baris pengelompokan masih
-- `split_part(a.kode,'.',1..3)` atas `aset.kode` TERKINI, jadi barang yang
-- direklasifikasi sudah duduk di golongan BARU bahkan saat kita membuka periode
-- SEBELUM reklasnya. Ini pelanggaran aturan lintas-fitur "PERISTIWA BERLAKU
-- SEJAK PERIODENYA, TIDAK SURUT" (CLAUDE.md), persis sebentuk dengan cacat
-- `skpd_id` terkini yang sudah ditutup 20260805_02.
--
-- ── Akibatnya: Laporan BMD Model 3 TIDAK FOOT ───────────────────────────────
-- Model 3 (mutasi) menaruh reklas sebagai perpindahan antar golongan: baris
-- "Reklasifikasi Keluar" di golongan asal, "Reklasifikasi Masuk" di golongan
-- tujuan. Itu benar — TAPI hanya kalau Saldo Awal masih menaruh barangnya di
-- golongan ASAL. Karena Saldo Awal ikut kode terkini, barang itu terhitung di
-- golongan tujuan DUA KALI (sudah di saldo awal, lalu ditambah lagi oleh baris
-- "Reklasifikasi Masuk") dan HILANG dari golongan asal yang malah dikurangi.
--
-- Terukur pada data hidup (2026, intra, se-pemda), satu-satunya reklas yang
-- melintasi golongan:
--   SIRKUIT DRAG RACE DI KAWASAN G. KELUD
--   1.3.3.01.01.32.002 → 1.3.4.01.01.09.011   Rp 5.846.579.000  (2026-S2)
-- → Model 3 meleset +5.846.579.000 di 1.3.3 dan −5.846.579.000 di 1.3.4.
--
-- 30 baris `reklas_kode` lain semuanya berpindah di dalam 1.5.4 (level 3 tidak
-- berubah), jadi tak berpengaruh pada laporan per golongan. Keduanya tetap
-- diikutkan di sini: yang menentukan bukan NAMA jenisnya, melainkan apakah
-- kodenya berubah.
--
-- ── Cara bacanya: KEMBAR dengan `owner_at` ──────────────────────────────────
-- Kode pada periode P = `payload.kode_baru` dari baris reklas TERAKHIR
-- ber-periode <= P. Kalau semua reklasnya terjadi SESUDAH P, dipakai
-- `payload.kode_lama` baris PALING AWAL — kode semula. Kalau barangnya tak
-- pernah direklas sama sekali, jatuh ke `aset.kode`. Baris yang dianulir
-- `batal_reklas` (payload.target_trx_id, TUNGGAL — beda dari `batal_pengalihan`
-- yang jamak) dibuang lebih dulu.
--
-- Pola ini sama persis dengan cara `aset_kode_register` dibaca (CLAUDE.md
-- "Kode Register") dan dengan `ownersAt` (lib/pengalihan.ts). Sengaja: tiga
-- dimensi yang sama-sama "ikut posisi terakhir" tak boleh punya tiga cara baca
-- yang berbeda.
--
-- ── Dampak yang DISENGAJA di luar Model 3 ──────────────────────────────────
-- Model 1 & 2 memakai RPC yang sama, jadi keduanya ikut berubah untuk periode
-- LAMPAU: membuka 2026-S1 kini menaruh SIRKUIT DRAG RACE di 1.3.3 (posisinya
-- saat itu), bukan 1.3.4. Itu justru perbaikan — dan konsisten dengan Daftar
-- Barang. Periode 2026-S2 (dan sesudahnya) TIDAK berubah sama sekali, karena
-- di sana reklasnya memang sudah terjadi.
--
-- ⚠️ MASIH TERSISA, sengaja tidak dikerjakan di sini: `p_komptabel` menyaring
-- `a.intra_ekstra` TERKINI. `reklas_komptabel` menggeser kolom intra/ekstra
-- dengan cara yang sama persis, jadi cacatnya sebentuk. Belum diperbaiki karena
-- (a) tabelnya masih NOL baris `reklas_komptabel` per 2026-08-11, dan (b) Model
-- 3 belum punya baris mutasi antar-kolom komptabel — memperbaiki separuhnya
-- justru akan membuatnya tidak foot. Kalau nanti `reklas_komptabel` dipakai,
-- KEDUANYA harus dikerjakan bersamaan.

CREATE OR REPLACE FUNCTION public.fn_rekap_bmd(
  p_periode text, p_skpd_ids bigint[] DEFAULT NULL::bigint[], p_komptabel text DEFAULT NULL::text)
 RETURNS TABLE(skpd_id bigint, golongan text, kuantitas bigint, perolehan numeric,
               akumulasi numeric, beban numeric, nilai_buku_akhir numeric, count_peny bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_is_admin boolean := fn_is_admin();
  -- Scope SKPD & aset-pernah-dikelola dihitung SEKALI (rules.md §4.1). Pola &
  -- jebakannya sama persis dengan fn_dashboard_rekap — lihat migrasi
  -- 20260810_02 untuk penjelasan viewer & COALESCE.
  v_scope bigint[] := CASE WHEN fn_is_viewer() THEN ARRAY[]::bigint[]
                           ELSE COALESCE(fn_my_skpd_scope(), ARRAY[]::bigint[]) END;
  v_pernah uuid[] := CASE WHEN v_is_admin THEN ARRAY[]::uuid[] ELSE (
      SELECT COALESCE(array_agg(DISTINCT t.aset_id), ARRAY[]::uuid[])
      FROM transaksi_bmd t
      WHERE t.jenis = 'pengalihan_status'
        AND (t.skpd_asal = ANY(v_scope) OR t.skpd_tujuan = ANY(v_scope))
    ) END;
  -- Batas tanggal setara `fn_periode_dari_tanggal(tgl) <= p_periode`, tapi
  -- BISA DITAKSIR planner. Yang lama memakai pemanggilan fungsi, dan planner
  -- selalu menebak 33% → estimasi 139rb padahal nyatanya 418rb → hash
  -- kekecilan → tumpah ke disk (16 batch). Kesetaraan diverifikasi 2026-08-10
  -- atas 418.160 baris untuk S1 maupun S2: 0 beda.
  v_batas_tgl date := (left(p_periode,4) || CASE WHEN right(p_periode,1) = '1' THEN '-06-30' ELSE '-12-31' END)::date;
  v_pindah   jenis_transaksi_bmd[] := ARRAY['pengalihan_status','mutasi_internal']::jenis_transaksi_bmd[];
  -- Dua-duanya menyalin `payload.kode_baru` ke `aset.kode` (lib/transaksi.ts
  -- `patchAsetDari`) — bedanya cuma di engine (fresh-start vs retroaktif), yang
  -- tak ada urusannya dengan pengelompokan laporan.
  v_reklas   jenis_transaksi_bmd[] := ARRAY['reklas_kode','reklas_golongan']::jenis_transaksi_bmd[];
  v_sembunyi jenis_transaksi_bmd[] := ARRAY['kapitalisasi_serap','penghapusan_pemindahtanganan',
    'penghapusan_sebab_lain','batal_pengadaan','koreksi_pencatatan_ganda','batal_hibah_masuk',
    'batal_tukar_menukar','batal_hasil_inventarisasi','batal_perolehan_lainnya',
    'pemecahan_keluar','batal_pemecahan_masuk']::jenis_transaksi_bmd[];
  v_muncul   jenis_transaksi_bmd[] := ARRAY['batal_kapitalisasi','batal_penghapusan',
    'batal_pemecahan','batal_koreksi_pencatatan_ganda']::jenis_transaksi_bmd[];
  v_lahir    jenis_transaksi_bmd[] := ARRAY['pemecahan_masuk','kdp_selesai_masuk']::jenis_transaksi_bmd[];
BEGIN
  RETURN QUERY
  WITH RECURSIVE root_of AS (
    SELECT id, id AS root_id FROM admin_skpd WHERE parent_id IS NULL
    UNION ALL
    SELECT s.id, r.root_id FROM admin_skpd s JOIN root_of r ON s.parent_id = r.id
  ),
  batal_pindah AS (
    SELECT DISTINCT (jsonb_array_elements_text(t.payload->'target_trx_ids'))::bigint AS trx_id
    FROM transaksi_bmd t
    WHERE t.jenis = 'batal_pengalihan'::jenis_transaksi_bmd
      AND jsonb_typeof(t.payload->'target_trx_ids') = 'array'
  ),
  pindah AS (
    SELECT t.aset_id, t.periode, t.id, t.skpd_asal, t.skpd_tujuan
    FROM transaksi_bmd t
    WHERE t.jenis = ANY(v_pindah)
      AND NOT EXISTS (SELECT 1 FROM batal_pindah b WHERE b.trx_id = t.id)
  ),
  owner_at AS (
    SELECT p.aset_id,
      COALESCE(
        (array_agg(p.skpd_tujuan ORDER BY p.periode DESC, p.id DESC)
           FILTER (WHERE p.periode <= p_periode))[1],
        (array_agg(p.skpd_asal ORDER BY p.periode ASC, p.id ASC))[1]
      ) AS owner_skpd
    FROM pindah p GROUP BY p.aset_id
  ),
  -- ── Kode pada periode (kembar dgn owner_at di atas) ───────────────────────
  -- `target_trx_id` TUNGGAL di sini; `batal_pengalihan` yang jamak
  -- (`target_trx_ids`) — jangan tertukar. Penjaga regex supaya payload lama /
  -- rusak tidak meledakkan cast.
  batal_reklas AS (
    SELECT DISTINCT (t.payload->>'target_trx_id')::bigint AS trx_id
    FROM transaksi_bmd t
    WHERE t.jenis = 'batal_reklas'::jenis_transaksi_bmd
      AND t.payload->>'target_trx_id' ~ '^[0-9]+$'
  ),
  reklas AS (
    SELECT t.aset_id, t.periode, t.id,
           t.payload->>'kode_lama' AS kode_lama,
           t.payload->>'kode_baru' AS kode_baru
    FROM transaksi_bmd t
    WHERE t.jenis = ANY(v_reklas)
      AND t.payload->>'kode_baru' IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM batal_reklas b WHERE b.trx_id = t.id)
  ),
  kode_at AS (
    SELECT r.aset_id,
      COALESCE(
        (array_agg(r.kode_baru ORDER BY r.periode DESC, r.id DESC)
           FILTER (WHERE r.periode <= p_periode))[1],
        (array_agg(r.kode_lama ORDER BY r.periode ASC, r.id ASC))[1]
      ) AS kode_eff
    FROM reklas r GROUP BY r.aset_id
  ),
  vis AS (
    SELECT t.aset_id, t.jenis, t.periode, t.id
    FROM transaksi_bmd t
    WHERE t.jenis = ANY(v_sembunyi || v_muncul || v_lahir)
  ),
  lahir_setelah AS (
    SELECT v.aset_id FROM vis v
    WHERE v.jenis = ANY(v_lahir)
    GROUP BY v.aset_id
    HAVING min(v.periode) > p_periode
  ),
  hidden AS (
    SELECT x.aset_id FROM (
      SELECT DISTINCT ON (v.aset_id) v.aset_id, v.jenis
      FROM vis v
      WHERE v.periode <= p_periode AND v.jenis <> ALL(v_lahir)
      ORDER BY v.aset_id, v.periode DESC, v.id DESC
    ) x
    WHERE x.jenis = ANY(v_sembunyi)
  ),
  cand AS (
    -- `kode_eff` masih bisa NULL kalau baris reklas paling awal tak menyimpan
    -- `kode_lama` (payload warisan) — COALESCE terakhir ke `a.kode` supaya
    -- barangnya tetap masuk golongan yang masuk akal, bukan hilang ke '..'.
    SELECT a.id, COALESCE(ka.kode_eff, a.kode) AS kode, a.nilai_perolehan,
           COALESCE(oa.owner_skpd, a.skpd_id) AS eff_owner
    FROM aset a
    LEFT JOIN owner_at oa ON oa.aset_id = a.id
    LEFT JOIN kode_at  ka ON ka.aset_id = a.id
    WHERE a.status <> 'draft'
      AND (p_komptabel IS NULL OR p_komptabel = '' OR a.intra_ekstra = p_komptabel)
      AND (a.tgl_perolehan IS NULL OR a.tgl_perolehan <= v_batas_tgl)
      AND NOT EXISTS (SELECT 1 FROM hidden h        WHERE h.aset_id = a.id)
      AND NOT EXISTS (SELECT 1 FROM lahir_setelah l WHERE l.aset_id = a.id)
      AND (v_is_admin OR a.skpd_id = ANY(v_scope) OR a.id = ANY(v_pernah))
  )
  SELECT
    COALESCE(ro.root_id, c.eff_owner),
    split_part(c.kode,'.',1)||'.'||split_part(c.kode,'.',2)||'.'||split_part(c.kode,'.',3),
    count(*)::bigint,
    COALESCE(sum(COALESCE(ps.nilai_perolehan, c.nilai_perolehan)), 0),
    COALESCE(sum(ps.akumulasi), 0),
    COALESCE(sum(ps.beban), 0),
    COALESCE(sum(ps.nilai_buku_akhir), 0),
    count(ps.aset_id)::bigint
  FROM cand c
  LEFT JOIN penyusutan_semester ps ON ps.aset_id = c.id AND ps.periode = p_periode
  LEFT JOIN root_of ro ON ro.id = c.eff_owner
  WHERE (p_skpd_ids IS NULL OR c.eff_owner = ANY(p_skpd_ids))
  GROUP BY 1, 2;
END;
$function$;

-- ── Index parsial untuk kolektor sisi aplikasi ─────────────────────────────
-- `lib/reklasKode.ts` menyapu riwayat reklas TANPA bisa discope ke daftar aset
-- (sama seperti `fetchPindahEvents`: baris SESUDAH periode yang dilihat justru
-- yang dibutuhkan). Tanpa index ini ia masuk persis ke jebakan yang sudah tiga
-- kali memakan korban di repo ini: qual enum `jenis` TAK BISA jadi index-cond
-- di bawah RLS (`enum_eq` tidak leakproof), jadi yang tersisa untuk planner cuma
-- `id > N ORDER BY id LIMIT 1000` → menyusuri PRIMARY KEY sambil menyaring
-- 418rb baris yang 99,9%-nya `saldo_awal`, dan LIMIT-nya tak pernah terpenuhi.
--
-- Partial index memindahkan predikat jenis KE DALAM index, jadi biayanya ikut
-- jumlah REKLAS (31 baris per 2026-08-11), bukan besar ledger. Pola & alasan
-- identik dgn `idx_trx_pindah_id` (migrasi 20260729_01).
--
-- ⚠️ Predikat ini KEMBAR dengan daftar jenis di `lib/reklasKode.ts`. Beda
-- sedikit saja, planner tak bisa membuktikan implikasinya & index ini
-- diabaikan DIAM-DIAM — tak ada yang gagal, cuma pelan lalu timeout.
-- ⚠️ PLAIN, bukan CONCURRENTLY: SQL Editor membungkus skrip dalam satu
-- transaksi, dan CONCURRENTLY di dalam transaksi gagal SENYAP.
CREATE INDEX IF NOT EXISTS idx_trx_reklas_id
  ON transaksi_bmd (id)
  WHERE jenis IN ('reklas_kode', 'reklas_golongan', 'batal_reklas');

-- Statistik saja; TIDAK ada VACUUM di sini — SQL Editor membungkus skrip dalam
-- satu transaksi dan VACUUM akan gagal keras (25001) lalu menyeret seluruh
-- migrasi ini ikut batal. Lihat docs/runbook-migrasi.md.
ANALYZE transaksi_bmd;
