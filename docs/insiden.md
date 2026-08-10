# Register Insiden

> Satu entri per insiden: **tanggal · gejala yang DILIHAT operator · akar
> masalah · perbaikannya · test yang sekarang menjaganya.**
>
> **Peta seluruh dokumen: [../README.md](../README.md).**

**Dua gunanya:**

1. [../TESTING.md](../TESTING.md) §8 mewajibkan *"setiap bug yang diperbaiki
   meninggalkan satu test"*. Sampai register ini ada, **tidak ada cara mengecek
   janji itu ditepati.** Kolom terakhir tabel di bawah adalah alat ceknya.
2. Ini yang nanti memungkinkan [../CLAUDE.md](../CLAUDE.md) — satu-satunya
   berkas yang dimuat otomatis tiap sesi — dikurusi tanpa kehilangan apa pun.

**Aturan mengisi:**

- Kolom **gejala** ditulis dari sudut pandang orang yang melihatnya, bukan dari
  sudut pandang penyebabnya. "Nilai barang dobel di Rekonsiliasi", bukan
  "pecahan mewarisi `tgl_perolehan`". Gejala itu yang nanti dicocokkan orang
  saat keluhan serupa muncul lagi.
- **Jangan mengarang tanggal atau detail.** Yang tidak tercatat di dokumen mana
  pun ditulis **"tidak tercatat"**. Register insiden berisi karangan lebih
  buruk daripada tidak ada register — ia akan dikutip sebagai fakta.
- Entri baru **ditambahkan di akhir**, ambil nomor berikutnya. Nomor tidak
  pernah dipakai ulang.

---

## Ringkasan

