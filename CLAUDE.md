# Penyusutan BMD — panduan untuk Claude

Aplikasi penyusutan Barang Milik Daerah (BMD) pemda. Next.js 14 App Router +
React 18 + TypeScript + Tailwind + Supabase. Scope: LIVE data pemerintah daerah,
jadi **integritas data di atas segalanya** — hati-hati dengan perubahan skema &
apa pun yang menyentuh ledger atau engine.

## Dokumen yang WAJIB diacu sebelum menulis kode

| Dokumen | Menjawab | Kapan dibaca |
|---|---|---|
| **[rules.md](rules.md)** | apa yang **tidak boleh rusak** | selalu, lebih dulu |
| **[CODING-STANDARD.md](CODING-STANDARD.md)** | **bagaimana cara menulisnya** — lapisan, struktur folder, primitif wajib (`paginate`/`assertOk`/`useAsyncData`), penamaan, checklist commit | setiap kali menulis/mengubah kode |
| **[TESTING.md](TESTING.md)** | apa yang diuji & di lapisan mana | setiap perubahan yang menyentuh angka |
| **[REFACTOR-PLAN.md](REFACTOR-PLAN.md)** | ke mana arah kode ini bergerak | saat memilih cara mengerjakan fitur |

Berkas ini (CLAUDE.md) memuat **sejarah & rincian per fitur** — kenapa sesuatu
dibuat begitu, insiden apa yang melatarinya. Ia bukan panduan gaya menulis kode;
untuk itu pakai CODING-STANDARD.md.

**Peta LENGKAP seluruh dokumen (termasuk `docs/`) ada di
[README.md](README.md)** — di sanalah satu-satunya daftar yang perlu disunting
kalau ada dokumen baru. Tabel di atas sengaja **tetap dibiarkan menduplikasi
sebagian isinya**, dan itu bukan kelalaian: CLAUDE.md satu-satunya berkas yang
dimuat OTOMATIS ke konteks agent, sedangkan README tidak. Tanpa tabel ini,
agent yang mulai dingin tidak akan pernah tahu rules.md ada. Cakupannya sengaja
dibatasi pada empat dokumen yang wajib dibaca **sebelum menulis kode** — kalau
menambah dokumen baru yang tidak masuk kategori itu, cukup daftarkan di README
saja, jangan di sini.

⚠️ Kalau kamu menulis komentar berbunyi *"ubah satu, samakan yang lain"* atau
*"jangan lupa juga ubah X"*, itu **utang desain**, bukan solusi. Catat di
REFACTOR-PLAN.md §5 — aturan yang cuma ditulis di komentar sudah berkali-kali
terbukti dilanggar di repo ini.

## PERINGKAT KERUSAKAN — apa yang paling mahal kalau rusak

Ditetapkan user 2026-08-11. Dipakai untuk memutuskan **seberapa hati-hati** suatu
perubahan digarap, apa yang wajib diuji ulang sebelum push, dan apa yang boleh
diterima sebagai risiko. Kalau sebuah perubahan menyentuh lapis 1, perlakukan
seperti menyentuh ledger: verifikasi angkanya, jangan cuma andalkan tsc hijau.

**Lapis 1 — TIDAK BOLEH RUSAK.** Ini alasan aplikasi ini ada:

1. **Laporan BMD** — semester 1, semester 2, akhir tahun, di SEMUA model.
   Nilai perolehan, beban penyusutan, akumulasi penyusutan, & nilai buku wajib
   utuh. Ini yang dilaporkan ke inspektorat/BPK.
2. **Rekonsiliasi BMD** — menjelaskan kronologi perjalanan aset. ⚠️ Cakupan yang
   diminta user cukup **level SKPD**; se-kabupaten bukan kebutuhan, jadi jangan
   mengorbankan kebenaran/keterbacaan level SKPD demi angka gabungan.
3. **Daftar Barang** — tidak boleh keliru & tidak boleh nge-bug.
4. **Penyusutan + engine-nya** — fitur utama aplikasi; engine wajib stabil &
   re-run selalu aman.
5. **KIBAR** — penelusuran segala hal yang terjadi pada satu aset.

**Lapis 2 — penting, tapi kerusakannya tidak membatalkan laporan resmi:**
RKBMD, GIS Tanah, Kendaraan, IPA, Inventarisasi, WasDal, KIR, dan menu admin.

⚠️ Konsekuensi praktis: perubahan **lintas-halaman** (tema/warna global, refactor
komponen bersama, util angka/format) berbahaya justru karena tak terlihat
menyentuh lapis 1. Sebelum menggarapnya, periksa dulu kelima modul itu.

## Aturan lintas-fitur (JANGAN dilanggar — terakhir ditambah 2026-08-05)

- **PERISTIWA BERLAKU SEJAK PERIODENYA, TIDAK SURUT** (keputusan user
  2026-08-05, berlaku untuk SEMUA bentuk koreksi). Barang yang dipecah di
  2026-S2 wajib masih UTUH kalau 2026-S1 dibuka — induknya ada, pecahannya
  belum. **Jangan menilai "sudah ada atau belum" dari `tgl_perolehan` saja:**
  pecahan hasil Pemecahan Barang sengaja MEWARISI `tgl_perolehan` induk
  (Koreksi.tsx) supaya penyusutannya meneruskan sisa umur induk, jadi
  tanggalnya berbohong soal kapan barang itu ada. Yang otoritatif = periode
  event kelahirannya (`LAHIR` di lib/visibilitas.ts, kini memuat
  `pemecahan_masuk` & `kdp_selesai_masuk`). Insiden: pemecahan 27 Juli 2026 di
  Dinas Koperasi → di 2026-S1 induk (167.324.933) DAN 7 pecahannya tampil
  bersamaan → nilai **dobel** di Daftar Barang & Rekonsiliasi BMD tanpa satu pun
  pesan error. **Pintu baru yang MEMBUAT aset dengan `tgl_perolehan` warisan/
  mundur → WAJIB daftarkan jenis ledgernya di `LAHIR`.**
  Bareng perbaikan ini, replay visibilitas (`SEMBUNYI`/`MUNCUL`/`LAHIR` +
  `fetchHiddenIds` + `belumAdaPada`) dipindah ke **lib/visibilitas.ts** —
  sebelumnya disalin di Daftar Barang, Penyusutan, & lib/rekon.ts dan sudah
  menyimpang (varian Daftar Barang beda `kdp_selesai_keluar`; versi Penyusutan
  malah menelan error query). Jangan disalin lagi ke halaman; dikunci
  lib/visibilitas.test.ts. Rincian & pengecualian yang disengaja: rules.md §1.9.

- **PERFORMA Daftar Barang & Penyusutan — JANGAN diturunkan.** Setelah import
  massal (Peralatan & Mesin 218rb, dst → total aset ~227rb), dua halaman ini
  sempat 504/timeout/freeze. Yang MENYELAMATKAN & bikin stabil (bukan sekadar
  cepat): **(1) semua fn di RLS dibungkus InitPlan** — `(SELECT fn_is_admin())`,
  `(SELECT fn_is_viewer())` — supaya dievaluasi SEKALI bukan per-baris (policy
  `aset_select`, `trx_select`, `*_viewer_select`; migrasi 20260717_02,
  20260718_05/06); **(2) index `idx_aset_kode_pattern` (text_pattern_ops)** utk
  `kode LIKE 'gol.%'` (migrasi 20260718_06, PLAIN bukan CONCURRENTLY — Supabase
  SQL Editor bungkus transaksi jadi CONCURRENTLY gagal senyap). Saat bikin fitur
  baru: **JANGAN** ubah/copot policy RLS jadi fn telanjang lagi, JANGAN drop
  index kode, JANGAN bikin query yang narik semua baris golongan ke browser
  (paginasi/agregasi di server via RPC — pola `fn_daftar_barang`,
  `fn_rekap_bmd`, `fn_dashboard_rekap`). Kalau perlu tambah policy/fn di path
  panas, bungkus InitPlan.

- **`kode LIKE 'gol.%'` TAK PERNAH bisa jadi index-cond di bawah RLS** — operator
  `~~` tidak leakproof, jadi Postgres selalu mengevaluasinya SETELAH qual RLS,
  berapa pun indeks pattern yang ada. Halaman ber-golongan-tunggal (GIS Tanah,
  Kendaraan) sudah 2x kena timeout karena ini:
  - **Ronde 1 (20260720_01)**: ditambal dgn menyuntik `.in('skpd_id',
    fn_my_skpd_scope())` di sisi kode → ada qual leakproof + terindeks
    (`idx_aset_skpd`). Manjur SELAMA `skpd_id IN (...)` selektif.
  - **Ronde 2 (20260727_03)**: begitu 20260720_02 mengimpor 149.846 baris ATL di
    **694 SKPD di bawah Dinas Pendidikan**, `skpd_id IN (694 id)` cocok ~150rb
    baris → tak selektif lagi → tarik semua baris Diknas, filter LIKE, sort →
    timeout lagi (cuma di SKPD besar; SKPD kecil & admin normal). Obatnya
    **PARTIAL INDEX** `idx_aset_tanah_skpd` / `idx_aset_angkutan_skpd`:
    `ON aset (skpd_id) WHERE kode LIKE '<prefix>' AND status='aktif'` — predikat
    golongan selesai DI INDEX, sisa `skpd_id = ANY(...)` jadi index-cond.
  **Pola untuk halaman ber-golongan-tunggal BERIKUTNYA: langsung bikin partial
  index-nya, jangan cuma andalkan scope SKPD.** ⚠️ Predikat indeks WAJIB sama
  persis dgn qual di kode (`.like()` + `.eq('status','aktif')`) — beda sedikit,
  planner tak bisa membuktikan implikasi & indeksnya diabaikan DIAM-DIAM.
  Pelajaran umum: **import massal bisa membangunkan lagi timeout yang sudah
  "beres"** — sesudah import besar, uji ulang halaman berat sbg pengurus barang
  SKPD TERBESAR, bukan cuma sbg admin.

- **`jenis` (ENUM) juga TAK BISA jadi index-cond di bawah RLS — bukan cuma
  `LIKE`.** Ronde 3 dari cerita yang sama, kena 2026-07-29 di
  `fetchOwnerOverrides` (lib/pengalihan.ts) → Rekonsiliasi BMD gagal Proses
  ("gagal membaca riwayat pengalihan/mutasi aset: statement timeout"). Duduk
  perkaranya: sesudah import ATL, `transaksi_bmd` = 418.452 baris yang
  **418.102-nya `saldo_awal`**, sementara baris pindah unit cuma **4**
  (`pengalihan_status` 4, `mutasi_internal` 0). Qual enum ditinggalkan sbg
  filter biasa → yang tersisa buat planner cuma `id > N ORDER BY id LIMIT 1000`
  → menyusuri PRIMARY KEY sambil menyaring, LIMIT tak pernah terpenuhi, seluruh
  tabel dilewati. **`idx_trx_jenis_id` (20260728_05) TIDAK menolong** untuk
  kasus ini — index itu mengandalkan `jenis` jadi index-cond, yang justru tak
  boleh. Obatnya **PARTIAL INDEX** `idx_trx_pindah_id` (migrasi 20260729_01):
  `ON transaksi_bmd (id) WHERE jenis IN ('pengalihan_status','mutasi_internal')`
  — jenis selesai di index, sisa `id > N` + `ORDER BY id` dilayani index itu
  sendiri, dan biayanya ikut jumlah PERPINDAHAN bukan besar ledger.
  ⚠️ Predikatnya KEMBAR dgn `JENIS_PINDAH` di lib/pengalihan.ts — ubah satu,
  ubah dua-duanya. Aturan umum: **kolektor yang filternya CUMA `jenis` dan
  jenisnya jarang, di ledger yang didominasi satu jenis lain, PASTI timeout.**
  Urutan obat: (1) scope-kan ke `aset_id` kalau pemanggilnya tahu asetnya (pola
  `fetchVoidedAsetIds`); (2) kalau memang tak bisa discope — cuma
  `fetchOwnerOverrides`, karena pemilik pada periode V butuh baris SESUDAH V —
  baru partial index. **Verifikasi WAJIB dgn RLS AKTIF** (`SET LOCAL role
  authenticated` + `request.jwt.claims`): sbg service_role/superuser query yg
  rusak ini tetap 0,2 dtk, jadi EXPLAIN tanpa RLS akan bilang "beres" padahal
  belum — itu yang bikin 20260728_05 lolos verifikasi.

- **Tabel yang selama ini cuma dibaca lewat RPC bisa menyimpan bom waktu RLS.**
  `aset_awal_2026` KELEWAT dari tiga ronde perbaikan InitPlan (20260716_07,
  20260717_02, 20260718_05/06) karena satu-satunya pembaca beratnya (Saldo Awal
  → Rekapitulasi) lewat `fn_rekap_saldo_awal` yang SECURITY DEFINER — policy-nya
  tak pernah kena beban. Begitu Daftar Barang Awal (2026-07-28) baca TABELNYA
  LANGSUNG, `sa_select` (`fn_is_admin()` telanjang) + `aset_awal_2026_viewer_
  select` (`fn_is_viewer()` telanjang) dievaluasi per baris atas 227rb baris →
  timeout tanpa filter SKPD. Diperbaiki migrasi **20260728_02** (InitPlan + index
  `skpd_id` kalau belum ada). **Sebelum bikin halaman yang membaca tabel besar
  LANGSUNG, cek dulu policy-nya sudah InitPlan atau belum** — jangan berasumsi
  aman cuma karena tabelnya "sudah lama dipakai". Sekalian: **JANGAN telan
  `error` dari supabase-js diam-diam di halaman daftar** — timeout jadi terbaca
  operator sebagai "0 barang / data memang kosong", dan bug-nya bisa berbulan-
  bulan tak ketahuan. Tampilkan pesannya.

- **Kolektor yang MELEMPAR tanpa `try/catch` di pemanggilnya = halaman NYANGKUT
  selamanya.** Pasangan wajib dari aturan di atas, dan sempat kelewat: sesudah
  kolektor-kolektor diubah jadi fail-closed (2026-07-28), **Daftar Barang**
  (2026-07-29) `await fetchOwnerOverrides(...)` tanpa penangkap sama sekali —
  begitu query itu timeout, promise-nya ditolak, `setLoading(false)` di baris
  terakhir TAK PERNAH tercapai → tombol "Memuat..." & tabel "Memuat data..."
  membeku SELAMANYA tanpa sepatah pun keterangan. Akar masalahnya sama persis
  dgn Rekonsiliasi (statement timeout), tapi Rekonsiliasi punya try/catch jadi
  pesannya kelihatan dan langsung ketahuan; Daftar Barang cuma terlihat "ndak
  muncul-muncul". **Setiap halaman yang memanggil kolektor fail-closed WAJIB:**
  (1) seluruh badan fungsi loader di dalam `try`; (2) `setLoading(false)` di
  `finally`, BUKAN di akhir jalur sukses; (3) state error yang DITAMPILKAN;
  (4) tombol Export ikut dibungkus — Excel setengah jadi yang terlanjur terunduh
  tak punya tanda apa pun bahwa isinya kurang. Sudah dipasang di Daftar Barang;
  **cek halaman lain yang memanggil `fetchOwnerOverrides`/`fetchVoidedAsetIds`/
  `fetchBatalTargets` sebelum menambah kolektor melempar yang baru.**

- **`const { data } = await supabase...` (tanpa `error`) di kode yang MENGHITUNG,
  bukan cuma menampilkan, itu bom waktu.** `generateNibars` (lib/nibar.ts) begitu:
  query nomor urut terakhir gagal → `data` null → nomor urut diam-diam MENGULANG
  dari 1. Sebabnya `nibar LIKE '<38 digit>%'` tak terlayani index UNIQUE bawaan
  (`aset_nibar_key`, opclass DEFAULT tak bisa melayani LIKE prefix di collation
  non-C) → seq scan 227rb baris + `~~` non-leakproof di bawah RLS → timeout.
  Diperbaiki migrasi **20260728_04** (`idx_aset_nibar_pattern` text_pattern_ops)
  + `generateNibars` kini MELEMPAR kalau lookup gagal (keempat pemanggilnya —
  Pengadaan, PerolehanManual, Koreksi pemecahan, kdp.ts — menangkap & menampilkan).
  Gejalanya dulu "duplicate key aset_nibar_key" saat approve ulang kontrak yang
  pernah dibuka kunci; yang menyelamatkan cuma constraint UNIQUE — **kalau kolomnya
  tak ber-UNIQUE, nomor dobel masuk diam-diam**. Pelajaran: kolom apa pun yang
  dicari pakai `LIKE 'prefix%'` butuh index `text_pattern_ops` sendiri, UNIQUE saja
  tidak cukup; dan generator nomor urut harus gagal KERAS, jangan jatuh ke 0.

- **JANGAN sapu seluruh ledger untuk menanyakan status segelintir aset.**
  `fetchVoidedAsetIds` & `fetchNetRemoved` dulu menarik SEMUA baris `batal_*`/
  `penghapusan_*` sepanjang masa (259rb baris) padahal yang ditanya cuma status
  belasan aset di satu periode. Hasilnya timeout beruntun 2026-07-28 yang
  "pindah-pindah" tiap ditambal (batal_kapitalisasi → batal_koreksi_nilai →
  riwayat penghapusan) — index & keyset cuma menggeser ambangnya, biayanya tetap
  tumbuh mengikuti ledger. Obatnya: **kirim daftar aset yang ditanya**
  (`fetchVoidedAsetIds(..., asetIds)`, `fetchNetRemoved(supabase, asetIds)`) →
  `jenis IN (...) AND aset_id IN (...)` dilayani `idx_trx_jenis_aset`, biaya
  tetap kecil selamanya. Di `computeMutasiLines` ini bikin alurnya DUA TAHAP:
  tarik baris periode dulu, baru tanya status aset-aset itu. Pemanggil yang
  belum terscope (LaporanPerolehan, Laporan BMD Model 3) masih pakai jalur lama
  — kalau nanti timeout, scope-kan, jangan tambah index lagi.

- **Kolektor halaman-demi-halaman WAJIB keyset (`.gt('id', terakhir)`) + urut
  `id` + cek `error`.** Tiga cacat yang selalu berpasangan di repo ini, dan
  ketiganya bikin ANGKA LAPORAN SALAH TANPA SUARA: (1) paginasi tanpa `ORDER BY` —
  Postgres tak menjamin urutan antar-halaman, begitu hasilnya >1.000 baris ada
  yang terlewat diam-diam; (2) **`.range()`/OFFSET** — makin dalam makin lambat
  (halaman ke-100 menyusuri 99.000 baris cuma untuk dibuang), jadi untuk jenis
  yang barisnya banyak SATU halaman cepat atau lambat tembus statement timeout;
  keyset biayanya rata di halaman ke berapa pun; (3) `const { data } = await` —
  query gagal → `data` null → loop berhenti → fungsi
  mengembalikan set/array KOSONG, yang artinya justru KEBALIKAN dari kenyataan.
  Terparah di `fetchVoidedAsetIds` (lib/voidedAset.ts): set kosong = "tak ada yang
  dibatalkan", jadi barang yang sudah di-`batal_pengadaan` muncul lagi sebagai
  perolehan sah di Rekonsiliasi, Laporan BMD Model 3, & Laporan Pengadaan
  sekaligus — tanpa satu pun halaman menampilkan error. Diperbaiki 2026-07-28:
  seluruh kolektor di `lib/voidedAset.ts` & `lib/rekon.ts` kini `.order('id')` +
  MELEMPAR, dan keempat pemanggilnya (Rekonsiliasi, Laporan BMD, LaporanPerolehan,
  LaporanPengadaan Model 3/Tabel) menampilkan pesannya lalu MENOLAK menampilkan
  angka. **Modul pelaporan itu fail-closed**: halaman yang error jauh lebih murah
  daripada angka kurang-sebagian yang kelihatan sah lalu ikut dilaporkan ke
  inspektorat/BPK. Penyebab aslinya ternyata **statement timeout** (pesan yang
  akhirnya muncul: `gagal membaca transaksi pembatalan (batal_kapitalisasi):
  canceling statement due to statement timeout`) — ini bukti bahwa filter void
  memang tak pernah jalan, bukan sekadar teori. **Konsekuensi index dari
  `.order('id')`:** filter + urutan harus dilayani SATU index. `transaksi_bmd`
  punya `(jenis)`, `(jenis, aset_id)`, `(jenis, tanggal)` — tak satu pun memuat
  `id`, jadi `WHERE jenis=... ORDER BY id LIMIT 1000` bikin planner menyusuri
  PRIMARY KEY urut id sambil menyaring, nyaris seluruh tabel → timeout.
  Diperbaiki migrasi **20260728_05** (`idx_trx_jenis_id`,
  `idx_trx_periode_jenis_id`; `idx_trx_jenis` polos di-drop krn redundan).
  **Nambah `.order()` di kolektor baru → pastikan ada index yang memuat kolom
  urutnya**; dan JANGAN balas timeout dengan mencabut `ORDER BY`-nya — itu
  mengembalikan bug paginasi yang senyap.

- **BATAL/reversal transaksi: BLOKIR kalau aset punya transaksi LEBIH BARU
  setelah transaksi yang mau dibatalkan.** Berlaku SEMUA jenis pembatalan
  (batal_reklas, batal_penghapusan, batal_kapitalisasi, batal_koreksi_*, dst).
  Alasan: rantai event per-aset direplay kronologis di engine — membatalkan
  event di TENGAH rantai (mis. reklas lalu ada kapitalisasi di atasnya) merusak
  state. Batal hanya sah untuk event TERBARU aset itu. Pola batal = SELALU
  transaksi baru (`batal_*`, append-only) + engine mengabaikan event yang
  dibatalkan lewat `payload.target_trx_id` (pola `kapDibatalkan` di
  lib/engine/penyusutan.ts) — BUKAN hapus baris & BUKAN reklas-balik (reklas-
  balik salah utk lintas-golongan krn fresh-start dobel).
  **Implementasi guard (client-side, cek `transaksi_bmd` aset_id sama dgn
  `id > trx_id_dibatalkan` → count>0 = blokir; TAK ADA trigger DB) kini terpasang
  di SEMUA titik pembatalan yg MENGUBAH state engine:** Reklasifikasi
  (`batalReklas`), Koreksi Nilai/Spek/Ganda (`batalKoreksi`), Batal Pemecahan
  (`handleBatalPemecahan` — cek induk + tiap pecahan), Kapitalisasi (`batal` —
  cek induk; anak terserap sudah tersembunyi jadi tak mungkin dpt trx baru),
  Penghapusan (`batalBarang`/`hapusBarang` jalur penghapusan), Unapprove Pengadaan
  (`unapproveHeader` → `batal_pengadaan`, cegah "pengalihan/pemanfaatan di depan
  pengadaan"), Unapprove Konstruksi/KDP (`unapproveKontrakKonstruksi`, cek per
  aset vs akumulasi terakhir). Utk sinkron guard butuh `trx_id` (id baris ledger
  event asli) di tiap line — Pengadaan/Penghapusan/Pemecahan menyimpannya saat
  load; Kapitalisasi pakai `j.id` (id baris kapitalisasi induk). **PENGECUALIAN
  sengaja (keputusan user 2026-07-22): Batal Pemanfaatan & Pengamanan TIDAK
  di-guard di sisi batalnya** — keduanya event NETRAL (engine `default: break`,
  keanggotaan kartu = replay kronologis baris-terakhir-menang, self-healing), jadi
  membatalkannya tak bisa merusak state. Tapi keduanya TETAP terhitung sbg
  "transaksi lebih baru" yg MEMBLOKIR batal event engine di bawahnya (guard pakai
  `.gt('id')` yg menghitung semua baris). Kalau nambah menu batal engine-affecting
  baru, WAJIB pasang guard yg sama.

