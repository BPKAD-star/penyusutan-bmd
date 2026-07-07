-- ============================================================================
-- aset_bidang_tanah — 1 baris = 1 bidang tanah. Satu aset Tanah (1 NIBAR, 1
-- baris di `aset`) bisa punya BANYAK bidang, tiap bidang sertifikat sendiri.
-- SENGAJA tabel anak dgn 1 baris per bidang (BUKAN kolom bidang_1..bidang_20)
-- — keputusan user 2026-07-09 setelah didiskusikan: gak ada batas natural,
-- boros NULL utk kasus 1-bidang (mayoritas), query rentang tanggal/sertifikat
-- jadi ribet kalau nyebar di N kolom, dan UX tambah/hapus jadi gak natural
-- (harus geser slot). Dipakai oleh halaman GIS BMD internal (app/dashboard/gis)
-- yang gantiin GIS BMD eksternal lama (nembak database aset_tanah terpisah,
-- bikin dual-entry - terutama SKPD pengguna yg di app kita udah otomatis
-- ke-update lewat ledger Pengalihan Status).
--
-- BUKAN ledger (bukan riwayat finansial/penyusutan) — data referensi/deskriptif
-- murni, jadi UPDATE/DELETE diizinkan langsung (beda dari aset/transaksi_bmd
-- yang append-only). Tidak lewat catatTransaksi sama sekali.
--
-- Jalankan SETELAH 20260709 lain tidak ada — file pertama tanggal ini.
-- ============================================================================

CREATE TABLE IF NOT EXISTS aset_bidang_tanah (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  aset_id                     uuid NOT NULL REFERENCES aset(id) ON DELETE CASCADE,
  nama_bidang                 text,                   -- label bebas, mis. "Bidang 1 - sisi utara"
  luas                        numeric,                -- m2, samain tipe dgn aset.luas
  jenis_hak                   text,                   -- daftar sama dgn FIELD_OPTIONS.jenis_hak (lib/asetFields.ts); TANPA CHECK — samain perilaku lenient dgn aset.jenis_hak yg jg bebas teks
  nomor_dokumen_kepemilikan   text,
  tanggal_dokumen_kepemilikan date,
  nama_dokumen_kepemilikan    text,
  tanggal_berakhir_hak        date,                   -- BARU, blm ada di aset (HGB/HGU ada masa berlaku, HM/HP umumnya tidak)
  wilayah_kode                text REFERENCES wilayah(kode),
  alamat_detail                text,
  latitude                     numeric,
  longitude                    numeric,
  sertifikat_path              text,                   -- path di bucket dokumen-sumber (sudah izinin PDF, lihat migrasi 21)
  keterangan                   text,
  created_at                   timestamptz NOT NULL DEFAULT now(),
  updated_at                   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT abt_tgl_berakhir_check CHECK (
    tanggal_berakhir_hak IS NULL OR tanggal_dokumen_kepemilikan IS NULL
    OR tanggal_berakhir_hak > tanggal_dokumen_kepemilikan)
);
CREATE INDEX IF NOT EXISTS idx_bidang_aset ON aset_bidang_tanah(aset_id);

DROP TRIGGER IF EXISTS trg_abt_updated_at ON aset_bidang_tanah;
CREATE TRIGGER trg_abt_updated_at BEFORE UPDATE ON aset_bidang_tanah
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at(); -- reuse, sudah ada sejak migrasi 01

-- ── RLS: gak ada skpd_id sendiri di tabel ini — visibilitas ikut SKPD
-- pemilik aset induk (EXISTS-subquery, pola sama persis transaksi_bmd di
-- migrasi 01). UPDATE/DELETE diizinkan (beda dari aset/transaksi_bmd) krn
-- ini data referensi, bukan ledger.
ALTER TABLE aset_bidang_tanah ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "abt_select" ON aset_bidang_tanah;
CREATE POLICY "abt_select" ON aset_bidang_tanah FOR SELECT TO authenticated
  USING (fn_is_admin() OR EXISTS (SELECT 1 FROM aset a WHERE a.id = aset_id AND fn_skpd_visible(a.skpd_id)));

DROP POLICY IF EXISTS "abt_insert" ON aset_bidang_tanah;
CREATE POLICY "abt_insert" ON aset_bidang_tanah FOR INSERT TO authenticated
  WITH CHECK (fn_is_admin() OR EXISTS (SELECT 1 FROM aset a WHERE a.id = aset_id AND fn_skpd_visible(a.skpd_id)));

DROP POLICY IF EXISTS "abt_update" ON aset_bidang_tanah;
CREATE POLICY "abt_update" ON aset_bidang_tanah FOR UPDATE TO authenticated
  USING (fn_is_admin() OR EXISTS (SELECT 1 FROM aset a WHERE a.id = aset_id AND fn_skpd_visible(a.skpd_id)));

DROP POLICY IF EXISTS "abt_delete" ON aset_bidang_tanah;
CREATE POLICY "abt_delete" ON aset_bidang_tanah FOR DELETE TO authenticated
  USING (fn_is_admin() OR EXISTS (SELECT 1 FROM aset a WHERE a.id = aset_id AND fn_skpd_visible(a.skpd_id)));
