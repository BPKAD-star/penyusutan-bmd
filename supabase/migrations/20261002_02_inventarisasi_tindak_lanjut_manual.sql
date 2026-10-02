-- ============================================================================
-- 20261002_02 — Tindak Lanjut Inventarisasi, Fase 3: TANDAI SELESAI MANUAL.
--
-- Sebagian temuan LHI tak punya jejak yang bisa dilacak otomatis dari register
-- (lib/tindakLanjut.ts): III.B.4 (induk tak diketahui), III.B.10 (berdiri di atas
-- tanah bukan milik Pemda), III.B.5 untuk jenis barang di luar menu Pengamanan,
-- dan III.B.9 yang ternyata cuma tumpang tindih SEBAGIAN (diselesaikan lewat
-- koreksi luas/nilai, bukan Pencatatan Ganda). Untuk itu SKPD menandainya
-- selesai sendiri dgn CATATAN wajib (+ dokumen opsional).
--
-- • NON-LEDGER (pola KIR / Notes): penandaan administratif, bukan peristiwa
--   akuntansi — INSERT/DELETE biasa sah di sini, append-only `transaksi_bmd`
--   tak tersentuh. Membatalkan tanda = DELETE barisnya.
-- • `skpd_id` DIISI TRIGGER dari isiannya (bukan dari klien) supaya RLS-nya
--   sesederhana KIR & tak bisa dipalsukan. Isian yang tak terlihat oleh
--   pemanggil → `skpd_id` tak terisi → policy menolak (fail-closed).
-- • Hanya untuk isian yang SUDAH DIVALIDASI & format yang memang tak terlacak
--   otomatis (daftar KEMBAR dgn `BOLEH_TANDAI_MANUAL` di lib/tindakLanjut.ts).
--   Format yang dilacak dari keadaan register sengaja tak boleh ditandai manual:
--   tanda manual tak akan "pulih sendiri" kalau tindakannya dibatalkan.
-- • `ditandai_by` dipaksa `auth.uid()` oleh trigger.
--
-- Deploy-ordering: jalankan SEBELUM deploy kode. Kalau terbalik, menu Tindak
-- Lanjut menampilkan pesan error saat memuat (tabelnya belum ada) — tak ada
-- data yang rusak.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.inventarisasi_tindak_lanjut (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  isian_id      uuid NOT NULL REFERENCES public.inventarisasi_barang(id) ON DELETE CASCADE,
  lhi           text NOT NULL CHECK (lhi IN ('III.B.4', 'III.B.5', 'III.B.9', 'III.B.10')),
  skpd_id       bigint,
  catatan       text NOT NULL CHECK (btrim(catatan) <> ''),
  dokumen_paths text[] NOT NULL DEFAULT '{}',
  ditandai_by   uuid,
  ditandai_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (isian_id, lhi)
);
CREATE INDEX IF NOT EXISTS idx_inv_tl_skpd ON public.inventarisasi_tindak_lanjut (skpd_id);

CREATE OR REPLACE FUNCTION public.fn_inv_tindak_lanjut_isi()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE v_status text; v_skpd bigint;
BEGIN
  SELECT status, skpd_id INTO v_status, v_skpd FROM inventarisasi_barang WHERE id = NEW.isian_id;
  IF v_skpd IS NULL THEN
    RAISE EXCEPTION 'Isian inventarisasi tidak ditemukan atau di luar wewenang Anda.';
  END IF;
  IF v_status <> 'divalidasi' THEN
    RAISE EXCEPTION 'Hanya temuan dari isian yang SUDAH DIVALIDASI yang bisa ditandai selesai.';
  END IF;
  NEW.skpd_id := v_skpd;
  NEW.ditandai_by := auth.uid();
  NEW.ditandai_at := now();
  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS trg_inv_tindak_lanjut_isi ON public.inventarisasi_tindak_lanjut;
CREATE TRIGGER trg_inv_tindak_lanjut_isi
  BEFORE INSERT ON public.inventarisasi_tindak_lanjut
  FOR EACH ROW EXECUTE FUNCTION public.fn_inv_tindak_lanjut_isi();

ALTER TABLE public.inventarisasi_tindak_lanjut ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS inv_tl_select ON public.inventarisasi_tindak_lanjut;
CREATE POLICY inv_tl_select ON public.inventarisasi_tindak_lanjut FOR SELECT TO authenticated
  USING ((SELECT fn_is_admin()) OR (SELECT fn_is_viewer()) OR fn_skpd_visible(skpd_id));

DROP POLICY IF EXISTS inv_tl_insert ON public.inventarisasi_tindak_lanjut;
CREATE POLICY inv_tl_insert ON public.inventarisasi_tindak_lanjut FOR INSERT TO authenticated
  WITH CHECK ((SELECT fn_is_admin()) OR fn_skpd_visible(skpd_id));

DROP POLICY IF EXISTS inv_tl_delete ON public.inventarisasi_tindak_lanjut;
CREATE POLICY inv_tl_delete ON public.inventarisasi_tindak_lanjut FOR DELETE TO authenticated
  USING ((SELECT fn_is_admin()) OR fn_skpd_visible(skpd_id));

REVOKE ALL ON public.inventarisasi_tindak_lanjut FROM anon;
GRANT SELECT, INSERT, DELETE ON public.inventarisasi_tindak_lanjut TO authenticated;
