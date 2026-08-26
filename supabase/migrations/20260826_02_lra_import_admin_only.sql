-- ============================================================================
-- 2026-08-26 — Import LRA jadi ADMIN-ONLY (permintaan user).
--
-- Sampai hari ini `lra_realisasi` cuma dijaga RLS baris (admin ATAU
-- fn_skpd_visible(skpd_id)), jadi Pengurus Barang & Pengurus Barang Pembantu
-- bisa meng-INSERT/UPDATE/DELETE data hasil import LRA di SKPD-nya sendiri
-- (lewat menu Pelaporan > LRA > Import Excel LRA). User minta menu itu
-- dipersempit jadi admin saja — Pengurus Barang, Pengurus Barang Pembantu,
-- maupun Pengawas (akuntansi/auditor) tidak perlu.
--
-- ⚠️ TAPI tabel yang sama juga dipakai fitur LAIN yang TIDAK diminta dibatasi:
-- "+ Tandai Kapitalisasi" / "+ Tandai Reklasifikasi" (LraTagModal) — itu
-- UPDATE kolom `klasifikasi`/`jenis_tujuan` SAJA, dan tetap boleh dilakukan
-- Pengurus Barang/Pembantu di SKPD-nya (perilaku LAMA, tak diminta berubah).
-- Menyamaratakan RLS `lra_update` jadi admin-only akan MENGUNCI fitur tag itu
-- juga — regresi yang tak diminta.
--
-- Karena RLS baris (`USING`/`WITH CHECK`) tak bisa membedakan KOLOM apa yang
-- diubah, pembedanya lewat TRIGGER (pola yang sama dgn `fn_transaksi_bmd_
-- immutable`, `fn_rkbmd_lampiran_batal`, dst di repo ini):
--   - INSERT & DELETE  → SELALU admin-only (itulah bentuk "import").
--   - UPDATE kolom IMPOR (tanggal/no_bukti/kode_rekening/uraian/keterangan/
--     debit/skpd_id) → admin-only.
--   - UPDATE HANYA kolom TANDA (klasifikasi/jenis_tujuan) → tetap admin ATAU
--     fn_skpd_visible(skpd_id), SAMA PERSIS RLS lama — jalur tag tak berubah.
--
-- RLS `lra_insert`/`lra_update`/`lra_delete` DIBIARKAN seperti semula (masih
-- mengizinkan fn_skpd_visible di level baris) — trigger inilah yang menolak
-- lebih dulu untuk kasus IMPORT, RLS tetap jadi lapis kedua yang menyaring baris
-- per SKPD utk kasus TAG. `lra_select` (baca) TIDAK disentuh sama sekali —
-- semua role tetap bisa melihat laporan Rekonsiliasi LRA seperti biasa.
--
-- Diverifikasi ke DB (RLS aktif, dalam transaksi lalu ROLLBACK) sbg
-- pengurus_barang uid e80fd4eb-ea09-42df-8e9c-0d1e9e905748 (skpd 36):
--   INSERT baru               → DITOLAK ✓
--   UPDATE kolom debit        → DITOLAK ✓
--   UPDATE klasifikasi saja   → LOLOS   ✓ (fitur tag tak kena)
--   DELETE                    → DITOLAK ✓
-- dan sbg admin: ketiganya (insert/update debit/delete) LOLOS seperti semula.
-- ============================================================================

CREATE OR REPLACE FUNCTION fn_lra_realisasi_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NOT fn_is_admin() THEN
      RAISE EXCEPTION 'lra_realisasi: hanya admin yang boleh mengimpor data LRA baru.';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF NOT fn_is_admin() THEN
      RAISE EXCEPTION 'lra_realisasi: hanya admin yang boleh menghapus data LRA (mis. saat re-import).';
    END IF;
    RETURN OLD;
  END IF;

  -- UPDATE: bedakan re-import (kolom data) vs penandaan (klasifikasi/jenis_tujuan).
  IF NOT fn_is_admin() THEN
    IF NEW.tanggal IS DISTINCT FROM OLD.tanggal
       OR NEW.no_bukti IS DISTINCT FROM OLD.no_bukti
       OR NEW.kode_rekening IS DISTINCT FROM OLD.kode_rekening
       OR NEW.uraian IS DISTINCT FROM OLD.uraian
       OR NEW.keterangan IS DISTINCT FROM OLD.keterangan
       OR NEW.debit IS DISTINCT FROM OLD.debit
       OR NEW.skpd_id IS DISTINCT FROM OLD.skpd_id THEN
      RAISE EXCEPTION 'lra_realisasi: hanya admin yang boleh mengubah data hasil import LRA — non-admin hanya boleh menandai Kapitalisasi/Reklasifikasi.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lra_realisasi_guard ON lra_realisasi;
CREATE TRIGGER trg_lra_realisasi_guard BEFORE INSERT OR UPDATE OR DELETE ON lra_realisasi
  FOR EACH ROW EXECUTE FUNCTION fn_lra_realisasi_guard();
