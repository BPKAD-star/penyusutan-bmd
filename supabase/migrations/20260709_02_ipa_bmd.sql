-- ============================================================================
-- IPA BMD (Indeks Pengelolaan Aset) — struktur database, "copycate" dari
-- github.com/BPKAD-star/ipa-bmd-kediri (app terpisah, belum 100% jadi),
-- disatuin ke database ini biar SKPD/user gak dobel-input.
--
-- SKPD/profiles di-EXTEND (bukan diduplikat) — beda dari GIS-BMD kemarin yg
-- emang butuh tabel anak baru (1:N bidang), di sini SKPD/user itu emang 1:1
-- sama yg udah ada, tinggal nambah kolom. Tabel yg genuinely baru (skor
-- penilaian per SKPD per tahun, alur submit→verifikasi) di-prefix `ipa_`.
--
-- SCOPE RONDE INI: struktur database doang (tabel+RLS+bucket). Belum ada
-- halaman/form penilaian — itu nyusul kalau schema ini udah dikonfirmasi jalan.
-- Formula ipa_final/ipa_kategori (di ipa-engine.ts sumber) BELUM diporting,
-- kolomnya cuma disiapkan tempatnya.
--
-- Jalankan SETELAH 20260709_01_aset_bidang_tanah.sql.
-- ============================================================================

-- ── 1. Extend skpd (reuse, BUKAN tabel baru) ────────────────────────────────
ALTER TABLE skpd ADD COLUMN IF NOT EXISTS kode_lokasi text;
ALTER TABLE skpd ADD COLUMN IF NOT EXISTS jabatan text;
ALTER TABLE skpd ADD COLUMN IF NOT EXISTS kelompok_fpk smallint CHECK (kelompok_fpk BETWEEN 1 AND 4);
ALTER TABLE skpd ADD COLUMN IF NOT EXISTS fpk_temuan integer DEFAULT 0;
ALTER TABLE skpd ADD COLUMN IF NOT EXISTS fpk_laporan integer DEFAULT 0;

-- ── 2. Extend profiles (reuse, BUKAN tabel/relasi baru) ─────────────────────
-- Role IPA (pb_admin/bkad_verifier/bkad_admin) TERPISAH dari profiles.role
-- (admin BMD umum) — konsep beda, 1 kolom nullable cukup (1 user = 1 role IPA,
-- yg gak ikutan IPA ya NULL).
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS ipa_role text
  CHECK (ipa_role IS NULL OR ipa_role IN ('pb_admin','bkad_verifier','bkad_admin'));

