-- ============================================================================
-- Tutup Tahun — Opsi B (checkpoint), keputusan user 2026-07-07. Jalankan
-- SETELAH 20260704_24_terima_pengalihan_tanggal_terkini.sql.
--
-- Mekanisme:
--   - Jenis ledger BARU 'saldo_awal_checkpoint' (beda dari 'saldo_awal' yg
--     khusus baseline impor e-BMD asli — lihat CLAUDE.md). Payload-nya REUSE
--     persis struktur payload saldo_awal lama (nilai_buku_awal, akumulasi_2025,
--     sisa_masa_manfaat_smt, masa_manfaat_smt, beban_per_smt) supaya engine
--     TIDAK perlu ubah cara BACA payload — cuma cara CARI baris mana yg dipakai
--     (lihat lib/engine/penyusutan.ts).
--   - fn_tutup_tahun: SATU transaksi atomik —
--       1. Validasi admin + tahun memang 'terbuka' + tahun SUDAH benar2 berakhir
--          (31 Des <= hari ini — tak bisa tutup tahun yg masih berjalan).
--       2. BLOKIR TOTAL kalau masih ada jurnal_header pending (kontrak Pengadaan
--          / Pengalihan Status) bertanggal di tahun itu (keputusan user: blokir,
--          bukan sekadar warning).
--       3. Checkpoint massal: 1 baris ledger per aset aktif+disusutkan, disalin
--          LANGSUNG dari penyusutan_semester periode S2 tahun itu (sudah final
--          hasil engine, tidak dihitung ulang).
--       4. Kunci tahun ini, buka tahun berikutnya (tahun_buku), catat di
--          tahun_buku_log (append-only, jejak audit).
--   - fn_preview_tutup_tahun: dipakai UI utk tampilkan daftar blocker SEBELUM
--     admin coba menutup (supaya bukan cuma exception mentah).
-- ============================================================================

-- ADD VALUE tidak boleh di dalam blok transaksi.
ALTER TYPE jenis_transaksi_bmd ADD VALUE IF NOT EXISTS 'saldo_awal_checkpoint';

CREATE OR REPLACE FUNCTION fn_preview_tutup_tahun(p_tahun int)
RETURNS TABLE(kategori text, no_sk text, tanggal date, skpd_nama text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jh.kategori, jh.no_sk, jh.tanggal, s.nama
  FROM jurnal_header jh
  JOIN skpd s ON s.id = jh.skpd_id
  WHERE jh.approval_status = 'pending' AND jh.periode LIKE (p_tahun::text || '-%')
  ORDER BY jh.tanggal
$$;

CREATE OR REPLACE FUNCTION fn_tutup_tahun(p_tahun int, p_catatan text DEFAULT NULL) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_pending_count integer;
  v_periode_tutup text := p_tahun::text || '-S2';
  v_akhir_tahun    date := (p_tahun::text || '-12-31')::date;
  v_n integer := 0;
BEGIN
  IF NOT fn_is_admin() THEN
    RAISE EXCEPTION 'Hanya admin yang boleh menutup tahun buku.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM tahun_buku WHERE tahun = p_tahun AND status = 'terbuka') THEN
    RAISE EXCEPTION 'Tahun % tidak ditemukan atau sudah tidak berstatus terbuka.', p_tahun;
  END IF;

  IF v_akhir_tahun > current_date THEN
    RAISE EXCEPTION 'Tahun % belum berakhir (hari ini %) — tidak bisa ditutup sebelum 31 Desember %.',
      p_tahun, current_date, p_tahun;
  END IF;

  SELECT count(*) INTO v_pending_count
  FROM jurnal_header
  WHERE approval_status = 'pending' AND periode LIKE (p_tahun::text || '-%');
  IF v_pending_count > 0 THEN
    RAISE EXCEPTION 'Masih ada % kontrak/jurnal pending bertanggal di tahun % — selesaikan (setujui/tolak) semuanya dulu sebelum menutup tahun ini (lihat fn_preview_tutup_tahun).',
      v_pending_count, p_tahun;
  END IF;

  -- Checkpoint massal: 1 baris per aset aktif+disusutkan, disalin dari hasil
  -- engine (penyusutan_semester) periode S2 tahun ini — sudah final, tidak
  -- dihitung ulang di sini.
  INSERT INTO transaksi_bmd (aset_id, jenis, periode, tanggal, nilai, skpd_tujuan, payload, keterangan)
  SELECT ps.aset_id, 'saldo_awal_checkpoint', v_periode_tutup, v_akhir_tahun,
         ps.nilai_perolehan, a.skpd_id,
         jsonb_build_object(
           'nilai_buku_awal',        ps.nilai_buku_akhir,
           'akumulasi_2025',         ps.akumulasi,
           'sisa_masa_manfaat_smt',  ps.sisa_semester,
           'masa_manfaat_smt',       CASE WHEN ps.masa_manfaat_tahun IS NOT NULL THEN ps.masa_manfaat_tahun * 2 ELSE NULL END,
           'beban_per_smt',          ps.beban,
           'sumber',                 'checkpoint tutup tahun ' || p_tahun
         ),
         'Checkpoint tutup tahun ' || p_tahun
  FROM penyusutan_semester ps
  JOIN aset a ON a.id = ps.aset_id
  WHERE ps.periode = v_periode_tutup AND a.status = 'aktif';
  GET DIAGNOSTICS v_n = ROW_COUNT;

  UPDATE tahun_buku SET status = 'terkunci', ditutup_pada = now(), ditutup_oleh = auth.uid(), catatan = p_catatan
  WHERE tahun = p_tahun;

  INSERT INTO tahun_buku (tahun, status, catatan)
  VALUES (p_tahun + 1, 'terbuka', 'Dibuka otomatis saat menutup tahun ' || p_tahun)
  ON CONFLICT (tahun) DO NOTHING;

  INSERT INTO tahun_buku_log (tahun, aksi, oleh, catatan) VALUES (p_tahun, 'tutup', auth.uid(), p_catatan);
  INSERT INTO tahun_buku_log (tahun, aksi, oleh, catatan)
  VALUES (p_tahun + 1, 'buka', auth.uid(), 'Dibuka otomatis saat menutup tahun ' || p_tahun);

  RETURN v_n;
END $$;
