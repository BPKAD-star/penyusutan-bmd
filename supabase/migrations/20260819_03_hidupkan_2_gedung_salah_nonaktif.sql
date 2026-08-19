-- ============================================================================
-- Hidupkan kembali 2 gedung yang SALAH dinonaktifkan batch Import Gedung
-- 10 Juli 2026 — Rp1.997.697.349.
--
-- ⚠️ Migrasi ini MENGOREKSI KESIMPULAN 20260819_01. Baca dulu bagian ini.
--
-- -- Apa yang saya simpulkan keliru di 20260819_01 -----------------------------
-- Di sana saya menyebut nilai 169.105.349 & 1.828.592.000 sebagai "nilai barang
-- lain berkode sama" yang salah tertimpa — itu benar — lalu menyimpulkan kedua
-- barang pemilik nilai itu memang "tak ada di file", jadi penonaktifannya sah.
-- **Itu salah.** Kolom "Nama Barang" pada berkas pembanding user (2026-08-19)
-- menamai baris-baris yang tak berpasangan, dan dua di antaranya:
--     Rp   169.105.349  -> "Rehab DLH (pos jaga & Gudang TPA Sekoto)"
--     Rp 1.828.592.000  -> "Pembangunan Gedung Serbaguna Kab. Kediri"
-- Keduanya ADA di daftar user. Jadi batch 10 Juli membaca kedua baris file itu,
-- menempelkan nilainya ke aset yang SALAH (lewat pencocokan kode barang), lalu —
-- karena mengira baris file-nya sudah terpakai — menonaktifkan barang aslinya
-- sebagai "di luar Import Lengkap". Dua kesalahan dari satu sebab.
--
-- -- Akibatnya pada TOTAL, dan ini yang perlu diluruskan ----------------------
-- Untuk keempat aset yang terlibat:
--   sebelum 20260819_01 : 3.329.605.937  (benar SECARA KEBETULAN — nilainya
--                         menempel di barang yang salah, 2 barang hilang,
--                         2 duplikat mengisi tempatnya)
--   sesudah 20260819_01 : 1.331.908.588  (komposisinya benar, TAPI kurang
--                         1.997.697.349 karena 2 barang masih mati)
--   seharusnya          : 3.329.605.937  (komposisi benar DAN lengkap)
-- Jadi kalimat "lebih catat Rp1.997.697.349" di 20260819_01 KELIRU: totalnya
-- tak pernah kelebihan, yang salah sebarannya. Migrasi ini menutupnya.
--
-- -- Kenapa hanya DUA, bukan seluruh 195 yang dinonaktifkan hari itu ----------
-- Aritmetika berkas user mengunci jumlahnya. Daftar Barang Awal 1.3.3 = 6.516,
-- berkas user = 6.518, selisih nilai Rp2.974.411.049, dan hanya 6 baris yang
-- tak berpasangan:
--     KURANG di snapshot : Rehab DLH 169.105.349
--                          Gedung Serbaguna 1.828.592.000
--                          Pagar Keliling Joyoboyo 1.175.213.700  (sudah
--                          dibereskan 20260819_02)
--     LEBIH  di snapshot : PAGAR PENUTUP terhitung dua kali -198.500.000
--                          (juga sudah dibereskan 20260819_02)
--   169.105.349 + 1.828.592.000 + 1.175.213.700 - 198.500.000 = 2.974.411.049 ✓
--   +3 -1 = +2 baris ✓
-- Kalau ada penonaktifan keliru yang lain, selisihnya pasti lebih besar dari
-- ini. Jadi 193 penonaktifan sisanya memang benar.
--
-- -- Obatnya ------------------------------------------------------------------
-- 1. `fn_cek_tahun_buku`: tambahkan `batal_koreksi_pencatatan_ganda` ke
--    whitelist retroaktif. `koreksi_pencatatan_ganda` sudah ada di sana sejak
--    migrasi 23, dan pembatalannya WAJIB bisa dicatat pada tanggal yang sama —
--    kalau tidak, barangnya hidup lagi mulai 2026-S2 saja dan Laporan BMD
--    2026-S1 tetap kehilangan dia. Kelalaian yang sama polanya dgn
--    `batal_pengadaan`/`batal_penghapusan`/`batal_kapitalisasi` yang memang
--    sudah di-whitelist berpasangan dengan aslinya.
-- 2. `batal_koreksi_pencatatan_ganda` untuk kedua aset, ber-`target_trx_id`,
--    DIBACKDATE ke tanggal event yang dibatalkan (2023-05-03 & 2023-06-14)
--    supaya barangnya kembali terlihat di SEMUA periode — persis keadaannya
--    sebelum 10 Juli.
-- 3. `aset.status` kembali 'aktif'.
-- 4. Isi baris `aset_awal_2026`-nya dari ledger `saldo_awal` masing-masing
--    (#5550 & #6456, keduanya baseline e-BMD asli), bentuk SELECT disalin dari
--    20260812_03.
--
-- Kedua aset ledgernya bersih — hanya `saldo_awal` + penonaktifan keliru itu
-- (dicek: n_ledger = 2), jadi tak ada rantai event lain yang ikut terganggu.
--
-- `status` ada di klausa `UPDATE OF` milik `trg_aset_kode_register`, jadi
-- trigger ikut jalan. Aman: prefix (skpd, kode, intra/ekstra) tak berubah, jadi
-- nomor registernya bertahan — bukan terbit ulang.
--
-- Idempoten: `NOT EXISTS` per target & per NIBAR. Aman dijalankan ulang.
-- ⚠️ **Engine WAJIB di-run ulang** 2026-S1 & 2026-S2 — dua aset ini kembali
-- disusutkan, dan `penyusutan_semester` tak bergerak sendiri.
-- ============================================================================

-- -- 1. Whitelist retroaktif: pembatalan harus bisa menyusul aslinya ---------
CREATE OR REPLACE FUNCTION public.fn_cek_tahun_buku()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_tahun  int;
  v_status text;
  v_exempt boolean := false;
BEGIN
  -- Mutlak, tanpa kecuali apa pun (termasuk whitelist di bawah).
  IF NEW.tanggal > current_date THEN
    RAISE EXCEPTION 'Tanggal (%) tidak boleh di masa depan (hari ini %).', NEW.tanggal, current_date;
  END IF;

  v_tahun := EXTRACT(YEAR FROM NEW.tanggal)::int;
  SELECT status INTO v_status FROM tahun_buku WHERE tahun = v_tahun;
  IF v_status IS NULL THEN v_status := 'terkunci'; END IF; -- fail-closed: tahun tak terdaftar = terkunci

  IF v_status = 'terkunci' THEN
    -- WHITELIST koreksi/backfill retroaktif yang SUDAH ADA di aplikasi:
    -- batal_pengadaan/batal_penghapusan/batal_kapitalisasi/
    -- koreksi_pencatatan_ganda/saldo_awal SENGAJA dicatat mundur ke tanggal
    -- kejadian/cutoff asli — supaya replay engine period-correct. TAMBAHKAN
    -- di sini kalau ada jenis lain yg perlu backdate ke tahun terkunci —
    -- daftar ini BELUM final.
    --
    -- `batal_koreksi_pencatatan_ganda` ditambahkan 2026-08-19 (migrasi
    -- 20260819_03): pembatalan WAJIB bisa dicatat pada tanggal yang sama
    -- dengan event yang dibatalkannya, kalau tidak barangnya hidup lagi hanya
    -- sejak periode berjalan sementara periode-periode sebelumnya tetap
    -- kehilangan dia. Berpasangan, sama seperti tiga `batal_*` di atas.
    IF TG_TABLE_NAME = 'transaksi_bmd' AND NEW.jenis IN
      ('batal_pengadaan', 'batal_penghapusan', 'batal_kapitalisasi',
       'koreksi_pencatatan_ganda', 'batal_koreksi_pencatatan_ganda', 'saldo_awal') THEN
      v_exempt := true;
    END IF;

    IF NOT v_exempt THEN
      RAISE EXCEPTION 'Tahun % sudah tutup buku (terkunci) — tidak bisa menambah % baru di tahun ini.',
        v_tahun, CASE WHEN TG_TABLE_NAME = 'transaksi_bmd' THEN 'transaksi' ELSE 'jurnal' END;
    END IF;
  END IF;

  RETURN NEW;
END $function$;

-- -- 2. Batalkan penonaktifan yang keliru ------------------------------------
INSERT INTO transaksi_bmd (aset_id, jenis, periode, tanggal, nilai, header_id, payload, keterangan)
SELECT
  t.aset_id,
  'batal_koreksi_pencatatan_ganda',
  t.periode,          -- periode & tanggal SAMA dgn event yang dibatalkan:
  t.tanggal,          -- barang harus terlihat lagi di semua periode
  0,
  NULL,
  jsonb_build_object(
    'target_trx_id', t.id,
    'sumber',        'Batal penonaktifan keliru Import Gedung 2026-07-10 — barangnya ADA di file (migrasi 20260819_03)'
  ),
  'Batal pencatatan ganda — barang ini keliru dianggap di luar daftar; nilainya justru tertimpa ke aset lain'
FROM transaksi_bmd t
WHERE t.id IN (10091,   -- Rehab DLH (pos jaga & Gudang TPA Sekoto) — Dinas Lingkungan Hidup
               10093)   -- Pembangunan Gedung Serbaguna Kab. Kediri — Sekretariat Daerah
  AND t.jenis = 'koreksi_pencatatan_ganda'
  AND NOT EXISTS (
    SELECT 1 FROM transaksi_bmd b
    WHERE b.jenis = 'batal_koreksi_pencatatan_ganda'
      AND (b.payload->>'target_trx_id')::bigint = t.id
  );

UPDATE aset SET status = 'aktif'
WHERE id IN ('91fab3d3-5917-425a-abf2-55c580187790',
             '83f000a0-1a3c-4a3f-9702-e2039bded827')
  AND status <> 'aktif';

-- -- 3. Kembalikan baris snapshot Saldo Awal-nya ------------------------------
INSERT INTO aset_awal_2026 (
  nibar, kode, nama_barang, skpd_id, intra_ekstra, nilai_perolehan, tgl_perolehan,
  masa_manfaat_smt, akumulasi_2025, nilai_buku_awal, sisa_masa_manfaat_smt,
  beban_penyusutan_per_smt,
  spesifikasi_lainnya, merek_tipe, no_polisi, no_bpkb, no_rangka, no_mesin, luas,
  nomor_dokumen_kepemilikan, tanggal_dokumen_kepemilikan, nama_dokumen_kepemilikan,
  jenis_hak, wilayah_kode, alamat_detail, latitude, longitude, foto_paths,
  uraian_barang, keterangan, jumlah, satuan, harga_satuan, penggunaan_pengamanan,
  asal_usul, kondisi_barang, tahun_pengadaan, golongan
)
SELECT
  a.nibar, a.kode, a.nama_barang, a.skpd_id, a.intra_ekstra,
  t.nilai,                                   -- nilai BEKU akhir 2025, bukan a.nilai_perolehan
  a.tgl_perolehan,
  NULLIF(t.payload->>'masa_manfaat_smt', '')::numeric::smallint,
  COALESCE(NULLIF(t.payload->>'akumulasi_2025', '')::numeric, 0),
  COALESCE(
    NULLIF(t.payload->>'nilai_buku_awal', '')::numeric,
    t.nilai - COALESCE(NULLIF(t.payload->>'akumulasi_2025', '')::numeric, 0)
  ),
  NULLIF(t.payload->>'sisa_masa_manfaat_smt', '')::numeric::smallint,
  NULLIF(t.payload->>'beban_per_smt', '')::numeric,
  a.spesifikasi_lainnya, a.merek_tipe, a.no_polisi, a.no_bpkb, a.no_rangka, a.no_mesin, a.luas,
  a.nomor_dokumen_kepemilikan, a.tanggal_dokumen_kepemilikan, a.nama_dokumen_kepemilikan,
  a.jenis_hak, a.wilayah_kode, a.alamat_detail, a.latitude, a.longitude,
  COALESCE(a.foto_paths, '{}'),
  a.uraian_barang, a.keterangan, COALESCE(a.jumlah, 1), a.satuan, a.harga_satuan,
  a.penggunaan_pengamanan, a.asal_usul, a.kondisi_barang, a.tahun_pengadaan, a.golongan
FROM aset a
JOIN transaksi_bmd t ON t.aset_id = a.id AND t.jenis = 'saldo_awal'
WHERE a.id IN ('91fab3d3-5917-425a-abf2-55c580187790',
               '83f000a0-1a3c-4a3f-9702-e2039bded827')
  AND NOT EXISTS (SELECT 1 FROM aset_awal_2026 w WHERE w.nibar = a.nibar);

-- -- Pemeriksaan sesudah dijalankan ------------------------------------------
-- 1. Dua barangnya hidup lagi & kode registernya TIDAK terbit ulang:
--      SELECT nama_barang, status, kode_register FROM aset
--      WHERE id IN ('91fab3d3-5917-425a-abf2-55c580187790',
--                   '83f000a0-1a3c-4a3f-9702-e2039bded827');
--      -- 'aktif'; kode_register tetap ...370010000010 dan ...010010000001
-- 2. Saldo Awal -> Rekapitulasi, 1.3.3 Gedung dan Bangunan:
--      SELECT count(*), sum(nilai_perolehan) FROM aset_awal_2026
--      WHERE golongan = '1.3.3';
--      -- 6.518 dan 2.126.400.413.752,02  <- SAMA PERSIS dgn berkas Excel user
-- 3. RUN ULANG ENGINE 2026-S1 & 2026-S2, lalu:
--      SELECT count(*) FROM penyusutan_semester
--      WHERE periode = '2026-S2' AND akumulasi > nilai_perolehan + 0.5;   -- 0
-- 4. Laporan BMD 1.3.3 (2026-S1 & 2026-S2) naik Rp1.997.697.349, dan Model 3
--    TIDAK memunculkan baris mutasi baru untuk keduanya: pembatalannya
--    dibackdate ke 2023, jadi barangnya ada di Saldo Awal MAUPUN Saldo Akhir.
-- 5. Uji Konsistensi (Rekonsiliasi vs Laporan BMD) harus tetap selisih 0,00.
