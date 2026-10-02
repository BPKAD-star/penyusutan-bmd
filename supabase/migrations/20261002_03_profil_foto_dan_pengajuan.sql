-- ============================================================================
-- 20261002_03 — Profil Pengguna: Foto profil + pengajuan perubahan data pegawai
-- ============================================================================
-- Permintaan user 2026-10-02: pengguna boleh mengganti foto profil, nama,
-- pangkat, dan jabatan dari halaman Profil. Keputusan (user, sesudah diberi
-- pilihan):
--   · FOTO PROFIL & NOMOR HP  → diubah pemilik akun LANGSUNG.
--   · NAMA, PANGKAT/GOLONGAN, JABATAN → DIAJUKAN, baru tersimpan sesudah admin
--     menyetujui.
--
-- KENAPA data pegawai tidak boleh disunting bebas: ketiganya dicetak di lembar
-- bertanda tangan (KIR, BA Rekon, Surat Pernyataan Pengadaan, RKBMD), dan
-- `jabatan` dipakai `fetchCalonTtd` untuk menebak siapa Kepala SKPD (kata
-- "Kepala" di kolom jabatan). Kalau pemilik akun bebas mengetiknya, siapa pun
-- bisa memasang "Kepala …" pada dirinya sendiri dan muncul sebagai calon
-- penanda tangan — dan perubahannya langsung ikut tercetak. `pegawai_update`
-- tetap ADMIN SAJA; jalur pengguna lewat RPC SECURITY DEFINER di bawah, bukan
-- dengan melonggarkan policy.
--
-- Pola: sama dgn `fn_profil_simpan_hp` (20261001_02) — RPC yang hanya menyentuh
-- baris pegawai yang tertaut ke akunnya (`admin_profiles.pegawai_id`).
--
-- ⚠️ Deploy-ordering: migrasi ini WAJIB jalan SEBELUM deploy kode — layout
-- dashboard sudah men-`select` kolom `foto_path`; tanpa kolomnya query profil
-- gagal & TopBar kehilangan nama pengguna.
-- ============================================================================

-- ── 1. Foto profil ──────────────────────────────────────────────────────────
ALTER TABLE admin_pegawai ADD COLUMN IF NOT EXISTS foto_path text;

-- Bucket privat, 2 MB (klien menyusutkan fotonya jadi ±100 KB sebelum unggah).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('foto-profil', 'foto-profil', false, 2097152, ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO UPDATE
  SET file_size_limit = 2097152, allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp'];

-- Tiap pengguna hanya menyentuh folder miliknya sendiri: path = '<auth.uid()>/…'.
-- (SELECT auth.uid()) dibungkus InitPlan — dievaluasi sekali, bukan per baris.
DROP POLICY IF EXISTS "foto_profil_select" ON storage.objects;
CREATE POLICY "foto_profil_select" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'foto-profil' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);
DROP POLICY IF EXISTS "foto_profil_insert" ON storage.objects;
CREATE POLICY "foto_profil_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'foto-profil' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);
DROP POLICY IF EXISTS "foto_profil_delete" ON storage.objects;
CREATE POLICY "foto_profil_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'foto-profil' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);

