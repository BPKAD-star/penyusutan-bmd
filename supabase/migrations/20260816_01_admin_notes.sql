-- Notes — saran & masukan tentang aplikasi (permintaan user 2026-08-16).
--
-- Tiap user boleh menulis catatan; TIDAK ada alur ajukan/setujui — cukup tulis.
-- Admin (Pengelola Barang) melihat SEMUANYA jadi satu; user lain hanya
-- catatannya sendiri.
--
-- ⚠️ NON-LEDGER, pola yang sama dengan KIR (migrasi 20260727_02): ini data
-- administratif, bukan peristiwa akuntansi — tak menyentuh nilai, penyusutan,
-- kepemilikan SKPD, maupun visibilitas barang. Karena itu UPDATE/DELETE biasa
-- di sini SAH & aturan append-only `transaksi_bmd` tidak berlaku. JANGAN
-- menambahkan jenis ledger `note_*` atau kolom cache di `aset` untuk fitur ini.

create table if not exists admin_notes (
  id          uuid primary key default gen_random_uuid(),
  -- ON DELETE SET NULL, bukan CASCADE: catatan itu masukan tentang aplikasi &
  -- tetap berguna setelah akun penulisnya dihapus. Identitasnya tidak ikut
  -- hilang karena di-snapshot ke `penulis`/`skpd_nama` di bawah.
  author_id   uuid references admin_profiles(id) on delete set null,
  skpd_id     bigint references admin_skpd(id) on delete set null,
  -- Snapshot saat ditulis. Sengaja DIBEKUKAN: catatan "dari Kecamatan Kras"
  -- harus tetap terbaca begitu walau penulisnya kemudian pindah SKPD —
  -- konteks keluhannya melekat pada saat ia menulis, bukan pada posisinya hari ini.
  penulis     text,
  skpd_nama   text,
  isi         text not null check (btrim(isi) <> ''),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table admin_notes is
  'Saran & masukan pengguna tentang aplikasi. Non-ledger, tanpa alur persetujuan.';

-- Admin membaca SELURUH catatan diurutkan terbaru dulu — satu-satunya pola baca
-- berat di tabel ini.
create index if not exists idx_admin_notes_created on admin_notes (created_at desc);
-- Pembaca non-admin selalu menyaring ke catatannya sendiri.
create index if not exists idx_admin_notes_author on admin_notes (author_id, created_at desc);

-- ── Identitas penulis DIISI SERVER, tidak diterima dari klien ────────────────
-- Kalau `author_id`/`skpd_id` boleh dikirim klien, satu orang bisa menulis
-- catatan atas nama SKPD lain — dan di layar admin itu tak akan kelihatan
-- sebagai kejanggalan apa pun.
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
    -- auth.uid() NULL = dijalankan lewat SQL Editor / service_role. Dibiarkan
    -- apa adanya supaya perbaikan data darurat tetap mungkin — pola yang sama
    -- dengan pengecualian `current_user <> 'authenticated'` di aset_awal_2026.
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
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_admin_notes_isi on admin_notes;
create trigger trg_admin_notes_isi
  before insert or update on admin_notes
  for each row execute function fn_admin_notes_isi();

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table admin_notes enable row level security;

-- ⚠️ fn_is_admin() & auth.uid() DIBUNGKUS InitPlan `(SELECT ...)` — dievaluasi
-- SEKALI, bukan per baris. Aturan wajib di repo ini; lihat CLAUDE.md bagian
-- PERFORMA Daftar Barang & Penyusutan.
drop policy if exists notes_select on admin_notes;
create policy notes_select on admin_notes for select
  using ((select fn_is_admin()) or author_id = (select auth.uid()));

-- Siapa pun yang login boleh menulis — termasuk 'pengawas'. Memberi masukan
-- bukan menulis data BMD, jadi tak ada alasan menutupnya untuk peran baca-saja.
drop policy if exists notes_insert on admin_notes;
create policy notes_insert on admin_notes for insert
  with check (author_id = (select auth.uid()));

-- Menyunting HANYA milik sendiri, admin sekalipun tidak. Catatan orang lain
-- yang bisa diubah admin berhenti menjadi masukan yang bisa dipercaya.
drop policy if exists notes_update on admin_notes;
create policy notes_update on admin_notes for update
  using (author_id = (select auth.uid()))
  with check (author_id = (select auth.uid()));

-- Menghapus: penulisnya sendiri, atau admin (membersihkan catatan yang sudah
-- ditindaklanjuti / salah kirim).
drop policy if exists notes_delete on admin_notes;
create policy notes_delete on admin_notes for delete
  using (author_id = (select auth.uid()) or (select fn_is_admin()));

grant select, insert, update, delete on admin_notes to authenticated;
