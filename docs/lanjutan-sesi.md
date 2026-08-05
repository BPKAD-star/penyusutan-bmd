# Lanjutan Sesi — daftar tugas siap-pakai

> **Dokumen SEMENTARA.** Isinya antrean pekerjaan yang sudah disepakati, ditulis
> supaya sesi berikutnya (di mesin lain, atau agent yang mulai dingin) bisa
> menyambung tanpa kehilangan konteks.
>
> **Hapus atau ganti isinya begitu kelima tugas di bawah selesai.** Dokumen
> antrean yang dibiarkan hidup sesudah antreannya habis akan dibaca orang
> berikutnya sebagai rencana yang masih berlaku — persis jenis kebasian yang
> repo ini sudah berkali-kali kena.
>
> Disusun 2026-08-05. Peta seluruh dokumen: [../README.md](../README.md).

---

## Status saat dokumen ini ditulis

Branch kerja: **`claude/repo-docs-optimization-c1e410`** (sudah di-push).

| Fase 0 | Status |
|---|---|
| 0.1 Vitest + config | ✅ |
| 0.2 Test engine penyusutan | ✅ 79 test |
| 0.3 Test helper `lib/bmd.ts` | ✅ 74 test |
| 0.4 Property test invarian engine | ✅ termasuk di 0.2 |
| 0.4b Test sinkronisasi konstanta kembar | ✅ `lib/sinkronisasi.test.ts`, 9 test |
| 0.5 ESLint | ⬜ **tugas 5 di bawah** |
| 0.6 Typecheck | ✅ **0 error** — baseline sengaja TIDAK dibuat |
| 0.7 GitHub Actions | 🟡 typecheck + test jalan; `lint` menyusul setelah 0.5 |
| 0.8 `supabase gen types` | ⬜ belum dijadwalkan |

Angka acuan: **201 test hijau**, **0 error typecheck**.

---

## Setup

```bash
git fetch origin && git checkout claude/repo-docs-optimization-c1e410
npm install                          # WAJIB kalau tsc/vitest "not found" —
                                     # worktree/clone baru TIDAK berbagi node_modules
npx tsc --noEmit -p tsconfig.json    # harus 0 error
npm test                             # harus 201 test hijau
```

**Kalau dua verifikasi itu tidak sesuai, BERHENTI dan laporkan** — jangan lanjut
mengerjakan apa pun di atas fondasi yang sudah bergeser.

**Baca dulu, urut:** [../README.md](../README.md) (peta dokumen + hierarki
normatif/deskriptif/rencana) → [../rules.md](../rules.md) →
[../CODING-STANDARD.md](../CODING-STANDARD.md) →
[../REFACTOR-PLAN.md](../REFACTOR-PLAN.md) §3.

---

## Aturan kerja untuk kelima tugas

