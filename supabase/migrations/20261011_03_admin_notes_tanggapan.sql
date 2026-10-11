-- Notes — TANGGAPAN admin saat menandai selesai (permintaan user 2026-10-11).
--
-- Dulu "Tandai Selesai" cuma membalik status: penulis catatan melihat lencana
-- "✓ Ditangani" tanpa tahu APA yang dilakukan (dikerjakan? ditolak? sudah ada
-- jalannya?). Kini admin boleh menuliskan tanggapan singkat yang tampil di bawah
-- catatannya — terbaca penulis lewat policy `notes_select` yang sudah ada.
--
-- ⚠️ Sama dgn status selesai (20260905_01): tanggapan itu ALUR KERJA ADMIN, bukan
-- isi catatan — jadi tetap lewat RPC SECURITY DEFINER, BUKAN policy UPDATE
-- (yang akan membuka kolom `isi` milik orang lain untuk disunting admin).
--
-- Tanggapan OPSIONAL. Batal Tertangani MENCABUT tanggapannya (pola `selesai_at`):
-- tanggapan menjelaskan penanganan yang sudah tak berlaku.
--
-- ⚠️ Tanda tangan RPC berubah (parameter ke-3) → fungsi lama di-DROP dulu; kalau
-- dibiarkan, dua overload bersama-sama membuat panggilan `rpc()` ambigu. Karena
-- itu GRANT/REVOKE ditulis ulang (CREATE membuat ACL baru; EXECUTE ke PUBLIC
-- dicabut 20260914_03 dan tak boleh kembali).
--
-- DEPLOY-ORDERING: jalankan SEBELUM deploy kode. Kalau terbalik, daftar Notes
-- gagal dimuat (kolom `tanggapan` belum ada) — pesan error tampil, tak ada yang tertulis.

alter table admin_notes add column if not exists tanggapan text
  check (tanggapan is null or (btrim(tanggapan) <> '' and length(tanggapan) <= 2000));
alter table admin_notes add column if not exists tanggapan_oleh text;

comment on column admin_notes.tanggapan is
  'Tanggapan admin atas catatan, diisi saat menandai selesai (opsional). Dicabut saat Batal Tertangani.';
comment on column admin_notes.tanggapan_oleh is
  'Snapshot nama admin yang menulis tanggapan — dibekukan, tak ikut berubah kalau data pegawainya berubah.';

-- ── "(disunting)" hanya kalau ISI-nya berubah ───────────────────────────────
-- Trigger lama menyetel updated_at di SETIAP update, jadi menandai selesai pun
-- membuat catatan orang terbaca "(disunting)" padahal penulisnya tak mengubah
-- apa pun — dan dengan tanggapan, itu makin menyesatkan. Badan fungsi sama
-- persis dgn 20260816_01 kecuali bagian updated_at.
create or replace function fn_admin_notes_isi()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_skpd      bigint;
  v_penulis   text;
  v_skpd_nama text;
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null then
      select p.skpd_id, coalesce(g.nama, p.email), s.nama
        into v_skpd, v_penulis, v_skpd_nama
        from admin_profiles p
        left join admin_pegawai g on g.id = p.pegawai_id
        left join admin_skpd s    on s.id = p.skpd_id
       where p.id = auth.uid();

      new.author_id := auth.uid();
      new.skpd_id   := v_skpd;
      new.penulis   := v_penulis;
      new.skpd_nama := v_skpd_nama;
    end if;
    new.created_at := now();
    new.updated_at := now();
  else
    new.updated_at := case when new.isi is distinct from old.isi then now() else old.updated_at end;
  end if;
  return new;
end;
$$;

-- ── RPC: tandai selesai + tanggapan ─────────────────────────────────────────
drop function if exists fn_admin_notes_tandai(uuid, boolean);

create or replace function fn_admin_notes_tandai(p_id uuid, p_selesai boolean, p_tanggapan text default null)
returns admin_notes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row       admin_notes;
  v_tanggapan text := nullif(btrim(coalesce(p_tanggapan, '')), '');
  v_oleh      text;
begin
  if not fn_is_admin() then
    raise exception 'Hanya admin yang boleh menandai status catatan.';
  end if;
  if v_tanggapan is not null and length(v_tanggapan) > 2000 then
    raise exception 'Tanggapan terlalu panjang (maks. 2000 karakter).';
  end if;

  if p_selesai and v_tanggapan is not null then
    select coalesce(g.nama, p.email)
      into v_oleh
      from admin_profiles p
      left join admin_pegawai g on g.id = p.pegawai_id
     where p.id = auth.uid();
  end if;

  update admin_notes
     set selesai    = p_selesai,
         -- Ditandai lagi saat SUDAH selesai (mis. menyunting tanggapan) → tanggal
         -- penandaan pertama dipertahankan; baru MAJU kalau sebelumnya belum/batal.
         selesai_at = case when not p_selesai then null
                           when selesai then coalesce(selesai_at, now())
                           else now() end,
         tanggapan       = case when p_selesai then v_tanggapan else null end,
         tanggapan_oleh  = case when p_selesai and v_tanggapan is not null then v_oleh else null end
   where id = p_id
  returning * into v_row;

  if not found then
    raise exception 'Catatan tidak ditemukan.';
  end if;
  return v_row;
end;
$$;

revoke all on function fn_admin_notes_tandai(uuid, boolean, text) from public, anon;
grant execute on function fn_admin_notes_tandai(uuid, boolean, text) to authenticated;