- **Batal Koreksi (migrasi 20260719_04) — 3 jenis, mekanik beda:** Menu Koreksi
  (Nilai/Spesifikasi/Pencatatan Ganda) punya tombol Batal per baris (kartu
  jurnal), pola UI = Reklasifikasi (centang trx_id → hide baris dibatalkan di
  loadJurnals). Semua dicatat HARI INI (tak backdate → tak perlu whitelist
  `fn_cek_tahun_buku`). (1) `batal_koreksi_nilai`: engine mengabaikan
  koreksi_nilai target (`koreksiNilaiDibatalkan`, target_trx_id) + aset.
  nilai_perolehan balik ke nilai_lama. (2) `batal_koreksi_spesifikasi`:
  kembalikan field ke `payload.prev` — nilai LAMA yang WAJIB disimpan
  saat koreksi_spesifikasi dibuat (Koreksi.tsx fetch nilai lama sebelum update);
  null diizinkan (restore ke kosong, beda dari koreksi_spesifikasi yg cuma timpa
  non-kosong) → patch khusus di `patchAsetDari` pakai whitelist `KOREKSI_SPEK_COLS`.
  (3) `batal_koreksi_pencatatan_ganda`: barang duplikat aktif & MUNCUL lagi (pola
  batal_penghapusan) — engine `berhenti=false`, `MUNCUL` di Daftar Barang &
  Penyusutan, aset.status='aktif', DAN di-un-void di Model 3 laporan BMD
  (`fetchVoidedAsetIds` buang aset yg py batal ini dari set voided).
  ⚠️ **Deploy-ordering: migrasi 20260719_04 (ADD VALUE enum) WAJIB dijalankan
  SEBELUM deploy kode** — halaman baca (Daftar Barang/Penyusutan `MUNCUL`,
  Laporan BMD) sudah memfilter `jenis` pakai nilai enum baru; kalau enum belum
  ada, filter `.in/.eq('jenis', ...)` error → halaman rusak.

## Prinsip inti (jangan dilanggar)

- **Ledger append-only, TANPA PENGECUALIAN.** `transaksi_bmd` tidak pernah
  di-UPDATE/DELETE (dijaga trigger `fn_transaksi_bmd_immutable`) — ini prinsip
  MUTLAK, sudah pernah dicoba dilonggarkan (migrasi 17/18: escape hatch DELETE
  sempit utk "Hapus Kontrak Sepenuhnya") dan **terbukti berbahaya**: Daftar
  Barang & Penyusutan menyembunyikan barang BUKAN dengan cek `aset.status`
  langsung, tapi dgn **replay event ledger** (`SEMBUNYI` termasuk
  `batal_pengadaan`, lihat poin di bawah). Begitu baris `batal_pengadaan`
  (bukti "barang ini harus disembunyikan") ikut terhapus, replay-nya kehilangan
  jejak — barang yg sudah `status='dihapus'` MUNCUL LAGI di kedua laporan itu.
  Direvert migrasi `20260704_19_revert_hapus_ledger.sql` (+ perbaikan data yg
  sudah kena dampak: insert ulang `batal_pengadaan` utk aset yatim tanpa jejak
  ledger sama sekali). Koreksi = SELALU transaksi baru yang membalik (mis.
  `batal_penghapusan`, `batal_kapitalisasi`), tidak pernah hapus baris lama.
  **Kalau butuh "buang kontrak" tanpa nyentuh ledger**: arsipkan
  (`jurnal_header.approval_status='ditolak'`) — sudah otomatis disaring dari
  tampilan Pengadaan & dikecualikan dari cek No SK/BAST dipakai (lihat pola
  APPROVAL di bawah, fungsi `hapusKontrak` di Pengadaan.tsx). JANGAN bikin
  escape hatch DELETE lagi ke `transaksi_bmd` apapun alasannya.
- **Soft-delete.** Penghapusan barang = `aset.status='dihapus'` + transaksi, bukan
  DELETE. Tidak ada policy DELETE di `aset`.
- **Masa manfaat disimpan dalam TAHUN** di DB; konversi ×2 (ke semester) HANYA di
  engine (`lib/engine/penyusutan.ts`).
- **Periode semesteran**: `YYYY-S1` (Jan–Jun) / `YYYY-S2` (Jul–Des). Helper:
  `periodeDariTanggal` (lib/bmd.ts) & `fn_periode_dari_tanggal` (SQL).
- **penyusutan_semester = hasil engine** (turunan), bukan mirror `aset`. Engine
  event-driven replay ledger per aset.
- **Ekstrakomptabel IKUT disusutkan** (keputusan user 2026-07-13; dulu engine
  bail-out `if (ekstra) return []` — sudah dihapus). Aturan hitung sama persis
  dgn intra; pemisahan "neraca cuma intra" ada di LAPORAN (filter Komptabel,
  default 'intra' di Penyusutan & Laporan BMD). Konsekuensi: `reklas_komptabel`
  kini nol efek perhitungan — murni pindah keranjang laporan. Golongan 1.5.4
  Aset Lain-Lain BEKU (tak pernah akrual, dari mana pun asalnya — guard
  `perlakuan !== 'lain_lain'` di akrual); reklas keluar dari 1.5.4
  menghidupkan lagi. Setelah deploy perubahan ini, engine WAJIB di-run ulang
  utk periode 2026 supaya baris ekstra terisi.
- **Baseline beku**: `aset_awal_2026` (di-rename dari `saldo_awal_2026`,
  migrasi `20260710_03`) = foto saldo akhir 2025, display-only, tak pernah
  disentuh transaksi. **ANGKANYA** yang beku — sejak migrasi `20260728_01`
  (permintaan user 2026-07-28) kolom **SPESIFIKASI** boleh dikoreksi dari
  Saldo Awal → Daftar Barang Awal (centang barang → "Edit Spesifikasi", popup
  `EditSpesifikasiModal` yang sama dgn menu Koreksi). Aman krn tabel ini TIDAK
  dibaca engine sama sekali (engine replay dari ledger `saldo_awal`/
  `saldo_awal_checkpoint`) & cuma dipakai 2 halaman menu Saldo Awal. Kolom
  angka/identitas (`nilai_perolehan`, `akumulasi_2025`, `nilai_buku_awal`,
  `sisa/masa_manfaat_smt`, `beban_penyusutan_per_smt`, `jumlah`,
  `harga_satuan`, `kode`, `skpd_id`, `intra_ekstra`, `tgl_perolehan`, `nibar`)
  dikunci **dua lapis di DB**: GRANT UPDATE per-kolom + trigger
  `fn_aset_awal_2026_spek_only` (trigger di-skip kalau `current_user <>
  'authenticated'` — SQL Editor & service-role tetap bebas benerin baseline).
  **Simpan menulis ke DUA tabel**: snapshot + kolom yang sama di `aset`
  (dicocokkan NIBAR), keduanya UPDATE biasa **TANPA event ledger** — alasannya
  sama dgn KIR: spesifikasi = data deskriptif, bukan peristiwa akuntansi.
  Konsekuensi yang DITERIMA: koreksi lewat pintu ini tak punya jejak ledger &
  tak bisa di-Batal; yang butuh audit trail tetap lewat Pembukuan → Koreksi →
  Spesifikasi Barang (`koreksi_spesifikasi` + `payload.prev`).
  **PINTU INI CUMA UNTUK BARANG YANG BELUM BERGERAK** (keputusan user
  2026-07-28). Aset yang pernah kena `koreksi_spesifikasi`/
  `batal_koreksi_spesifikasi`, `reklas_kode`/`reklas_golongan`, atau
  `pengalihan_status`/`mutasi_internal` **TERKUNCI** — wajib lewat menu Koreksi.
  Bukan kehati-hatian belaka, ini menutup 2 kerusakan nyata: (a) UPDATE senyap
  menimpa nilai yang di-set `koreksi_spesifikasi` → tombol Batal-nya nanti
  me-restore ke `payload.prev` yang tak nyambung kenyataan; (b) sesudah reklas,
  kode di snapshot (golongan lama) ≠ di register (golongan baru), padahal field
  template dipilih dari kode SNAPSHOT → bisa nulis kolom golongan yang salah ke
  `aset`. ⚠️ `saldo_awal`/`saldo_awal_checkpoint` **WAJIB dikecualikan** dari
  daftar kunci: migrasi 20260702_03 bikin baris `saldo_awal` sintetis di SETIAP
  aset baseline, jadi kalau ikut dihitung fiturnya mati total di hari pertama.
  Yang sengaja TIDAK mengunci krn tak menyentuh kolom spesifikasi: pemanfaatan/
  pengamanan (kustodi), koreksi_nilai/kapitalisasi/akumulasi_kdp (murni angka),
  reklas_komptabel (keranjang laporan). **Nambah jenis ledger baru yang mengubah
  kolom spesifikasi, golongan, atau `skpd_id` → WAJIB tambahkan ke daftar kunci**
  di `fn_aset_awal_2026_terkunci` + `fn_aset_awal_2026_terkunci_batch` (dua-duanya,
  daftarnya kembar). Penegaknya trigger DB (bukan cuma UI spt guard pembatalan);
  `fn_aset_awal_2026_terkunci` SECURITY DEFINER karena kalau dievaluasi sbg
  pemanggil, RLS justru menyembunyikan baris ledger yg jadi alasan penguncian
  (aset yg sudah pindah SKPD) → guard bocor. Sengaja DIPISAH dari fungsi trigger:
  di dalam SECURITY DEFINER `current_user` berubah jadi pemilik fungsi, bikin
  pengecualian `current_user <> 'authenticated'` salah baca. UI memanggil versi
  `_batch` per halaman (50 baris) buat menampilkan 🔒 & mematikan centang.
  Field set kedua
  pintu itu sekarang SATU sumber: `koreksiFieldKeys` di lib/asetFields.ts
  (dipindah dari Koreksi.tsx) — termasuk pengecualian Tanah 1.3.1 yang dokumen
  kepemilikan/luas/lokasinya tetap milik menu GIS BMD.
  **Kolom Daftar Barang Awal = salinan kolom Daftar Barang per jenis aset**
  (`BASE_COLS` di halaman itu = `COLS` di app/dashboard/daftar-barang/page.tsx —
  ubah salah satu, samakan yang lain) — **kecuali SATU penyimpangan yang
  disengaja** (permintaan user 2026-07-30): Peralatan & Mesin (1.3.2) di Daftar
  Barang Awal membawa **No. Polisi · No. Rangka · No. Mesin · No. BPKB** sesudah
  Spesifikasi Lainnya, sementara Daftar Barang belum. Kolomnya sudah lama ada di
  `aset_awal_2026` (migrasi 20260704_20) tapi tak pernah ditampilkan. Kalau nanti
  Daftar Barang mau ikut, salin empat kunci itu ke `COLS` + `cellContent`-nya.
  **Kotak Cari-nya juga sudah lebih luas** (2026-07-30): nama barang, NIBAR,
  kode (prefix), merek/tipe, no. polisi/rangka/mesin, + **nilai perolehan**
  (`orCari`). Dua jebakan yang ditutup di situ & jangan dibuka lagi: (1) nilai
  dikutip ganda — satu koma yang diketik operator memecah sintaks `or=` di
  tengah jalan → PostgREST menolak "failed to parse logic tree" & halaman gagal
  muat, padahal nama barang e-BMD banyak yang berkoma; (2) klausa
  `nilai_perolehan.eq` cuma ikut kalau sisa ketikan (setelah titik/koma/spasi
  dibuang, jadi "686.700.000" hasil salin dari layar tetap ketemu) BENAR-BENAR
  angka — kalau teks biasa ikut dikirim ke kolom numeric, PostgREST menolak
  SELURUH filter, jadi pencarian teks pun ikut mati. Daftar Barang **belum**
  ikut diperluas (belum diminta). Disisipi kolom penyusutan baseline
  mengapit Nilai Perolehan: Masa Manfaat sebelum; Beban/Smt · Akumulasi 2025 ·
  Nilai Buku Awal · Sisa sesudah. **Jenis aset yang `disusutkan:false` di
  `GOLONGAN_REKAP` (Tanah 1.3.1, ATL 1.3.5, KDP 1.3.6) TIDAK dibuatkan kolom
  penyusutan sama sekali** — isinya cuma nol/duplikat nilai perolehan. Pakai
  flag itu, jangan hardcode daftar golongannya lagi. **Lokasi** di Daftar Barang
  Awal = `alamat_detail` + rantai `wilayah_kode` (Desa, Kec., Kabupaten —
  `admin_wilayah` ditarik sekali, provinsi dibuang), sedangkan Daftar Barang
  masih `alamat_detail` saja.
  **TANAH: `aset_bidang_tanah` MENANG atas kolom luas/lokasi level register.**
  Punya bidang → Luas = Σ bidang, Lokasi diringkas dari bidangnya (>2 wilayah
  beda → tunjuk ke GIS, jangan dipaksa muat satu baris). Belum punya bidang →
  jatuh ke kolom tabelnya sendiri (`aset_awal_2026.luas` / `aset.luas`).
  **Σ hanya sah kalau SEMUA bidang punya `luas`** (`nLuas === n`) — kalau baru
  sebagian diisi, jumlahnya lebih kecil dari luas sebenarnya & terbaca sebagai
  penyusutan luas yang tak pernah terjadi; yang belum lengkap jatuh ke kolom
  tabelnya sendiri + badge "N bidang · luas belum lengkap". Ini bukan kasus
  langka: per 2026-07-28 dari 529 bidang baru 4 yang berluas & 0 yang ber-wilayah.
  **Σ-nya DIHITUNG SAAT TAMPIL, JANGAN pernah disimpan balik ke kolom** — angka
  tersimpan langsung basi begitu bidang ditambah/diedit/dihapus (tak ada trigger/
  cron yang menjaganya, persis kendala cache `aset.pemanfaatan`), dan snapshot
  2025 tak boleh ikut bergerak mengikuti data hidup. Aturannya kembar di dua
  halaman; kalau salah satu diubah, samakan yang lain.
  Konsekuensinya `TANAH_GIS_FIELDS` dilonggarkan (keputusan user 2026-07-28,
  sore): Tanah yang **belum punya bidang sama sekali** boleh diisi `luas`,
  `wilayah_kode`, `alamat_detail`-nya dari Edit Spesifikasi
  (`TANAH_TANPA_BIDANG_FIELDS`) — kalau tidak, tanah warisan baseline e-BMD tak
  bisa diisi dari mana pun kecuali operator bikin bidang di GIS. Aturan "gak ada
  2 sumber" tetap utuh karena syaratnya itu: begitu bidang pertama dibuat, GIS
  yang berwenang & field-nya hilang lagi dari popup. Dokumen kepemilikan, jenis
  hak & koordinat TETAP milik GIS apa pun keadaannya (melekat per sertifikat).
  `koreksiFieldKeys(kode, opts)` **fail-closed**: pemanggil yang tak menghitung
  bidang (menu Koreksi) cukup tak mengisi `opts` → perilaku lama. Tampilan ikut pola Daftar
  Barang (≤3.000 baris → tampil semua, lebih → paginasi) TAPI paginasinya
  **di server** (`range` PostgREST): di sini tak ada visibilitas period-aware yg
  harus dihitung di client, jadi tak ada alasan menarik 218rb baris ke browser.
  ⚠️ **Deploy-ordering:
  migrasi 20260728_01 WAJIB jalan SEBELUM deploy kode** — tanpa policy `sa_update`
  tombol Simpan-nya gagal senyap (RLS menolak, 0 baris ter-update).
- **Baca dari tabel utama, bukan view.** Semua `v_*` (v_daftar_barang, v_dbar_*,
  v_trx_*, v_anomali_saldo_awal, dst.) SUDAH DIHAPUS. Menu register/daftar baca
  `aset` + `transaksi_bmd` (+ `skpd`, `jurnal_header`) langsung. Kunci: `aset.id`
  = `transaksi_bmd.aset_id`, dipakai untuk **visibilitas period-aware**.
  ⚠️ Daftar `LAHIR`/`SEMBUNYI`/`MUNCUL` **jangan ditulis ulang di sini** —
  sumber tunggalnya `lib/visibilitas.ts` (dikunci `lib/visibilitas.test.ts`);
  ringkasan maksud tiap kelompok ada di [schema.md](schema.md) §2. Yang perlu
  diingat: replay diurutkan by **id ledger** — BUKAN dikelompokkan
  sembunyi-dulu-baru-muncul — supaya siklus hapus→batal→hapus lagi dalam
  periode yang sama tetap ikut aksi TERAKHIR. Jangan buat/andalkan view lagi
  tanpa alasan kuat — dulu Daftar Barang pakai `v_daftar_barang` yang `id`-nya BUKAN
  aset.id → filter sembunyi tak nyambung (barang dihapus tetap kehitung). Turunan
  yang dulu dari view direplikasi: golongan dari `kode` (`like 'x.%'`), nama SKPD
  dari `skpd`, jejak penghapusan dari ledger+`jurnal_header`.

## Tahun Buku (kunci tahun akuntansi, migrasi 23)

Tabel kontrol `tahun_buku` (tahun, status terbuka/terkunci) + log append-only
`tahun_buku_log`. **Model data TETAP satu ledger kontinu** — `transaksi_bmd`/
`aset` TIDAK dipecah per tahun, tidak ada `saldo_awal_2027` dst sebagai tabel
baru. Ini murni tabel kontrol yang dibaca trigger, sama pola dengan
`fn_jurnal_header_guard` (kunci semester) — cuma naik level ke tahun.

- **Dua guard mutlak** (`fn_cek_tahun_buku`, trigger BEFORE INSERT di
  `transaksi_bmd` DAN `jurnal_header`): (1) tanggal **tidak boleh** di masa
  depan (`> current_date`), TANPA KECUALI APA PUN; (2) tanggal **tidak boleh**
  jatuh di tahun `terkunci` — KECUALI whitelist jenis retroaktif di bawah.
- **Tahun yang belum terdaftar di `tahun_buku` = default TERKUNCI** (fail-closed,
  bukan fail-open) — lebih aman. Makanya migrasi 23 WAJIB langsung seed baris
  tahun berjalan saat itu (2025=terkunci baseline, 2026=terbuka), supaya kerja
  normal tidak mendadak terblokir begitu migrasi di-deploy. **Tahun baru HARUS
  di-seed manual (INSERT status terbuka) sebelum tanggal masuk ke tahun itu** —
  ini nanti jadi bagian dari aksi "Tutup Tahun" (belum dibangun, lihat di bawah).
- **Whitelist retroaktif** (di `fn_cek_tahun_buku`, cuma utk `transaksi_bmd`):
  `batal_pengadaan`, `batal_penghapusan`, `batal_kapitalisasi` — tiga ini SUDAH
  sengaja dicatat mundur ke tanggal kejadian asli (lihat `lib/transaksi.ts`,
  `Kapitalisasi.tsx`, `Penghapusan.tsx`) supaya replay engine period-correct.
  **Daftar ini BELUM tentu final** — kalau nambah jenis baru yang perlu backdate
  ke tahun terkunci, tambahkan di sini, jangan bikin bypass umum.
  `pengalihan_status` **TIDAK** masuk whitelist ini — lihat poin
  `fn_terima_pengalihan` di bawah, itu ditutup dengan cara lain.
- **`fn_terima_pengalihan` pakai tanggal HARI INI, bukan tanggal dokumen**
  (migrasi 24, keputusan user 2026-07-07): pengalihan dianggap resmi terjadi
  pada tanggal SKPD tujuan klik Terima — persis pola `fn_kembalikan_pengalihan_
  barang` (migrasi 22), BUKAN pola Pengadaan (yg pakai tanggal BAST/dokumen
  walau di-approve belakangan). Ini SENGAJA beda dari pola Pengadaan supaya gap
  tahun-terkunci tertutup total (hari ini selalu di tahun terbuka, tak pernah
  butuh whitelist). Konsekuensi yg diterima: kalau approval telat berbulan-
  bulan, atribusi SKPD di `lib/pengalihan.ts` baru pindah pas tanggal Terima,
  bukan tanggal dokumen sumber. Tanggal dokumen asli tetap disimpan di
  `payload.tgl_dokumen_sumber` utk jejak audit.
- **Opsi B (checkpoint) — SUDAH DIBANGUN (migrasi 25).** Jenis ledger baru
  `saldo_awal_checkpoint` (BEDA dari `saldo_awal` yg khusus baseline impor
  e-BMD 2025 asli — bukan tabel `saldo_awal_20XX` baru, itu anti-pattern sama
  seperti tabel per-semester yg sudah ditolak). Payload REUSE persis struktur
  `saldo_awal` lama (`nilai_buku_awal`, `akumulasi_2025`, `sisa_masa_manfaat_smt`,
  `masa_manfaat_smt`, `beban_per_smt`) — disalin LANGSUNG dari
  `penyusutan_semester` periode S2 tahun yg ditutup (sudah final, tidak
  dihitung ulang).
  - `hitungJadwalAset` (lib/engine/penyusutan.ts) sekarang cari checkpoint
    TERBARU di antara `saldo_awal`/`saldo_awal_checkpoint` (bukan `.find()`
    ambil yg pertama lagi) dan `mulaiSetelah` dibaca dari periode baris itu
    sendiri (bukan konstanta `PERIODE_BASELINE` hardcoded) — replay tahun
    berikutnya mulai dari checkpoint, bukan dari 2025 lagi. Perubahan ini
    backward-compatible: utk aset yg belum pernah di-checkpoint (cuma py
    `saldo_awal` asli), hasilnya identik dgn sebelumnya.
  - **RPC `fn_tutup_tahun(p_tahun, p_catatan)`** (admin only, atomik):
    validasi tahun `terbuka` + SUDAH benar² berakhir (31 Des tahun itu <=
    hari ini — guard no-forward-date migrasi 23 otomatis menolak kalau belum,
    fungsi ini kasih pesan lebih jelas) → **BLOKIR TOTAL** kalau masih ada
    `jurnal_header` `approval_status='pending'` bertanggal di tahun itu
    (keputusan user 2026-07-07: blokir, bukan sekadar warning — supaya tidak
    ada barang "menggantung" yg later masuk ledger dgn tanggal tahun yg
    katanya sudah final) → checkpoint massal (`INSERT...SELECT` dari
    `penyusutan_semester`, cuma aset `status='aktif'`) → kunci tahun ini +
    buka tahun berikutnya (`tahun_buku`) → catat `tahun_buku_log`.
  - **RPC `fn_preview_tutup_tahun(p_tahun)`**: list jurnal pending (dipakai UI
    [app/dashboard/admin/tutup-tahun/page.tsx](app/dashboard/admin/tutup-tahun/page.tsx)
    sebelum admin coba menutup, biar bukan cuma exception mentah).
