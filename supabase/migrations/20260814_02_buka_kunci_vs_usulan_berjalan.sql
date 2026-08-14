-- Buka Kunci Standar Harga: jalan mundur yang kejepit `uq_standar_usulan_berjalan`.
-- Insiden 2026-08-14, ditemukan user saat menguji maju-mundur.
--
-- ══ GEJALA ══
-- "gagal membuka kunci usulan: duplicate key value violates unique constraint
--  uq_standar_usulan_berjalan"
--
-- ══ DUDUK PERKARANYA ══
-- Partial unique itu menjaga SATU usulan berjalan per (SKPD, tahun, jenis) —
-- alasannya benar: layar Usulan memilih SATU usulan untuk disunting
-- (`berjalan = headers.find(...)`), jadi dua daftar berjalan berarti salah
-- satunya tak kelihatan sama sekali.
--
-- Tapi Buka Kunci mengembalikan usulan yang sudah ditetapkan ke `draft` — dan
-- SKPD yang rajin sudah menyusun usulan TAMBAHAN sesudah usulan pertamanya
-- ditetapkan. Jadi jalan mundur ditolak oleh aturan yang mengatur jalan maju.
-- Lebih buruk lagi: SKPD dengan DUA penetapan hanya bisa membuka satu; yang
-- kedua terkunci selamanya sampai draft hasil pembukaan pertama dihabiskan.
-- Jalan mundur yang bisa buntu bukan jalan mundur.
--
-- ══ OBATNYA: DIGABUNG, bukan diblokir ══
-- Barang yang ditarik kembali dikembalikan ke MEJA SKPD — dan meja itu adalah
-- usulan yang sedang mereka susun. Barisnya dipindah ke sana, header lamanya
-- (yang sudah kosong) dibuang. Operator melihat satu daftar berisi semuanya,
-- persis seperti kalau ia menambahkannya sendiri.
--
-- Yang TIDAK digabung: usulan lain yang berstatus `diajukan` — itu sedang di
-- meja penelaah, dan menyuntikkan baris ke daftar yang sedang dibaca orang
-- membuat ia menyetujui sesuatu yang berbeda dari yang dilihatnya. Untuk kasus
-- itu Buka Kunci menolak dengan pesan yang menyebut apa yang harus dibereskan
-- lebih dulu.

-- ── 1) "Belum selesai" termasuk `ditolak` ──────────────────────────────────
-- Lubang tetangga yang ikut ditutup: `ditolak` dulu DI LUAR partial unique,
-- jadi SKPD yang usulannya dikembalikan penelaah masih bisa membuat draft baru
-- — dan begitu keduanya ada, layar Usulan cuma menampilkan salah satunya
-- (`headers.find`), yang satu lagi lenyap dari pandangan berikut isinya.
-- Usulan yang dikembalikan itu justru yang harus diperbaiki, bukan ditinggal.
DROP INDEX IF EXISTS uq_standar_usulan_berjalan;
CREATE UNIQUE INDEX uq_standar_usulan_berjalan
  ON rkbmd_standar_usulan (skpd_id, tahun, jenis)
  WHERE status IN ('draft','diajukan','ditolak');

-- ── 2) Hapus-guard: beri jalan untuk RPC ───────────────────────────────────
-- Penggabungan di bawah membuang header yang sudah kosong, dan statusnya masih
-- `disetujui` saat itu. Pengecualiannya sama dengan guard lain: penanda
-- transaksi `app.standar_via_usulan`, yang cuma bisa dinyalakan dari dalam RPC.
CREATE OR REPLACE FUNCTION public.fn_standar_usulan_hapus_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF OLD.status = 'disetujui'
     AND COALESCE(current_setting('app.standar_via_usulan', true), '') <> '1' THEN
    RAISE EXCEPTION 'Usulan yang sudah ditetapkan tidak bisa dihapus — barisnya masih menjadi acuan bersama. Buka Kunci dulu di menu Validasi (barisnya ikut ditarik), baru boleh dihapus.';
  END IF;
  RETURN OLD;
