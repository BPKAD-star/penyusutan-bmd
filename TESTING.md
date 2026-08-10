# Strategi & Desain Pengujian — Penyusutan BMD

> Dokumen ini menjawab: **apa yang diuji, di lapisan mana, dan kenapa.**
>
> **Peta seluruh dokumen: [README.md](README.md).**

**Kondisi awal (2026-08-03): nol test, nol lint, nol CI.** 36.000 baris kode
yang mengelola data aset milik pemerintah daerah, dilaporkan ke inspektorat
dan BPK, diverifikasi sepenuhnya secara manual.

**Kondisi sekarang (2026-08-05)** — perbarui tanggalnya tiap kali berubah,
supaya paragraf di atas tidak terbaca sebagai keadaan hari ini:

| | Status |
|---|---|
| Unit domain | ✅ **264 test, semua hijau** (`npm test`, ±1,5 dtk) — `engine/penyusutan` 79 · `bmd` 74 · `golden/rekonsiliasi` 26 · `rekon` 21 · `visibilitas` 18 · `shared/db/paginate` 15 · `sinkronisasi` 12 · `shared/ui/useAsyncData` 10 · `shared/db/query` 9. Termasuk 6 invarian property-based (`fast-check`) |
| Komponen / hook (jsdom) | 🟡 baru primitif `shared/ui/` — `@testing-library/react` + `jsdom` sudah terpasang, jadi test presenter berikutnya tinggal ditulis (§7.1) |
| Integrasi DB (`authenticated`) | ⬜ belum ada — **ini lubang terbesar**, lihat §5 |
| Golden test laporan | ✅ **Rekonsiliasi BMD** — `tests/golden/`, 26 test + 3 snapshot, dataset tetap 18 aset. Menemukan **2 dugaan bug** saat dipasang (lihat REFACTOR-PLAN §4) |
| Typecheck | ✅ **0 error** (`npx tsc --noEmit -p tsconfig.json`) — tanpa baseline |
| Tipe DB generated | ✅ `shared/types/database.types.ts` (`npm run gen:types`). Dijaga tidak ketinggalan dari migrasi oleh `lib/sinkronisasi.test.ts` §4 |
| Lint | ✅ `eslint.config.mjs` — 6 aturan, **0 error / 569 warning** (2026-08-06). Warning = utang terukur, sengaja tidak memerahkan CI |
| CI | ✅ `.github/workflows/ci.yml` — typecheck + unit test + lint tiap push |

Artinya jantung angkanya (engine) sudah terkunci, tapi **separuh invarian sistem
ini yang hidup di dalam database masih nol pengawasan** — dan itu justru lapisan
yang paling tidak bisa diuji dari TypeScript.

---

## 1. Model risiko — apa yang sebenarnya kita takuti

Sebelum memilih alat, tetapkan dulu **mode kegagalan yang paling mahal**.
Untuk aplikasi ini, urutannya jelas dan itu sudah terbukti berkali-kali:

| Peringkat | Mode kegagalan | Contoh nyata (CLAUDE.md) |
|---|---|---|
| **1** | **Angka salah yang terlihat sah** | filter void diam-diam mati → barang yang sudah dibatalkan muncul lagi sebagai perolehan sah di 3 laporan sekaligus |
| **2** | **Data hilang senyap** | paginasi tanpa `ORDER BY` → baris terlewat di atas 1.000 |
| **3** | **Identitas rusak** | `generateNibars` gagal → nomor urut mengulang dari 1 |
| **4** | Halaman error / beku | Daftar Barang membeku di "Memuat…" selamanya |
| **5** | Tampilan jelek | — |

Konsekuensi langsung untuk strategi tes: **prioritas tertinggi bukan "apakah
tombolnya bisa diklik", tapi "apakah angkanya benar dan lengkap".** Itu
memindahkan bobot ke unit test logika murni + golden test laporan, bukan ke
E2E.

Peringkat 4 sengaja diletakkan di bawah 1–3: halaman error itu **berisik**,
jadi ketahuan dalam hitungan menit. Angka salah itu **sunyi**, dan bisa
sampai ke BPK.

