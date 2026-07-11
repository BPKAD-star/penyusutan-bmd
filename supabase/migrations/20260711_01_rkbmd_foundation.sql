-- ============================================================================
-- RKBMD — Rencana Kebutuhan Barang Milik Daerah (Perencanaan Kebutuhan)
-- Dasar hukum: Permendagri 19/2016 Pasal 18–39, sebagaimana diubah Permendagri
-- 7/2024 (Pasal 26 baru + Lampiran Format RKBMD Pemanfaatan/Pemindahtanganan/
-- Penghapusan).
--
-- PRINSIP KUNCI (kenapa ini AMAN & terpisah dari ledger):
--   RKBMD = dokumen PERENCANAAN untuk tahun anggaran BERIKUTNYA (T+1). Angka di
--   sini rencana, BUKAN realisasi. Maka tabel-tabel ini SENGAJA di luar
--   transaksi_bmd/aset — tidak pernah masuk ledger, tidak menyentuh saldo.
--   Justru karena tahun_anggaran-nya di masa depan, kalau dipaksa masuk ledger
--   bakal ditolak guard no-forward-date (migrasi 23 fn_cek_tahun_buku). Jadi
--   TIDAK ADA trigger tahun_buku di sini — future year memang normal untuk RKBMD.
--
--   Karena bukan ledger, baris RKBMD BEBAS di-UPDATE/DELETE selama belum
--   disetujui (beda total dgn transaksi_bmd yg append-only). Approve hanya
--   membekukan status; TIDAK ada materialisasi ke aset/transaksi_bmd apa pun.
--
-- Pola: mirip jurnal_header (RLS per-SKPD fn_skpd_visible + approval guard admin),
-- tapi lebih sederhana — item disimpan sbg baris tabel sungguhan (rkbmd_item),
-- bukan draft_items JSON, karena tak perlu di-materialize ke ledger.
--
-- Jalankan di Supabase SQL Editor SETELAH 20260710_18_import_gedung_bangunan_lengkap.sql.
-- ============================================================================

-- ── 1. Standar Satuan Harga (SSH) — Pasal 20 ayat (2) huruf c, ayat (5) ──────
-- "besaran harga yang ditetapkan sbg acuan pengadaan". Ditetapkan kepala daerah;
-- di app dikelola admin/BKAD. Dipakai RKBMD Pengadaan utk menghitung nilai
-- (jumlah_kebutuhan × harga). Satu kopi per tahun anggaran (harga bisa beda tiap
-- tahun) — bukan per-SKPD, karena standar berlaku sekabupaten.
CREATE TABLE IF NOT EXISTS rkbmd_ssh (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tahun          int  NOT NULL,                                   -- tahun anggaran berlaku
  kode           text NOT NULL REFERENCES admin_kodefikasi_bmd(kode),
  spesifikasi    text,                                            -- standar barang / spesifikasi acuan
  satuan         text,
  harga          numeric NOT NULL CHECK (harga >= 0),
  keterangan     text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tahun, kode)
);
CREATE INDEX IF NOT EXISTS idx_rkbmd_ssh_tahun ON rkbmd_ssh(tahun);

-- ── 2. Standar Barang & Standar Kebutuhan (SBSK) — Pasal 20 ayat (2) a & b ───
-- standar barang = spesifikasi acuan; standar kebutuhan = satuan jumlah barang
-- yang dibutuhkan per acuan (satuan pengukur). Granularitas MVP: per (tahun,
-- kode) pada level SKPD (satuan_pengukur default 'per_skpd', pengali 1). Bisa
-- diperhalus (per pegawai/ruangan) belakangan tanpa ubah RKBMD Pengadaan.
CREATE TABLE IF NOT EXISTS rkbmd_sbsk (
  id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tahun              int  NOT NULL,
  kode               text NOT NULL REFERENCES admin_kodefikasi_bmd(kode),
  spesifikasi        text,                                        -- standar barang (spesifikasi acuan)
  satuan_pengukur    text NOT NULL DEFAULT 'per_skpd',            -- basis hitung: per_skpd|per_pegawai|per_ruangan|...
  kuantitas_standar  numeric NOT NULL CHECK (kuantitas_standar >= 0),
  satuan             text,
  keterangan         text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tahun, kode)
);
CREATE INDEX IF NOT EXISTS idx_rkbmd_sbsk_tahun ON rkbmd_sbsk(tahun);

