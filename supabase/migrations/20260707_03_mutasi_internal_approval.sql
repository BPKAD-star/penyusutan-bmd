-- ============================================================================
-- Pengeluaran/Penerimaan Internal (mutasi_internal): alur draft + approval,
-- sama seperti Pengalihan Status Penggunaan (migrasi 20260704_21/22/24), tapi
-- DIBATASI dalam satu SKPD induk (tree) yang sama — bukan lintas SKPD berbeda.
-- Jalankan SETELAH 20260704_26_tahun_buku_anon_read.sql.
-- ============================================================================

-- ── 1. jurnal_header.kategori: tambah 'mutasi_internal' ─────────────────────
DO $$
DECLARE cname text;
BEGIN
  SELECT conname INTO cname
  FROM pg_constraint
  WHERE conrelid = 'jurnal_header'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%kategori%';
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE jurnal_header DROP CONSTRAINT %I', cname);
  END IF;
END $$;

ALTER TABLE jurnal_header
  ADD CONSTRAINT jurnal_header_kategori_check
  CHECK (kategori IN ('penghapusan','kapitalisasi','pengadaan','pengalihan_status',
                       'hibah_masuk','tukar_menukar','hasil_inventarisasi','perolehan_lainnya',
                       'mutasi_internal'));

-- ── 2. Helper: root ancestor SKPD (id akar tree) — dari skpd.path (ltree) ───
CREATE OR REPLACE FUNCTION fn_skpd_root(p_skpd_id bigint) RETURNS bigint
LANGUAGE sql STABLE AS $$
  SELECT subpath(path, 0, 1)::text::bigint FROM skpd WHERE id = p_skpd_id
$$;

-- ── 3. Guard INSERT/UPDATE jurnal_header: tambah validasi mutasi_internal ───
-- (base: fn_jurnal_header_guard dari migrasi 07, diperluas migrasi 21 utk
-- pengalihan_status — di sini ditambah cabang mutasi_internal: tujuan wajib
-- diisi, beda dari asal, DAN satu tree yang sama — level bebas, TIDAK wajib
-- SKPD induk seperti pengalihan_status.)
CREATE OR REPLACE FUNCTION fn_jurnal_header_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.periode := fn_periode_dari_tanggal(NEW.tanggal);
    IF NEW.kategori = 'pengalihan_status' THEN
      IF NEW.skpd_tujuan IS NULL THEN
        RAISE EXCEPTION 'Pengalihan status: SKPD tujuan wajib diisi.';
      END IF;
      IF EXISTS (SELECT 1 FROM skpd WHERE id = NEW.skpd_tujuan AND parent_id IS NOT NULL) THEN
        RAISE EXCEPTION 'Pengalihan status: tujuan harus level SKPD induk (bukan Sub OPD/Lokasi).';
      END IF;
    ELSIF NEW.kategori = 'mutasi_internal' THEN
      IF NEW.skpd_tujuan IS NULL THEN
        RAISE EXCEPTION 'Mutasi internal: SKPD tujuan wajib diisi.';
      END IF;
      IF NEW.skpd_tujuan = NEW.skpd_id THEN
        RAISE EXCEPTION 'Mutasi internal: SKPD tujuan tidak boleh sama dengan SKPD asal.';
      END IF;
      IF fn_skpd_root(NEW.skpd_id) IS DISTINCT FROM fn_skpd_root(NEW.skpd_tujuan) THEN
        RAISE EXCEPTION 'Mutasi internal: SKPD asal & tujuan harus dalam satu SKPD induk (tree) yang sama — lintas SKPD induk pakai menu Penggunaan.';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE: skpd & kategori tak boleh berubah (itu = jurnal lain, harus entry ulang).
  IF NEW.skpd_id IS DISTINCT FROM OLD.skpd_id
     OR NEW.kategori IS DISTINCT FROM OLD.kategori THEN
    RAISE EXCEPTION 'jurnal_header: skpd_id/kategori tidak boleh diubah — batalkan & buat jurnal baru.';
  END IF;

  -- SKPD tujuan terkunci begitu jurnal tidak lagi pending (sudah diputuskan
  -- penerima) — mengubahnya = jurnal lain, harus entry ulang.
  IF NEW.skpd_tujuan IS DISTINCT FROM OLD.skpd_tujuan
     AND COALESCE(OLD.approval_status, 'disetujui') <> 'pending' THEN
    RAISE EXCEPTION 'jurnal_header: SKPD tujuan tidak boleh diubah setelah jurnal diputuskan.';
  END IF;

  -- Tanggal baru wajib jatuh di semester yang sama dgn periode beku header.
  IF fn_periode_dari_tanggal(NEW.tanggal) <> OLD.periode THEN
    RAISE EXCEPTION
      'Tanggal (%) di luar semester jurnal (%). Untuk pindah semester, batalkan jurnal & entry ulang.',
      NEW.tanggal, OLD.periode;
  END IF;

  NEW.periode    := OLD.periode;   -- periode tetap beku
  NEW.updated_at := now();
  RETURN NEW;