---

## 2. Piramida tes untuk repo ini

```
        ╱╲          E2E (Playwright) — ~10 alur
       ╱  ╲         hanya jalur kritis, dijalankan nightly
      ╱────╲
     ╱      ╲       Golden / karakterisasi laporan — ~20 berkas
    ╱        ╲      dataset tetap → total laporan dibandingkan snapshot
   ╱──────────╲
  ╱            ╲    Integrasi DB (Postgres asli) — ~60 test
 ╱              ╲   RLS · trigger · RPC, dijalankan sebagai `authenticated`
╱────────────────╲
──────────────────  Unit domain (Vitest) — ratusan, < 2 detik total
                    fungsi murni: engine, replay, kepemilikan, format
```

Dua lapis tengah (**golden** dan **integrasi DB**) tidak ada di piramida
standar, dan justru di sanalah nilai terbesar untuk aplikasi ini:

- **Setengah invarian sistem ini hidup di dalam database**, bukan di
  TypeScript — append-only, kunci tahun buku, guard self-approve, penerbitan
  kode register, penguncian baseline. Unit test tidak bisa menyentuhnya sama
  sekali.
- **Kebenaran = angka akhir laporan**, dan laporan itu hasil komposisi
  belasan kolektor. Golden test menangkap regresi komposisi yang lolos dari
  semua unit test masing-masing bagian.

---

## 3. Prinsip yang dipakai

- **AAA** — *Arrange, Act, Assert*, dipisah baris kosong. Satu perilaku per
  test.
- **FIRST** — *Fast, Independent, Repeatable, Self-validating, Timely*.
  "Independent" berarti tak ada test yang bergantung pada urutan atau pada
  sisa data test lain: tiap test integrasi jalan di **transaksi yang
  di-rollback**.
- **Uji perilaku, bukan implementasi.** Assert pada nilai kembalian dan efek
  yang teramati, bukan pada "fungsi X dipanggil 2 kali". Kalau tidak, refactor
  yang benar akan memerahkan test — dan test yang selalu merah akan diabaikan.
- **Nama test = spesifikasi.** `it('mengabaikan kapitalisasi yang sudah
  dibatalkan lewat target_trx_id')`, bukan `it('works')`.
- **Test double hanya di batas sistem** (jaringan, jam, storage). Jangan
  mem-*mock* logika domain sendiri — kalau butuh mock untuk mengujinya,
  itu tandanya lapisannya belum dipisah.
- **Waktu itu dependensi.** `new Date()` di dalam logika bikin test tidak
  *repeatable*. Terima `hariIni: string` sebagai parameter — tuntutan yang
  sama juga membuat kode lebih jujur soal periode.

---

## 4. Lapisan 1 — Unit domain (prioritas tertinggi, mulai di sini)

### 4.1 Kenapa mulai di sini
`lib/engine/penyusutan.ts` **sudah** berupa fungsi murni: `hitungJadwalAset`
menerima aset + ledger + kodefikasi + band, mengembalikan jadwal. Tidak
menyentuh jaringan. **Nol refactor dibutuhkan untuk mulai mengujinya** —
sekaligus komponen paling berisiko di seluruh aplikasi.

### 4.2 Setup

