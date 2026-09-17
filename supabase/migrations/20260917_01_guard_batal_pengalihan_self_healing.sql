-- ============================================================================
-- GUARD BATAL PENGALIHAN/MUTASI: MENGUNCI SELAMANYA sesudah satu pembatalan
-- di RANTAI ATASNYA — kelas bug yang sama dgn "Guard pembatalan MENGUNCI
-- SELAMANYA sesudah satu pembatalan" (2026-08-31, lib/guardPembatalan.ts),
-- tapi belum ikut dibawa ke sini sampai hari ini (2026-09-17).
--
-- ── Kenapa ada DUA implementasi guard yang sama di repo ini ────────────────
-- Aturan "batal cuma sah untuk event TERBARU aset itu" ditegakkan di DUA
-- tempat yang tak saling tahu:
--   1. `lib/guardPembatalan.ts` (`cekBolehBatal`/`barisMasihBerlaku`) — dipakai
--      CLIENT-SIDE oleh Reklasifikasi, Koreksi, Kapitalisasi, Penghapusan, dst.
--      Diperbaiki 2026-08-31 supaya mengabaikan pasangan (event + pembatalannya
--      sendiri) yang sudah saling meniadakan.
--   2. `fn_batal_pengalihan_barang` (SQL, SECURITY DEFINER) — dipakai
--      Pengalihan Status Penggunaan & Mutasi Internal (migrasi 20260729_07,
--      digeneralkan 20260812_04). Guard-nya ditulis LANGSUNG di badan fungsi
--      (`count(*) FROM transaksi_bmd WHERE aset_id=... AND id > v_id_terakhir`)
--      — bentuk NAIF yang sama persis dgn `cekBolehBatal` SEBELUM 2026-08-31.
-- Perbaikan 2026-08-31 cuma menyentuh yang (1); yang (2) kelewat karena hidup
-- di bahasa yang beda & tak pernah disatukan sejak awal — dan untuk pengalihan/
-- mutasi, guard SQL ini JUSTRU satu-satunya penjaga (client-side-nya TAK
-- memanggil `cekBolehBatal` sama sekali untuk dua jenis ini).
--
-- ── Akibatnya, kalau dibiarkan ──────────────────────────────────────────────
-- Aset yang: dipindah (pengalihan/mutasi, id lama) → lalu kena event lain
-- (kapitalisasi sbg anak, atau reklas/koreksi apa pun) → event itu DIBATALKAN
-- lagi — akan mengunci pemindahan LAMANYA secara PERMANEN, walau kedua event
-- di atasnya sudah saling meniadakan (append-only: baris `batal_*` tak pernah
-- hilang). Pesannya pun menyuruh "batalkan yang lebih baru dulu" — padahal itu
-- SUDAH terjadi, dan justru menambah baris pemblokir baru. Persis skenario
-- BKAD yang melahirkan perbaikan 2026-08-31, cuma di rantai pengalihan/mutasi.
--
-- ── Perbaikannya: satu fungsi SQL baru yang mengulang ALGORITMA
--    `barisMasihBerlaku()` (lib/guardPembatalan.ts) persis, bukan menulis
--    aturan ketiga yang bisa menyimpang lagi ─────────────────────────────────
-- `fn_baris_penghalang_batal(aset_id, trx_id_batas)` mengembalikan baris
-- PALING AWAL (kalau ada) di atas `trx_id_batas` yang MASIH menghalangi,
-- sesudah dua bentuk pasangan yang saling meniadakan dibuang:
--   (a) baris `batal_%` ber-`payload.target_trx_id`/`target_trx_ids` yang
--       SELURUH targetnya ada di dalam himpunan "di atas batas" yang sama —
--       baris `batal_*` itu sendiri & seluruh targetnya jadi netral.
--   (b) sisi ANAK kapitalisasi (`kapitalisasi_serap` ↔ `batal_kapitalisasi`
--       TANPA target, keterbatasan payload yg sudah tercatat di
--       `fetchNetSerap`, lib/rekon.ts): kalau baris PALING AWAL di himpunan itu
--       `kapitalisasi_serap` dan baris PALING AKHIR `batal_kapitalisasi`,
--       SELURUH deretnya netral (siklus serap→batal→serap lagi selesai dgn
--       "baris terakhir menang", sama dgn TS-nya).
-- Yang TIDAK diabaikan (dan tetap memblokir, sama seperti sebelumnya):
--   · event yang MASIH HIDUP (belum dibatalkan);
--   · `batal_*` yang targetnya di BAWAH `trx_id_batas` — itu perubahan
--     keadaan NYATA relatif terhadap event yang mau dibatalkan;
--   · siklus serap→batal→serap LAGI (berakhir di serap, bukan batal).
-- Pagu 500 baris (sama dgn `PAGU_BARIS` di TS) tetap fail-closed: kalau
-- riwayatnya melebihi itu, pasangan mana yang utuh tak bisa disimpulkan dgn
-- aman, jadi DITOLAK — bukan ditebak.
--
-- Diverifikasi ke PRODUKSI sebelum ditulis (transaksi + ROLLBACK, pola yang
-- sama dgn pembuktian kesetaraan lain di CLAUDE.md): skenario "kapitalisasi_
-- serap lalu dibatalkan" — guard LAMA menghitung 2 baris lebih baru (SALAH,
-- akan memblokir); fungsi BARU: 0 penghalang (BENAR). Skenario "ditambah satu
-- event hidup sesudahnya" — fungsi BARU tetap memblokir tepat di baris itu
-- (BENAR, tak jadi longgar). Tak ada baris yang tersisa di produksi (ROLLBACK).
--
-- ⚠️ `fn_baris_penghalang_batal` SENGAJA TIDAK di-GRANT ke `authenticated`/
-- `anon` — ia cuma dipanggil INTERNAL dari dalam `fn_batal_pengalihan_barang`
-- (SECURITY DEFINER, jadi konteks eksekusinya sudah pemilik fungsi), sejalan
-- dgn pengetatan GRANT 20260914_03.
--
-- Tak ada nilai enum baru & tanda tangan `fn_batal_pengalihan_barang` tak
-- berubah → urutan deploy BEBAS.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_baris_penghalang_batal(p_aset_id uuid, p_trx_id_batas bigint)
 RETURNS TABLE(id bigint, jenis text, periode text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH baris AS (
    SELECT t.id, t.jenis::text AS jenis, t.periode::text AS periode, t.payload
    FROM transaksi_bmd t
    WHERE t.aset_id = p_aset_id AND t.id > p_trx_id_batas
  ),
  -- (a) pasangan ber-target_trx_id/target_trx_ids ------------------------------
  target_batal_tunggal AS (
    SELECT b.id AS batal_id, (b.payload->>'target_trx_id')::bigint AS target_id
    FROM baris b
    WHERE b.jenis LIKE 'batal_%' AND b.payload->>'target_trx_id' ~ '^[0-9]+$'
  ),
  target_batal_jamak_src AS (
    SELECT b.id AS batal_id, b.payload
    FROM baris b
    WHERE b.jenis LIKE 'batal_%' AND b.payload ? 'target_trx_ids'
  ),
  target_batal_jamak AS (
    SELECT s.batal_id, (te.val)::bigint AS target_id
    FROM target_batal_jamak_src s, jsonb_array_elements_text(s.payload->'target_trx_ids') AS te(val)
    WHERE te.val ~ '^[0-9]+$'
  ),
  target_semua AS (
    SELECT batal_id, target_id FROM target_batal_tunggal
    UNION ALL
    SELECT batal_id, target_id FROM target_batal_jamak
  ),
  -- Pasangan UTUH = SELURUH target si baris batal ada di himpunan `baris`.
  pasangan_utuh AS (
    SELECT ts.batal_id
    FROM target_semua ts
    GROUP BY ts.batal_id
    HAVING bool_and(EXISTS (SELECT 1 FROM baris bb WHERE bb.id = ts.target_id))
  ),
  netral_a AS (
    SELECT batal_id AS id FROM pasangan_utuh
    UNION
    SELECT ts.target_id FROM target_semua ts JOIN pasangan_utuh pu ON pu.batal_id = ts.batal_id
  ),
  -- (b) sisi ANAK kapitalisasi: kapitalisasi_serap <-> batal_kapitalisasi TANPA
  --     target (keterbatasan payload sisi anak, lihat fetchNetSerap) ----------
  serap AS (
    SELECT b.id, b.jenis, b.periode,
           row_number() OVER (ORDER BY b.periode, b.id) AS urut,
           count(*) OVER () AS total
    FROM baris b
    WHERE b.jenis = 'kapitalisasi_serap'
       OR (b.jenis = 'batal_kapitalisasi'
           AND NOT (b.payload ? 'target_trx_id') AND NOT (b.payload ? 'target_trx_ids'))
  ),
  netral_b AS (
    SELECT s.id FROM serap s
    WHERE s.total >= 2
      AND EXISTS (SELECT 1 FROM serap x WHERE x.urut = 1 AND x.jenis = 'kapitalisasi_serap')
      AND EXISTS (SELECT 1 FROM serap y WHERE y.urut = s.total AND y.jenis = 'batal_kapitalisasi')
  )
  SELECT b.id, b.jenis, b.periode
  FROM baris b
  WHERE b.id NOT IN (SELECT id FROM netral_a UNION SELECT id FROM netral_b)
  ORDER BY b.id ASC
  LIMIT 1;
$function$;

-- Tanda tangan tak berubah, badan diganti: hitungan naif → pakai fungsi di
-- atas. Wewenang, penguncian baris (`FOR UPDATE`), pemulihan `skpd_id`, & aturan
-- "kartu balik ke pending kalau semua barisnya sudah dibatalkan" TIDAK disentuh
-- — salin persis dari 20260812_04, HANYA blok guard yang berubah.
CREATE OR REPLACE FUNCTION public.fn_batal_pengalihan_barang(p_header_id uuid, p_aset_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_h                 jurnal_header%ROWTYPE;
  v_aset              RECORD;
  v_ids               bigint[];
  v_id_terakhir       bigint;
  v_total_lebih_baru  integer;
  v_penghalang        RECORD;
  v_sisa              integer;
  v_jenis             jenis_transaksi_bmd;
  v_label             text;
BEGIN
  SELECT * INTO v_h FROM jurnal_header WHERE id = p_header_id FOR UPDATE;
  IF NOT FOUND
     OR v_h.kategori NOT IN ('pengalihan_status', 'mutasi_internal')
     OR v_h.approval_status <> 'disetujui' THEN
    RAISE EXCEPTION 'Jurnal perpindahan yang sudah disetujui tidak ditemukan.';
  END IF;

  v_jenis := v_h.kategori::jenis_transaksi_bmd;
  v_label := CASE WHEN v_h.kategori = 'mutasi_internal'
                  THEN 'mutasi internal' ELSE 'pengalihan status' END;

  IF NOT (fn_is_admin() OR fn_skpd_visible(v_h.skpd_tujuan)) THEN
    RAISE EXCEPTION 'Hanya SKPD penerima (atau admin) yang boleh membatalkan % ini.', v_label;
  END IF;

  SELECT array_agg(id ORDER BY id), max(id) INTO v_ids, v_id_terakhir
  FROM transaksi_bmd
  WHERE header_id = p_header_id AND aset_id = p_aset_id AND jenis = v_jenis;

  IF v_ids IS NULL THEN
    RAISE EXCEPTION 'Tidak ada baris perpindahan untuk barang ini di kartu tersebut.';
  END IF;

  -- Guard baku repo ini, kini MENGABAIKAN pasangan (event+pembatalannya) yang
  -- saling meniadakan — lihat kepala berkas. Pagu 500 tetap fail-closed:
  -- pasangan mana yang utuh tak bisa disimpulkan dgn aman di atas itu.
  SELECT count(*) INTO v_total_lebih_baru FROM transaksi_bmd
  WHERE aset_id = p_aset_id AND id > v_id_terakhir;
  IF v_total_lebih_baru >= 500 THEN
    RAISE EXCEPTION 'Batal dibatalkan: riwayat barang ini melebihi 500 baris sesudah % ini, pasangan pembatalan tak bisa dinilai dengan aman.', v_label;
  END IF;

  SELECT * INTO v_penghalang FROM fn_baris_penghalang_batal(p_aset_id, v_id_terakhir);
  IF v_penghalang.id IS NOT NULL THEN
    RAISE EXCEPTION 'Barang ini punya transaksi LEBIH BARU setelah % ini — "%" (%). Batalkan yang itu dulu. Transaksi yang sudah dibatalkan tidak lagi menghalangi.',
      v_label, v_penghalang.jenis, v_penghalang.periode;
  END IF;

  SELECT id, skpd_id, nilai_perolehan, nama_barang INTO v_aset
  FROM aset WHERE id = p_aset_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Barang tidak ditemukan.'; END IF;

  INSERT INTO transaksi_bmd (aset_id, jenis, periode, tanggal, nilai,
                             skpd_asal, skpd_tujuan, header_id, payload, keterangan)
  VALUES (p_aset_id, 'batal_pengalihan', fn_periode_dari_tanggal(current_date), current_date,
          COALESCE(v_aset.nilai_perolehan, 0), v_aset.skpd_id, v_h.skpd_id, p_header_id,
          jsonb_build_object('no_sk', v_h.no_sk, 'target_trx_ids', to_jsonb(v_ids),
                             'kategori', v_h.kategori),
          'Batal ' || v_label || ' — dianggap tidak pernah terjadi (' || COALESCE(v_h.no_sk, '-') || ')');

  PERFORM set_config('app.batal_pengalihan', '1', true);

  UPDATE aset SET skpd_id = v_h.skpd_id WHERE id = p_aset_id;

  SELECT count(*) INTO v_sisa
  FROM transaksi_bmd t
  WHERE t.header_id = p_header_id AND t.jenis = v_jenis
    AND NOT EXISTS (
      SELECT 1 FROM transaksi_bmd b
      WHERE b.jenis = 'batal_pengalihan' AND b.header_id = p_header_id
        AND b.payload->'target_trx_ids' @> to_jsonb(t.id)
    );
  IF v_sisa = 0 THEN
    UPDATE jurnal_header
    SET approval_status = 'pending', approved_by = NULL, approved_at = NULL
    WHERE id = p_header_id;
  END IF;
END $function$;

-- GRANT identik dgn migrasi asal — tanda tangan tak berubah, jadi baris ini
-- murni jaga-jaga (CREATE OR REPLACE tidak mencabut GRANT yang sudah ada).
GRANT EXECUTE ON FUNCTION public.fn_batal_pengalihan_barang(uuid, uuid) TO authenticated;
-- `fn_baris_penghalang_batal` SENGAJA TIDAK di-GRANT ke authenticated/anon —
-- internal-only, dipanggil dari dalam fn_batal_pengalihan_barang yang sudah
-- SECURITY DEFINER. Sejalan dgn pengetatan GRANT 20260914_03.
REVOKE ALL ON FUNCTION public.fn_baris_penghalang_batal(uuid, bigint) FROM PUBLIC;
