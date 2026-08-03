# Rencana Refactoring Bertahap — Penyusutan BMD

> Dokumen hidup. Pendamping: [CODING-STANDARD.md](CODING-STANDARD.md) (target
> gaya) · [TESTING.md](TESTING.md) (jaring pengaman) · [rules.md](rules.md)
> (yang tak boleh rusak).
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
| 0.3 | Test untuk helper murni di `lib/bmd.ts` | `periodeDariTanggal`, `comparePeriode`, `klasifikasiKomptabel` | ⬜ |
| 0.4 | Property test invarian engine (`fast-check`) | nilai buku ≥ 0, Σ beban = akumulasi | ✅ 2026-08-03 — 6 invarian × 300 run |
| 0.5 | ESLint — **hanya 6 aturan** (lihat di bawah) | pelanggaran baru tertangkap otomatis | ⬜ |
| 0.6 | Baseline typecheck | error **baru** memerahkan CI; yang lama tak memblokir | ⬜ |
| 0.7 | GitHub Actions | lint + typecheck + unit tiap push | ⬜ |
| 0.8 | `supabase gen types` → `shared/types/database.types.ts` | sumber tipe tunggal | ⬜ |

> **Catatan 0.2 — suite ini diverifikasi dengan uji mutasi, bukan cuma
> "hijau".** Test yang lulus di percobaan pertama belum tentu menguji apa pun.
> Lima cacat sengaja disuntikkan ke engine dan tiap kali **hanya** test yang
> memang mengaku menutupinya yang merah: (1) selisih pembulatan tidak diserap
> di semester terakhir → 4 test; (2) `batal_*` tak lagi menganulir event
> target → 3 test; (3) guard beku 1.5.4 dicabut → 1 test; (4) bail-out memakai
> kode saat baseline alih-alih kode terkini → 2 test; (5) checkpoint mengambil
> baris pertama alih-alih terbaru → 1 test. **Ulangi cara ini untuk tiap suite
> baru** — ia yang membedakan jaring pengaman dari dekorasi.

### ESLint: sedikit tapi menggigit

Menyalakan `eslint-config-next` penuh di 36.000 baris tanpa lint akan
menghasilkan ribuan peringatan yang langsung diabaikan semua orang. Mulai
dengan enam aturan yang memetakan langsung ke insiden nyata:

```js
// eslint.config.js — sengaja minimalis
rules: {
  '@typescript-eslint/no-floating-promises': 'error',   // loader tanpa penangkap → halaman beku
  '@typescript-eslint/await-thenable':       'error',
  'no-restricted-syntax': ['warn',
    { selector: "VariableDeclarator[id.type='ObjectPattern']:not(:has(Property[key.name='error'])) > AwaitExpression",
      message: 'Query Supabase wajib memeriksa `error` — pakai assertOk() (rules.md §2.6).' },
  ],
  'no-restricted-imports': ['error', { patterns: [
    { group: ['**/modules/*/data/*', '**/modules/*/ui/*'],
      message: 'Impor antar-modul hanya lewat index.ts (CODING-STANDARD §2).' },
    { group: ['@supabase/*'],
      message: 'domain/ tidak boleh menyentuh I/O.' },   // di-override per-folder untuk data/
  ]}],
  'max-lines': ['warn', { max: 500, skipBlankLines: true, skipComments: true }],
}
```

Aturan `no-restricted-imports` itulah yang **menegakkan arah dependensi**
dari CODING-STANDARD §2 — tanpa ia, pemisahan lapisan cuma niat baik.

**Kriteria selesai:** CI hijau di `main`; menambah `const { data } = await`
baru memunculkan peringatan; engine punya ≥ 25 test.

---

## 4. Fase 1 — Primitif bersama (±2 minggu menulis, adopsi berjalan terus)

Bangun tiga helper di `shared/db/` dan `shared/ui/` (kode lengkapnya di
[CODING-STANDARD.md](CODING-STANDARD.md) §4), lengkap dengan test-nya:

| Primitif | Menggantikan | Aturan yang jadi tak-bisa-dilanggar |
|---|---|---|
| `paginate()` | 126 loop tulis-tangan | keyset + `ORDER BY` + cek error (rules.md §3) |
| `assertOk()` | 166 `const { data } =` | fail-closed (rules.md §2.6) |
| `useAsyncData()` | `try/catch/finally` tulis-tangan | loader tak bisa nyangkut (rules.md §2.7) |

