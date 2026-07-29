-- ============================================================================
-- BATAL PENGALIHAN — Fase 2: index, trigger kode register, dan RPC.
--
-- JALANKAN SETELAH 20260729_06 (enum) SELESAI, dan SEBELUM deploy kode.
--
-- Wewenang (keputusan user 2026-07-29): **admin + SKPD PENERIMA**, sama persis
-- dengan fn_kembalikan_pengalihan_barang — "satu pintu" migrasi 22 tetap utuh,
-- SKPD asal tidak berwenang. Tanpa batas waktu, tapi tetap tunduk guard
-- "tak boleh membatalkan kalau aset punya transaksi lebih baru".
-- ============================================================================

-- ── 1. Partial index ikut diperluas ────────────────────────────────────────
-- ⚠️ WAJIB, dan wajib BARENGAN dengan perubahan JENIS_PINDAH di
-- lib/pengalihan.ts. Predikat index ini KEMBAR dengan daftar jenis di sana:
-- begitu kode mulai ikut menarik 'batal_pengalihan' sementara predikat index
-- masih dua jenis, planner tak bisa membuktikan implikasinya → index DIABAIKAN
-- DIAM-DIAM → fetchPindahEvents balik menyusuri seluruh ledger (418rb baris)
-- dan Daftar Barang/Penyusutan/Rekonsiliasi timeout lagi seperti sebelum
-- migrasi 20260729_01.
DROP INDEX IF EXISTS idx_trx_pindah_id;
CREATE INDEX idx_trx_pindah_id ON transaksi_bmd (id)
  WHERE jenis IN ('pengalihan_status', 'mutasi_internal', 'batal_pengalihan');

-- ── 2. Trigger kode register: cabang PEMBATALAN ────────────────────────────
-- Perilaku lama dipertahankan seluruhnya; yang ditambah hanya satu cabang di
-- awal. Tanpa cabang ini, membatalkan pengalihan justru MENERBITKAN nomor baru
-- lagi (karena skpd_id berubah → trigger mengira ada perpindahan), padahal
-- maksudnya mengembalikan keadaan.
CREATE OR REPLACE FUNCTION fn_aset_kode_register_sync() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_kode_skpd text; v_tahun text; v_p38 text; v_nomor integer; v_alasan text;
  v_batal text;
BEGIN
  IF TG_OP = 'INSERT' THEN NEW.kode_register := NULL; END IF;

  IF NEW.status = 'draft' THEN
    NEW.kode_register := NULL;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.status = 'dihapus' THEN
    NEW.kode_register := OLD.kode_register;
    RETURN NEW;
  END IF;

  -- ══ CABANG PEMBATALAN ══════════════════════════════════════════════════
  -- Ditandai fn_batal_pengalihan_barang lewat set_config(..., true) sehingga
  -- hanya berlaku di dalam transaksi itu — tak bisa bocor ke UPDATE lain.
  v_batal := COALESCE(current_setting('app.batal_pengalihan', true), '');
  IF v_batal = '1' THEN
    SELECT kode_skpd INTO v_kode_skpd FROM admin_skpd WHERE id = NEW.skpd_id;
    -- Tahun = tahun PEROLEHAN, bukan tahun berjalan: perpindahannya dianggap
    -- tak pernah terjadi, jadi "tahun berada di SKPD ini" kembali ke tahun ia
    -- lahir di situ.
    v_p38 := fn_prefix_kode_register(
      NEW.intra_ekstra::text, v_kode_skpd, to_char(NEW.tgl_perolehan, 'YYYY'), NEW.kode);
    IF v_p38 IS NULL THEN RETURN NEW; END IF;

    IF length(COALESCE(NEW.nibar, '')) = 45
       AND left(NEW.nibar, 38) = v_p38
       AND substring(NEW.nibar FROM 39 FOR 7) ~ '^\d{7}$' THEN
      -- Aturan yang SAMA PERSIS dengan Pass 1 backfill (migrasi 20260729_04):
      -- barang yang tak pernah bergerak memakai NIBAR-nya apa adanya. Inilah
      -- yang memadamkan tanda ⚠ di Daftar Barang — tanpa ini barang tetap
      -- menyala walau pengalihannya sudah dibatalkan.
      NEW.kode_register := NEW.nibar;
    ELSIF NEW.kode_register IS NULL OR left(NEW.kode_register, 38) <> v_p38 THEN
      NEW.kode_register := v_p38 || lpad(fn_alokasi_nomor_register(v_p38)::text, 7, '0');
    END IF;

    IF TG_OP = 'UPDATE' AND OLD.kode_register IS DISTINCT FROM NEW.kode_register THEN
      INSERT INTO aset_kode_register (aset_id, kode_lama, kode_register, periode, tanggal, alasan)
      VALUES (NEW.id, OLD.kode_register, NEW.kode_register,
              fn_periode_dari_tanggal(current_date), current_date, 'batal pengalihan');
    END IF;
    RETURN NEW;
  END IF;
  -- ══ akhir cabang pembatalan ════════════════════════════════════════════

  SELECT kode_skpd INTO v_kode_skpd FROM admin_skpd WHERE id = NEW.skpd_id;

  IF TG_OP = 'UPDATE' AND NEW.skpd_id IS DISTINCT FROM OLD.skpd_id THEN
    v_tahun := to_char(current_date, 'YYYY');
  ELSIF TG_OP = 'UPDATE' AND OLD.kode_register IS NOT NULL THEN
    v_tahun := substring(OLD.kode_register FROM 23 FOR 4);
  ELSE
    v_tahun := to_char(NEW.tgl_perolehan, 'YYYY');
  END IF;

  v_p38 := fn_prefix_kode_register(NEW.intra_ekstra::text, v_kode_skpd, v_tahun, NEW.kode);
  IF v_p38 IS NULL THEN RETURN NEW; END IF;

  IF NEW.kode_register IS NOT NULL AND left(NEW.kode_register, 38) = v_p38 THEN
    RETURN NEW;
  END IF;

  v_nomor := fn_alokasi_nomor_register(v_p38);

  IF TG_OP = 'UPDATE' AND OLD.kode_register IS NOT NULL THEN
    v_alasan := CASE
      WHEN NEW.skpd_id      IS DISTINCT FROM OLD.skpd_id      THEN 'pindah unit'
      WHEN NEW.kode         IS DISTINCT FROM OLD.kode         THEN 'reklasifikasi kode barang'
      WHEN NEW.intra_ekstra IS DISTINCT FROM OLD.intra_ekstra THEN 'reklas komptabel'
      ELSE 'perubahan posisi' END;
    INSERT INTO aset_kode_register (aset_id, kode_lama, kode_register, periode, tanggal, alasan)
    VALUES (NEW.id, OLD.kode_register, v_p38 || lpad(v_nomor::text, 7, '0'),
            fn_periode_dari_tanggal(current_date), current_date, v_alasan);
  END IF;

  NEW.kode_register := v_p38 || lpad(v_nomor::text, 7, '0');
  RETURN NEW;
