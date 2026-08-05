-- ============================================================================
-- ⛔ JANGAN DIJALANKAN — TIDAK PERNAH DIPAKAI, DIGANTIKAN 20260805_02.
--
-- Diperiksa 2026-08-05: fungsi ini tidak ada di database (migrasinya memang tak
-- pernah dijalankan) dan tak pernah dipanggil satu baris kode pun — halaman
-- Laporan BMD selalu memakai `fn_rekap_bmd`. Menyimpan dua fungsi rekap yang
-- nyaris kembar cuma mengundang drift, jadi perbaikan period-correct-nya
-- dipasang di `fn_rekap_bmd` ITU SENDIRI lewat
-- `20260805_02_fn_rekap_bmd_period_correct.sql` — yang sekaligus menambal dua
-- hal yang belum ada di berkas ini: pemeriksaan barang BELUM LAHIR (pecahan
-- Pemecahan Barang mewarisi `tgl_perolehan` induk) dan pembuangan pengalihan
-- yang dianulir `batal_pengalihan`. Berkas ini disimpan sebagai jejak sejarah.
--
-- Isi asli di bawah.
-- ----------------------------------------------------------------------------
-- fn_rekap_bmd_periodik — rekap BMD PERIOD-CORRECT PENUH (langkah 3 temuan
-- audit Pelaporan 2026-07-25).
--
-- LATAR: fn_rekap_bmd memakai register TERKINI untuk dua hal —
--   (a) visibilitas  : `WHERE a.status='aktif'` (barang yang KELAK dihapus
--       hilang dari saldo periode LAMPAU), dan
--   (b) kepemilikan  : `a.skpd_id` sekarang (barang yang KELAK pindah SKPD
--       sudah ter-atribusi ke SKPD baru untuk periode lampau).
-- Akibatnya laporan periode lampau berubah setiap ada mutasi baru — tidak
-- reproducible, dan bisa beda dgn Rekonsiliasi BMD yang period-aware.
--
-- FUNGSI BARU, BUKAN mengganti fn_rekap_bmd. Alasan: kalau ternyata lebih
-- lambat, rollback = kembalikan satu baris pemanggilan di halaman Laporan BMD.
-- fn_rekap_bmd lama TIDAK diubah & tetap ada.
--
-- KONTRAK OUTPUT IDENTIK dgn fn_rekap_bmd (nama & tipe kolom sama, termasuk
-- count_peny) → penukaran di client cukup ganti nama RPC, logika rekonsiliasi
-- nilai buku di halaman (non-disusutkan → nilaiBuku = perolehan) tetap jalan.
--
-- SEMANTIK — disamakan PERSIS dgn lib/rekon.ts (fetchSnapshot) supaya Laporan
-- BMD & Rekonsiliasi BMD memberi angka yang sama:
--   * base       : aset `status <> 'draft'` (JANGAN filter 'aktif' — itu justru
--                  kelemahan yang diperbaiki; 'draft' = belum resmi, mis. KDP
--                  belum disetujui, tak pernah boleh masuk laporan).
--   * belum ada  : tgl_perolehan > periode → dibuang.
--   * visibilitas: replay event SEMBUNYI/MUNCUL dgn periode <= P, baris TERAKHIR
--                  (periode lalu id ledger) yang menentukan — bukan
--                  dikelompokkan sembunyi-dulu-baru-muncul, supaya siklus
--                  hapus→batal→hapus dalam periode sama ikut aksi terakhir.
--   * pemilik    : replay 'pengalihan_status' + 'mutasi_internal' (dua-duanya
--                  meng-UPDATE aset.skpd_id) — tujuan baris terakhir <= P;
--                  kalau belum ada, asal baris paling awal (pemilik semula).
--   * perolehan  : COALESCE(ps.nilai_perolehan, a.nilai_perolehan) — nilai pada
--                  periode itu (kapitalisasi/koreksi sesudahnya tidak bocor).
--
-- CATATAN daftar SEMBUNYI: memakai varian rekon.ts/Penyusutan, yaitu TANPA
--   'kdp_selesai_keluar' (beda dari fn_daftar_barang yang menyertakannya).
--   Aman: event itu sudah MENURUNKAN aset.nilai_perolehan KDP, jadi tak ada
--   double-count dgn aset tetap hasil carve-out. MUNCUL menyertakan
--   'batal_koreksi_pencatatan_ganda' (barang duplikat aktif lagi).
--
-- ⚠️ jenis = ENUM jenis_transaksi_bmd → WAJIB cast `t.jenis::text` saat
--   dibandingkan dgn text[] (lihat migrasi 20260718_04, bug yang sama pernah
--   terjadi: `operator does not exist: jenis_transaksi_bmd = text`).
--
-- Jalankan di Supabase SQL Editor SETELAH 20260725_05. Membuat fungsi baru saja
-- — TIDAK mengubah perilaku aplikasi sampai halaman Laporan BMD ditukar.
-- ============================================================================

-- Index pendukung replay (filter jenis → group per aset, urut periode/id).
-- PLAIN, bukan CONCURRENTLY (SQL Editor membungkus transaksi).
CREATE INDEX IF NOT EXISTS idx_trx_jenis_aset_periode
  ON transaksi_bmd(jenis, aset_id, periode, id);

