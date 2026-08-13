-- Standar Harga: alur USULAN → VALIDASI → masuk bak bersama.
-- Keputusan user 2026-08-13. Menu RKBMD dipecah dua kelompok yang alurnya
-- kembar: Standar Harga (Usulan · Validasi · Pelaporan) dan RKBMD (Usulan ·
-- Validasi · Pelaporan). Di Usulan Standar Harga, yang pertama dipilih operator
-- adalah JENIS usulannya — SSH · HSPK · ASB · SBU · Standar Kebutuhan (SBSK).
--
-- ══ KENAPA TABEL STAGING, BUKAN KOLOM `status` DI `rkbmd_standar` ══
-- `rkbmd_standar` itu BAK BERSAMA (keputusan user 2026-08-10): satu barang
-- cukup diinput sekali se-kabupaten, dedup lewat `uq_rkbmd_standar_identitas`,
-- kode rekening digabung antar-SKPD. Menempelkan status pada barisnya merusak
-- itu dengan cara yang tak kelihatan: usulan SKPD A yang masih *pending* akan
-- MEMBLOKIR SKPD B mengusulkan barang yang sama — terblokir oleh baris yang B
-- bahkan tak berhak melihatnya, dan tetap terblokir walau usulan A akhirnya
-- ditolak.
-- Dengan staging: tiap SKPD bebas mengusulkan apa pun; dedup & penggabungan
-- rekening baru dijalankan SAAT DISETUJUI, memakai RPC yang sudah ada.
-- Untung besarnya: **picker RKBMD tak perlu diubah sama sekali** — isi
-- `rkbmd_standar` dengan sendirinya berarti "sudah tervalidasi".
--
-- ══ PENAMAAN ══
-- Tetap keluarga `rkbmd_standar_*` supaya hubungannya terbaca dari namanya
-- saja: `rkbmd_standar` (bak bersama, hasil akhir) ← `rkbmd_standar_usulan`
-- (dokumen usulan) ← `..._item` (baris yang diusulkan) ← `..._rekening`.
-- Sengaja BUKAN prefix baru seperti `sh_*`: modul ini terdaftar sebagai satu
-- keluarga di schema.md §Peta Modul, dan prefix kedua akan memecah keluarga
-- yang sama jadi dua tempat yang harus diingat terpisah.