END $$;

-- ── 3. RPC pembatalan ──────────────────────────────────────────────────────
-- SECURITY DEFINER: memindahkan aset lintas-SKPD & menulis ledger, dua-duanya
-- ditolak RLS kalau dijalankan sebagai operator biasa. Pola yang sama dengan
-- fn_terima_pengalihan & fn_kembalikan_pengalihan_barang — JANGAN diakali
-- dengan melonggarkan policy aset/transaksi_bmd.
CREATE OR REPLACE FUNCTION fn_batal_pengalihan_barang(p_header_id uuid, p_aset_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_h           jurnal_header%ROWTYPE;
  v_aset        RECORD;
  v_ids         bigint[];
  v_id_terakhir bigint;
  v_lebih_baru  integer;
BEGIN
  SELECT * INTO v_h FROM jurnal_header WHERE id = p_header_id FOR UPDATE;
  IF NOT FOUND OR v_h.kategori <> 'pengalihan_status' OR v_h.approval_status <> 'disetujui' THEN
    RAISE EXCEPTION 'Jurnal pengalihan yang sudah disetujui tidak ditemukan.';
  END IF;

  IF NOT (fn_is_admin() OR fn_skpd_visible(v_h.skpd_tujuan)) THEN
    RAISE EXCEPTION 'Hanya SKPD penerima (atau admin) yang boleh membatalkan pengalihan ini.';
  END IF;

  -- SEMUA baris pengalihan aset ini di kartu tsb — bisa 1 (baru dikirim) atau
  -- 2 (sudah sempat dikembalikan). Dibatalkan SEKALIGUS: membatalkan separuh
  -- menyisakan rantai yang tak nyambung, dan atribusi SKPD-nya jadi ngawur.
  SELECT array_agg(id ORDER BY id), max(id) INTO v_ids, v_id_terakhir
  FROM transaksi_bmd
  WHERE header_id = p_header_id AND aset_id = p_aset_id AND jenis = 'pengalihan_status';

  IF v_ids IS NULL THEN
    RAISE EXCEPTION 'Tidak ada baris pengalihan untuk barang ini di kartu tersebut.';
  END IF;

  -- Guard baku repo ini: batal hanya sah untuk peristiwa TERBARU aset itu.
  -- Membatalkan yang di tengah rantai merusak replay kronologis di engine.
  SELECT count(*) INTO v_lebih_baru FROM transaksi_bmd
  WHERE aset_id = p_aset_id AND id > v_id_terakhir;
  IF v_lebih_baru > 0 THEN
    RAISE EXCEPTION 'Barang ini punya % transaksi LEBIH BARU setelah pengalihannya — batalkan yang lebih baru dulu.', v_lebih_baru;
  END IF;

  SELECT id, skpd_id, nilai_perolehan, nama_barang INTO v_aset
  FROM aset WHERE id = p_aset_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Barang tidak ditemukan.'; END IF;

  -- Append-only: pembatalan = baris BARU, bukan hapus baris lama.
  -- `target_trx_ids` yang dipakai pembaca untuk mengabaikan baris-baris itu.
  INSERT INTO transaksi_bmd (aset_id, jenis, periode, tanggal, nilai,
                             skpd_asal, skpd_tujuan, header_id, payload, keterangan)
  VALUES (p_aset_id, 'batal_pengalihan', fn_periode_dari_tanggal(current_date), current_date,
          COALESCE(v_aset.nilai_perolehan, 0), v_aset.skpd_id, v_h.skpd_id, p_header_id,
          jsonb_build_object('no_sk', v_h.no_sk, 'target_trx_ids', to_jsonb(v_ids)),
          'Batal pengalihan status — dianggap tidak pernah terjadi (' || COALESCE(v_h.no_sk, '-') || ')');

  PERFORM set_config('app.batal_pengalihan', '1', true);

  -- Kembalikan ke SKPD asal. Kalau barangnya sudah sempat dikembalikan, nilainya
  -- memang sudah sama — tapi kolomnya tetap disebut di SET supaya trigger kode
  -- register ikut terpanggil (klausa `UPDATE OF` menyala saat kolom DISEBUT,
  -- bukan saat nilainya berubah).
  UPDATE aset SET skpd_id = v_h.skpd_id WHERE id = p_aset_id;
END $$;

REVOKE ALL ON FUNCTION fn_batal_pengalihan_barang(uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION fn_batal_pengalihan_barang(uuid, uuid) TO authenticated;