CREATE OR REPLACE FUNCTION fn_rekap_bmd_periodik(
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
  v_pindah   text[] := ARRAY['pengalihan_status','mutasi_internal'];
  v_sembunyi text[] := ARRAY['kapitalisasi_serap','penghapusan_pemindahtanganan',
    'penghapusan_sebab_lain','batal_pengadaan','koreksi_pencatatan_ganda',
    'batal_hibah_masuk','batal_tukar_menukar','batal_hasil_inventarisasi',
    'batal_perolehan_lainnya','pemecahan_keluar','batal_pemecahan_masuk'];
  v_muncul   text[] := ARRAY['batal_kapitalisasi','batal_penghapusan',
    'batal_pemecahan','batal_koreksi_pencatatan_ganda'];
BEGIN
  RETURN QUERY
  WITH RECURSIVE root_of AS (
    SELECT id, id AS root_id FROM admin_skpd WHERE parent_id IS NULL
    UNION ALL
    SELECT s.id, r.root_id FROM admin_skpd s JOIN root_of r ON s.parent_id = r.id
  ),
  -- Pemilik pada periode: tujuan baris TERAKHIR (<= P); kalau semua perpindahan
  -- terjadi SESUDAH P, pakai asal baris paling awal (pemilik semula).
  owner_at AS (
    SELECT t.aset_id,
      COALESCE(
        (array_agg(t.skpd_tujuan ORDER BY t.periode DESC, t.id DESC)
           FILTER (WHERE t.periode <= p_periode))[1],
        (array_agg(t.skpd_asal ORDER BY t.periode ASC, t.id ASC))[1]
      ) AS owner_skpd
    FROM transaksi_bmd t
    WHERE t.jenis::text = ANY(v_pindah)
    GROUP BY t.aset_id
  ),
  -- Tersembunyi pada periode: event terakhir (<= P) berjenis SEMBUNYI.
  hidden AS (
    SELECT x.aset_id FROM (
      SELECT DISTINCT ON (t.aset_id) t.aset_id, t.jenis::text AS jenis
      FROM transaksi_bmd t
      WHERE t.jenis::text = ANY(v_sembunyi || v_muncul)
        AND t.periode <= p_periode
      ORDER BY t.aset_id, t.periode DESC, t.id DESC
    ) x
    WHERE x.jenis = ANY(v_sembunyi)
  ),
  cand AS (
    SELECT a.id, a.kode, a.skpd_id, a.nilai_perolehan,
           COALESCE(oa.owner_skpd, a.skpd_id) AS eff_owner
    FROM aset a
    LEFT JOIN owner_at oa ON oa.aset_id = a.id
    WHERE a.status <> 'draft'
      AND (a.tgl_perolehan IS NULL OR fn_periode_dari_tanggal(a.tgl_perolehan) <= p_periode)
      AND (p_komptabel IS NULL OR p_komptabel = '' OR a.intra_ekstra = p_komptabel)
      AND NOT EXISTS (SELECT 1 FROM hidden h WHERE h.aset_id = a.id)
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
    -- Scope RLS transaksi_bmd/aset direplikasi (v_is_admin dievaluasi SEKALI).
    -- eff_owner DAN skpd_id dicek: barang yang periode itu milik scope tapi kini
    -- sudah pindah keluar tetap boleh dibaca (fn_aset_pernah_dikelola sudah
    -- mencakup pengalihan_status + mutasi_internal).
    AND (
      v_is_admin
      OR fn_skpd_visible(c.eff_owner)
      OR fn_skpd_visible(c.skpd_id)
      OR fn_aset_pernah_dikelola(c.id)
    )
  GROUP BY 1, 2;
END;
$$;

GRANT EXECUTE ON FUNCTION fn_rekap_bmd_periodik(text, bigint[], text) TO authenticated;

-- ── VERIFIKASI — JALANKAN SEBELUM MENUKAR HALAMAN LAPORAN BMD ───────────────
-- (1) WAKTU EKSEKUSI (paling penting — fungsi ini lebih berat dari fn_rekap_bmd
--     karena mereplay ledger). Target wajar < 2 detik; kalau mendekati/menembus
--     statement timeout 8s role authenticated, JANGAN tukar halamannya:
--       EXPLAIN ANALYZE SELECT * FROM fn_rekap_bmd_periodik('2026-S2', NULL, 'intra');
--
-- (2) PERIODE BERJALAN harus (nyaris) SAMA dgn fungsi lama — pada periode
--     terkini, "register terkini" = "posisi periode itu". Selisih yang wajar
--     hanya dari barang yang saat ini 'dihapus' tapi penghapusannya dicatat di
--     periode SESUDAH p_periode (langka):
--       SELECT l.golongan, sum(l.perolehan) AS lama, sum(b.perolehan) AS baru
--       FROM fn_rekap_bmd('2026-S2', NULL, 'intra') l
--       FULL JOIN fn_rekap_bmd_periodik('2026-S2', NULL, 'intra') b
--         ON b.golongan = l.golongan AND b.skpd_id = l.skpd_id
--       GROUP BY 1 ORDER BY 1;
--
-- (3) PERIODE LAMPAU — di sinilah selisihnya muncul (itu memang tujuannya):
--     ulangi query (2) dgn '2026-S1'. Selisih = barang yang setelah S1 dihapus
--     /dialihkan/dikapitalisasi.
--
-- (4) COCOKKAN dgn Rekonsiliasi BMD pada periode & scope sama — kolom perolehan
--     seharusnya kini IDENTIK (sumber & semantik disamakan).
