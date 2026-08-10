-- ============================================================================
-- RKBMD — Standar Harga (SSH · HSPK · ASB · SBU) sebagai BAK BERSAMA lintas
-- SKPD, + sub kegiatan di dokumen RKBMD, + item RKBMD yang bersandar ke SSH.
--
-- Keputusan user 2026-08-10:
--  1. Menu RKBMD dipecah jadi Standar Harga / Usulan / Validasi / Pelaporan.
--     SSH & SBSK PINDAH dari menu Admin ke RKBMD > Standar Harga, ditambah tiga
--     standar baru: ASB, SBU, HSPK.
--  2. Standar harga = SATU BAK untuk semua SKPD. Kalau SKPD B mengisi barang
--     yang persis sama dengan yang sudah diisi SKPD A, sistem MENDETEKSI dan
--     tidak membuat baris kedua. Identitasnya: kode barang + nama/spesifikasi +
--     satuan + harga (per jenis standar & tahun anggaran). Kalau yang berbeda
--     cuma KODE REKENING-nya, rekening itu DIGABUNG ke barang yang sama —
--     jadi satu barang boleh punya beberapa kode rekening.
--  3. Yang boleh menambah: semua SKPD. Yang boleh mengubah/menghapus: SKPD
--     pembuat baris itu + admin pemda.
--
-- ⚠️ DEPLOY-ORDERING: migrasi ini WAJIB jalan SEBELUM deploy kode — halaman
-- baru langsung query `rkbmd_standar`/`rkbmd_standar_rekening` dan RPC
-- `fn_rkbmd_standar_simpan` yang belum ada di DB lama. Sebaliknya, DROP
-- `rkbmd_ssh` di bagian akhir membuat halaman Admin > SSH versi LAMA error
-- selama jendela antara migrasi & deploy. Itu diterima: tabelnya terbukti
-- KOSONG (0 baris per 2026-08-10) dan halaman itu memang sedang diganti.
-- ============================================================================

-- ── 1. Bak standar harga ────────────────────────────────────────────────────
-- SATU tabel untuk empat standar (discriminator `jenis`), bukan empat tabel
-- kembar. Keempatnya berbagi bentuk yang sama persis (tahun · nama · satuan ·
-- harga · rekening · keterangan) dan aturan dedup yang sama; memecahnya jadi
-- empat tabel berarti empat salinan RLS + empat salinan RPC dedup — persis
-- utang "ubah satu, samakan yang lain" yang dilarang rules.md §25.
--
-- Bedanya cuma DUA, dan itu ditegakkan CHECK di bawah, bukan oleh tabel:
--   ssh & hspk : `kode` (kode barang BMD) WAJIB, `tkdn` boleh diisi
--   asb & sbu  : `kode` HARUS NULL — ASB (belanja kegiatan) & SBU (honorarium,
--                perjalanan dinas) bukan barang, jadi tak punya kode barang
--                BMD. Memaksakan kolomnya cuma bikin kolom kosong selamanya.
--
-- SBSK sengaja TIDAK ikut ke sini: bentuknya beda sendiri (kuantitas_standar +
-- satuan_pengukur, bukan harga) dan tabel `rkbmd_sbsk` sudah ada & dipakai
-- perhitungan gap RKBMD Pengadaan. Yang pindah hanya MENUNYA.
create table if not exists rkbmd_standar (
  id            bigserial primary key,
  jenis         text    not null check (jenis in ('ssh', 'hspk', 'asb', 'sbu')),
  tahun         integer not null,
  kode          text    references admin_kodefikasi_bmd(kode),
  -- ssh/hspk: "Spesifikasi Nama Barang" (kembar makna dgn `aset.nama_barang`,
  -- lihat docs/kamus.md — BUKAN `uraian_barang` yang baku dari kodefikasi).
  -- asb/sbu : uraian bebas komponen belanjanya.
  nama          text    not null check (btrim(nama) <> ''),
  satuan        text,
  harga         numeric not null default 0 check (harga >= 0),
  tkdn          numeric(5,2) check (tkdn is null or (tkdn >= 0 and tkdn <= 100)),
  keterangan    text,
  -- SKPD yang pertama kali memasukkan baris ini. NULL = dimasukkan admin pemda
  -- (profil admin boleh tak terikat SKPD). Dipakai RLS utk hak ubah/hapus.
  skpd_id       bigint  references admin_skpd(id),
  created_by    uuid    default auth.uid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint rkbmd_standar_kode_sesuai_jenis check (
    (jenis in ('ssh', 'hspk') and kode is not null) or
    (jenis in ('asb', 'sbu')  and kode is null)
  )
);

