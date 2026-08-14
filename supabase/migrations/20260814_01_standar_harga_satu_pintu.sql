-- Standar Harga: SATU PINTU MASUK, SATU PINTU KELUAR (keputusan user 2026-08-14).
--
-- ══ APA YANG RUSAK ══
-- User menguji alurnya dari nol, lalu "Buka Kunci" usulan SSH yang sudah
-- ditetapkan — dan barangnya TETAP mentereng di Pelaporan Standar Harga. Ada
-- TIGA lubang, dan ketiganya bentuknya sama: baris bisa masuk atau bertahan di
-- bak bersama TANPA usulan hidup yang mempertanggungjawabkannya.
--
--   (1) MASUK LEWAT SAMPING. `StandarHargaWorkspace` (menu SSH/HSPK/ASB/SBU
--       lama) & Import Excel memanggil `fn_rkbmd_standar_simpan` LANGSUNG, jadi
--       barisnya lahir di bak bersama tanpa pernah lewat Usulan → Validasi.
--       Tiga dari empat baris di DB per hari ini lahir begitu (skpd_id NULL,
--       tampil "Diinput oleh —"). Itu shortcut di tengah alur.
--   (2) JEJAKNYA BISA DIHAPUS. `rkbmd_standar_usulan` boleh di-DELETE dalam
--       status apa pun. Menghapus usulan yang sudah DISETUJUI membuang
--       item-itemnya (CASCADE) berikut kolom jejak `standar_id` — barisnya
--       tertinggal di bak bersama SELAMANYA tanpa satu pun cara menariknya.
--       Persis itu yang terjadi pada baris ke-4 (Laptop Asus, BKAD): tabel
--       usulan kini KOSONG, barisnya tetap ada.
--   (3) MUNDUR TANPA MENARIK. Status `disetujui` → `draft` lewat UPDATE biasa
--       (bukan RPC buka kunci) diizinkan untuk admin, dan UPDATE itu tak
--       menyentuh bak bersama sama sekali.
--
-- ══ ATURAN BARU ══
-- Isi `rkbmd_standar` = TEPAT sebanyak yang diklaim usulan berstatus
-- `disetujui`. Tak ada baris yang lahir di luar persetujuan, tak ada baris yang
-- kehilangan pemiliknya. Alurnya maju (Usulan → Validasi → acuan bersama →
-- dipakai RKBMD) dan mundur (lepas dari RKBMD → Buka Kunci → draft lagi) —
-- tidak ada potong kompas di tengah.
--
-- ⚠️ Konsekuensi yang DISENGAJA: menu SSH/HSPK/ASB/SBU lama tak bisa lagi
-- menambah/mengubah/menghapus baris. Membetulkan harga yang keliru sekarang =
-- Buka Kunci → SKPD perbaiki barisnya → ajukan → setujui lagi. Lebih panjang,
-- tapi itulah harga dari "acuan bersama yang selalu bisa ditelusuri siapa yang
-- mengusulkan & kapan ditetapkan".

-- ── 1) Bersihkan yang terlanjur nyantol ─────────────────────────────────────
-- User: "boleh di drop aja isinya". Tetap defensif: kalau ternyata ADA dokumen
-- RKBMD yang memakainya, migrasi ini BATAL — menghapus acuan yang sedang
-- dipakai menyusun anggaran jauh lebih mahal daripada migrasi yang gagal.
DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM rkbmd_item WHERE standar_id IS NOT NULL;
  IF n > 0 THEN
    RAISE EXCEPTION 'Batal: % baris RKBMD masih menunjuk standar harga. Lepaskan dulu barangnya dari dokumen RKBMD, baru jalankan migrasi ini.', n;
  END IF;
END $$;

-- Yang dibuang: baris YATIM — tak diklaim satu pun usulan berstatus
-- `disetujui`. Per 2026-08-14 itu berarti KEEMPAT baris yang ada (tiga lahir
-- dari menu SSH lama, satu kehilangan usulannya), jadi hasilnya sama dengan
-- "drop isinya" yang diminta user — bedanya perintah ini **menegakkan
-- invariannya**, bukan mengosongkan buta. Efeknya: menjalankan ulang berkas ini
-- kelak TIDAK akan menyapu standar harga yang sudah sah.
--
-- Usulan `disetujui` yang jejaknya sudah putus (tak satu pun itemnya ber-
-- `standar_id`) dikembalikan ke draft lebih dulu — meninggalkannya berstatus
-- "ditetapkan" tanpa satu pun baris di acuan bersama membuat Buka Kunci
-- melaporkan 0 baris tanpa sebab yang kelihatan. Trigger status dimatikan
-- sebentar: fn_is_admin() palsu di sesi migrasi (auth.uid() NULL) akan menolak
-- transisi ini.
ALTER TABLE rkbmd_standar_usulan DISABLE TRIGGER trg_standar_usulan_status_guard;
UPDATE rkbmd_standar_usulan u SET status = 'draft', approved_at = NULL, approved_by = NULL
 WHERE u.status = 'disetujui' AND u.jenis <> 'sbsk'
   AND NOT EXISTS (SELECT 1 FROM rkbmd_standar_usulan_item i
                   WHERE i.usulan_id = u.id AND i.standar_id IS NOT NULL);
