-- Fase 4 — Laporan BMD. TIGA hal sekaligus, dan yang PERTAMA bukan optimasi:
-- ia memperbaiki laporan yang SEDANG RUSAK.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- (1) fn_rekap_bmd TIMEOUT untuk SKPD terbesar — Laporan BMD gagal, bukan lambat
-- ═══════════════════════════════════════════════════════════════════════════
-- Diukur 2026-08-18 sbg pengurus Dinas Pendidikan (707 unit, 295.141 aset),
-- RLS aktif, `fn_rekap_bmd('2026-S1', <scope>, 'intra')`:
--
--   work_mem bawaan (4MB) ...... 9.144 ms  → DI ATAS statement timeout 8 dtk
--   work_mem 64MB .............. 5.358 ms
--
-- Dengan pagu 8 dtk, panggilan itu ditolak `57014 canceling statement due to
-- statement timeout` — diverifikasi langsung, bukan disimpulkan dari angka.
-- Artinya **Laporan BMD Model 1 & 2 tidak bisa dibuka sama sekali** oleh
-- pengurus Dinas Pendidikan, dan Model 3 lebih parah lagi karena ia memanggil
-- fungsi yang sama DUA KALI (saldo awal & saldo akhir).
--
-- Fungsinya tak pernah punya `SET work_mem` padahal komentarnya sendiri sudah
-- menyebut kekhawatiran hash tumpah. Ditambahkan sekarang, berikut
-- `statement_timeout` untuk kelonggaran — pola yang sama dengan
-- `fn_penyusutan_rekap` (20260818_01) & `fn_rekon_pos` (20260818_04).
-- ⚠️ Keduanya berlaku HANYA di dalam fungsi ini, bukan untuk basis data.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- (2) Kembar TIGA visibilitas dijadikan DUA
-- ═══════════════════════════════════════════════════════════════════════════
-- CLAUDE.md mencatat daftar SEMBUNYI/MUNCUL/LAHIR hidup di `fn_rekap_bmd`,
-- `lib/visibilitas.ts`, dan varian Daftar Barang — "ubah satu, ubah semua",
-- dijaga hanya oleh komentar. CTE `vis`/`lahir_setelah`/`hidden` di sini
-- diganti panggilan ke `fn_dbar_hidden(p_periode, 'penyusutan')`, yang daftarnya
-- SUDAH kembar dengan modul TS-nya dan sudah dikunci `lib/visibilitas.test.ts`.
--
-- ⚠️ Varian yang benar 'penyusutan', BUKAN 'daftar_barang': daftar `v_sembunyi`
-- di fungsi ini memang TIDAK memuat `kdp_selesai_keluar`. Memakai varian yang
-- salah akan menyembunyikan aset KDP dari Laporan BMD tanpa satu pun error.
--
-- ✅ DIVERIFIKASI SETARA SEBELUM DIGANTI (2026-08-18, periode 2026-S1):
--      inline 227 baris · fn_dbar_hidden 227 baris · selisih 0 di KEDUA arah
--    dan untuk pemilik-pada-periode:
--      inline  57 baris · fn_dbar_owner  57 baris · selisih 0 di KEDUA arah
--    Jadi angka Laporan BMD dijamin tidak bergeser oleh penggantian ini.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- (3) `kode_at` — kembaran yang BARU SAJA saya tambah, langsung disatukan
-- ═══════════════════════════════════════════════════════════════════════════
-- Migrasi 20260818_04 menyalin CTE `kode_at` dari sini ke `fn_rekon_pos`, jadi
-- aturan "kode barang pada periode" mendadak hidup di TIGA tempat (dua SQL +
-- `kodeAt` di lib/reklasKode.ts). Utang itu dilunasi di migrasi yang sama
-- dengan yang melahirkannya: diekstrak jadi `fn_dbar_kode_at`, dipakai
-- fn_rekap_bmd DAN fn_rekon_pos. Sisa kembarnya tinggal SQL ↔ TS.

