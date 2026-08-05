-- `fn_rekap_bmd` (Laporan BMD) dinaikkan ke PERIOD-CORRECT penuh.
--
-- Ini Fase 5 rencana Rekonsiliasi (docs/rekonsiliasi-bmd-plan.md §4.3,
-- DECISION-3) — diminta user 2026-08-05 setelah menemukan bahwa Laporan BMD
-- masih memakai posisi TERKINI untuk periode LAMPAU.
--
-- ── Yang diperbaiki (tiga hal, ketiganya bikin periode lampau salah) ─────────
--
--  1. VISIBILITAS. Dulu `WHERE a.status = 'aktif'` — status TERKINI. Barang yang
--     kelak dihapus/dipecah hilang dari SEMUA periode, termasuk periode saat ia
--     masih sah. Sekarang `status <> 'draft'` + replay event SEMBUNYI/MUNCUL
--     s.d. periode (baris TERAKHIR menang), sama persis dengan Daftar Barang,
--     Penyusutan, & Rekonsiliasi (lib/visibilitas.ts).
--
--  2. KEPEMILIKAN SKPD. Dulu `a.skpd_id` TERKINI — barang yang dialihkan ke SKPD
--     lain langsung terlihat di SKPD baru bahkan saat membuka periode SEBELUM
--     perpindahannya. Sekarang pemilik pada periode P = `skpd_tujuan` baris
--     pindah TERAKHIR ber-periode <= P; kalau semua perpindahannya terjadi
--     SESUDAH P, dipakai `skpd_asal` baris paling awal (pemilik semula). Cermin
--     SQL dari `ownersAt` (lib/pengalihan.ts), termasuk `mutasi_internal` dan
--     pembuangan baris yang dianulir `batal_pengalihan.payload.target_trx_ids`.
--     Filter `p_skpd_ids` ikut memakai pemilik-pada-periode, bukan yang terkini.
--
--  3. BARANG YANG BELUM LAHIR. Pecahan hasil Pemecahan Barang MEWARISI
--     `tgl_perolehan` induknya, jadi uji `tgl_perolehan <= periode` saja
--     meloloskan mereka ke periode SEBELUM pemecahan — induk DAN pecahan tampil
--     bersamaan, nilainya dobel. Ditutup dengan daftar `LAHIR`
--     (`pemecahan_masuk`, `kdp_selesai_masuk`), kembar dengan lib/visibilitas.ts.
--     ⚠️ Migrasi 20260725_06 (yang TIDAK PERNAH dijalankan, lihat catatan di
--     bawah) belum memuat pemeriksaan ini.
--
-- ── Dampak terukur pada data hidup (2026-S1, intra, se-pemda) ───────────────
-- Tiga barang dipecah di 2026-S2 dan karenanya `status='dihapus'`, sehingga
-- versi lama membuangnya dari 2026-S1 padahal saat itu masih utuh:
--   · Tanah Masjid An-Nur (1.3.1)            Rp 1.160.892.000
--   · Rehab Garasi Grogol (1.3.3)            Rp   167.324.933
--   · Drainase JL Anyelir (1.3.4)            Rp 4.041.627.095
-- Pecahan 1.3.1 & 1.3.4 tetap intra dan totalnya sama dengan induknya → kolom
-- intra netto NOL, cuma kuantitasnya yang benar (−1). Pecahan 1.3.3 turun ke
-- EKSTRA, jadi kolom intra 2026-S1 selama ini KURANG Rp 167.324.933. Itulah
-- selisih nyata yang diperbaiki migrasi ini.
--
-- ── Keamanan & performa ─────────────────────────────────────────────────────
-- · Aman terhadap "barang dihapus tanpa jejak ledger" (insiden migrasi 19):
--   diperiksa 2026-08-05 — dari 244 aset berstatus 'dihapus', NOL yang tidak
--   punya event SEMBUNYI. Jadi tak ada yang menyeruak balik ke laporan.
-- · Perbandingan jenis memakai ARRAY bertipe ENUM (`jenis_transaksi_bmd[]`),
--   BUKAN `jenis::text = ANY(...)`. Cast ke text mematikan pemakaian index dan
--   memaksa seq scan 418rb baris tiap panggilan; dengan tipe aslinya,
--   `idx_trx_jenis_id` melayani filternya. Baris yang benar-benar cocok cuma
--   289 (visibilitas) & 4 (pindah) — kecil, asalkan indexnya kepakai.
--   ⚠️ Kalau menambah jenis di daftar mana pun di bawah, JANGAN kembali ke
--   bentuk `::text` demi kepraktisan.
-- · RLS: SECURITY DEFINER dengan replikasi scope yang SAMA seperti versi lama
--   (`v_is_admin OR fn_skpd_visible(a.skpd_id) OR fn_aset_pernah_dikelola(a.id)`).
--   `fn_aset_pernah_dikelola` yang membuat SKPD asal tetap boleh melihat barang
--   yang sudah pindah keluar — wajib ada, kalau tidak atribusi period-aware
--   justru menyembunyikan barangnya dari pemilik lamanya.
--
-- Signature & tipe kembalian TIDAK berubah → tak ada perubahan pemanggil.
-- Jalankan SETELAH 20260725_05_fn_rekap_bmd_perolehan_periodik.sql.

