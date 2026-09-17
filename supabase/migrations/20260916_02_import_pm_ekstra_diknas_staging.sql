-- ============================================================================
-- Import Peralatan & Mesin EKSTRAKOMPTABEL 2025 — DINAS PENDIDIKAN (golongan
-- 1.3.2) — TAHAP 1: staging (2026-09-16).
--
-- Batch KEEMPAT dari seri "PM Ekstrakom yang ketinggalan" (20260904_01/02
-- se-kab 61 SKPD/28.502 baris → 20260905_04..06 Dinkes 22.795 baris →
-- 20260910_01/02 Disdag+Pertanian 888 baris → INI: Dinas Pendidikan).
--
-- ⚠️⚠️ SKALA JAUH LEBIH BESAR dari batch mana pun sebelumnya: **390.282 baris**
-- (vs 28.502 terbesar sebelumnya, ~14×). Sumber `PM Ekstrakom Diknas.xlsx`
-- (sheet 'PM', 390.283 baris = 1 header + 390.282 data, 40 kolom, TANPA baris
-- kosong di ekor — beda dari batch2 sebelumnya) → dibersihkan ke
-- `arsip-import/stg_import_pm_ekstra_diknas.csv` (28 kolom, ~96 MB).
--
-- ⚠️ BACA lib/import_besar_disk_supabase (memori) SEBELUM MULAI: import
-- 41.820 baris (2026-09-14, ~9× lebih kecil dari batch ini) sempat membuat
-- disk project (waktu itu 3 GB) penuh 97% & project sempat down ±30 menit.
-- Karena itu TAHAP 2 (20260916_03) BUKAN satu blok transaksional seperti
-- batch2 sebelumnya — ia dipecah jadi PROSEDUR ber-LOOP yang commit tiap
-- ±7.000 baris, WAJIB dijalankan lewat **psql**, bukan SQL Editor.
--
-- ══ SEBELUM MULAI: CEK DISK ═══════════════════════════════════════════════
--   Project Settings → Infrastructure → Disk. Total DB saat ini (2026-09-16,
--   sebelum batch ini) ≈ 2.027 MB. Perkiraan pertumbuhan tetap (aset +
--   aset_awal_2026 + transaksi_bmd, PASCA VACUUM) ≈ 1,1–1,3 GB; staging (CSV
--   96 MB) + WAL selama proses bisa menambah beberapa ratus MB lagi sementara.
--   Kalau disk provisioned masih di kisaran kecil (mis. belum naik dari
--   auto-bump 8 GB terakhir), PERTIMBANGKAN naikkan manual dulu lewat
--   Dashboard sebelum menjalankan TAHAP 2 — jangan andalkan auto-scale lagi
--   (terakhir itu bikin ~30 menit downtime).
--
-- Alur: stg_import_pm_ekstra_diknas → aset_awal_2026 → aset → transaksi_bmd
-- ('saldo_awal', periode 2025-S2, tanggal 2025-12-31 — retroaktif, sudah
-- di-whitelist `fn_cek_tahun_buku`).
--
-- ⚠️ 1.3.2 DISUSUTKAN & ekstrakomptabel IKUT disusutkan (CLAUDE.md), jadi
-- masa_manfaat_smt / akumulasi_2025 / sisa_masa_manfaat_smt / beban per
-- semester WAJIB ikut ke payload ledger — TIDAK boleh NULL (kecuali 82 baris
-- "masa 0 tahun", lihat di bawah — di situ 0 tetap eksplisit, bukan NULL).
-- Konsekuensinya ENGINE WAJIB DI-RUN ULANG (2026-S1 lalu 2026-S2) sesudah
-- TAHAP 2 — untuk batch sebesar ini, jalankan per SKPD/scope kalau menu
-- Penyusutan menyediakannya, supaya tak menabrak timeout di sisi aplikasi.
--
-- ══ HASIL ANALISIS PENUH BERKAS (390.282/390.282 baris, bukan sampel) ═════
--   1. NIBAR 100% unik (390.282 nilai), semua 45 digit, kepala SERAGAM
--      `12023506` = [12][02=ekstra][3506=Kab. Kediri].
--   2. **699 skpd_id berbeda, SEMUANYA diverifikasi ke `admin_skpd`**: (a)
--      terdaftar, (b) naik ke root `id=2` ("Dinas Pendidikan") lewat rantai
--      `parent_id` — cocok dgn 707 unit Diknas yang sudah tercatat di
--      CLAUDE.md (delapan unit sisanya kebetulan tak punya baris di batch
--      ini). id=2 sendiri (Dinas Pendidikan) juga ikut, 1 baris ("Sepeda
--      Motor", hibah 1981).
--   3. **850 kode barang berbeda — SEMUANYA terdaftar di
--      `admin_kodefikasi_bmd`** (diperiksa eksak, 0 tak terdaftar).
--   4. golongan 100% "1.3.2"; intra_ekstra 100% "Ekstra" → dilowercase
--      'ekstra' saat CSV dibuat (CHECK `saldo_awal_2026_intra_ekstra_check`
--      cuma menerima huruf kecil); kondisi_barang 100% "Baik".
--   5. **1.3.2 EKSTRAKOMPTABEL Dinas Pendidikan (707 unit turunannya) = 0
--      baris SEBELUM batch ini** (diverifikasi ke `aset`) — batch ini
--      mengisi keranjang yang benar-benar kosong, sama seperti tiga batch
--      sebelumnya. Intra 1.3.2 Diknas (132.694 baris) TIDAK disentuh.
--   6. Identitas angka UTUH sesudah pembulatan, 0 pengecualian (atas SELURUH
--      390.282 baris, bukan sampel):
--        nilai_buku_awal = nilai_perolehan − akumulasi_2025 ......... 0 beda
--        jumlah × harga_satuan = nilai_perolehan ................... 0 beda
--        akumulasi_2025 > nilai_perolehan (ALARM CLAUDE.md) ........ 0 baris
--        nilai_perolehan <= 0 ...................................... 0 baris
--        sisa_masa_manfaat_smt > masa_manfaat_smt .................. 0 baris
--        tgl_perolehan di masa depan ................................ 0 baris
--      TOTAL (2 desimal): perolehan Rp33.624.949.449,55 · akumulasi
--        Rp29.700.600.815,98 · nilai buku Rp3.924.348.633,57.
--   7. ⚠️ **82 baris "masa_manfaat_smt = 0"** (kode `1.3.2.09.02.02.011`
--      "Tongkat Kejut" — diverifikasi: `admin_kodefikasi_bmd.masa_manfaat_
--      tahun` MEMANG 0 utk kode ini, bukan galat impor). Sumbernya menulis
--      `beban_penyusutan_per_smt`/`sisa_masa_manfaat_smt` sbg `#DIV/0!`
--      (formula 0/0) — SELURUH 82 baris berakumulasi = nilai_perolehan
--      (nilai buku sudah 0), jadi 0 memang jawaban yang benar utk sisa &
--      beban ke depan, bukan "tak berlaku" (NULL, spt Tanah/ATL/KDP yang
--      sungguh tak disusutkan). CSV menuliskan `0` eksplisit utk
--      ketiganya, BUKAN kosong.
--   8. **29 baris `tahun_pengadaan` ≠ tahun dari `tgl_perolehan`** — SEMUANYA
--      "Sepeda Motor" (kode `1.3.2.02.01.04.001`) ber-`tahun_pengadaan`
--      1981/1993/1995 tapi `tgl_perolehan` 2009-12-28. Ini genuine, pola yang
--      sama dgn Dinkes (CLAUDE.md: "tahun_pengadaan di berkas = TANGGAL
--      serial Excel... utk sebagian baris Dinkes") — motor LAMA yang baru
--      dicatat/didaftarkan ulang 2009; kedua tanggal DIPERTAHANKAN apa
--      adanya, tak saling menimpa.
--   9. asal_usul: Pengadaan APBD 245.134 · Hibah 141.455 · Perolehan
--      Lainnya 3.693. Kolom BEBAS (tak ber-CHECK), dipertahankan apa adanya —
--      `cara_perolehan` sendiri diisi 'saldo_awal' di TAHAP 2 (CLAUDE.md: dua
--      kolom berbeda, sengaja TIDAK disinkronkan).
--  10. satuan: Buah 315.674 · unit 58.316 · Set 9.386 · Meter 3.448 ·
--      Eksemplar 2.519 · Pcs 639 · Biji 267 · Pasang 10 · Rol 6 · Lembar 6.
--
-- ══ DIBULATKAN KE 2 DESIMAL SAAT CSV DIBUAT ═══════════════════════════════
-- Pola SAMA dgn 20260905_04/20260910_01: `nilai_perolehan`, `akumulasi_2025`,
-- `beban_penyusutan_per_smt` dibulatkan (ROUND_HALF_UP) ke 2 desimal;
-- `nilai_buku_awal` DITURUNKAN dari kedua angka yang SUDAH dibulatkan
-- (`nilai_perolehan − akumulasi_2025`); `harga_satuan` diturunkan dari
-- `nilai_perolehan / jumlah`. Dibaca ULANG dari CSV sesudahnya: 0 baris
-- meleset, 0 kolom money berdesimal > 2.
--
-- ══ KOLOM YANG DIBUANG SAAT PEMBERSIHAN (bukan kelalaian) ═════════════════
--   · 100% KOSONG di seluruh berkas: created_at, luas, nomor/tanggal/nama_
--     dokumen_kepemilikan, jenis_hak, wilayah_kode, latitude, longitude,
--     foto_paths, pemanfaatan.
--   · alamat_detail: 1.092 dari 390.282 (0,28%) BERISI teks alamat asli
--     (bukan "-"/kosong) — TETAP DIBUANG, konsisten dgn keputusan yang sudah
--     berlaku utk SELURUH batch P&M ekstra sebelumnya (20260904/20260905/
--     20260910): "P&M itu barang BERGERAK, alamat tak bermakna". Dicatat di
--     sini supaya penyimpangan dari batch lain (yang alamatnya nyaris 100%
--     kosong) tidak disalahpahami sbg kelalaian pembersihan.
-- "-"/"~" DIJADIKAN KOSONG: kolom numerik menolak "-", kolom text menyimpan
-- tanda hubung yang lalu tampil di layar & Excel seolah data.
--
-- PRASYARAT (WAJIB, urut):
--   (a) `fn_cek_tahun_buku` sudah mem-whitelist 'saldo_awal' retroaktif
--       (sudah dipakai batch2 sebelumnya, terverifikasi ada di produksi).
--   (b) ⚠️ Import CSV **WAJIB lewat psql**, BUKAN Table Editor "Import data
--       from CSV" — 96 MB jauh di atas batch2 sebelumnya (~200 KB s.d. ~2 MB)
--       dan berisiko timeout/hang di UI dashboard:
--
--         psql "$SUPABASE_DB_URL" -c "\copy stg_import_pm_ekstra_diknas FROM 'arsip-import/stg_import_pm_ekstra_diknas.csv' WITH (FORMAT csv, HEADER true)"
--
--       (`SUPABASE_DB_URL` = connection string dari Project Settings →
--       Database → Connection string, pilih mode **Session** bukan
--       Transaction pooler — `\copy` butuh koneksi langsung.)
--   (c) Sesudah `\copy` sukses, jalankan CREATE INDEX di bawah (di LUAR
--       transaksi \copy, boleh langsung di psql yang sama) — index dibuat
--       SESUDAH load supaya load-nya sendiri tidak melambat oleh maintenance
--       index per-baris.
--   (d) Blok VERIFIKASI PRA-SYARAT di TAHAP 2 (20260916_03) menghasilkan
--       hasil aman sebelum prosedur batch dijalankan.
-- Re-runnable / idempotent (guard NOT EXISTS ada di TAHAP 2; TRUNCATE di bawah
-- aman diulang — staging bukan tabel append-only).
--
-- ⚠️ TABEL STAGING SENDIRI (bukan menumpang batch sebelumnya): asal berkas &
-- tanggal verifikasi berbeda. Kalau menumpang, verifikasi "berapa baris batch
-- ini" & rollback per-batch jadi mustahil dibedakan.
-- ============================================================================

CREATE TABLE IF NOT EXISTS stg_import_pm_ekstra_diknas (
  nibar                    text,
  kode                     text,
  nama_barang              text,
  skpd_id                  bigint,
  intra_ekstra             text,
  nilai_perolehan          numeric,
  tgl_perolehan            date,
  masa_manfaat_smt         smallint,
  akumulasi_2025           numeric,
  nilai_buku_awal          numeric,
  sisa_masa_manfaat_smt    smallint,
  beban_penyusutan_per_smt numeric,
  spesifikasi_lainnya      text,
  merek_tipe               text,
  no_polisi                text,
  no_bpkb                  text,
  no_rangka                text,
  no_mesin                 text,
  uraian_barang            text,
  keterangan               text,
  jumlah                   int,
  satuan                   text,
  harga_satuan             numeric,
  penggunaan_pengamanan    text,
  asal_usul                text,
  kondisi_barang           text,
  tahun_pengadaan          smallint,
  golongan                 text
);

-- Aman diulang (mis. kalau CSV perlu di-import ulang karena berkasnya direvisi).
TRUNCATE TABLE stg_import_pm_ekstra_diknas;

-- ── (c) Index, dibuat SESUDAH \copy (lihat prasyarat b/c di atas) ──────────
-- Dua-duanya dipakai berat oleh prasyarat & prosedur batch TAHAP 2 (join &
-- NOT EXISTS by nibar; guard skpd_id di beberapa cek pra-syarat).
--   CREATE INDEX IF NOT EXISTS idx_stg_pm_diknas_nibar ON stg_import_pm_ekstra_diknas (nibar);
--   CREATE INDEX IF NOT EXISTS idx_stg_pm_diknas_skpd  ON stg_import_pm_ekstra_diknas (skpd_id);
--   ANALYZE stg_import_pm_ekstra_diknas;

-- ── Verifikasi SESUDAH CSV diimpor (jalankan semua sebelum TAHAP 2) ────────
--   SELECT count(*) FROM stg_import_pm_ekstra_diknas;                 -- 390282
--   SELECT count(DISTINCT nibar) FROM stg_import_pm_ekstra_diknas;    -- 390282
--   SELECT left(nibar,8) AS kepala, count(*) FROM stg_import_pm_ekstra_diknas
--     GROUP BY 1;                                             -- HANYA 12023506
--   SELECT count(*) FROM stg_import_pm_ekstra_diknas WHERE length(nibar)<>45; -- 0
--   SELECT count(DISTINCT skpd_id) FROM stg_import_pm_ekstra_diknas;  -- 699
--   SELECT count(*) FROM stg_import_pm_ekstra_diknas WHERE golongan<>'1.3.2';    -- 0
--   SELECT intra_ekstra, count(*) FROM stg_import_pm_ekstra_diknas GROUP BY 1;   -- ekstra 390282
--   SELECT kondisi_barang, count(*) FROM stg_import_pm_ekstra_diknas GROUP BY 1; -- Baik 390282
--   -- baris kosong tak ikut terbawa (keempatnya HARUS 0):
--   SELECT count(*) FILTER (WHERE nibar IS NULL)   AS a,
--          count(*) FILTER (WHERE kode IS NULL)    AS b,
--          count(*) FILTER (WHERE skpd_id IS NULL) AS c,
--          count(*) FILTER (WHERE nilai_perolehan IS NULL OR nilai_perolehan <= 0) AS d
--     FROM stg_import_pm_ekstra_diknas;
--   -- identitas & presisi (kelimanya HARUS 0):
--   SELECT count(*) FILTER (WHERE nilai_buku_awal <> nilai_perolehan - akumulasi_2025) AS a,
--          count(*) FILTER (WHERE jumlah * harga_satuan <> nilai_perolehan)            AS b,
--          count(*) FILTER (WHERE akumulasi_2025 > nilai_perolehan)                    AS c,
--          count(*) FILTER (WHERE sisa_masa_manfaat_smt > masa_manfaat_smt)            AS d,
--          count(*) FILTER (WHERE scale(nilai_perolehan) > 2 OR scale(akumulasi_2025) > 2
--                              OR scale(beban_penyusutan_per_smt) > 2)                 AS e
--     FROM stg_import_pm_ekstra_diknas;
--   -- totalnya cocok dgn CSV (SUDAH dibulatkan):
--   SELECT round(sum(nilai_perolehan),2) AS perolehan,    -- 33624949449.55
--          round(sum(akumulasi_2025),2)  AS akumulasi,    -- 29700600815.98
--          round(sum(nilai_buku_awal),2) AS nilai_buku    --  3924348633.57
--     FROM stg_import_pm_ekstra_diknas;
--   -- 82 baris "masa 0 tahun" (Tongkat Kejut) — HARUS 82, dan HARUS semuanya
--   -- nilai buku 0 (fully depreciated), bukan sisa uang yang hilang:
--   SELECT count(*) FROM stg_import_pm_ekstra_diknas WHERE masa_manfaat_smt = 0; -- 82
--   SELECT count(*) FROM stg_import_pm_ekstra_diknas
--     WHERE masa_manfaat_smt = 0 AND nilai_buku_awal <> 0;                       -- 0
-- ============================================================================