ALTER TABLE rkbmd_standar_usulan ENABLE TRIGGER trg_standar_usulan_status_guard;

DELETE FROM rkbmd_standar_rekening r
 WHERE NOT EXISTS (SELECT 1 FROM rkbmd_standar_usulan_item i
                   JOIN rkbmd_standar_usulan u ON u.id = i.usulan_id
                   WHERE i.standar_id = r.standar_id AND u.status = 'disetujui');
DELETE FROM rkbmd_standar s
 WHERE NOT EXISTS (SELECT 1 FROM rkbmd_standar_usulan_item i
                   JOIN rkbmd_standar_usulan u ON u.id = i.usulan_id
                   WHERE i.standar_id = s.id AND u.status = 'disetujui');

-- ── 2) Tutup pintu samping ke bak bersama ───────────────────────────────────
-- Penegaknya GRANT, bukan cuma tombol yang dihilangkan dari layar: kode klien
-- mana pun (termasuk yang belum ditulis) kini mustahil menulis ke sini.
-- SELECT tetap terbuka — bak bersama memang untuk dibaca semua SKPD.
-- Satu-satunya penulis yang tersisa: fn_standar_usulan_setujui &
-- fn_standar_usulan_buka_kunci (SECURITY DEFINER, jalan sebagai pemilik tabel).
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON rkbmd_standar            FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON rkbmd_standar_rekening   FROM authenticated, anon;

-- Policy tulis ikut dibuang supaya gambarnya tak membingungkan pembaca
-- berikutnya: policy yang tampak mengizinkan padahal grant-nya sudah dicabut
-- adalah aturan yang berbohong.
DROP POLICY IF EXISTS rkbmd_standar_insert     ON rkbmd_standar;
DROP POLICY IF EXISTS rkbmd_standar_update     ON rkbmd_standar;
DROP POLICY IF EXISTS rkbmd_standar_delete     ON rkbmd_standar;
DROP POLICY IF EXISTS rkbmd_standar_rek_insert ON rkbmd_standar_rekening;
DROP POLICY IF EXISTS rkbmd_standar_rek_delete ON rkbmd_standar_rekening;

-- FK-nya ikut dikeraskan. ON DELETE SET NULL adalah kerusakan SENYAP: baris
-- acuan hilang, dokumen RKBMD-nya tetap ada tapi kehilangan sandaran harganya
-- tanpa satu pun error. RESTRICT membuat percobaannya gagal keras.
ALTER TABLE rkbmd_item DROP CONSTRAINT IF EXISTS rkbmd_item_standar_id_fkey;
ALTER TABLE rkbmd_item ADD CONSTRAINT rkbmd_item_standar_id_fkey
  FOREIGN KEY (standar_id) REFERENCES rkbmd_standar(id) ON DELETE RESTRICT;

