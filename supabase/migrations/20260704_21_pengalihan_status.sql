-- ============================================================================
-- Pengalihan Status Penggunaan (transfer BMD antar SKPD) — jenis ketiga di menu
-- Penghapusan (sisi keluar) + persetujuan SKPD penerima di menu Penggunaan
-- (sisi masuk). Jalankan SETELAH 20260704_20_saldo_awal_2026_kolom_aset.sql.
--
-- Model (kombinasi 2 pola yang sudah ada — lihat CLAUDE.md):
--   - Kartu ber-SK   → jurnal_header kategori BARU 'pengalihan_status'
--                      (kunci semester dst. ikut guard yang sama).
--   - Draft-approve  → barang yang dipilih ditampung di payload.draft_items
--                      (JSON, bebas edit/hapus selama pending — ledger & aset
--                      TIDAK disentuh). approval_status='pending' saat insert.
--   - Saat SKPD TUJUAN menyetujui (fn_terima_pengalihan): materialize →
--     insert transaksi_bmd jenis 'pengalihan_status' (enum sudah ada sejak
--     migrasi 01; engine memperlakukannya TANPA efek finansial — penyusutan
--     jalan terus) + UPDATE aset.skpd_id ke SKPD tujuan, atomik.
--   - Batal PASCA-setuju per barang (fn_batal_pengalihan_barang): transaksi
--     balik (append-only) + aset.skpd_id kembali ke asal.
--
-- Kenapa RPC SECURITY DEFINER (bukan insert/update biasa dari client):
--   RLS aset hanya mengizinkan update di subtree SKPD sendiri — begitu
--   skpd_id diarahkan ke SKPD lain, baris hasil sudah di luar wilayah user
--   → ditolak. Penerima juga tak bisa insert ledger utk aset yang (masih)
--   milik SKPD asal. RPC mengeksekusi keduanya atomik dengan validasi sendiri.
-- ============================================================================

-- ── 1. jurnal_header: kategori baru + kolom SKPD tujuan ─────────────────────
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
  CHECK (kategori IN ('penghapusan','kapitalisasi','pengadaan','pengalihan_status'));

ALTER TABLE jurnal_header ADD COLUMN IF NOT EXISTS skpd_tujuan bigint REFERENCES skpd(id);
CREATE INDEX IF NOT EXISTS idx_jh_skpd_tujuan ON jurnal_header(skpd_tujuan);

-- ── 2. Guard: wajib ada tujuan (level SKPD induk) utk kategori baru ─────────
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

-- ── 3. Approval guard: SKPD tujuan boleh setujui/tolak pengalihan ───────────
-- Semula hanya admin. Utk kategori pengalihan_status, operator subtree SKPD
-- TUJUAN juga sah mengubah approval_status (Terima/Tolak lewat RPC di bawah —
-- trigger ini tetap jalan di dalam RPC krn auth.uid() = pemanggil).
CREATE OR REPLACE FUNCTION fn_jurnal_header_approval_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.approval_status IS DISTINCT FROM OLD.approval_status
     AND NOT fn_is_admin()
     AND NOT (OLD.kategori = 'pengalihan_status' AND fn_skpd_visible(OLD.skpd_tujuan)) THEN
    RAISE EXCEPTION 'Hanya admin (atau SKPD tujuan, utk pengalihan status) yang boleh mengubah status persetujuan.';
  END IF;
  RETURN NEW;
END $$;

-- ── 4. RLS: SKPD tujuan boleh MELIHAT jurnal pengalihan yang masuk ──────────
-- (Mutasi tetap: sumber via policy update/delete lama; penerima via RPC.)
DROP POLICY IF EXISTS "jh_select" ON jurnal_header;
CREATE POLICY "jh_select" ON jurnal_header FOR SELECT TO authenticated
  USING (fn_is_admin() OR fn_skpd_visible(skpd_id) OR fn_skpd_visible(skpd_tujuan));

-- ── 5. Bucket dokumen sumber (foto ATAU PDF — beda dari aset-foto yg image-only)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('dokumen-sumber', 'dokumen-sumber', false, 10485760,
        ARRAY['image/jpeg','image/png','image/webp','application/pdf'])
ON CONFLICT (id) DO UPDATE SET file_size_limit = 10485760,
  allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp','application/pdf'];