```bash
npm i -D vitest @vitest/coverage-v8 @testing-library/react @testing-library/jest-dom jsdom
```

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, '.') } },
  test: {
    environment: 'node',              // komponen React pakai // @vitest-environment jsdom
    include: ['**/*.test.ts', '**/*.test.tsx'],
    exclude: ['node_modules', '.next'],
    coverage: {
      provider: 'v8',
      // Ambang HANYA untuk logika murni. Menetapkan target coverage global di
      // repo yang mulai dari nol cuma menghasilkan test basa-basi.
      include: ['lib/engine/**', 'modules/**/domain/**', 'shared/**'],
      thresholds: { statements: 80, branches: 75 },
    },
  },
})
```

```jsonc
// package.json → scripts
"test":          "vitest run",
"test:watch":    "vitest",
"test:coverage": "vitest run --coverage",
"typecheck":     "tsc --noEmit -p tsconfig.json"
```

### 4.3 Yang wajib diuji lebih dulu

| Target | Kenapa mendesak |
|---|---|
| `hitungJadwalAset` | jantung seluruh angka neraca |
| `cariBand` | pemilihan band overhaul: prefix terpanjang + batas atas |
| replay visibilitas (SEMBUNYI/MUNCUL) | duplikat di **6 berkas**, urutan kronologisnya halus |
| `ownersAt` / `fetchOwnerOverrides` (bagian murninya) | atribusi SKPD period-aware |
| `periodeDariTanggal` · `comparePeriode` · `parsePeriode` | dipakai hampir semua modul |
| `klasifikasiKomptabel` | menentukan intra/ekstra saat approve |
| `prefixKodeRegister` · `bergeserDariNibar` | `null` ≠ `false` — pembedaan yang mudah rusak |
| `bandingKode` | urutan tiga kunci; tanpa pemecah seri isi halaman berpindah |
| `asalUsulTampil` | turunan tampilan, isian operator harus menang |

### 4.4 Contoh — engine

```ts
// lib/engine/penyusutan.test.ts
import { describe, it, expect } from 'vitest'
import { hitungJadwalAset, cariBand, type TrxLedger } from './penyusutan'

const asetPM = {
  id: 'a1', kode: '1.3.2.02.01.02.003',
  nilai_perolehan: 10_000_000, intra_ekstra: 'intra', tgl_perolehan: '2026-01-10',
}
const masaManfaat = new Map([['1.3.2.02.01.02.003', 5]])   // 5 tahun = 10 semester

const saldoAwal = (over: Partial<TrxLedger> = {}): TrxLedger => ({
  jenis: 'saldo_awal', periode: '2025-S2', tanggal: '2025-12-31', nilai: 0,
  payload: {}, created_at: '2025-12-31T00:00:00Z', ...over,
})

describe('hitungJadwalAset', () => {
  it('menyusutkan lurus dan memaksa nilai buku 0 di semester terakhir', () => {
    const jadwal = hitungJadwalAset(asetPM, [], masaManfaat, [], '2030-S2')

    expect(jadwal).toHaveLength(10)
    expect(jadwal[0].beban).toBe(1_000_000)
    expect(jadwal.at(-1)!.nilai_buku_akhir).toBe(0)
    expect(jadwal.at(-1)!.sisa_semester).toBe(0)
  })

  it('menjaga akumulasi tepat sama dengan jumlah seluruh beban', () => {
    const jadwal = hitungJadwalAset(asetPM, [], masaManfaat, [], '2030-S2')

    const totalBeban = jadwal.reduce((s, r) => s + r.beban, 0)
    expect(jadwal.at(-1)!.akumulasi).toBe(totalBeban)
    // Selisih pembulatan diserap di semester terakhir, bukan menetes tiap semester.
    expect(totalBeban).toBe(asetPM.nilai_perolehan)
  })

  it('IKUT menyusutkan barang ekstrakomptabel (keputusan user 2026-07-13)', () => {
    // Dulu engine bail-out `if (ekstra) return []`. Pemisahan intra/ekstra
    // terjadi di LAPORAN, bukan di sini.
    const jadwal = hitungJadwalAset({ ...asetPM, intra_ekstra: 'ekstra' }, [], masaManfaat, [], '2027-S2')

    expect(jadwal.length).toBeGreaterThan(0)
    expect(jadwal[0].beban).toBeGreaterThan(0)
  })

  it('membekukan golongan 1.5.4 Aset Lain-Lain — akumulasi lama tetap, beban baru nol', () => {
    const jadwal = hitungJadwalAset({ ...asetPM, kode: '1.5.4.01.01.01.001' }, [saldoAwal()], masaManfaat, [], '2027-S2')

    expect(jadwal.every(r => r.beban === 0)).toBe(true)
  })

  it('mengabaikan kapitalisasi yang dianulir lewat payload.target_trx_id', () => {
    const trxs: TrxLedger[] = [
      saldoAwal(),
      { id: 7, jenis: 'kapitalisasi', periode: '2026-S1', tanggal: '2026-03-01',
        nilai: 5_000_000, payload: {}, created_at: '2026-03-01T00:00:00Z' },
      { id: 8, jenis: 'batal_kapitalisasi', periode: '2026-S1', tanggal: '2026-03-05',
        nilai: 0, payload: { target_trx_id: 7 }, created_at: '2026-03-05T00:00:00Z' },
    ]

    const dianulir = hitungJadwalAset(asetPM, trxs, masaManfaat, [], '2027-S2')
    const polos    = hitungJadwalAset(asetPM, [saldoAwal()], masaManfaat, [], '2027-S2')

    expect(dianulir).toEqual(polos)
  })

  it('memulai replay dari saldo_awal_checkpoint TERBARU, bukan dari baseline 2025', () => {
    const trxs = [saldoAwal(), saldoAwal({ jenis: 'saldo_awal_checkpoint', periode: '2026-S2' })]

    const jadwal = hitungJadwalAset(asetPM, trxs, masaManfaat, [], '2027-S2')

    expect(jadwal[0].periode).toBe('2027-S1')
  })
})

