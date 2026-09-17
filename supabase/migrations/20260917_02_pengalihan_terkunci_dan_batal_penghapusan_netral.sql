-- Dua perbaikan bersambungan dari pertanyaan user 2026-09-17 ("kalau rantainya
-- macem-macem — dihapus krn dijual, atau reklas lalu pindah SKPD — gimana?").
--
-- ═══════════════════════════════════════════════════════════════════════════
-- (1) `batal_penghapusan` BELUM dikenali sbg pasangan netral — kelas bug yang
--     SAMA dgn insiden BKAD 2026-08-31 & guard SQL 20260917_01, tapi utk jenis
--     penghapusan. Payload `batal_penghapusan` harfiah `{}` (CLAUDE.md,
--     "Penghapusan uji coba masih tampil di Pelaporan", 2026-09-07) — tak ada
--     `target_trx_id` yang bisa dicocokkan lewat jalur (a). Akibatnya sebelum
--     migrasi ini: barang yang DIHAPUS lalu penghapusannya DIBATALKAN (mis.
--     salah catat "dijual", lalu dibatalkan) tetap dianggap "punya transaksi
--     lebih baru" SELAMANYA — persis kejadian BKAD, cuma jenisnya beda & belum
--     ketahuan sampai ditanyakan langsung.
--
--     Ditambal identik pola (b) kapitalisasi_serap<->batal_kapitalisasi: rantai
--     penghapusan_pemindahtanganan/penghapusan_sebab_lain <-> batal_penghapusan
--     (tanpa target) di atas ambang netral kalau baris PALING AWAL berjenis
--     penghapusan & baris PALING AKHIR batal_penghapusan. Berakhir di
--     penghapusan yg BELUM dibatalkan tetap memblokir — itu perubahan keadaan
--     nyata, bukan pasangan yang saling meniadakan.
--
--     Sisi TS (lib/guardPembatalan.ts `barisMasihBerlaku`) sudah ditambal sama
--     persis di commit yang sama dgn migrasi ini — dipakai Reklasifikasi/
--     Koreksi/Kapitalisasi/Penghapusan sendiri (bukan cuma Pengalihan/Mutasi).
--
--     Diverifikasi ke PRODUKSI (transaksi + ROLLBACK): "hapus lalu batal" → 0
--     penghalang (BENAR); "hapus, batal, hapus LAGI tanpa dibatalkan" → tetap
--     terhalang (BENAR, tak jadi longgar). Nol baris tersisa sesudah rollback.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- (2) `fn_pengalihan_baris_terkunci(header_id)` — RPC BARU, batch per-KARTU.
--     Sampai migrasi ini, satu-satunya cara tahu "batal barang ini bakal
--     ditolak atau tidak" adalah MENCOBA menekan tombolnya dulu. UI Penerimaan
--     Internal / Penggunaan sekarang bisa menanyakan status SELURUH barang di
--     satu kartu SEKALI panggilan saat kartu dimuat, lalu mengganti tombol
--     🗑 Batal jadi 🔒 (dgn keterangan jenis & periode penghalangnya) utk barang
--     yg akan ditolak — operator tak perlu menebak-nebak.
--
--     ⚠️ SENGAJA per-HEADER, bukan per-halaman/per-baris: isi satu kartu
--     terbatas (puluhan barang), sementara satu halaman bisa memuat banyak
--     kartu. Membatasi cakupannya menghindari pola N-query-per-baris yang
--     sudah berkali-kali bikin timeout di repo ini (fetchOwnerOverrides,
--     fetchVoidedAsetIds, dst — lihat CLAUDE.md). Satu panggilan RPC ini
--     menjawab SEMUA barang kartu itu sekaligus lewat LATERAL JOIN.
--
--     Wewenang mengintip status ini SAMA dgn wewenang membatalkannya sendiri
--     (admin ATAU SKPD tujuan kartu) — ia SECURITY DEFINER yg menembus RLS
--     `transaksi_bmd`, jadi diperiksa eksplisit spt `fn_batal_pengalihan_barang`.
--     Header/kategori tak cocok atau tak berwenang → mengembalikan HAMPA
--     (bukan RAISE): ini query INFORMASIONAL, bukan aksi yg mengubah state.
--
--     Diverifikasi ke PRODUKSI dgn RLS AKTIF (SET LOCAL role authenticated +
--     request.jwt.claims, uid admin sungguhan — BUKAN service_role, yang akan
--     lolos gate `fn_is_admin()` walau kosong klaim JWT dan membuat pengujian
--     tanpa RLS "kelihatan benar" padahal belum diuji sungguhan): kartu tanpa
--     penghalang → `terkunci=false`; sesudah disuntik `reklas_kode` sesudahnya
--     → `terkunci=true, jenis_penghalang='reklas_kode'`. Nol baris tersisa
--     sesudah rollback.
--
--     Tanda tangan fungsi lain tak berubah → deploy-ordering bebas, tak ada
--     nilai enum baru.

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
  ),
  -- (c) penghapusan <-> batal_penghapusan TANPA target — payload harfiah `{}`,
  --     pola identik (b) (2026-09-17). Bookend pertama=penghapusan (jenis apa
  --     pun), terakhir=batal_penghapusan; kalau tidak, biarkan memblokir.
  hapus AS (
    SELECT b.id, b.jenis, b.periode,
           row_number() OVER (ORDER BY b.periode, b.id) AS urut,
           count(*) OVER () AS total
    FROM baris b
    WHERE b.jenis IN ('penghapusan_pemindahtanganan', 'penghapusan_sebab_lain')
       OR (b.jenis = 'batal_penghapusan'
           AND NOT (b.payload ? 'target_trx_id') AND NOT (b.payload ? 'target_trx_ids'))
  ),
  netral_c AS (
    SELECT h.id FROM hapus h
    WHERE h.total >= 2
      AND EXISTS (SELECT 1 FROM hapus x WHERE x.urut = 1 AND x.jenis IN ('penghapusan_pemindahtanganan', 'penghapusan_sebab_lain'))
      AND EXISTS (SELECT 1 FROM hapus y WHERE y.urut = h.total AND y.jenis = 'batal_penghapusan')
  )
  SELECT b.id, b.jenis, b.periode
  FROM baris b
  WHERE b.id NOT IN (SELECT id FROM netral_a UNION SELECT id FROM netral_b UNION SELECT id FROM netral_c)
  ORDER BY b.id ASC
  LIMIT 1;