- **Satu tugas = satu commit.** Jangan diborong.
- Pesan commit rinci ber-bullet WHY (lihat `git log` untuk gayanya), diakhiri
  `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- `git add` sebut berkas **satu per satu** — repo ini selalu punya untracked
  yang bukan bagian pekerjaan (`.xlsx` besar, `.csv` import).
- Sesudah **tiap** commit: `npx tsc --noEmit -p tsconfig.json` (harus 0) dan
  `npm test` (harus hijau).
- Jangan merge ke `main` sebelum semuanya hijau.
- Dokumen baru masuk `docs/` dan **wajib didaftarkan di tabel "Dokumen kerja &
  rujukan dalam" di README.md** — README satu-satunya tempat yang mendaftar
  seluruh dokumen; jangan menyalin daftarnya ke berkas lain.
- ⚠️ Push yang menyentuh `.github/workflows/` butuh token ber-scope `workflow`.
  Kalau ditolak (*"refusing to allow a Personal Access Token to create or update
  workflow"*), tambahkan scope-nya di github.com/settings/tokens.
- ⚠️ **Jangan menyentuh `lib/engine/**`, `lib/visibilitas.ts`, atau
  `lib/rekon.ts`** untuk tugas-tugas ini — semuanya di luar lingkup dan
  menyentuh angka laporan.

---

## Tugas 1 — `docs/runbook-migrasi.md`

Daftar periksa **pra-terbang** untuk menjalankan migrasi SQL. Bukan daftar
aturan: ini dibaca **sambil mengerjakan**, urut, dicentang satu per satu.

**Kenapa perlu.** Migrasi di repo ini dijalankan manual, di atas data pemda
LIVE, dan pernah **mematikan seluruh aplikasi**: sebuah backfill membengkakkan
WAL ±700 MB → disk Supabase 54% → 96% → project READ-ONLY → 504 di middleware
(karena refresh sesi auth itu operasi tulis). Aturannya hari ini tersebar di
**lima** tempat: README §Setup, [../rules.md](../rules.md) §5,
[../architecture.md](../architecture.md) §6, [../schema.md](../schema.md) §7,
dan per-fitur di [../CLAUDE.md](../CLAUDE.md). Kumpulkan — jangan salin mentah,
rangkai jadi urutan langkah.

Wajib memuat:

- **Cek sisa disk SEBELUM** migrasi/backfill besar, bukan sesudah.
- `CREATE INDEX` selalu **PLAIN**, tidak pernah `CONCURRENTLY` — SQL Editor
  membungkus skrip jadi satu transaksi, jadi `CONCURRENTLY` **gagal senyap**.
- `ALTER TYPE … ADD VALUE` harus **statement lepas**, tak boleh dalam transaksi.
- UPDATE >100rb baris pakai **`psql`, bukan SQL Editor**. Dua sebabnya: gateway
  API timeout, dan SQL Editor menentukan mode baca/tulis dari **kata pertama
  skrip** — skrip berawalan `WITH` dibuka READ-ONLY dan semua tulis di dalamnya
  ditolak (`25006`).
- Tutup migrasi import/backfill dengan **`ANALYZE`** tabel yang diisi.
- **Migrasi dijalankan SEBELUM deploy kode** (deploy-ordering).
- Verifikasi `EXPLAIN` **wajib dengan RLS aktif** (`SET LOCAL role
  authenticated` + `request.jwt.claims`) — sebagai service_role, query yang
  rusak tetap terlihat 0,2 detik.
- Sesudah import besar, **uji ulang halaman berat sebagai pengurus barang SKPD
  TERBESAR**, bukan sebagai admin.

---

## Tugas 2 — `docs/panduan-operator.md`

**Satu-satunya dokumen untuk orang yang MEMBUAT datanya** (pengurus barang di
±700 SKPD). Sembilan dokumen lain semuanya untuk yang menulis kode.

Sumbernya `.md` di repo (biar ikut ter-review bersama kode), **tapi ditulis
dengan bahasa dan susunan yang siap dicetak/di-PDF-kan** untuk dibagikan.
Hindari istilah teknis — jangan sebut "ledger", "enum", "RLS", "append-only".
Pakai contoh konkret.

Prioritas isi, dari yang paling mendesak:

1. **BATAL vs AKHIRI vs KEMBALIKAN** — keputusan yang **tidak bisa dibatalkan**.
   *Batal* = koreksi salah catat, peristiwanya dianggap **tak pernah terjadi**.
   *Akhiri/Kembalikan* = peristiwanya **sah lalu berakhir**, barangnya tetap
   tampil sebagai riwayat. Salah pilih meninggalkan jejak permanen. Aturannya
   ada di [../rules.md](../rules.md) §1.6 — tapi rules.md dibaca programmer,
   bukan operator. Bagian ini terjemahannya untuk mereka.
2. **Alur draft → approve** — kenapa barang belum muncul sebelum disetujui.
3. **Kenapa pembuat kartu tidak boleh menyetujui kartunya sendiri.**
4. **Kenapa pindah semester = batalkan & entry ulang**, bukan edit tanggal.
5. **Membaca layar** — "0 barang" itu **sah**; banner **merah** berarti angkanya
   **jangan dipercaya sama sekali** (aplikasi ini fail-closed).
6. **NIBAR vs Kode Register** — mana yang ditulis di BAST, apa arti tanda ⚠.

---

## Tugas 3 — `docs/insiden.md`

Register insiden. Satu baris per insiden: **tanggal · gejala yang DILIHAT
operator · akar masalah · perbaikannya · test yang sekarang menjaganya** (atau
⬜ kalau belum ada).

Dua manfaatnya:

1. [../TESTING.md](../TESTING.md) §8 mewajibkan *"tiap bug meninggalkan satu
   test"*. Sekarang **tidak ada cara mengecek janji itu ditepati** — register
   ini membuatnya auditable.
2. Ini yang nanti memungkinkan CLAUDE.md (**1.228 baris**, satu-satunya berkas
   yang dimuat otomatis tiap sesi) dikurusi tanpa kehilangan apa pun.

Panen dari [../CLAUDE.md](../CLAUDE.md) + [../REFACTOR-PLAN.md](../REFACTOR-PLAN.md)
"Temuan Fase 0.3". Minimal memuat:

- filter void diam-diam mati → barang batal muncul lagi di 3 laporan (2026-07-28)
- Daftar Barang beku "Memuat…" selamanya (2026-07-29)
- `generateNibars` diam-diam mengulang nomor urut dari 1
- tiga ronde timeout RLS (`LIKE`, enum, partial index)
- `batal_pengalihan` kelewat **tiga ronde** (2026-07-29)
- pemecahan → nilai **dobel** di 2026-S1 (2026-08-05)
- `uraian_barang` kosong di KIBAR (2026-08-03)
- `tukar_menukar` tak pernah disusutkan (ditemukan Fase 0.3, ditambal 2026-08-05)
- backfill membuat disk Supabase penuh → project read-only → aplikasi mati total

> ⚠️ **Jangan mengarang tanggal atau detail.** Kalau sesuatu tidak tercatat di
> dokumen mana pun, tulis "tidak tercatat". Register insiden berisi karangan
> lebih buruk daripada tidak ada register — ia akan dikutip sebagai fakta.

---

## Tugas 4 — `docs/kamus.md`

Glosarium pasangan istilah/kolom yang **mirip tapi beda**. Satu tabel:
*istilah · bedanya · pernah bikin bug apa*. Murah dibuat, dan tiap barisnya
sudah pernah jadi bug nyata.

Wajib ada:

| Pasangan | Catatan |
|---|---|
| `uraian_barang` vs `nama_barang` | baku kodefikasi vs spesifikasi bebas — bikin KIBAR kosong 2026-08-03 |
| `cara_perolehan` vs `asal_usul` | dua kolom, **sengaja tidak disinkronkan** |
| NIBAR vs kode register | akta lahir (beku) vs KTP (ikut posisi) |
| `aset.luas` vs `aset_bidang_tanah.luas` | dua sumber, belum ada yang menang — **utang terbuka** |
| Pemanfaatan vs Pengamanan vs KIR | pihak ketiga / kustodi pegawai / penempatan ruangan |
| `saldo_awal` vs `saldo_awal_checkpoint` | baseline e-BMD 2025 vs hasil Tutup Tahun |
| intra vs ekstrakomptabel | keduanya disusutkan; pemisahan terjadi di laporan |
| SEMBUNYI vs LAHIR vs NETRAL | tiga pertanyaan berbeda soal visibilitas |

---

## Tugas 5 — Fase 0.5 ESLint (**kerjakan PALING AKHIR**)

Ikuti [../REFACTOR-PLAN.md](../REFACTOR-PLAN.md) §3 *"ESLint: sedikit tapi
menggigit"* — **hanya 6 aturan** yang ada di sana. Jangan menyalakan
`eslint-config-next` penuh: 36.000 baris tanpa lint akan menghasilkan ribuan
peringatan yang langsung diabaikan semua orang.

Sesudah hijau di lokal, tambahkan step `npm run lint` ke
`.github/workflows/ci.yml`. **Jangan ditambahkan sebelum terbukti hijau** — CI
merah permanen sama saja dengan tidak punya CI.

Catatan: ada **166 pelanggaran `const { data } = await`** yang sudah tercatat.
Aturan untuk itu memang di-set `'warn'`, bukan `'error'` — jangan dinaikkan
sekarang, dan jangan pula memperbaiki 166-nya sekaligus. Adopsi lewat
*boy-scout rule* ([../CODING-STANDARD.md](../CODING-STANDARD.md) §10).

**Kenapa dikerjakan terakhir:** ESLint menyentuh konfigurasi build dan
berpotensi memerahkan CI. Kalau ia dikerjakan duluan lalu macet, keempat
dokumen yang nol-risiko di atas ikut tertahan.
