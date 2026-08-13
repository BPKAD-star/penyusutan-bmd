-- RKBMD: dokumen usulan bertanda tangan WAJIB dilampirkan sebelum diajukan.
-- Keputusan user 2026-08-13. Alurnya: SKPD menyusun → cetak lembar usulan (menu
-- Usulan) → ditandatangani kepala kantor → pindaiannya + surat pengantar
-- digabung jadi SATU PDF → dilampirkan → baru tombol Ajukan hidup.
--
-- Kenapa di DB, bukan cukup mematikan tombol: sebelum ini tak ada apa pun yang
-- menghubungkan KERTAS bertanda tangan dengan CATATAN di aplikasi. RKBMD jadi
-- "diajukan" hanya dengan satu klik sementara hardcopy-nya ada di laci orang.
-- Penegakan di UI saja tak cukup — pola tetap repo ini (rules.md): yang menjaga
-- integritas adalah trigger, UI cuma memberi pesan ramah.
--
-- Berkasnya sendiri masuk bucket `dokumen-sumber` (privat, 10MB, image+pdf —
-- bucket yang sama dipakai Pengalihan & Pengamanan), prefix `rkbmd-usulan/`.
-- TAK PERLU migrasi storage: policy `dokumen_sumber_*` bersifat se-bucket, bukan
-- per-prefix (diverifikasi ke `pg_policies` 2026-08-13).

-- ── 1) Kolom lampiran ───────────────────────────────────────────────────────
ALTER TABLE rkbmd ADD COLUMN IF NOT EXISTS dokumen_paths text[] NOT NULL DEFAULT '{}';
ALTER TABLE rkbmd ADD COLUMN IF NOT EXISTS dokumen_diunggah_at timestamptz;

COMMENT ON COLUMN rkbmd.dokumen_paths IS
  'Path di bucket dokumen-sumber: lembar usulan bertanda tangan + surat pengantar (satu PDF). WAJIB terisi sebelum status jadi diajukan.';
COMMENT ON COLUMN rkbmd.dokumen_diunggah_at IS
  'Diisi/dikosongkan OTOMATIS oleh fn_rkbmd_status_guard mengikuti dokumen_paths — jangan diset dari kode.';

-- ── 2) Guard status: tolak pengajuan tanpa lampiran ─────────────────────────
-- Ditulis ulang UTUH (bukan ditambal) supaya isi fungsinya bisa dibaca sebagai
-- satu kesatuan di satu tempat. Bagian lama TIDAK diubah perilakunya.
CREATE OR REPLACE FUNCTION public.fn_rkbmd_status_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
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
      -- BARU 2026-08-13: lampiran wajib. Dicek di sini, BUKAN di UI saja.
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

-- ── 3) Isi berubah → lampiran DICABUT otomatis ──────────────────────────────
-- Ini inti pengamannya, bukan pemanis. Tanpa ini operator bisa: cetak → tanda
-- tangan → lampirkan → SUNTING itemnya → ajukan. Kertas & catatan berbeda
-- TANPA satu pun pesan error — persis kelas kegagalan senyap yang berulang di
-- repo ini. Lampiran dicabut = tombol Ajukan mati lagi = wajib cetak & tanda
-- tangan ulang.
--
-- ⚠️ Status 'diajukan' IKUT ditarik kembali ke 'draft'. Sebabnya
-- `fn_rkbmd_item_lock` hanya mengunci item saat status 'disetujui' — jadi
-- dokumen yang SUDAH diajukan itemnya masih bisa disunting, dan tanpa aturan
-- ini penelaah bisa menyetujui dokumen yang isinya sudah berbeda dari PDF yang
-- ditandatangani. Mencabut lampirannya saja akan menyisakan keadaan mustahil:
-- berstatus "diajukan" tapi tanpa lampiran, padahal lampiran itu syarat masuk.
--
-- Status 'disetujui' SENGAJA DILEWATI: dokumen yang sudah ditetapkan adalah
-- catatan final & lampirannya bukti — membuangnya justru menghapus jejak.
-- Perubahan di situ hanya mungkin lewat admin ("Buka Kunci" → draft dulu).
--
-- SECURITY DEFINER disengaja: kalau dievaluasi sbg pemanggil, UPDATE di bawah
-- tunduk RLS `rkbmd_update` — dan sebuah pengaman yang bisa GAGAL DIAM-DIAM
-- (0 baris ter-update, tanpa error) bukan pengaman. Praktisnya siapa pun yang
-- boleh menyunting item juga boleh meng-update induknya, tapi "praktisnya
-- aman" itu persis bunyi asumsi yang berkali-kali terbukti salah di repo ini.
-- Pola & alasan yang sama dgn `fn_aset_awal_2026_terkunci`.
CREATE OR REPLACE FUNCTION public.fn_rkbmd_lampiran_batal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE v_id uuid; v_status text;
BEGIN
  v_id := COALESCE(NEW.rkbmd_id, OLD.rkbmd_id);
  SELECT status INTO v_status FROM rkbmd WHERE id = v_id;

  IF v_status = 'disetujui' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  UPDATE rkbmd
     SET dokumen_paths = '{}'::text[],
         status = CASE WHEN status = 'diajukan' THEN 'draft' ELSE status END
   WHERE id = v_id
     -- Hanya kalau memang ada yang perlu diubah: tanpa syarat ini tiap sisipan
     -- item memicu UPDATE rkbmd yang sia-sia (dan membangunkan trigger lain).
     AND (COALESCE(cardinality(dokumen_paths), 0) > 0 OR status = 'diajukan');

  RETURN COALESCE(NEW, OLD);
END $function$;

DROP TRIGGER IF EXISTS trg_rkbmd_item_lampiran ON rkbmd_item;
CREATE TRIGGER trg_rkbmd_item_lampiran
  AFTER INSERT OR UPDATE OR DELETE ON rkbmd_item
  FOR EACH ROW EXECUTE FUNCTION fn_rkbmd_lampiran_batal();

DROP TRIGGER IF EXISTS trg_rkbmd_paket_lampiran ON rkbmd_paket;
CREATE TRIGGER trg_rkbmd_paket_lampiran
  AFTER INSERT OR UPDATE OR DELETE ON rkbmd_paket
  FOR EACH ROW EXECUTE FUNCTION fn_rkbmd_lampiran_batal();

-- Catatan kompatibilitas: 6 dokumen yang ada per 2026-08-13 semuanya sudah
-- berstatus 'disetujui' tanpa lampiran, dan guard ini hanya menyala pada
-- TRANSISI menuju 'diajukan' — jadi tak satu pun dari mereka terganggu. Yang
-- terdampak baru terasa kalau salah satunya di-"Buka Kunci" lalu diajukan lagi;
-- saat itu lampirannya memang wajib, dan itu memang yang diinginkan.