CREATE OR REPLACE FUNCTION fn_profil_simpan_foto(p_path text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_pegawai uuid;
  v_path text := NULLIF(btrim(COALESCE(p_path, '')), '');
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Belum login.';
  END IF;
  SELECT pegawai_id INTO v_pegawai FROM admin_profiles WHERE id = auth.uid();
  IF v_pegawai IS NULL THEN
    RAISE EXCEPTION 'Akun ini belum ditautkan ke data pegawai — minta admin menautkannya di Daftar User.';
  END IF;
  -- Path wajib di folder milik akun ini: tanpa itu pengguna bisa menunjuk foto
  -- orang lain sebagai fotonya sendiri.
  IF v_path IS NOT NULL AND v_path NOT LIKE auth.uid()::text || '/%' THEN
    RAISE EXCEPTION 'Path foto tidak sah.';
  END IF;
  UPDATE admin_pegawai SET foto_path = v_path, updated_at = now() WHERE id = v_pegawai;
  RETURN v_path;
END $$;

REVOKE ALL ON FUNCTION fn_profil_simpan_foto(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fn_profil_simpan_foto(text) TO authenticated;

-- ── 2. Pengajuan perubahan data pegawai ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS admin_pegawai_pengajuan (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pegawai_id     uuid NOT NULL REFERENCES admin_pegawai(id) ON DELETE CASCADE,
  diajukan_oleh  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  -- Nilai USULAN
  nama           text NOT NULL,
  golongan       text,
  pangkat        text,
  jabatan        text,
  -- Foto nilai SEBELUM, supaya admin melihat apa yang berubah tanpa membuka
  -- data pegawai & tetap terbaca walau pegawainya kelak diubah lagi.
  nama_lama      text,
  golongan_lama  text,
  pangkat_lama   text,
  jabatan_lama   text,
  status         text NOT NULL DEFAULT 'menunggu'
                 CHECK (status IN ('menunggu','disetujui','ditolak')),
  catatan_admin  text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  diputuskan_at  timestamptz,
  diputuskan_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Paling banyak SATU pengajuan menunggu per pegawai — mengajukan lagi
-- MENGGANTI yang lama (lihat fn_profil_ajukan_ubah), bukan menumpuk.
CREATE UNIQUE INDEX IF NOT EXISTS uq_pegawai_pengajuan_menunggu
  ON admin_pegawai_pengajuan (pegawai_id) WHERE status = 'menunggu';
CREATE INDEX IF NOT EXISTS idx_pegawai_pengajuan_pegawai
  ON admin_pegawai_pengajuan (pegawai_id, created_at DESC);

ALTER TABLE admin_pegawai_pengajuan ENABLE ROW LEVEL SECURITY;

-- Baca: admin melihat semuanya; pengguna hanya pengajuan pegawainya sendiri.
-- TANPA policy tulis & GRANT tulisnya dicabut — seluruh perubahan lewat RPC.
DROP POLICY IF EXISTS "pengajuan_select" ON admin_pegawai_pengajuan;
CREATE POLICY "pengajuan_select" ON admin_pegawai_pengajuan FOR SELECT TO authenticated
  USING (
    (SELECT fn_is_admin())
    OR pegawai_id IN (SELECT pegawai_id FROM admin_profiles WHERE id = (SELECT auth.uid()))
  );
REVOKE ALL ON admin_pegawai_pengajuan FROM PUBLIC, anon, authenticated;
GRANT SELECT ON admin_pegawai_pengajuan TO authenticated;

CREATE OR REPLACE FUNCTION fn_profil_ajukan_ubah(
  p_nama text, p_golongan text, p_pangkat text, p_jabatan text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_pegawai uuid;
  v_p admin_pegawai%ROWTYPE;
  v_nama text := NULLIF(btrim(COALESCE(p_nama, '')), '');
  v_gol text := NULLIF(btrim(COALESCE(p_golongan, '')), '');
  v_pkt text := NULLIF(btrim(COALESCE(p_pangkat, '')), '');
  v_jab text := NULLIF(btrim(COALESCE(p_jabatan, '')), '');
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Belum login.';
  END IF;
  SELECT pegawai_id INTO v_pegawai FROM admin_profiles WHERE id = auth.uid();
  IF v_pegawai IS NULL THEN
    RAISE EXCEPTION 'Akun ini belum ditautkan ke data pegawai — minta admin menautkannya di Daftar User.';
  END IF;
  IF v_nama IS NULL THEN
    RAISE EXCEPTION 'Nama tidak boleh kosong.';
  END IF;
  SELECT * INTO v_p FROM admin_pegawai WHERE id = v_pegawai;
  IF v_nama IS NOT DISTINCT FROM v_p.nama
     AND v_gol IS NOT DISTINCT FROM v_p.golongan
     AND v_pkt IS NOT DISTINCT FROM v_p.pangkat
     AND v_jab IS NOT DISTINCT FROM v_p.jabatan THEN
    RAISE EXCEPTION 'Tidak ada yang berubah dari data pegawai saat ini.';
  END IF;

  -- Pengajuan menunggu yang lama diganti, bukan ditumpuk.
  DELETE FROM admin_pegawai_pengajuan WHERE pegawai_id = v_pegawai AND status = 'menunggu';
  INSERT INTO admin_pegawai_pengajuan (
    pegawai_id, diajukan_oleh, nama, golongan, pangkat, jabatan,
    nama_lama, golongan_lama, pangkat_lama, jabatan_lama
  ) VALUES (
    v_pegawai, auth.uid(), v_nama, v_gol, v_pkt, v_jab,
    v_p.nama, v_p.golongan, v_p.pangkat, v_p.jabatan
  ) RETURNING id INTO v_id;
  RETURN v_id;
END $$;

REVOKE ALL ON FUNCTION fn_profil_ajukan_ubah(text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fn_profil_ajukan_ubah(text, text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION fn_profil_tarik_ajuan()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_pegawai uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Belum login.';
  END IF;
  SELECT pegawai_id INTO v_pegawai FROM admin_profiles WHERE id = auth.uid();
  IF v_pegawai IS NULL THEN
    RAISE EXCEPTION 'Akun ini belum ditautkan ke data pegawai.';
  END IF;
  DELETE FROM admin_pegawai_pengajuan WHERE pegawai_id = v_pegawai AND status = 'menunggu';
END $$;

REVOKE ALL ON FUNCTION fn_profil_tarik_ajuan() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fn_profil_tarik_ajuan() TO authenticated;

CREATE OR REPLACE FUNCTION fn_profil_putuskan_ubah(p_id uuid, p_setuju boolean, p_catatan text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_a admin_pegawai_pengajuan%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT fn_is_admin() THEN
    RAISE EXCEPTION 'Hanya admin yang boleh memutuskan pengajuan perubahan data pegawai.';
  END IF;
  SELECT * INTO v_a FROM admin_pegawai_pengajuan WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pengajuan tidak ditemukan.';
  END IF;
  IF v_a.status <> 'menunggu' THEN
    RAISE EXCEPTION 'Pengajuan ini sudah diputuskan (%).', v_a.status;
  END IF;

  IF p_setuju THEN
    UPDATE admin_pegawai
       SET nama = v_a.nama, golongan = v_a.golongan, pangkat = v_a.pangkat,
           jabatan = v_a.jabatan, updated_at = now()
     WHERE id = v_a.pegawai_id;
  END IF;

  UPDATE admin_pegawai_pengajuan
     SET status = CASE WHEN p_setuju THEN 'disetujui' ELSE 'ditolak' END,
         catatan_admin = NULLIF(btrim(COALESCE(p_catatan, '')), ''),
         diputuskan_at = now(), diputuskan_by = auth.uid()
   WHERE id = p_id;
END $$;

REVOKE ALL ON FUNCTION fn_profil_putuskan_ubah(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fn_profil_putuskan_ubah(uuid, boolean, text) TO authenticated;