describe('cariBand', () => {
  const bands = [
    { kode_prefix: '1.3.2',     band_no: 1, pct_min: 0,  pct_max: 30,   tambahan_tahun: 1 },
    { kode_prefix: '1.3.2',     band_no: 2, pct_min: 30, pct_max: null, tambahan_tahun: 2 },
    { kode_prefix: '1.3.2.02',  band_no: 1, pct_min: 0,  pct_max: 100,  tambahan_tahun: 5 },
  ]

  it('memilih prefix TERPANJANG yang cocok', () => {
    expect(cariBand(bands, '1.3.2.02.01', 10)?.tambahan_tahun).toBe(5)
  })

  it('jatuh ke band open-ended kalau persen rehab melewati semua batas atas', () => {
    expect(cariBand(bands, '1.3.2.99', 250)?.tambahan_tahun).toBe(2)
  })

  it('mengembalikan null kalau tak ada prefix yang cocok', () => {
    expect(cariBand(bands, '1.3.1.01', 10)).toBeNull()
  })
})
```

### 4.5 Property-based test untuk engine

Aturan pembulatan engine (beban dibulatkan ke rupiah penuh, selisih diserap
di semester terakhir) adalah tempat bug desimal bersembunyi. Contoh
tersebar tak akan menemukannya; **invarian** akan.

```bash
npm i -D fast-check
```

```ts
import fc from 'fast-check'

it('invarian: nilai buku tidak pernah negatif & akumulasi tidak pernah melebihi perolehan', () => {
  fc.assert(fc.property(
    fc.integer({ min: 1, max: 5_000_000_000 }),   // nilai perolehan
    fc.integer({ min: 1, max: 50 }),              // masa manfaat (tahun)
    (nilai, tahun) => {
      const jadwal = hitungJadwalAset(
        { ...asetPM, nilai_perolehan: nilai },
        [], new Map([[asetPM.kode, tahun]]), [], '2099-S2',
      )
      return jadwal.every(r =>
        r.nilai_buku_akhir >= 0 &&
        r.akumulasi <= nilai &&
        r.beban >= 0
      )
    },
  ), { numRuns: 500 })
})
```

Invarian lain yang layak diuji begini: `sisa_semester` turun tepat 1 tiap
periode dan tak pernah negatif; `nilai_buku_akhir[n] === nilai_buku_awal[n+1]`;
jumlah seluruh beban === akumulasi akhir.

---

## 5. Lapisan 2 — Integrasi database

### 5.1 Kenapa tidak bisa dilewati
Invarian ini **hanya** ada di DB dan tidak satu pun bisa diuji dari
TypeScript:

- `transaksi_bmd` menolak UPDATE/DELETE (`fn_transaksi_bmd_immutable`)
- tanggal masa depan & tahun terkunci ditolak (`fn_cek_tahun_buku`), tahun tak
  terdaftar = terkunci (*fail-closed*)
- pembuat kartu tak boleh menyetujui kartunya sendiri
  (`fn_jurnal_header_approval_guard`)
- baseline `aset_awal_2026` terkunci dua lapis (GRANT per-kolom + trigger)
- kode register diterbitkan trigger, dipulihkan saat batal pengalihan
- RLS per-SKPD: operator tak bisa membaca/menulis di luar subtree-nya

### 5.2 ⚠️ Aturan paling penting di seluruh dokumen ini

> **Jalankan test integrasi sebagai role `authenticated` dengan
> `request.jwt.claims` terpasang — JANGAN sebagai `service_role`.**

Sebagai `service_role`/superuser, RLS dilewati: query yang rusak tetap
terlihat 0,2 detik dan guard yang bocor tetap terlihat lulus. Persis begitu
migrasi `20260728_05` lolos verifikasi padahal belum menyelesaikan apa pun
(CLAUDE.md). **Test yang jalan sebagai `service_role` memberi rasa aman palsu
— lebih berbahaya daripada tidak punya test.**

```ts
// tests/db/helper.ts
import { Client } from 'pg'

