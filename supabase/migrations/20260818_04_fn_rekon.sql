-- Fase 4 — pindahkan pembacaan REKONSILIASI BMD ke server.
-- Prasyarat: migrasi 20260818_03 (idx_trx_saldo_awal_pos) WAJIB sudah jalan.
--
-- ── UKURAN SEBELUM (Dinas Pendidikan, 707 unit, 295.141 aset, 2026-S1) ──────
-- Sekali klik "Proses" ≈ 8.455 permintaan PostgREST:
--   fetchAllBase (keyset 1.000) ................................... 296
--   posAwal 2025-S2  fetchPeny + fetchHiddenIds + fetchBaselinePos . 4.428
--   posAkhir 2026-S1 fetchPeny + fetchHiddenIds + fetchBaselinePos . 3.706
--   fetchMutasiLines (19 kolektor, sudah terscope) ................. ~25
-- dan 590.282 baris menyeberang ke browser (295.141 DUA KALI, sekali per
-- snapshot) untuk disaring & dijumlah di sana.
--
-- ⚠️ Angka 4.428 itu BUKAN kasus tepi. Engine SENGAJA tak pernah menghasilkan
-- baris `penyusutan_semester` untuk 2025-S2 (diverifikasi: 0 baris), jadi
-- SELURUH baris SALDO AWAL Semester I lahir dari jalur baseline ledger.
--
-- ── KENAPA `statement_timeout` DINAIKKAN, BUKAN DIPAKSA MASUK 8 DETIK ───────
-- Terukur 2026-08-18 sesudah 20260818_03: satu snapshot Diknas = ±25 dtk, dan
-- Rekonsiliasi butuh DUA. Sisa biayanya hakiki — memindai 295 ribu aset dan
-- melipat 418 ribu baris baseline. Yang dibandingkan bukan "25 dtk vs 8 dtk"
-- melainkan "≈60 dtk vs 8.455 permintaan": pada ~100 ms per permintaan, keadaan
-- SEKARANG memakan belasan menit. Jadi menaikkan pagu di sini bukan kompromi,
-- ia pengakuan bahwa rekonsiliasi memang query berat sesekali — bukan pemuatan
-- halaman. Polanya sama dengan `SET work_mem` di `fn_penyusutan_rekap`.
-- ⚠️ Berlaku HANYA di dalam fungsi ini, bukan untuk basis data.
--
-- ── DUA CACAT PROTOTIPE YANG SUDAH DITUTUP DI SINI (jangan diulang) ─────────
-- (1) Periode WAJIB skalar (parameter plpgsql), JANGAN datang dari CTE. Saat ia
--     jadi kondisi join, planner meninggalkan `idx_trx_saldo_awal_pos` dan
--     memilih `idx_trx_periode` + Sort 40 MB → 87 dtk. Dengan skalar: Index
--     Only Scan.
-- (2) Keanggotaan override pemilik WAJIB lewat ARRAY yang dihitung SEKALI
--     (`v_ovr_all`/`v_ovr_in`), bukan `EXISTS (SELECT … FROM ovr …)` berkorelasi
--     — yang terakhir dieksekusi 122.972 kali. Pola ini disalin dari
--     `fn_penyusutan` (20260818_01), tempat jebakan yang sama sudah dibayar.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. fn_rekon_pos — posisi PER ASET pada akhir sebuah periode
-- ═══════════════════════════════════════════════════════════════════════════
-- Kembar dengan `fetchSnapshotPositions` (lib/rekon.ts) baris per baris, dan
-- ITU yang menentukan seluruh angka Rekonsiliasi. Diverifikasi ke DB 2026-08-18
-- terhadap layar Penyusutan yang sudah disetujui user (jalur kode berbeda,
-- angka identik):
--   1.3.2 intra 2026-S1  132.694 aset · 277.628.183.863,36 · 8.361.249.818,80
--                        · 239.696.146.995,08 · 37.932.036.871,79
--   1.3.1 intra 2026-S1      834 aset · 148.394.433.759,58 · 0 · 0 · = perolehan
-- dan invarian tie-out-nya pas sampai sen:
--   akumulasi 2025-S2 231.334.897.176,28 + beban 2026-S1 8.361.249.818,80
--   = akumulasi 2026-S1 239.696.146.995,08
--
-- `p_aset_ids` NULL = seluruh scope (dipakai fn_rekon_rekap). Berisi = hanya
-- aset itu — dipakai halaman untuk `attribusiPenyusutan`, yang cuma butuh
-- posisi aset BERMUTASI. Terukur: mutasi se-kabupaten 2026-S1 = 83 baris /
-- 75 aset, 2026-S2 = 147 baris / 132 aset. Jadi menarik 295.141 posisi ke
-- browser demi ≤132 aset itu 99,96% pekerjaan sia-sia.
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
  -- ⚠️ KEMBAR dengan `kode_at` di fn_rekap_bmd & `kodeAt` di lib/reklasKode.ts.
  -- `target_trx_id` TUNGGAL di sini; `batal_pengalihan` yang jamak
  -- (`target_trx_ids`) — jangan tertukar. Penjaga regex supaya payload warisan
  -- yang rusak tidak meledakkan cast.
  batal_reklas AS (
    SELECT DISTINCT (t.payload->>'target_trx_id')::bigint AS trx_id
    FROM transaksi_bmd t
    WHERE t.jenis = 'batal_reklas'::jenis_transaksi_bmd
      AND t.payload->>'target_trx_id' ~ '^[0-9]+$'
  ),
  kode_at AS MATERIALIZED (
    SELECT r.aset_id, COALESCE(
      (array_agg(r.kode_baru ORDER BY r.periode DESC, r.id DESC)
         FILTER (WHERE r.periode <= p_periode))[1],
      (array_agg(r.kode_lama ORDER BY r.periode ASC, r.id ASC))[1]
    ) AS kode_eff
    FROM (
      SELECT t.aset_id, t.periode, t.id,
             t.payload->>'kode_lama' AS kode_lama, t.payload->>'kode_baru' AS kode_baru
      FROM transaksi_bmd t
      WHERE t.jenis = ANY(ARRAY['reklas_kode','reklas_golongan']::jenis_transaksi_bmd[])
        AND t.payload->>'kode_baru' IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM batal_reklas b WHERE b.trx_id = t.id)
    ) r
    GROUP BY r.aset_id
  ),
  cand AS (
    -- `kode_eff` masih bisa NULL kalau baris reklas paling awal tak menyimpan
    -- `kode_lama` (payload warisan) → jatuh ke `a.kode`, sama dengan
    -- `kodePada()` di TS. Tebakan buruk, tapi jauh lebih baik daripada barang
    -- hilang dari SELURUH baris laporan tanpa jejak.
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
           -- ⚠️ ATURAN PER BARIS. Golongan yang TAK PERNAH disusutkan (1.3.1
           -- Tanah, 1.3.5 ATL, 1.3.6 KDP) tak punya baris engine sama sekali,
           -- jadi beban & akumulasinya NOL dan **nilai bukunya = nilai
           -- perolehan**. Menjumlah kolom mentah mengulang persis cacat yang
           -- bikin Uji Konsistensi menuduh Tanah & ATL "TIDAK COCOK"
           -- (2026-08-16, lihat lib/rekapBmd.ts).
           -- ⚠️ Daftar ini KEMBAR dengan `perlakuanKode()` (lib/bmd.ts) dan
           -- dengan fn_penyusutan_rekap. Ubah satu, ubah semuanya.
           c.gol IN ('1.3.2','1.3.3','1.3.4','1.5.3','1.5.4') AS susut,
           ps.aset_id IS NOT NULL AS eng,
           ps.nilai_perolehan AS p_nilai, ps.beban AS p_beban,
           ps.akumulasi AS p_akum, ps.nilai_buku_akhir AS p_nb,
           c.nilai_perolehan AS reg_nilai,
           bn.nilai AS bl_nilai,
           bp.aset_id IS NOT NULL AS ada_bp, bp.akum AS bl_akum, bp.nbawal AS bl_nb
    FROM cand c
    LEFT JOIN penyusutan_semester ps ON ps.aset_id = c.id AND ps.periode = p_periode
    -- Perolehan baseline: kolom `nilai` saja → dilayani INDEX ONLY oleh
    -- idx_trx_saldo_awal_pos, tanpa menyentuh heap. Syarat `ps.aset_id IS NULL`
    -- ditaruh DI DALAM subquery (bukan di ON) supaya subquery-nya benar-benar
    -- tak dijalankan untuk aset yang sudah punya baris engine.
    LEFT JOIN LATERAL (
      SELECT t.nilai FROM transaksi_bmd t
      WHERE t.jenis IN ('saldo_awal','saldo_awal_checkpoint')
        AND t.aset_id = c.id AND t.periode <= p_periode
        AND ps.aset_id IS NULL
      ORDER BY t.aset_id, t.periode DESC, t.id DESC LIMIT 1
    ) bn ON true
    -- Akumulasi & nilai buku baseline: butuh `payload` (jsonb, ter-TOAST) →
    -- MAHAL. Karena itu dibatasi ke aset yang BENAR-BENAR memakainya: belum
    -- punya baris engine DAN golongannya memang disusutkan. Untuk 2026-S1
    -- himpunan itu berisi NOL aset (144.456 disusutkan, 144.456 punya baris
    -- engine); ia baru berbiaya di periode baseline 2025-S2.
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
    -- Beban itu ARUS periode ini. Aset tanpa baris engine tak punya arus —
    -- kolom Beban baris SALDO AWAL diisi `bebanSaldoAwal` (beban periode
    -- BERJALAN atas populasi awal), bukan dari sini.
    CASE WHEN p.eng AND p.susut THEN p.p_beban ELSE 0 END,
    CASE WHEN p.eng THEN (CASE WHEN p.susut THEN p.p_akum ELSE 0 END)
         WHEN p.susut AND p.ada_bp THEN p.bl_akum ELSE 0 END,
    -- `bl_nb <> 0 ? bl_nb : perolehan − akumulasi` mereplikasi `||` di TS
    -- (`bl.nilaiBuku || perolehan - akumulasi`): nilai buku awal NOL dianggap
    -- belum terisi, bukan benar-benar nol.
    CASE WHEN p.eng THEN (CASE WHEN p.susut THEN p.p_nb ELSE p.p_nilai END)
         WHEN p.susut AND p.ada_bp THEN
           (CASE WHEN p.bl_nb <> 0 THEN p.bl_nb
                 ELSE COALESCE(p.bl_nilai, p.reg_nilai, 0) - p.bl_akum END)
         ELSE COALESCE(p.bl_nilai, p.reg_nilai, 0) END
  FROM pos p;
END;
$function$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. fn_rekon_rekap — agregat DUA periode + beban populasi lanjut
-- ═══════════════════════════════════════════════════════════════════════════
-- Menggantikan `fetchSnapshotPositions` ×2 + `aggregatePositions` ×2 +
-- bagian `bebanSaldoAwal` dari `attribusiPenyusutan`.
--
-- `fn_rekon_pos` dipanggil DUA KALI alih-alih logikanya disalin dua kali di
-- sini — disengaja. Aturan posisi per-aset itu jantung angka Rekonsiliasi, dan
-- salinan kedua di berkas yang sama persis kelas utang yang berkali-kali
-- terbukti menyimpang diam-diam di repo ini (SEMBUNYI di tiga halaman,
-- cara perolehan di lima tempat). Ongkosnya satu tuplestore per panggilan.
--
-- `beban_saldo_awal` = Σ beban periode BERJALAN atas aset yang ada di sel yang
-- SAMA pada P−1 dan P (populasi lanjut) — DECISION-1 Opsi A. Dihitung sebagai
-- SATU hash join dua himpunan, bukan subquery berkorelasi per sel: yang
-- terakhir O(sel × n) dan sudah terbukti timeout saat diprototipekan.
CREATE OR REPLACE FUNCTION fn_rekon_rekap(
  p_periode_awal text,
  p_periode      text,
  p_skpd_ids     bigint[] DEFAULT NULL
)
RETURNS TABLE(
  golongan text, komptabel text,
  awal_jumlah bigint, awal_perolehan numeric, awal_akumulasi numeric, awal_nilai_buku numeric,
  akhir_jumlah bigint, akhir_perolehan numeric, akhir_beban numeric,
  akhir_akumulasi numeric, akhir_nilai_buku numeric,
  beban_saldo_awal numeric
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
SET work_mem TO '64MB'
SET statement_timeout TO '120s'
AS $function$
BEGIN
  RETURN QUERY
  WITH aw AS MATERIALIZED (SELECT * FROM fn_rekon_pos(p_periode_awal, p_skpd_ids, NULL)),
       ak AS MATERIALIZED (SELECT * FROM fn_rekon_pos(p_periode,      p_skpd_ids, NULL)),
  g_aw AS (
    SELECT w.golongan, w.komptabel, count(*)::bigint AS jml,
           sum(w.perolehan) AS perolehan, sum(w.akumulasi) AS akumulasi, sum(w.nilai_buku) AS nb
    FROM aw w GROUP BY 1,2
  ),
  g_ak AS (
    SELECT k.golongan, k.komptabel, count(*)::bigint AS jml,
           sum(k.perolehan) AS perolehan, sum(k.beban) AS beban,
           sum(k.akumulasi) AS akumulasi, sum(k.nilai_buku) AS nb
    FROM ak k GROUP BY 1,2
  ),
  ba AS (
    SELECT k.golongan, k.komptabel, sum(k.beban) AS beban_awal
    FROM ak k
    JOIN aw w ON w.aset_id = k.aset_id AND w.golongan = k.golongan AND w.komptabel = k.komptabel
    GROUP BY 1,2
  )
  -- FULL JOIN: sel bisa lahir (golongan baru di periode ini) atau hilang
  -- (seluruh isinya dihapus). Keduanya harus tetap muncul dengan sisi lain nol,
  -- kalau tidak baris SALDO AWAL / SALDO AKHIR-nya lenyap dari lembar tanpa
  -- satu pun keterangan.
  SELECT
    COALESCE(a.golongan, b.golongan), COALESCE(a.komptabel, b.komptabel),
    COALESCE(a.jml,0), COALESCE(a.perolehan,0), COALESCE(a.akumulasi,0), COALESCE(a.nb,0),
    COALESCE(b.jml,0), COALESCE(b.perolehan,0), COALESCE(b.beban,0),
    COALESCE(b.akumulasi,0), COALESCE(b.nb,0),
    COALESCE(c.beban_awal,0)
  FROM g_aw a
  FULL JOIN g_ak b ON b.golongan = a.golongan AND b.komptabel = a.komptabel
  LEFT JOIN ba   c ON c.golongan = COALESCE(a.golongan, b.golongan)
                  AND c.komptabel = COALESCE(a.komptabel, b.komptabel);
END;
$function$;

GRANT EXECUTE ON FUNCTION fn_rekon_pos(text, bigint[], uuid[])   TO authenticated;
GRANT EXECUTE ON FUNCTION fn_rekon_rekap(text, text, bigint[])   TO authenticated;