-- ── 3) RPC dedup: hanya boleh dipanggil dari jalur persetujuan ──────────────
-- SECURITY DEFINER berjalan sebagai pemilik tabel, jadi pencabutan GRANT di
-- atas TIDAK menghentikannya — gerbangnya harus di dalam fungsinya sendiri.
-- Penanda `app.standar_via_usulan` disetel `set_config(..., true)` = hidup
-- hanya selama transaksi pemanggilnya, dan tiap permintaan PostgREST adalah
-- satu transaksi tersendiri, jadi klien tak punya cara menyalakannya.
CREATE OR REPLACE FUNCTION public.fn_rkbmd_standar_simpan(
  p_jenis text, p_tahun integer, p_kode text, p_nama text, p_satuan text,
  p_harga numeric, p_tkdn numeric, p_keterangan text, p_rekening text[],
  p_skpd_id bigint DEFAULT NULL, p_merk_tipe text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_skpd     bigint;
  v_id       bigint;
  v_pemilik  bigint;
  v_nama_skpd text;
  v_status   text := 'baru';
  v_rek_baru integer := 0;
  v_rek      text;
begin
  if coalesce(current_setting('app.standar_via_usulan', true), '') <> '1' then
    raise exception 'Standar harga tidak bisa ditambahkan langsung. Susun lewat RKBMD → Standar Harga → Usulan, lalu tetapkan di menu Validasi.';
  end if;

  v_skpd := p_skpd_id;

  -- Perhitungan identitas WAJIB kembar dengan generated column `identitas`;
  -- kalau tidak, RPC mengira barangnya baru lalu ditolak UNIQUE dgn pesan mentah.
  select id, skpd_id into v_id, v_pemilik
  from rkbmd_standar
  where identitas = p_jenis || '|' || p_tahun::text || '|' || coalesce(p_kode, '') || '|' ||
                    lower(btrim(p_nama)) || '|' || lower(btrim(coalesce(p_satuan, ''))) || '|' ||
                    round(coalesce(p_harga, 0), 2)::text;

  if v_id is null then
    insert into rkbmd_standar (jenis, tahun, kode, nama, satuan, harga, tkdn, keterangan,
                               merk_tipe, skpd_id, created_by)
    values (p_jenis, p_tahun, p_kode, btrim(p_nama), nullif(btrim(coalesce(p_satuan, '')), ''),
            coalesce(p_harga, 0), p_tkdn, nullif(btrim(coalesce(p_keterangan, '')), ''),
            nullif(btrim(coalesce(p_merk_tipe, '')), ''), v_skpd, auth.uid())
    returning id, skpd_id into v_id, v_pemilik;
  else
    v_status := 'sudah_ada';
    -- ISI kalau masih kosong, JANGAN menimpa: merk milik pengusul pertama.
    update rkbmd_standar
       set merk_tipe = nullif(btrim(p_merk_tipe), '')
     where id = v_id
       and coalesce(btrim(merk_tipe), '') = ''
       and coalesce(btrim(p_merk_tipe), '') <> '';
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

-- ── 4) Persetujuan: satu-satunya pintu masuk ────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_standar_usulan_setujui(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  u record; it record; v_rek text[]; v_hasil jsonb;
  n_baru integer := 0; n_ada integer := 0; n_rek integer := 0; n_sbsk integer := 0;
begin
  if not fn_is_admin() then
    raise exception 'Hanya admin (Pengelola/BKAD) yang boleh menetapkan usulan standar harga.';
  end if;

  select * into u from rkbmd_standar_usulan where id = p_id for update;
  if u is null then raise exception 'Usulan tidak ditemukan.'; end if;
  if u.status <> 'diajukan' then
    raise exception 'Hanya usulan berstatus "diajukan" yang bisa ditetapkan (status sekarang: %).', u.status;
  end if;

  -- Membuka gerbang bak bersama selama transaksi ini saja.
  perform set_config('app.standar_via_usulan', '1', true);

  for it in select * from rkbmd_standar_usulan_item where usulan_id = p_id order by no_urut, id loop
    if u.jenis = 'sbsk' then
      insert into rkbmd_sbsk (tahun, kode, spesifikasi, satuan_pengukur, kuantitas_standar, satuan, keterangan)
      values (u.tahun, it.kode, it.nama, it.satuan_pengukur, it.kuantitas_standar, it.satuan, it.keterangan)
      on conflict (tahun, kode) do update
        set spesifikasi = excluded.spesifikasi, satuan_pengukur = excluded.satuan_pengukur,
            kuantitas_standar = excluded.kuantitas_standar, satuan = excluded.satuan,
            keterangan = excluded.keterangan;
      n_sbsk := n_sbsk + 1;
    else
      select coalesce(array_agg(kode_rekening order by kode_rekening), array[]::text[])
        into v_rek
      from rkbmd_standar_usulan_rekening where item_id = it.id;

      v_hasil := fn_rkbmd_standar_simpan(
        u.jenis, u.tahun, it.kode, it.nama, it.satuan,
        it.harga, it.tkdn, it.keterangan, v_rek, u.skpd_id, it.merk_tipe);

      -- JEJAK: inilah yang membuat Buka Kunci bisa menarik kembali barisnya.
      update rkbmd_standar_usulan_item
         set standar_id = (v_hasil->>'id')::bigint
       where id = it.id;

      if v_hasil->>'status' = 'baru' then n_baru := n_baru + 1; else n_ada := n_ada + 1; end if;
      n_rek := n_rek + coalesce((v_hasil->>'rekening_baru')::int, 0);
    end if;
  end loop;

  update rkbmd_standar_usulan set status = 'disetujui' where id = p_id;
  perform set_config('app.standar_via_usulan', '0', true);

  return jsonb_build_object('jenis', u.jenis, 'baru', n_baru, 'sudah_ada', n_ada,
                            'rekening_baru', n_rek, 'sbsk', n_sbsk);
end;
$function$;

-- ── 5) Buka Kunci: MENOLAK selama barangnya masih dipakai RKBMD ─────────────
-- Berubah dari perilaku 20260813_04 (yang dipakai dilewati, sisanya ditarik)
-- menjadi TOLAK TOTAL (keputusan user 2026-08-14). Alasannya: yang dilewati itu
-- tetap tertinggal di acuan bersama sementara usulannya sudah kembali ke draft
-- — persis keadaan "barang nyantol tanpa pemilik" yang mau diberantas, cuma
-- lahir dari pintu yang berbeda. Sekarang urutannya dipaksa: LEPAS barangnya
-- dari dokumen RKBMD dulu, baru usulannya bisa dibuka.
--
-- Yang TIDAK memblokir: baris yang juga lahir dari usulan SKPD LAIN yang sudah
-- disetujui. Itu bukan pemakaian di RKBMD, melainkan bak bersama yang memang
-- menyatukan usulan beberapa SKPD ke satu baris — klaim usulan ini dicabut,
-- barisnya tetap berdiri atas nama SKPD lain, dan itu dilaporkan sbg "tetap".
CREATE OR REPLACE FUNCTION public.fn_standar_usulan_buka_kunci(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  u record; it record;
  v_pakai text; v_n_pakai integer;
  n_tarik integer := 0; n_tetap integer := 0; n_sbsk integer := 0;
begin
  if not fn_is_admin() then
    raise exception 'Hanya admin (Pengelola/BKAD) yang boleh membuka kunci usulan standar harga.';
  end if;

  select * into u from rkbmd_standar_usulan where id = p_id for update;
  if u is null then raise exception 'Usulan tidak ditemukan.'; end if;
  if u.status <> 'disetujui' then
    raise exception 'Hanya usulan yang sudah DITETAPKAN yang perlu dibuka kuncinya (status sekarang: %).', u.status;
  end if;

  perform set_config('app.standar_via_usulan', '1', true);

  if u.jenis = 'sbsk' then
    select count(*) into n_sbsk from rkbmd_standar_usulan_item where usulan_id = p_id;
  else
    -- Gerbang: adakah barisnya yang sedang dipakai menyusun RKBMD?
    select count(distinct s.id),
           string_agg(distinct format('%s → %s', s.nama, coalesce(k.nama, 'SKPD #' || r.skpd_id)), '; ')
      into v_n_pakai, v_pakai
    from rkbmd_standar_usulan_item it2
    join rkbmd_standar s  on s.id = it2.standar_id
    join rkbmd_item ri    on ri.standar_id = it2.standar_id
    join rkbmd r          on r.id = ri.rkbmd_id
    left join admin_skpd k on k.id = r.skpd_id
    where it2.usulan_id = p_id;

    if coalesce(v_n_pakai, 0) > 0 then
      raise exception 'Tidak bisa dibuka: % barang masih dipakai di dokumen RKBMD. Lepaskan dulu dari RKBMD-nya, baru usulan ini bisa dibuka. Yang memakai: %',
        v_n_pakai, left(v_pakai, 500);
    end if;

    for it in
      select * from rkbmd_standar_usulan_item
      where usulan_id = p_id and standar_id is not null
    loop
      if exists (select 1 from rkbmd_standar_usulan_item i
                 join rkbmd_standar_usulan x on x.id = i.usulan_id
                 where i.standar_id = it.standar_id
                   and i.usulan_id <> p_id
                   and x.status = 'disetujui') then
        n_tetap := n_tetap + 1;
      else
        delete from rkbmd_standar_rekening where standar_id = it.standar_id;
        delete from rkbmd_standar where id = it.standar_id;
        n_tarik := n_tarik + 1;
      end if;

      update rkbmd_standar_usulan_item set standar_id = null where id = it.id;
    end loop;
  end if;

  update rkbmd_standar_usulan set status = 'draft' where id = p_id;
  perform set_config('app.standar_via_usulan', '0', true);

  return jsonb_build_object('jenis', u.jenis, 'ditarik', n_tarik,
                            'tetap', n_tetap, 'sbsk', n_sbsk);
end;
$function$;

-- ── 6) Jejaknya tidak boleh bisa dihapus ───────────────────────────────────
-- Lubang (2) di kepala berkas: menghapus usulan yang sudah disetujui membuang
-- item-itemnya (CASCADE) berikut kolom `standar_id`, dan barisnya tertinggal
-- di acuan bersama tanpa satu pun cara menariknya kembali.
CREATE OR REPLACE FUNCTION public.fn_standar_usulan_hapus_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF OLD.status = 'disetujui' THEN
    RAISE EXCEPTION 'Usulan yang sudah ditetapkan tidak bisa dihapus — barisnya masih menjadi acuan bersama. Buka Kunci dulu di menu Validasi (barisnya ikut ditarik), baru boleh dihapus.';
  END IF;
  RETURN OLD;
