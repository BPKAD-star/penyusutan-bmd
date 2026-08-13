-- RKBMD: usulan NIHIL — SKPD menyatakan tidak mengusulkan apa pun untuk suatu
-- jenis di suatu tahun anggaran. Permintaan user 2026-08-13.
--
-- Kenapa perlu kolom sendiri, bukan cukup "dokumen tanpa item": dua keadaan itu
-- terlihat sama persis di layar tapi artinya berlawanan —
--   • dokumen kosong        = BELUM disusun (pekerjaan yang belum selesai)
--   • dokumen NIHIL         = SUDAH disusun, hasilnya memang tidak ada usulan
-- Tanpa pembeda, Pengelola Barang tak punya cara membedakan SKPD yang sudah
-- menyatakan sikap dari SKPD yang belum mengerjakan sama sekali, dan lembar
-- cetaknya pun tak bisa berkata apa-apa selain tabel kosong.
--
-- NON-LEDGER seperti seluruh modul RKBMD: ini dokumen perencanaan T+1, tidak
-- menyentuh `aset` maupun `transaksi_bmd`.
--
-- ⚠️ DEPLOY-ORDERING: migrasi ini WAJIB jalan SEBELUM deploy kode — menu Usulan,
-- Validasi, Pelaporan, & halaman cetak sudah men-`select` kolom `nihil`; tanpa
-- kolomnya query header gagal dan keempatnya mati total. Pola yang sama dgn
-- 20260813_01.

-- ── 1) Kolom ────────────────────────────────────────────────────────────────
ALTER TABLE rkbmd ADD COLUMN IF NOT EXISTS nihil boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN rkbmd.nihil IS
  'true = SKPD menyatakan tidak ada usulan untuk jenis & tahun ini. Wajib tanpa item/kartu (ditegakkan trigger). Bukan sinonim "belum diisi".';

-- ── 2) NIHIL dan ISI tidak boleh hidup bersamaan ────────────────────────────
-- Dijaga dari DUA arah, karena tabrakannya bisa datang dari dua arah:
--   (a) di sini  — menyatakan NIHIL padahal itemnya sudah ada;
--   (b) di §3    — menambah item padahal dokumennya sudah dinyatakan NIHIL.
-- Menjaga satu arah saja meninggalkan dokumen "NIHIL berisi 12 barang", yang
-- akan tercetak sebagai lembar NIHIL sementara Pelaporan menjumlahkan isinya.
--
-- Ditulis ulang UTUH (bukan ditambal) mengikuti kebiasaan 20260813_01: isi
-- fungsinya harus bisa dibaca sebagai satu kesatuan di satu tempat. Bagian lama
-- TIDAK diubah perilakunya.
CREATE OR REPLACE FUNCTION public.fn_rkbmd_status_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE v_isi integer;
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
      -- Lampiran wajib (20260813_01). Dicek di sini, BUKAN di UI saja.
      -- BERLAKU JUGA untuk usulan NIHIL: pernyataan nihil pun ditandatangani
      -- kepala kantor — justru di situ letak nilainya sebagai pernyataan.
      IF COALESCE(cardinality(NEW.dokumen_paths), 0) = 0 THEN
        RAISE EXCEPTION 'RKBMD belum bisa diajukan: lampirkan dulu lembar usulan bertanda tangan + surat pengantar (satu berkas PDF).';
      END IF;
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

  -- BARU 2026-08-13: pernyataan NIHIL.
  IF TG_OP = 'UPDATE' AND NEW.nihil IS DISTINCT FROM OLD.nihil THEN
    -- Dokumen yang sudah DITETAPKAN adalah catatan final. Mengubah sifatnya
    -- dari "berisi" jadi "nihil" (atau sebaliknya) sesudah ditetapkan akan
    -- membuat lembar yang sudah diedarkan tak lagi cocok dengan catatannya.
    -- Jalannya tetap ada: admin "Buka Kunci" dulu → draft → ubah.
    IF OLD.status = 'disetujui' THEN
      RAISE EXCEPTION 'RKBMD yang sudah disetujui tidak bisa diubah status nihilnya — buka kunci dulu.';
    END IF;

    IF NEW.nihil THEN
      SELECT count(*) INTO v_isi FROM rkbmd_item WHERE rkbmd_id = NEW.id;
      IF v_isi > 0 THEN
        RAISE EXCEPTION 'Tidak bisa dinyatakan NIHIL: dokumen ini masih berisi % item. Hapus dulu isinya.', v_isi;
      END IF;
      SELECT count(*) INTO v_isi FROM rkbmd_paket WHERE rkbmd_id = NEW.id;
      IF v_isi > 0 THEN
        RAISE EXCEPTION 'Tidak bisa dinyatakan NIHIL: dokumen ini masih punya % kartu program/kegiatan. Hapus dulu kartunya.', v_isi;
      END IF;
    END IF;
  END IF;

  -- Cap waktu unggah mengikuti isinya, supaya tak bisa berbohong walau
  -- pemanggilnya lupa (atau sengaja tak) mengisinya.
  IF TG_OP = 'UPDATE' AND NEW.dokumen_paths IS DISTINCT FROM OLD.dokumen_paths THEN
    NEW.dokumen_diunggah_at :=
      CASE WHEN COALESCE(cardinality(NEW.dokumen_paths), 0) > 0 THEN now() ELSE NULL END;
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
END $function$;

-- ── 3) Arah sebaliknya: menambah isi ke dokumen NIHIL ───────────────────────
-- Menumpang trigger yang SUDAH ADA di `rkbmd_item`/`rkbmd_paket`
-- (fn_rkbmd_lampiran_batal) — bukan trigger baru: fungsi itu sudah membaca baris
-- induknya, jadi pemeriksaan ini gratis, dan satu trigger per tabel lebih mudah
-- ditelusuri daripada dua yang urutannya bergantung nama.
--
-- Ditulis ulang utuh; bagian lampiran TIDAK berubah perilakunya.
CREATE OR REPLACE FUNCTION public.fn_rkbmd_lampiran_batal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE v_id uuid; v_status text; v_nihil boolean;
BEGIN
  v_id := COALESCE(NEW.rkbmd_id, OLD.rkbmd_id);
  SELECT status, nihil INTO v_status, v_nihil FROM rkbmd WHERE id = v_id;

  -- BARU 2026-08-13. Sengaja TIDAK berlaku untuk DELETE: mengosongkan isi
  -- dokumen nihil (mis. sisa data lama) harus selalu boleh — kalau ikut
  -- diblokir, dokumen yang terlanjur bercampur jadi tak bisa dibereskan sama
  -- sekali.
  IF v_nihil AND TG_OP <> 'DELETE' THEN
    RAISE EXCEPTION 'Dokumen RKBMD ini dinyatakan NIHIL — batalkan dulu pernyataan nihilnya sebelum menambah isi.';
  END IF;

  IF v_status = 'disetujui' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  UPDATE rkbmd
     SET dokumen_paths = '{}'::text[],
         status = CASE WHEN status = 'diajukan' THEN 'draft' ELSE status END
   WHERE id = v_id
     AND (COALESCE(cardinality(dokumen_paths), 0) > 0 OR status = 'diajukan');

  RETURN COALESCE(NEW, OLD);
END $function$;

-- Catatan kompatibilitas: `nihil` default false, jadi seluruh dokumen yang ada
-- berperilaku persis seperti sebelumnya. Tak ada backfill.