/** Jalankan fn di dalam transaksi sebagai `authenticated`, lalu ROLLBACK. */
export async function sebagai(
  user: { id: string; role: 'admin' | 'operator' | 'viewer'; skpd_id: number },
  fn: (c: Client) => Promise<void>,
) {
  const c = new Client({ connectionString: process.env.TEST_DATABASE_URL })
  await c.connect()
  try {
    await c.query('BEGIN')
    await c.query(`SET LOCAL role authenticated`)
    await c.query(`SELECT set_config('request.jwt.claims', $1, true)`,
      [JSON.stringify({ sub: user.id, role: 'authenticated' })])
    await fn(c)
  } finally {
    await c.query('ROLLBACK')   // tiap test bersih, urutan tak berpengaruh
    await c.end()
  }
}
```

```ts
// tests/db/ledger.test.ts
describe('transaksi_bmd append-only', () => {
  it('menolak UPDATE', async () => {
    await sebagai(operatorDinasA, async (c) => {
      await expect(
        c.query(`UPDATE transaksi_bmd SET nilai = 1 WHERE id = $1`, [trxContoh]),
      ).rejects.toThrow(/append-only|immutable/i)
    })
  })

  it('menolak DELETE bahkan untuk admin', async () => { /* … */ })
})

describe('fn_cek_tahun_buku', () => {
  it('menolak transaksi bertanggal di masa depan', async () => { /* … */ })

  it('menolak tahun yang belum terdaftar di tahun_buku (fail-closed)', async () => { /* … */ })

  it('mengizinkan batal_pengadaan mundur ke tahun terkunci (whitelist retroaktif)', async () => { /* … */ })
})

describe('RLS aset', () => {
  it('menyembunyikan aset SKPD lain dari operator', async () => { /* … */ })

  it('tetap memperlihatkan aset yang sudah pindah kepada SKPD pengirim (fn_aset_pernah_dikelola)', async () => { /* … */ })
})
```

### 5.3 Tes performa sebagai tes, bukan sebagai insiden

Tiga kali timeout produksi berulang dengan akar yang sama (`LIKE`/enum tak
bisa jadi index-cond di bawah RLS). Itu bisa dijadikan test:

```ts
it('daftar barang golongan tunggal memakai partial index, bukan seq scan', async () => {
  await sebagai(pengurusSkpdTerbesar, async (c) => {
    const { rows } = await c.query(
      `EXPLAIN (FORMAT JSON)
       SELECT id FROM aset
       WHERE skpd_id = ANY($1) AND kode LIKE '1.3.1.%' AND status = 'aktif'
       ORDER BY nilai_perolehan DESC LIMIT 1000`, [idSubtree])

    expect(JSON.stringify(rows)).toContain('idx_aset_tanah_skpd')
    expect(JSON.stringify(rows)).not.toContain('Seq Scan')
  })
})
```

Dijalankan sebagai **pengurus barang SKPD TERBESAR**, bukan admin —
rules.md §4.5.

---

## 6. Lapisan 3 — Golden test laporan (karakterisasi)

Mode kegagalan nomor satu adalah *angka salah yang terlihat sah*. Yang
menangkapnya: satu dataset tetap, output laporan dibandingkan dengan berkas
snapshot yang sudah diperiksa manusia.

```
tests/golden/
  fixtures/skenario-dasar.sql      # ±200 aset, mencakup tiap jenis ledger
  __snapshots__/rekonsiliasi.json
  __snapshots__/laporan-bmd-model3.json
  __snapshots__/penyusutan-2026-S1.json