- Data referensi (`admin_kodefikasi_bmd`, `admin_overhaul_band`, `skpd`, dll) **satu kopi
  dibagi lintas tahun** (bukan per tahun) — TAPI editnya bisa ripple ke angka
  tahun lampau kalau engine di-run ulang tanpa proteksi.
- **`/api/engine/run` sudah dilindungi (migrasi tidak perlu, ini di kode API)**:
  (1) tolak total kalau tahun dari periode TARGET terkunci; (2) `hitungJadwalAset`
  selalu replay dari baseline sampai target — jadi walau target-nya tahun
  terbuka, replay bisa MELINTASI tahun terkunci di tengah (mis. run 2027 setelah
  2026 ditutup). Baris hasil utk periode di tahun terkunci di-FILTER SEBELUM
  upsert (`rowsDitulis`), jadi tetap dihitung di memori tapi TIDAK menimpa
  baris tersimpan tahun terkunci. Respons API sertakan
  `rows_dilindungi_tahun_terkunci` biar admin tahu kalau ada yg dilindungi.

**UI (selesai — badge + banner, BUKAN context global):**
- `components/useTahunBuku.ts` — `useDateBounds()` (min/max utk `<input
  type="date">` yg mengisi TANGGAL LEDGER, JANGAN dipakai utk field atribut/
  dokumen historis) & `useTahunBukuMap()` (map tahun→status).
- `components/TahunKerjaBadge.tsx` — badge "Tahun Kerja {tahun}" di TopBar,
  ambil MAX tahun berstatus terbuka.
- `components/TahunTerkunciNote.tsx` — banner info (bukan larangan — laporan
  tahun terkunci itu justru angka final/teraudit) di halaman yg punya
  pemilih tahun/semester: Daftar Barang, Penyusutan (juga dekat tombol
  "Jalankan Engine" — tombolnya sendiri SUDAH diblokir server-side, lihat poin di
  atas), Rekapitulasi Saldo Akhir.
- **BUKAN context global** — tiap halaman tetap kelola filter tahun/semester
  sendiri-sendiri seperti sebelumnya (keputusan sengaja, biar tidak refactor
  besar ~15 halaman sekaligus).
- **Pemilih "Tahun Kerja" di halaman login** (`app/login/page.tsx`, migrasi 26
  buka RLS `tahun_buku` utk `anon` — tak ada data sensitif di situ, cuma
  tahun/status/catatan admin): pilihan disimpan di `localStorage`
  (`lib/tahunKerja.ts`, key `bmd_tahun_kerja_pilihan`), dipakai sbg
  **DEFAULT AWAL** (`useState(() => tahunAwal(...))`) di 3 halaman yg py
  pemilih tahun: Daftar Barang, Penyusutan, Rekapitulasi Saldo Akhir.
  **BUKAN gerbang keamanan** — user tetap bebas ganti tahun apa pun di tiap
  halaman kapan saja, dan tetap bisa lihat tahun terkunci (memang gunanya).
  Penegak sesungguhnya tetap `tahun_buku` + trigger di server, terpisah total
  dari preferensi UI ini.

## Pengalihan Status Penggunaan (transfer antar SKPD, migrasi 21 + 22)

Jenis ketiga di menu Penghapusan (sisi KELUAR) + persetujuan SKPD tujuan di menu
Penggunaan (sisi MASUK, `PenggunaanMasuk.tsx`). Gabungan dua pola yang sudah ada:
kartu ber-SK (`jurnal_header` kategori `pengalihan_status`, WAJIB `skpd_tujuan`
level SKPD induk — combobox `rootOnly`) + draft-approve (barang di
`payload.draft_items`, `approval_status='pending'`; ledger & `aset` TIDAK
disentuh sampai SKPD tujuan menerima). Poin penting:

- **SATU PINTU (migrasi 22).** Begitu SKPD tujuan MENERIMA, SKPD asal (pengirim)
  TIDAK bisa apa-apa lagi — kartunya read-only. Yang berwenang memulangkan
  barang HANYA SKPD PENERIMA (+ admin).
- **AKSI "KEMBALIKAN" SUDAH DICABUT** (keputusan user 2026-08-12, migrasi
  20260812_04 utk mutasi internal & 20260812_05 utk pengalihan). Seluruh modul
  PERPINDAHAN barang kini punya satu aksi saja: **Batal**. Alasannya:
  pengembalian yang SUNGGUHAN selalu punya dokumennya sendiri, jadi bentuk yang
  benar adalah kartu BARU ke arah sebaliknya — baris reversal yang digantungkan
  pada kartu lama menempelkan peristiwa periode BERJALAN pada dokumen bertanggal
  periode lampau, ketidakcocokan yang sama yang diperbaiki 20260811_02. Dua
  tombol yang sama-sama memulangkan barang tapi berlawanan arti juga terbukti
  mengundang salah pencet. Rinciannya di rules.md §1.6.
  ⚠️ **Yang dicabut PEMBUATNYA, bukan PEMBACANYA.** 2 baris `payload.reversal`
  terlanjur ada di ledger pengalihan (id 9658 & 9679, Juli 2026) dan ledger itu
  append-only, jadi `payload.reversal` WAJIB tetap dibaca `lib/pengalihan.ts`
  (`ownersAt` — reversal menukar asal/tujuan), `fn_rekap_bmd`, lib/rekon.ts, &
  badge "Dikembalikan" di `PenggunaanMasuk.tsx`. Mencabut pembacanya membuat
  atribusi SKPD dua aset itu salah sejak 2026-S2 tanpa satu pun error.
  Mutasi internal tak punya baris reversal sama sekali (0 dari 6), jadi di sana
  pencabutannya bersih.
- **Mutasi lintas-SKPD lewat RPC SECURITY DEFINER**, bukan insert/update client:
  `fn_terima_pengalihan` (materialize: ledger `pengalihan_status` + pindah
  `aset.skpd_id`, atomik) & `fn_tolak_pengalihan` (status `ditolak`+alasan, ini
  status AKTIF di kategori ini — beda dgn Pengadaan yg legacy). Alasannya: RLS
  `aset`/`transaksi_bmd` menolak operator menulis di luar subtree SKPD-nya —
  jangan coba bypass dgn policy longgar. (`fn_kembalikan_pengalihan_barang`
  di-DROP migrasi 20260812_05; `fn_batal_pengalihan_barang` LAMA di-DROP migrasi
  22 lalu dibangun ulang 20260729_07 — yang berlaku versi baru, kini melayani
  pengalihan DAN mutasi internal.)
- `pengalihan_status` TANPA efek finansial di engine (penyusutan jalan terus)
  dan BUKAN event SEMBUNYI — barang cuma pindah pemegang. Keanggotaan kartu:
  baris ledger TERBARU per (header, aset); `payload.reversal` = keluar.
- **Kepemilikan PERIOD-AWARE (`lib/pengalihan.ts`).** Daftar Barang & Penyusutan
  meng-atribusi SKPD per periode dgn replay ledger, BUKAN `aset.skpd_id` terkini:
  `fetchOwnerOverrides(periode)` → map aset_id→SKPD pemilik pd periode itu
  (skpd_tujuan baris terakhir dgn periode<=V; sebelum transfer pertama = skpd_asal
  awal). `partitionByPeriodOwner` menyesuaikan set saat filter SKPD: BUANG barang
  yg kini di scope tapi saat itu milik SKPD lain, TAMBAH barang yg saat itu milik
  scope tapi kini sudah pindah keluar (di-fetch by id, RLS `aset_select` diperluas
  migrasi 22 via `fn_aset_pernah_dikelola` supaya pengirim tetap bisa baca aset yg
  sudah pindah). Angka penyusutan engine tak berubah — hanya kolom/atribusi SKPD.
  ✅ **Laporan BMD ikut period-aware sejak migrasi 20260805_02** (permintaan
  user 2026-08-05): `fn_rekap_bmd` tak lagi memakai `status`/`skpd_id` TERKINI.
  Kini replay SEMBUNYI/MUNCUL + `LAHIR` + pemilik-pada-periode (`ownersAt` versi
  SQL, termasuk `mutasi_internal` & pembuangan `batal_pengalihan`), jadi
  sedefinisi dgn Rekonsiliasi — Saldo Akhir keduanya harus SAMA PERSIS pada
  periode & scope yang sama; selisih yang tersisa = bug, bukan beda definisi.
  Bareng itu Model 3 dapat baris **Pemecahan Barang** (masuk/keluar): dulu induk
  yang sudah dipecah hilang dari Saldo Awal MAUPUN Akhir sehingga Model 3 foot
  secara kebetulan; begitu Saldo Awal memuatnya kembali, tanpa baris itu
  rekonsiliasinya meleset sebesar induk yang pecahannya pindah kolom komptabel.
  ⚠️ Daftar jenis di `fn_rekap_bmd` KEMBAR dgn lib/visibilitas.ts &
  lib/pengalihan.ts — ubah satu, ubah semua. Dan perbandingannya WAJIB memakai
  array bertipe enum (`jenis_transaksi_bmd[]`), jangan `jenis::text = ANY(...)`:
  cast ke text mematikan `idx_trx_jenis_id` → seq scan 418rb baris tiap panggil.
  ⚠️ **Saldo Awal → Rekapitulasi SENGAJA TIDAK ikut**: ia membaca
  `aset_awal_2026`, foto BEKU posisi akhir 2025 yang tak pernah disentuh
  transaksi (`skpd_id`-nya termasuk kolom terkunci). Pengalihan yang terjadi di
  2026 memang TIDAK boleh menggesernya — membuatnya "period-aware" justru
  merusak baseline.
- ⚠️ **"Barang ini masih berpindah?" JANGAN dijawab dari `aset.skpd_id` hari
  ini.** Posisi terkini itu hasil akhir dari BANYAK jenis peristiwa, jadi ia tak
  bisa menjawab pertanyaan tentang SATU jenis. Kartu Mutasi & Transfer di
  Dashboard dulu membandingkan `aset.skpd_id` dgn `skpd_tujuan` baris
  pengalihannya → 6 barang yang sesudah pindah ke Setda dimutasi-internal lagi
  ke Bagian Umum hilang dari hitungan (**57 tampil 51**, INS-24, 2026-08-13).
  Sumber kebenarannya LEDGER: pakai **`pindahAktif`** (lib/pengalihan.ts) —
  baris terakhir per aset untuk jenis itu, minus pengembalian
  (`payload.reversal`); yang dibatalkan sudah dibuang `fetchPindahEvents`.
  Angka kartu (server) & isi popupnya (client) memakainya bersama — dulu
  logikanya disalin di dua tempat sehingga keduanya salah dengan cara yang sama
  dan mencocokkan keduanya tak menemukan apa pun. Dikunci lib/pengalihan.test.ts.
- Selama pending: draft bebas diedit, jurnal boleh DELETE utuh (belum ada
  ledger). Pindah semester = hapus & entry ulang (guard semester sama spt
  ber-SK lain). `skpd_tujuan` terkunci begitu status bukan pending.
- Dokumen sumber (foto/PDF) → bucket **`dokumen-sumber`** (privat, 10MB,
  image+pdf — beda dari `aset-foto` yg image-only), path di
  `payload.dokumen_paths`, tampilkan via signed URL.

