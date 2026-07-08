-- ============================================================================
-- Stage B dari penataan ulang nama tabel (lanjutan 20260710_03, yang SENGAJA
-- nge-skip skpd/profiles krn risiko app-wide outage). Dua tabel ini dipanggil
-- literal di badan kode 8 SQL function (bukan cuma FK/RLS, yang otomatis
-- ikut rename lewat OID tracking Postgres) — jadi function-function itu WAJIB
-- ditulis ulang di migrasi yang sama, satu napas dengan rename tabelnya.
--
-- Sudah diaudit satu-satu (bukan tebakan): 8 function di bawah ini SATU-
-- SATUNYA yang manggil `profiles`/`skpd` literal di versi TERBARU badan
-- kodenya. 15 function lain (fn_terima_pengalihan, fn_cek_tahun_buku, dst.)
-- cuma manggil fn_is_admin()/fn_skpd_visible() — otomatis aman begitu dua
-- function itu diperbaiki. RLS policy di semua tabel (termasuk yang subquery
-- ke skpd/profiles) juga otomatis aman (OID-tracked).
--
-- PENTING: jalankan migrasi ini LALU LANGSUNG push kode frontend baru TANPA
-- jeda — ada jendela downtime singkat (durasi migrasi ~instan + build Vercel
-- ~1-3 menit) karena kode lama masih manggil nama tabel lama. Jalankan pas
-- sepi/malam sesuai kesepakatan, BUKAN pakai view kompatibilitas (app ini
-- tegas menolak pola view lagi sejak insiden v_daftar_barang).
-- ============================================================================

-- ── 1. Rename tabel ──────────────────────────────────────────────────────────
ALTER TABLE skpd     RENAME TO admin_skpd;
ALTER TABLE profiles RENAME TO admin_profiles;

-- ── 2. Tulis ulang 8 function yang badannya manggil profiles/skpd literal ───
-- Body IDENTIK persis dengan versi asli, cuma nama tabel yang diganti —
-- tidak ada perubahan logika.

CREATE OR REPLACE FUNCTION fn_is_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM admin_profiles WHERE id = auth.uid() AND role = 'admin')
$$;

CREATE OR REPLACE FUNCTION fn_my_skpd_path() RETURNS ltree
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.path FROM admin_profiles p JOIN admin_skpd s ON s.id = p.skpd_id WHERE p.id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION fn_skpd_visible(p_skpd_id bigint) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN p_skpd_id IS NULL THEN false
    ELSE EXISTS (SELECT 1 FROM admin_skpd s WHERE s.id = p_skpd_id AND s.path <@ fn_my_skpd_path())
  END
$$;

CREATE OR REPLACE FUNCTION fn_skpd_set_path() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_parent_path  ltree;
  v_parent_level int;
  v_old_path     ltree;
BEGIN
  -- Baris ini datang dari cascade UPDATE di bawah (path/level di-set langsung,
  -- parent_id tidak berubah) -> jangan hitung ulang dari parent_id, supaya
  -- trigger yang re-fire per baris descendant tidak salah hitung urutan.
  IF TG_OP = 'UPDATE' AND NEW.parent_id IS NOT DISTINCT FROM OLD.parent_id
     AND NEW.path IS DISTINCT FROM OLD.path THEN
    RETURN NEW;
  END IF;

  IF NEW.parent_id IS NULL THEN
    NEW.path  := text2ltree(NEW.id::text);
    NEW.level := 1;
  ELSE
    SELECT path, level INTO v_parent_path, v_parent_level
    FROM admin_skpd WHERE id = NEW.parent_id;

    IF v_parent_path IS NULL THEN
      RAISE EXCEPTION 'parent_id % tidak valid (SKPD tidak ditemukan)', NEW.parent_id;
    END IF;

    IF TG_OP = 'UPDATE' AND v_parent_path <@ OLD.path THEN
      RAISE EXCEPTION 'SKPD % tidak boleh dipindah jadi anak dari descendant-nya sendiri', NEW.id;
    END IF;

    NEW.path  := v_parent_path || text2ltree(NEW.id::text);
    NEW.level := v_parent_level + 1;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    v_old_path := OLD.path;
    IF v_old_path IS DISTINCT FROM NEW.path THEN
      UPDATE admin_skpd
      SET path  = NEW.path || subpath(path, nlevel(v_old_path)),
          level = NEW.level + (nlevel(path) - nlevel(v_old_path))
      WHERE path <@ v_old_path AND id <> NEW.id;
    END IF;
  END IF;

  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION fn_skpd_root(p_skpd_id bigint) RETURNS bigint