-- ── 1) Dokumen usulan ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rkbmd_standar_usulan (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  skpd_id     bigint NOT NULL REFERENCES admin_skpd(id),
  tahun       integer NOT NULL,
  jenis       text NOT NULL CHECK (jenis IN ('ssh','hspk','asb','sbu','sbsk')),
  status      text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','diajukan','disetujui','ditolak')),
  keterangan  text,
  catatan_telaah text,
  -- Disiapkan supaya alurnya bisa dibuat kembar dengan RKBMD (lampiran
  -- bertanda tangan). SENGAJA BELUM DIWAJIBKAN — user belum meminta gerbangnya
  -- untuk standar harga, dan mewajibkan sesuatu yang tak diminta akan memblokir
  -- pekerjaan di hari pertama. Kalau nanti perlu, hidupkan cek `cardinality`
  -- di fn_standar_usulan_status_guard (sudah ditandai di sana).
  dokumen_paths text[] NOT NULL DEFAULT '{}',
  dokumen_diunggah_at timestamptz,
  diajukan_at timestamptz,
  approved_by uuid,
  approved_at timestamptz,
  created_by  uuid DEFAULT auth.uid(),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Paling banyak SATU usulan yang masih berjalan per SKPD/tahun/jenis, tapi
-- riwayat yang sudah selesai boleh berapa pun. Partial unique: SKPD tak bisa
-- membuka dua draft sekaligus (mana yang benar jadi tak jelas), namun sesudah
-- usulan pertama ditetapkan mereka tetap boleh mengusulkan tambahan.
CREATE UNIQUE INDEX IF NOT EXISTS uq_standar_usulan_berjalan
  ON rkbmd_standar_usulan (skpd_id, tahun, jenis)
  WHERE status IN ('draft','diajukan');

CREATE INDEX IF NOT EXISTS idx_standar_usulan_antrean
  ON rkbmd_standar_usulan (tahun, status, jenis);

-- ── 2) Baris yang diusulkan ─────────────────────────────────────────────────
-- SATU tabel untuk kelima jenis. SBSK bentuknya beda (kuantitas standar per
-- satuan pengukur, bukan harga), jadi kolom harga & kuantitas saling nullable
-- dan bentuk yang sah per jenis ditegakkan trigger — bukan CHECK, karena
-- `jenis` ada di induknya dan CHECK tak boleh membaca tabel lain.
CREATE TABLE IF NOT EXISTS rkbmd_standar_usulan_item (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  usulan_id  uuid NOT NULL REFERENCES rkbmd_standar_usulan(id) ON DELETE CASCADE,
  no_urut    integer,
  kode       text,               -- kode barang BMD (ssh/hspk/sbsk); NULL utk asb/sbu
  nama       text NOT NULL,      -- utk sbsk dipetakan ke rkbmd_sbsk.spesifikasi
  satuan     text,
  harga      numeric,            -- ssh/hspk/asb/sbu
  tkdn       numeric,            -- ssh/hspk saja
  kuantitas_standar numeric,     -- sbsk
  satuan_pengukur   text,        -- sbsk
  keterangan text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_standar_usulan_item_induk
  ON rkbmd_standar_usulan_item (usulan_id, no_urut);

CREATE TABLE IF NOT EXISTS rkbmd_standar_usulan_rekening (
  id       bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  item_id  bigint NOT NULL REFERENCES rkbmd_standar_usulan_item(id) ON DELETE CASCADE,
  kode_rekening text NOT NULL,
  UNIQUE (item_id, kode_rekening)
);

-- ── 3) Cap waktu ────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_standar_usulan_updated ON rkbmd_standar_usulan;
CREATE TRIGGER trg_standar_usulan_updated BEFORE UPDATE ON rkbmd_standar_usulan
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

DROP TRIGGER IF EXISTS trg_standar_usulan_item_updated ON rkbmd_standar_usulan_item;
CREATE TRIGGER trg_standar_usulan_item_updated BEFORE UPDATE ON rkbmd_standar_usulan_item
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- ── 4) Guard status (pola fn_rkbmd_status_guard) ────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_standar_usulan_status_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF (NEW.status IN ('disetujui','ditolak'))
       OR (OLD.status = 'disetujui' AND NEW.status <> 'disetujui') THEN
      IF NOT fn_is_admin() THEN
        RAISE EXCEPTION 'Hanya admin (Pengelola/BKAD) yang boleh menelaah/menetapkan usulan standar harga.';
      END IF;
    END IF;

    IF NEW.status = 'diajukan' AND OLD.status <> 'diajukan' THEN
      -- Usulan kosong di antrean telaah cuma membuang waktu penelaah.
      IF NOT EXISTS (SELECT 1 FROM rkbmd_standar_usulan_item WHERE usulan_id = NEW.id) THEN
        RAISE EXCEPTION 'Usulan masih kosong — tambahkan minimal satu baris sebelum diajukan.';
      END IF;
      -- ⬇ Kalau lampiran bertanda tangan nanti diwajibkan (seperti RKBMD),
      -- hidupkan tiga baris ini. Sengaja mati: belum diminta user.
      -- IF COALESCE(cardinality(NEW.dokumen_paths), 0) = 0 THEN
      --   RAISE EXCEPTION 'Lampirkan dulu berkas usulan bertanda tangan (PDF).';
      -- END IF;
      NEW.diajukan_at := now();
    END IF;

    IF NEW.status = 'disetujui' THEN
      NEW.approved_by := auth.uid();
      NEW.approved_at := now();
    ELSIF OLD.status = 'disetujui' AND NEW.status <> 'disetujui' THEN
      NEW.approved_by := NULL;
      NEW.approved_at := NULL;
    END IF;
  END IF;

  IF NEW.dokumen_paths IS DISTINCT FROM OLD.dokumen_paths THEN
    NEW.dokumen_diunggah_at :=
      CASE WHEN COALESCE(cardinality(NEW.dokumen_paths), 0) > 0 THEN now() ELSE NULL END;
  END IF;

  IF NEW.skpd_id IS DISTINCT FROM OLD.skpd_id
     OR NEW.tahun IS DISTINCT FROM OLD.tahun
     OR NEW.jenis IS DISTINCT FROM OLD.jenis THEN
    RAISE EXCEPTION 'Identitas usulan (SKPD/tahun/jenis) tidak boleh diubah — buat usulan baru.';
  END IF;

  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS trg_standar_usulan_status_guard ON rkbmd_standar_usulan;
