# Coding Standard — Penyusutan BMD

> **Dokumen ini wajib diacu setiap kali menulis kode di repo ini** (manusia
> maupun agent AI). Ia menjawab *"bagaimana cara menulisnya"*.
>
> **Peta seluruh dokumen: [README.md](README.md).**
>
> Kalau standar ini bertabrakan dengan [rules.md](rules.md), **rules.md
> menang** — itu aturan integritas data, ini aturan kerapian.

---

## 0. Satu kalimat yang memayungi semuanya

> **Aturan yang hanya ditulis di komentar akan dilanggar. Aturan yang
> diwujudkan jadi fungsi/tipe tidak bisa dilanggar.**

Repo ini punya dokumentasi yang luar biasa rinci — dan tetap kebobolan
berkali-kali oleh bug yang dokumennya sudah melarang: `batal_pengalihan`
kelewat **tiga ronde**, filter void diam-diam mati berbulan-bulan, paginasi
tanpa `ORDER BY` menghilangkan baris tanpa suara. Bukan karena dokumennya
kurang bagus, tapi karena **komentar tidak dieksekusi**.

Karena itu arah setiap refactor di repo ini sama: **memindahkan aturan dari
prosa ke kode.** Setiap kali kamu menulis komentar berbunyi *"⚠️ jangan lupa
juga ubah X"* atau *"ubah satu, samakan yang lain"*, itu **bau desain** —
tandanya ada abstraksi yang belum dibuat. Komentarnya boleh tetap ada, tapi
tugasmu adalah membuat "lupa" jadi mustahil, bukan sekadar tidak dianjurkan.

---

## 1. Prinsip Pemandu

### 1.1 KISS — yang paling sederhana yang benar
Pilih solusi paling sederhana yang **memenuhi aturan integritas**. Sederhana
≠ sedikit baris. `const { data } = await …` itu sedikit baris tapi tidak
sederhana — ia memindahkan beban "ingat cek error" ke pembaca berikutnya.

### 1.2 DRY — untuk *pengetahuan*, bukan untuk *teks*
Yang haram diduplikasi adalah **satu keputusan bisnis yang hidup di dua
tempat**: daftar `SEMBUNYI`/`MUNCUL`, algoritma replay visibilitas, predikat
partial index vs konstanta di kode, `COLS` Daftar Barang vs `BASE_COLS`
Daftar Barang Awal.

Dua potong JSX yang kebetulan mirip **bukan** duplikasi — jangan disatukan
dengan sepuluh prop boolean. Itu justru melanggar KISS.

**Rule of three:** kemiripan pertama biarkan, kedua catat, **ketiga wajib
diekstrak**. Pengecualian — kalau duplikatnya adalah *aturan integritas*
(daftar jenis ledger, predikat index, urutan kolom laporan), ekstrak sejak
**kemunculan kedua**. Di sana harga sebuah kelupaan adalah angka salah di
laporan BPK, bukan sekadar kode jelek.

### 1.3 Fail-closed sebagai default bahasa
Gagal harus **berisik**. Nilai kembalian kosong tidak boleh bisa berarti dua
hal ("memang kosong" vs "query gagal"). Utamakan API yang **melempar**
daripada yang mengembalikan `null`.

### 1.4 YAGNI, dengan satu pengecualian
Jangan bangun abstraksi untuk kebutuhan yang dibayangkan. Pengecualiannya:
**seam untuk pengujian**. Memisahkan logika murni dari I/O bukan spekulasi —
itu satu-satunya cara logikanya bisa diuji sama sekali.

### 1.5 Composition over configuration
Komponen dengan 12 prop boolean lebih sulit dipahami daripada tiga komponen
yang jelas. Kalau sebuah prop bernama `mode` atau `variant` sudah punya lebih
dari 3 nilai dan tiap nilai mengubah alur, pecah komponennya.

---

## 2. Lapisan & Arah Ketergantungan

Empat lapisan. **Panah hanya boleh menunjuk ke bawah.**

```
  app/        Routing, layout, komposisi halaman. TIPIS.
     │
     ▼
  ui/         Komponen React. Boleh state UI, TIDAK boleh aturan bisnis.
     │
     ▼
  data/       SATU-SATUNYA tempat menyentuh Supabase. Kolektor & mutasi.
     │
     ▼
  domain/     Logika murni. NOL I/O. Tidak boleh import supabase, React,
              next, maupun DOM.
```

