-- Dokumen Sumber — bagian 4 "EVENT" (permintaan user 2026-10-11).
--
-- Bidang Pengelolaan BMD mengarsipkan event yang diselenggarakannya (bimtek,
-- sosialisasi, rakor, …): satu event berisi MATERI (berkas unggahan ATAU tautan)
-- dan DOKUMENTASI (tautan Google Drive).
--
-- ⚠️ NON-LEDGER, pola Notes (20260816_01) & KIR: ini arsip administratif, bukan
-- peristiwa akuntansi — tak menyentuh nilai, penyusutan, kepemilikan SKPD, atau
-- visibilitas barang. UPDATE/DELETE biasa di sini SAH; aturan append-only
-- `transaksi_bmd` tak berlaku. JANGAN menambahkan jenis ledger `event_*`.
--
-- Wewenang: SEMUA pengguna login boleh MELIHAT; menambah/mengubah/menghapus
-- HANYA admin (Pengelola Barang) — ditegakkan RLS di bawah, tombol di layar cuma
-- cerminan.
--
-- Satu tabel untuk materi & dokumentasi (`jenis`), bukan dua: bentuknya sama
-- (judul + keterangan + tautan/berkas) dan RLS-nya identik, jadi dua tabel kembar
-- cuma menggandakan policy yang bisa menyimpang.
--
-- Berkas materi di bucket BARU `event-materi`, bukan `dokumen-sumber`: bucket itu
-- cuma menerima image + PDF (10 MB), sedangkan materi paparan umumnya PPT/DOC.
-- Berkas yang lebih besar dari pagu cukup ditautkan (Drive) — itu sebabnya materi
-- boleh berupa tautan.
--
-- DEPLOY-ORDERING: jalankan SEBELUM deploy kode. Kalau terbalik, bagian Event
-- menampilkan pesan error (tabel belum ada); bagian lain halaman tak terganggu.

create table if not exists bidang_event (
  id          uuid primary key default gen_random_uuid(),
  nama        text not null check (btrim(nama) <> ''),
  tanggal     date not null,
  tempat      text,
  keterangan  text,
  created_by  uuid default auth.uid() references admin_profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table bidang_event is
  'Arsip event Bidang Pengelolaan BMD (bimtek, sosialisasi, rakor). Non-ledger.';

create index if not exists idx_bidang_event_tanggal on bidang_event (tanggal desc, created_at desc);

create table if not exists bidang_event_berkas (
  id          uuid primary key default gen_random_uuid(),
  -- CASCADE: baris berkas tak punya arti tanpa event-nya. Berkas FISIK di storage
  -- tidak ikut terhapus oleh FK — klien membuangnya sendiri (lib/eventBidangData.ts).
  event_id    uuid not null references bidang_event(id) on delete cascade,
  jenis       text not null check (jenis in ('materi', 'dokumentasi')),
  judul       text not null check (btrim(judul) <> ''),
  keterangan  text,
  url         text,
  file_path   text,
  created_by  uuid default auth.uid() references admin_profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  -- Tautan WAJIB http(s): ia dirender sebagai href, jadi `javascript:` dkk. harus
  -- mustahil tersimpan walau klien dilewati.
  constraint bidang_event_berkas_url_sah check (url is null or url ~* '^https?://\S+$'),
  -- Materi = TEPAT SATU dari berkas/tautan. Dokumentasi = tautan saja.
  constraint bidang_event_berkas_bentuk check (
    (jenis = 'materi'      and num_nonnulls(url, file_path) = 1) or
    (jenis = 'dokumentasi' and url is not null and file_path is null)
  )
);

create index if not exists idx_bidang_event_berkas_event on bidang_event_berkas (event_id, jenis, created_at);

create or replace function fn_bidang_event_updated()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_bidang_event_updated on bidang_event;
create trigger trg_bidang_event_updated
  before update on bidang_event
  for each row execute function fn_bidang_event_updated();

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- ⚠️ fn_is_admin() DIBUNGKUS InitPlan `(SELECT ...)` — aturan wajib repo ini.
alter table bidang_event        enable row level security;
alter table bidang_event_berkas enable row level security;

drop policy if exists be_select on bidang_event;
create policy be_select on bidang_event for select to authenticated using (true);
drop policy if exists be_insert on bidang_event;
create policy be_insert on bidang_event for insert to authenticated with check ((select fn_is_admin()));
drop policy if exists be_update on bidang_event;
create policy be_update on bidang_event for update to authenticated
  using ((select fn_is_admin())) with check ((select fn_is_admin()));
drop policy if exists be_delete on bidang_event;
create policy be_delete on bidang_event for delete to authenticated using ((select fn_is_admin()));

drop policy if exists beb_select on bidang_event_berkas;
create policy beb_select on bidang_event_berkas for select to authenticated using (true);
drop policy if exists beb_insert on bidang_event_berkas;
create policy beb_insert on bidang_event_berkas for insert to authenticated with check ((select fn_is_admin()));
drop policy if exists beb_update on bidang_event_berkas;
create policy beb_update on bidang_event_berkas for update to authenticated
  using ((select fn_is_admin())) with check ((select fn_is_admin()));
drop policy if exists beb_delete on bidang_event_berkas;
create policy beb_delete on bidang_event_berkas for delete to authenticated using ((select fn_is_admin()));

grant select, insert, update, delete on bidang_event, bidang_event_berkas to authenticated;

-- ── Storage: bucket `event-materi` ──────────────────────────────────────────
-- Privat (dibuka lewat signed URL), 20 MB, dokumen kantor + gambar. Baca: semua
-- pengguna login; unggah & hapus: admin saja (beda dari `dokumen-sumber` yang
-- policy-nya se-bucket untuk semua login).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('event-materi', 'event-materi', false, 20971520, array[
  'application/pdf',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/jpeg', 'image/png', 'image/webp'
])
on conflict (id) do update set
  file_size_limit = 20971520,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "event_materi_select" on storage.objects;
create policy "event_materi_select" on storage.objects for select to authenticated
  using (bucket_id = 'event-materi');
drop policy if exists "event_materi_insert" on storage.objects;
create policy "event_materi_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'event-materi' and (select fn_is_admin()));
drop policy if exists "event_materi_delete" on storage.objects;
create policy "event_materi_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'event-materi' and (select fn_is_admin()));