-- ── 3. Tabel baru, prefix ipa_ ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ipa_tahun_anggaran (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tahun              int NOT NULL UNIQUE,
  batas_submit_pb    date,
  batas_submit_bkad  date,
  is_active          boolean NOT NULL DEFAULT false,
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ipa_record (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  skpd_id            bigint NOT NULL REFERENCES skpd(id),
  tahun_id           uuid NOT NULL REFERENCES ipa_tahun_anggaran(id),
  status             text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','diajukan','diverifikasi','ditolak')),
  st1_nilai          numeric,
  st2_nilai          numeric,
  st3_nilai          numeric,
  st4_nilai          numeric,
  ipa_final          numeric,
  ipa_kategori       text CHECK (ipa_kategori IS NULL OR ipa_kategori IN ('Sangat Baik','Baik','Cukup','Buruk')),
  submitted_at       timestamptz,
  submitted_by       uuid REFERENCES auth.users(id),
  verified_at        timestamptz,
  verified_by        uuid REFERENCES auth.users(id),
  catatan_verifikasi text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (skpd_id, tahun_id)
);
DROP TRIGGER IF EXISTS trg_ipa_record_updated_at ON ipa_record;
CREATE TRIGGER trg_ipa_record_updated_at BEFORE UPDATE ON ipa_record
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at(); -- reuse, sudah ada sejak migrasi 01

CREATE TABLE IF NOT EXISTS ipa_parameter_nilai (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ipa_id          uuid NOT NULL REFERENCES ipa_record(id) ON DELETE CASCADE,
  kode_parameter  text NOT NULL,
  nama_parameter  text NOT NULL,
  realisasi       numeric,
  target          numeric,
  persen_raw      numeric,
  persen_fpk      numeric,
  indeks          smallint CHECK (indeks BETWEEN 1 AND 4),
  bobot           numeric,
  nilai_terbobot  numeric,
  metadata        jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ipn_ipa ON ipa_parameter_nilai(ipa_id);
DROP TRIGGER IF EXISTS trg_ipn_updated_at ON ipa_parameter_nilai;
CREATE TRIGGER trg_ipn_updated_at BEFORE UPDATE ON ipa_parameter_nilai
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

CREATE TABLE IF NOT EXISTS ipa_dokumen_bukti (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ipa_record_id       uuid NOT NULL REFERENCES ipa_record(id) ON DELETE CASCADE,
  parameter_nilai_id  uuid REFERENCES ipa_parameter_nilai(id) ON DELETE CASCADE,
  nama_file           text NOT NULL,
  url                 text NOT NULL, -- path di bucket ipa-bukti (bag. 4 di bawah)
  ukuran_bytes        bigint,
  mime_type           text,
  uploaded_by         uuid REFERENCES auth.users(id),
  created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_idb_record ON ipa_dokumen_bukti(ipa_record_id);

CREATE TABLE IF NOT EXISTS ipa_log (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ipa_record_id  uuid NOT NULL REFERENCES ipa_record(id) ON DELETE CASCADE,
  user_id        uuid REFERENCES auth.users(id),
  aksi           text NOT NULL,
  keterangan     text,
  payload        jsonb,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ilog_record ON ipa_log(ipa_record_id);

-- ── 4. Bucket ipa-bukti (privat, image+PDF, 10MB — pola sama dokumen-sumber) ─
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('ipa-bukti', 'ipa-bukti', false, 10485760,
        ARRAY['image/jpeg','image/png','image/webp','application/pdf'])
ON CONFLICT (id) DO UPDATE SET file_size_limit = 10485760,
  allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp','application/pdf'];

DROP POLICY IF EXISTS "ipa_bukti_select" ON storage.objects;
CREATE POLICY "ipa_bukti_select" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'ipa-bukti');
DROP POLICY IF EXISTS "ipa_bukti_insert" ON storage.objects;
CREATE POLICY "ipa_bukti_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'ipa-bukti');
DROP POLICY IF EXISTS "ipa_bukti_delete" ON storage.objects;
CREATE POLICY "ipa_bukti_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'ipa-bukti');

-- ── 5. Helper: role IPA user saat ini ────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_ipa_role() RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT ipa_role FROM profiles WHERE id = auth.uid()
$$;

-- ── 6. RLS ───────────────────────────────────────────────────────────────────
-- pb_admin: CRUD record/parameter/dokumen MILIK SKPD SENDIRI, cuma selama
-- status='draft' (satu pintu — setelah diajukan, terkunci sisi pb_admin, sama
-- semangat Pengalihan Status). bkad_verifier/bkad_admin: lihat semua + ubah
-- status (verifikasi/tolak). fn_is_admin() (admin BMD umum) tetap superuser
-- fallback, konsisten pola lain di app ini.
ALTER TABLE ipa_tahun_anggaran ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ita_select" ON ipa_tahun_anggaran;
CREATE POLICY "ita_select" ON ipa_tahun_anggaran FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "ita_write" ON ipa_tahun_anggaran;
CREATE POLICY "ita_write" ON ipa_tahun_anggaran FOR ALL TO authenticated
  USING (fn_is_admin() OR fn_ipa_role() = 'bkad_admin')
  WITH CHECK (fn_is_admin() OR fn_ipa_role() = 'bkad_admin');

ALTER TABLE ipa_record ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ir_select" ON ipa_record;
CREATE POLICY "ir_select" ON ipa_record FOR SELECT TO authenticated
  USING (fn_is_admin() OR fn_ipa_role() IN ('bkad_verifier','bkad_admin') OR fn_skpd_visible(skpd_id));
DROP POLICY IF EXISTS "ir_insert" ON ipa_record;
CREATE POLICY "ir_insert" ON ipa_record FOR INSERT TO authenticated
  WITH CHECK (fn_is_admin() OR (fn_ipa_role() = 'pb_admin' AND fn_skpd_visible(skpd_id)));
DROP POLICY IF EXISTS "ir_update" ON ipa_record;
CREATE POLICY "ir_update" ON ipa_record FOR UPDATE TO authenticated
  USING (
    fn_is_admin() OR fn_ipa_role() IN ('bkad_verifier','bkad_admin')
    OR (fn_ipa_role() = 'pb_admin' AND fn_skpd_visible(skpd_id) AND status = 'draft')
  );

-- ipa_parameter_nilai: visibilitas & tulis ikut ipa_record induknya
-- (EXISTS-subquery, pola sama transaksi_bmd <-> aset).
ALTER TABLE ipa_parameter_nilai ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ipn_select" ON ipa_parameter_nilai;
CREATE POLICY "ipn_select" ON ipa_parameter_nilai FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM ipa_record r WHERE r.id = ipa_id AND
    (fn_is_admin() OR fn_ipa_role() IN ('bkad_verifier','bkad_admin') OR fn_skpd_visible(r.skpd_id))));
DROP POLICY IF EXISTS "ipn_write" ON ipa_parameter_nilai;
CREATE POLICY "ipn_write" ON ipa_parameter_nilai FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM ipa_record r WHERE r.id = ipa_id AND
    (fn_is_admin() OR (fn_ipa_role() = 'pb_admin' AND fn_skpd_visible(r.skpd_id) AND r.status = 'draft'))))
  WITH CHECK (EXISTS (SELECT 1 FROM ipa_record r WHERE r.id = ipa_id AND
    (fn_is_admin() OR (fn_ipa_role() = 'pb_admin' AND fn_skpd_visible(r.skpd_id) AND r.status = 'draft'))));