CREATE TRIGGER trg_standar_usulan_status_guard BEFORE UPDATE ON rkbmd_standar_usulan
  FOR EACH ROW EXECUTE FUNCTION fn_standar_usulan_status_guard();

-- ── 5) Guard baris: kunci sesudah diajukan + bentuk sah per jenis ───────────
-- Dua tugas dalam satu trigger, sengaja: keduanya butuh `jenis` & `status`
-- induknya, dan memisahnya berarti dua SELECT ke tabel yang sama tiap baris.
CREATE OR REPLACE FUNCTION public.fn_standar_usulan_item_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE v_jenis text; v_status text; v_id uuid; r record;
BEGIN
  v_id := COALESCE(NEW.usulan_id, OLD.usulan_id);
  SELECT jenis, status INTO v_jenis, v_status FROM rkbmd_standar_usulan WHERE id = v_id;

  -- Sesudah diajukan, isinya beku sampai penelaah mengembalikannya. Kalau tidak,
  -- penelaah bisa menyetujui daftar yang isinya sudah berbeda dari yang dibaca.
  IF v_status NOT IN ('draft','ditolak') AND NOT fn_is_admin() THEN
    RAISE EXCEPTION 'Usulan sudah diajukan/ditetapkan — barisnya terkunci. Minta Pengelola mengembalikannya dulu.';
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  r := NEW;

  -- Bentuk sah per jenis. Ditegakkan di sini, BUKAN di UI: baris yang bentuknya
  -- salah baru meledak saat disetujui — di tangan penelaah, bukan penyusunnya.
  IF v_jenis IN ('ssh','hspk') THEN
    IF r.kode IS NULL OR btrim(r.kode) = '' THEN
      RAISE EXCEPTION '% wajib memakai kode barang BMD.', upper(v_jenis);
    END IF;
    IF r.harga IS NULL THEN RAISE EXCEPTION '% wajib berisi harga satuan.', upper(v_jenis); END IF;
  ELSIF v_jenis IN ('asb','sbu') THEN
    IF r.kode IS NOT NULL AND btrim(r.kode) <> '' THEN
      RAISE EXCEPTION '% bukan barang — kode barang BMD harus dikosongkan.', upper(v_jenis);
    END IF;
    IF r.harga IS NULL THEN RAISE EXCEPTION '% wajib berisi besaran.', upper(v_jenis); END IF;
  ELSIF v_jenis = 'sbsk' THEN
    IF r.kode IS NULL OR btrim(r.kode) = '' THEN
      RAISE EXCEPTION 'Standar Kebutuhan wajib memakai kode barang BMD.';
    END IF;
    IF r.kuantitas_standar IS NULL THEN
      RAISE EXCEPTION 'Standar Kebutuhan wajib berisi kuantitas standar.';
    END IF;
    IF r.satuan_pengukur IS NULL OR btrim(r.satuan_pengukur) = '' THEN
      RAISE EXCEPTION 'Standar Kebutuhan wajib berisi satuan pengukur (mis. per pegawai, per ruang).';
    END IF;
  END IF;

  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS trg_standar_usulan_item_guard ON rkbmd_standar_usulan_item;