-- Identitas dedup. Disimpan sbg GENERATED column + UNIQUE index supaya
-- penegaknya DB, bukan kesopanan pemanggil: RPC di bawah boleh saja lupa
-- mengecek, baris kembar tetap ditolak.
--   • `lower(btrim(...))` — beda huruf besar/kecil & spasi tepi BUKAN barang
--     yang berbeda. "Kursi Kerja " dan "kursi kerja" itu satu barang.
--   • `round(harga,2)::text` — numeric 1000 dan 1000.00 sama nilainya tapi
--     BEDA teksnya; tanpa round() dua-duanya bisa masuk sbg baris terpisah.
--   • `coalesce(kode,'')` — asb/sbu selalu NULL, jadi identitasnya jatuh ke
--     nama+satuan+harga. NULL tak pernah sama dengan NULL di UNIQUE biasa,
--     itu sebabnya dipadatkan ke string, bukan UNIQUE multi-kolom.
alter table rkbmd_standar
  add column if not exists identitas text
  generated always as (
    jenis || '|' || tahun::text || '|' || coalesce(kode, '') || '|' ||
    lower(btrim(nama)) || '|' || lower(btrim(coalesce(satuan, ''))) || '|' ||
    round(harga, 2)::text
  ) stored;

create unique index if not exists uq_rkbmd_standar_identitas on rkbmd_standar (identitas);
create index if not exists idx_rkbmd_standar_jenis_tahun on rkbmd_standar (jenis, tahun);
create index if not exists idx_rkbmd_standar_kode on rkbmd_standar (kode) where kode is not null;

drop trigger if exists trg_rkbmd_standar_updated on rkbmd_standar;
create trigger trg_rkbmd_standar_updated before update on rkbmd_standar
  for each row execute function fn_set_updated_at();

-- ── 2. Kode rekening per baris standar (boleh banyak) ───────────────────────
-- Inilah yang membuat "SKPD B pakai rekening lain" TIDAK melahirkan barang
-- kedua: rekeningnya menempel di sini, barangnya tetap satu.
--
-- ⚠️ SENGAJA TANPA BATAS 5. Form di UI menyediakan 5 baris isian (permintaan
-- user), tapi tabelnya tidak dibatasi: batas keras di sini akan mematahkan
-- janji penggabungan begitu SKPD ke-6 datang membawa rekening yang berbeda.
create table if not exists rkbmd_standar_rekening (
  id            bigserial primary key,
  standar_id    bigint not null references rkbmd_standar(id) on delete cascade,
  kode_rekening text   not null references admin_rekening(kode_sub_rincian),
  -- SKPD yang menyumbang rekening ini (jejak: siapa yang butuh kode ini).
  skpd_id       bigint references admin_skpd(id),
  created_by    uuid   default auth.uid(),
  created_at    timestamptz not null default now(),
  unique (standar_id, kode_rekening)
);

create index if not exists idx_rkbmd_standar_rek_standar on rkbmd_standar_rekening (standar_id);

-- ── 3. RLS ──────────────────────────────────────────────────────────────────
-- Baca: siapa pun yang login — memang bak bersama, gunanya supaya SKPD lain
-- melihat bahwa barangnya sudah ada.
-- Tambah: semua SKPD (bukan admin saja seperti dulu).
-- Ubah/hapus: SKPD pembuat + admin.
--
-- Semua pemanggilan fungsi dibungkus InitPlan `(SELECT fn_...())` — wajib di
-- repo ini (CLAUDE.md, migrasi 20260717_02/20260718_05) supaya dievaluasi
-- SEKALI, bukan sekali per baris.
alter table rkbmd_standar           enable row level security;
alter table rkbmd_standar_rekening  enable row level security;

drop policy if exists rkbmd_standar_select on rkbmd_standar;
create policy rkbmd_standar_select on rkbmd_standar for select using (true);

drop policy if exists rkbmd_standar_insert on rkbmd_standar;
create policy rkbmd_standar_insert on rkbmd_standar for insert with check (
  (SELECT fn_is_admin()) or (not (SELECT fn_is_viewer()) and skpd_id is not null)
);

drop policy if exists rkbmd_standar_update on rkbmd_standar;
create policy rkbmd_standar_update on rkbmd_standar for update using (
  (SELECT fn_is_admin()) or (skpd_id is not null and fn_skpd_visible(skpd_id))
);

drop policy if exists rkbmd_standar_delete on rkbmd_standar;
create policy rkbmd_standar_delete on rkbmd_standar for delete using (
  (SELECT fn_is_admin()) or (skpd_id is not null and fn_skpd_visible(skpd_id))
);

drop policy if exists rkbmd_standar_rek_select on rkbmd_standar_rekening;
create policy rkbmd_standar_rek_select on rkbmd_standar_rekening for select using (true);

-- Menambah rekening ke barang milik SKPD lain memang DIIZINKAN — itu justru
-- inti penggabungannya. Yang dijaga cuma: bukan viewer.
drop policy if exists rkbmd_standar_rek_insert on rkbmd_standar_rekening;
create policy rkbmd_standar_rek_insert on rkbmd_standar_rekening for insert with check (
  (SELECT fn_is_admin()) or not (SELECT fn_is_viewer())
);