-- ── 3. Header dokumen RKBMD ─────────────────────────────────────────────────
-- Satu baris = satu dokumen RKBMD milik satu SKPD, satu tahun anggaran, satu
-- jenis, satu versi (murni/perubahan). Alur status (1-tingkat, ikut keputusan
-- user): draft → diajukan → disetujui/ditolak.
--   draft     = operator SKPD masih menyusun (item bebas diedit)
--   diajukan  = usulan dikirim, menunggu penelaahan Pengelola/BKAD
--   disetujui = hasil penelaahan ditetapkan (item terkunci)
--   ditolak   = dikembalikan + catatan_telaah; operator boleh revisi & ajukan ulang
CREATE TABLE IF NOT EXISTS rkbmd (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  skpd_id         bigint NOT NULL REFERENCES admin_skpd(id),
  tahun_anggaran  int  NOT NULL,                                  -- T+1 (future year — sengaja, lihat header)
  jenis           text NOT NULL CHECK (jenis IN
                    ('pengadaan','pemeliharaan','pemanfaatan','pemindahtanganan','penghapusan')),
  versi           text NOT NULL DEFAULT 'murni' CHECK (versi IN ('murni','perubahan')),
  parent_id       uuid REFERENCES rkbmd(id),                      -- versi 'perubahan' menunjuk RKBMD murni-nya
  -- atribut header (Pasal 28 ayat 4: pengadaan wajib program & kegiatan)
  program         text,
  kegiatan        text,
  keterangan      text,
  -- alur telaah/persetujuan (1-tingkat)
  status          text NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft','diajukan','disetujui','ditolak')),
  catatan_telaah  text,                                           -- hasil penelaahan Pengelola/BKAD
  diajukan_at     timestamptz,
  approved_by     uuid REFERENCES auth.users(id),
  approved_at     timestamptz,
  created_by      uuid REFERENCES auth.users(id) DEFAULT auth.uid(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  -- satu murni + satu perubahan per (skpd, tahun, jenis)
  UNIQUE (skpd_id, tahun_anggaran, jenis, versi)
);
CREATE INDEX IF NOT EXISTS idx_rkbmd_skpd   ON rkbmd(skpd_id);
CREATE INDEX IF NOT EXISTS idx_rkbmd_tahun  ON rkbmd(tahun_anggaran);
CREATE INDEX IF NOT EXISTS idx_rkbmd_status ON rkbmd(status);
CREATE INDEX IF NOT EXISTS idx_rkbmd_parent ON rkbmd(parent_id);

-- ── 4. Baris item RKBMD ─────────────────────────────────────────────────────
-- Satu tabel lebar utk 5 jenis (kolom nullable per jenis — pola sama dgn tabel
-- `aset`). ON DELETE CASCADE aman: item bukan ledger, ikut terhapus saat header
-- draft dibuang.
--
--   Pengadaan     : kode (barang yg diadakan), jumlah_standar, jumlah_eksisting
--                   (snapshot beku dari `aset`), jumlah_kebutuhan (=standar−eksisting,
--                   boleh override), harga_satuan (SSH), total_anggaran.
--   Pemeliharaan  : aset_id/nibar (aset eksisting), kondisi, uraian_pemeliharaan,
--                   total_anggaran (estimasi biaya).
--   Pemanfaatan   : aset_id/nibar, jumlah, lokasi, peruntukan, bentuk, jangka_waktu.
--   Pemindahtanganan: aset_id/nibar, jumlah, lokasi, nilai_perolehan, bentuk, alasan.
--   Penghapusan   : aset_id/nibar, jumlah, nilai_perolehan, alasan.
CREATE TABLE IF NOT EXISTS rkbmd_item (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rkbmd_id           uuid NOT NULL REFERENCES rkbmd(id) ON DELETE CASCADE,
  no_urut            int,
  -- identitas barang
  kode               text REFERENCES admin_kodefikasi_bmd(kode),  -- pengadaan: barang yg diadakan
  nama_barang        text,
  spesifikasi        text,
  satuan             text,
  aset_id            uuid REFERENCES aset(id),                    -- jenis berbasis aset eksisting
  nibar              text,                                        -- snapshot NIBAR aset (audit trail)
  -- pengadaan (gap = standar − eksisting)
  jumlah_standar     numeric,
  jumlah_eksisting   numeric,                                     -- BEKU saat disusun (bukan live)
  jumlah_kebutuhan   numeric,
  harga_satuan       numeric,
  total_anggaran     numeric,                                     -- pengadaan: keb×harga; pemeliharaan: estimasi
  -- pemindahtanganan / penghapusan
  nilai_perolehan    numeric,
  -- generik / atribut per jenis
  jumlah             numeric,                                     -- jumlah barang/luas (jenis non-pengadaan)
  lokasi             text,
  kondisi            text,
  peruntukan         text,                                        -- pemanfaatan
  bentuk             text,                                        -- pemanfaatan (Sewa/Pinjam Pakai/BGS/BSG/KSP/KSPI)
                                                                  -- / pemindahtanganan (Penjualan/Tukar Menukar/Hibah/Penyertaan Modal)
  jangka_waktu       text,                                        -- pemanfaatan
  uraian_pemeliharaan text,                                       -- pemeliharaan
  alasan             text,                                        -- pemindahtanganan / penghapusan
  keterangan         text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rkbmd_item_rkbmd ON rkbmd_item(rkbmd_id);
CREATE INDEX IF NOT EXISTS idx_rkbmd_item_aset  ON rkbmd_item(aset_id);

-- ── 5. Trigger updated_at (reuse fn_set_updated_at yg sudah ada) ────────────
DROP TRIGGER IF EXISTS trg_rkbmd_ssh_updated  ON rkbmd_ssh;
CREATE TRIGGER trg_rkbmd_ssh_updated  BEFORE UPDATE ON rkbmd_ssh
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
DROP TRIGGER IF EXISTS trg_rkbmd_sbsk_updated ON rkbmd_sbsk;
CREATE TRIGGER trg_rkbmd_sbsk_updated BEFORE UPDATE ON rkbmd_sbsk
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
DROP TRIGGER IF EXISTS trg_rkbmd_updated ON rkbmd;
CREATE TRIGGER trg_rkbmd_updated BEFORE UPDATE ON rkbmd
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
DROP TRIGGER IF EXISTS trg_rkbmd_item_updated ON rkbmd_item;
CREATE TRIGGER trg_rkbmd_item_updated BEFORE UPDATE ON rkbmd_item
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- ── 6. Guard status/approval — hanya admin yg boleh setuju/tolak ────────────
-- Operator SKPD boleh gerak draft↔diajukan (usul & tarik kembali). Perpindahan
-- ke 'disetujui'/'ditolak' (penelaahan Pengelola) HANYA admin. approved_by/at
-- diisi otomatis. Setelah 'disetujui', kembali ke draft (buka kunci) juga admin.
CREATE OR REPLACE FUNCTION fn_rkbmd_status_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    -- transisi yg butuh kewenangan Pengelola (admin)
    IF (NEW.status IN ('disetujui','ditolak'))
       OR (OLD.status = 'disetujui' AND NEW.status <> 'disetujui') THEN
      IF NOT fn_is_admin() THEN
        RAISE EXCEPTION 'Hanya admin (Pengelola/BKAD) yang boleh menelaah/menetapkan RKBMD.';
      END IF;
    END IF;

    -- cap waktu otomatis
    IF NEW.status = 'diajukan' AND OLD.status <> 'diajukan' THEN
      NEW.diajukan_at := now();
    END IF;
    IF NEW.status = 'disetujui' THEN
      NEW.approved_by := auth.uid();
      NEW.approved_at := now();
    ELSIF OLD.status = 'disetujui' AND NEW.status <> 'disetujui' THEN
      NEW.approved_by := NULL;      -- buka kunci: bersihkan jejak persetujuan
      NEW.approved_at := NULL;
    END IF;
  END IF;

  -- skpd_id/tahun/jenis/versi identitas dokumen — tak boleh diubah (itu = RKBMD lain)
  IF TG_OP = 'UPDATE' AND (
       NEW.skpd_id        IS DISTINCT FROM OLD.skpd_id
    OR NEW.tahun_anggaran IS DISTINCT FROM OLD.tahun_anggaran
    OR NEW.jenis          IS DISTINCT FROM OLD.jenis
    OR NEW.versi          IS DISTINCT FROM OLD.versi) THEN
    RAISE EXCEPTION 'Identitas RKBMD (SKPD/tahun/jenis/versi) tidak boleh diubah — buat dokumen baru.';
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_rkbmd_status_guard ON rkbmd;
CREATE TRIGGER trg_rkbmd_status_guard BEFORE UPDATE ON rkbmd
  FOR EACH ROW EXECUTE FUNCTION fn_rkbmd_status_guard();

-- ── 7. Guard item: terkunci saat RKBMD sudah disetujui ──────────────────────
-- Item hanya boleh ditulis kalau header BELUM 'disetujui' (kecuali admin, mis.
-- saat proses buka-kunci). Menjaga dokumen yg sudah ditetapkan tidak berubah
-- diam-diam.
CREATE OR REPLACE FUNCTION fn_rkbmd_item_lock() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE v_status text; v_rkbmd uuid;
BEGIN
  v_rkbmd := COALESCE(NEW.rkbmd_id, OLD.rkbmd_id);
  SELECT status INTO v_status FROM rkbmd WHERE id = v_rkbmd;
  IF v_status = 'disetujui' AND NOT fn_is_admin() THEN
    RAISE EXCEPTION 'RKBMD sudah disetujui — item terkunci. Minta admin buka kunci untuk mengubah.';
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS trg_rkbmd_item_lock ON rkbmd_item;
CREATE TRIGGER trg_rkbmd_item_lock
  BEFORE INSERT OR UPDATE OR DELETE ON rkbmd_item
  FOR EACH ROW EXECUTE FUNCTION fn_rkbmd_item_lock();

-- ── 8. RLS ──────────────────────────────────────────────────────────────────
-- Tabel referensi (SSH/SBSK): semua authenticated boleh baca; tulis hanya admin.
ALTER TABLE rkbmd_ssh  ENABLE ROW LEVEL SECURITY;
ALTER TABLE rkbmd_sbsk ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rkbmd_ssh_select" ON rkbmd_ssh;
CREATE POLICY "rkbmd_ssh_select" ON rkbmd_ssh FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "rkbmd_ssh_write" ON rkbmd_ssh;
CREATE POLICY "rkbmd_ssh_write" ON rkbmd_ssh FOR ALL TO authenticated
  USING (fn_is_admin()) WITH CHECK (fn_is_admin());

DROP POLICY IF EXISTS "rkbmd_sbsk_select" ON rkbmd_sbsk;
CREATE POLICY "rkbmd_sbsk_select" ON rkbmd_sbsk FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "rkbmd_sbsk_write" ON rkbmd_sbsk;
CREATE POLICY "rkbmd_sbsk_write" ON rkbmd_sbsk FOR ALL TO authenticated
  USING (fn_is_admin()) WITH CHECK (fn_is_admin());

-- Dokumen RKBMD: per-SKPD (pola jurnal_header). Admin lihat semua.
ALTER TABLE rkbmd ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rkbmd_select" ON rkbmd;
CREATE POLICY "rkbmd_select" ON rkbmd FOR SELECT TO authenticated
  USING (fn_is_admin() OR fn_skpd_visible(skpd_id));
DROP POLICY IF EXISTS "rkbmd_insert" ON rkbmd;
CREATE POLICY "rkbmd_insert" ON rkbmd FOR INSERT TO authenticated
  WITH CHECK (fn_is_admin() OR fn_skpd_visible(skpd_id));
DROP POLICY IF EXISTS "rkbmd_update" ON rkbmd;
CREATE POLICY "rkbmd_update" ON rkbmd FOR UPDATE TO authenticated
  USING (fn_is_admin() OR fn_skpd_visible(skpd_id));
DROP POLICY IF EXISTS "rkbmd_delete" ON rkbmd;
CREATE POLICY "rkbmd_delete" ON rkbmd FOR DELETE TO authenticated
  USING (fn_is_admin() OR fn_skpd_visible(skpd_id));

-- Item RKBMD: visibilitas mengikuti header-nya (join ke rkbmd).
ALTER TABLE rkbmd_item ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rkbmd_item_select" ON rkbmd_item;
CREATE POLICY "rkbmd_item_select" ON rkbmd_item FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM rkbmd h WHERE h.id = rkbmd_item.rkbmd_id
                 AND (fn_is_admin() OR fn_skpd_visible(h.skpd_id))));
DROP POLICY IF EXISTS "rkbmd_item_insert" ON rkbmd_item;
CREATE POLICY "rkbmd_item_insert" ON rkbmd_item FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM rkbmd h WHERE h.id = rkbmd_item.rkbmd_id
                 AND (fn_is_admin() OR fn_skpd_visible(h.skpd_id))));
DROP POLICY IF EXISTS "rkbmd_item_update" ON rkbmd_item;
CREATE POLICY "rkbmd_item_update" ON rkbmd_item FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM rkbmd h WHERE h.id = rkbmd_item.rkbmd_id
                 AND (fn_is_admin() OR fn_skpd_visible(h.skpd_id))));
DROP POLICY IF EXISTS "rkbmd_item_delete" ON rkbmd_item;
CREATE POLICY "rkbmd_item_delete" ON rkbmd_item FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM rkbmd h WHERE h.id = rkbmd_item.rkbmd_id
                 AND (fn_is_admin() OR fn_skpd_visible(h.skpd_id))));