**Adopsi TIDAK dilakukan dengan penggantian massal.** Satu PR yang menyentuh
47 berkas mustahil di-review, dan di aplikasi yang dilaporkan ke BPK review
adalah pertahanan terakhir. Adopsi lewat *boy-scout rule*
(CODING-STANDARD §10), dengan **satu pengecualian**: kolektor di jalur
pelaporan (`lib/rekon.ts`, `lib/voidedAset.ts`, `lib/pengalihan.ts`)
dimigrasikan lebih dulu secara sengaja — di sanalah kegagalan senyap paling
mahal, dan ketiganya sudah punya golden test dari Fase 0.

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
| 2.1 | `aset/domain/visibilitas.ts` — `SEMBUNYI`/`MUNCUL` + replay | 6 berkas | duplikasi terbanyak; urutan kronologisnya halus (aksi terakhir menang, bukan "batal selalu menang") |
| 2.2 | `pengalihan/domain/kepemilikan.ts` — `ownersAt` | `lib/pengalihan.ts` + 2 halaman | atribusi SKPD period-aware, sudah pernah salah |
| 2.3 | `aset/domain/kolom.ts` — `COLS`/`EXPORT_ORDER`/`EXPORT_COLS` | Daftar Barang ↔ Daftar Barang Awal | pasangan kembar yang dijaga komentar; sekali ekstrak, "kelupaan" jadi mustahil |
| 2.4 | `kode-register/domain/` — `prefixKodeRegister`, `bergeserDariNibar` | `lib/kodeRegister.ts` | pembedaan `null` vs `false` mudah rusak; kembar dengan `fn_prefix_kode_register` di SQL |
| 2.5 | `pelaporan/domain/` — agregasi rekonsiliasi | `lib/rekon.ts` (25 KB) | berkas terbesar di `lib/`, murni-nya bisa dipisah dari I/O-nya |
| 2.6 | `perolehan/domain/draft.ts` — validasi & materialisasi draft | `Pengadaan.tsx` + `PerolehanManual.tsx` | aturan approval terjepit di dalam JSX |

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

Repo ini **sudah punya polanya** dan sudah merestuinya di rules.md §19:
`fn_daftar_barang`, `fn_rekap_bmd`, `fn_rekap_saldo_awal`,
`fn_dashboard_rekap`. Fase ini memperluasnya, bukan mengarang pendekatan baru.

Urutan berdasarkan (berat × frekuensi pakai):

1. **Daftar Barang** — paling sering dibuka, paling berat. Visibilitas
   period-aware dipindah ke RPC agar penyaringan terjadi **sebelum** baris
   menyeberang ke browser.
2. **Penyusutan** — pola identik; dua halaman ini berbagi logika, jadi RPC-nya
   bisa berbagi juga.
3. **Rekonsiliasi & Laporan BMD** — agregasi murni, kandidat paling wajar.
4. **Dashboard** — sudah sebagian lewat RPC, tuntaskan.

Per halaman, urutan kerjanya:

- **Ukur dulu**: catat jumlah query & waktu muat sebagai pengurus SKPD
  TERBESAR (bukan admin — rules.md §18). Tanpa angka sebelum, tak ada bukti
  sesudah.
- Pindahkan agregasi/paginasi/penyaringan ke RPC `SECURITY INVOKER` (biarkan
  RLS tetap berlaku) atau ke Route Handler bila butuh komposisi lintas tabel.
- `EXPLAIN` **dengan RLS aktif** (rules.md §16) — tanpa itu verifikasinya
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
  rules.md §22. Kalau skala benar-benar jadi masalah: **partisi by
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

| Metrik | Awal | 3 bln | 6 bln | 12 bln |
|---|---|---|---|---|
| Test unit domain | 0 | 60 | 150 | 300 |
| Test integrasi DB (`authenticated`) | 0 | 10 | 40 | 60 |
| Golden test laporan | 0 | 5 | 15 | 20 |
| Loop paginasi tulis-tangan | 126 | 90 | 40 | < 10 |
| `const { data } = await` | 166 | 110 | 50 | < 10 |
| Berkas > 500 baris | 19 | 15 | 8 | ≤ 3 |
| Komentar "ubah satu, samakan yang lain" | ~6 pasang | 4 | 2 | 0 |
| Query per pemuatan Daftar Barang | 8–15 | 8–15 | ≤ 5 | ≤ 5 |
| Coverage `domain/` + `shared/` | — | 60% | 80% | 85% |

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
