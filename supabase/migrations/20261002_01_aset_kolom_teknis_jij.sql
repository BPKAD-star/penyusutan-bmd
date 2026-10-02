-- ============================================================================
-- 20261002_01 — Kolom teknis Jalan, Jaringan & Irigasi (1.3.4) di register &
-- Saldo Awal (keputusan user 2026-10-02).
--
-- LKI Format III.A.4 sejak awal menanyakan Jenis Perkerasan Jalan, Jenis Bahan
-- Struktur Jembatan, Nomor Ruas Jalan, & Nomor Jaringan Irigasi — tapi keempatnya
-- TAK PUNYA KOLOM di `aset`. Akibatnya "Tercatat" selalu kosong dan jawaban
-- "Tidak Sesuai" (LHI III.B.8) tak bisa dikoreksi di menu mana pun, jadi menu
-- Tindak Lanjut pun tak bisa menuntaskannya.
--
-- Sesudah migrasi ini keempatnya bisa diisi lewat Edit Spesifikasi (Pengadaan/
-- Hibah dkk), Koreksi → Spesifikasi, DAN Saldo Awal → Daftar Barang Awal —
-- khusus barang JIJ (lib/asetFields.ts TEMPLATE_JIJ).
--
-- • Kolom nullable TANPA default → di Postgres 11+ ini perubahan metadata saja,
--   tak menulis ulang 900rb baris `aset`.
-- • `aset_awal_2026` memakai GRANT UPDATE PER KOLOM (20260728_01) — kolom baru
--   WAJIB didaftarkan, kalau tidak Simpan dari Saldo Awal ditolak senyap.
--   Trigger `fn_aset_awal_2026_spek_only` berupa DAFTAR KOLOM TERKUNCI (angka,
--   kode, SKPD, tanggal), jadi kolom spesifikasi baru otomatis boleh diedit.
-- • `fn_inventarisasi_snapshot` ikut membekukan keempatnya supaya LKI menampilkan
--   nilai register sbg "Tercatat". RETURNS jsonb → CREATE OR REPLACE cukup; badan
--   lain disalin dari definisi HIDUP (diperiksa 2026-10-02), cuma 4 kunci baru.
--
-- ⚠️ DEPLOY-ORDERING: WAJIB jalan SEBELUM deploy kode. Kode baru men-select
-- keempat kolom ini di Pengadaan, Hibah dkk., Koreksi, dan Saldo Awal; tanpa
-- kolomnya query kartu yang sudah disetujui GAGAL ("column does not exist").
-- ============================================================================

ALTER TABLE public.aset
  ADD COLUMN IF NOT EXISTS jenis_perkerasan     text,
  ADD COLUMN IF NOT EXISTS jenis_bahan_jembatan text,
  ADD COLUMN IF NOT EXISTS no_ruas_jalan        text,
  ADD COLUMN IF NOT EXISTS no_jaringan_irigasi  text;

ALTER TABLE public.aset_awal_2026
  ADD COLUMN IF NOT EXISTS jenis_perkerasan     text,
  ADD COLUMN IF NOT EXISTS jenis_bahan_jembatan text,
  ADD COLUMN IF NOT EXISTS no_ruas_jalan        text,
  ADD COLUMN IF NOT EXISTS no_jaringan_irigasi  text;

GRANT UPDATE (jenis_perkerasan, jenis_bahan_jembatan, no_ruas_jalan, no_jaringan_irigasi)
  ON public.aset_awal_2026 TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_inventarisasi_snapshot(p_aset_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object(
    'nibar', a.nibar, 'kode_register', a.kode_register, 'kode', a.kode,
    'uraian_barang', COALESCE(k.uraian, a.uraian_barang),
    'nama_barang', a.nama_barang, 'spesifikasi_lainnya', a.spesifikasi_lainnya,
    'merek_tipe', a.merek_tipe, 'jumlah', a.jumlah, 'satuan', a.satuan,
    'nilai_perolehan', a.nilai_perolehan, 'alamat', a.alamat_detail,
    'kondisi', a.kondisi_barang, 'tgl_perolehan', a.tgl_perolehan,
    'no_polisi', a.no_polisi, 'no_rangka', a.no_rangka, 'no_mesin', a.no_mesin,
    'no_bpkb', a.no_bpkb, 'luas', a.luas,
    'wilayah_kode', a.wilayah_kode, 'wilayah', fn_wilayah_label(a.wilayah_kode),
    'keterangan', a.keterangan, 'foto_paths', COALESCE(to_jsonb(a.foto_paths), '[]'::jsonb),
    'latitude', a.latitude, 'longitude', a.longitude,
    'jenis_perkerasan', a.jenis_perkerasan, 'jenis_bahan_jembatan', a.jenis_bahan_jembatan,
    'no_ruas_jalan', a.no_ruas_jalan, 'no_jaringan_irigasi', a.no_jaringan_irigasi,
    'skpd_id', a.skpd_id)
  FROM aset a LEFT JOIN admin_kodefikasi_bmd k ON k.kode = a.kode
  WHERE a.id = p_aset_id
$function$;
