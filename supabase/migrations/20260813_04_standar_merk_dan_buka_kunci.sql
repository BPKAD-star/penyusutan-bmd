-- Standar Harga: kolom Merk/Tipe + Buka Kunci yang MENARIK KEMBALI barisnya.
-- Keputusan user 2026-08-13 (sesudah menguji alurnya dari nol).
--
-- ══ MASALAH YANG DIPERBAIKI ══
-- "Buka Kunci" di Validasi Standar Harga mengembalikan usulan ke draft, tapi
-- baris yang terlanjur masuk bak bersama TETAP di sana. Untuk barang yang belum
-- dipakai siapa pun itu salah: penelaah bermaksud membatalkan penetapannya,
-- dan yang tertinggal jadi acuan hantu yang tak seorang pun merasa menaruhnya.
--
-- Tapi menarik SEMUANYA juga salah: begitu SKPD lain memakai barang itu di
-- RKBMD-nya, menghapusnya membuat dokumen mereka menunjuk barang yang lenyap.
-- Karena itu penarikannya SELEKTIF, dan yang tertinggal dilaporkan apa adanya.
--
-- Supaya bisa selektif, dibutuhkan JEJAK: baris usulan mana melahirkan baris
-- acuan mana. Itu yang belum ada — `fn_standar_usulan_setujui` dulu memanggil
-- RPC dedup lalu membuang hasilnya.

-- ── 1) Merk/Tipe ────────────────────────────────────────────────────────────
-- Ditaruh di DUA tempat: staging (yang diusulkan) & bak bersama (yang berlaku).
-- ⚠️ SENGAJA TIDAK masuk `identitas`. Rumus identitas itu kembar di tiga tempat
-- (generated column, fn_rkbmd_standar_simpan, dan pemeriksaan di RPC) — menambah
-- ruas di sana berarti tiga suntingan yang harus persis sama, dan yang meleset
-- bikin RPC mengira barangnya baru lalu ditolak UNIQUE dengan pesan mentah.
-- Konsekuensi yang DITERIMA: dua SKPD mengusulkan barang identik dengan merk
-- berbeda tetap jadi SATU baris. Merk pengusul pertama yang tercatat; usulan
-- berikutnya hanya MENGISI kalau masih kosong, tak pernah menimpa.
ALTER TABLE rkbmd_standar             ADD COLUMN IF NOT EXISTS merk_tipe text;
ALTER TABLE rkbmd_standar_usulan_item ADD COLUMN IF NOT EXISTS merk_tipe text;

-- ── 2) Jejak usulan → bak bersama ───────────────────────────────────────────
-- ON DELETE SET NULL: baris acuan boleh dihapus admin lewat halaman lama tanpa
-- merusak riwayat usulannya.
ALTER TABLE rkbmd_standar_usulan_item
  ADD COLUMN IF NOT EXISTS standar_id bigint REFERENCES rkbmd_standar(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_standar_usulan_item_standar
  ON rkbmd_standar_usulan_item (standar_id) WHERE standar_id IS NOT NULL;

-- ── 3) RPC dedup: terima & isi merk ─────────────────────────────────────────
DROP FUNCTION IF EXISTS public.fn_rkbmd_standar_simpan(text,integer,text,text,text,numeric,numeric,text,text[],bigint);

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
    v_skpd := p_skpd_id;   -- jalur persetujuan: kredit ke SKPD PENGUSUL
  else
    select skpd_id into v_skpd from admin_profiles where id = auth.uid();
    if v_skpd is null and not v_admin then
      raise exception 'Akun Anda belum terhubung ke SKPD mana pun — hubungi admin.';
    end if;
  end if;

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

-- ── 4) Persetujuan: catat jejaknya ──────────────────────────────────────────
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

      -- JEJAK: inilah yang membuat Buka Kunci bisa selektif.
      update rkbmd_standar_usulan_item
         set standar_id = (v_hasil->>'id')::bigint
       where id = it.id;

      if v_hasil->>'status' = 'baru' then n_baru := n_baru + 1; else n_ada := n_ada + 1; end if;
      n_rek := n_rek + coalesce((v_hasil->>'rekening_baru')::int, 0);
    end if;
  end loop;

  update rkbmd_standar_usulan set status = 'disetujui' where id = p_id;

  return jsonb_build_object('jenis', u.jenis, 'baru', n_baru, 'sudah_ada', n_ada,
                            'rekening_baru', n_rek, 'sbsk', n_sbsk);
end;
$function$;

-- ── 5) Buka Kunci: tarik kembali yang BELUM DIPAKAI ─────────────────────────
-- Dua saringan, dan keduanya wajib:
--   (a) baris yang sudah dirujuk `rkbmd_item.standar_id` — ada SKPD yang
--       memakainya menyusun RKBMD; menghapusnya membuat dokumen itu menunjuk
--       barang yang lenyap (FK-nya ON DELETE SET NULL, jadi tak error — justru
--       itu bahayanya: rusaknya senyap).
--   (b) baris yang juga lahir dari usulan LAIN yang sudah disetujui — bak
--       bersama memang bisa menyatukan usulan beberapa SKPD ke satu baris;
--       menariknya berarti mencabut milik SKPD lain.
-- Yang tertinggal DILAPORKAN, tidak dibiarkan senyap.
--
-- SBSK sengaja TIDAK ditarik: persetujuannya meng-upsert baris (tahun, kode)
-- yang mungkin sudah ada nilainya sebelum itu. Menariknya berarti MENGHAPUS,
-- bukan mengembalikan nilai lama — dan nilai lamanya memang tak disimpan
-- di mana pun. Menghapus yang seharusnya dipulihkan lebih buruk daripada
-- meninggalkannya, jadi ini dilaporkan supaya penelaah membetulkannya sendiri.
CREATE OR REPLACE FUNCTION public.fn_standar_usulan_buka_kunci(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  u record; it record;
  v_dipakai boolean;
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

  if u.jenis = 'sbsk' then
    select count(*) into n_sbsk from rkbmd_standar_usulan_item where usulan_id = p_id;
  else
    for it in
      select * from rkbmd_standar_usulan_item
      where usulan_id = p_id and standar_id is not null
    loop
      select
        exists (select 1 from rkbmd_item where standar_id = it.standar_id)
        or exists (select 1 from rkbmd_standar_usulan_item i
                   join rkbmd_standar_usulan x on x.id = i.usulan_id
                   where i.standar_id = it.standar_id
                     and i.usulan_id <> p_id
                     and x.status = 'disetujui')
        into v_dipakai;

      if v_dipakai then
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

  return jsonb_build_object('jenis', u.jenis, 'ditarik', n_tarik,
                            'tetap', n_tetap, 'sbsk', n_sbsk);
end;
$function$;

COMMENT ON COLUMN rkbmd_standar_usulan_item.standar_id IS
  'Baris bak bersama yang lahir dari baris usulan ini (diisi fn_standar_usulan_setujui). Dipakai fn_standar_usulan_buka_kunci untuk menarik kembali secara selektif.';