- **BATAL PERPINDAHAN** (migrasi 20260729_06 enum + 20260729_07 RPC/index/trigger;
  digeneralkan ke mutasi internal oleh 20260812_04). Sejak "Kembalikan" dicabut,
  ini **satu-satunya** cara memulangkan barang dari kartu perpindahan: **Batal** =
  perpindahannya dianggap TAK PERNAH TERJADI. Pengembalian yang sungguhan =
  kartu BARU ke arah sebaliknya, bukan aksi di kartu ini.
  ⚠️ **Enum `batal_pengalihan` DIPAKAI BERSAMA** oleh `pengalihan_status` DAN
  `mutasi_internal` — sengaja, bukan kelalaian penamaan. Semua pembacanya
  menyaring lewat `payload.target_trx_ids` (id baris), bukan lewat jenis baris
  yang dibatalkan, jadi memakai ulang enum membuat `buangYangDibatalkan`,
  `idx_trx_pindah_id`, `fn_rekap_bmd`, cabang GUC kode register, & KIBAR benar
  TANPA disentuh. Enum kembar akan memaksa menyisir ulang enam pembaca
  (rules.md §1.7) — dan `batal_pengalihan` sendiri sudah kelewat tiga ronde.
  **Jangan pecah jadi `batal_mutasi_internal`.**
  `fn_batal_pengalihan_barang(header_id, aset_id)` melayani kedua kategori
  (jenis baris diturunkan dari `jurnal_header.kategori`): wewenang **admin + SKPD
  PENERIMA** (satu pintu migrasi 22 tetap utuh — SKPD asal tak berwenang), tanpa
  batas waktu, tapi tunduk guard baku "tak boleh dibatalkan kalau aset punya
  transaksi lebih baru". Membatalkan **SEMUA** baris pengalihan aset itu di kartu
  tsb sekaligus (kasus khas punya 2 baris: pergi + pulang) — membatalkan separuh
  menyisakan rantai yang tak nyambung. Payloadnya **`target_trx_ids` (JAMAK)`**,
  beda dari `batal_*` lain yang tunggal; `fetchBatalTargets` sudah membaca
  dua-duanya. Trigger kode register punya cabang khusus (dipicu GUC
  `app.batal_pengalihan`) yang memulihkan kode lama — tanpa itu batal justru
  MENERBITKAN nomor baru karena `skpd_id` berubah.
  ⚠️ Fitur ini kelewat **tiga ronde** sebelum benar-benar sampai ke sasaran:
  keanggotaan kartu (dua sisi) dan modul pelaporan sama-sama terlupakan padahal
  ledgernya sudah benar. **Sebelum menambah `batal_*` baru, ikuti daftar periksa
  tujuh titik di [rules.md](rules.md) §1.7.**

## Kode Register (identitas ikut posisi terakhir, migrasi 20260729_03..07)

**NIBAR = akta lahir, kode register = KTP.** Dua-duanya 45 digit dengan susunan
sama: `[12][01|02][3506][kode SKPD 14][tahun 4][kode barang 12][urut 7]`. NIBAR
terbit sekali saat barang masuk dan **tak pernah berubah** (direklas pun tidak
digenerate ulang). Kode register mengikuti **posisi terakhir**: empat segmen
tengahnya bergerak — intra/ekstra (`reklas_komptabel`), kode lokasi
(`pengalihan_status`/`mutasi_internal`), **tahun = tahun MASUK SKPD** (BUKAN
tahun perolehan), kode barang (`reklas_kode`/`reklas_golongan`).

- **NOMOR URUT DITERBITKAN, BUKAN DIHITUNG SAAT TAMPIL.** Ini pengecualian
  sengaja dari kebiasaan repo ini yang serba-turunan. Kalau dihitung dari urutan
  baris, satu barang hilang di tengah menggeser nomor semua barang di bawahnya —
  padahal kode ini tercetak di label barang, KIR, dan BAST, jadi kertas & layar
  tak cocok tanpa ada yang sadar. Bandingkan dgn aturan SEBALIKNYA untuk Σ luas
  bidang tanah ("JANGAN disimpan balik ke kolom") — di situ nilainya wajib ikut
  data hidup, di sini wajib BERHENTI ikut.
- **Alokasi lewat tabel counter** `kode_register_seq` (`INSERT … ON CONFLICT DO
  UPDATE … RETURNING`, fungsi `fn_alokasi_nomor_register` SECURITY DEFINER) —
  O(1) & aman balapan. **JANGAN** pakai pola `LIKE 'prefix%'` seperti
  `generateNibars`: itu sudah pernah timeout & diam-diam mengulang nomor dari 1.
  Counternya MONOTON → nomor urut per SKPD boleh berlubang, itu harga kode stabil.
- **Penegakan di TRIGGER DB** (`trg_aset_kode_register`), bukan dipanggil dari
  kode: ada 6+ pintu yang menggeser posisi barang, satu kelupaan = kode basi
  diam-diam (nasib cache `aset.pemanfaatan`). Klausa `UPDATE OF` sengaja TIDAK
  memuat `kode_register` supaya backfill massal tak membangunkannya. Kode yang
  dikirim client selalu diabaikan — nomor wajib lewat counter.
- **Riwayat `aset_kode_register` = SATU BARIS PER PERPINDAHAN**, memuat
  `kode_lama` + kode baru sekaligus. Itu yang bikin 418rb barang yang tak pernah
  pindah tak menitipkan satu baris pun TAPI riwayatnya tetap bisa direkonstruksi.
  Cara bacanya **kembar** dgn `ownersAt()`: kode pada periode V = baris terakhir
  ber-periode ≤ V; kalau belum ada, jatuh ke `kode_lama` baris paling awal.
- ⚠️ **`fn_prefix_kode_register` (SQL) adalah yang OTORITATIF**;
  `prefixKodeRegister` di lib/kodeRegister.ts kini rujukan saja, **tak dipanggil
  jalur tampilan**. Kalau keduanya beda, TAK ADA yang gagal — jadi kalau
  menyentuh salah satu, sandingkan langsung dengan yang lain.
- ⚠️ **Panjang 45 digit TIDAK cukup untuk menilai kesamaan dgn NIBAR.** 150.101
  aset (impor ATL Diknas) punya NIBAR 45 digit dgn **susunan BEDA**:
  `[8 dgt urut internal][kode barang 12][kode SKPD 14][tahun 4][urut 7]` — kode
  barang & SKPD tertukar posisi, tahun di belakang. `prefixNibar` menyaring lewat
  kepala `12013506`/`12023506`. Tanpa penyaring itu 150.108 barang tampil
  "bergeser" dan 148 yang benar-benar bergeser tenggelam. `null` = **tak bisa
  dinilai**, sengaja dibedakan dari `false`; yang tak bisa dinilai jangan
  ditandai apa pun.
- Barang `draft` belum berkode (nomor tak dibakar untuk yang mungkin tak jadi);
  barang `dihapus` **membekukan** kode terakhirnya (dokumen penghapusannya masih
  menyebut kode itu).
- **Backfill (20260729_04) wajib lewat `psql`, bukan SQL Editor.** Dua alasan:
  (1) UPDATE 418rb baris melampaui batas waktu gateway API → `Failed to fetch`;
  (2) SQL Editor menentukan mode baca/tulis dari **kata pertama skrip**, jadi
  skrip berawalan `WITH` dibuka READ-ONLY dan semua tulis di dalamnya ditolak
  (`25006`). Pass 1 mewarisi NIBAR apa adanya untuk barang yang belum bergerak
  (tak ada nomor terbuang + counter ter-seed benar); Pass 2 menerbitkan nomor
  baru. Hasil: 418.032 berkode, 0 dobel, 86.188 prefiks.
  ⚠️ **Backfill sebesar ini membengkakkan WAL ±700 MB** dan pernah mendorong disk
  Supabase 54% → 96% → project READ-ONLY → seluruh app mati (504 di middleware,
  karena refresh sesi auth itu operasi tulis). **Cek sisa disk SEBELUM menjalankan
  migrasi massal**, bukan sesudah.
- **BELUM SELESAI:** tampilan belum period-aware (Daftar Barang menampilkan kode
  TERKINI walau membuka periode lampau — belum terasa karena tabel riwayat masih
  nyaris kosong, tapi salah begitu ada perpindahan yang tak dibatalkan); KIBAR
  masih mengisi kolom "Nomor Register" dengan NIBAR.
- **Export Daftar Barang SUDAH membawa kode register** (2026-07-30, keputusan
  user): kolom **"Kode Register"** ikut di Export Excel & Export Audit. Bersama
  NIBAR ia masuk `EXPORT_ALWAYS` — dua kolom identitas itu sengaja di luar
  daftar per-golongan supaya selalu ikut apa pun jenis asetnya & tak bisa
  kelupaan di salah satu entri. Diisi langsung dari kolom `aset.kode_register`
  (sudah ada di `SELECT_COLS`), string → sel Excel bertipe teks, jadi 45 digitnya
  tak dibulatkan jadi notasi ilmiah.
  ⚠️ Ikut menanggung keterbatasan yang sama dgn layar: **kode TERKINI, belum
  period-aware**. Begitu tampilan dibuat period-aware lewat `aset_kode_register`,
  export WAJIB diubah bareng — kalau tidak, berkas periode lampau untuk BPK
  menyebut kode yang saat itu belum terbit. **Export Penyusutan ikut** (kolom
  sama, tepat setelah NIBAR; `kode_register` ditambahkan ke `BASE_COLS`) —
  sekaligus `handleExport`-nya dibungkus try/catch/finally yang tadinya TIDAK
  ada padahal `assembleRows` memanggil `fetchOwnerOverrides` yang fail-closed
  (persis cacat yang sudah didokumentasikan utk Daftar Barang: tanpa penangkap,
  tombolnya nyangkut "Mengekspor..." selamanya & tanpa keterangan). Menu export
  LAIN (Daftar Barang Awal, Kendaraan, GIS, modul Pelaporan) belum membawa kolom
  ini.
- **Layar Penyusutan menampilkan kode register & uraian barang** (2026-07-30):
  sel Nama Barang jadi tiga baris (nama · NIBAR · `REG …`) dan sel Kode Barang
  dua baris (kode · uraian) — **pola & kelas CSS-nya kembar dgn Daftar Barang,
  termasuk penanda ⚠ `bergeserDariNibar` yang sengaja TIDAK menandai apa pun
  kalau hasilnya `null`**. Ubah salah satu halaman → samakan yang lain.
  Uraian diambil dari `admin_kodefikasi_bmd` (`fetchUraian`, di-dedup per kode),
  **BUKAN** dari `aset.uraian_barang`, supaya selalu ikut kodefikasi terkini;
  fungsinya MELEMPAR & dipanggil di dalam `try` milik `load`, jadi ikut
  fail-closed — kolom uraian kosong di berkas BPK tak boleh diam-diam berarti
  "query gagal".
- **Urutan kolom Export Penyusutan DITENTUKAN USER** (2026-07-30): SKPD · Kode
  Barang · Uraian Barang · NIBAR · Kode Register · Nama Barang · Lokasi ·
  Tgl Perolehan · Komptabel · Masa Manfaat (Smt) · Nilai Perolehan · Beban ·
  Akumulasi · Nilai Buku Akhir · Sisa (Smt) · Periode. **Lokasi selalu ikut**
  walau di layar cuma tampil utk `GOL_LOKASI` — set kolom berkas export tak
  boleh berubah-ubah tiap ganti filter jenis aset; golongan tanpa lokasi cukup
  kosong. (Kolom **Merek** yang juga kondisional di layar SENGAJA belum masuk
  export — belum diminta.) Urutan properti objek di
  `handleExport` = urutan kolom Excel (`json_to_sheet` ikut key objek pertama) —
  DI PENYUSUTAN urutan itu ditulis langsung di objeknya (satu set kolom, tak
  per-golongan) —
  jangan diacak saat menambah kolom baru. Suffix **"(Smt)"** di Masa Manfaat &
  Sisa WAJIB dipertahankan: angkanya semester (`masa_manfaat_tahun × 2`), tanpa
  label itu "100" terbaca 100 tahun.
- **Urutan Export Daftar Barang DISAMAKAN dgn Penyusutan** (2026-07-30,
  permintaan user): SKPD · Kode Barang · Uraian Barang · NIBAR · Kode Register ·
  Nama Barang · *(merek · spesifikasi · lokasi · luas · jenis hak · dokumen
  kepemilikan — sesuai kolom yang memang ditampilkan Daftar Barang utk golongan
  itu)* · Tgl Perolehan · Komptabel · Nilai Perolehan · Asal Usul · Penggunaan ·
  Keterangan. Yang berubah dari sebelumnya: Tgl Perolehan kini SEBELUM Komptabel,
  dan **Asal Usul + Penggunaan akhirnya ikut** (dulu ada di layar tapi tak pernah
  masuk Excel; `cell()` juga belum punya case-nya, jadi menambah kolomnya saja
  akan menghasilkan kolom kosong senyap lewat `default: return ''`).
  ⚠️ **Urutan dipegang SATU tempat: `EXPORT_ORDER`.** `EXPORT_COLS` kini cuma
  HIMPUNAN kolom per golongan (urutannya diabaikan) & `exportColsFor` menyaring
  `EXPORT_ORDER` dengan himpunan itu + `EXPORT_ALWAYS`. Sebelumnya urutan
  tersebar di 9 daftar, jadi menambah satu kolom berarti menyisipkannya dgn
  benar di 9 tempat — satu kelupaan bikin berkas golongan itu beda susunan tanpa
  ada yang sadar. **Nambah kolom export baru = tambahkan ke `EXPORT_ORDER`
  (posisi) + `EXPORT_COLS` golongan yang relevan (keanggotaan) + `cell()`
  (isi).** Ketiganya, kalau tidak kolomnya hilang / salah tempat / kosong senyap.
  Header `uraian` ikut jadi **"Uraian Barang"** biar kembar dgn Penyusutan.
  Dua berkas ini tetap TIDAK identik — Daftar Barang tak punya kolom angka
  penyusutan & punya blok deskriptif per golongan; yang disamakan susunannya.

## Pemanfaatan BMD (sewa/pinjam pakai/KSP/BGS-BSG/KSPI, migrasi 20260721_01+02)

Menu Pembukuan → Pengelolaan → Pemanfaatan (`components/pengelolaan/Pemanfaatan.tsx`,
`lib/pemanfaatan.ts`). Pola jurnal ber-dokumen (`jurnal_header` kategori
`'pemanfaatan'` + ledger), **TANPA approval & TANPA lintas-SKPD** — pengurus
barang catat langsung di SKPD-nya (pola Penghapusan, bukan Pengalihan). 1
perjanjian = 1 header; field header (jenis, mitra, alamat, mulai, masa tahun,
berakhir, peruntukan, jenis/no/tgl dokumen) disimpan di `jurnal_header.payload`
(REUSE kolom `no_sk`=no dokumen, `tanggal`=tgl dokumen, `keterangan`). Barang =
baris `transaksi_bmd` jenis `'pemanfaatan'` ber-`header_id` sama; lingkup per
barang (`{lingkup:'seluruh'|'sebagian', bagian}`) di payload baris.

- **NETRAL, BUKAN event SEMBUNYI** — persis `pengalihan_status`: tidak mengubah
  nilai/penyusutan (engine `default: break` mengabaikan `pemanfaatan` &
  `pemanfaatan_selesai`), barang **tetap muncul** di Daftar Barang & Penyusutan
  dan **tetap disusutkan**. Jangan tambahkan ke SEMBUNYI/MUNCUL.
- **BLOKIR KERAS golongan** (keputusan user 2026-07-21,
  `PEMANFAATAN_ELIGIBLE_GOLONGAN`): hanya real estate (Tanah 1.3.1, Gedung 1.3.3,
  Jalan/Jaringan/Irigasi 1.3.4) + Aset Lain-Lain (1.5.4) yang boleh dipilih.
  Barang bergerak (Peralatan&Mesin 1.3.2, ATL 1.3.5, dll) WAJIB direklas ke
  1.5.4 dulu — picker tak menampilkannya (filter query eligible-only + guard
  `isPemanfaatanEligible` client-side). Kasus "gedung sebagian" (mis. 1 ruang
  disewa Bank Jatim) diselesaikan lewat **Lingkup=Sebagian** + teks bagian,
  BUKAN pemecahan nilai / reklas.
- **Dua aksi penghentian, BEDA semantik** (keputusan user 2026-07-21), keduanya
  append-only tanggal HARI INI (tahun terbuka → lolos guard) + null cache:
  - **⏹ Akhiri** = `pemanfaatan_selesai`. Pemanfaatan SAH lalu berakhir/diakhiri
    lebih awal. Barang **tetap tampil** sbg riwayat (badge "Selesai" di kartu,
    status "Selesai" di KIBAR VII).
  - **🗑 Batal** = `batal_pemanfaatan` (pola `batal_pengadaan`). KOREKSI salah
    catat → barang **hilang total** dari kartu & KIBAR VII (dianggap tak pernah
    dimanfaatkan). Ada juga "Batal Seluruh Perjanjian" (batal semua barang kartu
    → kartu hilang). JANGAN pakai Akhiri utk salah catat (nanti ada pemanfaatan
    hantu "Selesai" di KIBAR).
  Keanggotaan kartu = replay kronologis per (header, aset): `pemanfaatan` set
  baris, `pemanfaatan_selesai` → selesai=true (tetap), `batal_pemanfaatan` →
  buang dari kartu. KIBAR VII keying per-header: header hidup dgn baris
  `pemanfaatan` ber-id tertinggi (kalau terbaru dibatalkan, jatuh ke perjanjian
  sah sebelumnya). Siklus manfaat→selesai/batal→manfaat lagi didukung. Backdate
  `pemanfaatan` ke tahun terkunci ditolak guard (belum di-whitelist
  `fn_cek_tahun_buku` — konsisten Penghapusan; whitelist kalau nanti perlu).
- **Kolom `aset.pemanfaatan` = CACHE ringkas** (badge/filter cepat), BUKAN sumber
  kebenaran — sumber kebenaran tetap ledger. Di-set string
  (`pemanfaatanCache`, mis. "Sewa — Bank Jatim (s.d. 12 Agu 2027)") saat catat,
  di-null saat Akhiri. Kolom sudah ada sejak migrasi 20260707_04 (placeholder).
  RLS: update `aset` & insert `transaksi_bmd`/`jurnal_header` dicek lewat
  kepemilikan aset/skpd_id (bukan skpd_asal) → aman di-client per-SKPD.
  ⚠️ **Keterbatasan MVP:** cache TIDAK auto-null saat masa berakhir lewat (tak
  ada cron) — barang expired tetap terkunci dari pemanfaatan baru sampai
  di-Akhiri manual; status di KIBAR/badge tetap benar (dihitung dari tgl
  berakhir vs hari ini).
- **KIBAR bagian VII** diturunkan dari ledger (baris `pemanfaatan` terakhir +
  `jurnal_header.payload`), pola sama IV/VIII/IX — bukan dari kolom `aset`.
- ⚠️ **Deploy-ordering:** migrasi enum (20260721_01) + kategori (20260721_02)
  WAJIB jalan SEBELUM deploy kode — KIBAR & komponen sudah memfilter
  `.in('jenis', ['pemanfaatan','pemanfaatan_selesai'])` (pola 20260719_04).

## Pengamanan BMD (kustodi fisik ke pegawai, migrasi 20260722_01+02)

Menu Pembukuan → Pengelolaan → Pengamanan (`components/pengelolaan/Pengamanan.tsx`,
`lib/pengamanan.ts`). Penyerahan kustodi fisik barang ke seorang **pegawai
penanggung jawab** via BAST + Pakta Integritas. Pola jurnal ber-dokumen
(`jurnal_header` kategori `'pengamanan'` + ledger), TANPA approval & TANPA
lintas-SKPD. Header payload: `nama_pegawai, nip, pangkat_golongan, jabatan,
pakta_no, pakta_tgl, bast_paths[], pakta_paths[]` (REUSE `no_sk`=No BAST,
`tanggal`=Tgl BAST). Berkas PDF/gambar → bucket **`dokumen-sumber`** (sama spt
Pengalihan), prefix `pengamanan-bast/` & `pengamanan-pakta/`, tampilkan via
signed URL.

- **NETRAL, BUKAN SEMBUNYI** — engine `default: break` mengabaikan `pengamanan`/
  `pengembalian_pengamanan`/`batal_pengamanan`; barang tetap muncul & disusutkan.
- **Golongan**: hanya Peralatan & Mesin (1.3.2) + Gedung & Bangunan (1.3.3)
  (`PENGAMANAN_ELIGIBLE_GOLONGAN`, keputusan user 2026-07-22 "lebih ke ... aja").
  Picker eligible-only. Longgarkan dgn tambah kode golongan di lib kalau perlu.
- **Kustodi tunggal + serah ke orang baru**: barang cuma boleh ke SATU pegawai.
  Picker filter `.is('pengamanan', null)` (kolom cache) → hanya barang belum
  berkustodi. Serah ke pegawai lain = **⤺ Kembalikan** dulu
  (`pengembalian_pengamanan` → barang tetap tampil "Dikembalikan" sbg riwayat,
  cache di-null) → barang bebas → buat BAST pengamanan baru utk pegawai lain.
- **🗑 Batal** (`batal_pengamanan`, pola batal_pemanfaatan) = koreksi salah catat
  → barang hilang dari kartu. + "Batal Seluruh BAST" per kartu. Keanggotaan
  kartu = replay per (header, aset), baris terakhir menentukan: pengamanan set,
  pengembalian_pengamanan → dikembalikan=true (tetap), batal_pengamanan → buang.
- **`aset.pengamanan` = CACHE** kustodian saat ini (mis. "Budi (NIP …)"), di-set
  saat serah, di-null saat kembali/batal. Bukan sumber kebenaran (ledger yg
  otoritatif). Kolom ditambah migrasi 20260722_02.
- **Laporan** `components/pelaporan/LaporanPengamanan.tsx` (se-kab bila SKPD
  kosong; per-SKPD via `descendantIds`) + filter status Diamankan/Dikembalikan.
- ⚠️ **Deploy-ordering:** migrasi enum (20260722_01) + kategori/kolom
  (20260722_02) WAJIB jalan SEBELUM deploy kode.

**Laporan Pemanfaatan** (`components/pelaporan/LaporanPemanfaatan.tsx`): se-kab/
per-SKPD + **filter jenis pemanfaatan** (Sewa/Pinjam Pakai/KSP/BGS-BSG/KSPI dari
`payload.jenis_pemanfaatan`). Keduanya baca `jurnal_header`+ledger, hitung
keanggotaan per (header, aset) baris-terakhir, export Excel.

## KIR — Kartu Inventaris Ruangan (Format III.K.2, migrasi 20260727_02)

Menu Pembukuan → KIR (`components/kir/Kir.tsx`, `lib/kir.ts`) + Pelaporan → KIR
(`components/pelaporan/LaporanKir.tsx`) + cetak `app/cetak/kir/page.tsx`.
Pendataan penempatan FISIK barang di ruangan: pilih SKPD → tambah ruangan (+
Penanggung Jawab Ruangan) → centang barang → cetak KIR.

- **NON-LEDGER & BUKAN pola jurnal ber-SK** (pola Inventarisasi 20260725_08).
  Dua tabel biasa: `kir_ruangan` (skpd_id, nama, kode_ruangan, pegawai_id +
  snapshot `pj_nama/pj_nip/pj_jabatan`, keterangan) & `kir_ruangan_aset`
  (ruangan_id, aset_id, keterangan). **TIDAK menyentuh `transaksi_bmd` maupun
  kolom apa pun di `aset`** — penempatan ruangan itu data administratif, bukan
  peristiwa akuntansi (tak mengubah nilai/penyusutan/kepemilikan SKPD/
  visibilitas). Karena itu di sini **UPDATE/DELETE biasa** (user minta: edit
  nama ruangan, hapus barang dari ruangan, hapus ruangan) — aturan append-only
  `transaksi_bmd` tak berlaku & tak dilanggar. **JANGAN** menambahkan jenis
  ledger `kir_*` atau kolom cache di `aset` untuk fitur ini.
- **Beda dgn Pengamanan**: Pengamanan = kustodi HUKUM ke pegawai lewat BAST +
  Pakta Integritas (ber-dokumen, ber-ledger). KIR = penempatan fisik di ruangan
  (administratif, sering berubah). Keduanya berdiri sendiri — satu barang boleh
  punya kustodian Pengamanan sekaligus tercatat di sebuah ruangan.
- **SATU BARANG = SATU RUANGAN** (keputusan user 2026-07-27): ditegakkan DB lewat
  `UNIQUE (aset_id)` di `kir_ruangan_aset`, bukan cuma filter picker. Pindah
  ruangan = keluarkan dulu dari ruangan lama. Picker menyaring aset yang sudah
  ditempatkan supaya operator tak kena error UNIQUE mentah.
- **Golongan**: Peralatan & Mesin (1.3.2), Aset Tetap Lainnya (1.3.5), Aset
  Lain-Lain (1.5.4) — `KIR_ELIGIBLE_GOLONGAN`. Tanah/Gedung/Jalan sengaja TIDAK
  masuk (KIR mendata ISI ruangan, bukan bangunannya).
- **Penanggung Jawab Ruangan** dipilih dari `admin_pegawai` se-SKPD (dropdown,
  yang sudah `role_bmd='penanggung_jawab_ruangan'` ditandai ✓); belum terdaftar
  → pintasan ke `/dashboard/admin/usulan-pengurus` (peran itu sudah ada di
  `PERAN_USULAN`). Nama/NIP/jabatan **di-snapshot** ke kolom `pj_*` saat
  ditetapkan supaya blok tanda tangan KIR yang sudah dicetak tetap sesuai
  dokumen fisik walau data pegawai berubah. Blok tanda tangan kiri (Pengurus
  Barang) diambil live dari `admin_pegawai` role `pengurus_barang` SKPD itu.
- **Cetak** `/cetak/kir?ruangan=<id>` (satu ruangan) atau `?skpd=<id>` (semua
  ruangan SKPD, page-break per ruangan), A4 landscape. Kolom 5 "Nama Barang" =
  `aset.uraian_barang` (baku kodefikasi), kolom 6 "Spesifikasi Nama Barang" =
  `aset.nama_barang` — jangan tertukar. Kolom "Nomor Register" diisi NIBAR:
  aplikasi ini tak punya nomor register terpisah, kolomnya ada demi kesesuaian
  format.
- RLS pola inventarisasi (subtree SKPD; `fn_is_admin()`/`fn_is_viewer()`
  dibungkus InitPlan). ⚠️ **Deploy-ordering: migrasi 20260727_02 WAJIB jalan
  SEBELUM deploy kode** — halaman KIR langsung query tabel yang belum ada. Tak
  ada perubahan enum, jadi menu lain tak terdampak.

## RKBMD — sub-menu + Standar Harga sbg BAK BERSAMA (migrasi 20260810_01)

Menu RKBMD dipecah jadi empat (keputusan user 2026-08-10): **Standar Harga**
(SSH · SBSK · ASB · SBU · HSPK) · **Usulan RKBMD** · **Validasi** · **Pelaporan**.
SSH & SBSK **PINDAH dari menu Admin** ke RKBMD → Standar Harga; rute lamanya
(`/dashboard/admin/rkbmd-ssh`, `-sbsk`) dibiarkan hidup sebagai `redirect()`,
bukan dihapus, supaya pranala yang terlanjur tersebar tidak mati.

- **SATU tabel `rkbmd_standar` untuk EMPAT standar** (discriminator `jenis` ∈
  ssh/hspk/asb/sbu), bukan empat tabel kembar — keempatnya berbentuk sama
  (tahun · nama · satuan · harga · rekening · keterangan) dan aturan dedupnya
  sama. Bedanya cuma dua, ditegakkan CHECK: `ssh`/`hspk` WAJIB ber-`kode`
  (kode barang BMD) & boleh ber-TKDN; `asb`/`sbu` **HARUS `kode` NULL** — ASB
  (belanja kegiatan) & SBU (honorarium, perjalanan dinas) bukan barang.
  Halamannya juga satu komponen (`StandarHargaWorkspace`) + config
  `STANDAR_CONFIG` di lib/rkbmdStandar.ts. **SBSK sengaja TIDAK ikut**: bentuknya
  beda sendiri (`kuantitas_standar` + `satuan_pengukur`, bukan harga), tabel
  `rkbmd_sbsk` tetap terpisah & tetap admin-only. Yang pindah cuma menunya.
- **BAK BERSAMA lintas SKPD.** Satu barang cukup diinput SEKALI se-kabupaten.
  Identitas dedup = `jenis|tahun|kode|nama|satuan|harga`, disimpan sbg
  **generated column `identitas`** + UNIQUE index — penegaknya DB, bukan
  kesopanan pemanggil, jadi dua operator yang menyimpan bersamaan tetap tak bisa
  melahirkan baris kembar. `lower(btrim(...))` supaya beda spasi/huruf besar
  bukan barang berbeda; `round(harga,2)::text` supaya numeric `1000` dan
  `1000.00` tidak jadi dua baris.
- **Kode rekening = tabel anak `rkbmd_standar_rekening`, boleh banyak.** Inilah
  yang membuat "SKPD B pakai rekening lain" tidak melahirkan barang kedua:
  rekeningnya menempel di anak, barangnya tetap satu. ⚠️ **SENGAJA TANPA BATAS
  5** — form menyediakan 5 slot (permintaan user), tapi tabelnya tidak dibatasi;
  batas keras akan mematahkan janji penggabungan begitu SKPD ke-6 datang. Modal
  edit menampilkan `max(5, jumlah rekening yang ada)` slot supaya menyimpan tak
  diam-diam MEMBUANG rekening SKPD lain.
- **RPC `fn_rkbmd_standar_simpan` (SECURITY DEFINER)** yang melakukan dedup +
  penggabungan; DEFINER karena harus menambah rekening ke baris milik SKPD lain
  & membaca nama SKPD pemilik untuk pesan. Mengembalikan jsonb
  `{status:'baru'|'sudah_ada', rekening_baru, pemilik_skpd}` supaya UI bisa
  berkata jujur: "sudah ada (diinput Dinas X) — 1 kode rekening Anda
  digabungkan". ⚠️ Rumus identitas di dalam RPC **KEMBAR** dengan generated
  column-nya; kalau salah satu diubah, ubah dua-duanya — kalau tidak, RPC
  mengira barangnya baru lalu ditolak UNIQUE dengan pesan mentah.
- **Hak akses (keputusan user 2026-08-10):** semua SKPD boleh MENAMBAH;
  ubah/hapus hanya SKPD pembuat + admin (`fn_skpd_visible(skpd_id)`). Mencabut
  kode rekening: penyumbangnya, pemilik barangnya, atau admin — tanpa syarat itu
  satu SKPD bisa mencabut rekening yang sedang dipakai SKPD lain di RKBMD-nya.
  Semua fn di policy dibungkus InitPlan `(SELECT fn_...())`.
- **RKBMD Pengadaan kini BERSANDAR KE SSH.** Barang dipilih dari SSH TA itu —
  di luar SSH tidak bisa. **Harga tidak bisa diketik di form item** (dulu bisa
  di-override diam-diam per dokumen): kalau harganya keliru, yang diperbaiki
  SSH-nya supaya seluruh SKPD ikut terkoreksi. Kalau barangnya punya beberapa
  rekening, operator memilih SATU (`rkbmd_item.kode_rekening`) supaya anggaran
  bisa dijumlahkan per kode rekening; satu rekening → terisi otomatis.
  `jumlah_standar` (SBSK) & `jumlah_eksisting` tetap disimpan sbg angka rujukan
  read-only — sudah dipakai kolom laporan & dibekukan supaya angka telaah tak
  bergerak saat aset berpindah.
- **`admin_program` TIDAK diubah** — ia sudah lama memuat `kode_sub_kegiatan`/
  `uraian_sub_kegiatan` (1.527 baris terisi penuh) dan `ProgramPicker` sudah
  men-cascade Program → Kegiatan → Sub Kegiatan. Yang hilang cuma tempat
  menyimpannya di dokumen: `rkbmd.sub_kegiatan` (kolom baru). Itu sebabnya form
  lama memakai input teks bebas dan sub kegiatan tak pernah muncul. Sekarang
  ketiganya DIPILIH dari master, tersusun ke bawah (uraiannya panjang).
- **RKBMD Pengadaan BERKARTU (migrasi 20260810_02).** Satu dokumen berisi
  BEBERAPA kartu; satu kartu (`rkbmd_paket`) = satu Program/Kegiatan/Sub
  Kegiatan dengan beberapa item di dalamnya — polanya mengikuti entry Pengadaan.
  Semua kartu diisi dulu, baru SATU KALI diajukan; penolakan berlaku untuk
  SELURUH dokumen (semua kartu ikut kembali bisa disunting), lalu diajukan
  ulang. **Tidak ada setuju-sebagian.** Empat jenis RKBMD lain tetap datar
  (`rkbmd_item.paket_id` NULL). ⚠️ `program`/`kegiatan`/`sub_kegiatan`
  **DI-DROP dari `rkbmd`** — sekarang rumahnya cuma `rkbmd_paket`; jangan
  dikembalikan ke header, itu dua rumah untuk satu fakta. UNIQUE
  `(rkbmd_id, sub_kegiatan)` mencegah dua kartu untuk sub kegiatan yang sama
  (kartu baru ber-NULL sengaja tak kena, supaya bisa dibuat lalu diisi).
  Biayanya kecil: satu baris per sub kegiatan per SKPD per tahun.
- **Empat jenis non-pengadaan (migrasi 20260810_03).** Urutan isian ditentukan
  user & sengaja beda per jenis: di **Pemanfaatan & Pemindahtanganan BENTUK
  dipilih PALING DULU** (sebelum barang), karena bentuknya yang menentukan
  barang macam apa yang layak diusulkan. Semuanya: pilih jenis aset → pilih
  barang (dicari lewat NIBAR / uraian barang / nama barang / merek) → field
  khusus → keterangan. `kondisi` kini **tiga pilihan baku** (Baik / Rusak Ringan
  / Rusak Berat) ber-CHECK di DB — ⚠️ KEMBAR dgn `KONDISI_RKBMD` di lib/rkbmd.ts,
  dan **sengaja BEDA dari 5 opsi `aset.kondisi_barang`** (yang ini kondisi
  DIUSULKAN, bukan yang tercatat di register).
  Dua kolom baru: **`tgl_perolehan`** (di-SNAPSHOT dari `aset` saat item
  disusun, jangan di-join saat cetak — lembar yang dicetak ulang harus sama
  dgn yang dulu ditandatangani) & **`estimasi_hasil`** untuk Pemanfaatan.
  ⚠️ `estimasi_hasil` sengaja **kolom sendiri, bukan menumpang
  `total_anggaran`**: pemanfaatan itu rencana PENERIMAAN, dan menumpangkannya
  membuat Pelaporan menjumlahkan pemasukan ke dalam "Total Rencana Anggaran".
- **Pemindahtanganan & Penghapusan boleh memilih BANYAK barang sekaligus**
  (`AsetMultiPicker`, permintaan user 2026-08-10) — di dua jenis itu satu SKPD
  biasanya mengusulkan puluhan barang setahun. Aman disatukan karena field
  selain identitas barang (bentuk / sebab / keterangan) berlaku SAMA untuk semua
  yang dicentang; Pemeliharaan & Pemanfaatan **tidak** ikut, keduanya punya
  angka per-barang (biaya, estimasi hasil). Multi-pilih hanya saat MENAMBAH —
  mengedit tetap satu baris, kalau tidak arti "simpan" jadi ambigu. Semua baris
  masuk lewat SATU insert supaya tak ada yang tercatat separuh. Centang tetap
  tersimpan saat kata kunci diganti (pola `draftSeleksi`), dan seluruh pilihan
  ditampilkan utuh di daftar bawah supaya tak ada yang tersembunyi.
- **"Total Nilai" artinya BEDA per jenis** — `nilaiItemRkbmd()` + `LABEL_NILAI`
  di lib/rkbmd.ts, **satu sumber** dipakai menu Pelaporan DAN halaman cetak.
  Pengadaan & Pemeliharaan = `total_anggaran` (rencana belanja); Pemanfaatan =
  `estimasi_hasil` (rencana pendapatan); Pemindahtanganan & Penghapusan =
  `nilai_perolehan` barang yang dilepas. Sebelumnya semuanya dibaca dari
  `total_anggaran` saja sehingga tiga jenis terakhir **selalu tampil 0**.
  ⚠️ Angka gabungan saat filter Jenis = "semua" mencampur belanja, pendapatan,
  dan nilai perolehan — itu **bukan** jumlah yang bisa dibaca sebagai satu
  makna, dan halamannya wajib mengatakan begitu. Jangan hilangkan peringatannya.
  Kolom **Kartu & Sub Kegiatan dibuang dari tabel Pelaporan** (permintaan user);
  Sub Kegiatan tetap ikut ke Excel — di berkas kerja masih berguna, di layar ia
  cuma melebarkan baris.
- **Cetak `/cetak/rkbmd`** — dua mode: `?id=<uuid>` (satu dokumen) dan
  `?tahun=&jenis=[&versi=]` (**se-Kabupaten**, satu lembar per SKPD dgn
  page-break). Cetak se-kabupaten hanya aktif kalau jenisnya tunggal — susunan
  kolom tiap jenis berbeda, mencampurnya menyulitkan pembaca. Kepala lembar
  memuat "Pemerintah Kabupaten Kediri"; penanda tangan = **Kepala kantor SKPD
  masing-masing**, dipilih dari `admin_pegawai` yang `jabatan`-nya memuat kata
  "Kepala" — sengaja lewat `jabatan`, BUKAN menebak nilai `role_bmd`. Tak
  ketemu → blok tanda tangan dibiarkan bertitik-titik, jangan diisi nama lain.
  **Tombolnya ada di menu Pelaporan** (per baris + se-kabupaten), sengaja
  DICABUT dari menu Usulan (keputusan user 2026-08-10): Usulan itu layar
  penyusunan, yang ditandatangani sebaiknya keluar dari satu pintu.
  Empat jenis non-pengadaan memakai tabel datar 5 kolom identitas (No ·
  Kode/Uraian Barang · Spesifikasi Nama Barang/NIBAR · Tgl Perolehan · Nilai
  Perolehan) + kolom khas jenisnya + Keterangan. ⚠️ Kolom yang dijumlahkan di
  baris JUMLAH ditandai `jumlahkan` di `EKSTRA` — tanpa penanda itu angka total
  gampang jatuh di kolom yang salah dan baru ketahuan setelah dicetak.
- **Cetak Pengadaan `?id=<uuid>`** — format "Usulan Rencana Kebutuhan
  Pengadaan BMD", A4 landscape, 12 kolom. Kolom 2 memuat hierarki Program →
  Kegiatan → Sub Kegiatan sbg baris judul menjorok; di baris barang kolom itu
  **sengaja kosong** (judulnya sudah dicetak sekali di atas). Kolom 5 "Uraian
  Barang" di-lookup dari `admin_kodefikasi_bmd`, BUKAN dari `rkbmd_item` —
  supaya ikut kodefikasi terkini, pola yang sama dgn Daftar Barang & Penyusutan.
  Kolom 11 "Jumlah barang pada neraca" = `jumlah_eksisting` yang dibekukan saat
  dokumen disusun.
- **Program/Kegiatan/Sub Kegiatan TERSIMPAN OTOMATIS tiap dipilih.** Tautan
  terpisah "Simpan program/kegiatan" sudah DIBUANG — ia jebakan yang langsung
  memakan korban di hari pertama: picker sudah terlihat terisi, operator klik
  "Ajukan ulang", dan pilihannya tak pernah sampai ke DB. Dokumen TA 2027
  pertama terkirim dengan `program='Tes'`, `kegiatan='Tes'`, `sub_kegiatan=NULL`
  padahal layarnya menampilkan nomenklatur yang benar. **Jangan kembalikan pola
  "isi di picker, simpan di tombol lain" untuk field header mana pun.**
- **Dokumen berstatus `ditolak` boleh DIHAPUS** oleh SKPD penyusun (keputusan
  user 2026-08-10) supaya bisa disusun ulang dari nol. Sebelumnya tombol Hapus
  cuma ada di status `draft`, jadi dokumen yang dikembalikan penelaah nyangkut
  selamanya. Yang `disetujui` tetap tak bisa dihapus — bukanya lewat Buka Kunci.
- **Angka "Eksisting" bisa diklik** → pop-up daftar barangnya (NIBAR, kode
  register, merek, tgl perolehan, nilai, kondisi). Satu query terindeks
  (`skpd_id` + `kode` + `status`), jumlah barang satu kode di satu SKPD selalu
  kecil — tak perlu paginasi.
- **Tombol "Lihat" di Validasi = pop-up rincian**, bukan tautan ke menu Usulan
  (yang memaksa penelaah keluar dari antrean lalu memilih SKPD lagi dari awal).
  ⚠️ **TKDN tidak ada di `rkbmd_item`** — ia atribut barang di SSH, ditarik lewat
  `standar_id`. Sengaja: menyalinnya ke tiap item = dua sumber kebenaran yang
  bisa berbeda.
- **Kode rekening ditampilkan BERSAMA NAMA BELANJANYA** (permintaan user
  2026-08-13): "5.2.02.02.001.00004 — Belanja Modal Kendaraan Bermotor Beroda
  Dua". ⚠️ Kunci join-nya **`admin_rekening.kode_sub_rincian`**, BUKAN
  `admin_rekening.kode_rekening` — kolom yang namanya paling menggoda itu isinya
  cuma level teratas, harfiah `'5'` (Belanja) di SELURUH 406 barisnya
  (diverifikasi ke DB 2026-08-13). Menjoin ke situ mengembalikan 0 baris TANPA
  error & uraiannya tinggal kosong. Helper `fetchUraianRekening` +
  `labelRekening` di lib/rkbmdStandar.ts; sengaja **tidak melempar** karena
  uraian itu hiasan di atas kode yang sudah benar dan cadangannya (kode saja)
  persis tampilan sebelumnya. Terpasang di form item RKBMD Pengadaan; **halaman
  cetak sengaja belum ikut** — kolom 3 di lembar 12-kolom itu sudah sempit.
- **Cetak se-Kabupaten = SATU dokumen menerus** (permintaan user 2026-08-13,
  mengubah bentuk 2026-08-10): kop **sekali** di atas (Pemerintah Kabupaten
  Kediri · Usulan Rencana Kebutuhan [Perubahan] <Jenis> BMD · Tahun), lalu satu
  tabel panjang — tiap SKPD dibuka baris judul selebar tabel & ditutup baris
  subtotalnya, berulang sampai SKPD terakhir, ditutup JUMLAH SE-KABUPATEN.
  Dulu tiap SKPD satu lembar penuh ber-kop + page-break, jadi kop tiga baris itu
  terulang 60+ kali. **Konsekuensi yang DISENGAJA: lembar se-kabupaten tak punya
  blok tanda tangan.** Yang ditandatangani kepala SKPD adalah lembar PER-SKPD
  (`?id=<uuid>`, tombol Cetak per baris di menu Pelaporan) — bentuk itu sudah
  benar menurut user & **jangan diubah** ikut-ikutan saat menyetel yang se-kab.
  Kepala tabel & baris JUMLAH dipakai bersama dua mode (`TheadPengadaan`,
  `TheadAset`, `BarisAset`, `BarisJumlah`) supaya susunan kolomnya tak bisa
  menyimpang diam-diam.
- **Nomor cuma di PROGRAM, tidak per barang** (permintaan user 2026-08-13) di
  lembar Pengadaan: kolom "No." di baris barang dikosongkan. Dulu satu kolom
  memuat dua sistem penomoran bertumpuk ("1." program vs "1" barang). Empat
  jenis non-pengadaan **tetap bernomor** — di sana tak ada program sama sekali,
  jadi mencabutnya cuma menyisakan kolom kosong.
- **Pelaporan punya filter Versi (Murni / Perubahan / gabungan).** RKBMD
  Perubahan sudah lama bisa DISUSUN (`rkbmd.versi` + `parent_id`, pemilih versi
  di menu Usulan, syarat: murni jenis itu sudah `disetujui`) tapi tak pernah
  bisa DILAPORKAN terpisah. Default `semua` = perilaku lama.
  ⚠️ Bareng itu ditutup celah nyata: tautan cetak se-kabupaten **tak pernah
  mengirim `versi`** padahal halaman cetak sudah menerimanya, jadi berkasnya
  diam-diam menggabung dokumen Murni DAN Perubahan SKPD yang sama lalu
  menjumlahkan keduanya jadi satu angka yang tak berarti. Sekarang cetak se-kab
  mensyaratkan jenis **dan** versi tunggal. Per 2026-08-13 belum ada satu pun
  dokumen `versi='perubahan'` di DB — laporannya kosong sampai SKPD menyusunnya.
- **Lembar se-Kabupaten BERTANDA TANGAN, satu blok di AKHIR dokumen**
  (keputusan user 2026-08-13, mengoreksi bentuk yang sempat tanpa tanda tangan).
  Yang meneken rekap se-kabupaten itu Pengelola Barang, bukan 60+ kepala SKPD.
  Penanda tangannya **DIPILIH BEBAS dari daftar `admin_pegawai`** lewat dropdown
  di halaman cetak (tak ikut tercetak) — sengaja BUKAN tebakan dari kolom
  `jabatan` seperti lembar per-SKPD, karena per 2026-08-13 **tak satu pun** dari
  136 baris `admin_pegawai` berjabatan "Sekretaris Daerah", jadi tebakan
  otomatis apa pun pasti meleset. Pilihannya disimpan di `localStorage`
  (`bmd_rkbmd_ttd_sekab`, pola `bmd_tahun_kerja_pilihan`) supaya cetak ulang
  menghasilkan lembar yang SAMA; bisa juga dipaksa lewat `?ttd=<id pegawai>`.
  Belum dipilih → blok tanda tangan dibiarkan bertitik-titik. **JANGAN diisi
  nama lain** — aturan yang sama dgn lembar per-SKPD.
- **Tombol Cetak lembar per-SKPD KEMBALI ke menu Usulan** (keputusan user
  2026-08-13). Ini **membalik keputusan 2026-08-10** yang sengaja mencabutnya
  dari Usulan ("layar penyusunan, yang ditandatangani keluar dari satu pintu"),
  dan pembalikannya disengaja karena **peran lembarnya berubah**: dalam alur
  baru ia dicetak → ditandatangani kepala kantor → pindaiannya jadi SYARAT
  menekan Ajukan. Ia bukan lagi keluaran, tapi MASUKAN proses — jadi tempatnya
  di layar tempat operator SKPD bekerja. Sengaja **tak dibatasi status** (draft
  pun boleh dicetak; justru itu gunanya). Cetak **se-Kabupaten tetap di
  Pelaporan** — itu keluaran hilir untuk Pengelola Barang.

- **Import Excel Standar Harga — ADMIN SAJA** (permintaan user 2026-08-13).
  Tombol "⬆ Import Excel" di halaman Standar Harga (`StandarImport.tsx`):
  unduh format → isi → unggah → **periksa di layar** → simpan. Tiap baris tetap
  lewat **RPC yang sama** dgn form manual (`fn_rkbmd_standar_simpan`), jadi
  dedup & penggabungan kode rekening lintas SKPD berlaku persis sama — jangan
  diganti INSERT langsung demi kecepatan, itu mematahkan janji bak bersamanya.
  ⚠️ Gerbang "admin saja" itu **TAMPILAN, bukan keamanan**, dan itu disengaja:
  RPC-nya memang boleh dipanggil semua SKPD, jadi import massal bukan kemampuan
  BARU — cuma jalan cepat menuju hal yang satu-per-satu sudah boleh. Kalau kelak
  perlu ditegakkan sungguhan, tempatnya di RPC.
  Judul kolom format & pembacanya **satu sumber**: `kolomTemplate()` di
  lib/rkbmdStandar.ts, diturunkan dari `STANDAR_CONFIG` — label tiap jenis
  memang beda ("Harga Satuan" vs "Besaran / Pagu Satuan"), jadi menulis
  daftarnya dua kali membuat berkas yang diunduh perlahan menyimpang dari yang
  bisa dibaca. Pencocokan kolom **dua tahap** (persis dulu, baru longgar):
  dengan `includes` saja, alias "satuan" mencaplok kolom "Besaran / Pagu Satuan"
  milik ASB lalu kolom harganya kosong DIAM-DIAM.
  ⚠️ Lembar isian **tanpa baris contoh** — contoh yang duduk di lembar data ikut
  terbaca sbg barang sungguhan kalau tak dihapus, dan di bak bersama lintas SKPD
  barang karangan yang terlanjur masuk akan dipakai SKPD lain menyusun anggaran.
  Contohnya di lembar **Petunjuk**, tempat ia tak bisa terimpor.
  Kode barang & kode rekening diperiksa ke masternya SEBELUM baris pertama
  disimpan (dua-duanya ber-FK) — kalau tidak, satu salah ketik memunculkan pesan
  Postgres mentah sesudah sebagian baris terlanjur masuk. Baris kembar di dalam
  satu berkas dibuang & dilaporkan. Ringkasan hasil ditampilkan **di dalam
  pop-up**, bukan cuma dikirim ke pesan induk yang tercetak di belakang lapisan
  gelap modal. Berlaku untuk keempat jenis (SSH/HSPK/ASB/SBU) — bentuknya sama,
  dan mengkhususkan SSH cuma menyisakan cabang `if` di berkas yang justru
  dirancang config-driven.
- **Setujui/Tolak DICABUT dari menu Usulan** (keputusan user 2026-08-13) —
  telaah hanya di **RKBMD → Validasi**, tempat seluruh SKPD terkumpul dalam satu
  antrean berikut lampiran bertanda tangannya. Dua pintu untuk satu keputusan
  berarti satu di antaranya pasti menyetujui tanpa membuka lampiran, dan yang di
  Usulan justru pintu yang tak menampilkannya. Yang di Usulan tinggal tautan
  "Telaah di menu Validasi →". **"Buka Kunci" TETAP di Usulan** — antrean
  Validasi hanya memuat status `diajukan`, jadi dokumen `disetujui` tak punya
  pintu lain untuk dibuka.
- **"+ Tambah Kartu Program/Kegiatan" naik ke baris aksi**, sejajar Ajukan
  (permintaan user 2026-08-13). Dulu menempel di bawah kartu terakhir → di
  dokumen berisi beberapa kartu, operator harus menggulir ke dasar halaman tiap
  kali menambah satu. Tombol yang sama tetap ada di kartu kosong sbg ajakan awal.
- **Penanda tangan lembar per-SKPD DITANYAKAN lewat pop-up** (permintaan user
  2026-08-13), tak lagi ditebak diam-diam. Dua hal yang ditanyakan & keduanya
  tak bisa disimpulkan sistem: (1) SIAPA — tebakan lewat kata "Kepala" di kolom
  `jabatan` sering meleset, dan yang meleset dulu berakhir jadi blok titik-titik;
  (2) **Definitif atau Plt.** — status ini **tidak ada di `admin_pegawai` sama
  sekali**, jadi tak ada sumber data mana pun yang bisa menjawabnya. Sebutannya
  `sebutanKepala()`: Definitif → "Kepala <SKPD>", Plt → "Plt. Kepala <SKPD>",
  satu fungsi dipakai blok tanda tangan DAN pratinjau di pop-up supaya yang
  disetujui di layar persis yang tercetak. Pilihan disimpan **per SKPD**
  (`bmd_rkbmd_ttd_skpd_<id>`, pola `bmd_rkbmd_ttd_sekab`) supaya cetak ulang
  menghasilkan lembar yang SAMA — lembar ini ditandatangani lalu dipindai jadi
  lampiran pengajuan. Bisa dipaksa lewat `?ttd=<id pegawai>&plt=1`.
  ⚠️ Baris di bawah nama kini **NIP**, bukan `jabatan`: dulu "Kepala <SKPD>"
  tercetak dua kali beruntun, dan begitu Plt. dipilih kedua baris itu justru
  saling bertentangan. Sama dgn blok tanda tangan lembar se-Kabupaten.

- **Usulan NIHIL (migrasi 20260813_02).** SKPD menyatakan tak ada usulan untuk
  suatu jenis & tahun. **Kolom `rkbmd.nihil`, bukan sekadar "dokumen tanpa
  item"** — dua keadaan itu terlihat sama persis tapi artinya berlawanan:
  kosong = BELUM disusun, NIHIL = SUDAH disusun & hasilnya memang tidak ada.
  Tanpa pembeda, Pengelola tak bisa memisahkan SKPD yang sudah menyatakan sikap
  dari yang belum mengerjakan, dan lembar cetaknya cuma tabel kosong.
  Dijaga **dari DUA arah** oleh trigger: menyatakan nihil saat masih berisi
  ditolak (`fn_rkbmd_status_guard`), dan menambah item/kartu ke dokumen nihil
  ditolak (`fn_rkbmd_lampiran_batal`, menumpang trigger yang sudah ada di
  `rkbmd_item`/`rkbmd_paket` — fungsi itu sudah membaca baris induknya).
  Menjaga satu arah saja meninggalkan dokumen "NIHIL berisi 12 barang" yang
  tercetak sbg lembar NIHIL sementara Pelaporan menjumlahkan isinya. DELETE
  sengaja dikecualikan — mengosongkan isi dokumen nihil harus selalu boleh.
  **Lampiran bertanda tangan TETAP wajib**: pernyataan nihil pun diteken kepala
  kantor, justru di situ nilainya. Mengubah `nihil` pada dokumen `disetujui`
  ditolak (buka kunci dulu). Lembar cetak menampilkan satu baris **N I H I L**
  selebar tabel (`BarisNihil`, dipakai lembar per-SKPD & se-Kabupaten, kelima
  jenis). Di Pelaporan kolom Item menampilkan badge NIHIL, bukan `0` — angka nol
  menghapus satu-satunya pembeda; kolom "Nihil" ikut ke Excel.
- **Pelaporan DIPISAH jadi dua laporan** (keputusan user 2026-08-13), bukan satu
  tabel ber-filter status: **Laporan Usulan RKBMD** (draft/diajukan/ditolak —
  "sudah sampai mana penyusunannya") dan **Laporan Setelah Validasi** (hanya
  `disetujui` — "apa yang ditetapkan"). Lingkup status ditentukan MODE lebih
  dulu, filter di layar cuma menyaring di dalamnya — laporan setelah validasi
  tak boleh bisa memuat dokumen yang belum ditetapkan seketat apa pun filternya
  disetel. **Cetak se-Kabupaten HANYA di laporan setelah validasi**, disediakan
  **langsung per jenis** (5 tautan) supaya Pengelola tak perlu menyetel filter
  dulu; versi diambil dari filter & di mode ini pilihan "Murni + Perubahan"
  dicabut (ia cuma mematikan tombolnya). Di laporan usulan cetak se-kab sengaja
  TIDAK ADA: angkanya belum final, dan yang tercetak akan terbaca sbg ketetapan.
  Default mode `ditetapkan` = perilaku lama halaman ini.
- **TKDN ikut di lembar cetak Pengadaan**, tepat setelah Spesifikasi Nama Barang
  (permintaan user 2026-08-13) → 13 kolom. Nilainya di-lookup dari
  `rkbmd_standar` lewat `standar_id`, **bukan** disalin ke `rkbmd_item` (dua
  sumber kebenaran yang bisa berbeda — alasan yang sama dgn pop-up Validasi);
  ditempelkan ke itemnya sesudah ditarik supaya tak perlu dialirkan sbg prop
  lewat enam komponen. `-` berarti tak ber-TKDN / tak bersandar SSH, sengaja
  bukan `0%`. ⚠️ Lebar tabel & posisi baris JUMLAH kini **DIHITUNG** dari
  `JUDUL_PENGADAAN` (`KOLOM_PENGADAAN`, `ISI_KOSONG_PENGADAAN`,
  `KOLOM_JUMLAH_PENGADAAN`) — dulu angka 12/10/8 ditulis tangan di sembilan
  tempat, jadi menyisipkan satu kolom berarti menyunting sembilannya & yang
  terlewat baru ketahuan sesudah lembarnya dicetak.
- ⚠️ **Deploy-ordering: migrasi 20260813_02 WAJIB jalan SEBELUM deploy kode** —
  menu Usulan, Validasi, Pelaporan, & halaman cetak sudah men-`select` kolom
  `nihil`; tanpa kolomnya keempatnya mati total. Pola yang sama dgn 20260813_01.

### Pembagian menu RKBMD (keputusan user 2026-08-13, sore)

Tiga menu, tiga peran, dan pembagiannya **bukan selera tata letak** — ia
mengikuti siapa pemilik keputusannya:

| Menu | Milik siapa | Isinya |
|---|---|---|
| **Usulan** | operator SKPD | menyusun · Nyatakan NIHIL · **Cetak lembar usulan** · Ajukan (lewat pop-up) · Hapus |
| **Validasi** | Pengelola Barang | 2 tab: **Usulan** (draft+diajukan+ditolak, pantau siapa belum menyusun) & **Tervalidasi** (disetujui). **Setujui · Tolak · Buka Kunci** semuanya di sini |
| **Pelaporan** | Pengelola Barang | MURNI KELUARAN: Export Excel + **Cetak se-Kabupaten**, keduanya HANYA dokumen `disetujui` |

- **Buka Kunci PINDAH dari Usulan ke Validasi.** Menyetujui, menolak, dan
  membatalkan penetapan adalah tiga sisi dari satu wewenang; tersebar di dua
  menu berarti operator SKPD melihat tombol yang bukan haknya. `onBukaKunci`
  sudah dicabut dari `DokumenPanel` — jangan dikembalikan.
- **Dua laporan (Usulan & Setelah Validasi) PINDAH dari Pelaporan ke Validasi**
  sebagai dua tab. Yang memantau dan yang memutuskan orang yang sama, jadi tak
  perlu pindah menu di tengah pekerjaan.
- ⚠️ **Pelaporan tak boleh lagi memuat dokumen yang belum ditetapkan** — tak ada
  filter status sama sekali di situ. Apa pun yang keluar dari menu Pelaporan
  terbaca sebagai ketetapan, dan angka yang masih bisa berubah tak boleh ikut
  tercetak. `versi` juga wajib tunggal (tak ada pilihan "semua").
- **Tata letak tombol di menu Usulan** (permintaan user): di ATAS hanya aksi
  MENYUSUN — Tambah Kartu (hijau) & Nyatakan NIHIL (**kuning**, karena ia
  PERNYATAAN, bukan aksi rutin). Yang MENGAKHIRI dokumen turun ke bilah penutup
  di ujung halaman: Cetak lembar usulan (putih) · Ajukan (hijau) · Hapus
  dokumen (merah). Dulu semuanya bertumpuk satu baris, jadi "Ajukan" duduk
  bersebelahan dengan "Tambah Kartu" padahal keduanya berlawanan arah.
- **Unggah lampiran PINDAH ke pop-up "Ajukan"** (`AjukanModal`), tak lagi jadi
  kartu permanen di halaman. Kartu yang selalu terpampang membuat operator
  mengunggah lebih dulu lalu lupa menekan Ajukan; pop-up muncul tepat saat ia
  sudah berniat mengirim, dan kalau lampirannya belum ada di situlah tempat
  paling tepat menjelaskan urutannya (cetak → ttd → pindai → unggah). Kartu
  lampiran masih ditampilkan **read-only** saat dokumen sudah tak bisa
  disunting, sebagai bukti apa yang terlanjur dikirim.
- **Tombol Cetak dicabut dari menu Validasi** (termasuk pop-up rincian): yang
  ditelaah di situ adalah LAMPIRAN bertanda tangan (📄 Dokumen), sedangkan
  mencetak ulang dari sana justru menghasilkan lembar TANPA tanda tangan yang
  mudah tertukar dengan berkas sah.

### Kartu RKBMD Pengadaan diisi lewat POP-UP (user 2026-08-13)

"Tambah Kartu" tak lagi melahirkan kartu KOSONG di halaman lalu diisi di tempat;
ia membuka pop-up dua langkah: **Program/Kegiatan/Sub Kegiatan → barang
pertama** (`KartuModal`). Langkah 2 memakai ulang `RkbmdPengadaanForm` apa
adanya — form itu sudah menuntun jenis aset → kode barang SSH → kode rekening →
kuantitas + angka eksisting. Jangan menyalin alurnya ke pop-up.

- ⚠️ Ini **melonggarkan** catatan 2026-08-10 *"jangan kembalikan pola 'isi di
  picker, simpan di tombol lain'"*. Yang dilarang waktu itu tautan simpan
  TERPISAH di halaman yang sama: picker terlihat terisi → operator mengira
  tersimpan → menekan Ajukan → pilihannya tak pernah sampai ke DB. Di pop-up
  bentuk risikonya beda: selama belum disimpan **kartunya belum ada sama sekali**
  di halaman, jadi tak ada yang bisa terbaca sebagai "sudah tersimpan". Menutup
  pop-up = tak terjadi apa-apa — lebih aman daripada kartu kosong yang terlanjur
  lahir dari satu klik nyasar.
- **Header kartu BOLEH DIUBAH** (bukan "salah berarti hapus"), lewat pop-up yang
  sama via tombol ✎ Ubah. Aman karena item menempel lewat `paket_id`, bukan
  lewat teks sub kegiatannya — tak ada angka yang ikut bergeser; dan kalau
  lembarnya sudah diteken, `trg_rkbmd_paket_lampiran` mencabut lampirannya
  otomatis. Menghapus kartu tetap ada, tapi ia MEMBAWA SERTA itemnya, jadi
  memaksa hapus-dan-ulang berarti menghanguskan puluhan barang hanya karena satu
  dropdown keliru.
- UNIQUE `(rkbmd_id, sub_kegiatan)` tetap penjaganya; pesan `23505`
  diterjemahkan jadi kalimat yang menyuruh menambahkan barang ke kartu yang
  sudah ada.

### Standar Harga: alur usulan→validasi (user 2026-08-13) — DB SELESAI, LAYAR BELUM

**Sudah dibangun (migrasi 20260813_03 + `lib/rkbmdStandarUsulan.ts`):**
- Tabel `rkbmd_standar_usulan` → `_item` → `_rekening`. Nama sengaja tetap
  keluarga `rkbmd_standar_*` supaya hubungannya terbaca dari namanya saja;
  BUKAN prefix baru (`sh_*`) yang memecah satu keluarga jadi dua tempat.
- Partial unique `uq_standar_usulan_berjalan` — paling banyak SATU usulan
  berjalan per SKPD/tahun/jenis, tapi riwayat yang sudah selesai bebas berapa
  pun (SKPD tetap boleh mengusulkan tambahan sesudah usulan pertama ditetapkan).
- `fn_standar_usulan_status_guard` (admin-only utk setuju/tolak; menolak
  pengajuan usulan KOSONG) & `fn_standar_usulan_item_guard` (baris terkunci
  sesudah diajukan + **bentuk sah per jenis**: ssh/hspk wajib kode+harga,
  asb/sbu wajib harga & kode HARUS kosong, sbsk wajib kode+kuantitas+satuan
  pengukur). Bentuk divalidasi di DB, bukan cuma UI — baris yang salah bentuk
  kalau lolos baru meledak saat DISETUJUI, di tangan penelaah.
- `fn_standar_usulan_setujui(p_id)` — seluruh baris masuk bak bersama, atomik.
- ⚠️ `fn_rkbmd_standar_simpan` dapat parameter ke-10 **`p_skpd_id`**. Versi lama
  selalu mengambil SKPD dari `auth.uid()`, jadi kalau dipakai saat ADMIN
  menyetujui, baris bak bersama akan dikreditkan ke SKPD admin — bukan ke
  pengusulnya. Fungsinya **di-DROP dulu lalu dibuat ulang**: menambah parameter
  ber-DEFAULT tanpa membuang versi 9-argumen membuat panggilan lama ambigu
  ("function is not unique"). Sudah diuji ke DB: panggilan 9-argumen dari form
  SSH tetap jalan, dan kredit jatuh ke SKPD pengusul.
- Lampiran bertanda tangan: kolomnya SUDAH ADA (`dokumen_paths`,
  `dokumen_diunggah_at`) tapi gerbangnya **sengaja belum dinyalakan** — user
  belum memintanya untuk standar harga. Tiga baris di
  `fn_standar_usulan_status_guard` tinggal dibuka kalau nanti perlu.

**Layar (SELESAI):** `StandarUsulan` · `StandarValidasi` · `StandarPelaporan`
di `/dashboard/rkbmd/standar-harga/{usulan,validasi,pelaporan}`. Sidebar dipecah
jadi dua kelompok ber-alur kembar — **Standar Harga** & **RKBMD**, masing-masing
Usulan · Validasi · Pelaporan.

- **Lima menu per-jenis lama (SSH/SBSK/ASB/SBU/HSPK) dilebur** jadi satu Usulan
  Standar Harga; jenisnya dipilih di dalam layarnya. ⚠️ **Rutenya sengaja
  DIBIARKAN HIDUP** (cuma hilang dari sidebar): `StandarHargaWorkspace` adalah
  satu-satunya jalan admin **menyunting/menghapus** baris yang terlanjur salah
  di bak bersama — alur usulan hanya bisa MENAMBAH. Jangan dibuang sebelum ada
  penggantinya.
- **Pelaporan Standar Harga tak punya tombol Tambah**: menambah langsung ke bak
  bersama akan memintas seluruh alur usulan→validasi. Ia juga tak perlu filter
  status — sejak 20260813_03 satu-satunya jalan masuk ke `rkbmd_standar` adalah
  `fn_standar_usulan_setujui`, jadi isinya **dengan sendirinya** tervalidasi.
- ⚠️ **"Buka Kunci" di Validasi Standar Harga TIDAK menarik kembali baris yang
  sudah masuk bak bersama** — ia cuma mengembalikan status usulannya ke draft.
  Disengaja & dikatakan terus terang di konfirmasinya: begitu jadi acuan
  bersama, SKPD lain mungkin sudah memakainya menyusun RKBMD, dan menariknya
  diam-diam membuat dokumen mereka menunjuk barang yang mendadak lenyap.
  Ini BEDA dari Buka Kunci RKBMD, yang memang tak meninggalkan jejak ke mana-mana.
- Pesan hasil persetujuan memakai `ringkasHasil()` — "3 barang baru · 2 sudah
  ada (tidak diduplikasi) · 1 kode rekening digabungkan". Penggabungan itu
  justru inti bak bersama; "berhasil" saja menyembunyikan yang paling perlu
  diketahui penelaah.

⚠️ **Deploy-ordering: migrasi 20260813_03 WAJIB jalan SEBELUM deploy kode** —
ia mem-`DROP` lalu membuat ulang `fn_rkbmd_standar_simpan`. Selama jendela
antara migrasi & deploy tak ada yang rusak (tanda tangan 9-argumen tetap
dilayani), tapi kode yang menyentuh tabel usulan akan gagal kalau tabelnya
belum ada.

Rancangan asli & alasannya:

Menu RKBMD dipecah jadi dua kelompok, masing-masing **Usulan · Validasi ·
Pelaporan**: satu untuk **Standar Harga**, satu untuk **RKBMD**. Di Usulan
Standar Harga, hal pertama yang dipilih operator adalah JENIS usulannya — SSH ·
ASB · SBU · HSPK · **Standar Kebutuhan (SBSK)** — selebihnya alurnya sama.

⚠️ **Keputusan model data yang WAJIB dipatuhi: usulan ditampung di TABEL
STAGING sendiri, bukan kolom `status` di `rkbmd_standar`.** Sebabnya bak
bersama: `uq_rkbmd_standar_identitas` membuat usulan SKPD yang masih *pending*
MEMBLOKIR SKPD lain mengusulkan barang yang sama — terblokir oleh baris yang tak
bisa mereka lihat, dan tetap terblokir walau usulan itu akhirnya ditolak.
Dengan staging: tiap SKPD bebas mengusulkan, dedup & gabung rekening baru jalan
**saat approve** memakai RPC `fn_rkbmd_standar_simpan` yang sudah ada.
Untung besarnya: **picker RKBMD tak perlu diubah sama sekali** — isi
`rkbmd_standar` dengan sendirinya berarti "sudah tervalidasi".

SBSK ikut satu pintu walau bentuknya beda (kuantitas standar per satuan
pengukur, bukan harga) → staging-nya butuh kolom harga & kuantitas yang saling
nullable, dengan CHECK per jenis seperti pola `rkbmd_standar` sekarang
(ssh/hspk wajib `kode`; asb/sbu `kode` NULL).

### Ukuran kertas & nama berkas cetak (user 2026-08-13)

- **Lembar se-Kabupaten = F4 landscape** (`330mm 215mm`); **lembar per-SKPD
  tetap A4 landscape**. Dua-duanya landscape — tabel Pengadaan 13 kolom
  mustahil muat di lebar 215 mm.
- **Nama berkas unduhan lewat `document.title`** (satu-satunya cara menyetel
  nama bawaan "Save as PDF" dari halaman): `Usulan RKBMD_<SKPD>_<tahun>` dan
  `RKBMD_Kab Kediri_<tahun>`. Karakter terlarang Windows (`\ / : * ? " < > |`)
  dibuang — nama SKPD boleh memuat garis miring & dialog simpan akan menolaknya.