CREATE TRIGGER trg_standar_usulan_item_guard
  BEFORE INSERT OR UPDATE OR DELETE ON rkbmd_standar_usulan_item
  FOR EACH ROW EXECUTE FUNCTION fn_standar_usulan_item_guard();

-- ── 6) RPC dedup: tambahkan `p_skpd_id` ─────────────────────────────────────
-- Versi lama selalu mengambil SKPD dari `auth.uid()` — pemanggilnya. Begitu
-- fungsi ini dipakai saat ADMIN menyetujui usulan, baris bak bersama akan
-- dikreditkan ke SKPD si admin (atau NULL), bukan ke SKPD yang mengusulkan.
-- Parameter baru dipakai HANYA oleh jalur persetujuan; pemanggil lama (form
-- Standar Harga) tetap mengirim 9 argumen dan berperilaku persis seperti dulu.
-- ⚠️ DROP dulu: menambah parameter ber-DEFAULT tanpa membuang versi 9-argumen
-- membuat panggilan lama jadi ambigu ("function is not unique").
DROP FUNCTION IF EXISTS public.fn_rkbmd_standar_simpan(text,integer,text,text,text,numeric,numeric,text,text[]);

CREATE OR REPLACE FUNCTION public.fn_rkbmd_standar_simpan(
  p_jenis text, p_tahun integer, p_kode text, p_nama text, p_satuan text,
  p_harga numeric, p_tkdn numeric, p_keterangan text, p_rekening text[],
  p_skpd_id bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_admin    boolean := fn_is_admin();
  v_skpd     bigint;
  v_id       bigint;
  v_pemilik  bigint;
  v_nama_skpd text;
  v_status   text := 'baru';
  v_rek_baru integer := 0;
  v_rek      text;
begin
  if fn_is_viewer() then
    raise exception 'Peran pengawas hanya boleh membaca.';
  end if;

  if p_skpd_id is not null then
    -- Jalur persetujuan usulan: kredit diberikan ke SKPD PENGUSUL.
    v_skpd := p_skpd_id;
  else
    select skpd_id into v_skpd from admin_profiles where id = auth.uid();
    if v_skpd is null and not v_admin then
      raise exception 'Akun Anda belum terhubung ke SKPD mana pun — hubungi admin.';
    end if;
  end if;

  -- Perhitungan identitas WAJIB kembar dengan generated column `identitas`;
  -- kalau tidak, RPC mengira barangnya baru lalu ditolak UNIQUE dgn pesan mentah.
  select id, skpd_id into v_id, v_pemilik
  from rkbmd_standar
  where identitas = p_jenis || '|' || p_tahun::text || '|' || coalesce(p_kode, '') || '|' ||
                    lower(btrim(p_nama)) || '|' || lower(btrim(coalesce(p_satuan, ''))) || '|' ||
                    round(coalesce(p_harga, 0), 2)::text;

  if v_id is null then
    insert into rkbmd_standar (jenis, tahun, kode, nama, satuan, harga, tkdn, keterangan, skpd_id, created_by)
    values (p_jenis, p_tahun, p_kode, btrim(p_nama), nullif(btrim(coalesce(p_satuan, '')), ''),
            coalesce(p_harga, 0), p_tkdn, nullif(btrim(coalesce(p_keterangan, '')), ''), v_skpd, auth.uid())
    returning id, skpd_id into v_id, v_pemilik;
  else
    v_status := 'sudah_ada';
  end if;

  foreach v_rek in array coalesce(p_rekening, array[]::text[]) loop
    if btrim(coalesce(v_rek, '')) <> '' then
      insert into rkbmd_standar_rekening (standar_id, kode_rekening, skpd_id, created_by)
      values (v_id, btrim(v_rek), v_skpd, auth.uid())
      on conflict (standar_id, kode_rekening) do nothing;
      if found then v_rek_baru := v_rek_baru + 1; end if;
    end if;
  end loop;

  select nama into v_nama_skpd from admin_skpd where id = v_pemilik;

  return jsonb_build_object(
    'id', v_id, 'status', v_status, 'rekening_baru', v_rek_baru,
    'pemilik_skpd_id', v_pemilik, 'pemilik_skpd', coalesce(v_nama_skpd, 'Admin Pemda')
  );
end;
$function$;

-- ── 7) RPC persetujuan: usulan → bak bersama ────────────────────────────────
-- SECURITY DEFINER karena ia menulis ke bak bersama atas nama SKPD LAIN — RLS
-- `rkbmd_standar` tak mengizinkan admin menulis baris milik SKPD pengusul lewat
-- jalur biasa. Atomik: kalau satu baris gagal, tak ada yang masuk separuh.
CREATE OR REPLACE FUNCTION public.fn_standar_usulan_setujui(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  u          record;
  it         record;
  v_rek      text[];
  v_hasil    jsonb;
  n_baru     integer := 0;
  n_ada      integer := 0;
  n_rek      integer := 0;
  n_sbsk     integer := 0;
begin
  if not fn_is_admin() then
    raise exception 'Hanya admin (Pengelola/BKAD) yang boleh menetapkan usulan standar harga.';
  end if;

  select * into u from rkbmd_standar_usulan where id = p_id for update;
  if u is null then raise exception 'Usulan tidak ditemukan.'; end if;
  if u.status <> 'diajukan' then
    raise exception 'Hanya usulan berstatus "diajukan" yang bisa ditetapkan (status sekarang: %).', u.status;
  end if;

  for it in
    select * from rkbmd_standar_usulan_item where usulan_id = p_id order by no_urut, id
  loop
    if u.jenis = 'sbsk' then
      -- SBSK bukan bak bersama ber-identitas; kuncinya UNIQUE (tahun, kode).
      -- Usulan yang menyentuh kode yang sama = pemutakhiran angka standarnya.
      insert into rkbmd_sbsk (tahun, kode, spesifikasi, satuan_pengukur, kuantitas_standar, satuan, keterangan)
      values (u.tahun, it.kode, it.nama, it.satuan_pengukur, it.kuantitas_standar, it.satuan, it.keterangan)
      on conflict (tahun, kode) do update
        set spesifikasi = excluded.spesifikasi,
            satuan_pengukur = excluded.satuan_pengukur,
            kuantitas_standar = excluded.kuantitas_standar,
            satuan = excluded.satuan,
            keterangan = excluded.keterangan;
      n_sbsk := n_sbsk + 1;
    else
      select coalesce(array_agg(kode_rekening order by kode_rekening), array[]::text[])
        into v_rek
      from rkbmd_standar_usulan_rekening where item_id = it.id;

      v_hasil := fn_rkbmd_standar_simpan(
        u.jenis, u.tahun, it.kode, it.nama, it.satuan,
        it.harga, it.tkdn, it.keterangan, v_rek, u.skpd_id
      );
      if v_hasil->>'status' = 'baru' then n_baru := n_baru + 1; else n_ada := n_ada + 1; end if;
      n_rek := n_rek + coalesce((v_hasil->>'rekening_baru')::int, 0);
    end if;
  end loop;

  update rkbmd_standar_usulan set status = 'disetujui' where id = p_id;

  return jsonb_build_object(
    'jenis', u.jenis, 'baru', n_baru, 'sudah_ada', n_ada,
    'rekening_baru', n_rek, 'sbsk', n_sbsk
  );
end;
$function$;

-- ── 8) RLS ──────────────────────────────────────────────────────────────────
-- Semua fn dibungkus InitPlan `(SELECT ...)` — dievaluasi sekali, bukan
-- per-baris (aturan performa CLAUDE.md). Tabel ini kecil, tapi polanya wajib
-- seragam supaya tak ada yang menyalin bentuk yang salah ke tabel besar.
ALTER TABLE rkbmd_standar_usulan           ENABLE ROW LEVEL SECURITY;
ALTER TABLE rkbmd_standar_usulan_item      ENABLE ROW LEVEL SECURITY;
ALTER TABLE rkbmd_standar_usulan_rekening  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS standar_usulan_select ON rkbmd_standar_usulan;
CREATE POLICY standar_usulan_select ON rkbmd_standar_usulan FOR SELECT TO authenticated
  USING ((SELECT fn_is_admin()) OR (SELECT fn_is_viewer()) OR fn_skpd_visible(skpd_id));

