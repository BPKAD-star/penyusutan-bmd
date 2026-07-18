-- ============================================================================
-- fn_daftar_barang() — paginasi Daftar Barang di SERVER (2026-07-18, Fase 1).
--
-- MASALAH (analisa 2026-07-18): app/dashboard/daftar-barang/page.tsx menarik
-- SELURUH baris golongan ke browser (fetchAllRows), lalu replay visibility
-- (fetchHiddenIds) + kepemilikan period-aware (fetchOwnerOverrides) + join
-- enrichment di JS, baru paginate di client. Utk golongan 1.3.2 (218rb baris)
-- itu ~2.400 request berurutan + 218rb baris di memori → tab freeze/menit-menit.
--
-- FUNGSI INI memindah SELURUH logika seleksi + visibility + kepemilikan +
-- paginasi ke SATU query SQL. Browser terima 1 halaman (≤ p_limit) + total_count
-- + grand_total. Enrichment ringan (uraian kodefikasi, nama SKPD, jumlah bidang)
-- TETAP di client atas ≤50 baris halaman — tidak dipindah, sudah murah.
--
-- ⚠️ PADANAN LOGIKA JS (WAJIB persis — angka period-aware dipakai audit/BPK):
--   * Kandidat = status <> 'draft' (screen pakai includeDeleted=true; yg
--     period-hidden disaring langkah visibility, BUKAN oleh status=aktif).
--   * SEMBUNYI/MUNCUL: daftar (12 vs 3) SAMA PERSIS dgn konstanta di page.tsx
--     (termasuk 'kdp_selesai_keluar' yg khusus ada di Daftar Barang, tidak di
--     Penyusutan). Event TERAKHIR per aset (periode DESC, id DESC) menang —
--     bukan dikelompokkan sembunyi-dulu-muncul (lih. komentar page.tsx:254).
--   * Kepemilikan period-aware (lib/pengalihan.ts): aset ber-'pengalihan_status'
--     → pemilik = skpd_tujuan event TERAKHIR dgn periode<=target; kalau semua
--     event > target → skpd_asal event PALING AWAL. Aset lain → skpd_id terkini.
--     Filter SKPD (p_skpd_ids) diterapkan ke PEMILIK-PERIODE ini — ini menyatukan
--     keepIds (buang yg saat itu milik SKPD lain) + addIds (tambah yg saat itu
--     milik scope tapi kini pindah keluar) jadi satu predikat.
--   * belumAda: tgl_perolehan (period) > target → dibuang (belum diperoleh).
--   * Urut nilai_perolehan DESC.
--
-- KEAMANAN: SECURITY DEFINER + fn_is_admin() dievaluasi SEKALI (pola migrasi
-- 20260716_07/20260717_02). Scope RLS aset direplikasi manual di WHERE:
--   v_is_admin OR fn_skpd_visible(skpd_id) OR fn_aset_pernah_dikelola(id)
-- (dipakai skpd_id TERKINI — sama spt RLS tabel; INDEPENDEN dari filter bisnis
-- p_skpd_ids yg pakai pemilik-periode). Non-admin tetap dibatasi subtree-nya.
--
-- PAGINASI: p_limit NULL → kembalikan SEMUA (dipakai dump audit via \copy).
--   total_count / grand_total via window OVER() = dihitung atas SELURUH set
--   visible SEBELUM LIMIT (window jalan sebelum LIMIT di Postgres).
-- ============================================================================