- ⚠️ **Tanggal, judul, & URL di tepi hasil cetak itu header/footer BAWAAN
  BROWSER** — halaman web TIDAK BISA memindah atau menghapusnya lewat CSS.
  Satu-satunya cara: hilangkan centang **"Headers and footers"** di dialog
  Print. Identitas kita sendiri dicetak di kanan atas lembar (`KopKanan`).
  Jangan menghabiskan waktu mencari trik CSS untuk ini; tidak ada.
- **Blok tanda tangan se-Kabupaten**: tanggal DIKOSONGKAN (`Kediri, … - … -
  <tahun−1>`) untuk ditulis tangan — rekap ini diteken entah kapan setelah
  dicetak, jadi mencetak tanggal hari ini justru memaksa penanda tangan
  mencoret. Jabatannya **dipaku "Sekretaris Daerah"**, sengaja BUKAN
  `ttd.jabatan`: kolom itu memuat jabatan struktural pegawainya dan sempat
  mencetak "Kepala Sekretariat Daerah" — bukan Sekda. Yang ikut pilihan
  operator hanya NAMA & NIP.

### Alur RKBMD yang disepakati (user 2026-08-13) — BARU SEBAGIAN DIBANGUN

1. SKPD menyusun RKBMD → **cetak lembar usulan** (✅ ada, di menu Usulan) →
   ditandatangani kepala kantor.