-- ipa_dokumen_bukti: SELECT sama pola; INSERT/DELETE dibuka pb_admin (draft)
-- ATAU bkad/admin (mis. lampirin bukti verifikasi), ikut record induknya.
ALTER TABLE ipa_dokumen_bukti ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "idb_select" ON ipa_dokumen_bukti;
CREATE POLICY "idb_select" ON ipa_dokumen_bukti FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM ipa_record r WHERE r.id = ipa_record_id AND
    (fn_is_admin() OR fn_ipa_role() IN ('bkad_verifier','bkad_admin') OR fn_skpd_visible(r.skpd_id))));
DROP POLICY IF EXISTS "idb_insert" ON ipa_dokumen_bukti;
CREATE POLICY "idb_insert" ON ipa_dokumen_bukti FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM ipa_record r WHERE r.id = ipa_record_id AND
    (fn_is_admin() OR fn_ipa_role() IN ('bkad_verifier','bkad_admin')
     OR (fn_ipa_role() = 'pb_admin' AND fn_skpd_visible(r.skpd_id) AND r.status = 'draft'))));
DROP POLICY IF EXISTS "idb_delete" ON ipa_dokumen_bukti;
CREATE POLICY "idb_delete" ON ipa_dokumen_bukti FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM ipa_record r WHERE r.id = ipa_record_id AND
    (fn_is_admin() OR (fn_ipa_role() = 'pb_admin' AND fn_skpd_visible(r.skpd_id) AND r.status = 'draft'))));

-- ipa_log: audit trail — APPEND-ONLY (cuma SELECT+INSERT, tanpa UPDATE/DELETE),
-- konsisten prinsip inti app ini (transaksi_bmd juga append-only).
ALTER TABLE ipa_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ilog_select" ON ipa_log;
CREATE POLICY "ilog_select" ON ipa_log FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM ipa_record r WHERE r.id = ipa_record_id AND
    (fn_is_admin() OR fn_ipa_role() IN ('bkad_verifier','bkad_admin') OR fn_skpd_visible(r.skpd_id))));
DROP POLICY IF EXISTS "ilog_insert" ON ipa_log;
CREATE POLICY "ilog_insert" ON ipa_log FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM ipa_record r WHERE r.id = ipa_record_id AND
    (fn_is_admin() OR fn_ipa_role() IN ('bkad_verifier','bkad_admin') OR fn_skpd_visible(r.skpd_id))));
