-- Notes — tanda "Ditangani" (permintaan user 2026-09-05).
--
-- Admin (Pengelola Barang) membaca puluhan catatan dari seluruh SKPD jadi satu
-- daftar (migrasi 20260816_01) tapi tak punya cara menandai mana yang sudah
-- ditindaklanjuti — begitu daftarnya panjang, catatan lama & baru tercampur
-- tanpa penanda mana yang masih perlu dikerjakan.
--
-- ⚠️ INI STATUS ALUR KERJA ADMIN, BUKAN ISI CATATAN — sengaja tidak lewat
-- policy `notes_update` (yang membatasi HANYA penulis sendiri boleh
-- menyunting, admin sekalipun tidak — lihat migrasi 20260816_01). Kalau
-- "selesai"/"selesai_at" dibuka lewat UPDATE biasa, admin otomatis bisa
-- menyunting kolom LAIN pada catatan orang lain juga (RLS tak bisa membedakan
-- kolom), yang justru melanggar keputusan "isi catatan cuma bisa diubah
-- penulisnya". Makanya satu-satunya jalan menyalakan/mematikan status ini
-- adalah RPC `fn_admin_notes_tandai`, SECURITY DEFINER, mengecek `fn_is_admin()`
-- sendiri dan HANYA menyentuh dua kolom ini.
alter table admin_notes add column if not exists selesai boolean not null default false;
alter table admin_notes add column if not exists selesai_at timestamptz;

comment on column admin_notes.selesai is
  'Status alur kerja ADMIN — "sudah ditangani", bukan bagian catatan yang ditulis pengirim.';
comment on column admin_notes.selesai_at is
  'Kapan status selesai TERAKHIR dinyalakan. NULL kalau belum pernah / sedang dibatalkan. Dibatalkan lalu ditandai selesai lagi → tanggal ini MAJU ke waktu penandaan kedua, bukan mempertahankan yang pertama.';

-- Admin sering menyaring "mana yang masih perlu dikerjakan" — filter tercepat
-- ikut status ini, jadi diberi index sendiri.
create index if not exists idx_admin_notes_selesai on admin_notes (selesai, created_at desc);

create or replace function fn_admin_notes_tandai(p_id uuid, p_selesai boolean)
returns admin_notes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row admin_notes;
begin
  if not fn_is_admin() then
    raise exception 'Hanya admin yang boleh menandai status catatan.';
  end if;

  update admin_notes
     set selesai    = p_selesai,
         -- Batal tertangani → tanggalnya IKUT DICABUT (permintaan user): begitu
         -- ditandai selesai lagi nanti, itu penandaan BARU dan pantas dapat
         -- tanggal baru, bukan tanggal penandaan pertama yang sudah tak berlaku.
         selesai_at = case when p_selesai then now() else null end
   where id = p_id
  returning * into v_row;

  if not found then
    raise exception 'Catatan tidak ditemukan.';
  end if;
  return v_row;
end;
$$;

-- Siapa pun yang login boleh MEMANGGIL RPC-nya (fungsinya sendiri yang menolak
-- kalau bukan admin) — pola yang sama dgn RPC persetujuan lain di repo ini.
grant execute on function fn_admin_notes_tandai(uuid, boolean) to authenticated;
