# Rencana Refactoring Bertahap — Penyusutan BMD

> Dokumen hidup — arah pergerakan kode ini.
>
> **Peta seluruh dokumen: [README.md](README.md).**
>
> **Aturan induk: tidak ada fase yang menghentikan pengembangan fitur.**
> Setiap fase dirancang agar bisa dikerjakan menyelip di antara pekerjaan
> fitur, dan setiap fase berdiri sendiri — berhenti di tengah jalan tetap
> meninggalkan repo dalam keadaan lebih baik, bukan setengah jadi.

---

## 1. Temuan — kondisi terukur (2026-08-03)

| Metrik | Angka | Implikasi |
|---|---|---|
| Berkas TS/TSX | 191 (~36.000 baris) | — |
| Komponen `'use client'` | **135 dari 148** | hampir tak ada rendering server; tiap halaman 8–15 *round-trip* dari browser |
| Pemanggilan `.from('…')` | **520**, tersebar sampai ke JSX | nama tabel jadi *string literal* di lapisan UI; rename kolom = `grep` |
| Loop paginasi tulis-tangan | **126 di 47 berkas** | 126 kesempatan mengulang bug hilang-baris yang sudah didokumentasikan |
| `const { data } = await` (error ditelan) | **166** | melanggar rules.md §2.6 secara masif |
| Berkas terbesar | `Pengadaan.tsx` 1.437 baris / **60 `useState`** | tak bisa diuji; tiap fitur menyentuh seluruh berkas |
| Aturan bisnis terduplikasi | `SEMBUNYI`/`MUNCUL` di **6 berkas** | dijaga hanya oleh komentar "ubah satu, samakan yang lain" |
| Test / lint / CI | **nol / nol / nol** | verifikasi 100% manual |
| Tipe DB | ditulis tangan per halaman | drift skema tak terdeteksi TypeScript |
| Migrasi SQL | 143 berkas, dijalankan manual | — |

### Diagnosis dalam satu paragraf

Kode ini **tidak berantakan** — justru sebaliknya, ia salah satu basis kode
paling terdokumentasi yang bisa ditemui: tiap keputusan punya alasan,
tanggal, dan riwayat insidennya. Masalahnya bukan kurang disiplin, melainkan
**disiplin itu disimpan di tempat yang tidak dieksekusi**. Aturan hidup
sebagai prosa di CLAUDE.md dan sebagai peringatan `⚠️` di komentar, sementara
kode tetap menyediakan jalan mudah untuk melanggarnya. Hasilnya terlihat di
angka-angka di atas: aturan "wajib keyset" ada, tapi ada 126 loop tulis
tangan; aturan "wajib cek error" ada, tapi ada 166 pelanggaran.

**Karena itu tema seluruh rencana ini bukan "rapikan kode", melainkan
"pindahkan aturan dari prosa ke tipe dan fungsi".** Setiap fase diukur dari
berapa banyak aturan yang berubah dari *dianjurkan* menjadi *tak bisa
dilanggar*.

### Risiko skala yang perlu diselesaikan terpisah

Dengan target 100–150 pengguna serentak dan ~227.000 aset, arsitektur
"client component menembak PostgREST langsung" punya batas keras: satu
pemuatan halaman berat = belasan query ber-RLS, dikalikan jumlah pengguna
aktif. Optimasi RLS yang sudah dilakukan (InitPlan, partial index) menekan
biaya *per query*; yang belum ditekan adalah **jumlah query**. Itu Fase 4.

---

## 2. Peta jalan

```
Fase 0  Jaring pengaman        2 minggu   ██ berkas baru saja, nol konflik
Fase 1  Primitif bersama       2 minggu   ██ adopsi lewat boy-scout rule
Fase 2  Ekstrak domain murni   berjalan   ████████ menumpang pekerjaan fitur
Fase 3  Pecah komponen raksasa berjalan   ████████ hanya saat disentuh fitur
Fase 4  Pindahkan baca ke server 3 minggu ███ per halaman berat, terukur
Fase 5  Pindah struktur folder berjalan   ██████ paling akhir, sengaja
```

**Kenapa struktur folder paling akhir** — ini kebalikan dari naluri
kebanyakan orang. Memindahkan folder lebih dulu memaksimalkan konflik merge
dengan pekerjaan fitur dan **nol** memperbaiki perilaku. Setelah Fase 2,
sebagian besar berkas sudah pindah sendiri secara alami karena logikanya
diekstrak ke tempat baru; yang tersisa tinggal sedikit.

---

## 3. Fase 0 — Jaring pengaman (±2 minggu, prasyarat semua fase lain)

**Tidak menyentuh satu baris pun kode produk.** Hanya berkas baru → nol
konflik dengan pekerjaan fitur yang sedang berjalan.

| # | Pekerjaan | Hasil | Status |
|---|---|---|---|
| 0.1 | Vitest + `vitest.config.ts` + script npm | `npm test` jalan | ✅ 2026-08-03 |
| 0.2 | Test untuk `lib/engine/penyusutan.ts` | jantung angka neraca terkunci — **fungsinya sudah murni, nol refactor** | ✅ 2026-08-03 — 71 test, 99% stmt / 82% branch |
| 0.3 | Test untuk helper murni di `lib/bmd.ts` | `periodeDariTanggal`, `comparePeriode`, `klasifikasiKomptabel` | ✅ 2026-08-03 — 73 test, 93% stmt / 100% branch |
| 0.4 | Property test invarian engine (`fast-check`) | nilai buku ≥ 0, Σ beban = akumulasi | ✅ 2026-08-03 — 6 invarian × 300 run |
| 0.4b | Test sinkronisasi daftar `batal_*` (rules.md §1.7) | jenis `batal_*` baru yang lupa satu titik gagal di CI, bukan ketahuan tiga ronde kemudian | ✅ 2026-08-05 — `lib/sinkronisasi.test.ts` |
| 0.5 | ESLint — **hanya 6 aturan** (lihat di bawah) | pelanggaran baru tertangkap otomatis | ✅ 2026-08-06 — `eslint.config.mjs`, **0 error / 569 warning** |
| 0.6 | ~~Baseline typecheck~~ → **typecheck bersih** | **0 error**, jadi baseline-nya TIDAK JADI DIBUAT — CI menjalankan `npm run typecheck` apa adanya | ✅ 2026-08-05 |
| 0.7 | GitHub Actions | typecheck + unit tiap push | ✅ 2026-08-06 — `.github/workflows/ci.yml`: `npm ci` → `typecheck` → `test` → `lint` |
| 0.8 | `supabase gen types` → `shared/types/database.types.ts` | sumber tipe tunggal | ✅ 2026-08-06 — 2.930 baris, 46 tabel. Adopsi lewat `Tables<>`/`Enums<>`; **client belum bertipe**, lihat di bawah |

> **Catatan 0.2 — suite ini diverifikasi dengan uji mutasi, bukan cuma
> "hijau".** Test yang lulus di percobaan pertama belum tentu menguji apa pun.
> Lima cacat sengaja disuntikkan ke engine dan tiap kali **hanya** test yang
> memang mengaku menutupinya yang merah: (1) selisih pembulatan tidak diserap
> di semester terakhir → 4 test; (2) `batal_*` tak lagi menganulir event
> target → 3 test; (3) guard beku 1.5.4 dicabut → 1 test; (4) bail-out memakai
> kode saat baseline alih-alih kode terkini → 2 test; (5) checkpoint mengambil
> baris pertama alih-alih terbaru → 1 test. **Ulangi cara ini untuk tiap suite
> baru** — ia yang membedakan jaring pengaman dari dekorasi.
>
> ⚠️ **Mutasi yang "selamat" belum tentu berarti ada lubang di test — periksa
> dulu mutasinya benar-benar mendarat.** Di Fase 0.3 satu mutasi lolos, dan
> ternyata `perl` yang tak jadi mengubah apa-apa; begitu disuntikkan dengan
> benar, dua test langsung merah. Tanpa memeriksa, waktu habis memburu lubang
> yang tak ada. Selalu `grep` berkasnya sesudah menyuntik.

### Catatan 0.4b — checklist §1.7 diubah jadi test, bukan prosa

Daftar periksa tujuh titik untuk menambah jenis `batal_*` (rules.md §1.7) hari
ini hidup **sepenuhnya sebagai prosa**. Itu persis kelas aturan yang tema
rencana ini janji pindahkan ke kode: `batal_pengalihan` (2026-07-29) kelewat
**tiga ronde** justru karena tak ada satu pun mekanisme yang gagal ketika satu
titik terlewat — ledgernya benar, jadi semuanya terlihat beres.

