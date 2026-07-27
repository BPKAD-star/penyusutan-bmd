-- ============================================================================
-- Inventarisasi: wewenang VALIDASI turun ke SKPD induk (level 1).
--
-- LATAR (temuan user 2026-07-27): lembar kerja kini dibuat PER UNIT dgn lingkup
--   barang PERSIS milik unit itu (bukan subtree) — lihat perubahan generator di
--   components/inventarisasi/DaftarInventarisasi.tsx. Konsekuensinya jumlah
--   lembar banyak & berjenjang:
--     Level 1  Dinas Pendidikan
--     Level 2  UPTD Pendidikan TK & SD di <kecamatan>   (81 unit)
--     Level 3  SDN/TK                                    (±625 unit)
--   Sebelumnya fn_validasi_inventarisasi HANYA mengizinkan admin, sehingga
--   seluruh lembar sub-unit menumpuk di Pengelola Barang.
--
-- ATURAN (keputusan user 2026-07-27):
--   * Lembar milik SKPD level 1        → divalidasi ADMIN (Pengelola Barang).
--   * Lembar milik level 2 DAN level 3 → divalidasi Pengurus Barang SKPD
--     INDUK-nya (level 1) — LANGSUNG, bukan berjenjang.
--   Artinya UPTD (level 2) TIDAK boleh memvalidasi lembar SDN di bawahnya;
--   wewenang terpusat di SKPD induk. Ini SENGAJA berbeda dari
--   fn_is_pengurus_barang_atas (dipakai Cara Perolehan) yang mengizinkan SEMUA
--   leluhur — makanya dibuat helper sendiri, bukan memakai ulang yang itu.
--
-- Jalankan di Supabase SQL Editor SETELAH 20260727_03.
-- ============================================================================

-- ── Helper: saya Pengurus Barang di SKPD INDUK (root) unit ini? ─────────────
-- Root diambil dari ltree `path` lewat fn_skpd_root (sudah ada sejak 20260707_03,
-- di-recreate ke admin_skpd pada 20260710_04).
-- `s.id <> my.id` menjaga sifat STRICT: pengurus barang SKPD level 1 tidak bisa
-- memvalidasi lembar SKPD-nya SENDIRI — itu tetap wewenang admin/Pengelola.
CREATE OR REPLACE FUNCTION fn_is_pengurus_barang_skpd_induk(p_skpd_id bigint)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM admin_profiles p
    JOIN admin_skpd s ON s.id = p_skpd_id
    WHERE p.id = auth.uid()
      AND p.role = 'pengurus_barang'
      AND s.id <> p.skpd_id
      AND fn_skpd_root(s.id) = p.skpd_id
  )
$$;

-- ── Validasi: admin ATAU Pengurus Barang SKPD induk ─────────────────────────
-- Body lain TIDAK berubah dari 20260725_08.
CREATE OR REPLACE FUNCTION fn_validasi_inventarisasi(p_id uuid, p_catatan text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_h inventarisasi%ROWTYPE;
BEGIN
  SELECT * INTO v_h FROM inventarisasi WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Inventarisasi tidak ditemukan.'; END IF;

  IF NOT (fn_is_admin() OR fn_is_pengurus_barang_skpd_induk(v_h.skpd_id)) THEN
    RAISE EXCEPTION 'Hanya admin/Pengelola Barang, atau Pengurus Barang SKPD induk unit ini, yang boleh memvalidasi.';
  END IF;

  IF v_h.status <> 'diajukan' THEN
    RAISE EXCEPTION 'Hanya inventarisasi berstatus "diajukan" yang bisa divalidasi (status sekarang: %).', v_h.status;
  END IF;

  UPDATE inventarisasi
  SET status = 'divalidasi', divalidasi_at = now(), divalidasi_by = auth.uid(),
      catatan_validator = p_catatan
  WHERE id = p_id;
END $$;

REVOKE ALL ON FUNCTION fn_validasi_inventarisasi(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION fn_validasi_inventarisasi(uuid, text) TO authenticated;

-- ── Kembalikan: wewenang sama dgn validasi ──────────────────────────────────
CREATE OR REPLACE FUNCTION fn_kembalikan_inventarisasi(p_id uuid, p_catatan text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_h inventarisasi%ROWTYPE;
BEGIN
  IF p_catatan IS NULL OR btrim(p_catatan) = '' THEN
    RAISE EXCEPTION 'Alasan pengembalian wajib diisi.';
  END IF;

  SELECT * INTO v_h FROM inventarisasi WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Inventarisasi tidak ditemukan.'; END IF;

  IF NOT (fn_is_admin() OR fn_is_pengurus_barang_skpd_induk(v_h.skpd_id)) THEN
    RAISE EXCEPTION 'Hanya admin/Pengelola Barang, atau Pengurus Barang SKPD induk unit ini, yang boleh mengembalikan.';
  END IF;

  IF v_h.status NOT IN ('diajukan','divalidasi') THEN
    RAISE EXCEPTION 'Hanya inventarisasi "diajukan"/"divalidasi" yang bisa dikembalikan (status sekarang: %).', v_h.status;
  END IF;

  UPDATE inventarisasi
  SET status = 'dikembalikan', catatan_validator = p_catatan,
      divalidasi_at = NULL, divalidasi_by = NULL
  WHERE id = p_id;
END $$;

REVOKE ALL ON FUNCTION fn_kembalikan_inventarisasi(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION fn_kembalikan_inventarisasi(uuid, text) TO authenticated;

-- ⚠️ BELUM diterapkan (perlu keputusan terpisah): pemisahan tugas ala migrasi
-- 20260727_01 — yaitu melarang pengisi lembar memvalidasi lembarnya sendiri.
-- Sengaja tidak ditambahkan agar tak memblokir alur yang belum dikonfirmasi.

-- Verifikasi:
--   SELECT fn_skpd_root(<id_SDN>);            -- harus = id Dinas Pendidikan
--   -- login sbg pengurus barang Dinas Pendidikan:
--   SELECT fn_is_pengurus_barang_skpd_induk(<id_SDN>);   -- true
--   SELECT fn_is_pengurus_barang_skpd_induk(<id_UPTD>);  -- true
--   SELECT fn_is_pengurus_barang_skpd_induk(<id_Dinas>); -- false (lembar sendiri → admin)