2. **Ajukan WAJIB melampirkan** PDF bertanda tangan + surat pengantar (satu
   berkas). ✅ **SUDAH DIBANGUN** (migrasi 20260813_01) — rincian di bawah.
3. Validasi oleh Pengelola → **cetak se-Kabupaten** (✅ ada) → keluarannya
   **SK RKBMD TA 20xx**. ⛔ Format SK-nya **BELUM DIBANGUN**.

**Lampiran wajib (migrasi 20260813_01).** Kolom `rkbmd.dokumen_paths text[]` +
`dokumen_diunggah_at`; berkasnya ke bucket **`dokumen-sumber`** (privat, 10MB,
image+pdf — sama dgn Pengalihan & Pengamanan), prefix `rkbmd-usulan/`, dibuka
lewat signed URL. **Tak perlu migrasi storage**: policy `dokumen_sumber_*`
bersifat se-bucket, bukan per-prefix (diverifikasi 2026-08-13).

- **SATU berkas, bukan daftar** (permintaan user: "pdf satu file") — lembar
  bertanda tangan & surat pengantar digabung sendiri oleh operator. Kolomnya
  tetap `text[]` supaya kalau nanti perlu lebih dari satu tak usah migrasi lagi;
  yang membatasi jadi satu adalah layarnya. Mengunggah = MENGGANTI.
- **Penegaknya trigger, bukan tombol.** `fn_rkbmd_status_guard` menolak transisi
  ke `diajukan` kalau `cardinality(dokumen_paths)=0`. `dokumen_diunggah_at`
  diisi/dikosongkan OTOMATIS oleh trigger yang sama mengikuti `dokumen_paths` —
  **jangan diset dari kode**, biar tak bisa berbohong.
- ⚠️ **Isi berubah → lampiran DICABUT OTOMATIS** (`fn_rkbmd_lampiran_batal`,
  trigger di `rkbmd_item` DAN `rkbmd_paket`). Tanpa ini operator bisa: cetak →
  tanda tangan → lampirkan → SUNTING itemnya → ajukan; kertas & catatan berbeda
  **tanpa satu pun pesan error**. Ongkos yang diterima: satu koreksi kecil =
  tanda tangan ulang.
- ⚠️ **Status `diajukan` IKUT ditarik kembali ke `draft`** saat isinya berubah.
  Sebabnya `fn_rkbmd_item_lock` cuma mengunci item saat `disetujui`, jadi
  dokumen yang SUDAH diajukan itemnya masih bisa disunting — tanpa aturan ini
  penelaah bisa menyetujui dokumen yang isinya sudah berbeda dari PDF yang
  diteken. Mencabut lampirannya saja akan menyisakan keadaan mustahil:
  berstatus "diajukan" tapi tanpa lampiran, padahal lampiran itu syarat masuk.
  Status `disetujui` **sengaja dilewati** — itu catatan final & lampirannya
  bukti; membuangnya justru menghapus jejak.
- **UI wajib memuat ulang HEADER tiap isi berubah**, bukan cuma item/kartunya
  (`reloadIsi` di RkbmdWorkspace memanggil `loadHeaders` juga). Kalau tidak,
  layar masih memamerkan "✓ Terlampir" & tombol Ajukan hidup padahal DB sudah
  mencabutnya — kesenjangan UI-vs-DB yang justru paling membingungkan.
- Menu **Validasi** menampilkan tautan 📄 Dokumen per baris (signed URL dirakit
  **di muka** saat memuat antrean — `window.open` sesudah `await` diblokir
  peramban sbg pop-up). Dokumen tanpa lampiran ditandai ⚠ — normalnya tak ada,
  kecuali diajukan sebelum aturan ini berlaku.
- **Kompatibilitas:** 6 dokumen yang ada per 2026-08-13 semuanya `disetujui`
  tanpa lampiran & tak terganggu — guard hanya menyala pada TRANSISI menuju
  `diajukan`. Baru terasa kalau salah satunya di-"Buka Kunci" lalu diajukan lagi.
- ⚠️ **Deploy-ordering: migrasi 20260813_01 WAJIB jalan SEBELUM deploy kode** —
  kode sudah men-`select` `dokumen_paths`/`dokumen_diunggah_at`; tanpa kolomnya
  query header gagal & menu Usulan + Validasi mati total.
- ⚠️ **Deploy-ordering: migrasi 20260810_01 WAJIB jalan SEBELUM deploy kode** —
  halaman baru langsung query `rkbmd_standar` & RPC yang belum ada. Sebaliknya
  `DROP TABLE rkbmd_ssh` di akhir migrasi membuat halaman Admin → SSH versi LAMA
  error selama jendela antara migrasi & deploy; itu diterima karena tabelnya
  terbukti KOSONG (0 baris, dicek 2026-08-10) dan halamannya memang diganti.

## Rekonsiliasi BMD — Saldo Awal Semester I sempat berakumulasi NOL

Insiden 2026-08-11. Rekonsiliasi Semester I menampilkan baris **SALDO AWAL**
dengan Akumulasi kosong dan Nilai Buku = Nilai Perolehan (mustahil untuk barang
yang sudah tersusut), lalu seluruh akumulasi awal muncul di baris **Selisih**.

- **Sebabnya:** `penyusutan_semester` **tidak pernah berisi 2025-S2** — posisi
  akhir 2025 itu data impor e-BMD, bukan hasil engine, dan tersimpan di payload
  ledger `saldo_awal` (`akumulasi_2025`, `nilai_buku_awal`). Sementara itu
  `fetchSnapshotPositions` cuma memberi cadangan untuk `perolehan`
  (`p ? p.nilai_perolehan : aset.nilai_perolehan`); `akumulasi`/`nilai_buku`
  langsung 0 kalau baris engine tak ada. Saldo Awal S1 = snapshot 2025-S2 →
  semua asetnya tanpa baris engine → akumulasi nol seluruhnya.
- **Buktinya** (BKAD 1.3.2 intra): Selisih akumulasi 926.099.171 = persis
  akumulasi akhir 965.096.688 − beban periode 38.997.517. Dicek se-pemda:
  Σ`akumulasi_2025` 4.032.584.622.838,89 + Σbeban 2026-S1 145.668.260.154,04 =
  Σakumulasi 2026-S1 4.178.252.882.992,93 (selisih 2e-6, pembulatan).
- **Perbaikannya:** `fetchBaselinePos()` — aset yang terlihat tapi tak punya
  baris engine posisinya dibaca dari `saldo_awal`/`saldo_awal_checkpoint`
  (checkpoint TERBARU ber-periode ≤ periode diminta, pola `hitungJadwalAset`).
  Hanya untuk yang missing, jadi di 2026-S1/S2 praktis tak berbiaya.
- Efeknya berantai & ketiganya perbaikan: (1) Saldo Awal S1 benar; (2) baris
  PENGURANGAN ikut membawa akumulasi bawaan — `attribusiPenyusutan` mengambil
  `pw.akumulasi` yang dulu nol, jadi barang keluar seolah tak pernah tersusut;
  (3) Selisih runtuh ke ~0. **Semester II tak berubah** (saldo awalnya 2026-S1
  yang memang punya baris engine).
- ✅ **`perolehan` Saldo Awal kini dari BARIS LEDGER baseline** (kolom `nilai`
  baris `saldo_awal`/`saldo_awal_checkpoint`), bukan lagi dari register
  (2026-08-12; sebelumnya sengaja dibiarkan & tercatat di sini sbg keterbatasan).
  Register memuat nilai HARI INI, jadi barang yang dikoreksi/dikapitalisasi di
  2026 membuat Saldo Awal **Semester I** memuat nilai yang belum pernah berlaku
  pada akhir 2025, sementara Saldo Akhir-nya (dari engine) sudah benar —
  selisihnya jatuh ke baris "Selisih (belum terpetakan)" dan TAK PERNAH bisa
  terpetakan, karena baris koreksinya ada di periode LAIN. Terbukti di data
  hidup: Setda −1.614.744.112 & Dinas LH +948.955.351 di 2026-S1, dari dua aset
  yang dikoreksi Juli 2026. Sesudah diperbaiki: `nilai` baris baseline = nilai
  perolehan engine 2026-S1 untuk **SEMUA** aset (0 yang beda).
  ⚠️ Sumbernya baris ledger yang SAMA dgn akumulasi & nilai buku — sengaja BUKAN
  `aset_awal_2026` lewat NIBAR (rencana lama): satu baris = satu periode, jadi
  ketiganya dijamin dari checkpoint yang sama, dan ikut benar untuk
  `saldo_awal_checkpoint` tahun berikutnya yang tak punya padanan di tabel
  snapshot 2026. Hanya **Semester I** yang terdampak — Saldo Awal Semester II
  membaca baris engine S1 yang memang ada, jadi tak pernah jatuh ke cadangan.

## Rekonsiliasi BMD — tampilan & cetak (2026-08-11)

- **Nol ditampilkan `–`, bukan `0`** (permintaan user): di lembar seluas ini
  deretan nol menenggelamkan sel yang benar-benar berisi. Tetap abu-abu & tak
  diwarnai — nol bukan mutasi.
- **Blok Penambahan hijau, Pengurangan merah.** `grup` di `RowDef` diisi
  OTOMATIS lewat `ROWS_TAMBAH`/`ROWS_KURANG` yang di-spread ke `ROWS`, supaya
  baris baru tak bisa kelupaan diwarnai. `grup` **tidak dipakai perhitungan apa
  pun** — murni warna.
- ⚠️ Warna itu **mencabut penanda lama "angka teal = bisa diklik"**; penanda
  drill-down dipindah ke **garis bawah putus-putus**, dan kalimat bantuannya
  ikut diubah. Kalau warnanya diutak-atik lagi, jaga tetap ada penanda
  klik yang bukan warna.
- **Export PDF = `window.print()` atas halaman itu sendiri**, BUKAN rute
  `/cetak/...` terpisah. Sengaja: seluruh angkanya lahir dari
  `prepareSnapshotCtx` → `fetchSnapshotPositions` → `attribusiPenyusutan` yang
  mahal dan bergantung `descendantIds` hasil `SkpdCombobox` — subtree Dinas
  Pendidikan saja 694 id, tak mungkin dititipkan lewat URL, dan menghitung ulang
  membuka celah PDF berbeda dari layar. `#cetak-rekon` diisolasi dgn pola
  `visibility:hidden` atas `body *` supaya cetakan tetap bersih tanpa perlu tahu
  susunan layout dashboard.