-- ═══════════════════════════════════════════════════════════════════════════
-- fn_dbar_kode_at — kode barang efektif pada sebuah periode
-- ═══════════════════════════════════════════════════════════════════════════
-- Cara bacanya KEMBAR dengan `fn_dbar_owner` dan dengan `kodePada()` di
-- lib/reklasKode.ts: ambil baris reklas TERAKHIR yang periodenya <= periode;
-- kalau semua reklasnya justru terjadi SESUDAH itu, pakai `kode_lama` baris
-- paling awal (kode semula). Tak pernah direklas → tak muncul di hasil, dan
-- pemanggil jatuh ke `aset.kode`.
--
-- ⚠️ `target_trx_id` TUNGGAL di sini; `batal_pengalihan` yang jamak
-- (`target_trx_ids`) — jangan tertukar. Penjaga regex supaya payload warisan
-- yang rusak tidak meledakkan cast.
--
-- ⚠️ Hanya mengembalikan aset yang PERNAH direklas (31 baris per 2026-08-18),
-- jadi biayanya ikut jumlah reklas, bukan besar tabel — dilayani index parsial
-- `idx_trx_reklas_id`.
CREATE OR REPLACE FUNCTION fn_dbar_kode_at(p_periode text)
RETURNS TABLE(aset_id uuid, kode_eff text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH batal_reklas AS (
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
    WHERE t.jenis = ANY(ARRAY['reklas_kode','reklas_golongan']::jenis_transaksi_bmd[])
      AND t.payload->>'kode_baru' IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM batal_reklas b WHERE b.trx_id = t.id)
  )
  SELECT r.aset_id,
    COALESCE(
      (array_agg(r.kode_baru ORDER BY r.periode DESC, r.id DESC)
         FILTER (WHERE r.periode <= p_periode))[1],
      (array_agg(r.kode_lama ORDER BY r.periode ASC, r.id ASC))[1]
    ) AS kode_eff
  FROM reklas r GROUP BY r.aset_id;
$function$;