Tiga aturan yang menegakkannya:

1. **`domain/` tidak boleh meng-import apa pun yang punya efek samping.**
   Konsekuensi langsungnya: seluruh isi `domain/` bisa diuji tanpa database,
   tanpa browser, dalam hitungan milidetik.
2. **Hanya `data/` yang boleh menyebut nama tabel.** Komponen tidak pernah
   menulis `.from('aset')`. Saat ini ada **520 pemanggilan `.from()`** yang
   tersebar sampai ke dalam JSX — itu sebabnya rename kolom = `grep` dan
   berdoa.
3. **Antar-modul hanya lewat `index.ts`.** Modul `pelaporan` boleh
   `import { hitungJadwalAset } from '@/modules/penyusutan'`, tapi tidak boleh
   menyelinap ke `@/modules/penyusutan/data/queries`.

> Kenapa ini penting untuk *aplikasi ini* secara khusus: aturan-aturan di
> [rules.md](rules.md) hampir semuanya adalah aturan **domain** (kapan barang
> tersembunyi, siapa pemiliknya pada periode V, event mana yang dianulir).
> Selama aturan itu tinggal di dalam komponen React setinggi 1.400 baris, ia
> **tidak bisa diuji** dan **wajib disalin** ke setiap halaman yang butuh.
> Kedua hal itulah akar sebagian besar insiden yang tercatat di CLAUDE.md.

---

## 3. Struktur Folder

### 3.1 Kondisi sekarang & masalahnya

Folder disusun **berdasarkan jenis teknis**, bukan domain:

```
app/ …          148 berkas .tsx, 135 di antaranya 'use client'
components/ …   dikelompokkan setengah jalan (pengelolaan/, pelaporan/, …)
                + 30 berkas menumpuk di akar
lib/ …          28 berkas datar: rekon.ts (25 KB) bersebelahan dengan
                tahunKerja.ts (1 KB), tanpa penanda batas domain
```

Dengan 10–20 domain, batas antar-domain hanya hidup di kepala pengembang dan
di CLAUDE.md. Filesystem tidak menolak apa pun.

### 3.2 Struktur target

```
app/                          # ROUTING SAJA — idealnya < 60 baris per page.tsx
  dashboard/daftar-barang/page.tsx
  api/…

modules/                      # ← satu folder per domain
  aset/
    domain/                   # murni, teruji, nol I/O
      visibilitas.ts          #   SEMBUNYI/MUNCUL + replay  (SATU sumber)
      urutan.ts               #   bandingKode
      kolom.ts                #   COLS / EXPORT_ORDER / EXPORT_COLS
    data/                     # satu-satunya penyentuh supabase
      aset.queries.ts
    ui/
      DaftarBarangTable.tsx
      useDaftarBarang.ts      # hook: state + orkestrasi fetch
    index.ts                  # API publik modul
  penyusutan/
  pengalihan/
  pemanfaatan/
  pengamanan/
  kir/  inventarisasi/  rkbmd/  ipa/  gis/  lra/
  saldo-awal/  tahun-buku/  kode-register/  pelaporan/

shared/                       # dipakai lintas domain — jaga tetap KECIL
  db/
    paginate.ts               # keyset, satu implementasi
    query.ts                  # assertOk / selectOrThrow
    client.ts  server.ts
  ui/                         # Button, Modal, DataTable, Combobox, EmptyState
  format/                     # angka, tanggal, periode
  types/
    database.types.ts         # DIGENERATE (supabase gen types) — jangan diketik tangan
```

**Kandidat modul** (dari struktur sekarang): `aset`, `penyusutan`,
`perolehan` (5 menu Cara Perolehan), `pengelolaan` (penghapusan,
kapitalisasi, koreksi, reklasifikasi), `pengalihan`, `pemanfaatan`,
`pengamanan`, `kir`, `kibar`, `inventarisasi`, `rkbmd`, `ipa`, `gis`, `lra`,
`saldo-awal`, `tahun-buku`, `kode-register`, `pelaporan`, `admin`.

### 3.3 Aturan pemindahan

- **Pindahkan per domain, saat domain itu memang sedang disentuh.** Jangan
  pernah satu commit besar yang memindahkan semuanya.
- **Satu commit = pindah berkas saja, tanpa perubahan isi.** Kalau ada
  perbaikan yang ingin dibawa, taruh di commit berikutnya. Diff "pindah +
  ubah" mustahil di-review.
