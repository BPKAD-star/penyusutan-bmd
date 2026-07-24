-- ============================================================================
-- Pengguna Barang NON-ASN (tanpa NIP) — khusus SKPD RSUD.
--
-- LATAR (keputusan user 2026-07-24): Kepala/Pengguna Barang di RSUD bisa pejabat
--   NON-ASN (mis. tenaga BLUD/kontrak) yang TIDAK punya NIP 18 digit. Sampai
--   sekarang admin_pegawai.nip = NOT NULL → orang tanpa NIP tak bisa dicatat.
--
-- LINGKUP SEMPIT & SENGAJA: NIP boleh NULL HANYA bila
--     role_bmd = 'pengguna_barang'  DAN  SKPD-nya RSUD.
--   Semua pegawai lain (peran apa pun, SKPD non-RSUD) TETAP wajib NIP.
--   role_bmd = ATRIBUT master (tidak dipakai RLS/engine — lihat 20260714_03),
--   jadi guard ini murni higiene data, bukan gerbang keamanan.
--
-- IDENTIFIKASI RSUD via nama (ILIKE 'RSUD%') — di DB Kab. Kediri hanya ada dua:
--   'RSUD SLG' & 'RSUD Kabupaten Kediri', keduanya cocok. Kalau nanti perlu
--   melonggarkan (SKPD lain, atau ganti ke daftar id eksplisit), sunting KLAUSA
--   di fn_pegawai_nip_guard di bawah — jangan bikin bypass umum.
--
-- AMAN thd jalur lain: Import Excel & fn_setujui_usulan_pengurus SELALU kirim NIP
--   (usulan tak pernah pengguna_barang), jadi tak terpengaruh. NULL nip tak
--   melanggar UNIQUE(nip) (NULL saling berbeda di Postgres) & tak pernah cocok
--   ON CONFLICT (nip) → non-ASN murni dibuat lewat form Daftar Pegawai.
--
-- Jalankan di Supabase SQL Editor SEBELUM deploy kode. SETELAH
-- 20260724_02_import_pengguna_barang.sql.
-- ============================================================================

-- (1) NIP tak lagi wajib di level kolom. UNIQUE(nip) tetap (NULL diperbolehkan &
--     saling berbeda). Guard fungsional dipindah ke trigger di bawah.
ALTER TABLE admin_pegawai ALTER COLUMN nip DROP NOT NULL;

-- (2) Guard: normalisasi NIP kosong → NULL, lalu batasi siapa yang boleh NULL.
CREATE OR REPLACE FUNCTION fn_pegawai_nip_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  -- NIP hanya spasi/empty → anggap NULL (non-ASN), supaya UNIQUE & ON CONFLICT
  -- konsisten (hindari '' yang unik-tapi-bukan-NULL).
  IF NEW.nip IS NOT NULL AND btrim(NEW.nip) = '' THEN
    NEW.nip := NULL;
  END IF;

  IF NEW.nip IS NULL THEN
    IF NEW.role_bmd <> 'pengguna_barang'
       OR NOT EXISTS (
         SELECT 1 FROM admin_skpd s
         WHERE s.id = NEW.skpd_id AND s.nama ILIKE 'RSUD%'
       ) THEN
      RAISE EXCEPTION 'NIP wajib diisi. Pegawai tanpa NIP (non-ASN) hanya untuk Pengguna Barang di SKPD RSUD.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_pegawai_nip_guard ON admin_pegawai;
CREATE TRIGGER trg_pegawai_nip_guard
  BEFORE INSERT OR UPDATE ON admin_pegawai
  FOR EACH ROW EXECUTE FUNCTION fn_pegawai_nip_guard();