-- Mencabut rekening: hanya penyumbang rekening itu, pemilik barangnya, atau
-- admin. Tanpa syarat ini satu SKPD bisa mencabut kode rekening yang sedang
-- dipakai SKPD lain di RKBMD-nya.
drop policy if exists rkbmd_standar_rek_delete on rkbmd_standar_rekening;
create policy rkbmd_standar_rek_delete on rkbmd_standar_rekening for delete using (
  (SELECT fn_is_admin())
  or (skpd_id is not null and fn_skpd_visible(skpd_id))
  or exists (
    select 1 from rkbmd_standar s
    where s.id = rkbmd_standar_rekening.standar_id
      and s.skpd_id is not null and fn_skpd_visible(s.skpd_id)
  )
);

-- ── 4. RPC simpan + dedup + gabung rekening ─────────────────────────────────
-- SECURITY DEFINER karena harus MENAMBAH rekening ke baris milik SKPD lain dan
-- membaca nama SKPD pemilik untuk pesan ("sudah diinput oleh Dinas X") —
-- keduanya di luar jangkauan pemanggil biasa.
--
-- Mengembalikan jsonb supaya UI bisa berkata jujur mana yang terjadi:
--   status 'baru'      → barang benar-benar baru
--   status 'sudah_ada' → identitas sama persis; TIDAK ada baris kedua dibuat
--   rekening_baru      → berapa kode rekening yang berhasil digabungkan
create or replace function fn_rkbmd_standar_simpan(
  p_jenis      text,
  p_tahun      integer,
  p_kode       text,
  p_nama       text,
  p_satuan     text,
  p_harga      numeric,
  p_tkdn       numeric,
  p_keterangan text,
  p_rekening   text[]
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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

  select skpd_id into v_skpd from admin_profiles where id = auth.uid();
  if v_skpd is null and not v_admin then
    raise exception 'Akun Anda belum terhubung ke SKPD mana pun — hubungi admin.';
  end if;

  -- Cari barang yang identitasnya sama persis. Perhitungan identitasnya WAJIB
  -- kembar dengan generated column di atas; kalau tidak, RPC akan mengira
  -- barangnya baru lalu ditolak UNIQUE index dengan pesan mentah.
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

  -- Gabungkan rekening. ON CONFLICT DO NOTHING = idempoten; yang sudah ada
  -- tidak dihitung sbg "baru", jadi pesannya tidak membesar-besarkan.
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
    'id', v_id,
    'status', v_status,
    'rekening_baru', v_rek_baru,
    'pemilik_skpd_id', v_pemilik,
    'pemilik_skpd', coalesce(v_nama_skpd, 'Admin Pemda')
  );
end;
$$;

revoke all on function fn_rkbmd_standar_simpan(text, integer, text, text, text, numeric, numeric, text, text[]) from public;
grant execute on function fn_rkbmd_standar_simpan(text, integer, text, text, text, numeric, numeric, text, text[]) to authenticated;

-- ── 5. Sub kegiatan di dokumen RKBMD ────────────────────────────────────────
-- `admin_program` SUDAH memuat kode_sub_kegiatan/uraian_sub_kegiatan (1.527
-- baris, terisi penuh) dan `ProgramPicker` sudah men-cascade Program → Kegiatan
-- → Sub Kegiatan. Yang hilang cuma tempat menyimpannya di dokumen RKBMD —
-- itu sebabnya form lama memakai input teks bebas dan sub kegiatan tak pernah
-- muncul. Tidak ada kolom baru di `admin_program`.
alter table rkbmd add column if not exists sub_kegiatan text;

-- ── 6. Item RKBMD bersandar ke standar harga ────────────────────────────────
-- `standar_id` = barang SSH yang dipilih (RKBMD Pengadaan hanya boleh memakai
-- barang yang ada di SSH). `kode_rekening` = SATU rekening yang dipilih dari
-- daftar rekening barang itu — supaya total anggaran bisa dijumlahkan per kode
-- rekening. ON DELETE SET NULL: baris SSH boleh dihapus tanpa merusak dokumen
-- RKBMD yang sudah disusun (angkanya sudah tersalin ke item).
alter table rkbmd_item add column if not exists standar_id bigint references rkbmd_standar(id) on delete set null;
alter table rkbmd_item add column if not exists kode_rekening text references admin_rekening(kode_sub_rincian);

create index if not exists idx_rkbmd_item_standar on rkbmd_item (standar_id) where standar_id is not null;

-- ── 7. Buang tabel SSH lama ─────────────────────────────────────────────────
-- Diverifikasi kosong (0 baris) sebelum migrasi ini ditulis. Isinya digantikan
-- `rkbmd_standar` jenis 'ssh' yang punya nama barang, TKDN, rekening, & pemilik
-- SKPD — semuanya tak ada di tabel lama.
drop table if exists rkbmd_ssh;