- **Tetap di root, jangan ke `src/`.** Tidak ada manfaat teknisnya dan
  memindahkan semua path sekaligus itu mesin konflik merge.
- `components/` dan `lib/` yang lama **dibiarkan hidup** selama transisi.
  Selesai ketika kosong, bukan sebelumnya.

---

## 4. Primitif Wajib

Ini bagian paling penting dari dokumen ini: tiga helper yang mengubah aturan
paling sering dilanggar menjadi aturan yang **tidak bisa** dilanggar.

### 4.1 `paginate()` — satu-satunya cara mengambil >1.000 baris

**Masalah terukur:** ada **126 loop paginasi yang ditulis tangan di 47
berkas**. Tiap satu adalah kesempatan untuk mengulang bug yang sudah
didokumentasikan: tanpa `ORDER BY` (baris hilang senyap), pakai `.range()`
alih-alih keyset (timeout di halaman dalam), dan tanpa cek `error` (hasil
kosong dibaca sebagai "memang tidak ada").

```ts
// shared/db/paginate.ts
/**
 * Ambil SELURUH baris lewat paginasi keyset. Satu-satunya cara yang sah untuk
 * menarik >1.000 baris (rules.md §3).
 *
 * Keyset, bukan .range(): biaya OFFSET tumbuh mengikuti kedalaman halaman dan
 * cepat atau lambat satu halaman menembus statement timeout.
 * MELEMPAR saat error: array kosong tidak boleh bisa berarti "query gagal".
 */
export async function paginate<T extends { id: K }, K extends string | number>(
  label: string,                              // muncul di pesan error, mis. 'daftar barang'
  build: (kursor: K | null) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  opts: { size?: number } = {},
): Promise<T[]> {
  const size = opts.size ?? 1000
  const out: T[] = []
  let kursor: K | null = null
  for (;;) {
    const { data, error } = await build(kursor)
    if (error) throw new Error(`gagal membaca ${label}: ${error.message}`)
    if (!data?.length) break
    out.push(...data)
    if (data.length < size) break
    kursor = data[data.length - 1].id
  }
  return out
}
```

Pemakaian:

```ts
const rows = await paginate<AsetRow, string>('daftar barang', (kursor) => {
  let q = sb.from('aset').select(SELECT_COLS).eq('status', 'aktif').order('id').limit(1000)
  if (kursor) q = q.gt('id', kursor)
  return q
})
```

> **`.range()` masih boleh** hanya untuk paginasi yang ditampilkan ke layar
> per halaman (mis. Daftar Barang Awal, halaman 50 baris). Yang dilarang
> adalah `.range()` untuk **menyapu seluruh hasil**.

### 4.2 `assertOk()` — error tidak bisa ditelan

**Masalah terukur:** **166 pemakaian `const { data } = await supabase…`**
tanpa menyentuh `error` sama sekali.

```ts
// shared/db/query.ts
export function assertOk<T>(
  res: { data: T | null; error: { message: string } | null },
  label: string,
): T {
  if (res.error) throw new Error(`gagal membaca ${label}: ${res.error.message}`)
  if (res.data == null) throw new Error(`gagal membaca ${label}: data kosong`)
  return res.data
}
```

```ts
// ❌ tidak boleh lagi — gagal senyap
const { data } = await sb.from('admin_skpd').select('id,nama')

// ✅
const skpd = assertOk(await sb.from('admin_skpd').select('id,nama'), 'daftar SKPD')
```

**Pengecualian sah** (dan wajib diberi komentar sebaris menjelaskan
kenapa): pencarian opsional yang tidak-ketemu memang bukan kegagalan, mis.
lookup preferensi. Kalau nilai kembaliannya ikut **dihitung** atau ikut
**difilter** — tidak ada pengecualian. Lihat kasus `generateNibars` di
CLAUDE.md: lookup gagal → nomor urut diam-diam mengulang dari 1.

### 4.3 `useAsyncData()` — loader tidak bisa nyangkut

**Masalah terukur:** kolektor sudah fail-closed (melempar), tapi pemanggilnya
tidak selalu punya `try/catch`. Daftar Barang pernah membeku di "Memuat…"
**selamanya** tanpa satu pun keterangan (CLAUDE.md, 2026-07-29).