DROP POLICY IF EXISTS standar_usulan_insert ON rkbmd_standar_usulan;
CREATE POLICY standar_usulan_insert ON rkbmd_standar_usulan FOR INSERT TO authenticated
  WITH CHECK ((SELECT fn_is_admin()) OR fn_skpd_visible(skpd_id));

DROP POLICY IF EXISTS standar_usulan_update ON rkbmd_standar_usulan;
CREATE POLICY standar_usulan_update ON rkbmd_standar_usulan FOR UPDATE TO authenticated
  USING ((SELECT fn_is_admin()) OR fn_skpd_visible(skpd_id));

DROP POLICY IF EXISTS standar_usulan_delete ON rkbmd_standar_usulan;
CREATE POLICY standar_usulan_delete ON rkbmd_standar_usulan FOR DELETE TO authenticated
  USING ((SELECT fn_is_admin()) OR fn_skpd_visible(skpd_id));

-- Item & rekening ikut wewenang induknya — satu-satunya sumber kebenaran soal
-- "siapa boleh apa" tetap barisnya `rkbmd_standar_usulan`.
DROP POLICY IF EXISTS standar_usulan_item_all ON rkbmd_standar_usulan_item;
CREATE POLICY standar_usulan_item_all ON rkbmd_standar_usulan_item FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM rkbmd_standar_usulan u
                 WHERE u.id = usulan_id
                   AND ((SELECT fn_is_admin()) OR (SELECT fn_is_viewer()) OR fn_skpd_visible(u.skpd_id))))
  WITH CHECK (EXISTS (SELECT 1 FROM rkbmd_standar_usulan u
                      WHERE u.id = usulan_id
                        AND ((SELECT fn_is_admin()) OR fn_skpd_visible(u.skpd_id))));

