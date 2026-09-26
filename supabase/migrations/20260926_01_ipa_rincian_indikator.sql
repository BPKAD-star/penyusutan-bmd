-- ============================================================================
-- 20260926_01 — `fn_ipa_rincian`: RINCIAN per indikator otomatis IPA (tombol 👁)
--
-- Permintaan user 2026-09-26: halaman Capaian SKPD menampilkan tiap indikator
-- dgn aksi di barisnya sendiri. Indikator isian (TL BPK/Inspektorat,
-- Rekonsiliasi, Pajak) punya pop-up "Isi Capaian"; indikator OTOMATIS dapat
-- tombol 👁 yang membuka daftar "mana yang sudah terpenuhi & mana yang perlu
-- ditindaklanjuti". Fungsi ini sumber daftar itu.
--
-- ⚠️ PREDIKATNYA KEMBAR dgn `fn_ipa_hitung_otomatis` (20260925_03 + aset idle
-- 20260925_05). Fungsi ini TIDAK menghitung skor — skor tetap dari snapshot
-- `ipa_otomatis`. Ia cuma memecah populasi yang SAMA jadi baris per barang /
-- per dokumen. Kalau salah satu diubah, ubah dua-duanya; pemeriksaan silang di
-- akhir berkas membandingkan jumlahnya.
--
-- Keluaran per baris:
--   o_keadaan  'ok' (terpenuhi) · 'kurang' (perlu ditindaklanjuti) · 'info'
--   o_judul    nama barang / nomor dokumen
--   o_sub      NIBAR / kode / tanggal
--   o_ket      penjelasan (apa yang kurang, kapan diajukan, dst.)
--   o_nilai    angka pendukung (jumlah kolom kosong, selisih hari, rupiah)
--   o_ref      NIBAR (untuk tautan KIBAR) — NULL kalau barisnya bukan barang
-- Nama kolom sengaja berawalan `o_`: di plpgsql kolom RETURNS TABLE jadi
-- variabel, dan `status`/`keterangan`/`nilai` adalah nama kolom tabel yang
-- dibaca di sini — nama kembar membuat referensi ambigu.
--
-- Indikator isian (AKT_TLBPK, AKT_TLINSP, KEP_REKON, LEG_PAJAK) → kosong;
-- rinciannya sudah ada di pop-up pengisiannya masing-masing.
--
-- SECURITY DEFINER + wewenang dicek di awal (sama persis dgn
-- fn_ipa_hitung_otomatis): membaca register lintas RLS. Tak menulis apa pun.
-- Tak ada perubahan tabel. Boleh dijalankan kapan saja; kode yang
-- memanggilnya menampilkan pesan error biasa kalau fungsinya belum ada.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_ipa_rincian(
  p_tahun int, p_skpd_id bigint, p_indikator text, p_limit int DEFAULT 2000)
RETURNS TABLE (o_keadaan text, o_judul text, o_sub text, o_ket text, o_nilai numeric, o_ref text)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public SET work_mem TO '64MB'
AS $$
#variable_conflict use_column
DECLARE
  v_scope     bigint[];
  v_awal      date := make_date(p_tahun, 1, 1);
  v_akhir     date := make_date(p_tahun, 12, 31);
  v_hari_ini  date := (now() AT TIME ZONE 'Asia/Jakarta')::date;
  v_batas_rk  date;
  v_hari_ent  int;
  v_limit     int := LEAST(GREATEST(COALESCE(p_limit, 2000), 1), 5000);