-- ═══════════════════════════════════════════════════════════════════════════
-- fn_rekon_pos — sama persis dengan 20260818_04, `kode_at` inline diganti
-- panggilan ke fn_dbar_kode_at. Nol perubahan perilaku.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION fn_rekon_pos(
  p_periode  text,
  p_skpd_ids bigint[] DEFAULT NULL,
  p_aset_ids uuid[]   DEFAULT NULL
)
RETURNS TABLE(
  aset_id uuid, golongan text, komptabel text,
  perolehan numeric, beban numeric, akumulasi numeric, nilai_buku numeric
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
SET work_mem TO '64MB'
SET statement_timeout TO '60s'
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
  WITH hid AS MATERIALIZED (
    SELECT h.aset_id FROM fn_dbar_hidden(p_periode, 'penyusutan') h
  ),
  kode_at AS MATERIALIZED (
    SELECT k.aset_id, k.kode_eff FROM fn_dbar_kode_at(p_periode) k
  ),
  cand AS (
    SELECT a.id, a.nilai_perolehan,
           CASE WHEN a.intra_ekstra = 'ekstra' THEN 'ekstra' ELSE 'intra' END AS komp,
           split_part(COALESCE(ka.kode_eff, a.kode),'.',1)||'.'||
           split_part(COALESCE(ka.kode_eff, a.kode),'.',2)||'.'||
           split_part(COALESCE(ka.kode_eff, a.kode),'.',3) AS gol
    FROM aset a
    LEFT JOIN kode_at ka ON ka.aset_id = a.id
    WHERE a.status <> 'draft'
      AND (p_aset_ids IS NULL OR a.id = ANY(p_aset_ids))
      AND NOT EXISTS (SELECT 1 FROM hid h WHERE h.aset_id = a.id)
      AND (a.tgl_perolehan IS NULL OR a.tgl_perolehan <= v_akhir)
      AND (v_lihat_semua OR a.skpd_id = ANY(v_scope) OR a.id = ANY(v_pernah))
      AND (p_skpd_ids IS NULL OR cardinality(p_skpd_ids) = 0
           OR (a.skpd_id = ANY(p_skpd_ids) AND NOT (a.id = ANY(v_ovr_all)))
           OR a.id = ANY(v_ovr_in))
  ),
  pos AS (
    SELECT c.id, c.gol, c.komp,
           c.gol IN ('1.3.2','1.3.3','1.3.4','1.5.3','1.5.4') AS susut,
           ps.aset_id IS NOT NULL AS eng,
           ps.nilai_perolehan AS p_nilai, ps.beban AS p_beban,
           ps.akumulasi AS p_akum, ps.nilai_buku_akhir AS p_nb,
           c.nilai_perolehan AS reg_nilai,
           bn.nilai AS bl_nilai,
           bp.aset_id IS NOT NULL AS ada_bp, bp.akum AS bl_akum, bp.nbawal AS bl_nb
    FROM cand c
    LEFT JOIN penyusutan_semester ps ON ps.aset_id = c.id AND ps.periode = p_periode
    LEFT JOIN LATERAL (
      SELECT t.nilai FROM transaksi_bmd t
      WHERE t.jenis IN ('saldo_awal','saldo_awal_checkpoint')
        AND t.aset_id = c.id AND t.periode <= p_periode
        AND ps.aset_id IS NULL
      ORDER BY t.aset_id, t.periode DESC, t.id DESC LIMIT 1
    ) bn ON true
    LEFT JOIN LATERAL (
      SELECT t.aset_id,
        CASE WHEN t.payload->>'akumulasi_2025'  ~ '^-?[0-9.]+$'
             THEN (t.payload->>'akumulasi_2025')::numeric  ELSE 0 END AS akum,
        CASE WHEN t.payload->>'nilai_buku_awal' ~ '^-?[0-9.]+$'
             THEN (t.payload->>'nilai_buku_awal')::numeric ELSE 0 END AS nbawal
      FROM transaksi_bmd t
      WHERE t.jenis IN ('saldo_awal','saldo_awal_checkpoint')
        AND t.aset_id = c.id AND t.periode <= p_periode
        AND ps.aset_id IS NULL
        AND c.gol IN ('1.3.2','1.3.3','1.3.4','1.5.3','1.5.4')
      ORDER BY t.aset_id, t.periode DESC, t.id DESC LIMIT 1
    ) bp ON true
  )
  SELECT
    p.id, p.gol, p.komp,
    CASE WHEN p.eng THEN p.p_nilai ELSE COALESCE(p.bl_nilai, p.reg_nilai, 0) END,
    CASE WHEN p.eng AND p.susut THEN p.p_beban ELSE 0 END,
    CASE WHEN p.eng THEN (CASE WHEN p.susut THEN p.p_akum ELSE 0 END)
         WHEN p.susut AND p.ada_bp THEN p.bl_akum ELSE 0 END,
    CASE WHEN p.eng THEN (CASE WHEN p.susut THEN p.p_nb ELSE p.p_nilai END)
         WHEN p.susut AND p.ada_bp THEN
           (CASE WHEN p.bl_nb <> 0 THEN p.bl_nb
                 ELSE COALESCE(p.bl_nilai, p.reg_nilai, 0) - p.bl_akum END)
         ELSE COALESCE(p.bl_nilai, p.reg_nilai, 0) END
  FROM pos p;
END;
$function$;

-- ═══════════════════════════════════════════════════════════════════════════
-- fn_rekap_bmd — SET work_mem/statement_timeout + tiga CTE diganti fungsi
-- bersama. Selebihnya SAMA PERSIS dengan versi 20260811_02.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION fn_rekap_bmd(
  p_periode text,
  p_skpd_ids bigint[] DEFAULT NULL::bigint[],
  p_komptabel text DEFAULT NULL::text
)
RETURNS TABLE(
  skpd_id bigint, golongan text, kuantitas bigint, perolehan numeric,
  akumulasi numeric, beban numeric, nilai_buku_akhir numeric, count_peny bigint
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
SET work_mem TO '64MB'
SET statement_timeout TO '60s'
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
  -- BISA DITAKSIR planner. Kesetaraan diverifikasi 2026-08-10 atas 418.160
  -- baris untuk S1 maupun S2: 0 beda.
  v_batas_tgl date := (left(p_periode,4) || CASE WHEN right(p_periode,1) = '1' THEN '-06-30' ELSE '-12-31' END)::date;
BEGIN
  RETURN QUERY
  WITH RECURSIVE root_of AS (
    SELECT id, id AS root_id FROM admin_skpd WHERE parent_id IS NULL
    UNION ALL
    SELECT s.id, r.root_id FROM admin_skpd s JOIN root_of r ON s.parent_id = r.id
  ),
  -- ⚠️ Ketiganya dulu CTE inline di sini. Diganti fungsi bersama sesudah
  -- dibuktikan SETARA (lihat kepala berkas): hidden 227=227, owner 57=57,
  -- selisih 0 di kedua arah. Varian 'penyusutan' — TANPA `kdp_selesai_keluar`.
  hid AS MATERIALIZED (
    SELECT h.aset_id FROM fn_dbar_hidden(p_periode, 'penyusutan') h
  ),
  owner_at AS MATERIALIZED (
    SELECT o.aset_id, o.owner_skpd FROM fn_dbar_owner(p_periode) o
  ),
  kode_at AS MATERIALIZED (
    SELECT k.aset_id, k.kode_eff FROM fn_dbar_kode_at(p_periode) k
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
      -- Satu NOT EXISTS, bukan dua: fn_dbar_hidden sudah menggabungkan
      -- "sedang tersembunyi" dengan "belum lahir".
      AND NOT EXISTS (SELECT 1 FROM hid h WHERE h.aset_id = a.id)
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

GRANT EXECUTE ON FUNCTION fn_dbar_kode_at(text) TO authenticated;
