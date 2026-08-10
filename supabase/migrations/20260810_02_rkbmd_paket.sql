-- ============================================================================
-- RKBMD Pengadaan: BANYAK KARTU per SKPD, satu kartu = satu Sub Kegiatan.
--
-- Keputusan user 2026-08-10 (sesudah uji live): bentuknya kurang-lebih seperti
-- entry Pengadaan — satu SKPD punya BEBERAPA kartu Program/Kegiatan/Sub
-- Kegiatan, tiap kartu berisi beberapa item barang. Semua kartu diisi dulu,
-- baru SATU KALI diajukan ke Pengelola Barang. Kalau ditolak, yang ditolak
-- seluruh dokumennya (semua kartu ikut kembali untuk direview), lalu diajukan
-- ulang. Siklus status TIDAK berubah — yang berubah cuma isinya jadi berjenjang.
--
-- Sebelum ini `rkbmd` menyimpan program/kegiatan/sub_kegiatan di HEADER, jadi
-- satu SKPD cuma bisa punya SATU sub kegiatan per tahun. Format cetak resmi
-- (Usulan Rencana Kebutuhan Pengadaan BMD) justru mengelompokkan baris per
-- Program → Kegiatan → Sub Kegiatan dalam satu lembar, yang mustahil dipenuhi
-- model lama.
--
-- ⚠️ DEPLOY-ORDERING: jalankan SEBELUM deploy kode.
-- ============================================================================

-- ── 1. Kartu (paket) per sub kegiatan ───────────────────────────────────────
create table if not exists rkbmd_paket (
  id           uuid primary key default gen_random_uuid(),
  rkbmd_id     uuid not null references rkbmd(id) on delete cascade,
  no_urut      integer,
  program      text,
  kegiatan     text,
  sub_kegiatan text,
  keterangan   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists idx_rkbmd_paket_rkbmd on rkbmd_paket (rkbmd_id);

-- SATU sub kegiatan = SATU kartu dalam satu dokumen. Dua kartu untuk sub
-- kegiatan yang sama itu selalu kekeliruan input, dan di lembar cetak akan
-- muncul sebagai dua blok bernama sama — pembaca tak punya cara tahu mana yang
-- benar. Kartu yang baru dibuat ber-sub_kegiatan NULL (belum dipilih) dan
-- sengaja TIDAK ikut dibatasi: NULL tak pernah bertabrakan di UNIQUE, jadi
-- operator tetap bisa membuat beberapa kartu kosong lalu mengisinya.
create unique index if not exists uq_rkbmd_paket_sub
  on rkbmd_paket (rkbmd_id, sub_kegiatan) where sub_kegiatan is not null;

drop trigger if exists trg_rkbmd_paket_updated on rkbmd_paket;
create trigger trg_rkbmd_paket_updated before update on rkbmd_paket
  for each row execute function fn_set_updated_at();

-- ── 2. Item menempel ke kartu ───────────────────────────────────────────────
-- ON DELETE CASCADE: membuang kartu berarti membuang isinya. Ini AMAN & bukan
-- pelanggaran append-only — `rkbmd_*` seluruhnya NON-LEDGER (perencanaan T+1),
-- tidak pernah menyentuh `transaksi_bmd` maupun `aset`.
alter table rkbmd_item add column if not exists paket_id uuid references rkbmd_paket(id) on delete cascade;
create index if not exists idx_rkbmd_item_paket on rkbmd_item (paket_id) where paket_id is not null;

-- ── 3. Pindahkan data lama ke bentuk berkartu ───────────────────────────────
-- Tiap dokumen pengadaan yang SUDAH punya item dibuatkan satu kartu dari
-- program/kegiatan/sub_kegiatan header-nya, lalu itemnya ditunjukkan ke situ.
-- Dijalankan sebelum kolom headernya dibuang, supaya tidak ada yang hilang.
insert into rkbmd_paket (rkbmd_id, no_urut, program, kegiatan, sub_kegiatan)
select r.id, 1, r.program, r.kegiatan, r.sub_kegiatan
from rkbmd r
where r.jenis = 'pengadaan'
  and exists (select 1 from rkbmd_item i where i.rkbmd_id = r.id)
  and not exists (select 1 from rkbmd_paket p where p.rkbmd_id = r.id);

update rkbmd_item i
set paket_id = p.id
from rkbmd_paket p
where p.rkbmd_id = i.rkbmd_id and i.paket_id is null;

-- ── 4. Buang program/kegiatan/sub kegiatan dari header ──────────────────────
-- Satu fakta, satu rumah. Membiarkannya di dua tempat = dua sumber kebenaran
-- yang bisa bertentangan tanpa aturan siapa menang — cacat yang sudah terbukti
-- merepotkan di cache `aset.pemanfaatan`. Empat jenis RKBMD lain (pemeliharaan,
-- pemanfaatan, pemindahtanganan, penghapusan) memang tak pernah memakai ketiga
-- kolom ini, jadi tak ada yang kehilangan apa pun.
alter table rkbmd drop column if exists program;
alter table rkbmd drop column if exists kegiatan;
alter table rkbmd drop column if exists sub_kegiatan;

-- ── 5. RLS — meniru persis pola rkbmd_item (izin ikut dokumen induknya) ─────
alter table rkbmd_paket enable row level security;

drop policy if exists rkbmd_paket_select on rkbmd_paket;
create policy rkbmd_paket_select on rkbmd_paket for select using (
  exists (select 1 from rkbmd h where h.id = rkbmd_paket.rkbmd_id
          and ((SELECT fn_is_admin()) or fn_skpd_visible(h.skpd_id)))
);

drop policy if exists rkbmd_paket_viewer_select on rkbmd_paket;
create policy rkbmd_paket_viewer_select on rkbmd_paket for select using ((SELECT fn_is_viewer()));

drop policy if exists rkbmd_paket_insert on rkbmd_paket;
create policy rkbmd_paket_insert on rkbmd_paket for insert with check (
  exists (select 1 from rkbmd h where h.id = rkbmd_paket.rkbmd_id
          and ((SELECT fn_is_admin()) or fn_skpd_visible(h.skpd_id)))
);

drop policy if exists rkbmd_paket_update on rkbmd_paket;
create policy rkbmd_paket_update on rkbmd_paket for update using (
  exists (select 1 from rkbmd h where h.id = rkbmd_paket.rkbmd_id
          and ((SELECT fn_is_admin()) or fn_skpd_visible(h.skpd_id)))
);

drop policy if exists rkbmd_paket_delete on rkbmd_paket;
create policy rkbmd_paket_delete on rkbmd_paket for delete using (
  exists (select 1 from rkbmd h where h.id = rkbmd_paket.rkbmd_id
          and ((SELECT fn_is_admin()) or fn_skpd_visible(h.skpd_id)))
);