```

```ts
it('Rekonsiliasi BMD 2026-S1 sesuai angka yang sudah diverifikasi', async () => {
  const hasil = await hitungRekonsiliasi(dbUji, { periode: '2026-S1', skpdId: null })

  expect(hasil).toMatchSnapshot()
})
```

Dataset fixture **wajib** memuat kasus yang pernah menggigit:

- barang di-`batal_pengadaan` → tidak boleh muncul sebagai perolehan sah
- hapus → batal → hapus lagi **di periode yang sama** (aksi terakhir menang)
- pengalihan SKPD di tengah periode (atribusi period-aware)
- pengalihan lalu **dibatalkan** (dua sisi kartu + laporan)
- kapitalisasi menyerap anak, lalu dibatalkan
- barang ekstrakomptabel (ikut disusutkan)
- golongan 1.5.4 (beku)
- barang melewati checkpoint tutup tahun

> **Aturan emas golden test:** snapshot berubah **hanya** kalau ada yang
> sengaja mengubah perhitungan, dan perubahannya wajib dijelaskan di pesan
> commit. `--update-snapshots` tanpa penjelasan = review ditolak. Snapshot
> yang di-update sembarangan hanya memindahkan bug jadi "perilaku baru".

---

## 7. Lapisan 4 — Komponen & E2E

### 7.1 Komponen (Testing Library)
Hanya untuk **presenter** yang tidak melakukan fetch (lihat
CODING-STANDARD §5.2). Uji dari sudut pandang pengguna:

```ts
it('menampilkan pesan error dan MENOLAK menampilkan angka saat kolektor gagal', () => {
  render(<DaftarBarangTable rows={[]} error="gagal membaca event visibilitas barang" />)

  expect(screen.getByRole('alert')).toHaveTextContent(/gagal membaca/)
  expect(screen.queryByRole('table')).not.toBeInTheDocument()
})
```

Perilaku *fail-closed* itu sendiri layak diuji — ia aturan bisnis
([rules.md](rules.md) §2.4), bukan sekadar penanganan error.

### 7.2 E2E (Playwright) — sedikit saja
Mahal dan rapuh. Batasi pada alur yang kalau rusak menghentikan pekerjaan
kantor:

1. Login → pilih tahun kerja → dashboard tampil
2. Pengadaan: input draft → approve **oleh admin** → barang muncul di Daftar Barang
3. Pengadaan: pembuat kartu **tidak melihat** tombol Setujui untuk kartunya sendiri
4. Penghapusan → barang hilang dari Daftar Barang → Batal → muncul lagi
5. Pengalihan: kirim → terima di SKPD tujuan → kolom SKPD berubah
6. Jalankan engine → Penyusutan menampilkan angka periode itu
7. Export Excel menghasilkan berkas dengan header kolom yang benar

Dijalankan **nightly**, bukan tiap push.

---

## 8. Regresi: setiap insiden jadi satu test

Aturan yang mengubah CLAUDE.md dari ingatan jadi **ingatan yang dieksekusi**:

> **Setiap bug yang diperbaiki wajib meninggalkan satu test yang gagal
> sebelum perbaikan dan lulus sesudahnya.** Tulis test-nya lebih dulu.

Beri nama yang merujuk insidennya supaya tak ada yang menghapusnya karena
mengira mubazir:

```ts
it('regresi 2026-07-28: fetchVoidedAsetIds MELEMPAR saat query gagal, tidak mengembalikan set kosong', async () => {
  // Set kosong terbaca sebagai "tak ada yang dibatalkan" → barang yang sudah
  // di-batal_pengadaan muncul lagi sebagai perolehan sah di 3 laporan.
  await expect(fetchVoidedAsetIds(dbYangSelaluGagal, ['a1'])).rejects.toThrow(/gagal membaca/)
})
```

Daftar insiden yang siap dipanen jadi test ada di
**[docs/insiden.md](docs/insiden.md)**, lengkap dengan kolom "test penjaga" —
di situlah janji di atas bisa **dicek**, bukan cuma dijanjikan. Kerjakan
bertahap, dahulukan yang menyentuh angka laporan.

---

## 9. CI

```yaml
# .github/workflows/ci.yml
name: CI
on: [push, pull_request]

