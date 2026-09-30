-- ============================================================================
-- 20261001_02 — Profil Pengguna: Nomor HP pegawai
-- ============================================================================
-- Permintaan user 2026-10-01: halaman Profil (nama, NIP, pangkat/golongan,
-- jabatan, JK, nomor HP, ganti password). Nomor HP DIHIMPUN sekarang untuk
-- rencana menyambungkan chatbot ke nomor WhatsApp tiap pengurus barang.
--
-- Rumahnya `admin_pegawai`, BUKAN `admin_profiles`: nomor HP melekat pada
-- ORANGNYA (dipakai juga di Daftar Pegawai), dan satu pegawai bisa punya lebih
-- dari satu akun. Akun menemukan pegawainya lewat `admin_profiles.pegawai_id`
-- (terisi 73 dari 74 akun per 2026-10-01).
--
-- Bentuk tersimpan SELALU dinormalkan `62xxxxxxxxxx` (tanpa +, spasi, strip) —
-- normalisasinya di klien (lib/noHp.ts), DB menegakkan BENTUKNYA lewat CHECK.
-- UNIK (parsial, yang terisi saja): chatbot kelak mengenali pengirim dari
-- nomornya; dua pegawai bernomor sama = chatbot tak tahu siapa yang bertanya.
--
-- `pegawai_update` tetap ADMIN SAJA. Pengguna mengubah nomornya SENDIRI lewat
-- `fn_profil_simpan_hp` (SECURITY DEFINER) yang hanya menyentuh kolom `no_hp`
-- milik pegawai yang tertaut ke akunnya — bukan dgn melonggarkan policy, yang
-- akan membuka nama/NIP/jabatan untuk ikut disunting.
-- ============================================================================

ALTER TABLE admin_pegawai ADD COLUMN IF NOT EXISTS no_hp text;

ALTER TABLE admin_pegawai DROP CONSTRAINT IF EXISTS admin_pegawai_no_hp_format;
ALTER TABLE admin_pegawai ADD CONSTRAINT admin_pegawai_no_hp_format
  CHECK (no_hp IS NULL OR no_hp ~ '^62[0-9]{8,13}$');

CREATE UNIQUE INDEX IF NOT EXISTS uq_admin_pegawai_no_hp
  ON admin_pegawai (no_hp) WHERE no_hp IS NOT NULL;

CREATE OR REPLACE FUNCTION fn_profil_simpan_hp(p_no_hp text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_pegawai uuid;
  v_hp text := NULLIF(btrim(COALESCE(p_no_hp, '')), '');
  v_pemilik text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Belum login.';
  END IF;
  SELECT pegawai_id INTO v_pegawai FROM admin_profiles WHERE id = auth.uid();
  IF v_pegawai IS NULL THEN
    RAISE EXCEPTION 'Akun ini belum ditautkan ke data pegawai — minta admin menautkannya di Daftar User.';
  END IF;
  IF v_hp IS NOT NULL AND v_hp !~ '^62[0-9]{8,13}$' THEN
    RAISE EXCEPTION 'Format nomor HP tidak sah (harus 62 diikuti 8–13 angka).';
  END IF;
  IF v_hp IS NOT NULL THEN
    SELECT nama INTO v_pemilik FROM admin_pegawai WHERE no_hp = v_hp AND id <> v_pegawai LIMIT 1;
    IF FOUND THEN
      RAISE EXCEPTION 'Nomor HP ini sudah dipakai pegawai lain (%). Satu nomor hanya untuk satu pegawai.', v_pemilik;
    END IF;
  END IF;
  UPDATE admin_pegawai SET no_hp = v_hp, updated_at = now() WHERE id = v_pegawai;
  RETURN v_hp;
END $$;

REVOKE ALL ON FUNCTION fn_profil_simpan_hp(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fn_profil_simpan_hp(text) TO authenticated;