END $function$;

DROP TRIGGER IF EXISTS trg_standar_usulan_hapus_guard ON rkbmd_standar_usulan;
CREATE TRIGGER trg_standar_usulan_hapus_guard BEFORE DELETE ON rkbmd_standar_usulan
  FOR EACH ROW EXECUTE FUNCTION fn_standar_usulan_hapus_guard();

-- ── 7) Mundur hanya lewat Buka Kunci ───────────────────────────────────────
-- Lubang (3): admin bisa meng-UPDATE status `disetujui` → `draft` lewat jalur
-- biasa, dan UPDATE itu tak menyentuh acuan bersama sama sekali. Sekarang
-- transisi keluar dari `disetujui` hanya sah bila datang dari
-- fn_standar_usulan_buka_kunci (yang menyalakan penanda transaksi).
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

    IF OLD.status = 'disetujui' AND NEW.status <> 'disetujui'
       AND COALESCE(current_setting('app.standar_via_usulan', true), '') <> '1' THEN
      RAISE EXCEPTION 'Usulan yang sudah ditetapkan hanya bisa dikembalikan lewat tombol "Buka Kunci" — itu yang sekalian menarik barisnya dari acuan bersama.';
    END IF;

    IF NEW.status = 'diajukan' AND OLD.status <> 'diajukan' THEN
      -- Usulan kosong di antrean telaah cuma membuang waktu penelaah.
      IF NOT EXISTS (SELECT 1 FROM rkbmd_standar_usulan_item WHERE usulan_id = NEW.id) THEN
        RAISE EXCEPTION 'Usulan masih kosong — tambahkan minimal satu baris sebelum diajukan.';
      END IF;
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