| # | Tanggal | Gejala | Test penjaga |
|---|---|---|---|
| [INS-01](#ins-01) | ≤ 2026-07-04 | Barang yang sudah dihapus **muncul lagi** di Daftar Barang & Penyusutan | ⬜ butuh integrasi DB |
| [INS-02](#ins-02) | 2026-07-17/18 | Daftar Barang & Penyusutan 504 / timeout / freeze sesudah import massal | ⬜ butuh integrasi DB |
| [INS-03](#ins-03) | 2026-07-20 | GIS Tanah & Kendaraan timeout (ronde 1 — `LIKE`) | ⬜ butuh integrasi DB |
| [INS-04](#ins-04) | 2026-07-25 | *(tak sampai ke operator)* RPC period-correct tembus timeout saat diuji | ⬜ tak relevan — sudah di-drop |
| [INS-05](#ins-05) | 2026-07-27 | Halaman yang sama timeout **lagi**, hanya di SKPD besar (ronde 2) | ⬜ butuh integrasi DB |
| [INS-06](#ins-06) | 2026-07-28 | Barang yang **sudah dibatalkan muncul lagi sebagai perolehan sah** di 3 laporan | ⬜ butuh integrasi DB |
| [INS-07](#ins-07) | 2026-07-28 | Timeout yang **pindah-pindah** tiap kali ditambal | ⬜ |
| [INS-08](#ins-08) | 2026-07-28 | Daftar Barang Awal menampilkan **"0 barang"** padahal datanya ada | ⬜ butuh integrasi DB |
| [INS-09](#ins-09) | 2026-07-28 | `duplicate key aset_nibar_key` saat menyetujui ulang kontrak | ⬜ |
| [INS-10](#ins-10) | 2026-07-29 | Daftar Barang **beku "Memuat…" selamanya**, tanpa satu pun keterangan | ⬜ komponen/E2E |
| [INS-11](#ins-11) | 2026-07-29 | Rekonsiliasi BMD gagal Proses (ronde 3 — **enum**, bukan `LIKE`) | ✅ sebagian — [`lib/sinkronisasi.test.ts`](../lib/sinkronisasi.test.ts) |
| [INS-12](#ins-12) | 2026-07-29 | *(tidak tercatat sebagai keluhan)* statistik planner basi sesudah import | ⬜ |
| [INS-13](#ins-13) | 2026-07-29 | **Seluruh aplikasi mati** — 504 di mana-mana, login pun gagal | ⬜ tak bisa diuji dari TS |
| [INS-14](#ins-14) | 2026-07-29 | `Failed to fetch` lalu `25006` saat menjalankan backfill | ⬜ tak bisa diuji dari TS |
| [INS-15](#ins-15) | 2026-07-29 | Barang yang pengalihannya sudah dibatalkan **masih nongol di kartu** | ✅ sebagian — [`lib/sinkronisasi.test.ts`](../lib/sinkronisasi.test.ts) |
| [INS-16](#ins-16) | 2026-08-03 | Kolom **Nama Barang kosong ("-") di KIBAR**, padahal di layar terisi | ⬜ |
| [INS-17](#ins-17) | 2026-08-03 → 2026-08-05 | **Tidak ada** — bom waktu yang belum meledak (0 baris di produksi) | ✅ [`penyusutan.test.ts`](../lib/engine/penyusutan.test.ts) · [`bmd.test.ts`](../lib/bmd.test.ts) |
| [INS-18](#ins-18) | 2026-08-05 | Nilai barang **dobel** saat membuka periode lampau | ✅ [`visibilitas.test.ts`](../lib/visibilitas.test.ts) · [`rekon.test.ts`](../lib/rekon.test.ts) |
| [INS-19](#ins-19) | 2026-07-08 → 2026-08-06 | Nama SKPD tampil **"SKPD #12"**, dan admin pemda **kehilangan tombol Unggah** di Dokumen Sumber | ✅ [`sinkronisasi.test.ts`](../lib/sinkronisasi.test.ts) |
| [INS-20](#ins-20) | 2024 → ditemukan 2026-08-06 | **±200 barang dobel** masih tampil di Daftar Barang Awal, dan **Edit Spesifikasi tidak tersambung** untuk ±300 barang | ⬜ butuh integrasi DB |
| [INS-21](#ins-21) | 2026-08-10 | Dashboard, Saldo Awal, & Laporan BMD menampilkan **semua angka NOL** — dan untuk pengurus barang, Dashboard **tidak pernah selesai** | ⬜ butuh integrasi DB |

**Skornya hari ini: 5 dari 21 punya penjaga otomatis, dua di antaranya
sebagian.** Itu angka yang jujur, dan memang itu gunanya kolom ini ada.

---

## Rincian

### INS-01
**Barang yang sudah dihapus muncul lagi di Daftar Barang & Penyusutan**

- **Tanggal** — tidak tercatat; revertnya migrasi `20260704_19_revert_hapus_ledger.sql`.
- **Gejala** — barang yang sudah berstatus dihapus tampil kembali di Daftar
  Barang dan Penyusutan.
- **Akar** — migrasi 17/18 membuka *escape hatch* DELETE sempit di
  `transaksi_bmd` untuk fitur "Hapus Kontrak Sepenuhnya". Visibilitas barang
  **tidak** dihitung dari `aset.status`, melainkan dari replay riwayat; begitu
  baris `batal_pengadaan` — bukti "barang ini harus disembunyikan" — ikut
  terhapus, replaynya kehilangan jejak.
- **Perbaikan** — direvert. Ledger append-only jadi **mutlak** (berlaku juga
  untuk `service_role`). Data yang sudah kena dampak diperbaiki dengan insert
  ulang `batal_pengadaan`. "Buang kontrak" sekarang = arsipkan
  (`approval_status='ditolak'`). → [../rules.md](../rules.md) §1.1
- **Test** — ⬜ butuh integrasi DB (trigger `fn_transaksi_bmd_immutable`).

### INS-02
**Daftar Barang & Penyusutan 504 / timeout / freeze sesudah import massal**

- **Tanggal** — 2026-07-17 s.d. 2026-07-18 (migrasi `20260717_02`,
  `20260718_05`, `20260718_06`).
- **Gejala** — dua halaman terberat 504 / timeout / freeze sesudah import
  Peralatan & Mesin 218rb baris (total aset ±227rb).
- **Akar** — fungsi di policy RLS dipanggil **telanjang** (`fn_is_admin()`),
  jadi dievaluasi **per baris**; ditambah `kode LIKE 'gol.%'` tanpa index
  pattern.
- **Perbaikan** — semua fungsi di policy dibungkus InitPlan
  (`(SELECT fn_is_admin())`) + index `idx_aset_kode_pattern`
  (`text_pattern_ops`), **PLAIN** bukan `CONCURRENTLY`.
- **Test** — ⬜ butuh integrasi DB (`EXPLAIN` sebagai `authenticated`).

### INS-03
**GIS Tanah & Kendaraan timeout — ronde 1 dari tiga**

- **Tanggal** — 2026-07-20 (migrasi `20260720_01`).
- **Gejala** — halaman bergolongan tunggal (GIS Tanah, Kendaraan) timeout.
- **Akar** — **`kode LIKE 'gol.%'` tidak pernah bisa jadi index-cond di bawah
  RLS**: operator `~~` tidak *leakproof*, jadi Postgres selalu mengevaluasinya
  **sesudah** qual sekuriti — berapa pun index pattern yang ada.
- **Perbaikan** — menyuntik `.in('skpd_id', fn_my_skpd_scope())` di sisi kode
  supaya ada qual *leakproof* yang terindeks (`idx_aset_skpd`). Manjur
  **selama** `skpd_id IN (…)` selektif — dan asumsi itulah yang runtuh di
  [INS-05](#ins-05).
- **Test** — ⬜ butuh integrasi DB.

### INS-04
**RPC period-correct tembus statement timeout saat diuji**

- **Tanggal** — 2026-07-25 (dibuat `20260725_06`, di-drop `20260725_07`).
- **Gejala** — **tidak pernah sampai ke operator.** `EXPLAIN ANALYZE SELECT *
  FROM fn_rekap_bmd_periodik('2026-S2', NULL, 'intra')` menembus statement
  timeout saat diuji.
- **Akar** — demi period-correct, fungsi itu sengaja membuang dua filter yang
  di `fn_rekap_bmd` memangkas baris lebih awal (`status='aktif'` dan
  `skpd_id = ANY(...)`), lalu memindahkan filter scope ke query luar. Akibatnya
  CTE-nya memaparkan **seluruh** aset (±227rb) + join + replay riwayat
  **sebelum** disaring.
- **Perbaikan** — fungsi & index khususnya di-DROP; keputusan user 2026-07-25
  **tidak melanjutkan** siklus tebak-ukur. Rujukan angka periodik resmi tetap
  Rekonsiliasi BMD. Kalau nanti tetap dibutuhkan: arahnya **materialisasi**,
  bukan hitung on-the-fly saat request.
- **Test** — ⬜ tidak relevan; objeknya sudah tidak ada.

### INS-05
**Halaman yang sama timeout lagi, hanya di SKPD besar — ronde 2**

- **Tanggal** — 2026-07-27 (migrasi `20260727_03`).
- **Gejala** — timeout kembali, **hanya** untuk pengurus barang SKPD besar;
  sebagai admin dan di SKPD kecil semuanya normal.
- **Akar** — migrasi `20260720_02` mengimpor 149.846 baris ATL ke **694 SKPD
  di bawah Dinas Pendidikan**, sehingga `skpd_id IN (694 id)` mencocokkan
  ±150rb baris → **tidak selektif lagi** → tarik semua baris Diknas, saring
  `LIKE`, sortir → timeout.
- **Perbaikan** — **partial index** `idx_aset_tanah_skpd` /
  `idx_aset_angkutan_skpd`: `ON aset (skpd_id) WHERE kode LIKE '<prefix>' AND
  status='aktif'` — predikat golongan selesai **di index**, sisa `skpd_id =
  ANY(…)` jadi index-cond. Predikatnya wajib sama persis dengan qual di kode.
- **Test** — ⬜ butuh integrasi DB. Pola test-nya sudah ditulis di
  [../TESTING.md](../TESTING.md) §5.3, tinggal dijalankan.

### INS-06
**Barang yang sudah dibatalkan muncul lagi sebagai perolehan sah di 3 laporan**

- **Tanggal** — 2026-07-28 (migrasi `20260728_05`).
- **Gejala** — barang yang sudah di-`batal_pengadaan` muncul kembali sebagai
  perolehan sah di **Rekonsiliasi, Laporan BMD Model 3, dan Laporan Pengadaan
  sekaligus** — tanpa satu pun halaman menampilkan pesan error. Pesan yang
  akhirnya menyingkapnya: *"gagal membaca transaksi pembatalan
  (batal_kapitalisasi): canceling statement due to statement timeout"*.
- **Akar** — tiga cacat yang selalu berpasangan di `fetchVoidedAsetIds`
  (lib/voidedAset.ts): (1) paginasi **tanpa `ORDER BY`**; (2) `.range()`/OFFSET
  yang makin dalam makin lambat; (3) `const { data } = await` **menelan
  `error`** → `data` null → loop berhenti → fungsi mengembalikan set
  **kosong**, yang artinya justru **kebalikan** dari kenyataan ("tak ada yang
  dibatalkan"). Penyebab aslinya statement timeout — jadi filter void memang
  tak pernah jalan, bukan sekadar teori.
- **Perbaikan** — seluruh kolektor di `lib/voidedAset.ts` & `lib/rekon.ts`
  memakai `.order('id')` + **melempar**; keempat pemanggil menampilkan pesannya
  lalu **menolak menampilkan angka**. Konsekuensi index dari `.order('id')`:
  `idx_trx_jenis_id` + `idx_trx_periode_jenis_id` (`idx_trx_jenis` polos
  di-drop karena redundan). → [../rules.md](../rules.md) §2.1, §3
- **Test** — ⬜ butuh integrasi DB / test kolektor dengan klien tiruan. Contoh
  test-nya sudah ditulis di [../TESTING.md](../TESTING.md) §8, **belum
  dijalankan**.

### INS-07
**Timeout yang pindah-pindah tiap kali ditambal**

- **Tanggal** — 2026-07-28.
- **Gejala** — timeout beruntun yang berpindah sasaran tiap kali ditambal:
  `batal_kapitalisasi` → `batal_koreksi_nilai` → riwayat penghapusan.
- **Akar** — `fetchVoidedAsetIds` & `fetchNetRemoved` menarik **semua** baris
  `batal_*`/`penghapusan_*` sepanjang masa (259rb baris) padahal yang ditanya
  cuma status belasan aset di satu periode. Index & keyset hanya **menggeser
  ambangnya**; biayanya tetap tumbuh mengikuti besar ledger.
- **Perbaikan** — kirim daftar aset yang ditanya
  (`fetchVoidedAsetIds(..., asetIds)`), sehingga `jenis IN (…) AND aset_id IN
  (…)` dilayani `idx_trx_jenis_aset`. Di `computeMutasiLines` alurnya jadi dua
  tahap. → [../rules.md](../rules.md) §3.4
- **Test** — ⬜.

### INS-08
**Daftar Barang Awal menampilkan "0 barang" padahal datanya ada**

- **Tanggal** — 2026-07-28 (migrasi `20260728_02`).
- **Gejala** — halaman menampilkan **"0 barang"**, terbaca operator sebagai
  "data memang kosong".
- **Akar** — `aset_awal_2026` **kelewat dari tiga ronde perbaikan InitPlan**
  karena satu-satunya pembaca beratnya lewat RPC `SECURITY DEFINER`, sehingga
  policy-nya tak pernah kena beban. Begitu Daftar Barang Awal membaca
  **tabelnya langsung**, `fn_is_admin()`/`fn_is_viewer()` telanjang dievaluasi
  per baris atas 227rb baris → timeout. Timeoutnya lalu **ditelan diam-diam**
  oleh halaman dan tampil sebagai nol.
- **Perbaikan** — InitPlan + index `skpd_id`; halaman menampilkan pesan
  errornya. → [../rules.md](../rules.md) §4.7
- **Test** — ⬜ butuh integrasi DB.

### INS-09
**`duplicate key aset_nibar_key` saat menyetujui ulang kontrak**

- **Tanggal** — 2026-07-28 (migrasi `20260728_04`).
- **Gejala** — gagal simpan `duplicate key aset_nibar_key` saat menyetujui
  ulang kontrak yang pernah dibuka kunci.
- **Akar** — `generateNibars` (lib/nibar.ts) memakai `const { data } = await`
  tanpa `error`: query nomor urut terakhir gagal → `data` null → **nomor urut
  diam-diam mengulang dari 1**. Query-nya gagal karena `nibar LIKE '<38
  digit>%'` tidak terlayani index UNIQUE bawaan (opclass default tak bisa
  melayani `LIKE` prefix di collation non-C) → seq scan 227rb baris + `~~`
  non-*leakproof* di bawah RLS → timeout.
- **Perbaikan** — index `idx_aset_nibar_pattern` (`text_pattern_ops`) +
  `generateNibars` kini **melempar**; keempat pemanggilnya menangkap &
  menampilkan.
- **Yang menyelamatkan** — constraint UNIQUE. **Kalau kolomnya tak ber-UNIQUE,
  nomor dobel masuk diam-diam.** Gagal simpan itu **gejala**, dan jauh lebih
  murah daripada nomor dobel yang lolos. → [../rules.md](../rules.md) §1.8
- **Test** — ⬜.

### INS-10
**Daftar Barang beku "Memuat…" selamanya**

- **Tanggal** — 2026-07-29.
- **Gejala** — tombol "Memuat..." dan tabel "Memuat data..." **membeku
  selamanya**, tanpa sepatah pun keterangan.
- **Akar** — pasangan wajib yang kelewat saat kolektor diubah jadi fail-closed
  sehari sebelumnya: Daftar Barang `await fetchOwnerOverrides(...)` **tanpa
  penangkap sama sekali**, dan `setLoading(false)` ada di baris terakhir jalur
  sukses. Begitu query itu timeout, promise ditolak dan baris itu **tak pernah
  tercapai**. Akar query-nya sama persis dengan Rekonsiliasi
  ([INS-11](#ins-11)) — bedanya Rekonsiliasi punya `try/catch` jadi pesannya
  kelihatan dan langsung ketahuan.
- **Perbaikan** — seluruh badan loader di dalam `try`; `setLoading(false)` di
  **`finally`**; state error **ditampilkan**; tombol Export ikut dibungkus.
  → [../rules.md](../rules.md) §2.2, §2.3
- **Test** — ⬜ komponen/E2E. Pola test-nya ada di
  [../TESTING.md](../TESTING.md) §7.1.

### INS-11
**Rekonsiliasi BMD gagal Proses — ronde 3, enum bukan `LIKE`**

- **Tanggal** — 2026-07-29 (migrasi `20260729_01`).
- **Gejala** — Rekonsiliasi BMD gagal saat ditekan Proses: *"gagal membaca
  riwayat pengalihan/mutasi aset: statement timeout"*.
- **Akar** — **`jenis` (ENUM) juga tak bisa jadi index-cond di bawah RLS**,
  bukan cuma `LIKE`. Sesudah import ATL, `transaksi_bmd` = 418.452 baris yang
  **418.102-nya `saldo_awal`**, sementara baris pindah unit cuma **4**. Qual
  enum ditinggalkan sebagai filter biasa → yang tersisa untuk planner cuma
  `id > N ORDER BY id LIMIT 1000` → menyusuri PRIMARY KEY sambil menyaring,
  LIMIT tak pernah terpenuhi, seluruh tabel dilewati. `idx_trx_jenis_id`
  (dibuat sehari sebelumnya) **tidak menolong** — ia justru mengandalkan `jenis`
  jadi index-cond.
- **Perbaikan** — **partial index** `idx_trx_pindah_id`:
  `ON transaksi_bmd (id) WHERE jenis IN ('pengalihan_status','mutasi_internal')`
  — jenis selesai di index, sisa `id > N` + `ORDER BY id` dilayani index itu
  sendiri, biayanya ikut jumlah **perpindahan** bukan besar ledger.
- **⚠️ Pelajaran verifikasi** — `20260728_05` lolos verifikasi padahal belum
  menyelesaikan apa pun, karena `EXPLAIN`-nya dijalankan **tanpa RLS**: sebagai
  `service_role` query yang rusak ini tetap 0,2 detik.
  → [../rules.md](../rules.md) §4.3
- **Test** — ✅ **sebagian**: `lib/sinkronisasi.test.ts` mengunci `JENIS_DITARIK`
  (lib/pengalihan.ts) tetap kembar dengan predikat `idx_trx_pindah_id` yang
  dibaca langsung dari berkas migrasinya. Yang **belum** dijaga: bahwa
  planner benar-benar memakai index itu (butuh `EXPLAIN` ber-RLS).

### INS-12
**Statistik planner basi sesudah import**

- **Tanggal** — 2026-07-29 (migrasi `20260729_02`).
- **Gejala** — **tidak tercatat sebagai keluhan operator**; ditemukan saat
  menyisir sebab ronde 3.
- **Akar** — `20260728_05` dan `20260729_01` sama-sama ditutup `ANALYZE
  transaksi_bmd`, tapi **tak satu pun meng-`ANALYZE aset`** — padahal
  `20260720_02` memasukkan 149.846 baris ke tabel itu. Dengan statistik basi,
  pilihan planner untuk query Daftar Barang bergantung **murni pada tebakan
  selektivitas**, dan tebakan yang meleset berujung pola kegagalan yang sama.
- **Perbaikan** — `ANALYZE aset` / `aset_awal_2026` / `penyusutan_semester`,
  dan kebiasaan baru: **setiap migrasi import massal wajib diakhiri `ANALYZE`
  tabel yang diisi**. → [../rules.md](../rules.md) §4.4,
  [runbook-migrasi.md](runbook-migrasi.md) bagian 5
- **Test** — ⬜.

### INS-13
**Seluruh aplikasi mati — login pun gagal**

- **Tanggal** — 2026-07-29 (saat backfill kode register, migrasi
  `20260729_04`). Jam persisnya tidak tercatat.
- **Gejala** — **seluruh aplikasi mati**: 504 di middleware, tidak ada yang
  bisa masuk.
- **Akar** — backfill 418rb baris membengkakkan WAL **±700 MB** dan mendorong
  disk Supabase **54% → 96%** → project masuk mode **READ-ONLY**. Aplikasinya
  ikut mati total karena **refresh sesi auth adalah operasi tulis** — jadi
  bukan cuma menulis yang gagal, membaca pun tak bisa karena login gagal
  duluan.
- **Perbaikan** — **cek sisa disk SEBELUM menjalankan migrasi massal**, bukan
  sesudah. Sekarang jadi langkah wajib di
  [runbook-migrasi.md](runbook-migrasi.md) bagian 2.
- **Test** — ⬜ tidak bisa diuji dari TypeScript; penjaganya prosedur.

### INS-14
**`Failed to fetch` lalu `25006` saat menjalankan backfill**

- **Tanggal** — 2026-07-29 (migrasi `20260729_04`).
- **Gejala** — di Supabase SQL Editor: `Failed to fetch (api.supabase.com)`,
  lalu sesudah skripnya dirapikan, `25006: cannot execute UPDATE in a read-only
  transaction`.
- **Akar** — dua batasan **editornya**, bukan SQL-nya: (1) satu UPDATE 418rb
  baris melampaui batas waktu gateway API-nya; (2) editor menentukan mode
  baca/tulis dari **kata pertama skrip**, jadi skrip berawalan `WITH` dibuka
  READ-ONLY dan semua tulis di dalamnya ditolak — **di mana pun UPDATE-nya
  diletakkan**.
- **Perbaikan** — UPDATE >100rb baris dijalankan lewat **`psql`**, bukan SQL
  Editor. → [runbook-migrasi.md](runbook-migrasi.md) bagian 3
- **Test** — ⬜ tidak bisa diuji dari TypeScript; penjaganya prosedur.

### INS-15
**Barang yang pengalihannya sudah dibatalkan masih nongol di kartu**

- **Tanggal** — 2026-07-29 (migrasi `20260729_06` enum, `20260729_07` RPC).
- **Gejala** — fitur Batal Pengalihan **kelewat tiga ronde**, ketiganya baru
  ketemu sesudah dianggap selesai: barang yang sudah dibatalkan masih tampil di
  kartu (dan yang sering lolos: **hanya di salah satu sisi**, pengirim atau
  penerima), lalu angka modul pelaporan berbeda dengan Daftar Barang &
  Rekonsiliasi.
- **Akar** — menambah nilai enum + RPC itu bagian yang mudah; yang kelewat
  adalah **para PEMBACAnya**. Ledgernya sudah benar sejak ronde pertama —
  justru karena itu semuanya terlihat beres.
- **Perbaikan** — daftar periksa **tujuh titik** di
  [../rules.md](../rules.md) §1.7 (engine · kolektor period-aware ·
  keanggotaan kartu **dua sisi** · modul pelaporan · KIBAR · partial index ·
  penguncian baseline), plus peringatan bahwa `batal_pengalihan` memakai
  `payload.target_trx_ids` (**jamak**) — bentuk payload yang tak dikenali
  membuat filternya **tidak menyaring apa pun tanpa satu pun error**.
- **Test** — ✅ **sebagian**: `lib/sinkronisasi.test.ts` (Fase 0.4b) membaca
  nilai enum **langsung dari berkas migrasi** dan memerahkan jenis `batal_*`
  yang tak terdaftar di `VOID_JENIS`/`BATAL_TARGET_JENIS`, mewajibkan
  pengecualian bertuliskan alasan, dan menuntut tiap jenis punya label. Tiga
  titik sisanya — keanggotaan kartu dua sisi, KIBAR,
  `fn_aset_awal_2026_terkunci` ↔ `_batch` — **butuh integrasi DB**, ⬜.

### INS-16
**Kolom Nama Barang kosong ("-") di KIBAR, padahal di layar terisi**

- **Tanggal** — 2026-08-03 (migrasi `20260803_01`, backfill 11 baris).
- **Gejala** — 7 pecahan "Lapak UMKM" tampil normal di Daftar Barang tapi
  kolomnya **kosong di KIBAR yang dicetak**. Tidak ada error di mana pun.
- **Akar** — `uraian_barang` punya **dua sumber**: baku di
  `admin_kodefikasi_bmd`, dan salinan di `aset.uraian_barang` yang ditulis saat
  barang dibuat. Daftar Barang & Penyusutan **melihat ke kodefikasi**,
  sedangkan KIBAR, KIR, Kendaraan, kartu Pengadaan/Perolehan Manual,
  Reklasifikasi, & Inventarisasi **membaca kolom tersimpan**. Pintu **Koreksi →
  Pemecahan Barang** tak pernah mengisi kolom itu — jadi layar terlihat baik-baik
  saja sementara kartu cetaknya kosong.
- **Perbaikan** — dua lapis: pemecahan kini mengisi `uraian_barang` dari
  kodefikasi, **dan** KIBAR kini melihat kodefikasi lebih dulu dengan kolom
  tersimpan sebagai cadangan (supaya baris yang terlanjur dibuat ikut benar
  tanpa menunggu backfill). Aturan barunya: **setiap pintu yang MEMBUAT aset
  wajib mengisi `uraian_barang`.**
- **Test** — ⬜.

### INS-17
**Barang hasil tukar menukar tidak pernah disusutkan**

- **Tanggal** — ditemukan 2026-08-03 (Fase 0.3, saat menulis test
  `lib/bmd.ts`); ditambal 2026-08-05.
- **Gejala** — **tidak ada.** Diverifikasi ke DB produksi 2026-08-05:
  `aset.cara_perolehan='tukar_menukar'` **0 baris**, ledger `tukar_menukar`
  **0 baris**. Ini **bom waktu yang belum meledak** — nol laporan terdampak,
  nol angka yang perlu ditarik kembali.
- **Akar** — `tukar_menukar` tidak ada di daftar baseline perolehan
  `hitungJadwalAset`, padahal jenisnya sah dan benar-benar ditulis saat
  approve. Yang membuktikan ini kelalaian dan bukan kesengajaan: engine justru
  menangani `batal_tukar_menukar` sebagai event penghenti — hanya masuk akal
  kalau barangnya memang mestinya disusutkan. **Temuan yang lebih besar dari
  bugnya sendiri:** daftar "cara perolehan" ternyata hidup di **LIMA** tempat,
  dan yang bolong justru yang paling mahal.
- **Perbaikan** — engine ditambal; `JENIS_PEROLEHAN` (lib/bmd.ts) dan
  `JENIS_TRANSAKSI_LABEL` ikut. Nol angka berubah, jadi engine tak perlu
  dijalankan ulang.
- **Test** — ✅ dua test regresi di `lib/engine/penyusutan.test.ts`
  (tukar menukar menghasilkan jadwal **identik** dengan pengadaan;
  `batal_tukar_menukar` menghentikannya — cabang yang sebelumnya **tak pernah
  bisa tercapai**), pasangan `JENIS_PEROLEHAN` ↔ `CARA_PEROLEHAN_LABEL` di
  `lib/bmd.test.ts`, dan empat dari lima tempat dikunci
  `lib/sinkronisasi.test.ts`. Daftar jenis di test sengaja **ditulis ulang,
  bukan diimpor dari engine** — kalau diimpor, jenis yang lupa didaftarkan juga
  hilang dari test dan gapnya lolos lagi tanpa suara.

### INS-18
**Nilai barang dobel saat membuka periode lampau**

- **Tanggal** — 2026-08-05.
- **Gejala** — saat membuka **2026-S1**, induk (Rp167.324.933) **dan** ketujuh
  pecahannya tampil bersamaan → nilainya kehitung **dobel** di Daftar Barang
  maupun Rekonsiliasi BMD. Tanpa satu pun pesan error.
- **Akar** — pemecahan barang terjadi 27 Juli 2026 (Dinas Koperasi), yaitu di
  2026-**S2**. Pecahan hasil Pemecahan Barang sengaja **mewarisi
  `tgl_perolehan` induknya** — benar untuk penyusutan (pecahan meneruskan sisa
  umur induk), tapi membuat tanggalnya **berbohong** soal kapan barang itu ada.
  Halaman menilai "sudah ada atau belum" dari `tgl_perolehan` saja.
- **Perbaikan** — keputusan user 2026-08-05: **peristiwa berlaku sejak
  periodenya, tidak surut**. Yang otoritatif adalah periode **event
  kelahirannya** — daftar `LAHIR` di `lib/visibilitas.ts`. Sekalian, replay
  visibilitas yang selama ini **disalin di tiga tempat dan sudah menyimpang**
  disatukan ke berkas itu. → [../rules.md](../rules.md) §1.9
- **Test** — ✅ `lib/visibilitas.test.ts` (termasuk `describe('pemecahan barang
  — insiden 2026-08-05')`: induk utuh di S1, pecahan muncul di S2, tanggal
  perolehan saja tidak cukup, dan `LAHIR`/`SEMBUNYI`/`MUNCUL` tidak beririsan)
  + `lib/rekon.test.ts`.

### INS-19
**Nama SKPD tampil "SKPD #12", dan admin pemda kehilangan tombol Unggah**

- **Tanggal** — disisipkan **2026-07-08** (commit `f255217`), ditemukan &
  diperbaiki **2026-08-06**. Hidup **29 hari**.
- **Gejala** — di menu **Dokumen Sumber**: nama SKPD tidak pernah muncul, yang
  tampil `SKPD #12`; dan admin pemda tidak melihat tombol Unggah pada siklus
  yang cakupannya bukan per-SKPD. Tidak ada pesan error di mana pun.
- **Akar** — `components/dashboard/DokumenSumber.tsx` menanyai dua tabel yang
  **tidak ada**: `profiles` dan `skpd` (nama sebenarnya `admin_profiles` dan
  `admin_skpd`). Commit `f255217` *"rename tabel referensi ke prefix admin_"*
  mengganti `dokumen_siklus` → `admin_dokumen` **tiga kali di berkas yang sama**
  tapi melewatkan dua ini — penyapuan rename yang tidak tuntas. Karena keduanya
  memakai `const { data } = await` tanpa memeriksa `error`, kegagalannya
  **senyap**: `isAdmin` selalu `false`, `mySkpdId` selalu `null`, `skpdMap`
  selalu kosong. Pola yang sama persis dengan [INS-06](#ins-06).
- **Ditemukan bagaimana** — bukan oleh laporan operator, melainkan sebagai efek
  samping pengukuran Fase 0.8: begitu client Supabase diberi tipe `Database`,
  TypeScript menolak kedua nama tabel itu. Dikonfirmasi langsung ke database
  (`information_schema.tables`) sebelum diperbaiki.
- **Perbaikan** — peran dibaca lewat helper bersama `fetchApprovalScope()`
  (lib/roles.ts) alih-alih query sendiri, sehingga definisi "admin" tidak lagi
  punya salinan kedua; `from('skpd')` → `from('admin_skpd')`. Disisir juga
  seluruh repo: dari **505** pemanggilan `.from()`, berkas ini satu-satunya yang
  salah.
- **Test** — ✅ `lib/sinkronisasi.test.ts`: setiap `.from('…')` di `app/`,
  `components/`, `lib/` wajib menunjuk tabel yang ada di
  `shared/types/database.types.ts`. Diverifikasi dengan **uji mutasi** —
  mengembalikan `admin_skpd` jadi `skpd` memerahkan tepat satu test.

### INS-20
**±200 barang dobel masih tampil di Daftar Barang Awal, dan Edit Spesifikasi tidak tersambung**

- **Tanggal** — sebab-sebabnya berlangsung sejak **2024** (koreksi pencatatan
  ganda paling awal 23 April 2024); **ditemukan 2026-08-06** saat mencocokkan
  total antar-laporan sesudah tiga pemecahan. Belum diperbaiki.
- **Gejala** — dua-duanya senyap, tak ada pesan error:
  1. **Daftar Barang Awal** menampilkan ±200 barang yang di register sudah
     dikoreksi sebagai **pencatatan ganda** — jadi terlihat dobel.
  2. **Edit Spesifikasi** di halaman itu menulis ke snapshot **dan** ke
     register, dicocokkan lewat **NIBAR**. Untuk ±300 barang yang NIBAR-nya tak
     berpasangan, hanya **salah satu tabel** yang ter-update; perubahannya tidak
     sampai ke register, dan operator tidak diberi tahu apa pun.
- **Akar** — `aset_awal_2026` adalah **foto beku** yang memang tidak pernah
  disentuh transaksi (rules.md §1.5). Register sesudah itu dibersihkan:
  **200 aset** dihapus lewat `koreksi_pencatatan_ganda` (bertanggal mundur
  1928–2025, memang begitu desainnya supaya barangnya hilang dari SEMUA
  periode). Snapshot tak bisa dan tak boleh ikut berubah — jadi ia tetap
  memegang barisnya. **Ini konsekuensi definisi, bukan kode yang rusak.**

  Terpisah dari itu, **NIBAR kedua tabel berbeda untuk ratusan barang yang
  sama**. Diverifikasi dengan mencocokkan SKPD + kode barang + nilai perolehan +
  nama barang (`tgl_perolehan` sama persis di semuanya):

  | | Jumlah |
  |---|---:|
  | Hanya nomor **urut** berbeda — prefiks 38 digit identik | 33 |
  | Segmen **kode barang / SKPD / tahun** yang berbeda | 73 |
  | Benar-benar tanpa padanan apa pun | **1** |

  Yang 33: barang dientri **dua kali**, nomor urut bergeser (sampel 40 prefiks —
  **37 punya lebih banyak baris di register**, nol sebaliknya). Yang 73: kedua
  tabel membeku pada nilai atribut yang **berbeda**, jadi NIBAR-nya lahir dari
  masukan yang tidak sama.
- **Skala** — dari **309** NIBAR snapshot yang tak berpasangan: 200 terhapus
  via koreksi pencatatan ganda, 2 induk pemecahan 2026, **106 barang sama
  ber-NIBAR beda**, dan **1** benar-benar yatim (BANGUNAN GEDUNG KANTOR
  PERMANEN, UPTD Pusat Pelatihan SDM dan Kesehatan, **Rp68.220.000**, NIBAR-nya
  bahkan menyebut `02`/ekstra padahal kolomnya `intra`).

  ⚠️ **Rp157,1 miliar yang tak berpasangan itu BUKAN uang hilang** — barangnya
  ada dan ikut terhitung di register; yang tidak ada cuma tautan NIBAR-nya.
  Yang benar-benar tak tertelusuri hanya **Rp68.220.000**.
- **Yang TIDAK terdampak** — angka penyusutan, sama sekali. Engine tak pernah
  membaca `aset_awal_2026` (ia replay dari ledger). Total nilai kedua sisi juga
  cocok sampai sen: **Rp8.933.341.830.907,60**.
- **Perbaikan** — ⬜ **belum**, dan sengaja: membetulkan snapshot berarti
  menyentuh baseline beku, yang butuh keputusan user lebih dulu. Dua arah yang
  mungkin: (a) susun peta NIBAR lama↔baru lalu perbaiki `aset_awal_2026` lewat
  migrasi; (b) biarkan snapshot apa adanya tapi buat pencocokannya tidak lagi
  bergantung NIBAR tunggal.
- **Test** — ⬜ butuh integrasi DB (perbandingan dua tabel besar).

### INS-21
**Halaman rekap menampilkan semua angka NOL; untuk pengurus barang tak pernah selesai**

- **Tanggal** — dilaporkan & diperbaiki **2026-08-10**. Sebabnya sudah ada sejak
  ledger membesar (import ATL 2026-07); yang baru cuma laporannya.
- **Gejala** — tiga lapis, dan lapis pertama yang paling berbahaya:
  1. **Dashboard, Saldo Awal → Rekapitulasi, dan Laporan BMD menampilkan 0 di
     SEMUA baris**, termasuk "Total Nilai BMD 0". Tanpa pesan apa pun. Operator
     membacanya sebagai "asetnya belum diinput".
  2. Kadang muncul kadang tidak — tergantung apakah query kebetulan selesai di
     bawah batas 8 detik.
  3. Untuk **pengurus barang**, Dashboard **tidak pernah selesai sama sekali**
     (diuji: >60 detik) — padahal untuk admin 173 ms.
- **Akar** — tiga sebab terpisah yang kebetulan menumpuk:
  1. **Kegagalan ditelan.** Ketiga halaman memakai `const { data } = await
     supabase.rpc(...)` lalu `(data || [])`: query gagal → `data` null → loop
     nol kali → tabel terisi 0. Dashboard bahkan `if (!error && data)` + `catch
     {}` kosong. Keluarga INS-06/INS-08.
  2. **Agregat menyapu seluruh tabel.** Tak ada index penutup, jadi tiap klik
     membaca ~275 MB heap hanya untuk menjumlah tiga kolom.
  3. **Qual RLS per baris.** `fn_skpd_visible(skpd_id)` dan
     `fn_aset_pernah_dikelola(id)` berargumen per-baris → tak bisa diangkat
     jadi InitPlan → dievaluasi 418rb kali, dan yang kedua melakukan subquery ke
     `transaksi_bmd` sambil memanggil `fn_skpd_visible` dua kali lagi di
     dalamnya. **Untuk admin `v_is_admin` memutus di depan — itulah kenapa
     masalahnya tak pernah terlihat oleh yang menguji.**

  Ditambah satu penyebab kecil yang mahal: predikat
  `fn_periode_dari_tanggal(tgl) <= periode` tak bisa ditaksir planner → estimasi
  139.827 vs nyata 418.143 → hash kekecilan → tumpah ke disk.
- **Perbaikan** — tiga lapis, berurutan, masing-masing diukur:
  1. **Fail-closed** di ketiga halaman: banner merah, tabel menolak tampil,
     Export dimatikan. Adopsi nyata pertama `assertOk()` dari Fase 1.
  2. **Index penutup** (`idx_aset_rekap_golongan`, `idx_sa2026_rekap`,
     `idx_ps_periode_rekap`, `idx_aset_rekap_bmd`, `idx_aset_skpd_rekap`) →
     index-only scan; blok dibaca `aset` 33.665 → 2.465,
     `aset_awal_2026` 91.251 → 4.295.
  3. **Scope RLS dihitung sekali** (rules.md §4.8) + predikat tanggal estimable
     (§4.9), di `fn_dashboard_rekap`, `fn_rekap_bmd`, `fn_rekap_saldo_awal`.

  | Query | Sebelum | Sesudah |
  |---|---:|---:|
  | Dashboard, admin | 1.441 ms | 173 ms |
  | Dashboard, pengurus Diknas | **>60.000 ms** | 442 ms |
  | Saldo Awal per SKPD | 14.431 ms | 1.025 ms |
  | Laporan BMD, admin | timeout | 2.194 ms |
  | Laporan BMD, pengurus Diknas | timeout | 2.042 ms |

  **Angkanya tidak bergeser sedikit pun** — diverifikasi terhadap tangkapan
  layar sebelum perubahan (417.900 · Rp8.933.160.505.974,6) dan terhadap
  hitungan subtree Diknas yang diambil terpisah (294.967).
- **⚠️ BELUM SELESAI** — **Laporan BMD Model 3 (mutasi) masih timeout**:
  *"gagal membaca transaksi pembatalan (batal_koreksi_pencatatan_ganda)"*.
  Itu bukan RPC melainkan kolektor sisi aplikasi (`fetchBatalTargets`,
  lib/voidedAset.ts) yang menyapu SELURUH ledger tanpa discope ke `aset_id` —
  keluarga [INS-07](#ins-07) yang obatnya sudah diketahui (rules.md §3.4:
  scope-kan ke aset yang ditanya), tapi pemanggil Model 3 belum ikut discope.
- **Test** — ⬜ butuh integrasi DB. Pengecek yang paling berguna sudah ditulis
  polanya di [../TESTING.md](../TESTING.md) §5.3: `EXPLAIN` **sebagai pengurus
  barang SKPD TERBESAR**, pastikan index-nya terpakai & tak ada `Seq Scan`.

---

## Pola yang berulang

Dua puluh satu entri di atas bukan dua puluh satu masalah berbeda. Kalau
diurutkan menurut **akar**-nya, sebagian besar jatuh ke empat keluarga — dan
keluarga itu yang layak dijaga, bukan kasus per kasusnya.

| Pola | Entri | Sudah dijinakkan? |
|---|---|---|
| **Kegagalan senyap** — `error` ditelan, hasilnya terbaca sebagai kebalikan kenyataan | INS-06 · INS-08 · INS-09 · INS-19 · INS-21 | sebagian: aturannya ada ([../rules.md](../rules.md) §2), tapi masih ~160 pelanggaran tercatat. ESLint Fase 0.5 |
| **Operator non-*leakproof* di bawah RLS** (`LIKE`, lalu ENUM) | INS-02 · INS-03 · INS-05 · INS-11 · INS-12 | sebagian: partial index + `ANALYZE` jadi kebiasaan; verifikasinya belum jadi test |
| **Diuji sebagai ADMIN saja** — jalur cepat admin menyembunyikan biaya yang ditanggung semua orang lain | INS-21 | rules.md §4.5 & §4.8 sudah menuliskannya; penegaknya masih prosedur |
| **Konstanta kembar dijaga ingatan** | INS-15 · INS-17 · INS-18 | sebagian: `lib/sinkronisasi.test.ts` |
| **Penyapuan rename yang tidak tuntas** | INS-19 | ✅ `lib/sinkronisasi.test.ts` — nama tabel dicocokkan ke tipe generated |
| **Foto beku vs data hidup** — snapshot yang benar hari lahirnya lalu ditinggal kenyataan | INS-20 | ⬜ belum; butuh keputusan apakah baseline boleh diperbaiki |
| **Prosedur migrasi** | INS-13 · INS-14 | [runbook-migrasi.md](runbook-migrasi.md) |

Dua pengamatan yang berlaku untuk hampir semuanya:

- **Yang mahal bukan angka salah — yang mahal angka salah yang kelihatan
  benar.** Sebagian besar entri di atas tidak menampilkan satu pun error saat
  sedang terjadi (INS-01, INS-06, INS-08, INS-16, INS-17, INS-18, INS-19). Yang
  cepat ketahuan justru yang **berisik** (INS-10, INS-13).
- **Beberapa insiden ditemukan oleh pekerjaan yang tujuannya lain.** INS-17
  muncul saat menulis test `lib/bmd.ts`, INS-19 saat mengukur Fase 0.8. Itu
  argumen paling konkret untuk jaring pengaman: nilainya bukan cuma mencegah
  regresi baru, tapi menyingkap yang sudah lama diam.
- **Perbaikan yang meleset selalu punya bentuk yang sama:** menambal gejalanya
  (index baru, keyset baru) sementara biayanya tetap tumbuh mengikuti besar
  ledger — INS-07 dan INS-11 keduanya begitu, dan keduanya baru selesai setelah
  pertanyaannya diubah, bukan query-nya dipercepat.