Yang bisa diuji tanpa DB (murni perbandingan daftar), dan karena itu masuk
Fase 0 bukan Fase 2:

- setiap nilai enum berawalan `batal_` terdaftar di `BATAL_TARGET_JENIS`
  (lib/voidedAset.ts) — kecuali yang di-*allowlist* eksplisit berikut alasannya;
- `JENIS_PINDAH` (lib/pengalihan.ts) tetap kembar dengan predikat
  `idx_trx_pindah_id` (rules.md §5.5) — bandingkan konstanta TS dengan predikat
  yang dibaca dari berkas migrasinya, supaya perbedaannya jadi test merah, bukan
  timeout di produksi;
- setiap jenis di `BATAL_TARGET_JENIS` punya label di `JENIS_TRANSAKSI_LABEL`
  (menutup temuan #3 Fase 0.3 sekaligus mencegahnya terulang);
- **daftar CARA PEROLEHAN tetap sama di lima tempat** (ditemukan 2026-08-05,
  lihat §5 Temuan 0.3 #1). Dua pasangannya sudah terkunci test; sisanya —
  `JENIS_CARA` (lib/rekon.ts), `JENIS_CARA_PEROLEHAN`
  (app/dashboard/pelaporan/bmd/page.tsx), `CARA_LIST`
  (components/dashboard/CaraPerolehanCards.tsx) — belum. Ketiganya konstanta
  literal di berkas berbeda, jadi bisa dibandingkan tanpa DB: impor,
  urutkan, samakan.

Tiga titik sisanya (keanggotaan kartu **dua sisi**, KIBAR, dan
`fn_aset_awal_2026_terkunci` ↔ `_batch`) butuh integrasi DB — jadwalkan sebagai
test integrasi `authenticated` di baris metrik yang sudah ada, jangan dipaksakan
jadi unit test yang cuma pura-pura menutupinya.

**✅ Terpasang 2026-08-05 — `lib/sinkronisasi.test.ts`.** Yang akhirnya
dijaga mesin:

1. **Setiap `batal_*` di enum punya rumah yang disengaja.** Nilai enum dibaca
   LANGSUNG dari `supabase/migrations/*.sql` (`ADD VALUE` + `CREATE TYPE …
   AS ENUM`), bukan disalin ke TS — jadi menambah jenis di migrasi tanpa
   mendaftarkannya di `VOID_JENIS`/`BATAL_TARGET_JENIS`/pengecualian langsung
   merah. Pengecualiannya wajib bertuliskan **alasan**, dan ada test arah
   sebaliknya yang membuang pengecualian basi.
2. **`JENIS_DITARIK` (lib/pengalihan.ts) ↔ predikat `idx_trx_pindah_id`**,
   dibaca dari berkas migrasinya. Ini kegagalan paling senyap di repo ini:
   beda sedikit → index diabaikan diam-diam → timeout.
3. **`BATAL_TARGET_JENIS` semuanya punya label** (menutup temuan #3 Fase 0.3;
   lima label ditambahkan bersamaan, daftar "jenis tanpa label" 14 → 9).
4. **Daftar cara perolehan sama di empat tempat yang bisa dijangkau** — dua
   lewat impor, dua lewat pembacaan berkas karena berkasnya komponen
   `'use client'` yang menyeret React kalau di-import.

> **Anti-hampa itu bagian dari desainnya.** Test yang memindai berkas bisa
> "lulus" hanya karena pemindaiannya tak menemukan apa pun — lebih berbahaya
> daripada tak punya test, karena memberi rasa aman palsu. Karena itu tiap
> pemindai punya ambang minimum (≥50 migrasi, ≥30 nilai enum, ≥15 `batal_*`)
> dan **melempar** kalau polanya tak ketemu, bukan diam-diam mengembalikan
> daftar kosong. Pertahankan pola ini di test pemindai berikutnya.

### Temuan Fase 0.3

Menguji `lib/bmd.ts` memunculkan **tiga gap yang sebelumnya tak terlihat**,
semuanya dari pola yang sama: konstanta kembar yang cuma dijaga ingatan
(rules.md §5.5). Ketiganya dipin sebagai test bertanda `DUGAAN BUG` — dikunci
apa adanya, bukan disebut benar, supaya keputusannya disengaja:

1. **`tukar_menukar` tak dikenali engine sebagai baseline perolehan** → barang
   hasil tukar menukar **tidak pernah disusutkan**. Jenisnya sah (enum migrasi
   20260707_02) dan benar-benar ditulis saat approve. Yang membuktikan ini
   kelalaian, bukan kesengajaan: engine justru menangani `batal_tukar_menukar`
   sebagai event penghenti (`lib/engine/penyusutan.ts`, `case`
   `'batal_tukar_menukar'`) — hanya masuk akal kalau barangnya memang mestinya
   disusutkan. Daftar baseline-nya sendiri:
   `['pengadaan','hibah_masuk','hasil_inventarisasi','perolehan_lainnya','kdp_selesai_masuk']`
   — `tukar_menukar` memang tak ada.

   ✅ **DIVERIFIKASI KE DB PRODUKSI 2026-08-05 — dampak hari ini NOL:**
   `aset.cara_perolehan='tukar_menukar'` **0 baris**, ledger `tukar_menukar`
   **0 baris**, `batal_tukar_menukar` **0 baris**. Jadi ini **bom waktu yang
   belum meledak**, bukan angka salah yang sedang beredar — tidak ada satu pun
   laporan yang terdampak dan tidak ada yang perlu ditarik kembali.

   ✅ **ENGINE SUDAH DITAMBAL 2026-08-05.** `'tukar_menukar'` masuk daftar
   baseline `hitungJadwalAset`; nol angka yang sudah dilaporkan berubah (0
   baris di produksi) sehingga tak perlu run engine ulang maupun keputusan
   user soal angka surut. Dikunci **dua test regresi**: (a) tukar menukar
   menghasilkan jadwal **identik** dengan pengadaan — cara perolehan tak boleh
   memengaruhi angka sedikit pun; (b) `batal_tukar_menukar` menghentikannya,
   cabang yang sebelumnya **tak pernah bisa tercapai**. Daftar `it.each` jenis
   perolehan sengaja **ditulis ulang di test, bukan diimpor dari engine** —
   kalau diimpor, jenis yang lupa didaftarkan juga hilang dari test dan gapnya
   lolos lagi tanpa suara.

   ✅ **`JENIS_PEROLEHAN` (lib/bmd.ts) IKUT DITAMBAL** sesudah pembacanya
   disisir manual satu per satu (rules.md §1.7). Bersamanya:
   `JENIS_TRANSAKSI_LABEL` dapat entri `tukar_menukar` — wajib, karena test
   "semua jenis di JENIS_PEROLEHAN punya label" akan merah tanpa itu, dan
   `tukar_menukar` dicoret dari daftar "jenis tanpa label" (15 → 14).
   Dikunci test baru **`JENIS_PEROLEHAN` sepasang dengan
   `CARA_PEROLEHAN_LABEL`** — cara perolehan keenam yang cuma didaftarkan di
   satu sisi langsung merah.

   ### Hasil sisir: daftar "cara perolehan" ternyata hidup di LIMA tempat

   Temuan yang lebih besar dari bug aslinya. Diverifikasi manual 2026-08-05:

   | # | Tempat | Isi `tukar_menukar`? |
   |---|---|---|
   | 1 | daftar baseline `perolehan`, `lib/engine/penyusutan.ts` | ❌ → ✅ ditambal |
   | 2 | `JENIS_CARA`, `lib/rekon.ts` (Rekonsiliasi BMD) | ✅ sudah benar |
   | 3 | `JENIS_CARA_PEROLEHAN`, `app/dashboard/pelaporan/bmd/page.tsx` (Model 3) | ✅ sudah benar |
   | 4 | `CARA_LIST`, `components/dashboard/CaraPerolehanCards.tsx` | ✅ sudah benar |
   | 5 | `JENIS_PEROLEHAN`, `lib/bmd.ts` | ❌ → ✅ ditambal (⚠️ ternyata **tak dipakai runtime**) |

   Ditambah dua turunan yang juga harus ikut: `CARA_PEROLEHAN_LABEL` (✅, kembar
   dengan CHECK `aset.cara_perolehan`) dan `JENIS_TRANSAKSI_LABEL` (❌ → ✅).
   `VOID_JENIS` (lib/voidedAset.ts) sudah memuat `batal_tukar_menukar` ✅.
   `LaporanPerolehan`/`LaporanTransaksi` aman — keduanya menerima jenis sebagai
   **prop**, dan menu Laporan Tukar Menukar memang sudah ada.

   **Pelajarannya bukan "ada satu yang lupa", tapi "ada LIMA salinan".** Yang
   bolong justru yang paling mahal (engine → barang tak pernah disusutkan);
   empat lainnya kebetulan benar, dan tak satu pun mekanisme yang menjamin
   mereka tetap benar. Pasangan 1↔5 dan 5↔`CARA_PEROLEHAN_LABEL` kini terkunci
   test; **nomor 2, 3, 4 masih tanpa penjaga** — jadikan bagian Fase 0.4b, satu
   keluarga dengan test sinkronisasi `batal_*`. Kandidat ekstraksi jangka
   panjang: satu `perolehan/domain/jenis.ts` yang jadi sumber tunggal
   (Fase 2, kelas risiko sama dengan 2.1–2.6).
2. **`GOLONGAN_REKAP['1.5.4'].disusutkan = true`** padahal engine tak pernah
   mengakrualkannya (guard `perlakuan !== 'lain_lain'`, keputusan user
   2026-07-13). Konstantanya mencerminkan aturan sebelum keputusan itu.
3. **15 jenis ledger tanpa label tampilan** di `JENIS_TRANSAKSI_LABEL` — cacat
   tampilan (peringkat 5), bukan angka.

Tiga-tiganya **tidak diperbaiki di sini**: perbaikan nomor 1 mengubah angka
laporan surut ke belakang dan menuntut engine dijalankan ulang. Itu PR
tersendiri dengan keputusan user.

### Catatan 0.6 — baseline yang tidak jadi dibuat

Rencananya membekukan error typecheck lama ke `.typecheck-baseline.txt` supaya
CI hanya merah untuk error **baru**, dengan alasan "menunggu sampai nol error
berarti CI tak akan pernah aktif". Alasan itu ternyata salah di repo ini.

Sesudah `npm install` (2026-08-05) errornya tinggal **6 di 4 berkas** —
`qrcode`/`leaflet`/`react-leaflet` rupanya cuma belum terpasang, bukan cacat
kode. Dari enam sisanya: **lima murni tipe** (`as` → `as unknown as`;
supabase-js tak bisa menurunkan bentuk baris kalau `.select()` diberi string
yang dirakit runtime — pola yang sudah dipakai kolektor di `lib/`, cuma
komponennya yang belum), **satu kode mati** (`kontrak.keterangan` di
KonstruksiPengadaan: `Kontrak` tak punya kolom itu & query-nya tak
men-select-nya, jadi cadangan yang selalu `undefined` — kode yang mengira
punya jaring pengaman padahal tidak). Nol perubahan logika bisnis.

> **Sebelum membangun mekanisme untuk hidup berdampingan dengan utang, ukur
> dulu utangnya.** Yang tampak seperti "36.000 baris penuh error lawas"
> ternyata enam error di empat berkas, selesai dalam satu duduk. Baseline yang
> terlanjur dibuat akan jadi berkas yang harus dirawat selamanya — dan tempat
> sempurna untuk menyembunyikan error baru.

### ESLint: sedikit tapi menggigit — ✅ terpasang 2026-08-06

Menyalakan `eslint-config-next` penuh di 36.000 baris tanpa lint akan
menghasilkan ribuan peringatan yang langsung diabaikan semua orang. Karena itu
hanya enam aturan yang dinyalakan, semuanya memetakan langsung ke insiden
nyata. **Konfigurasinya sendiri ada di
[`eslint.config.mjs`](eslint.config.mjs)** berikut alasan per aturan — jangan
disalin ke sini, cukup dibaca di sana.

Aturan `no-restricted-imports` itulah yang **menegakkan arah dependensi**
dari CODING-STANDARD §2 — tanpa ia, pemisahan lapisan cuma niat baik. Ia
sengaja dipasang **sebelum** folder `modules/` pertamanya dibuat (Fase 5), jadi
hari ini nol efek.

**Yang meleset dari rencana, dan angkanya:** rencana menaruh
`no-floating-promises` & `await-thenable` di `'error'` global. Pengukuran
pertama (2026-08-06) menemukan **260 pelanggaran** — 178 di `components/`, 82
di `app/`, dan **0 di `lib/`**, hampir semuanya berbentuk
`useEffect(() => { load() }, [])`. Jadi keduanya `'error'` **di `lib/` +
`middleware.ts` saja** dan `'warn'` di lapisan UI. Alasannya sama persis dengan
alasan `const { data } = await` di-set `'warn'`: `error` di atas utang yang
sudah terlanjur besar = **CI merah permanen**, yang efeknya identik dengan
tidak punya CI. Naikkan blok UI-nya jadi `error` begitu angkanya nol.

Temuan sampingan yang tak terduga: 144 komentar `eslint-disable` lama di 80
berkas menyebut aturan `eslint-config-next` yang **tidak dipasang**, dan ESLint
melaporkan itu sebagai **error** ("Definition for rule was not found") — CI
merah karena komentar, bukan karena kode. Ditutup dengan mendaftarkan kedua
plugin-nya **tanpa menyalakan satu pun aturannya**; membuang 144 komentar itu
berarti menyentuh 80 berkas produk tanpa alasan.

**Kriteria selesai:** ✅ CI hijau di `main` (0 error / 569 warning); ✅ menambah
`const { data } = await` baru memunculkan peringatan; ✅ engine punya 79 test.

### Catatan 0.8 — tipe generated ada, client-nya belum bisa diberi tipe

[`shared/types/database.types.ts`](shared/types/database.types.ts) sudah
di-commit (2.930 baris, 46 tabel) dan diregenerasi lewat `npm run gen:types`.
Cara memakainya di kode ada di [CODING-STANDARD.md](CODING-STANDARD.md) §4.4.

**Yang tidak jadi dikerjakan, berikut angkanya.** Rencana wajarnya adalah
menyematkan `createBrowserClient<Database>` di `lib/supabase/client.ts` supaya
seluruh `.from()` bertipe. Diukur 2026-08-06: itu menghasilkan **239 error
typecheck**, nyaris semuanya `Argument … is not assignable to parameter of type
'never'` pada `.insert()`/`.update()`.

Dua hipotesis pertama **salah**, dan itu layak dicatat supaya tak diulang:
versi `supabase-js` sudah baru (2.108.2, bukan yang lama), dan menyalakan
`--strictNullChecks` justru menaikkan error jadi **297**. Penyebab sebenarnya
diisolasi dengan membandingkan dua jalur pembuatan client dalam satu berkas:

| Jalur | `.from('aset').update(...)` | tabel ngawur ditolak? |
|---|---|---|
| `createClient` dari **`@supabase/supabase-js`** | ✅ bertipe benar | ✅ ya |
| `createBrowserClient` dari **`@supabase/ssr` 0.5.2** | ❌ `never` | ❌ tidak |

Pesan errornya menunjukkan skew generic yang persis: ssr menghasilkan
`SupabaseClient<Database, "public", Schema>` (3 parameter) sementara supabase-js
2.108.2 menuntut **4**. Jadi ini **soal versi `@supabase/ssr`, bukan soal
tipenya**.

Menaikkan `@supabase/ssr` bukan keputusan yang boleh menumpang di Fase 0: paket
itu memegang refresh sesi auth di `middleware.ts` — lapisan yang, waktu database
masuk mode read-only, membuat **seluruh aplikasi tak bisa diakses**
([docs/insiden.md](docs/insiden.md) INS-13). Itu butuh keputusan tersendiri
berikut ujinya. Sampai saat itu, `Tables<>`/`TablesInsert<>`/`Enums<>` sudah
memberi sebagian besar manfaat tanpa menyentuh client sama sekali.

**Temuan sampingan — pemindai enum yang bocor separuh.** Membandingkan berkas
generated dengan `supabase/migrations/*.sql` langsung memerahkan test, dan
sebabnya bukan di berkas generated: `nilaiEnumDariMigrasi()` di
`lib/sinkronisasi.test.ts` cuma menangkap **31 dari 46** nilai enum. Badan
`CREATE TYPE … AS ENUM ( … )` memuat komentar `-- … (pengguna barang)`, dan
kurung tutup di dalam komentar itu mengakhiri tangkapan lebih awal. Ambang
anti-hampanya `< 30`, jadi 31 tetap lolos — **ambang yang jauh di bawah
kenyataan bukan pengaman, ia tempat pemindai rusak-sebagian bersembunyi.**
Diperbaiki (komentar dibuang dulu, ambang dinaikkan ke 40); test §1–§3 yang
sudah ada ikut jadi lebih kuat.

---

## 4. Fase 1 — Primitif bersama (±2 minggu menulis, adopsi berjalan terus)

Bangun tiga helper di `shared/db/` dan `shared/ui/` (kode lengkapnya di
[CODING-STANDARD.md](CODING-STANDARD.md) §4), lengkap dengan test-nya:

| Primitif | Menggantikan | Aturan yang jadi tak-bisa-dilanggar | Status |
|---|---|---|---|
| `paginate()` + `perPotongan()` | 63 loop tulis-tangan di 47 berkas | keyset + `ORDER BY` + cek error (rules.md §3) | ✅ 2026-08-06 — `shared/db/paginate.ts`, 15 test |
| `assertOk()` + 2 varian | 166 `const { data } =` | fail-closed (rules.md §2.1) | ✅ 2026-08-06 — `shared/db/query.ts`, 9 test |
| `useAsyncData()` | `try/catch/finally` tulis-tangan | loader tak bisa nyangkut (rules.md §2.2) | ✅ 2026-08-06 — `shared/ui/useAsyncData.ts`, 10 test |

Ketiganya diverifikasi dengan **uji mutasi**, bukan cuma "hijau": mencabut
`finally` dari `useAsyncData` memerahkan tepat 2 test bertanda INS-10;
menelan `error` di `paginate` memerahkan tepat 1. Cara pakainya di
[CODING-STANDARD.md](CODING-STANDARD.md) §4 — kodenya **tidak** disalin ke
dokumen mana pun.

> ⚠️ **Temuan sampingan yang layak diingat:** berkas test pertama ber-ekstensi
> `.tsx` (hook) semula **tidak dijalankan sama sekali** — pola `include` di
> `vitest.config.ts` cuma memuat `*.test.ts`. Vitest melaporkan semuanya hijau
> tanpa pernah memungutnya. Test yang tak terpungut lebih berbahaya daripada
> tak punya test. Sudah diperbaiki; kalau menambah lokasi test baru, **pastikan
> jumlah berkasnya benar-benar bertambah di keluaran**.

**Adopsi TIDAK dilakukan dengan penggantian massal.** Satu PR yang menyentuh
47 berkas mustahil di-review, dan di aplikasi yang dilaporkan ke BPK review
adalah pertahanan terakhir. Adopsi lewat *boy-scout rule*
(CODING-STANDARD §10).

### Temuan golden test Rekonsiliasi (2026-08-06)

Golden test pertama (`tests/golden/`, TESTING.md §6) dipasang dengan dataset
tetap 18 aset yang tiap barisnya mewakili satu kasus yang pernah menggigit.
Angka snapshot-nya **diverifikasi tangan**, bukan sekadar direkam: Saldo Awal
1.3.2 intra = 406.000.000 dari 9 aset, Saldo Akhir = 475.000.000 dari 8 aset.

Yang paling berguna justru **invarian tie-out** (Saldo Awal + penambahan −
pengurangan = Saldo Akhir per sel). Ia langsung merah, dan sesudah kesalahan
fixture sendiri dibereskan menyisakan selisih yang bisa didekomposisi bersih:
**−85.000.000** di `1.3.2|intra` dan **+15.000.000** di `1.3.5|intra`. Dua sebab
terpisah, dua-duanya di kode produk:

1. **`batal_pengalihan` tidak disaring di `lib/rekon.ts`** (−70.000.000).
   `computeMutasiLines` menyaring pembatalan untuk kapitalisasi, koreksi nilai,
   dan reklas — **tidak untuk `pengalihan_status`**. Padahal rules.md §1.7
   titik 2 mewajibkannya, dan konstantanya sudah ada
   (`BATAL_TARGET_JENIS.pengalihan`); yang belum cuma pemakaiannya. Akibatnya
   barang yang pengalihannya dibatalkan tetap tampil sebagai pengurangan —
   persis mode kegagalan INS-15, tanpa satu pun pesan error.
2. **Golongan pada snapshot tidak period-aware** (−15.000.000 / +15.000.000).
   `fetchSnapshotPositions` memakai `aset.kode` TERKINI, sementara baris mutasi
   membukukan keluar-dari-kode-lama + masuk-ke-kode-baru. Untuk aset yang
   direklas di periode berjalan, Saldo Awal sudah duduk di golongan BARU lalu
   ditambah lagi oleh baris "reklas masuk". Beda dengan `kode_register` yang
   riwayatnya memang disimpan (`aset_kode_register`), golongan tak punya
   padanannya — jadi ini butuh keputusan desain, bukan sekadar panggilan yang
   lupa.

**Keduanya DIPIN apa adanya sebagai test bertanda `DUGAAN BUG`**, mengikuti
cara yang sama dengan Temuan Fase 0.3: dikunci, bukan disebut benar. Alasannya
sama pula — memperbaikinya **mengubah angka yang sudah dilaporkan**, jadi itu
commit tersendiri dengan keputusan user. Begitu diperbaiki, test-nya akan gagal;
itu memang sinyalnya, bukan gangguan.

> **DIVERIFIKASI KE DB PRODUKSI 2026-08-06 — dan ini BUKAN bom waktu yang
> belum meledak.** Berbeda dari `tukar_menukar` (0 baris), datanya ada:
> `pengalihan_status` **4 baris**, `batal_pengalihan` **2 baris** yang
> menganulir **keempat**-empatnya (target `[9657,9658]` dan `[9659,9679]`),
> semuanya periode **2026-S2**, bernilai **Rp215.155.360** dan
> **Rp3.794.734.725**. Jadi setiap pengalihan yang pernah tercatat di sistem
> ini sudah dibatalkan, dan tak satu pun disaring oleh Rekonsiliasi.
>
> Yang meredam dampaknya: baris hanya terbit kalau **tepat satu sisi** ada di
> scope. Untuk tampilan **se-kabupaten** (scope kosong) asal & tujuan sama-sama
> dianggap in-scope, jadi tak ada baris — angka kabupaten AMAN. Yang salah
> adalah tampilan **per-SKPD** pada 2026-S2: di sana muncul pengurangan
> "Penghapusan Pengalihan (transfer keluar)" untuk perpindahan yang sudah
> dianulir. **Periksa apakah laporan 2026-S2 per-SKPD sudah terlanjur
> dipakai/dikirim sebelum memutuskan perbaikannya.**

> ⚠️ **Rencana awal punya pengecualian yang premisnya TIDAK BENAR** — dicoret
> 2026-08-06. Bunyinya: kolektor jalur pelaporan (`lib/rekon.ts`,
> `lib/voidedAset.ts`, `lib/pengalihan.ts`) dimigrasikan lebih dulu "karena
> ketiganya sudah punya golden test dari Fase 0". Diperiksa: **golden test
> belum ada sama sekali** (TESTING.md §6 masih ⬜), `lib/rekon.test.ts` menguji
> `attribusiPenyusutan` yang MURNI — bukan kolektornya, dan `lib/voidedAset.ts`
> serta `lib/pengalihan.ts` **tidak punya test satu pun**.
>
> Jadi justru ketiga berkas itu yang paling **tidak** boleh dimigrasikan
> duluan: mereka menghitung angka yang dilaporkan ke inspektorat/BPK, dan tak
> ada apa pun yang akan memberi tahu kalau migrasinya mengubah hasil.
> **Prasyaratnya golden test dulu** (Fase 0 baris "Golden test laporan", masih
> 0) — baru migrasi. Sampai itu ada, ketiganya ikut boy-scout seperti yang lain.

**Metrik yang dipantau tiap bulan** (satu perintah, taruh di README):

```bash
echo "loop tulis-tangan: $(grep -rc 'from + 999' --include='*.ts*' app components lib modules | grep -v ':0' | wc -l) berkas"
echo "error ditelan:     $(grep -rn 'const { data } = await' --include='*.ts*' app components lib modules | wc -l)"
```

Target 6 bulan: keduanya turun di bawah 20. Target 12 bulan: nol.

---

## 5. Fase 2 — Ekstrak domain murni (berjalan terus, menumpang fitur)

Fase dengan hasil terbesar. Tiap ekstraksi memindahkan aturan bisnis dari
komponen 1.400 baris ke fungsi murni **berikut test-nya**.

### Urutan, berdasarkan (duplikasi × risiko)

| # | Ekstrak | Dari | Kenapa duluan |
|---|---|---|---|
| 2.1 | ~~`aset/domain/visibilitas.ts`~~ — **SUDAH, sebagian (2026-08-05)**: `lib/visibilitas.ts` + `lib/visibilitas.test.ts`, menyatukan Daftar Barang, Penyusutan, & `lib/rekon.ts` (3 dari 6 berkas, plus daftar baru `LAHIR`). **Sisa**: `fn_rekap_bmd` (SQL, migrasi 20260805_02) mengulang daftar yang sama di Postgres — kembar lintas-bahasa yang tak bisa diimpor, jadi perlu test yang membandingkan output TS vs SQL lewat query nyata (pola sama dgn 2.4). ⟨`fn_rekap_bmd_periodik` **tak lagi disebut di sini**: sudah di-DROP migrasi 20260725_07, diverifikasi ke DB 2026-08-06 — tinggal SATU kembaran SQL, bukan dua⟩ | duplikasi terbanyak; urutan kronologisnya halus (aksi terakhir menang, bukan "batal selalu menang") |
| 2.1b | ~~`aset/domain/guardPembatalan.ts`~~ — **SELESAI 2026-08-18**: `lib/guardPembatalan.ts` + `lib/guardPembatalan.test.ts`, **8 titik panggil di 6 berkas** tersatukan (lihat catatan di bawah) | `Koreksi.tsx` ×3, `Penghapusan.tsx`, `Pengadaan.tsx`, `Kapitalisasi.tsx`, `Reklasifikasi.tsx`, **`lib/kdp.ts`** | guard integritas ledger terduplikasi; kelupaan di menu batal baru = rantai replay engine RUSAK, bukan cuma laporan salah — satu tingkat di atas visibilitas |
| 2.2 | `pengalihan/domain/kepemilikan.ts` — `ownersAt` | `lib/pengalihan.ts` + 2 halaman | atribusi SKPD period-aware, sudah pernah salah |
| 2.3 | `aset/domain/kolom.ts` — `COLS`/`EXPORT_ORDER`/`EXPORT_COLS` | Daftar Barang ↔ Daftar Barang Awal | pasangan kembar yang dijaga komentar; sekali ekstrak, "kelupaan" jadi mustahil |
| 2.4 | `kode-register/domain/` — `prefixKodeRegister`, `bergeserDariNibar` | `lib/kodeRegister.ts` | pembedaan `null` vs `false` mudah rusak; kembar dengan `fn_prefix_kode_register` di SQL — ekstraksi WAJIB disertai test yang membandingkan output TS vs `fn_prefix_kode_register` lewat query nyata, bukan cuma memindahkan fungsinya |
| 2.5 | `pelaporan/domain/` — agregasi rekonsiliasi | `lib/rekon.ts` (25 KB) | berkas terbesar di `lib/`, murni-nya bisa dipisah dari I/O-nya |
| 2.6 | `perolehan/domain/draft.ts` — validasi & materialisasi draft | `Pengadaan.tsx` + `PerolehanManual.tsx` | aturan approval terjepit di dalam JSX |

### Catatan 2.1b — "dikonfirmasi grep, 5 berkas" ternyata KURANG SATU

Ekstraksi 2026-08-18 menemukan **6 berkas / 8 titik panggil**, bukan 5:
`Koreksi.tsx` punya **tiga** (batal koreksi, batal pemecahan, batal
penggabungan), dan **`lib/kdp.ts`** (`unapproveKontrakKonstruksi`) sama sekali
tak terhitung karena ia bukan komponen — pencariannya waktu itu terbatas ke
`components/`. Ini contoh persis kenapa angka duplikat di §10 disebut **batas
bawah, bukan jumlah sebenarnya**.

**Satu cacat ditemukan saat karakterisasi, dan ia ada di KEDELAPAN salinan:**
semuanya menulis `const { count } = await …` lalu `(count || 0) > 0`. Query yang
gagal membuat `count` `undefined`, sehingga guard **lolos diam-diam** — *fail-open*
pada satu-satunya penjaga rantai replay engine (tak ada trigger DB yang
menegakkannya). Diperparah `{ head: true }`, yang membuat `error.message` KOSONG
sehingga sebabnya pun tak terbaca.

`cekBolehBatal()` menutupnya lewat BENTUK, bukan lewat kedisiplinan pemanggil:
ia mengembalikan **hanya dua keadaan** (`boleh` / `tidak boleh + alasan`), dan
kegagalan query jatuh ke "tidak boleh". Tak ada keadaan ketiga yang bisa
diabaikan. Ini perubahan perilaku yang DISENGAJA & tak bisa menggeser satu pun
angka laporan — ia hanya mengubah bypass senyap jadi penolakan yang terlihat.

Komentar peringatan yang bisa dihapus (kriteria selesai Fase 2): delapan blok
komentar "Guard rantai: …" yang mengulang aturan yang sama di enam berkas kini
tinggal satu rujukan per titik.

**Kandidat lain yang dipantau tapi belum masuk giliran** (audit 2026-08-03): guard
`bolehSetujuiJurnal()` (self-approval, migrasi 20260727_01) tercermin di 4
komponen Cara Perolehan; konstanta `*_ELIGIBLE_GOLONGAN` (Pemanfaatan,
Pengamanan, KIR — 3 berkas terpisah) mengulang pola "golongan mana yang boleh"
tanpa satu sumber. Keduanya kelas risiko sama dengan 2.1–2.6 (aturan bisnis
duplikat di komponen), naikkan ke tabel begitu ada fitur yang mendarat di
salah satu berkasnya.

### Utang data: DUA SUMBER untuk satu besaran — `luas` tanah

Dicatat 2026-08-05 atas permintaan user; **butuh keputusan user dulu, bukan
refactor**. Sambil menunggu, luas sengaja disembunyikan dari layar GIS (kartu
daftar & kotak detail kanan) supaya tak ada yang mengambil angka dari sumber
yang belum disepakati; yang ditampilkan hanya luas per bidang + totalnya di
panel Dokumen Kepemilikan, yang sumbernya tunggal.

Keadaannya sekarang:

| Sumber | Diisi dari | Dibaca |
|---|---|---|
| `aset.luas` (level register) | impor e-BMD, Koreksi Spesifikasi, Edit Spesifikasi Saldo Awal | Daftar Barang, Export. **Tidak lagi di GIS** sejak 2026-08-05 |
| `aset_bidang_tanah.luas` (per bidang) | menu GIS → Kelola Bidang | **seluruh tampilan luas di GIS** (kolom per bidang, total per register, statistik "Luas terpetakan"); Daftar Barang & Daftar Barang Awal sudah memakai Σ bidang **kalau bidangnya lengkap** |

Angka kelengkapannya (2026-08-05): `aset.luas` terisi di **2.733/2.733** register
= 14.679.786 m²; Σ bidang baru **360.166 m²** dari **106/632** bidang berluas,
dan cuma **186/2.733** register yang punya bidang sama sekali. Itu sebabnya
statistik GIS memakai label **"Luas terpetakan"** + cakupannya, bukan "Luas
total" — angka Σ bidang tanpa konteks terbaca sebagai "tanah pemda tinggal 360
ribu m²". Begitu pendataan bidang tuntas, angka itu naik sendiri sampai bertemu
angka register; di titik itu keputusan di bawah jadi mudah diambil.

Keduanya **tidak pernah disinkronkan** dan tak ada aturan siapa menang di level
register. Ini keluarga masalah yang sama dengan cache `aset.pemanfaatan` —
dua penulis, satu besaran, tanpa arbiter — dan sudah terbukti merepotkan.
Bukti skalanya: per 2026-07-28 dari 529 bidang baru 4 yang berluas, jadi Σ
bidang untuk hampir semua register masih 0 sementara `aset.luas` terisi.

Tiga arah yang mungkin, tinggal dipilih:

1. **Bidang jadi otoritatif, `aset.luas` jadi turunan tampilan.** Paling bersih
   & sejalan dengan aturan yang sudah dipakai Daftar Barang (Σ bidang menang,
   jatuh ke kolom register kalau bidang belum lengkap). Syaratnya pendataan
   bidang harus dituntaskan dulu — kalau tidak, luas seluruh kabupaten anjlok
   ke nyaris nol dalam semalam. ⚠️ Σ-nya **dihitung saat tampil, jangan pernah
   disimpan balik ke kolom** — angka tersimpan langsung basi begitu bidang
   ditambah/diedit/dihapus, dan tak ada trigger/cron yang menjaganya.
2. **`aset.luas` tetap otoritatif**, bidang hanya rincian informatif. Paling
   tidak mengganggu, tapi utangnya tetap ada — dua angka yang bisa
   bertentangan di layar yang sama.
3. **Bidang wajib, kolom register di-drop.** Paling benar secara model, paling
   mahal: butuh backfill 529+ bidang dan menyentuh Daftar Barang, Export, KIBAR,
   Saldo Awal.

Yang **tidak boleh** dilakukan tanpa keputusan di atas: menambah penulis ketiga
ke `aset.luas`, atau menjumlah Σ bidang yang belum lengkap seolah itu luas
sebenarnya (jumlahnya lebih kecil dari kenyataan dan terbaca sebagai penyusutan
luas yang tak pernah terjadi).

### Resep satu ekstraksi (satu PR, ±2–4 jam)

1. **Karakterisasi dulu.** Tulis test terhadap perilaku **sekarang**,
   termasuk yang terasa aneh. Kalau ada yang salah, itu ditemukan di sini —
   dan perbaikannya jadi PR terpisah, jangan diselundupkan.
2. Pindahkan fungsinya ke `modules/<domain>/domain/`, **tanpa mengubah
   isinya**.
3. Ganti pemanggilan di berkas lama dengan impor.
4. Hapus salinan duplikatnya — **inilah tujuan sesungguhnya**, bukan langkah 2.
5. Hapus komentar `⚠️ ubah satu, samakan yang lain` yang jadi tidak berlaku
   lagi. Itu penanda kemajuan yang paling jujur.

**Kriteria selesai per ekstraksi:** nol duplikat tersisa, test ada, dan
minimal satu komentar peringatan bisa dihapus.

---

## 6. Fase 3 — Pecah komponen raksasa (hanya saat disentuh fitur)

Target: `Pengadaan.tsx` (1.437/60), `Koreksi.tsx` (1.422/49),
`PerolehanManual.tsx` (1.043/42), `Penghapusan.tsx` (840/32).

**Jangan pecah secara spekulatif.** Tunggu sampai ada permintaan fitur yang
memang mendarat di berkas itu, lalu pecah *seperlunya untuk fitur itu*.
Membelah komponen 1.400 baris tanpa pemicu berarti menanggung seluruh risiko
regresi tanpa satu pun manfaat langsung.

Pola pemecahan (berurutan, tiap langkah bisa berhenti di tengah):

```
Pengadaan.tsx  1.437 baris
  ├─ perolehan/domain/pengadaan.ts    aturan murni  → ada test           (Fase 2.6)
  ├─ perolehan/data/pengadaan.ts      seluruh .from()/.rpc()
  ├─ perolehan/ui/usePengadaan.ts     state + orkestrasi, tanpa JSX
  ├─ perolehan/ui/KartuKontrak.tsx    presenter
  ├─ perolehan/ui/DraftItemTable.tsx  presenter
  └─ perolehan/ui/Pengadaan.tsx       perangkai, target < 200 baris
```

60 `useState` dalam satu komponen hampir pasti adalah beberapa mesin state
yang berbeda yang kebetulan bertetangga. Kelompokkan dulu (state kartu,
state draft, state filter, state modal), baru pisahkan — `useReducer` per
kelompok biasanya lebih jelas daripada 15 `useState`.

---

## 7. Fase 4 — Pindahkan pembacaan ke server (jawaban untuk 100–150 pengguna)

Ini fase yang menjawab pertanyaan skala, dan ia **bukan** kerapian — ia
kapasitas.

### Masalahnya
135 dari 148 komponen adalah client component yang menembak PostgREST
langsung. Satu pemuatan Daftar Barang saja: peta SKPD → jenis aset →
kodefikasi → halaman-halaman `aset` → bidang tanah → uraian → event
visibilitas → *owner override*. Delapan sampai lima belas *round-trip*,
masing-masing membayar ongkos RLS, **dikali 100–150 pengguna serentak**.

Optimasi yang sudah dilakukan (InitPlan, partial index) menurunkan biaya
*per query*. Yang belum: **jumlah query dan jumlah baris yang menyeberang ke
browser**.

### Pendekatan — per halaman, terukur, satu per satu

Repo ini **sudah punya polanya** dan sudah merestuinya di rules.md §4.6:
`fn_daftar_barang`, `fn_rekap_bmd`, `fn_rekap_saldo_awal`,
`fn_dashboard_rekap`. Fase ini memperluasnya, bukan mengarang pendekatan baru.

Urutan berdasarkan (berat × frekuensi pakai):

1. ~~**Daftar Barang**~~ — ✅ **SELESAI 2026-08-14** (migrasi 20260814_05..08):
   `fn_daftar_barang` / `fn_daftar_barang_rekap` + `fn_dbar_hidden`/`_owner`/
   `_scope`/`_guard`. Se-kab 1.3.2 **9.821 → 126 ms**; satu SKPD **timeout →
   23,7 ms**; rekap 3.335 → 1.229 ms.
2. ~~**Penyusutan**~~ — ✅ **SELESAI 2026-08-18** (migrasi 20260818_01/02).
   Diukur sbg pengurus Dinas Pendidikan (707 unit), 1.3.2 intra 2026-S1 =
   132.694 aset, RLS aktif:

   | | Sebelum | Sesudah |
   |---|---|---|
   | Permintaan per "Tampilkan" | **≈1.466** | **2** |
   | Baris menyeberang ke browser | **132.694** | **100** |
   | Halaman baris | — | 986 ms |
   | Rekap / kaki tabel | — | 561 ms |

   Tiga pelajaran yang layak dibawa ke halaman berikutnya:
   - **`fn_dbar_hidden` kini BER-VARIAN** (`daftar_barang` / `penyusutan`).
     Penyusutan sengaja tanpa `kdp_selesai_keluar`; menyambungkannya ke varian
     Daftar Barang apa adanya akan menyembunyikan aset KDP yang seharusnya
     tampil, TANPA satu pun error. Hari ini bedanya laten (0 baris) — justru
     itu alasan parameternya dipasang sebelum carve-out KDP dipakai.
   - **Rekap butuh `MATERIALIZED` + `SET work_mem` BERSAMAAN.** Sendiri-sendiri
     salah satunya justru lebih lambat: nested loop 5.237 ms · MATERIALIZED
     dgn work_mem bawaan 6.112 ms (hash tumpah, Batches 4) · keduanya 561 ms.
   - **Kaki tabel WAJIB ikut aturan per-baris** (tak disusutkan → nilai buku =
     nilai perolehan). Versi pertama menjumlah `nilai_buku_akhir` mentah dan
     melaporkan Tanah/ATL **nol** — persis cacat Uji Konsistensi 2026-08-16.

   ⚠️ Temuan sampingan yang belum tuntas: RLS `penyusutan_semester` memanggil
   `fn_is_admin()`/`fn_is_viewer()` telanjang + `fn_skpd_visible()` PER BARIS.
   Ditambal migrasi 20260818_02 (**114.941 → 30.704 ms**), tapi sisa 30 dtk itu
   bawaan policy yang harus menengok `aset` per baris. Tak dikejar lebih jauh
   KARENA sesudah halaman disambungkan tak ada lagi yang membaca tabel itu
   massal sebagai `authenticated`; menekannya lagi butuh mendenormalisasi
   `skpd_id` ke sana — turunan baru yang bisa basi, kelas masalah yang sama
   dengan cache `aset.pemanfaatan`.

   Export SENGAJA tetap lewat jalur mentah `assembleRows` (keputusan user
   2026-08-18, pola Export Audit Daftar Barang): berkas Excel wajib memuat
   SELURUH hasil filter, bukan halaman yang kebetulan terbuka.
3. ~~**Rekonsiliasi BMD**~~ — ✅ **SELESAI 2026-08-18** (migrasi 20260818_03/04).
   Diukur sbg pengurus Dinas Pendidikan (707 unit, 295.141 aset), RLS aktif:

   | | Sebelum | Sesudah |
   |---|---|---|
   | Permintaan — jalur snapshot | **≈8.430** | **3** |
   | Permintaan — halaman utuh | ≈8.455 | **52** ⟨diamati di panel Network⟩ |
   | Baris menyeberang ke browser | 590.282 ⟨295.141 × 2⟩ | ~150 |
   | Waktu | belasan menit | 30,4 dtk |

   ⚠️ **Angka "3" itu jalur SNAPSHOT saja, bukan halaman.** Pesan commit
   `f582306` menyebut "8.455 permintaan jadi 3" dan itu terlalu bagus: sisanya
   `computeMutasiLines` (19 kolektor, sengaja tetap di klien — sudah terscope &
   memuat aturan void/net-removed yang mahal dipindah) plus preflight CORS.
   Penurunannya tetap ~160×. Dicatat di sini karena kesalahan semacam ini persis
   yang membuat metrik jadi tak bisa dipercaya.

   Empat pelajaran:
   - **Penghalangnya bukan agregasi, tapi posisi BASELINE.** Engine sengaja tak
     pernah menghasilkan baris `penyusutan_semester` untuk 2025-S2 (0 baris),
     jadi SELURUH baris SALDO AWAL Semester I lahir dari ledger `saldo_awal` —
     jalur "cadangan" itu justru jalur utamanya. Sebagai `DISTINCT ON` tanpa
     index yang melayaninya: **19.100 ms dengan cache penuh**, 2,4× di atas
     statement timeout. Ditutup `idx_trx_saldo_awal_pos` → Index Only Scan
     2.622 ms.
   - **Prototipe yang bentuknya beda dari fungsinya BUKAN pengukuran fungsinya.**
     Versi standalone-nya 87 dtk karena dua hal yang lenyap begitu ditulis
     sebagai plpgsql: periode yang datang dari CTE membuat planner meninggalkan
     index parsial, dan `EXISTS` berkorelasi atas override pemilik dieksekusi
     122.972 kali. Keduanya sudah dibayar di `fn_penyusutan`; pola arraynya
     tinggal disalin dari sana.
   - **`attribusiPenyusutan` dipecah** jadi `attribusiLines` +
     `hitungBebanSaldoAwal`. Halaman kini hanya punya posisi aset bermutasi
     (≤132 se-kabupaten), dan versi lamanya akan menghitung `bebanSaldoAwal`
     dari peta kecil itu → nyaris nol TANPA satu pun error. Bentuk lamanya
     dipertahankan identik, jadi 26 golden test tak tersentuh.
   - **`statement_timeout` dinaikkan DI DALAM fungsi**, bukan dipaksa masuk
     8 dtk — yang dibandingkan bukan "30 dtk vs 8 dtk" melainkan "30 dtk vs
     8.455 permintaan".
4. ~~**Laporan BMD**~~ — ✅ **SELESAI 2026-08-18** (migrasi 20260818_05), tapi
   temuannya bukan yang diperkirakan: Model 1 & 2 **sudah** satu RPC sejak lama.
   Yang ditemukan justru **`fn_rekap_bmd` TIMEOUT untuk SKPD terbesar** —
   9.144 ms dengan `work_mem` bawaan, di atas pagu 8 dtk, ditolak `57014`.
   Artinya Laporan BMD **tidak bisa dibuka sama sekali** oleh pengurus Dinas
   Pendidikan, entah sejak kapan, dan Model 3 lebih parah karena memanggil
   fungsi yang sama dua kali. **9.144 → 2.119 ms.**

   Bareng itu kembar tiga visibilitas jadi dua (`fn_dbar_hidden`/`fn_dbar_owner`
   menggantikan CTE inline) dan `kode_at` — yang baru saja diduplikasi oleh
   20260818_04 — diekstrak jadi `fn_dbar_kode_at`. Penggantian dilakukan
   **sesudah dibuktikan setara**, bukan atas dasar pembacaan kode: hidden
   227=227, owner 57=57, selisih 0 di kedua arah; sesudahnya Laporan BMD vs
   Rekonsiliasi selisih **0,00 di 8 golongan × 4 ukuran**.

   Cacat lama yang ikut diperbaiki: `fetchLedgerM3` memakai `.range()` **tanpa
   `.order()`** — dua cacat paginasi senyap sekaligus (rules.md §3). Masih laten
   (mutasi se-kab 83 baris di 2026-S1, 147 di 2026-S2), diperbaiki jadi keyset
   sebelum meledak.
5. ~~**Dashboard**~~ — ✅ **SELESAI 2026-08-18** (migrasi 20260818_06). Halaman
   paling matang dari kelimanya: sudah Server Component, satu RPC, `cache()`
   dedup, `<Suspense>` streaming, keyset, error ditampilkan. **Tak ada yang
   perlu dipindahkan ke server.**

   Yang ditemukan pengukuran justru pola lintas-halaman: **`work_mem` selama ini
   dipasang AD-HOC**, hanya saat sebuah halaman kebetulan bermasalah. Audit
   `pg_proc.proconfig` menemukan dua RPC agregat belum kebagian:

   | | Sebelum | Sesudah |
   |---|---|---|
   | `fn_dashboard_rekap()` | 5.741 ms | **450 ms** hangat / 2.880 ms dingin |
   | `fn_rekap_saldo_awal()` | 3.462 ms | **466 ms** |

   Keduanya masih lolos pagu 8 dtk, jadi ini bukan halaman rusak — tapi
   marginnya tipis & terus menyusut (komentar di `app/dashboard/page.tsx`
   mencatat 1,4 dtk "kondisi terbaik"; hari ini sudah 4× lipat).
   `statement_timeout` SENGAJA tidak dinaikkan di sini: keduanya selesai di
   bawah 500 ms, dan pagu 8 dtk adalah satu-satunya alarm yang akan berteriak
   kalau kelak ada regresi 20×. `fn_daftar_barang_rekap` sengaja dibiarkan —
   350 ms tanpa `work_mem`, sehat.

   Aturan itu kini dijaga mesin: `lib/sinkronisasiRpc.test.ts` §5 memerahkan RPC
   agregat baru yang lupa menyetel `work_mem`.

> **Pelajaran lintas-halaman Fase 4, dan ini yang paling mahal:** tiga dari lima
> halaman ternyata **sudah** memakai RPC, dan masalahnya bukan "belum dipindah
> ke server" melainkan **setelan eksekusi yang tak pernah diaudit**. Satu di
> antaranya (`fn_rekap_bmd`) sudah gagal total di produksi tanpa ada yang tahu,
> karena gejalanya cuma halaman yang tak mau tampil untuk SATU SKPD. **Ukur
> dengan RLS aktif sebagai pengurus SKPD TERBESAR sebelum menyimpulkan sebuah
> halaman sudah beres** — sebagai admin/service_role, query yang rusak pun tetap
> cepat.

Per halaman, urutan kerjanya:

- **Ukur dulu**: catat jumlah query & waktu muat sebagai pengurus SKPD
  TERBESAR (bukan admin — rules.md §4.5). Tanpa angka sebelum, tak ada bukti
  sesudah.
- Pindahkan agregasi/paginasi/penyaringan ke RPC `SECURITY INVOKER` (biarkan
  RLS tetap berlaku) atau ke Route Handler bila butuh komposisi lintas tabel.
- **Checklist RLS wajib untuk tiap RPC/policy/index baru di fase ini**
  (rules.md §4 — ditulis eksplisit di sini karena fase ini fokusnya di sisi
  TS dan bagian SQL-nya paling mudah kelupaan):
  - fungsi apa pun di policy dibungkus InitPlan — `(SELECT fn_…())`, jangan
    pernah telanjang (§4.1);
  - predikat golongan/`jenis` diselesaikan lewat **partial index yang
    predikatnya sama persis** dengan qual di kode — `LIKE` dan `=` pada ENUM
    tak pernah bisa jadi index-cond di bawah RLS, dan beda sedikit membuat
    index diabaikan **diam-diam** (§4.2, §5.5);
  - `.order()` baru → pastikan ada index yang memuat kolom urutnya (§3.3);
  - tabel besar yang selama ini hanya dibaca lewat RPC `SECURITY DEFINER`:
    cek policy-nya sudah InitPlan **sebelum** halaman membacanya langsung (§4.7);
  - migrasi PLAIN, bukan `CONCURRENTLY` (§5.3); import/backfill diakhiri
    `ANALYZE` (§4.4).
- `EXPLAIN` **dengan RLS aktif** (rules.md §4.3) — tanpa itu verifikasinya
  tidak membuktikan apa pun.
- Halamannya jadi Server Component; sisakan `'use client'` hanya untuk
  filter dan tabel interaktifnya.
- Ukur lagi. Tulis angkanya di pesan commit.

**Target:** halaman berat < 5 query per pemuatan, tak pernah lebih dari
1.000 baris menyeberang ke browser sekali jalan.

### Yang sengaja TIDAK diusulkan

- **Ganti ke ORM / query builder lain.** Biaya migrasi besar, manfaat kecil,
  dan RLS + RPC yang jadi tulang punggung sistem ini justru paling pas
  dengan PostgREST.
- **Tambah lapisan cache (Redis, dll.).** Sumber kebenarannya ledger yang
  direplay; cache akan mengulang persis masalah `aset.pemanfaatan` yang tak
  pernah auto-null. Selesaikan jumlah query dulu — kemungkinan besar sudah
  cukup.
- **Pisah `aset`/`transaksi_bmd` per tahun atau per jenis.** Dilarang
  rules.md §5.2. Kalau skala benar-benar jadi masalah: **partisi by
  `periode`**.

---

## 8. Fase 5 — Struktur folder (paling akhir, sengaja)

Pindahkan per domain, **saat domain itu memang sedang dikerjakan**, satu
commit murni-pindah tanpa perubahan isi (CODING-STANDARD §3.3).

Urutan yang disarankan — mulai dari domain terkecil dan paling terisolasi
supaya polanya terbukti dulu sebelum menyentuh yang besar:

```
kir → pengamanan → pemanfaatan → kode-register → pengalihan
    → saldo-awal → perolehan → pelaporan → aset → penyusutan
```

`components/` dan `lib/` lama dibiarkan hidup sampai benar-benar kosong.
Selesai ketika kosong, bukan sebelumnya.

---

## 9. Bagaimana ini berjalan paralel dengan pengembangan fitur

Ini bagian yang menentukan apakah rencana ini dijalankan atau jadi dokumen
mati.

### Aturan main

1. **Fase 0 dan 1 = berkas baru saja.** Nol konflik. Bisa dikerjakan kapan
   saja, termasuk bersamaan dengan fitur besar.
2. **Fase 2, 3, 5 tidak dijadwalkan.** Ia menumpang: saat fitur mendarat di
   sebuah berkas, ambil **satu** langkah refactor di berkas itu.
3. **Fase 4 dijadwalkan per halaman**, satu halaman per iterasi, dengan
   angka sebelum/sesudah.
4. **Commit refactor terpisah dari commit fitur**, selalu. Boleh dalam PR
   yang sama, tapi tidak pernah dalam commit yang sama — supaya *revert*
   bisa menyasar salah satunya saja.
5. **Jangan merapikan berkas yang tidak sedang disentuh.**

### Saat permintaan fitur masuk

```
1. Fitur ini mendarat di berkas mana?
2. Berkas itu > 500 baris?  → pecah seperlunya dulu (Fase 3), commit terpisah
3. Butuh aturan bisnis baru? → tulis di domain/ + unit test, JANGAN di komponen
4. Butuh query baru?         → di data/, pakai paginate()/assertOk()
5. Fiturnya sendiri.
6. Menyentuh angka?          → jalankan golden test, jelaskan snapshot yang berubah
7. Satu langkah boy-scout di berkas yang tadi disentuh.
```

### Kalau sedang buru-buru

Boleh melewati langkah 2 dan 7. **Tidak boleh** melewati 3, 4, dan 6 —
ketiganya yang mencegah utang baru bertambah. Refactor yang tertunda itu
biaya tetap; aturan bisnis baru yang mendarat di dalam komponen 1.400 baris
tanpa test itu biaya berbunga.

---

## 10. Metrik & tinjauan

Tinjau sebulan sekali. Semuanya bisa dihitung satu perintah — sengaja,
supaya tak ada alasan tidak mengukurnya.

**Kolom `Sekarang` WAJIB diisi ulang tiap tinjauan** (tulis tanggalnya). Tanpa
kolom itu tabel ini cuma daftar cita-cita — tidak ada tempat mencatat posisi
hari ini, jadi tinjauan bulanannya secara harfiah tak bisa dilakukan.

| Metrik | Awal | **Sekarang** | 3 bln | 6 bln | 12 bln |
|---|---|---|---|---|---|
| Test unit domain | 0 | **380** ⟨`npm test`, 2026-08-18 — 17 berkas⟩ — target 12 bln sudah terlampaui | 60 | 150 | 300 |
| Test integrasi DB (`authenticated`) | 0 | **0** | 10 | 40 | 60 |
| Golden test laporan | 0 | **26 test + 3 snapshot** ⟨Rekonsiliasi BMD, 2026-08-06⟩ | 5 | 15 | 20 |
| Loop paginasi tulis-tangan | 126 ⚠️ | **63** kemunculan di **47** berkas ⟨2026-08-06⟩ — lihat catatan | 90 | 40 | < 10 |
| `const { data } = await` | 166 | **166** ⟨2026-08-06⟩ — **tidak bergerak**, memang belum ada adopsi `assertOk()` | 110 | 50 | < 10 |
| Berkas > 500 baris | 19 | **20** ⟨2026-08-06⟩ — **naik 1** | 15 | 8 | ≤ 3 |
| Komentar "ubah satu, samakan yang lain" | ~6 pasang | **5 + 1 keluarga baru** ⟨lihat catatan⟩ | 4 | 2 | 0 |
| Query per pemuatan Daftar Barang | 8–15 | **2** ⟨2026-08-14, RPC⟩ | 8–15 | ≤ 5 | ≤ 5 |
| Query per pemuatan Penyusutan | ≈1.466 ⟨SKPD terbesar⟩ | **2** ⟨2026-08-18, RPC⟩ | — | ≤ 5 | ≤ 5 |
| Query per "Proses" Rekonsiliasi | ≈8.455 ⟨SKPD terbesar⟩ | **52** halaman utuh · **3** jalur snapshot ⟨2026-08-18⟩ | — | ≤ 5 | ≤ 5 |
| RPC agregat berat tanpa `work_mem` | — | **0** ⟨audit `pg_proc.proconfig`, 2026-08-18; sebelumnya 3 dari 6⟩ | — | 0 | 0 |
| Coverage `domain/` + `shared/` | — | engine 99% stmt · `lib/bmd` 93% | 60% | 80% | 85% |

Rincian 264 test (`npm test`, ±1,5 dtk): `lib/engine/penyusutan.test.ts` 79 ·
`lib/bmd.test.ts` 74 · `tests/golden/rekonsiliasi.test.ts` 26 ·
`lib/rekon.test.ts` 21 · `lib/visibilitas.test.ts` 18 ·
`shared/db/paginate.test.ts` 15 · `lib/sinkronisasi.test.ts` 12 ·
`shared/ui/useAsyncData.test.tsx` 10 · `shared/db/query.test.ts` 9.
**Tinjauan 2026-08-06 — cara mengukurnya, supaya bisa diulang persis:**

```bash
grep -rn 'from + 999'            --include='*.ts*' app components lib | wc -l   # 63  kemunculan
grep -rc 'from + 999'            --include='*.ts*' app components lib | grep -v ':0' | wc -l   # 47 berkas
grep -rn 'const { data } = await' --include='*.ts*' app components lib | wc -l  # 166
find app components lib -name '*.ts' -o -name '*.tsx' | xargs wc -l \
  | awk '$2 != "total" && $1 > 500' | wc -l                                     # 20
```

⚠️ **Angka awal "126" TIDAK bisa direproduksi** dengan perintah mana pun di
atas — yang mendekati cuma `.range(` (74 kemunculan / 50 berkas) dan
`from, from +` (66). Metodenya tak pernah dicatat, jadi **jangan membaca
"126 → 63" sebagai penurunan separuh**: tak ada satu pun loop paginasi yang
diperbaiki dalam pekerjaan Fase 0. Yang benar: **angka 2026-08-06 di atas
adalah baseline baru yang reproducible**, dan "126" dipensiunkan. Ini persis
alasan kolom `Sekarang` wajib menyebutkan perintahnya, bukan cuma angkanya.

Dua baris yang **memburuk**, dan itu memang harus terbaca begitu: berkas > 500
baris 19 → **20** (`Pengadaan.tsx` 1.437 → 1.445, `Koreksi.tsx` 1.422 → 1.429 —
berkas besar terus tumbuh selama belum ada fitur yang memicu Fase 3), dan
`const { data } = await` **tidak bergerak sama sekali** dari 166. Fase 0 memang
tidak menyentuh keduanya: ia memasang alat ukurnya (ESLint kini memperingatkan
tiap pelanggaran baru), bukan melunasi utangnya.

Jangan diisi kira-kira — lebih baik kosong daripada angka karangan, dan lebih
baik lagi angka yang disertai perintahnya.

⚠️ Baris konstanta kembar **naik, bukan turun**: `visibilitas` berhasil
disatukan (−1), tapi sisir `tukar_menukar` 2026-08-05 menemukan keluarga yang
sebelumnya tak terhitung — daftar "cara perolehan" ada di **lima** tempat
(§5 Temuan 0.3 #1). Angka awal "~6 pasang" ternyata terlalu optimis karena
dihitung dari komentar yang ADA; duplikat yang tak berkomentar tak masuk
hitungan sama sekali. **Perhitungan berbasis komentar itu batas bawah, bukan
jumlah sebenarnya** — perlakukan begitu saat meninjau.

Kolom terakhir yang paling penting: **nol pasang konstanta kembar** berarti
setiap aturan yang hari ini dijaga oleh peringatan tertulis sudah berubah
jadi aturan yang dijaga oleh kompilator.

---

## 11. Kalau hanya sempat mengerjakan satu hal

Kerjakan **Fase 0.2** — test untuk `lib/engine/penyusutan.ts`.

Fungsinya sudah murni, jadi tidak butuh refactor sama sekali; ia menghitung
setiap angka yang dilaporkan ke inspektorat dan BPK; dan ia satu-satunya
bagian sistem yang, kalau salah, salahnya **tidak akan terlihat oleh
siapa pun** sampai ada yang mencocokkan neraca.