LANGUAGE sql STABLE AS $$
  SELECT subpath(path, 0, 1)::text::bigint FROM admin_skpd WHERE id = p_skpd_id
$$;

CREATE OR REPLACE FUNCTION fn_jurnal_header_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.periode := fn_periode_dari_tanggal(NEW.tanggal);
    IF NEW.kategori = 'pengalihan_status' THEN
      IF NEW.skpd_tujuan IS NULL THEN
        RAISE EXCEPTION 'Pengalihan status: SKPD tujuan wajib diisi.';
      END IF;
      IF EXISTS (SELECT 1 FROM admin_skpd WHERE id = NEW.skpd_tujuan AND parent_id IS NOT NULL) THEN
        RAISE EXCEPTION 'Pengalihan status: tujuan harus level SKPD induk (bukan Sub OPD/Lokasi).';
      END IF;
    ELSIF NEW.kategori = 'mutasi_internal' THEN
      IF NEW.skpd_tujuan IS NULL THEN
        RAISE EXCEPTION 'Mutasi internal: SKPD tujuan wajib diisi.';
      END IF;
      IF NEW.skpd_tujuan = NEW.skpd_id THEN
        RAISE EXCEPTION 'Mutasi internal: SKPD tujuan tidak boleh sama dengan SKPD asal.';
      END IF;
      IF fn_skpd_root(NEW.skpd_id) IS DISTINCT FROM fn_skpd_root(NEW.skpd_tujuan) THEN
        RAISE EXCEPTION 'Mutasi internal: SKPD asal & tujuan harus dalam satu SKPD induk (tree) yang sama — lintas SKPD induk pakai menu Penggunaan.';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE: skpd & kategori tak boleh berubah (itu = jurnal lain, harus entry ulang).
  IF NEW.skpd_id IS DISTINCT FROM OLD.skpd_id
     OR NEW.kategori IS DISTINCT FROM OLD.kategori THEN
    RAISE EXCEPTION 'jurnal_header: skpd_id/kategori tidak boleh diubah — batalkan & buat jurnal baru.';
  END IF;

  -- SKPD tujuan terkunci begitu jurnal tidak lagi pending (sudah diputuskan
  -- penerima) — mengubahnya = jurnal lain, harus entry ulang.
  IF NEW.skpd_tujuan IS DISTINCT FROM OLD.skpd_tujuan
     AND COALESCE(OLD.approval_status, 'disetujui') <> 'pending' THEN
    RAISE EXCEPTION 'jurnal_header: SKPD tujuan tidak boleh diubah setelah jurnal diputuskan.';
  END IF;

  -- Tanggal baru wajib jatuh di semester yang sama dgn periode beku header.
  IF fn_periode_dari_tanggal(NEW.tanggal) <> OLD.periode THEN
    RAISE EXCEPTION
      'Tanggal (%) di luar semester jurnal (%). Untuk pindah semester, batalkan jurnal & entry ulang.',
      NEW.tanggal, OLD.periode;
  END IF;

  NEW.periode    := OLD.periode;   -- periode tetap beku
  NEW.updated_at := now();
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION fn_preview_tutup_tahun(p_tahun int)
RETURNS TABLE(kategori text, no_sk text, tanggal date, skpd_nama text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jh.kategori, jh.no_sk, jh.tanggal, s.nama
  FROM jurnal_header jh
  JOIN admin_skpd s ON s.id = jh.skpd_id
  WHERE jh.approval_status = 'pending' AND jh.periode LIKE (p_tahun::text || '-%')
  ORDER BY jh.tanggal
$$;

CREATE OR REPLACE FUNCTION fn_ipa_role() RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT ipa_role FROM admin_profiles WHERE id = auth.uid()
$$;