DROP POLICY IF EXISTS standar_usulan_rekening_all ON rkbmd_standar_usulan_rekening;
CREATE POLICY standar_usulan_rekening_all ON rkbmd_standar_usulan_rekening FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM rkbmd_standar_usulan_item i
                 JOIN rkbmd_standar_usulan u ON u.id = i.usulan_id
                 WHERE i.id = item_id
                   AND ((SELECT fn_is_admin()) OR (SELECT fn_is_viewer()) OR fn_skpd_visible(u.skpd_id))))
  WITH CHECK (EXISTS (SELECT 1 FROM rkbmd_standar_usulan_item i
                      JOIN rkbmd_standar_usulan u ON u.id = i.usulan_id
                      WHERE i.id = item_id
                        AND ((SELECT fn_is_admin()) OR fn_skpd_visible(u.skpd_id))));

GRANT SELECT, INSERT, UPDATE, DELETE ON rkbmd_standar_usulan          TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON rkbmd_standar_usulan_item     TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON rkbmd_standar_usulan_rekening TO authenticated;

COMMENT ON TABLE rkbmd_standar_usulan IS
  'Dokumen usulan Standar Harga per SKPD/tahun/jenis (ssh|hspk|asb|sbu|sbsk). Staging: isinya baru masuk bak bersama rkbmd_standar / rkbmd_sbsk saat DISETUJUI lewat fn_standar_usulan_setujui.';