jobs:
  cepat:                       # < 2 menit, tiap push
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm }
      - run: npm ci
      - run: npm run typecheck   # apa adanya — repo ini 0 error, tanpa baseline
      - run: npm test            # unit domain saja
      - run: npm run lint        # Fase 0.5 — tanpa `--max-warnings`, lihat
                                 # eslint.config.mjs soal error vs warn

  database:                    # butuh Postgres, tiap PR
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:17
        env: { POSTGRES_PASSWORD: postgres }
        options: >-
          --health-cmd pg_isready --health-interval 10s --health-timeout 5s --health-retries 5
        ports: ['5432:5432']
    steps:
      - uses: actions/checkout@v4
      - run: psql -f supabase/migrations/*.sql   # urut nama berkas
      - run: npm run test:db
```

**Baseline typecheck — TIDAK JADI DIBUAT, dan itu hasil yang lebih baik.**
Rencana awal: bekukan daftar error pre-existing ke `.typecheck-baseline.txt`
supaya CI hanya merah untuk error **baru**, dengan alasan "menunggu sampai nol
error berarti CI tak akan pernah aktif".

Ternyata nol errornya bisa dicapai langsung (2026-08-05). Dua sebab yang
disangka permanen ternyata dangkal: `qrcode`/`leaflet`/`react-leaflet` cuma
belum ter-`npm install`, dan enam isu tipe sisanya lima di antaranya sekadar
`as` → `as unknown as`. Jadi CI menjalankan `npm run typecheck` **apa adanya**,
tanpa berkas baseline, tanpa perbandingan, tanpa mekanisme yang harus dirawat.

> **Pelajarannya layak diingat untuk keputusan sejenis:** sebelum membangun
> mekanisme untuk *hidup berdampingan* dengan utang, ukur dulu utangnya. Yang
> tampak seperti "36.000 baris penuh error lawas" ternyata enam error di empat
> berkas. Baseline yang terlanjur dibuat akan jadi berkas yang harus dijaga
> selamanya — dan tempat sempurna untuk menyembunyikan error baru.

---

## 10. Yang **tidak** dikejar

Sejujurnya, supaya usaha tidak habis di tempat yang salah:

- **Coverage global 80%.** Ambang hanya untuk `domain/` dan `shared/`.
  Mengejar angka global di repo yang mulai dari nol menghasilkan test
  basa-basi untuk getter dan JSX.
- **Unit test untuk komponen yang melakukan fetch.** Perbaiki lapisannya
  dulu; mengujinya dalam keadaan sekarang berarti mem-*mock* Supabase, dan
  test seperti itu mengunci implementasi, bukan perilaku.
- **E2E untuk tiap halaman.** Tujuh alur sudah cukup.
- **Snapshot test untuk JSX.** Nyaris selalu jadi stempel karet:
  berubah → di-*update* tanpa dibaca.

---

## 11. Definition of Done untuk perubahan yang menyentuh angka

Berlaku untuk apa pun yang mengubah nilai, visibilitas, kepemilikan, atau
isi laporan:

- [ ] Logika barunya ada di `domain/` dan punya unit test.
- [ ] Ada test invarian/property kalau menyentuh pembulatan atau akumulasi.
- [ ] Golden test laporan dijalankan; snapshot yang berubah **dijelaskan** di
      pesan commit.
- [ ] Menambah guard/policy/trigger? Ada test integrasi yang jalan sebagai
      `authenticated`, bukan `service_role`.
- [ ] Bug yang diperbaiki meninggalkan satu test regresi bernama insidennya.
