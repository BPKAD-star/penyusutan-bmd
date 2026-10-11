-- Aktivitas pengguna di Admin → Daftar User (permintaan user 2026-10-11):
-- siapa yang sering membuka aplikasi 7 hari ke belakang & pemakaian hariannya.
--
-- DUA SUMBER, sengaja dipakai berdampingan:
--   (1) SESI LOGIN — `auth.refresh_tokens`. Supabase menerbitkan token baru tiap
--       kali sesi diperpanjang (± tiap jam selama tab aplikasi terbuka) & saat
--       login. Datanya SUDAH ADA sejak 2026-07-20, jadi riwayat ke belakang
--       langsung terbaca. Ini PERKIRAAN: yang terukur "sesi sedang hidup",
--       bukan menu yang dibuka — tab yang dibiarkan terbuka ikut terhitung.
--   (2) LOG HALAMAN — tabel baru `log_aktivitas`, satu baris per (user, hari,
--       halaman) dengan penghitung. Akurat per menu, tapi baru terisi sejak
--       kode pencatatnya di-deploy.
--   `auth.audit_log_entries` TIDAK bisa dipakai: tabel itu KOSONG di proyek ini
--   (diperiksa 2026-10-11).
--
-- ⚠️ NON-LEDGER, pola Notes/KIR — UPDATE biasa di sini sah. Tak menyentuh data BMD.
--
-- Wewenang: MEMBACA hanya admin (Pengelola Barang). MENULIS log hanya lewat
-- `fn_catat_aktivitas` (identitas dari auth.uid(), tak bisa diisi klien) —
-- tabelnya tanpa policy & GRANT tulis.
--
-- DEPLOY-ORDERING: bebas. Tanpa migrasi, pencatat di klien gagal SENYAP (memang
-- disengaja — pencatatan tak boleh mengganggu kerja) dan panel aktivitas di
-- Daftar User menampilkan pesan error; layar lain tak terpengaruh.

create table if not exists log_aktivitas (
  user_id   uuid not null references admin_profiles(id) on delete cascade,
  -- Tanggal WIB, bukan UTC — "hari ini" bagi operator Kediri.
  tanggal   date not null,
  halaman   text not null check (halaman ~ '^/dashboard(/[A-Za-z0-9:_-]+)*$' and length(halaman) <= 200),
  jumlah    integer not null default 1 check (jumlah > 0),
  pertama   timestamptz not null default now(),
  terakhir  timestamptz not null default now(),
  primary key (user_id, tanggal, halaman)
);

comment on table log_aktivitas is
  'Penghitung kunjungan halaman per (user, hari WIB, halaman). Non-ledger; ditulis lewat fn_catat_aktivitas.';

-- Admin membaca rentang tanggal untuk SEMUA user.
create index if not exists idx_log_aktivitas_tanggal on log_aktivitas (tanggal);

alter table log_aktivitas enable row level security;

drop policy if exists la_select on log_aktivitas;
create policy la_select on log_aktivitas for select to authenticated
  using ((select fn_is_admin()));

grant select on log_aktivitas to authenticated;

-- ── Pencatat ────────────────────────────────────────────────────────────────
-- SECURITY DEFINER karena tabelnya tanpa policy tulis. Halaman yang tak sesuai
-- pola DIABAIKAN (bukan RAISE): pencatat dipanggil di latar dan tak boleh
-- menghasilkan galat yang mengganggu.
create or replace function fn_catat_aktivitas(p_halaman text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null
     or p_halaman is null
     or length(p_halaman) > 200
     or p_halaman !~ '^/dashboard(/[A-Za-z0-9:_-]+)*$'
     or not exists (select 1 from admin_profiles where id = v_uid) then
    return;
  end if;

  insert into log_aktivitas as l (user_id, tanggal, halaman)
  values (v_uid, (now() at time zone 'Asia/Jakarta')::date, p_halaman)
  on conflict (user_id, tanggal, halaman)
  do update set jumlah = l.jumlah + 1, terakhir = now();
end;
$$;

revoke all on function fn_catat_aktivitas(text) from public, anon;
grant execute on function fn_catat_aktivitas(text) to authenticated;

-- ── Sesi login per hari (sumber 1) ──────────────────────────────────────────
-- SECURITY DEFINER karena skema `auth` tak terbaca `authenticated`. Admin saja.
-- `user_id` di auth.refresh_tokens bertipe varchar → disaring pola uuid dulu
-- supaya cast tak meledak.
create or replace function fn_admin_aktivitas_sesi(p_dari date, p_sampai date)
returns table (user_id uuid, tanggal date, jumlah integer)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not fn_is_admin() then
    raise exception 'Hanya admin yang boleh melihat aktivitas pengguna.';
  end if;
  if p_sampai < p_dari or p_sampai - p_dari > 92 then
    raise exception 'Rentang tanggal tidak sah (maks. 93 hari).';
  end if;

  return query
  select t.user_id::uuid,
         (t.created_at at time zone 'Asia/Jakarta')::date as tanggal,
         count(*)::integer
    from auth.refresh_tokens t
   where t.user_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     and t.created_at >= (p_dari::timestamp at time zone 'Asia/Jakarta')
     and t.created_at <  ((p_sampai + 1)::timestamp at time zone 'Asia/Jakarta')
   group by 1, 2;
end;
$$;

revoke all on function fn_admin_aktivitas_sesi(date, date) from public, anon;
grant execute on function fn_admin_aktivitas_sesi(date, date) to authenticated;

-- ── Terakhir aktif (sepanjang masa) ─────────────────────────────────────────
-- Login terakhir dari auth.users + sesi terakhir dari refresh_tokens + kunjungan
-- terakhir dari log_aktivitas; klien mengambil yang paling akhir.
create or replace function fn_admin_terakhir_aktif()
returns table (user_id uuid, login_terakhir timestamptz, sesi_terakhir timestamptz, halaman_terakhir timestamptz)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not fn_is_admin() then
    raise exception 'Hanya admin yang boleh melihat aktivitas pengguna.';
  end if;

  return query
  select u.id,
         u.last_sign_in_at,
         (select max(t.created_at) from auth.refresh_tokens t where t.user_id = u.id::text),
         (select max(l.terakhir) from log_aktivitas l where l.user_id = u.id)
    from auth.users u;
end;
$$;

revoke all on function fn_admin_terakhir_aktif() from public, anon;
grant execute on function fn_admin_terakhir_aktif() to authenticated;