DROP POLICY IF EXISTS "dokumen_sumber_select" ON storage.objects;
CREATE POLICY "dokumen_sumber_select" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'dokumen-sumber');
DROP POLICY IF EXISTS "dokumen_sumber_insert" ON storage.objects;
CREATE POLICY "dokumen_sumber_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'dokumen-sumber');
DROP POLICY IF EXISTS "dokumen_sumber_delete" ON storage.objects;
CREATE POLICY "dokumen_sumber_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'dokumen-sumber');

-- ── 6. RPC: Terima (materialize draft → ledger + pindah aset) ───────────────
CREATE OR REPLACE FUNCTION fn_terima_pengalihan(p_header_id uuid) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_h    jurnal_header%ROWTYPE;
  v_item jsonb;
  v_aset RECORD;
  v_n    integer := 0;
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
    VALUES (v_aset.id, 'pengalihan_status', v_h.periode, v_h.tanggal, COALESCE(v_aset.nilai_perolehan, 0),
            v_h.skpd_id, v_h.skpd_tujuan, v_h.id,
            jsonb_build_object('no_sk', v_h.no_sk),
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

-- ── 7. RPC: Tolak (draft utuh, hanya status + alasan) ───────────────────────
CREATE OR REPLACE FUNCTION fn_tolak_pengalihan(p_header_id uuid, p_alasan text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_h jurnal_header%ROWTYPE;
BEGIN
  SELECT * INTO v_h FROM jurnal_header WHERE id = p_header_id FOR UPDATE;
  IF NOT FOUND OR v_h.kategori <> 'pengalihan_status' THEN
    RAISE EXCEPTION 'Jurnal pengalihan status tidak ditemukan.';
  END IF;
  IF v_h.approval_status <> 'pending' THEN
    RAISE EXCEPTION 'Jurnal ini sudah %.', v_h.approval_status;
  END IF;
  IF NOT (fn_is_admin() OR fn_skpd_visible(v_h.skpd_tujuan)) THEN
    RAISE EXCEPTION 'Hanya SKPD tujuan (atau admin) yang boleh menolak pengalihan ini.';
  END IF;
  UPDATE jurnal_header
  SET approval_status = 'ditolak', rejected_reason = NULLIF(trim(p_alasan), '')
  WHERE id = p_header_id;
END $$;

-- ── 8. RPC: Batal per barang PASCA-setuju (transaksi balik, append-only) ────
-- Dicatat di tanggal/periode jurnal asli supaya konsisten period-aware.
CREATE OR REPLACE FUNCTION fn_batal_pengalihan_barang(p_header_id uuid, p_aset_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_h    jurnal_header%ROWTYPE;
  v_aset RECORD;
BEGIN
  SELECT * INTO v_h FROM jurnal_header WHERE id = p_header_id FOR UPDATE;
  IF NOT FOUND OR v_h.kategori <> 'pengalihan_status' OR v_h.approval_status <> 'disetujui' THEN
    RAISE EXCEPTION 'Jurnal pengalihan yang sudah disetujui tidak ditemukan.';
  END IF;
  IF NOT (fn_is_admin() OR fn_skpd_visible(v_h.skpd_id) OR fn_skpd_visible(v_h.skpd_tujuan)) THEN
    RAISE EXCEPTION 'Anda tidak berwenang membatalkan pengalihan ini.';
  END IF;

  SELECT id, skpd_id, nilai_perolehan, nama_barang, nibar INTO v_aset
  FROM aset WHERE id = p_aset_id FOR UPDATE;
  IF NOT FOUND OR v_aset.skpd_id IS DISTINCT FROM v_h.skpd_tujuan THEN
    RAISE EXCEPTION 'Barang "%" sudah tidak berada di SKPD tujuan — tidak bisa dibatalkan dari jurnal ini.',
      COALESCE(v_aset.nama_barang, p_aset_id::text);
  END IF;

  INSERT INTO transaksi_bmd (aset_id, jenis, periode, tanggal, nilai, skpd_asal, skpd_tujuan, header_id, payload, keterangan)
  VALUES (v_aset.id, 'pengalihan_status', v_h.periode, v_h.tanggal, COALESCE(v_aset.nilai_perolehan, 0),
          v_h.skpd_tujuan, v_h.skpd_id, v_h.id,
          jsonb_build_object('no_sk', v_h.no_sk, 'reversal', true),
          'Pembatalan pengalihan status — kembali ke SKPD asal (' || v_h.no_sk || ')');
  UPDATE aset SET skpd_id = v_h.skpd_id WHERE id = v_aset.id;
END $$;
