-- Asisten AI — alat `cari_barang` pindah ke fungsi SQL ber-index (2026-09-30).
--
-- GEJALA: admin bertanya "sepeda motor nopol AG 3837 GP ada di SKPD mana?" →
-- "Pencarian gagal dibaca: canceling statement due to statement timeout".
--
-- SEBABNYA KODE, BUKAN SERVER. Alat lama menembak PostgREST:
--   nama_barang ILIKE '%q%' OR nibar ILIKE '%q%' OR kode ILIKE 'q%'
-- Tak satu pun bisa dilayani index, jadi Postgres menyapu SELURUH `aset`.
-- Untuk pengurus SKPD itu tak terasa (RLS menyempitkannya ke SKPD-nya lebih
-- dulu), tapi admin melihat se-kabupaten: terukur Seq Scan, "Rows Removed by
-- Filter: 906.802", 7.728 ms — pagu `authenticated` 8.000 ms. Dan nomor polisi
-- memang tak pernah ikut dicari, jadi seandainya selesai pun hasilnya 0 baris.
--
-- Index yang tepat SUDAH ADA — `idx_aset_teks_cari_trgm` (GIN trigram atas
-- fn_aset_teks_cari: nama, kode, NIBAR, kode register, merek, no. polisi/
-- rangka/mesin, alamat, wilayah, keterangan) — tapi tak terpakai dari jalur
-- PostgREST: `ILIKE` tidak leakproof, jadi di bawah RLS ia dievaluasi SESUDAH
-- qual policy & tak pernah turun jadi index-cond (diukur: predikat yang sama
-- lewat RLS tetap Seq Scan 14.897 ms; tanpa RLS Bitmap Index Scan 165 ms).
--
-- Obatnya pola yang sama dgn fn_daftar_barang: SECURITY DEFINER + cakupan
-- ditegakkan SENDIRI di badan fungsi.
--   admin / pengawas → seluruh kabupaten
--   lainnya          → skpd_id = ANY (fn_my_skpd_scope())
-- ⚠️ Lebih SEMPIT dari policy `aset_select` (yang juga meloloskan aset yang
-- "pernah dikelola") — sengaja: alat ini menjawab "barang di SKPD Anda".
-- ⚠️ Tanpa sesi (auth.uid() NULL) cakupannya NULL → 0 baris. EXECUTE dicabut
-- dari anon & PUBLIC.
--
-- TERUKUR (RLS aktif): admin "AG 3837 GP" 7.728 ms/timeout → 68 ms (ketemu 1:
-- Sepeda Motor, BKAD); admin "kursi" 4 ms; pengurus Dinas Pendidikan mencari
-- nopol milik BKAD → 0 baris (cakupan ditegakkan).
--
-- Kata kunci < 3 karakter DITOLAK: trigram butuh minimal 3 karakter; di
-- bawah itu index tak terpakai & query kembali menyapu seluruh tabel.
-- TANPA ORDER BY, sengaja: mengurutkan ratusan ribu baris yang cocok ("kursi")
-- hanya untuk mengambil 30 membuang seluruh untungnya. Alat ini untuk MENEMUKAN
-- barang; menghitung pakai hitung_barang.
--
-- DEPLOY-ORDERING: jalankan SEBELUM deploy kode. Kalau terbalik, kode baru
-- jatuh ke query lama (perilaku sebelum migrasi ini) — tak ada yang rusak.

CREATE OR REPLACE FUNCTION fn_chatbot_cari_barang(
  p_kata text, p_golongan text DEFAULT NULL, p_limit integer DEFAULT 30
)
RETURNS TABLE (nibar text, kode text, nama_barang text, uraian_barang text, merek_tipe text,
  no_polisi text, no_rangka text, no_mesin text, nilai_perolehan numeric, tgl_perolehan date,
  intra_ekstra text, kondisi_barang text, skpd_id bigint, skpd_nama text)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
SET plan_cache_mode = force_custom_plan
AS $$
DECLARE
  v_semua boolean := fn_is_admin() OR fn_is_viewer();
  v_scope bigint[];
  v_q text := btrim(coalesce(p_kata, ''));
BEGIN
  IF char_length(v_q) < 3 THEN
    RAISE EXCEPTION 'kata kunci minimal 3 karakter';
  END IF;
  IF NOT v_semua THEN v_scope := fn_my_skpd_scope(); END IF;
  -- Metakarakter LIKE dari pengguna dijadikan harfiah.
  v_q := replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_');

  RETURN QUERY
  SELECT a.nibar::text, a.kode::text, a.nama_barang::text, a.uraian_barang::text, a.merek_tipe::text,
         a.no_polisi::text, a.no_rangka::text, a.no_mesin::text, a.nilai_perolehan, a.tgl_perolehan,
         a.intra_ekstra::text, a.kondisi_barang::text, a.skpd_id, s.nama::text
  FROM aset a
  LEFT JOIN admin_skpd s ON s.id = a.skpd_id
  WHERE a.status = 'aktif'
    -- ⚠️ Ekspresi ini KEMBAR dgn definisi idx_aset_teks_cari_trgm: beda satu
    -- argumen saja, index-nya diabaikan DIAM-DIAM & query kembali menyapu tabel.
    AND fn_aset_teks_cari(a.nama_barang, a.kode, a.nibar, a.kode_register, a.merek_tipe,
          a.no_polisi, a.no_rangka, a.no_mesin, a.alamat_detail, a.wilayah_kode, a.keterangan)
        ILIKE '%' || v_q || '%'
    AND (v_semua OR a.skpd_id = ANY (v_scope))
    AND (p_golongan IS NULL OR a.golongan = p_golongan)
  LIMIT LEAST(GREATEST(coalesce(p_limit, 30), 1), 50);
END;
$$;

REVOKE ALL ON FUNCTION fn_chatbot_cari_barang(text, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fn_chatbot_cari_barang(text, text, integer) TO authenticated;