- **A4 landscape, SATU JENIS ASET = SATU LEMBAR** (`break-after: page` per
  kartu; kartu terakhir dikecualikan supaya tak menyisakan halaman kosong).
  Supaya 9 kolom × ~45 baris muat kanan-kiri DAN atas-bawah, font ditekan ke
  6,5px + padding 0,5px dan `table-layout: fixed` dgn kolom label 20% — tanpa
  fixed, kolom label melar mengikuti teks terpanjang lalu mendorong angka keluar
  halaman. Label MEMBUNGKUS (`overflow-wrap: anywhere`), angka tidak (`nowrap`).
- ⚠️ **Kop "Berita Acara" sengaja DIBUANG** (user 2026-08-11, membatalkan
  permintaan sehari sebelumnya): sejak tiap jenis aset punya lembar sendiri, kop
  tiga baris itu terulang di setiap halaman. **Konsekuensi yang diterima: berkas
  cetak tidak menyebut SKPD & periode sama sekali** — identitas lembar cuma
  judul jenis aset. Kalau nanti diminta kembali, `applied` perlu ikut membekukan
  `skpdId` lagi (dulu ada, dibuang bersama kopnya supaya tak jadi kode mati).

## Koreksi → Penggabungan Barang (N baris → 1 induk, migrasi 20260811_01+02)

Alasan KELIMA di menu Pembukuan → Pengelolaan → Koreksi (keputusan user
2026-08-11). Impor e-BMD memecah satu barang jadi banyak baris kalau satuannya
bukan "unit": **"Pagar Besi" UPTD SMPN 2 Mojo (skpd_id 108), kode
1.3.2.05.02.06.121, tgl 2025-02-05 → 35 baris × Rp721.500 = Rp25.252.500**,
tiap baris `jumlah=1`. Itu SATU pagar.

- ⚠️ **BUKAN "Pencatatan Ganda", dan menukarnya merusak neraca diam-diam.**
  Pencatatan Ganda = barang kecatat DUA KALI → duplikat dibuang, total nilai
  **TURUN**. Penggabungan = satu barang TERPECAH → nilai **DIJUMLAHKAN**, total
  **TETAP**. Memakai menu lama untuk kasus pagar menghapus Rp24.531.000 dari
  neraca tanpa satu pun pesan error. Deskripsi kedua alasan di `ALASAN_OPT`
  sengaja saling menunjuk — jangan diringkas.