BEGIN
  IF NOT (fn_is_admin() OR fn_is_viewer() OR fn_skpd_visible(p_skpd_id)) THEN
    RAISE EXCEPTION 'Tidak berwenang melihat IPA SKPD ini.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM ipa_skpd s WHERE s.skpd_id = p_skpd_id) THEN
    RAISE EXCEPTION 'SKPD % bukan SKPD penilaian IPA.', p_skpd_id;
  END IF;
  v_scope := fn_ipa_scope(p_skpd_id);
  v_batas_rk := make_date(p_tahun,
    (SELECT pr.nilai::int FROM ipa_parameter pr WHERE pr.kunci = 'batas_rkbmd_bulan'),
    (SELECT pr.nilai::int FROM ipa_parameter pr WHERE pr.kunci = 'batas_rkbmd_tanggal'));
  v_hari_ent := (SELECT pr.nilai::int FROM ipa_parameter pr WHERE pr.kunci = 'batas_hari_entry');

  -- ── INT_KELENGKAPAN — per barang aktif: kolom wajib yang masih kosong ──
  IF p_indikator = 'INT_KELENGKAPAN' THEN
    RETURN QUERY
    SELECT CASE WHEN cardinality(k.kurang) = 0 THEN 'ok' ELSE 'kurang' END,
           COALESCE(nullif(btrim(k.nama_barang), ''), k.uraian_barang, '-'),
           concat_ws(' · ', k.nibar, k.kode),
           CASE WHEN cardinality(k.kurang) = 0 THEN 'Lengkap'
                ELSE 'Belum diisi: ' || array_to_string(k.kurang, ', ') END,
           cardinality(k.kurang)::numeric,
           k.nibar
    FROM (
      SELECT x.nama_barang, x.uraian_barang, x.nibar, x.kode,
        array_remove(ARRAY[
          CASE WHEN nullif(btrim(x.nama_barang),'') IS NULL THEN 'spesifikasi nama barang' END,
          CASE WHEN nullif(btrim(x.spesifikasi_lainnya),'') IS NULL THEN 'spesifikasi lainnya' END,
          CASE WHEN nullif(btrim(x.wilayah_kode),'') IS NULL THEN 'wilayah' END,
          CASE WHEN nullif(btrim(x.alamat_detail),'') IS NULL THEN 'alamat' END,
          CASE WHEN x.latitude IS NULL OR x.longitude IS NULL THEN 'titik koordinat' END,
          CASE WHEN nullif(btrim(x.kondisi_barang),'') IS NULL THEN 'kondisi' END,
          CASE WHEN nullif(btrim(x.penggunaan_pengamanan),'') IS NULL THEN 'penggunaan' END,
          CASE WHEN nullif(btrim(x.keterangan),'') IS NULL THEN 'keterangan' END,
          CASE WHEN COALESCE(cardinality(x.foto_paths), 0) = 0 THEN 'foto' END,
          CASE WHEN g.merek AND nullif(btrim(x.merek_tipe),'') IS NULL THEN 'merk/tipe' END,
          CASE WHEN g.luas AND NOT (COALESCE(x.luas,0) > 0 OR EXISTS (
                 SELECT 1 FROM aset_bidang_tanah bt WHERE bt.aset_id = x.id AND COALESCE(bt.luas,0) > 0))
               THEN 'luas' END,
          CASE WHEN g.kend AND nullif(btrim(x.no_polisi),'') IS NULL THEN 'no polisi' END,
          CASE WHEN g.kend AND nullif(btrim(x.no_rangka),'') IS NULL THEN 'no rangka' END,
          CASE WHEN g.kend AND nullif(btrim(x.no_mesin),'') IS NULL THEN 'no mesin' END,
          CASE WHEN g.kend AND nullif(btrim(x.no_bpkb),'') IS NULL THEN 'no BPKB' END
        ]::text[], NULL) AS kurang
      FROM aset x
      CROSS JOIN LATERAL (SELECT
        x.golongan IN ('1.3.2','1.3.5','1.3.6','1.5.3','1.5.4') AS merek,
        x.golongan IN ('1.3.1','1.3.3','1.3.4') AS luas,
        x.kode LIKE '1.3.2.02.01.%' AS kend) g
      WHERE x.status = 'aktif' AND x.skpd_id = ANY (v_scope)
    ) k
    ORDER BY cardinality(k.kurang) DESC, k.kode, k.nama_barang, k.nibar
    LIMIT v_limit;
    RETURN;
  END IF;

  -- ── KEP_RKBMD — lima jenis RKBMD TA berikutnya ──
  IF p_indikator = 'KEP_RKBMD' THEN
    RETURN QUERY
    -- Sebelum batas lewat, jenis yang belum diajukan belum jatuh tempo →
    -- 'info' (di hitungan otomatis ia juga tak masuk penyebut).
    SELECT CASE WHEN d.tepat THEN 'ok' WHEN v_hari_ini <= v_batas_rk THEN 'info' ELSE 'kurang' END,
           'RKBMD ' || initcap(j.jenis) || ' TA ' || (p_tahun + 1),
           'Batas ' || to_char(v_batas_rk, 'DD-MM-YYYY'),
           CASE
             WHEN d.tepat THEN 'Diajukan ' || to_char(d.tgl_ajukan, 'DD-MM-YYYY') || ' — tepat waktu'
             WHEN d.tgl_ajukan IS NOT NULL THEN 'Diajukan ' || to_char(d.tgl_ajukan, 'DD-MM-YYYY') || ' — melewati batas'
             WHEN d.ada THEN 'Ada dokumen berstatus ' || d.status_akhir || ', belum diajukan'
             WHEN v_hari_ini <= v_batas_rk THEN 'Belum disusun — batas belum lewat'
             ELSE 'Belum diajukan sampai batas lewat'
           END,
           NULL::numeric, NULL::text
    FROM unnest(ARRAY['pengadaan','pemeliharaan','pemanfaatan','pemindahtanganan','penghapusan']) AS j(jenis)
    CROSS JOIN LATERAL (
      SELECT
        count(*) > 0 AS ada,
        min((COALESCE(rk.diajukan_at, rk.approved_at) AT TIME ZONE 'Asia/Jakarta')::date)
          FILTER (WHERE rk.status IN ('diajukan','disetujui')) AS tgl_ajukan,
        COALESCE(bool_or(rk.status IN ('diajukan','disetujui')
          AND (COALESCE(rk.diajukan_at, rk.approved_at) AT TIME ZONE 'Asia/Jakarta')::date <= v_batas_rk), false) AS tepat,
        (array_agg(rk.status ORDER BY rk.created_at DESC))[1] AS status_akhir
      FROM rkbmd rk
      WHERE rk.skpd_id = ANY (v_scope) AND rk.tahun_anggaran = p_tahun + 1
        AND rk.versi = 'murni' AND rk.jenis = j.jenis
    ) d
    ORDER BY d.tepat, (v_hari_ini <= v_batas_rk), j.jenis;
    RETURN;
  END IF;

  -- ── KEP_ENTRY — per kartu Pengadaan ber-BAST di tahun penilaian ──
  IF p_indikator = 'KEP_ENTRY' THEN
    RETURN QUERY
    SELECT CASE WHEN e.selisih <= v_hari_ent THEN 'ok' ELSE 'kurang' END,
           COALESCE(nullif(btrim(e.no_sk), ''), '(tanpa nomor)'),
           'BAST ' || to_char(e.tgl, 'DD-MM-YYYY') || ' · di-entry ' || to_char(e.tgl_entry, 'DD-MM-YYYY')
             || COALESCE(' · ' || nullif(btrim(e.penyedia), ''), ''),
           e.selisih || ' hari' || CASE WHEN e.selisih > v_hari_ent
             THEN ' — melewati batas ' || v_hari_ent || ' hari' ELSE '' END,
           e.selisih::numeric, NULL::text
    FROM (
      SELECT h.no_sk, h.payload->>'nama_penyedia' AS penyedia, t.tgl,
             (h.created_at AT TIME ZONE 'Asia/Jakarta')::date AS tgl_entry,
             (h.created_at AT TIME ZONE 'Asia/Jakarta')::date - t.tgl AS selisih
      FROM jurnal_header h
      CROSS JOIN LATERAL (SELECT COALESCE(CASE WHEN h.payload->>'tgl_bast' ~ '^\d{4}-\d{2}-\d{2}$' THEN (h.payload->>'tgl_bast')::date END, h.tanggal) AS tgl) t
      WHERE h.kategori = 'pengadaan' AND h.approval_status <> 'ditolak'
        AND h.skpd_id = ANY (v_scope) AND t.tgl BETWEEN v_awal AND v_akhir
    ) e
    ORDER BY (e.selisih <= v_hari_ent), e.selisih DESC, e.tgl
    LIMIT v_limit;
    RETURN;
  END IF;

  -- ── AKT_TLRB — aset rusak berat: diusulkan hapus / dihapus / belum ──
  IF p_indikator = 'AKT_TLRB' THEN
    RETURN QUERY
    WITH rb AS (
      SELECT x.id, x.nama_barang, x.uraian_barang, x.nibar, x.kode,
        x.kode LIKE '1.5.4.01.01.01.%' AS direklas,
        EXISTS (SELECT 1 FROM rkbmd_item i JOIN rkbmd rk ON rk.id = i.rkbmd_id
                 WHERE i.aset_id = x.id AND rk.jenis = 'penghapusan'
                   AND rk.status IN ('diajukan','disetujui')) AS diusulkan,
        false AS dihapus
      FROM aset x
      WHERE x.status = 'aktif' AND x.skpd_id = ANY (v_scope)
        AND (x.kondisi_barang = 'Rusak Berat' OR x.kode LIKE '1.5.4.01.01.01.%')
      UNION ALL
      SELECT x.id, x.nama_barang, x.uraian_barang, x.nibar, x.kode, false, false, true
      FROM aset x
      WHERE x.status = 'dihapus' AND x.skpd_id = ANY (v_scope)
        AND (x.kondisi_barang = 'Rusak Berat' OR x.kode LIKE '1.5.4.01.01.01.%')
        AND EXISTS (SELECT 1 FROM transaksi_bmd t WHERE t.aset_id = x.id
                     AND t.jenis IN ('penghapusan_pemindahtanganan','penghapusan_sebab_lain')
                     AND t.tanggal BETWEEN v_awal AND v_akhir)
    )
    SELECT CASE WHEN rb.diusulkan OR rb.dihapus THEN 'ok' ELSE 'kurang' END,
           COALESCE(nullif(btrim(rb.nama_barang), ''), rb.uraian_barang, '-'),
           concat_ws(' · ', rb.nibar, rb.kode),
           CASE WHEN rb.dihapus THEN 'Dihapus tahun ini'
                WHEN rb.diusulkan THEN 'Diusulkan di RKBMD Penghapusan'
                ELSE 'Belum diusulkan di RKBMD Penghapusan'
                     || CASE WHEN rb.direklas THEN ' (sudah direklas ke Aset Lain-Lain RB — tidak dihitung TL)' ELSE '' END
           END,
           NULL::numeric, rb.nibar
    FROM rb
    ORDER BY (rb.diusulkan OR rb.dihapus), rb.kode, rb.nama_barang, rb.nibar
    LIMIT v_limit;
    RETURN;
  END IF;

  -- ── AKT_REALISASI — rencana (RKBMD Pengadaan disetujui) & realisasi per kartu ──
  IF p_indikator = 'AKT_REALISASI' THEN
    RETURN QUERY
    WITH dok AS (
      SELECT DISTINCT ON (rk.skpd_id) rk.id, rk.versi, rk.skpd_id
      FROM rkbmd rk
      WHERE rk.jenis = 'pengadaan' AND rk.tahun_anggaran = p_tahun AND rk.status = 'disetujui'
        AND rk.skpd_id = ANY (v_scope)
      ORDER BY rk.skpd_id, (rk.versi = 'perubahan') DESC, rk.approved_at DESC NULLS LAST
    ),
    rencana AS (
      SELECT 'info'::text AS keadaan,
             'Rencana — RKBMD Pengadaan TA ' || p_tahun || ' (' || d.versi || ')' AS judul,
             (SELECT s.nama FROM admin_skpd s WHERE s.id = d.skpd_id) AS sub,
             count(i.id) || ' item disetujui' AS ket,
             COALESCE(sum(i.total_anggaran), 0)::numeric AS nilai
      FROM dok d LEFT JOIN rkbmd_item i ON i.rkbmd_id = d.id
      GROUP BY d.id, d.versi, d.skpd_id
    ),
    realisasi AS (
      SELECT 'info'::text AS keadaan,
             'Realisasi — ' || COALESCE(nullif(btrim(h.no_sk), ''), '(tanpa kartu)') AS judul,
             CASE WHEN bool_or(t.jenis = 'akumulasi_kdp') THEN 'Pekerjaan konstruksi (termin KDP)' ELSE 'Pengadaan' END AS sub,
             count(*) || ' baris transaksi' AS ket,
             COALESCE(sum(t.nilai), 0)::numeric AS nilai
      FROM transaksi_bmd t
      LEFT JOIN jurnal_header h ON h.id = t.header_id
      WHERE t.jenis IN ('pengadaan','akumulasi_kdp') AND t.tanggal BETWEEN v_awal AND v_akhir
        AND t.skpd_tujuan = ANY (v_scope)
        AND NOT EXISTS (SELECT 1 FROM transaksi_bmd v WHERE v.aset_id = t.aset_id
                         AND v.jenis IN ('batal_pengadaan','batal_akumulasi_kdp'))
      GROUP BY h.id, h.no_sk
    )
    SELECT r.keadaan, r.judul, r.sub, r.ket, r.nilai, NULL::text
    FROM (SELECT *, 1 AS urut FROM rencana UNION ALL SELECT *, 2 FROM realisasi) r
    ORDER BY r.urut, r.nilai DESC
    LIMIT v_limit;
    RETURN;
  END IF;

  -- ── LEG_TANAH — per register tanah: bidang bersertifikat / seluruh bidang ──
  IF p_indikator = 'LEG_TANAH' THEN
    RETURN QUERY
    SELECT CASE WHEN q.lengkap THEN 'ok' ELSE 'kurang' END,
           COALESCE(nullif(btrim(q.nama_barang), ''), q.uraian_barang, '-'),
           concat_ws(' · ', q.nibar, q.kode),
           CASE WHEN q.nb > 0 THEN q.nb_ser || ' dari ' || q.nb || ' bidang bersertifikat'
                WHEN q.ser_register THEN 'Bersertifikat (dokumen register, belum ada bidang)'
                ELSE 'Belum bersertifikat (belum ada bidang bersertifikat)' END,
           (GREATEST(q.nb, 1) - CASE WHEN q.nb > 0 THEN q.nb_ser WHEN q.ser_register THEN 1 ELSE 0 END)::numeric,
           q.nibar
    FROM (
      SELECT x.nama_barang, x.uraian_barang, x.nibar, x.kode, bd.nb, bd.nb_ser,
             nullif(btrim(x.nomor_dokumen_kepemilikan),'') IS NOT NULL AS ser_register,
             CASE WHEN bd.nb > 0 THEN bd.nb_ser = bd.nb
                  ELSE nullif(btrim(x.nomor_dokumen_kepemilikan),'') IS NOT NULL END AS lengkap
      FROM aset x
      CROSS JOIN LATERAL (
        SELECT count(*) AS nb,
               count(*) FILTER (WHERE nullif(btrim(bt.nomor_dokumen_kepemilikan),'') IS NOT NULL) AS nb_ser
        FROM aset_bidang_tanah bt WHERE bt.aset_id = x.id) bd
      WHERE x.status = 'aktif' AND x.golongan = '1.3.1' AND x.skpd_id = ANY (v_scope)
    ) q
    ORDER BY q.lengkap, q.kode, q.nama_barang, q.nibar
    LIMIT v_limit;
    RETURN;
  END IF;

  -- ── EKO_IDLE — aset idle (tanah & gedung) & perjanjian pemanfaatannya ──
  -- o_nilai = pendapatan per tahun perjanjian yang memuat aset itu. Satu
  -- perjanjian bisa memuat beberapa aset idle, jadi Σ o_nilai di sini BISA
  -- lebih besar dari pembilang (yang menghitung tiap perjanjian sekali).
  -- Angka per baris untuk ditelusuri, bukan untuk dijumlah.
  IF p_indikator = 'EKO_IDLE' THEN
    RETURN QUERY
    WITH anggota AS (
      SELECT DISTINCT ON (t.header_id, t.aset_id) t.header_id, t.aset_id, t.jenis
      FROM transaksi_bmd t
      WHERE t.jenis IN ('pemanfaatan','pemanfaatan_selesai','batal_pemanfaatan') AND t.header_id IS NOT NULL
      ORDER BY t.header_id, t.aset_id, t.id DESC
    ),
    perjanjian AS (
      SELECT m.aset_id,
             string_agg(COALESCE(h.payload->>'jenis_pemanfaatan', '?') || ' — ' || COALESCE(nullif(btrim(h.payload->>'mitra'), ''), '-'), '; ') AS ket,
             sum(COALESCE(CASE WHEN h.payload->>'nilai_pemanfaatan' ~ '^[0-9]+(\.[0-9]+)?$' THEN (h.payload->>'nilai_pemanfaatan')::numeric END, 0)
                 / GREATEST(COALESCE(CASE WHEN h.payload->>'masa_tahun' ~ '^[0-9]+(\.[0-9]+)?$' THEN (h.payload->>'masa_tahun')::numeric END, 1), 1)) AS per_tahun
      FROM anggota m
      JOIN jurnal_header h ON h.id = m.header_id
      WHERE m.jenis <> 'batal_pemanfaatan'
        AND h.kategori = 'pemanfaatan'
        AND h.payload->>'jenis_pemanfaatan' IN ('sewa','ksp','bgs_bsg','kspi')
        AND COALESCE(CASE WHEN h.payload->>'mulai' ~ '^\d{4}-\d{2}-\d{2}$' THEN (h.payload->>'mulai')::date END, h.tanggal) <= v_akhir
        AND COALESCE(CASE WHEN h.payload->>'berakhir' ~ '^\d{4}-\d{2}-\d{2}$' THEN (h.payload->>'berakhir')::date END, v_akhir) >= v_awal
      GROUP BY m.aset_id
    )
    SELECT CASE WHEN p.aset_id IS NOT NULL THEN 'ok' ELSE 'kurang' END,
           COALESCE(nullif(btrim(x.nama_barang), ''), x.uraian_barang, '-'),
           concat_ws(' · ', x.nibar, x.kode) || ' · nilai perolehan ' || to_char(x.nilai_perolehan, 'FM999G999G999G999G990'),
           CASE WHEN p.aset_id IS NOT NULL THEN 'Dimanfaatkan: ' || p.ket
                ELSE 'Belum dimanfaatkan (tak ada perjanjian berpendapatan tahun ini)' END,
           COALESCE(p.per_tahun, 0)::numeric,
           x.nibar
    FROM aset x
    LEFT JOIN perjanjian p ON p.aset_id = x.id
    WHERE x.status = 'aktif' AND x.kode IN ('1.5.4.01.01.02.001', '1.5.4.01.01.02.003')
      AND x.skpd_id = ANY (v_scope)
    ORDER BY (p.aset_id IS NOT NULL), x.nilai_perolehan DESC, x.nibar
    LIMIT v_limit;
    RETURN;
  END IF;

  -- Indikator isian (TL BPK/Inspektorat, Rekonsiliasi, Pajak) atau kode tak
  -- dikenal: tak ada rincian di sini.
  RETURN;
