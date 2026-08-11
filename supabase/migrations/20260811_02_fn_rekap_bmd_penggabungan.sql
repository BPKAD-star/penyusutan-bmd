-- `fn_rekap_bmd` — kenali Penggabungan Barang di replay visibilitasnya.
--
-- Lanjutan langsung 20260811_01_fn_rekap_bmd_golongan_period_aware.sql; badan
-- fungsinya SAMA PERSIS kecuali dua baris daftar jenis:
--   v_sembunyi += 'penggabungan_keluar'
--   v_muncul   += 'batal_penggabungan'
-- (v_lahir SENGAJA tidak berubah — lihat di bawah.)
--
-- ⚠️ TANPA MIGRASI INI LAPORAN BMD MENGHITUNG DOBEL, dan tanpa satu pun pesan.
-- Penggabungan menaikkan `aset.nilai_perolehan` induk jadi jumlah seluruh
-- anggota sekaligus menyembunyikan barang sumbernya. Kalau replay di sini tak
-- tahu `penggabungan_keluar`, sumbernya tetap ikut terhitung: untuk kasus yang
-- melahirkan fitur ini ("Pagar Besi" UPTD SMPN 2 Mojo, 35 baris × Rp721.500),
-- golongan 1.3.2 SKPD itu akan melaporkan Rp25.252.500 + 34 × Rp721.500 =
-- Rp49.783.500 — hampir dua kali lipat. Rekonsiliasi BMD (yang memakai
-- lib/visibilitas.ts) sudah benar, jadi gejalanya adalah dua laporan Lapis 1
-- yang tak lagi sepakat.
--
-- ⚠️ `penggabungan_masuk` TIDAK didaftarkan di v_lahir. Ini bukan kelalaian:
-- hasil gabungan ADALAH induknya sendiri (aset & NIBAR yang sudah ada,
-- keputusan user 2026-08-11), bukan aset baru seperti pecahan Pemecahan.
-- Mendaftarkannya justru akan MENGHILANGKAN barang yang sah dari periode
-- sebelum penggabungan — kebalikan persis dari insiden 2026-08-05 yang
-- melahirkan daftar `LAHIR` itu.
--
-- ⚠️ KEMBAR TIGA (rules.md §5.5): daftar di sini ↔ `SEMBUNYI_PENYUSUTAN`/
-- `MUNCUL`/`LAHIR` di lib/visibilitas.ts ↔ dan (untuk Daftar Barang) varian
-- `SEMBUNYI_DAFTAR_BARANG`. Ubah satu, ubah semuanya. Kalau ketiganya berbeda,
-- TIDAK ADA yang gagal — Saldo Akhir Laporan BMD & Rekonsiliasi cuma berhenti
-- sepakat, dan selisihnya tak akan pernah bisa dijelaskan.
--
-- ⚠️ DEPLOY-ORDERING: jalankan SEBELUM ada satu pun penggabungan dicatat.
-- Enumnya sendiri sudah ada sejak 20260811_01_penggabungan_barang.sql, jadi
-- migrasi ini aman dijalankan kapan saja setelah itu.

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
    'pemecahan_keluar','batal_pemecahan_masuk',
    'penggabungan_keluar']::jenis_transaksi_bmd[];
  v_muncul   jenis_transaksi_bmd[] := ARRAY['batal_kapitalisasi','batal_penghapusan',
    'batal_pemecahan','batal_koreksi_pencatatan_ganda',
    'batal_penggabungan']::jenis_transaksi_bmd[];
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

-- ⚠️ `penyusutan_semester` untuk periode LAMPAU tidak ikut berubah oleh migrasi
-- ini — ia hasil engine, bukan turunan fungsi ini. Sesudah mencatat sebuah
-- penggabungan, engine WAJIB dijalankan ulang untuk periodenya; kalau tidak,
-- kolom perolehan/akumulasi induk masih memakai basis lamanya sementara barang
-- sumbernya sudah tak terhitung, dan Rekonsiliasi akan menampilkannya sebagai
-- Selisih.
