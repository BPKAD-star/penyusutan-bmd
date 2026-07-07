-- ============================================================================
-- Fix gap tahun_buku: fn_terima_pengalihan (migrasi 21) mencatat transaksi
-- 'pengalihan_status' pakai v_h.tanggal (tanggal dokumen sumber ASLI dari SKPD
-- pengirim) — kalau jurnal pending lama sampai tahunnya keburu ditutup (migrasi
-- 23), SKPD tujuan gagal Terima krn tanggal jatuh di tahun terkunci.
--
-- Keputusan (user 2026-07-07): pengalihan dianggap RESMI TERJADI pada tanggal
-- SKPD tujuan mengklik Terima — BUKAN tanggal dokumen sumber. Konsisten dgn
-- fn_kembalikan_pengalihan_barang (migrasi 22) yang juga pakai current_date,
-- bukan tanggal jurnal asli. Ini menutup gap SEPENUHNYA (hari ini selalu di
-- tahun terbuka, tak pernah kena guard tahun terkunci) — bukan whitelist.
--
-- Konsekuensi yg disadari & diterima: kalau approval telat berbulan-bulan,
-- atribusi SKPD di laporan period-aware (lib/pengalihan.ts) baru pindah pas
-- tanggal Terima diklik, bukan tanggal dokumen sumber — walau barang mungkin
-- sudah berpindah fisik lebih awal. Payload tetap simpan no_sk dokumen asli
-- utk jejak audit; cuma `tanggal`/`periode` ledger yang berubah acuannya.
--
-- Jalankan SETELAH 20260704_23_tahun_buku.sql.
-- ============================================================================

CREATE OR REPLACE FUNCTION fn_terima_pengalihan(p_header_id uuid) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_h       jurnal_header%ROWTYPE;
  v_item    jsonb;
  v_aset    RECORD;
  v_n       integer := 0;
  v_periode text;
BEGIN
  SELECT * INTO v_h FROM jurnal_header WHERE id = p_header_id FOR UPDATE;
  IF NOT FOUND OR v_h.kategori <> 'pengalihan_status' THEN
    RAISE EXCEPTION 'Jurnal pengalihan status tidak ditemukan.';
  END IF;
  IF v_h.approval_status <> 'pending' THEN
    RAISE EXCEPTION 'Jurnal ini sudah %.', v_h.approval_status;
  END IF;
  IF NOT (fn_is_admin() OR fn_skpd_visible(v_h.skpd_tujuan)) THEN
    RAISE EXCEPTION 'Hanya SKPD tujuan (atau admin) yang boleh menerima pengalihan ini.';
  END IF;

  v_periode := fn_periode_dari_tanggal(current_date);

  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(v_h.payload->'draft_items', '[]'::jsonb))
  LOOP
    SELECT id, skpd_id, status, nilai_perolehan, nama_barang, nibar INTO v_aset
    FROM aset WHERE id = (v_item->>'aset_id')::uuid FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Barang % tidak ditemukan.', v_item->>'aset_id';
    END IF;
    IF v_aset.status <> 'aktif' OR v_aset.skpd_id IS DISTINCT FROM v_h.skpd_id THEN
      RAISE EXCEPTION 'Barang "%" (%) sudah berpindah/tidak aktif — minta SKPD asal merevisi jurnal.',
        COALESCE(v_aset.nama_barang, '-'), COALESCE(v_aset.nibar, '-');
    END IF;

    -- tanggal/periode = HARI INI (tanggal Terima diklik), bukan v_h.tanggal —
    -- lihat catatan migrasi di atas. no_sk dokumen asli tetap di payload.
    INSERT INTO transaksi_bmd (aset_id, jenis, periode, tanggal, nilai, skpd_asal, skpd_tujuan, header_id, payload, keterangan)
    VALUES (v_aset.id, 'pengalihan_status', v_periode, current_date, COALESCE(v_aset.nilai_perolehan, 0),
            v_h.skpd_id, v_h.skpd_tujuan, v_h.id,
            jsonb_build_object('no_sk', v_h.no_sk, 'tgl_dokumen_sumber', v_h.tanggal),
            'Pengalihan status penggunaan — ' || v_h.no_sk);
    UPDATE aset SET skpd_id = v_h.skpd_tujuan WHERE id = v_aset.id;
    v_n := v_n + 1;
  END LOOP;

  IF v_n = 0 THEN
    RAISE EXCEPTION 'Jurnal ini tidak berisi barang.';
  END IF;

  UPDATE jurnal_header
  SET approval_status = 'disetujui', approved_by = auth.uid(), approved_at = now()
  WHERE id = p_header_id;
  RETURN v_n;
END $$;