END $function$;

-- ── 3) Buka Kunci: tarik baris, lalu kembalikan ke meja SKPD ───────────────
CREATE OR REPLACE FUNCTION public.fn_standar_usulan_buka_kunci(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  u record; it record;
  v_pakai text; v_n_pakai integer;
  v_lain_id uuid; v_lain_status text; v_urut integer;
  n_tarik integer := 0; n_tetap integer := 0; n_sbsk integer := 0; n_gabung integer := 0;
begin
  if not fn_is_admin() then
    raise exception 'Hanya admin (Pengelola/BKAD) yang boleh membuka kunci usulan standar harga.';
  end if;

  select * into u from rkbmd_standar_usulan where id = p_id for update;
  if u is null then raise exception 'Usulan tidak ditemukan.'; end if;
  if u.status <> 'disetujui' then
    raise exception 'Hanya usulan yang sudah DITETAPKAN yang perlu dibuka kuncinya (status sekarang: %).', u.status;
  end if;

  -- Ke mana barisnya pulang? Diperiksa SEBELUM apa pun ditarik: kalau
  -- jawabannya "tak boleh", tak ada yang terlanjur berubah.
  select id, status into v_lain_id, v_lain_status
  from rkbmd_standar_usulan
  where skpd_id = u.skpd_id and tahun = u.tahun and jenis = u.jenis
    and id <> p_id and status in ('draft','diajukan','ditolak')
  limit 1;   -- paling banyak satu, dijamin uq_standar_usulan_berjalan

  if v_lain_status = 'diajukan' then
    raise exception 'SKPD ini punya usulan % TA % lain yang SEDANG DITELAAH. Putuskan dulu usulan itu (setujui atau tolak), baru penetapan ini bisa dibuka — kalau tidak, barisnya akan masuk ke daftar yang sedang Anda baca.',
      upper(u.jenis), u.tahun;
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

  if v_lain_id is null then
    update rkbmd_standar_usulan set status = 'draft' where id = p_id;
  else
    -- Digabung ke usulan yang sedang disusun. `no_urut` dilanjutkan dari nomor
    -- terakhir di sana — kalau tidak, dua baris bernomor sama & urutannya jadi
    -- undian tiap kali daftarnya dibaca.
    select coalesce(max(no_urut), 0) into v_urut
      from rkbmd_standar_usulan_item where usulan_id = v_lain_id;

    with urut as (
      select id, row_number() over (order by no_urut, id) as r
      from rkbmd_standar_usulan_item where usulan_id = p_id
    )
    update rkbmd_standar_usulan_item i
       set usulan_id = v_lain_id, no_urut = v_urut + urut.r
      from urut where urut.id = i.id;
    get diagnostics n_gabung = row_count;

    -- Headernya sudah kosong; membiarkannya berstatus `disetujui` justru
    -- berbohong (penetapannya baru saja dibatalkan), dan mengubahnya ke draft
    -- akan menabrak partial unique yang sama.
    delete from rkbmd_standar_usulan where id = p_id;
  end if;

  perform set_config('app.standar_via_usulan', '0', true);

  return jsonb_build_object('jenis', u.jenis, 'ditarik', n_tarik, 'tetap', n_tetap,
                            'sbsk', n_sbsk, 'digabung', n_gabung);
end;
$function$;

COMMENT ON INDEX uq_standar_usulan_berjalan IS
  'Paling banyak SATU usulan BELUM SELESAI (draft/diajukan/ditolak) per SKPD+tahun+jenis — layar Usulan memilih satu untuk disunting, jadi dua daftar berjalan berarti salah satunya tak kelihatan. Buka Kunci tidak menabraknya: barisnya digabung ke usulan yang sedang disusun (fn_standar_usulan_buka_kunci).';
