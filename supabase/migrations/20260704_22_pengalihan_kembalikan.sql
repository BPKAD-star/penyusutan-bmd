-- ============================================================================
-- Pengalihan Status: "satu pintu" + Pengembalian di sisi penerima + kepemilikan
-- period-aware. Jalankan SETELAH 20260704_21_pengalihan_status.sql.
--
-- Perubahan alur (keputusan operator):
--   - SATU PINTU. Setelah SKPD tujuan MENERIMA barang, SKPD asal (pengirim)
--     TIDAK bisa apa-apa lagi (kartu jadi read-only). Dulu pengirim masih bisa
--     "batal per barang" pasca-setuju — itu dicabut.
--   - PENGEMBALIAN ada di SKPD PENERIMA: tombol "Kembalikan" → barang balik ke
--     SKPD asal. Ini PERISTIWA BARU di periode berjalan (bukan dibekukan ke
--     periode jurnal asli seperti fn_batal_pengalihan_barang lama), supaya
--     laporan periode ANTARA transfer & pengembalian tetap menunjukkan barang
--     di SKPD penerima, dan sejak periode pengembalian balik ke SKPD asal.
--
-- Kepemilikan period-aware: pemilik aset pada periode V dihitung dari replay
-- ledger 'pengalihan_status' (skpd_tujuan baris terakhir dgn periode <= V;
-- baris reversal = skpd_tujuan berisi SKPD asal). Logika ada di sisi aplikasi
-- (lib/pengalihan.ts) — SQL cuma perlu memastikan RLS mengizinkan SKPD asal
-- tetap MELIHAT aset yang pernah dikelolanya walau kini dipegang SKPD lain.
-- ============================================================================

-- ── 1. Ganti fn_batal_pengalihan_barang → fn_kembalikan_pengalihan_barang ───
-- Beda: (a) HANYA SKPD penerima/admin (pengirim tak boleh); (b) dicatat di
-- PERIODE BERJALAN (current_date), bukan periode jurnal asli.
DROP FUNCTION IF EXISTS fn_batal_pengalihan_barang(uuid, uuid);

CREATE OR REPLACE FUNCTION fn_kembalikan_pengalihan_barang(p_header_id uuid, p_aset_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_h       jurnal_header%ROWTYPE;
  v_aset    RECORD;
  v_periode text;
BEGIN
  SELECT * INTO v_h FROM jurnal_header WHERE id = p_header_id FOR UPDATE;
  IF NOT FOUND OR v_h.kategori <> 'pengalihan_status' OR v_h.approval_status <> 'disetujui' THEN
    RAISE EXCEPTION 'Jurnal pengalihan yang sudah disetujui tidak ditemukan.';
  END IF;
  -- SATU PINTU: hanya SKPD penerima (tujuan) atau admin. SKPD asal tak berwenang.
  IF NOT (fn_is_admin() OR fn_skpd_visible(v_h.skpd_tujuan)) THEN
    RAISE EXCEPTION 'Hanya SKPD penerima (atau admin) yang boleh mengembalikan barang ini.';
  END IF;

  SELECT id, skpd_id, nilai_perolehan, nama_barang, nibar INTO v_aset
  FROM aset WHERE id = p_aset_id FOR UPDATE;
  IF NOT FOUND OR v_aset.skpd_id IS DISTINCT FROM v_h.skpd_tujuan THEN
    RAISE EXCEPTION 'Barang "%" sudah tidak berada di SKPD penerima — tidak bisa dikembalikan dari jurnal ini.',
      COALESCE(v_aset.nama_barang, p_aset_id::text);
  END IF;

  v_periode := fn_periode_dari_tanggal(current_date);

  INSERT INTO transaksi_bmd (aset_id, jenis, periode, tanggal, nilai, skpd_asal, skpd_tujuan, header_id, payload, keterangan)
  VALUES (v_aset.id, 'pengalihan_status', v_periode, current_date, COALESCE(v_aset.nilai_perolehan, 0),
          v_h.skpd_tujuan, v_h.skpd_id, v_h.id,
          jsonb_build_object('no_sk', v_h.no_sk, 'reversal', true),
          'Pengembalian pengalihan status — kembali ke SKPD asal (' || v_h.no_sk || ')');
  UPDATE aset SET skpd_id = v_h.skpd_id WHERE id = v_aset.id;
END $$;

-- ── 2. Visibilitas aset lintas-pemilik (utk kepemilikan period-aware) ───────
-- Non-admin: aset yang sudah dialihkan ke SKPD lain kini punya skpd_id di luar
-- subtree pengirim → RLS lama menyembunyikannya, padahal pengirim perlu tetap
-- melihatnya di laporan periode SEBELUM transfer. Helper SECURITY DEFINER
-- (bypass RLS transaksi_bmd → hindari rekursi policy aset↔transaksi_bmd).
CREATE OR REPLACE FUNCTION fn_aset_pernah_dikelola(p_aset_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM transaksi_bmd t
    WHERE t.aset_id = p_aset_id
      AND t.jenis = 'pengalihan_status'
      AND (fn_skpd_visible(t.skpd_asal) OR fn_skpd_visible(t.skpd_tujuan))
  )
$$;

DROP POLICY IF EXISTS "aset_select" ON aset;
CREATE POLICY "aset_select" ON aset FOR SELECT TO authenticated
  USING (fn_is_admin() OR fn_skpd_visible(skpd_id) OR fn_aset_pernah_dikelola(id));