$function$;

CREATE OR REPLACE FUNCTION public.fn_pengalihan_baris_terkunci(p_header_id uuid)
 RETURNS TABLE(aset_id uuid, terkunci boolean, jenis_penghalang text, periode_penghalang text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_h      jurnal_header%ROWTYPE;
  v_jenis  jenis_transaksi_bmd;
BEGIN
  SELECT * INTO v_h FROM jurnal_header WHERE id = p_header_id;
  IF NOT FOUND OR v_h.kategori NOT IN ('pengalihan_status', 'mutasi_internal') THEN
    RETURN;
  END IF;
  IF NOT (fn_is_admin() OR fn_skpd_visible(v_h.skpd_tujuan)) THEN
    RETURN;
  END IF;

  v_jenis := v_h.kategori::jenis_transaksi_bmd;

  RETURN QUERY
  WITH barang AS (
    SELECT t.aset_id AS a_id, max(t.id) AS id_terakhir
    FROM transaksi_bmd t
    WHERE t.header_id = p_header_id AND t.jenis = v_jenis
    GROUP BY t.aset_id
  )
  SELECT b.a_id, (pb.id IS NOT NULL), pb.jenis, pb.periode
  FROM barang b
  LEFT JOIN LATERAL fn_baris_penghalang_batal(b.a_id, b.id_terakhir) pb ON true;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.fn_pengalihan_baris_terkunci(uuid) TO authenticated;