CREATE OR REPLACE FUNCTION fn_daftar_barang(
  p_golongan   text,                    -- '1.3.2' dst (WAJIB — page selalu pilih)
  p_periode    text,                    -- 'YYYY-S1/2'
  p_skpd_ids   bigint[] DEFAULT NULL,   -- scope filter (descendantIds); NULL = semua
  p_komptabel  text     DEFAULT NULL,   -- 'intra'/'ekstra'/NULL(semua)
  p_search     text     DEFAULT NULL,   -- cocok nama_barang/nibar/kode
  p_limit      int      DEFAULT 50,     -- NULL = semua (audit dump)
  p_offset     int      DEFAULT 0
)
RETURNS TABLE (
  id uuid, nibar text, kode text, nama_barang text, spesifikasi_lainnya text,
  merek_tipe text, nilai_perolehan numeric, tgl_perolehan date, intra_ekstra text,
  keterangan text, status text, skpd_id bigint, owner_skpd bigint, luas numeric,
  nomor_dokumen_kepemilikan text, tanggal_dokumen_kepemilikan date,
  nama_dokumen_kepemilikan text, jenis_hak text,
  total_count bigint, grand_total numeric
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_is_admin boolean := fn_is_admin();
  -- SEMBUNYI/MUNCUL — SAMA PERSIS konstanta di daftar-barang/page.tsx:32-33.
  v_sembunyi text[] := ARRAY['kapitalisasi_serap','penghapusan_pemindahtanganan',
    'penghapusan_sebab_lain','batal_pengadaan','koreksi_pencatatan_ganda',
    'batal_hibah_masuk','batal_tukar_menukar','batal_hasil_inventarisasi',
    'batal_perolehan_lainnya','kdp_selesai_keluar','pemecahan_keluar','batal_pemecahan_masuk'];
  v_muncul   text[] := ARRAY['batal_kapitalisasi','batal_penghapusan','batal_pemecahan'];
BEGIN
  RETURN QUERY
  WITH
  -- Pemilik-pada-periode utk aset yg pernah 'pengalihan_status'
  owner_at AS (
    SELECT t.aset_id,
      COALESCE(
        (array_agg(t.skpd_tujuan ORDER BY t.periode DESC, t.id DESC)
           FILTER (WHERE t.periode <= p_periode))[1],
        (array_agg(t.skpd_asal ORDER BY t.periode ASC, t.id ASC))[1]
      ) AS owner_skpd
    FROM transaksi_bmd t
    WHERE t.jenis = 'pengalihan_status'
    GROUP BY t.aset_id
  ),
  -- Aset hidden-at-periode: event SEMBUNYI/MUNCUL TERAKHIR (periode,id) per aset
  hidden AS (
    SELECT x.aset_id FROM (
      SELECT DISTINCT ON (t.aset_id) t.aset_id, t.jenis
      FROM transaksi_bmd t
      WHERE t.jenis = ANY(v_sembunyi || v_muncul)
        AND t.periode <= p_periode
      ORDER BY t.aset_id, t.periode DESC, t.id DESC
    ) x
    WHERE x.jenis = ANY(v_sembunyi)
  ),
  -- Kandidat + pemilik-periode efektif, semua filter kecuali visibility/belumAda
  cand AS (
    SELECT
      a.id, a.nibar, a.kode, a.nama_barang, a.spesifikasi_lainnya, a.merek_tipe,
      a.nilai_perolehan, a.tgl_perolehan, a.intra_ekstra, a.keterangan, a.status,
      a.skpd_id, COALESCE(oa.owner_skpd, a.skpd_id) AS eff_owner,
      a.luas, a.nomor_dokumen_kepemilikan, a.tanggal_dokumen_kepemilikan,
      a.nama_dokumen_kepemilikan, a.jenis_hak
    FROM aset a
    LEFT JOIN owner_at oa ON oa.aset_id = a.id
    WHERE a.status <> 'draft'
      AND a.kode LIKE p_golongan || '.%'
      AND (p_komptabel IS NULL OR p_komptabel = '' OR a.intra_ekstra = p_komptabel)
      AND (p_search IS NULL OR p_search = '' OR
           a.nama_barang ILIKE '%'||p_search||'%' OR a.nibar ILIKE '%'||p_search||'%'
           OR a.kode ILIKE p_search||'%')
      -- keamanan (RLS aset) — pakai skpd_id terkini
      AND (v_is_admin OR fn_skpd_visible(a.skpd_id) OR fn_aset_pernah_dikelola(a.id))
  ),
  visible AS (
    SELECT * FROM cand c
    WHERE (p_skpd_ids IS NULL OR c.eff_owner = ANY(p_skpd_ids))  -- filter bisnis: pemilik-periode
      AND NOT EXISTS (SELECT 1 FROM hidden h WHERE h.aset_id = c.id)
      AND (c.tgl_perolehan IS NULL
           OR fn_periode_dari_tanggal(c.tgl_perolehan) <= p_periode)   -- belumAda
  )
  SELECT
    v.id, v.nibar, v.kode, v.nama_barang, v.spesifikasi_lainnya, v.merek_tipe,
    v.nilai_perolehan, v.tgl_perolehan, v.intra_ekstra, v.keterangan, v.status,
    v.skpd_id, v.eff_owner AS owner_skpd, v.luas, v.nomor_dokumen_kepemilikan,
    v.tanggal_dokumen_kepemilikan, v.nama_dokumen_kepemilikan, v.jenis_hak,
    count(*) OVER()::bigint AS total_count,
    COALESCE(sum(v.nilai_perolehan) OVER(), 0) AS grand_total
  FROM visible v
  ORDER BY v.nilai_perolehan DESC NULLS LAST, v.id
  LIMIT p_limit OFFSET COALESCE(p_offset, 0);
END;
$$;

-- Index pendukung: CTE owner_at & hidden memfilter transaksi_bmd by jenis.
-- Tanpa ini seq-scan ~260rb baris ledger tiap panggil (masih ms-an, tapi index
-- bikin murah & konsisten). Aman/aditif.
CREATE INDEX IF NOT EXISTS idx_trx_jenis_aset ON transaksi_bmd(jenis, aset_id);

-- ============================================================================
-- ⚠️ VERIFIKASI (Fase 1) — WAJIB sebelum halaman disambung ke RPC.
--
-- CATATAN: fungsi ini SECURITY DEFINER + gate keamanan berbasis auth.uid().
-- Di SQL Editor kamu = role `postgres` (auth.uid() NULL) → gate nolak SEMUA
-- baris → SELECT * FROM fn_daftar_barang(...) balik 0 (WAJAR, sama spt fungsi
-- rekap). Jadi verifikasi LOGIKA (visibility+kepemilikan+filter) pakai query
-- di bawah ini yg TANPA gate keamanan (jalan sbg postgres, lihat semua) — lalu
-- bandingkan total_count & grand_total-nya dgn yg ditampilkan APP di Daftar
-- Barang utk golongan+semester+SKPD yg SAMA. Kalau IDENTIK → logika benar.
--
-- Ganti :gol dan :periode sesuai uji (mulai golongan KECIL: 1.5.3 / 1.3.6 /
-- 1.3.1, di mana versi JS lama masih jalan & bisa dibandingkan). SKPD = Semua.
--
--   WITH
--   owner_at AS (
--     SELECT t.aset_id, COALESCE(
--       (array_agg(t.skpd_tujuan ORDER BY t.periode DESC, t.id DESC)
--          FILTER (WHERE t.periode <= :periode))[1],
--       (array_agg(t.skpd_asal ORDER BY t.periode ASC, t.id ASC))[1]) AS owner_skpd
--     FROM transaksi_bmd t WHERE t.jenis='pengalihan_status' GROUP BY t.aset_id),
--   hidden AS (
--     SELECT x.aset_id FROM (
--       SELECT DISTINCT ON (t.aset_id) t.aset_id, t.jenis FROM transaksi_bmd t
--       WHERE t.jenis = ANY(ARRAY['kapitalisasi_serap','penghapusan_pemindahtanganan',
--         'penghapusan_sebab_lain','batal_pengadaan','koreksi_pencatatan_ganda',
--         'batal_hibah_masuk','batal_tukar_menukar','batal_hasil_inventarisasi',
--         'batal_perolehan_lainnya','kdp_selesai_keluar','pemecahan_keluar',
--         'batal_pemecahan_masuk','batal_kapitalisasi','batal_penghapusan','batal_pemecahan'])
--         AND t.periode <= :periode
--       ORDER BY t.aset_id, t.periode DESC, t.id DESC) x
--     WHERE x.jenis = ANY(ARRAY['kapitalisasi_serap','penghapusan_pemindahtanganan',
--       'penghapusan_sebab_lain','batal_pengadaan','koreksi_pencatatan_ganda',
--       'batal_hibah_masuk','batal_tukar_menukar','batal_hasil_inventarisasi',
--       'batal_perolehan_lainnya','kdp_selesai_keluar','pemecahan_keluar','batal_pemecahan_masuk']))
--   SELECT count(*) AS total_count, COALESCE(sum(a.nilai_perolehan),0) AS grand_total
--   FROM aset a LEFT JOIN owner_at oa ON oa.aset_id=a.id
--   WHERE a.status<>'draft' AND a.kode LIKE :gol||'.%'
--     AND NOT EXISTS (SELECT 1 FROM hidden h WHERE h.aset_id=a.id)
--     AND (a.tgl_perolehan IS NULL OR fn_periode_dari_tanggal(a.tgl_perolehan) <= :periode);
--   -- Bandingkan total_count & grand_total ke baris TOTAL di Daftar Barang app
--   -- (golongan sama, SKPD=Semua, Komptabel=Semua, semester sama). HARUS SAMA.
-- ============================================================================