-- ── 8) Baris usulan yang sudah ditetapkan: beku untuk SEMUA ────────────────
-- Sebelumnya admin masih boleh menyuntingnya. Itu memutus kesamaan antara apa
-- yang tercatat di usulan dan apa yang berdiri di acuan bersama — dan yang
-- paling berbahaya, menghapus barisnya menghapus jejak `standar_id`-nya juga.
-- Pengecualiannya cuma penanda transaksi milik kedua RPC di atas.
CREATE OR REPLACE FUNCTION public.fn_standar_usulan_item_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE v_jenis text; v_status text; v_id uuid; r record;
BEGIN
  v_id := COALESCE(NEW.usulan_id, OLD.usulan_id);
  SELECT jenis, status INTO v_jenis, v_status FROM rkbmd_standar_usulan WHERE id = v_id;

  IF COALESCE(current_setting('app.standar_via_usulan', true), '') <> '1' THEN
    IF v_status = 'disetujui' THEN
      RAISE EXCEPTION 'Usulan sudah ditetapkan — barisnya beku. Buka Kunci dulu di menu Validasi kalau memang perlu diubah.';
    END IF;
    -- Sesudah diajukan, isinya beku sampai penelaah mengembalikannya. Kalau tidak,
    -- penelaah bisa menyetujui daftar yang isinya sudah berbeda dari yang dibaca.
    IF v_status NOT IN ('draft','ditolak') AND NOT fn_is_admin() THEN
      RAISE EXCEPTION 'Usulan sudah diajukan/ditetapkan — barisnya terkunci. Minta Pengelola mengembalikannya dulu.';
    END IF;
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

COMMENT ON TABLE rkbmd_standar IS
  'Acuan bersama standar harga (ssh|hspk|asb|sbu) se-kabupaten. HANYA bisa diisi lewat fn_standar_usulan_setujui & ditarik lewat fn_standar_usulan_buka_kunci — GRANT tulis untuk authenticated/anon sudah dicabut (migrasi 20260814_01). Isinya = tepat sebanyak yang diklaim usulan berstatus disetujui.';