END $$;

-- ── 4. Approval guard: SKPD tujuan mutasi_internal juga boleh Terima/Tolak ──
CREATE OR REPLACE FUNCTION fn_jurnal_header_approval_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.approval_status IS DISTINCT FROM OLD.approval_status
     AND NOT fn_is_admin()
     AND NOT (OLD.kategori IN ('pengalihan_status', 'mutasi_internal') AND fn_skpd_visible(OLD.skpd_tujuan)) THEN
    RAISE EXCEPTION 'Hanya admin (atau SKPD tujuan) yang boleh mengubah status persetujuan.';
  END IF;
  RETURN NEW;
END $$;

-- ── 5. RPC: Terima (materialize draft → ledger + pindah aset) ───────────────
-- tanggal/periode = HARI INI (tanggal Terima diklik), sama seperti
-- fn_terima_pengalihan versi terbaru (migrasi 24) — biar tak kena guard
-- tahun_buku kalau approval telat sampai tahun dokumen sumber sudah ditutup.
CREATE OR REPLACE FUNCTION fn_terima_mutasi_internal(p_header_id uuid) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_h       jurnal_header%ROWTYPE;
  v_item    jsonb;
  v_aset    RECORD;
  v_n       integer := 0;
  v_periode text;
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

    INSERT INTO transaksi_bmd (aset_id, jenis, periode, tanggal, nilai, skpd_asal, skpd_tujuan, header_id, payload, keterangan)
    VALUES (v_aset.id, 'mutasi_internal', v_periode, current_date, COALESCE(v_aset.nilai_perolehan, 0),
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
END $$;

-- ── 6. RPC: Tolak (draft utuh, hanya status + alasan) ───────────────────────
CREATE OR REPLACE FUNCTION fn_tolak_mutasi_internal(p_header_id uuid, p_alasan text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_h jurnal_header%ROWTYPE;
BEGIN
  SELECT * INTO v_h FROM jurnal_header WHERE id = p_header_id FOR UPDATE;
  IF NOT FOUND OR v_h.kategori <> 'mutasi_internal' THEN
    RAISE EXCEPTION 'Jurnal mutasi internal tidak ditemukan.';
  END IF;
  IF v_h.approval_status <> 'pending' THEN
    RAISE EXCEPTION 'Jurnal ini sudah %.', v_h.approval_status;
  END IF;
  IF NOT (fn_is_admin() OR fn_skpd_visible(v_h.skpd_tujuan)) THEN
    RAISE EXCEPTION 'Hanya SKPD tujuan (atau admin) yang boleh menolak mutasi ini.';
  END IF;
  UPDATE jurnal_header
  SET approval_status = 'ditolak', rejected_reason = NULLIF(trim(p_alasan), '')
  WHERE id = p_header_id;
END $$;

-- ── 7. RPC: Kembalikan (SATU PINTU, sisi penerima, periode berjalan) ────────
CREATE OR REPLACE FUNCTION fn_kembalikan_mutasi_internal(p_header_id uuid, p_aset_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_h       jurnal_header%ROWTYPE;
  v_aset    RECORD;
  v_periode text;
BEGIN
  SELECT * INTO v_h FROM jurnal_header WHERE id = p_header_id FOR UPDATE;
  IF NOT FOUND OR v_h.kategori <> 'mutasi_internal' OR v_h.approval_status <> 'disetujui' THEN
    RAISE EXCEPTION 'Jurnal mutasi internal yang sudah disetujui tidak ditemukan.';
  END IF;
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
  VALUES (v_aset.id, 'mutasi_internal', v_periode, current_date, COALESCE(v_aset.nilai_perolehan, 0),
          v_h.skpd_tujuan, v_h.skpd_id, v_h.id,
          jsonb_build_object('no_sk', v_h.no_sk, 'reversal', true),
          'Pengembalian mutasi internal — kembali ke SKPD asal (' || v_h.no_sk || ')');
  UPDATE aset SET skpd_id = v_h.skpd_id WHERE id = v_aset.id;
END $$;

-- ── 8. Visibilitas historis: sender mutasi_internal tetap lihat barang yang
-- sudah pindah ke SKPD lain dalam tree-nya (sama alasan spt migrasi 22 utk
-- pengalihan_status — perluas helper yang sudah ada, bukan bikin baru).
CREATE OR REPLACE FUNCTION fn_aset_pernah_dikelola(p_aset_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM transaksi_bmd t
    WHERE t.aset_id = p_aset_id
      AND t.jenis IN ('pengalihan_status', 'mutasi_internal')
      AND (fn_skpd_visible(t.skpd_asal) OR fn_skpd_visible(t.skpd_tujuan))
  )
$$;
