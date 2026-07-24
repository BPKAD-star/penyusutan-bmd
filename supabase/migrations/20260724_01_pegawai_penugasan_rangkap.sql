-- ============================================================================
-- Rangkap Pengguna Barang — penugasan ganda antar-SKPD (Opsi B aditif).
--
-- LATAR: admin_pegawai = 1 baris per orang (nip UNIQUE) = 1 role_bmd + 1 skpd_id.
--   Seorang Pengguna Barang tidak bisa tercatat merangkap di 2 SKPD (Plt/rangkap
--   jabatan). Keputusan user 2026-07-24: HANYA 'pengguna_barang' yang boleh
--   rangkap; peran lain tetap satu-satu (sudah otomatis krn 1 baris/orang).
--   Tujuan: MURNI PENCATATAN/PELAPORAN — tidak menyentuh akun login, RLS akses,
--   profiles, engine, maupun ledger.
--
-- PENDEKATAN ADITIF: admin_pegawai TETAP jadi penugasan POKOK (dibaca create-user
--   → profiles.skpd_id, ditulis fn_setujui_usulan_pengurus, di-upsert Import
--   Excel). Tabel ini HANYA menampung penugasan pengguna-barang TAMBAHAN (rangkap).
--   Semua jalur eksisting tak berubah.
--
-- Jalankan di Supabase SQL Editor SEBELUM deploy kode (halaman Daftar Pegawai
-- baru akan query tabel ini). SETELAH 20260723_04_usulan_tahun.sql.
-- ============================================================================

CREATE TABLE IF NOT EXISTS admin_pegawai_penugasan (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pegawai_id  uuid   NOT NULL REFERENCES admin_pegawai(id) ON DELETE CASCADE,
  skpd_id     bigint NOT NULL REFERENCES admin_skpd(id),
  -- Sengaja disimpan walau selalu 'pengguna_barang' — supaya query pelaporan bisa
  -- UNION seragam dgn admin_pegawai, dan aturan bisa dilonggarkan nanti (ubah CHECK).
  role_bmd    text   NOT NULL DEFAULT 'pengguna_barang'
              CHECK (role_bmd = 'pengguna_barang'),
  no_sk       text,
  tmt         date,                          -- terhitung mulai tanggal (opsional)
  aktif       boolean NOT NULL DEFAULT true,
  keterangan  text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pegawai_id, skpd_id)               -- tak boleh rangkap 2x di SKPD yang sama
);
CREATE INDEX IF NOT EXISTS idx_pegawai_penugasan_pegawai ON admin_pegawai_penugasan(pegawai_id);
CREATE INDEX IF NOT EXISTS idx_pegawai_penugasan_skpd    ON admin_pegawai_penugasan(skpd_id);

DROP TRIGGER IF EXISTS trg_pegawai_penugasan_updated ON admin_pegawai_penugasan;
CREATE TRIGGER trg_pegawai_penugasan_updated BEFORE UPDATE ON admin_pegawai_penugasan
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- ── RLS: meniru admin_pegawai — semua authenticated boleh baca, tulis admin-only.
-- fn_is_admin() dibungkus InitPlan (SELECT ...) supaya dievaluasi sekali (konsisten
-- dgn aturan performa CLAUDE.md; tabel ini kecil, tapi murah & aman).
ALTER TABLE admin_pegawai_penugasan ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pegawai_penugasan_select" ON admin_pegawai_penugasan;
CREATE POLICY "pegawai_penugasan_select" ON admin_pegawai_penugasan FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "pegawai_penugasan_insert" ON admin_pegawai_penugasan;
CREATE POLICY "pegawai_penugasan_insert" ON admin_pegawai_penugasan FOR INSERT TO authenticated WITH CHECK ((SELECT fn_is_admin()));

DROP POLICY IF EXISTS "pegawai_penugasan_update" ON admin_pegawai_penugasan;
CREATE POLICY "pegawai_penugasan_update" ON admin_pegawai_penugasan FOR UPDATE TO authenticated USING ((SELECT fn_is_admin()));

DROP POLICY IF EXISTS "pegawai_penugasan_delete" ON admin_pegawai_penugasan;
CREATE POLICY "pegawai_penugasan_delete" ON admin_pegawai_penugasan FOR DELETE TO authenticated USING ((SELECT fn_is_admin()));