END $$;

REVOKE ALL ON FUNCTION public.fn_ipa_rincian(int, bigint, text, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_ipa_rincian(int, bigint, text, int) TO authenticated;

-- ── PEMERIKSAAN SILANG (jalankan sesudah migrasi; ganti 45 dgn skpd_id) ────
-- Jumlah baris 'ok'/'kurang' harus cocok dgn pembilang/penyebut hitungan
-- otomatis (kecuali INT_KELENGKAPAN, yang dihitung per KOLOM, bukan per
-- barang — di sana cocokkan Σ o_nilai = penyebut − pembilang):
--
--   SET LOCAL role authenticated;  -- (opsional, uji sbg pengguna)
--   SELECT h.indikator, h.pembilang, h.penyebut,
--          (SELECT count(*) FILTER (WHERE o_keadaan = 'ok') FROM fn_ipa_rincian(2026, 45, h.indikator, 5000)) AS ok,
--          (SELECT count(*) FROM fn_ipa_rincian(2026, 45, h.indikator, 5000) WHERE o_keadaan <> 'info') AS semua,
--          (SELECT sum(o_nilai) FROM fn_ipa_rincian(2026, 45, h.indikator, 5000)) AS sum_nilai
--   FROM fn_ipa_hitung_otomatis(2026, 45) h;