BEGIN;

-- Migrasi 20260725_06 memperkenalkan `fn_rekap_bmd_periodik` sebagai fungsi
-- TERPISAH, tapi tak pernah dijalankan dan tak pernah dipanggil kode mana pun
-- (diperiksa 2026-08-05: fungsinya tidak ada di database). Menyimpan dua fungsi
-- rekap yang nyaris kembar itu justru mengundang drift, jadi perbaikannya
-- dipasang di `fn_rekap_bmd` itu sendiri. DROP di bawah cuma jaring pengaman
-- kalau ada yang terlanjur menjalankan migrasi lama itu belakangan.
DROP FUNCTION IF EXISTS fn_rekap_bmd_periodik(text, bigint[], text);

CREATE OR REPLACE FUNCTION fn_rekap_bmd(
  p_periode   text,
  p_skpd_ids  bigint[] DEFAULT NULL,
  p_komptabel text     DEFAULT NULL
)
RETURNS TABLE (
  skpd_id bigint, golongan text, kuantitas bigint,
  perolehan numeric, akumulasi numeric, beban numeric,
  nilai_buku_akhir numeric, count_peny bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_is_admin boolean := fn_is_admin();
  -- Kembar dengan lib/visibilitas.ts & lib/pengalihan.ts — ubah di sini, ubah
  -- di sana (rules.md §25).
  v_pindah   jenis_transaksi_bmd[] := ARRAY['pengalihan_status','mutasi_internal']::jenis_transaksi_bmd[];
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
  -- Baris pengalihan yang DIANULIR (bukan "dikembalikan" — itu peristiwa nyata
  -- dan tetap dibaca). Payload-nya JAMAK: `target_trx_ids`.
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
  -- Satu tarikan untuk visibilitas & kelahiran sekaligus.
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
    SELECT a.id, a.kode, a.nilai_perolehan,
           COALESCE(oa.owner_skpd, a.skpd_id) AS eff_owner
    FROM aset a
    LEFT JOIN owner_at oa ON oa.aset_id = a.id
    WHERE a.status <> 'draft'
      AND (p_komptabel IS NULL OR p_komptabel = '' OR a.intra_ekstra = p_komptabel)
      AND (a.tgl_perolehan IS NULL OR fn_periode_dari_tanggal(a.tgl_perolehan) <= p_periode)
      AND NOT EXISTS (SELECT 1 FROM hidden h        WHERE h.aset_id = a.id)
      AND NOT EXISTS (SELECT 1 FROM lahir_setelah l WHERE l.aset_id = a.id)
      AND (v_is_admin OR fn_skpd_visible(a.skpd_id) OR fn_aset_pernah_dikelola(a.id))
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
$$;

GRANT EXECUTE ON FUNCTION fn_rekap_bmd(text, bigint[], text) TO authenticated;

COMMIT;

-- ── Verifikasi ──────────────────────────────────────────────────────────────
-- (1) Periode BERJALAN tak boleh berubah banyak (posisi terkini ≈ posisi
--     periode ini). Jalankan sebelum & sesudah, bandingkan:
--       SELECT golongan, sum(kuantitas), sum(perolehan)
--       FROM fn_rekap_bmd('2026-S2', NULL, 'intra') GROUP BY 1 ORDER BY 1;
--
-- (2) Periode LAMPAU: 2026-S1 intra harus BERTAMBAH Rp 167.324.933 di golongan
--     1.3.3, dan kuantitas 1.3.1 & 1.3.4 masing-masing berkurang 1 tanpa
--     perubahan nilai (induk kembali, dua pecahannya keluar):
--       SELECT golongan, sum(kuantitas), sum(perolehan)
--       FROM fn_rekap_bmd('2026-S1', NULL, 'intra') GROUP BY 1 ORDER BY 1;
--
-- (3) Cocokkan dengan Rekonsiliasi BMD (lib/rekon.ts) pada periode & scope yang
--     sama — sesudah migrasi ini keduanya sedefinisi, jadi Saldo Akhir-nya harus
--     SAMA PERSIS. Selisih yang tersisa = bug, bukan beda definisi lagi.
--
-- (4) WAJIB diuji sebagai PENGURUS BARANG SKPD TERBESAR (Dinas Pendidikan),
--     bukan cuma admin — rules.md §18. Sebagai admin `v_is_admin` short-circuit
--     dan seluruh cabang RLS tak pernah dievaluasi, jadi lolos di admin TIDAK
--     membuktikan apa pun soal performa operator.