```ts
// shared/ui/useAsyncData.ts
/**
 * Bungkus loader yang MELEMPAR. `setLoading(false)` dijamin lewat finally, dan
 * pesan errornya wajib ditampilkan pemanggil — dua hal yang berkali-kali lupa
 * ditulis tangan (rules.md §2).
 */
export function useAsyncData<T>() {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const run = useCallback(async (fn: () => Promise<T>) => {
    setLoading(true); setError('')
    try { setData(await fn()) }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); setData(null) }
    finally { setLoading(false) }
  }, [])

  return { data, loading, error, run }
}
```

Berlaku sama untuk **tombol Export** — Excel setengah jadi yang terlanjur
terunduh tidak punya tanda apa pun bahwa isinya kurang.

### 4.4 Tipe database digenerate, bukan diketik

Sekarang tiap halaman mendeklarasikan `type Row = { … }` sendiri. Kalau kolom
di DB berubah tipe atau nullability, TypeScript **tidak tahu apa-apa**.

```bash
npx supabase gen types typescript --project-id <id> > shared/types/database.types.ts
```

Lalu turunkan tipe baris dari sana, jangan tulis ulang:

```ts
type AsetRow = Pick<Tables<'aset'>, 'id' | 'nibar' | 'kode' | 'nilai_perolehan'>
```

---

## 5. Aturan Komponen React

### 5.1 Batas ukuran (indikator, bukan hukum)

| Ukuran | Artinya |
|---|---|
| > 300 baris | perlu dipecah saat berikutnya disentuh |
| > 500 baris | wajib dipecah sebelum menambah fitur baru di dalamnya |
| > 15 `useState` | state-nya minta `useReducer` atau dipecah per sub-form |

Kondisi sekarang: `Pengadaan.tsx` **1.437 baris / 60 `useState`**,
`Koreksi.tsx` **1.422 / 49**, `PerolehanManual.tsx` **1.043 / 42**.

### 5.2 Container / Presenter

```
useDaftarBarang.ts   ← state + orkestrasi pemanggilan data/  (tanpa JSX)
DaftarBarangTable.tsx← menerima props, merender               (tanpa fetch)
page.tsx             ← merangkai keduanya
```

Presenter yang tidak melakukan fetch bisa diuji dengan Testing Library tanpa
menyentuh jaringan sama sekali.

### 5.3 Server Component dulu, baru client

**135 dari 148 komponen adalah `'use client'`.** Akibatnya setiap halaman
melakukan 8–15 *round-trip* dari browser, masing-masing membayar ongkos RLS,
dan **dikalikan 100–150 pengguna serentak**.

Aturan baru: halaman default **Server Component**; `'use client'` hanya
diberikan pada bagian yang benar-benar interaktif (form, picker, tabel
ber-filter). Untuk daftar berat, ikuti pola yang memang sudah direstui repo
ini — agregasi & paginasi **di server** lewat RPC (`fn_daftar_barang`,
`fn_rekap_bmd`, `fn_rekap_saldo_awal`).

### 5.4 Data turunan dihitung saat render, bukan disimpan di state

Jangan `useEffect` + `setState` untuk sesuatu yang bisa dihitung dari state
yang sudah ada. Itu sumber render ganda dan state basi. Pakai `useMemo` bila
memang mahal; kalau tidak, hitung langsung.

---

## 6. Penamaan

Repo ini berbahasa Indonesia dan **itu dipertahankan** — istilah domainnya
memang istilah regulasi (`nibar`, `penyusutan`, `pengalihan_status`,
`intra_ekstra`). Menerjemahkannya ke Inggris justru memutus hubungan dengan
Perbup dan dengan istilah yang dipakai operator.

| Hal | Aturan | Contoh |
|---|---|---|
| Istilah domain | Indonesia, **persis** seperti di regulasi/DB | `nilai_perolehan`, `masa_manfaat` |
| Kolom DB & `FieldKey` | `snake_case`, 1:1 dengan nama kolom | `penggunaan_pengamanan` |
| Fungsi & variabel TS | `camelCase` | `hitungJadwalAset` |
| Komponen & tipe | `PascalCase` | `DaftarBarangTable` |
| Konstanta modul | `SCREAMING_SNAKE` | `SEMBUNYI`, `EXPORT_ORDER` |
| Kolektor yang melempar | awali `fetch…` | `fetchOwnerOverrides` |
| Fungsi murni penghitung | awali `hitung…` / `banding…` / `format…` | `hitungJadwalAset` |
| Boolean | awali `is…` / `boleh…` / `sudah…` | `bolehSetujuiJurnal` |