- **Syarat gabung: kode barang + nilai perolehan + tanggal perolehan SAMA
  PERSIS** (`kunciGabung`, satu string biar tak ada tempat yang membandingkan
  dua dari tiga). Nama, merek, **satuan**, & spesifikasi BOLEH beda — justru itu
  yang selama ini menghalangi kasus pagar (satu barang tersebar di satuan "Meter
  Persegi"/"unit"/"Buah"/"Set"). Kode tetap wajib: 49.156 kelompok se-pemda
  punya nilai+tanggal sama, terbesar 5.481 baris — tanpa kode, salah centang
  bisa melebur ribuan barang tak sejenis.
- **Hasil gabungan ADALAH induknya sendiri** (aset & NIBAR yang sudah ada),
  bukan aset baru. Sisa masa manfaat & tanggal perolehan ikut induk. Karena itu
  **`penggabungan_masuk` TIDAK didaftarkan di `LAHIR`** (lib/visibilitas.ts):
  induk memang sudah ada sejak tanggal perolehannya, dan pendaftaran keliru di
  situ justru akan MENGHILANGKAN barang sah dari periode sebelum penggabungan —
  kebalikan persis dari insiden 2026-08-05 yang melahirkan daftar itu.
- **Tanggal SEMUA baris ledger = tanggal DOKUMEN kartu** (`h.tanggal`), bukan
  tanggal perolehan barang.
- **`penggabungan_masuk.nilai` = DELTA (Σ barang SUMBER saja), bukan nilai penuh
  hasil gabungan.** Ini yang menentukan Selisih Rekonsiliasi nol atau tidak:
  induk sudah duduk di Saldo Awal, jadi nilai penuh membuat kolom Penambahan
  kelebihan tepat sebesar nilai induk sendiri. Nilai penuhnya tetap terekam di
  `payload.nilai_perolehan_baru` (dipakai engine & register). Polanya sama
  dengan `kapitalisasi`/`koreksi_nilai` — sama-sama menaikkan nilai aset yang
  sudah ada.
- **`akumulasi_baru` WAJIB ikut & dibaca dari `penyusutan_semester` periode
  SEBELUM tanggal dokumen** (pola basis Pemecahan). UI **MENOLAK menyimpan**
  kalau ada satu saja anggota yang belum punya baris engine di periode itu —
  jatuh ke 0 diam-diam akan menghapus akumulasi barang tsb dari neraca.
- **Atribusi Rekonsiliasi punya cabang khusus** (`attribusiPenyusutan`,
  lib/rekon.ts): `penggabungan_masuk` satu-satunya baris "tambah" yang menempel
  pada aset yang SUDAH ada di sel, jadi akumulasinya = `(akum_P − beban_P) −
  akum_{P−1}` = akumulasi yang DISERAP dari barang sumber. Diperlakukan seperti
  kapitalisasi (akumulasi nol) → akumulasi 34 baris yang keluar tak punya
  penyeimbang & seluruhnya jatuh ke baris Selisih. Dikunci lib/rekon.test.ts.
- **Spesifikasi hasil gabungan** (nama/satuan baru) dititipkan di
  `payload.spek` + `spek_prev` event yang sama, BUKAN baris `koreksi_spesifikasi`
  tersendiri: satu peristiwa = satu baris ledger per aset, kalau tidak baris
  kedua jadi "transaksi lebih baru" yang memblokir pembatalannya sendiri.
  Batal otomatis memulihkannya (whitelist `KOREKSI_SPEK_COLS`, lib/transaksi.ts).
- **Batal**: `batal_penggabungan` tiap sumber + `batal_penggabungan_masuk` pada
  induk, keduanya ber-`payload.target_trx_id`, dicatat mundur ke tanggal dokumen
  (jadi tahunnya wajib masih terbuka) & tunduk guard baku "tak boleh ada
  transaksi lebih baru". `batal_penggabungan_masuk` **tidak menghentikan** induk
  (beda dari `batal_pemecahan_masuk`) — ia cuma membatalkan re-basisnya.
  **URUTAN TULIS DISENGAJA, dua-duanya memilih kurang-catat daripada dobel:**
  simpan = sumber dulu lalu induk; batal = induk dulu lalu sumber.
- ⚠️ **Migrasi 20260811_02 (`fn_rekap_bmd`) WAJIB dijalankan** — tanpa itu
  Laporan BMD tetap menghitung barang sumbernya (kasus pagar: Rp49.783.500,
  hampir dua kali lipat) sementara Rekonsiliasi sudah benar, jadi dua laporan
  Lapis 1 berhenti sepakat. Daftar jenisnya KEMBAR TIGA: SQL ↔
  lib/visibilitas.ts ↔ varian Daftar Barang.
- **Engine WAJIB di-run ulang** untuk periode penggabungan sesudah menyimpan.

**Cacat lama yang ikut diperbaiki (2026-08-11):** `koreksi_pencatatan_ganda`
dulu dicatat `tanggal: k.tgl_perolehan || h.tanggal` → barisnya jatuh di periode
PEROLEHAN, bukan periode dokumen koreksi, DAN ditolak trigger tahun buku kalau
barangnya diperoleh di tahun terkunci (jenis itu tak ada di whitelist
`fn_cek_tahun_buku`) — jadi duplikat warisan e-BMD 2025 tak bisa digabung sama
sekali. Kini `h.tanggal`. Konsekuensi yang diterima: duplikatnya hilang sejak
periode koreksi, bukan surut ke semua periode; modul pelaporan yang memakai
`fetchVoidedAsetIds` tetap membuangnya dari periode mana pun (daftar itu
period-agnostic). Ini **melonggarkan** pengecualian yang tertulis di rules.md
§1.9 untuk jenis tsb.

## Daftar Barang Awal — `head:true` menelan sebab kegagalan (2026-08-12)

Gejala: Saldo Awal → Daftar Barang Awal, Jenis Aset 1.3.5 tanpa filter SKPD →
**"Gagal memuat data:" lalu KOSONG**, "0 barang", tabel hampa. Di saat yang sama
Daftar Barang biasa sanggup menampilkan 173.262 baris golongan yang sama. User
menegaskan (2026-08-12) halaman ini harus **sekuat Daftar Barang**, dan Daftar
Barang sendiri tak boleh ikut rusak.

- **Sebabnya bukan datanya, tapi CARA BERTANYANYA.** Query hitung memakai
  `.select(COLS, { count: 'exact', head: true })`. Respons **HEAD tidak
  berbadan**, jadi supabase-js tak punya apa pun untuk di-parse dan
  mengembalikan `error.message` **KOSONG**. Akibatnya cabang khusus timeout di
  `gagalMuat` (`/timeout|57014/`) diuji atas string kosong → tak pernah menyala,
  dan operator dapat kalimat menggantung tanpa satu pun petunjuk. Pesan yang
  paling dibutuhkan justru yang paling rajin dibuang.
  **JANGAN pakai `head: true` untuk query yang errornya perlu dibaca manusia.**
- **AKAR SEBENARNYA: ronde ke-4 dari `LIKE` yang tak bisa jadi index-cond.**
  Diukur langsung ke DB dgn RLS aktif (2026-08-12), `statement_timeout` =
  **8 dtk**: query halaman PERTAMA (`LIMIT 50 OFFSET 0`) makan **9.518 ms**.
  Plan-nya `Index Scan using idx_saldo_kode` dgn **`Rows Removed by Filter:
  235.828`** — karena `~~` tidak leakproof, `kode LIKE '1.3.5.%'` ditinggal
  sbg filter biasa, dan `ORDER BY kode ...` membuat planner menyusuri index
  kode DARI PALING AWAL sambil membuang seperempat juta baris satu per satu.
  Jadi bukan cuma hitungannya yang tumbang — **halaman pertamanya pun tak
  pernah sanggup**. Ini cerita yang sama dgn GIS Tanah, Kendaraan, &
  `fetchOwnerOverrides`.
  ⚠️ Dugaan awal "migrasi 20260728_02 belum jalan" **SALAH** — policy-nya sudah
  InitPlan (`(SELECT fn_is_admin()) OR fn_skpd_visible(skpd_id)`), diverifikasi
  ke `pg_policies`. Dan angka "227rb baris" yang tertulis di bagian Baseline
  juga **basi**: `aset_awal_2026` kini **418.102** baris (1.3.2 = 218.251,
  1.3.5 = 173.262) — sama besar dgn register.
- **Obatnya BUKAN partial index per golongan, tapi kolom `golongan`.** Tabel ini
  sudah lama punya kolom `golongan`, terisi penuh (0 NULL) & **100% cocok** dgn
  `substring(kode from '^\d+\.\d+\.\d+')` di seluruh 418.102 baris. `=` pada
  text itu **leakproof** → boleh turun jadi index-cond di bawah RLS. Jadi cukup
  SATU index biasa untuk kedelapan golongan, bukan 8 partial index:
  `idx_sa2026_gol_urut (golongan, kode, nilai_perolehan DESC, nibar) INCLUDE
  (skpd_id)` (migrasi **20260812_08**). Kunci urutnya sengaja SAMA PERSIS dgn
  `ORDER BY` halaman → LIMIT 50 dilayani **tanpa node Sort**. `INCLUDE
  (skpd_id)` bukan hiasan: `skpd_id` dipakai qual RLS, tanpanya `count(*)`
  terpaksa Index Scan + 173rb kunjungan heap. Hasil: halaman 1 **9.518 → 18 ms**,
  halaman terdalam (OFFSET 173.200) **819 ms**, count **8.916 → 2.755 ms**.
  ⚠️ Predikat `.eq('golongan', gol)` di kode **KEMBAR** dgn index ini — kalau
  ada yang mengembalikannya jadi `.like('kode', ...)`, indexnya diabaikan
  DIAM-DIAM & halamannya timeout lagi. Invarian `golongan` ↔ `kode` dikunci
  CHECK `aset_awal_2026_golongan_cocok_kode`: tampilan kini bersandar pada
  `golongan`, jadi kalau keduanya menyimpang barang tampil di jenis aset yang
  SALAH tanpa satu pun error.
- **`count: 'exact'` dan pengambilan baris punya biaya yang JAUH berbeda
  (2,8 dtk vs 18 ms), jadi tak boleh satu nasib.** Yang tumbang duluan selalu
  hitungannya. Dulu kegagalannya `return` → tabel kosong TOTAL, padahal barisnya
  bisa diambil. Sekarang: minta count **bareng** baris dalam satu permintaan;
  kalau gagal, **ulangi tanpa count** dan turunkan jadi peringatan (strip amber)
  — daftarnya tetap tampil. `total: number | null`, `null` = "tak terhitung",
  sengaja DIBEDAKAN dari 0. Tanpa total, tombol Berikutnya dipandu "halaman ini
  penuh" (`adaLagi`), bukan `totalPages` — kalau tidak, gagal menghitung berarti
  operator terkurung di halaman 1.
- **Loader kini try/catch/finally penuh** (`setLoading(false)` di `finally`,
  bukan di akhir jalur sukses) — aturan yang sudah lama tertulis untuk Daftar
  Barang tapi belum terpasang di sini. `handleExport` ikut dibungkus; sebelumnya
  satu query yang melempar meninggalkan tombol "Mengekspor..." nyangkut selamanya.
- **Empat kolektor pelengkap berhenti menelan `error`** (`fetchAsetInfo`,
  `fetchBidang`, `fetchUraian`, `fetchTerkunci` — semuanya `const { data } =
  await` telanjang): kegagalannya bikin kolom Keterangan/Uraian/Luas/🔒 diam-diam
  kosong dan terbaca operator sbg "barangnya memang tak punya". Sekarang
  dilaporkan lewat strip peringatan **tanpa membatalkan tabel** — barisnya sudah
  benar, dan mengosongkan halaman gara-gara kolom hiasan justru merugikan. Beda
  perlakuan dari modul Pelaporan (yang fail-closed) itu disengaja: ini halaman
  register, bukan angka yang dilaporkan ke BPK.
- ⚠️ **Deploy-ordering: migrasi 20260812_08 WAJIB jalan SEBELUM deploy kode** —
  kode sudah menyaring `.eq('golongan', ...)`; tanpa indexnya filter itu jatuh
  ke seq scan 418rb baris + sort 173rb baris, jadi halamannya tetap timeout
  (beda sebab, gejala sama).
- **Pelajaran yang berlaku umum:** `count: 'exact'` di halaman daftar itu
  **pertanyaan termahal yang paling tidak penting**. Sebelum menambahkannya di
  halaman baru, tanya dulu apakah operator benar-benar butuh angka totalnya —
  dan kalau butuh, pastikan kegagalannya tak ikut menjatuhkan daftarnya.

## Pola jurnal ber-SK (Penghapusan, Kapitalisasi, dan menu ber-No SK lain)

Menu yang punya "kartu jurnal" dengan No SK/No Dokumen + tanggal + daftar barang
memakai tabel **`jurnal_header`** (migrasi `20260704_07_jurnal_header.sql`):

- Header (`jurnal_header`) menyimpan No SK, tanggal, periode (beku), jenis,
  keterangan — **boleh diedit**. Baris ledger (`transaksi_bmd.header_id`) tetap
  beku. Jadi edit No SK/tanggal tidak melanggar aturan append-only.
- **Aturan edit tanggal (WAJIB diterapkan di setiap menu ber-SK baru):**
  - Ganti No SK / tanggal **boleh** selama tanggal tetap di **semester yang sama**.
  - Pindah semester **tidak boleh** lewat edit → user harus **batalkan & entry
    ulang**. Alasan: melindungi periode yang mungkin sudah dilaporkan ke
    atasan/inspektorat/BPK. Trigger `fn_jurnal_header_guard` menegakkan ini di DB;
    UI juga wajib memvalidasi (bandingkan `periodeDariTanggal(tglBaru)` dgn
    `header.periode`) supaya pesan error ramah.
  - `skpd_id` & `kategori` header tidak boleh diubah (itu = jurnal lain).
- **Tambah barang ("+")** ke jurnal yang sudah ada: aman untuk pola append murni
  (mis. Penghapusan — cukup insert baris ledger baru ber-`header_id` sama).
  ⚠️ Untuk Kapitalisasi, "tambah anak" BUKAN append murni: menambah nilai rehab
  bisa mengubah band overhaul & masa manfaat (recompute). Perlu keputusan desain
  terpisah, jangan diperlakukan seperti Penghapusan.
- Grouping kartu jurnal: by `header_id` (bukan lagi by `payload.no_sk`).

Saat membangun menu ber-SK berikutnya (Koreksi ber-SK, Reklasifikasi ber-SK, dll.)
gunakan pola `jurnal_header` yang sama + aturan kunci-semester di atas.

## Pola APPROVAL untuk menu Cara Perolehan (Pengadaan, Hibah, dst.)

Menu **Cara Perolehan** (Pengadaan sekarang; Hibah/Hasil Inventarisasi/Perolehan
Lainnya menyusul dgn pola sama — migrasi `20260704_12_approval_pengadaan.sql`)
butuh persetujuan admin sebelum barang resmi tercatat. Karena ledger append-only
mutlak (trigger nolak UPDATE/DELETE apa pun, termasuk barang yang "masih pending"),
solusinya BUKAN nulis ke `aset`/`transaksi_bmd` lalu filter visibility di semua
halaman pembaca — itu berisiko bocor kalau ada satu halaman yang kelupaan difilter.

Yang dipakai: **draft dulu, ledger ditulis saat approve**:
- Barang yang diinput operator ditampung di `jurnal_header.payload.draft_items`
  (JSON array) — BUKAN ledger asli. Bebas diedit/dihapus/diubah kuantitas selama
  masih `approval_status='pending'`, karena cuma UPDATE kolom biasa (jurnal_header
  bukan tabel append-only, cuma baris ledgernya yang beku).
- `jurnal_header.approval_status` ∈ {`pending`,`disetujui`,`ditolak`}. Default
  kolom = `disetujui` (supaya baris lama/kategori lain tak berubah perilaku) —
  kategori Cara Perolehan yang baru WAJIB insert eksplisit `approval_status:'pending'`.
  `'ditolak'` = LEGACY SAJA (fitur Tolak sudah DIHAPUS dari UI Pengadaan — alurnya
  disederhanakan jadi: user input → admin verifikasi → (salah) edit draft →
  Setujui; TIDAK ADA cabang tolak). Baris lama berstatus `ditolak` disaring dari
  tampilan & dari cek keunikan No SK/BAST (`.neq('approval_status','ditolak')`),
  tapi tak pernah dibuat baru.
- **Approve** (admin only, `fn_is_admin()`, ditegakkan trigger
  `fn_jurnal_header_approval_guard`): materialize `draft_items` → insert `aset`
  (kuantitas>1 di-split jadi N baris jumlah=1) + `transaksi_bmd` sekaligus, pakai
  **tanggal BAST** (atau tanggal setara serah terima) sbg tgl perolehan efektif —
  bukan tanggal kontrak, bukan tanggal approve. Baru sesudah ini barang muncul di
  Daftar Barang/Penyusutan/Laporan/Engine — otomatis, tanpa perlu filter tambahan
  di halaman-halaman itu, karena sebelumnya memang belum pernah ada di sana.
  Klasifikasi `intra_ekstra` per barang DIHITUNG OTOMATIS saat approve: nilai
  item vs `kodefikasi_bmd.batas_kapitalisasi` (`lib/bmd.ts`
  `klasifikasiKomptabel()` — nilai >= batas → intra, < batas → ekstra; tanpa
  batas terdaftar → default intra).
- **Import Excel (`PerolehanImport.tsx`, dipakai kelima menu Cara Perolehan)
  IKUT alur approval ini — TIDAK menulis langsung ke ledger** (sejak
  2026-07-13; dulu ia insert `aset`+`transaksi_bmd` langsung → barang loncat ke
  Daftar Barang tanpa approve & tak pernah muncul sbg kartu, tak bisa
  di-unapprove). Sekarang baris valid ditampung sbg `jurnal_header` draft
  `pending`, **dikelompokkan per No. BAST/Dokumen** (1 dokumen = 1 kartu),
  `draft_items`-nya mengikuti shape DraftItem menu tujuan (Pengadaan pakai
  `rekening` + tgl BAST header; Hibah dsb pakai `tglPerolehan` per item). NIBAR
  & `intra_ekstra` tetap DIGENERATE/DIHITUNG saat approve (kolom NIBAR di file
  Excel diabaikan — keputusan user 2026-07-13). Header pengadaan bertanggal =
  tgl BAST (jadi backdate ke tahun terkunci ditolak guard, sama spt entry
  manual pengadaan); header Hibah/dll bertanggal hari ini (tahun terbuka),
  tanggal perolehan asli tetap di item. No. Dokumen yg sudah ada dilewati
  (hindari kartu ganda).
- **Pengadaan Konstruksi = MULTI-KDP** (`KonstruksiPengadaan.tsx` + `lib/kdp.ts`,
  redesign 2026-07-13). 1 kontrak konstruksi (kategori `konstruksi`) bisa berisi
  **beberapa barang KDP** (mis. paket jalan → beberapa ruas) — semua di
  `payload.barang[]` (JSON, TANPA kolom/tabel baru). Tiap barang = 1 aset KDP
  (1.3.6) dgn rincian termin sendiri (`pembayaran[]`: perencanaan/fisik/
  biaya_umum/pengawasan); **nilai barang = Σ termin**. Approve/unapprove
  **ATOMIK per kontrak**: `approveKontrakKonstruksi` materialize SEMUA barang
  sekaligus (aset dibuat dulu semua → seluruh event `akumulasi_kdp` di-insert
  satu batch, all-or-nothing); `unapproveKontrakKonstruksi` balik SEMUA termin
  (`batal_akumulasi_kdp`) + sembunyikan SEMUA aset (`status='draft'`) → kalau
  10 barang, ke-10-nya hilang dari Daftar Barang sampai disetujui ulang. NIBAR
  digenerate ulang saat approve. **Kompat mundur**: payload single-KDP lama
  (`kode_kdp`+`pembayaran` flat) dibaca via `barangKdpList()` sbg 1 barang
  implisit; begitu di-save/unapprove, dinormalisasi ke `barang[]`. ⚠️ Backdate
  termin ke tahun terkunci ditolak guard (`akumulasi_kdp`/`batal_akumulasi_kdp`
  BELUM di-whitelist `fn_cek_tahun_buku`) — sama kendala pre-existing single-KDP.
  Tabel per-termin lama `proyek_konstruksi`/`proyek_barang`/`proyek_termin`
  (Opsi B, migrasi 20260712_01..04) TAK PERNAH dipakai UI → di-drop migrasi
  `20260713_01` (defensif: batal kalau ada isinya). Fungsi dead di `lib/kdp.ts`
  (`buatPaket`/`tambahBarang`/`setujuiTermin`/`reklasKdp`/dll) SUDAH dihapus
  2026-07-13 — yang tersisa cuma model merge-ke-Pengadaan (`barangKdpList`,
  `approveKontrakKonstruksi`, `unapproveKontrakKonstruksi`).
- **Kontrak DISETUJUI terkunci total** (read-only, tak ada edit/batal per-baris
  spt sebelumnya). Untuk mengubah: admin **"Buka Kunci"** (unapprove) →
  semua barang di `batal_pengadaan` (soft-delete retroaktif ke tgl asli,
  headerId disertakan di ledger reversal-nya supaya bisa dilacak balik) →
  kontrak balik ke draft (`draft_items` direkonstruksi dari barang yg dibatalkan)
  → edit → **Setujui ulang** (NIBAR digenerate ULANG, yg lama tetap tersimpan di
  aset yg sudah dihapus itu, utk audit).
- **Hapus kontrak**: draft murni (belum pernah disetujui) → hapus biasa, aman
  (`DELETE jurnal_header`, tak ada baris ledger yg nyantol). Kontrak yg PERNAH
  disetujui-lalu-dibuka-kunci (`hasLedger=true`, punya jejak ledger) → **TIDAK
  BOLEH dihapus** — diarsipkan (`UPDATE jurnal_header SET
  approval_status='ditolak'`) sbg gantinya: ledger tetap utuh (append-only
  aman), kontrak otomatis hilang dari tampilan Pengadaan, No SK/BAST bebas
  dipakai ulang (uniqueness check sudah `.neq('approval_status','ditolak')`).
  UI: satu tombol 🗑 yang sama (`hapusKontrak`), perilaku menyesuaikan
  `h.hasLedger` (arsipkan vs hapus beneran).
- **Koreksi PASCA-approve** (mis. kelebihan kuantitas baru ketahuan setelah
  disetujui, TANPA lewat unapprove): pakai jenis ledger `batal_pengadaan`
  (soft-delete `aset.status='dihapus'`, `berhenti=true` di engine, masuk
  `SEMBUNYI`). Beda dari `penghapusan_*` (itu utk disposal sungguhan) — ini
  murni koreksi input, DICATAT MUNDUR ke tanggal pengadaan aslinya (bukan hari
  ini) supaya barang dianggap tidak pernah ada sejak awal, bukan cuma berhenti
  dari sekarang.
- Draft item sudah **per-unit** sejak ditambahkan (kuantitas dipecah saat itu
  juga, bukan saat approve) — supaya tiap unit bisa beda spesifikasi/no. seri/
  foto sebelum di-approve (mis. 5 kendaraan beda nomor rangka/mesin). Field
  spesifikasi (termasuk `nama_barang`, "Spesifikasi Nama Barang") ikut sistem
  `fields` generik yg sama (lihat bagian wide-table di bawah) — semua diedit
  lewat checklist+popup, TIDAK ada field yang cuma bisa diisi sekali di form
  tambah barang (kecuali `uraian_barang`, yg baku dari kodefikasi & memang
  sengaja read-only). Centang barang **beda golongan** sekaligus → tombol Edit
  Spesifikasi disabled (`allSameGolongan()`, lib/asetFields.ts) — kolomnya beda,
  tak boleh digabung/union.
- **Pencarian + seleksi + aksi massal tabel draft = SATU modul bersama**
  `components/pengelolaan/draftSeleksi.tsx` (`useDraftSeleksi` · `DraftSearchBar`
  · `DraftBulkBar`), dipakai Pengadaan **dan** PerolehanManual (2026-08-04).
  Dua kartu "Menunggu Persetujuan" itu memang kembar sejak awal (checklist →
  Edit Spesifikasi massal); begitu ditambah pencarian & Hapus massal, menyalin
  logikanya berarti utang "ubah satu, samakan yang lain" yang di repo ini sudah
  berkali-kali dilanggar. KonstruksiPengadaan **tidak** ikut — barang KDP-nya
  hidup di `payload.barang[]`, bukan `draft_items`.
  - **Centang-semua = semua yang LOLOS pencarian saat itu**, bukan seluruh isi
    kontrak (permintaan user: satu kontrak bisa berisi beberapa jenis aset dgn
    puluhan barang, mencentang satu-satu tak masuk akal). Tanpa kata kunci ya
    seluruhnya, seperti dulu.
  - **Centang TETAP tersimpan waktu kata kuncinya diganti** — supaya barang bisa
    dikumpulkan dari beberapa pencarian. Konsekuensinya bisa ada barang
    tercentang di LUAR hasil pencarian, dan itu WAJIB tertulis di bilah aksi
    ("N di luar hasil pencarian"): tanpa itu tombol Hapus membuang barang yang
    tak kelihatan di layar. Jangan hapus keterangan itu demi kerapian.
  - Aksi massal jalan di atas `sel.dipilih` (diturunkan dari `items`), **bukan**
    isi `checked` mentah — key barang yang sudah dihapus bisa tertinggal di set.
  - **Hapus massal cuma ada di kartu DRAFT.** Isinya `UPDATE
    jurnal_header.payload`, belum menyentuh ledger sama sekali → append-only tak
    dilanggar. Kartu yang sudah disetujui tetap read-only; membuang barangnya
    tetap lewat Buka Kunci → edit → setujui ulang, atau `batal_pengadaan`.
- **`kondisi_barang` ikut di form input awal, bukan cuma menu Koreksi**
  (permintaan user 2026-08-04): ditaruh di KETIGA template `GOLONGAN_FIELDS`
  tepat sebelum Penggunaan & Keterangan — kondisi fisik itu atribut universal.
  Ia masih terdaftar di `ATRIBUT_KOREKSI` juga & tak dobel karena
  `koreksiFieldKeys()` menyaring yang sudah ada. **Tak ada migrasi**: kolom
  `aset.kondisi_barang` + CHECK 5 opsi sudah ada sejak 20260707_04 & 20260709_04,
  dan `FIELD_OPTIONS.kondisi_barang` sudah kembar dgn CHECK itu.
  ⚠️ Bareng itu ia ditambahkan ke **`ASET_FIELD_COLS`** — daftar itu yang
  menentukan field mana yang benar-benar ditulis ke `aset` saat draft
  di-materialize. **Menambah key ke template golongan TANPA menambahkannya ke
  `ASET_FIELD_COLS` = field muncul di popup, tersimpan di draft, lalu HILANG
  DIAM-DIAM saat approve** — tak ada yang error, operator baru sadar berbulan
  kemudian. Tambahkan ke dua-duanya.
- **PEMISAHAN TUGAS: pembuat kartu tak boleh menyetujui kartunya sendiri**
  (migrasi `20260727_01`, keputusan user 2026-07-27). Latarnya: picker SKPD
  (`SkpdCombobox` prop `lockToOperator`) dulu TERKUNCI MATI ke node SKPD user;
  sejak 2026-07-27 dibuka ke **seluruh subtree** — operator boleh mencatat
  barang atas nama sub-OPD, tidak lagi selalu SKPD induk. Itu membuka celah:
  `fn_is_pengurus_barang_atas` sengaja strict (`s.id <> my.id`) supaya jurnal
  node SENDIRI tetap wewenang admin pemda, tapi Pengurus Barang jadi bisa bikin
  kartu atas nama sub-OPD-nya lalu **menyetujuinya sendiri**. Ditutup di
  `fn_jurnal_header_approval_guard`: kelonggaran "Pengurus Barang atasan" batal
  kalau `created_by = auth.uid()`. Admin pemda dikecualikan. Cerminan UI =
  `bolehSetujuiJurnal()` (lib/roles.ts, pengganti `bolehSetujuiSkpd` di keempat
  komponen Cara Perolehan) — tombol Setujui/Buka Kunci dihitung **per kartu**,
  bukan per SKPD lagi, jadi header-nya wajib ikut me-select `created_by`.
  `created_by IS NULL` (baris warisan) tetap boleh disetujui — sengaja permisif.
  ⚠️ **Deploy-ordering: migrasi 20260727_01 WAJIB jalan SEBELUM deploy kode** —
  kebalikan dari alasan biasa (enum). Di sini urutannya soal KONTROL: kalau kode
  duluan, ada jendela di mana picker sudah terbuka tapi guard belum ada → self-
  approve Cara Perolehan benar-benar bisa terjadi.
  ⚠️ Jalur `mutasi_internal`/`pengalihan_status` (disetujui SKPD tujuan) TIDAK
  ikut diperketat — di situ self-approve memang sudah mungkin sejak dulu (daftar
  tujuan mutasi internal se-subtree, `PengeluaranInternal.tsx`), pre-existing dan
  perlu keputusan tersendiri kalau mau ditutup.
- **Urutan baris = KODE BARANG A→Z di TIGA halaman register** (keputusan user
  2026-07-30; dulu nilai perolehan terbesar dulu): Daftar Barang, Penyusutan,
  Daftar Barang Awal. Kuncinya **tiga**: kode → nilai perolehan turun → kunci
  UNIK. Dua kunci terakhir bukan hiasan — satu kode dipakai ribuan barang, dan
  tanpa pemecah seri unik urutannya bisa beda tiap render/request, jadi isi
  halaman 3 berpindah-pindah tiap kali dibuka. Nilai-turun dipertahankan supaya
  kebiasaan lama (barang mahal di atas) masih terasa di dalam satu kode.
  **Tapi TEMPAT mengurutkannya beda, dan itu bukan selera:**
  - Daftar Barang & Penyusutan → **di client** (`bandingKode`, kembar di dua
    berkas — ubah satu, samakan yang lain; di Penyusutan kolomnya di-alias
    `kode_barang`). WAJIB di client karena barisnya gabungan dua fetch: hasil
    query utama + barang period-aware yang ditempel di belakang
    (`partitionByPeriodOwner`) — urutan dari DB sudah pasti patah di situ.
    Aman krn kedua halaman memang menarik SEMUA baris visible ke memori.
    Perbandingan string POLOS, bukan `localeCompare`: segmen kode e-BMD sudah
    zero-padded jadi leksikografis = urutan nomor, dan jauh lebih murah utk
    200rb baris.
  - Daftar Barang Awal → **di query** (`.order('kode')…`). Paginasinya di
    SERVER (`.range()` per halaman, tak pernah menarik semua baris), jadi
    menyortir array yang tampil cuma akan mengurutkan 50 baris halaman itu.
  ⚠️ Terpisah dari urutan tampil: query pengambilan di Daftar Barang &
  Penyusutan kini `.order('nilai_perolehan')` **+ `.order('id')`** — pemecah
  seri, jangan dicopot. Barisnya ditarik `.range()` per 1.000 dan
  `nilai_perolehan` banyak kembarnya; dgn urutan tak total, baris kembar tak
  dijamin jatuh di halaman yang sama tiap query → ada yang terlewat & ada yang
  dobel TANPA SUARA (varian cacat paginasi yang sudah didokumentasikan utk
  kolektor ledger). Daftar Barang Awal sudah punya pemecah seri (`nibar`) sejak
  awal. Tak butuh index baru di ketiganya: sort node-nya memang sudah ada (tak
  ada index yang melayani `nilai_perolehan`), jadi nambah kunci di sort yang
  sama ~gratis.
- **Menu Kendaraan: kolomnya ditata ulang & TIDAK BOLEH ada `truncate`**
  (permintaan user 2026-07-30). Susunannya: SKPD · Kode Barang + Uraian Barang
  (ditumpuk) · Nama Barang + NIBAR + Kode Register (ditumpuk tiga) · Merek/Tipe ·
  Tahun · No. Polisi · No. Rangka · No. Mesin · No. BPKB · Nilai Perolehan ·
  Kondisi · Penggunaan · Keterangan. Sel tiga baris itu **kembar** dgn Daftar
  Barang & Penyusutan — termasuk penanda ⚠ `bergeserDariNibar` yang sengaja tak
  menandai apa pun kalau hasilnya `null`. Ini halaman KETIGA yang ikut pola itu:
  ubah satu, samakan semua. Dulu NIBAR, Spesifikasi, & Keterangan dipangkas elipsis pakai
  `max-w`+`truncate` — isinya cuma muncul di tooltip, yang tak terbaca saat
  ditelusuri cepat & hilang total kalau halaman dicetak. **Teks panjang
  MEMBUNGKUS, tak pernah dipangkas**; tabelnya dibiarkan melebar & digeser
  horizontal (pola yang memang sudah dianut halaman ini). Jangan pasang
  `truncate` lagi demi kerapian.
  ⚠️ Header lamanya **salah label**: kolom berjudul "Kode Register" itu isinya
  NIBAR — halaman ini tak pernah membaca `aset.kode_register` sama sekali.
  Sekarang `kode_register` benar-benar di-select & jadi baris ketiganya sendiri.
  Uraian diambil dari `aset.uraian_barang` (salinan tersimpan), BUKAN lookup ke
  `admin_kodefikasi_bmd` spt Daftar Barang — menu ini murni baca & sengaja tak
  menambah query. Spesifikasi Lainnya hilang dari layar tapi TETAP di Export.
- **`cara_perolehan` vs `asal_usul` — DUA KOLOM, SENGAJA TIDAK DISINKRONKAN**
  (keputusan user 2026-07-30). `aset.cara_perolehan` (text + CHECK:
  `saldo_awal`/`pengadaan`/`hibah_masuk`/`tukar_menukar`/`hasil_inventarisasi`/
  `perolehan_lainnya`) SUDAH diisi otomatis oleh kelima menu Cara Perolehan saat
  approve (`Pengadaan.tsx` hardcode `'pengadaan'`, `PerolehanManual.tsx` pakai
  `kategori`) — fakta dari menu, tak pernah diketik tangan. `aset.asal_usul` =
  teks BEBAS (tanpa CHECK) warisan impor e-BMD yang lebih rinci ("Pengadaan
  APBD" — menyebut sumber dana), boleh dikoreksi operator lewat Koreksi →
  Spesifikasi (`ATRIBUT_KOREKSI`) & Saldo Awal → Edit Spesifikasi.
  **Menu Cara Perolehan JANGAN dibuat ikut menulis `asal_usul`**: dua penulis
  untuk satu kolom = dua sumber kebenaran yang bisa bertentangan tanpa aturan
  siapa menang (cacat yang sudah terbukti merepotkan di cache
  `aset.pemanfaatan`), dan menulis "Pengadaan" saja justru MENURUNKAN mutu
  dibanding gaya e-BMD yang menyebut sumber dana.
  Yang dipakai: **turunan tampilan** `asalUsulTampil(asal_usul, cara_perolehan)`
  (lib/bmd.ts) — isian operator menang, kalau kosong jatuh ke
  `CARA_PEROLEHAN_LABEL`. Nol tulis ke DB, **berlaku surut** ke barang yang
  terlanjur di-approve (tak perlu backfill), dan begitu operator mengisi
  `asal_usul` punya dia yang menang. Terpasang di Daftar Barang: layar (yang
  turunan dibuat redup+italic+tooltip supaya kelihatan bukan ketikan orang) &
  Export (teks polos, tanpa penanda). **Nambah cara perolehan baru = CHECK +
  `CARA_PEROLEHAN_LABEL` + menunya, ketiganya.**

- **`uraian_barang` punya DUA sumber, dan halaman-halaman membacanya beda —
  setiap pintu yang MEMBUAT aset wajib mengisi kolomnya.** Sumber baku ada di
  `admin_kodefikasi_bmd.uraian`; `aset.uraian_barang` cuma SALINAN yang ditulis
  saat barang dibuat. Daftar Barang & Penyusutan sengaja lookup ke kodefikasi
  (selalu ikut kodefikasi terkini), tapi **KIBAR, KIR, Kendaraan, kartu
  Pengadaan/Perolehan Manual, Reklasifikasi, & Inventarisasi membaca kolom
  tersimpan** — jadi pintu pembuat aset yang lupa mengisinya bikin kartu CETAK
  keluar "-" sementara layar register kelihatan baik-baik saja, dan tak ada
  yang error. Persis itu yang terjadi 2026-08-03: **Koreksi → Pemecahan Barang**
  tak pernah mengisi `uraian_barang` (Pengadaan & Perolehan Manual mengisi),
  jadi 7 pecahan Lapak UMKM tampil normal di Daftar Barang tapi kosong di
  KIBAR. Diperbaiki dua lapis: pemecahan kini mengisi kolomnya dari kodefikasi
  (kode pecahan = kode induk), DAN KIBAR (daftar + kartu) kini lookup kodefikasi
  dulu dgn kolom tersimpan sbg cadangan — supaya baris yang terlanjur dibuat
  ikut benar tanpa nunggu backfill. Backfill 11 baris: migrasi 20260803_01
  (aman dari `trg_aset_kode_register`, `uraian_barang` di luar `UPDATE OF`-nya).
  **Bikin pintu pembuat aset baru → isi `uraian_barang`.**

- **`admin_skpd.kode_lokasi` KOSONG di SELURUH 816 baris** (dicek 2026-08-03) —
  yang terisi & jadi identitas resmi SKPD adalah **`kode_skpd`** (mis.
  `18.00.00.0000.0000`; 14 digitnya tanpa titik = segmen SKPD di NIBAR & kode
  register) plus `kode_raw` (`18.00.00`). KIBAR dulu mengisi "2. Kode Lokasi"
  dari `kode_lokasi` saja → selalu "-"; sekarang `kode_lokasi || kode_skpd`
  (kolom bernama-tepat tetap didahulukan kalau suatu saat diisi). **Halaman IPA
  (`app/dashboard/ipa/*`, `components/ipa/FormPenilaian.tsx`) masih menampilkan
  & MENGURUTKAN pakai `kode_lokasi` telanjang** — artinya label "-" & urutan
  yang sebenarnya tak mengurutkan apa-apa; belum diminta diperbaiki.
  Terkait: **Unit Pemakai di KIBAR bukan kolom `aset`** — dirangkai dari
  `admin_skpd` dgn menaiki `parent_id` dari `aset.skpd_id` (`resolveSkpdChain`).
  Pohonnya rapi per level: level 1 = `pengguna barang` (60), level 2 = `kuasa
  penguna barang` (131), level 3 = `sub kuasa penguna barang` (625).

## Spesifikasi barang: wide table + field per golongan (lib/asetFields.ts)

Field spesifikasi (mis. no. rangka/mesin utk Peralatan&Mesin, dokumen
kepemilikan/lokasi utk Tanah) disimpan sbg kolom **nullable lebar di `aset`**
(satu tabel utk semua golongan — migrasi `20260704_13`, `_14`, `_16`), BUKAN
tabel terpisah per jenis aset. `FieldKey` (lib/asetFields.ts) = nama kolom DB
PERSIS 1:1 (termasuk `nama_barang` — bukan lagi top-level field terpisah,
lihat pola APPROVAL di atas) — jaga tetap sinkron kalau ada rename kolom lagi.
`GOLONGAN_FIELDS` cuma py **3 template** dipetakan ke 8 golongan: TANAH-like
(Tanah/Gedung&Bangunan/Jalan-Jaringan-Irigasi — py dokumen kepemilikan +
`jenis_hak` dropdown + lokasi), PERALATAN_MESIN (kendaraan, no. rangka/mesin/
polisi/BPKB), ASET_LAINNYA-like (ATL/KDP/ATB/Aset Lain-Lain — versi ringkas
tanpa no. kendaraan). Field lokasi fisik = `wilayah_kode` (FK ke tabel
`admin_wilayah`, dipilih via `WilayahPicker` berjenjang Provinsi→Kab→Kec→Desa,
data di-seed migrasi `_15` khusus Jatim+Kab.Kediri) + `alamat_detail` (jalan)
+ `latitude`/`longitude` (dipilih via `MapPicker`, Leaflet+OpenStreetMap,
WAJIB di-`next/dynamic({ssr:false})` krn butuh `window`). Kolom lama
`titik_koordinat`/`lokasi` sudah DI-DROP (migrasi
`20260710_04_drop_titik_koordinat_lokasi.sql`) — dikonfirmasi kosong di
seluruh baris live sebelum di-drop, tidak ada data yang hilang. Form edit
spesifikasi selalu lewat **popup**
(`EditSpesifikasiModal`) — field-nya bisa banyak & beda per golongan, jangan
taruh inline di baris tabel (bikin panjang/scroll). Baris tabel cukup
ringkasan satu baris + tombol buka popup.

## Foto barang (Supabase Storage)

Bucket `aset-foto` (privat, limit 10MB, hanya image/jpeg|png|webp — lihat migrasi
13). Path disimpan di `aset.foto_paths text[]`. Karena bucket privat, tampilkan
foto pakai **signed URL** (`createSignedUrl`/`createSignedUrls`, expiry ~1 jam),
BUKAN public URL. Draft (belum py `aset.id`) pakai prefix `draft/<key-client>/...`
— aman dipakai selamanya, tidak perlu dipindah saat materialize ke aset asli.

## Layout UI

- Kotak pemilih "Lokasi / SKPD" di menu pengelolaan pakai card full-width
  (tanpa `max-w-3xl`).

## Lingkungan kerja

- Deploy via Vercel. **Type-check BERSIH — 0 error** (diverifikasi 2026-08-05):
  `npx tsc --noEmit -p tsconfig.json`. **Exit code-nya sekarang bisa dipercaya
  apa adanya** — jangan disaring lagi, error apa pun yang muncul berarti dari
  perubahanmu sendiri.
  Catatan lama "ada error PRE-EXISTING, saring ke berkas yang kamu sentuh" sudah
  **USANG dan dicabut**. Dua sebabnya sudah hilang: (1) `qrcode`/`leaflet`/
  `react-leaflet` ternyata cuma belum ter-`npm install`, bukan cacat kode;
  (2) enam isu tipe lama di `PerolehanImport`/`RekeningPicker`/
  `KonstruksiPengadaan`/`Koreksi` sudah ditambal — lima di antaranya murni tipe
  (`as` → `as unknown as`, keterbatasan inferensi supabase-js saat `.select()`
  diberi string rakitan runtime), satu kode mati.
  ⚠️ Kalau `npm test`/`tsc` bilang perintahnya tak ditemukan, jalankan
  `npm install` dulu — **worktree tidak berbagi `node_modules` dengan repo
  utama**. `npm run build` belum pernah diuji di sini.
- Migrasi SQL dijalankan user di Supabase SQL Editor sesuai urutan nama file.
- **SELESAI NGODE = LANGSUNG KASIH COMMAND COMMIT + PUSH** (permintaan user
  2026-07-27), tanpa diminta lagi. Satu blok `bash` siap-klik, format persis:
  `git add <berkas satu per satu> && git commit -m "$(cat <<'EOF' … EOF
  )" && git push origin main`. Aturannya:
  - **`git add` sebut berkas SATU PER SATU** — jangan `.` / `-A`. Di repo ini
    selalu ada untracked yang BUKAN bagian kerjaan (file .xlsx besar, migrasi
    orang lain yang belum di-commit, `docs/`); jangan ikut tersapu.
  - Pesan commit: judul `tipe(skop): ringkas` lalu bullet WHY/keputusan (lihat
    `git log` — gaya rinci, bukan satu baris), diakhiri
    `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
  - Heredoc `<<'EOF'` (kutip tunggal) supaya `$`/backtick di pesan tak diexpand.
  - Push ke `main` langsung — repo ini memang tak pakai branch/PR.
  - Kalau ada migrasi baru: **ingatkan jalankan migrasi dulu** sebelum push,
    urutan deploy-ordering di CLAUDE.md.
  - Jalan di terminal user, BUKAN dijalankan Claude — commit/push tetap
    keputusan user.
