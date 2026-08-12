-- ============================================================================
-- Mutasi Internal: tanggal ledger = TANGGAL DOKUMEN, bukan tanggal Terima.
--
-- Menyamakan `mutasi_internal` dengan `pengalihan_status` yang sudah diubah
-- migrasi 20260811_02. Permintaan user 2026-08-12.
--
-- ── Kenapa perlu ───────────────────────────────────────────────────────────
-- Sejak 20260811_02, dua pintu perpindahan barang punya DUA aturan tanggal:
-- pengalihan memakai tanggal dokumen, mutasi internal masih `current_date`.
-- Akibatnya terlihat langsung di data hidup — kartu mutasi internal
-- 100.3.3.2/149/418.08/2026 (Setda → Bagian Umum, 6 barang) menulis
-- "Tgl. 2026-06-30 · 2026-S1" di kepala kartu sementara keenam baris ledgernya
-- mendarat di 2026-S2, karena baru diterima Agustus. Dua-duanya benar menurut
-- sumbernya, dan justru itu yang membuatnya terbaca seperti salah satu keliru.
--
-- Persis alasan yang ditulis 20260811_02, jadi obatnya pun sama — termasuk
-- SENGAJA fail-loud kalau tanggalnya di masa depan atau di tahun terkunci.
-- Mundur diam-diam ke hari ini akan menyimpan tanggal yang bukan maunya
-- siapa pun, dan tak seorang pun tahu sampai laporannya dicetak.
--
-- `mutasi_internal` karena itu TETAP TIDAK masuk daftar putih retroaktif
-- `fn_cek_tahun_buku` — penolakannya memang yang diinginkan. Guard di sini cuma
-- mendahuluinya supaya pesannya bisa dibaca operator, bukan pesan trigger.
--
-- ⚠️ BERLAKU UNTUK PENERIMAAN BARU SAJA. Baris ledger yang terlanjur tercatat
-- di periode "tanggal terima" TIDAK ikut bergeser — ledger append-only, dan
-- untuk `mutasi_internal` belum ada jalur batal-lalu-terima-ulang seperti yang
-- dibangun 20260811_02 untuk pengalihan (`fn_batal_pengalihan_barang`
-- mengembalikan kartu ke 'pending'). Selama itu belum ada, kartu lama tetap di
-- periode lamanya.
--
-- `fn_kembalikan_mutasi_internal` SENGAJA TIDAK diubah: pengembalian memang
-- peristiwa BARU di periode berjalan, bukan pengulangan tanggal dokumen
-- (keputusan lama migrasi 22, masih berlaku).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_terima_mutasi_internal(p_header_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_h       jurnal_header%ROWTYPE;
  v_item    jsonb;
  v_aset    RECORD;
  v_n       integer := 0;
  v_periode text;
  v_tahun   integer;
BEGIN
  SELECT * INTO v_h FROM jurnal_header WHERE id = p_header_id FOR UPDATE;
  IF NOT FOUND OR v_h.kategori <> 'mutasi_internal' THEN
    RAISE EXCEPTION 'Jurnal mutasi internal tidak ditemukan.';
  END IF;
  IF v_h.approval_status <> 'pending' THEN
    RAISE EXCEPTION 'Jurnal ini sudah %.', v_h.approval_status;
  END IF;
  IF NOT (fn_is_admin() OR fn_skpd_visible(v_h.skpd_tujuan)) THEN
    RAISE EXCEPTION 'Hanya SKPD tujuan (atau admin) yang boleh menerima mutasi ini.';
  END IF;

  IF v_h.tanggal IS NULL THEN
    RAISE EXCEPTION 'Jurnal ini belum punya tanggal dokumen — isi dulu di SKPD asal.';
  END IF;
  IF v_h.tanggal > current_date THEN
    RAISE EXCEPTION 'Tanggal dokumen (%) ada di masa depan. Periksa ulang tanggal dokumennya — tanggal ledger tidak boleh mendahului hari ini.',
      to_char(v_h.tanggal, 'DD-MM-YYYY');
  END IF;
  v_tahun := EXTRACT(YEAR FROM v_h.tanggal)::int;
  IF NOT EXISTS (SELECT 1 FROM tahun_buku WHERE tahun = v_tahun AND status = 'terbuka') THEN
    RAISE EXCEPTION 'Tanggal dokumen (%) jatuh di tahun % yang sudah TERKUNCI, jadi mutasinya tidak bisa dicatat di sana. Periksa ulang tanggal dokumennya — harus di tahun buku yang masih berjalan.',
      to_char(v_h.tanggal, 'DD-MM-YYYY'), v_tahun;
  END IF;

  v_periode := fn_periode_dari_tanggal(v_h.tanggal);

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

    -- tanggal/periode = TANGGAL DOKUMEN. `tgl_dokumen_sumber` tetap ditulis
    -- walau kini sama dgn kolom tanggal: pembacanya sudah mengandalkannya, dan
    -- baris lama memilikinya (alasan kembar dgn 20260811_02).
    INSERT INTO transaksi_bmd (aset_id, jenis, periode, tanggal, nilai, skpd_asal, skpd_tujuan, header_id, payload, keterangan)
    VALUES (v_aset.id, 'mutasi_internal', v_periode, v_h.tanggal, COALESCE(v_aset.nilai_perolehan, 0),
            v_h.skpd_id, v_h.skpd_tujuan, v_h.id,
            jsonb_build_object('no_sk', v_h.no_sk, 'tgl_dokumen_sumber', v_h.tanggal),
            'Mutasi internal — ' || v_h.no_sk);
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
END $function$;