Satuan **wajib** ikut di nama kalau ambigu: `masa_manfaat_tahun` vs
`masa_manfaat_smt`. Angka "100" tanpa label bisa terbaca 100 tahun.

---

## 7. Komentar

Gaya komentar repo ini — menjelaskan **kenapa**, menyebut tanggal keputusan
dan insiden aslinya — adalah aset nyata. **Pertahankan.** Tapi pakai
klasifikasi ini:

| Jenis | Perlakuan |
|---|---|
| **Kenapa** ("dulu pernah rusak begini, karena itu…") | ✅ pertahankan, ini yang paling berharga |
| **Keputusan user + tanggal** | ✅ pertahankan |
| **Apa** ("loop 1.000 baris") | ❌ hapus — kodenya sudah bilang |
| **"⚠️ ubah satu, samakan yang lain"** | ⚠️ **utang desain** — catat di REFACTOR-PLAN, jadwalkan penyatuannya |

Kategori terakhir itu yang jadi target refactor. Saat ini ada setidaknya
enam pasang konstanta kembar yang dijaga hanya oleh peringatan tertulis
(daftar lengkapnya di [rules.md](rules.md) §5.5).

---

## 8. Aturan Migrasi SQL

Sudah lengkap di [rules.md](rules.md) §5 dan [architecture.md](architecture.md)
§4.5. Yang ditambahkan standar ini:

- **Satu migrasi = satu maksud.** Jangan campur `ADD VALUE` enum dengan
  backfill data — deploy-ordering-nya berbeda dan `ADD VALUE` tak bisa
  dipakai di transaksi yang sama.
- **Setiap migrasi diawali komentar header**: tanggal, maksud, kaitan dengan
  perubahan kode, dan apakah ia **wajib jalan sebelum deploy kode**.
- **Konstanta kembar SQL↔TS wajib saling menyebut.** Predikat partial index
  menyebut nama konstanta TS-nya, dan sebaliknya. Sampai bisa digenerate,
  minimal keduanya bisa saling ditemukan lewat `grep`.

---

## 9. Checklist Sebelum Commit

Integritas (dari [rules.md](rules.md) — **blocking**):

- [ ] Tidak ada UPDATE/DELETE ke `transaksi_bmd`.
- [ ] Setiap kolektor cek `error` dan **melempar**.
- [ ] Setiap pemanggil kolektor: `try` / `catch` / `finally` + error yang
      **ditampilkan**. Tombol Export ikut dibungkus.
- [ ] Paginasi keyset + `.order('id')` + ada index yang memuat kolom urutnya.
- [ ] Menambah jenis `batal_*`? Sudah menyisir tujuh titik di rules.md §1.7.
- [ ] Ada migrasi? Deploy-ordering-nya sudah disebutkan di pesan commit.

Kerapian (dari dokumen ini — *dianjurkan, tidak memblokir*):

- [ ] Aturan bisnis baru diletakkan di `domain/` dan **punya unit test**.
- [ ] Tidak ada `.from('…')` baru di dalam komponen.
- [ ] Tidak ada loop paginasi baru yang ditulis tangan — pakai `paginate()`.
- [ ] Berkas yang disentuh tidak jadi lebih panjang dari sebelumnya
      (*boy-scout rule*).
- [ ] `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json`,
      disaring ke berkas yang disentuh (ada error pre-existing — jangan baca
      exit code mentah).

---

## 10. Boy-Scout Rule (ini yang membuat refactor berjalan paralel)

Refactor di repo ini **tidak punya sprint sendiri**. Ia menumpang pada
pekerjaan fitur:

> Setiap kali kamu menyentuh sebuah berkas untuk fitur atau perbaikan,
> tinggalkan ia **satu langkah** lebih dekat ke standar ini. Satu langkah,
> bukan sepuluh.

Satu langkah yang sah, misalnya:

- mengganti satu loop paginasi tulis-tangan dengan `paginate()`;
- membungkus satu `const { data } =` dengan `assertOk()`;
- menarik satu fungsi murni keluar dari komponen ke `domain/` **berikut
  test-nya**;
- memindahkan satu berkas ke folder modulnya (commit terpisah, tanpa ubah
  isi).

Aturan penyeimbangnya sama pentingnya: **jangan merapikan berkas yang tidak
sedang kamu sentuh.** Diff fitur yang bercampur refactor tak bisa di-review,
dan di aplikasi keuangan yang dilaporkan ke BPK, review adalah pertahanan
terakhir.
