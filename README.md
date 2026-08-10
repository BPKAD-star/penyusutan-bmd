# BMD Kabupaten Kediri

Sistem pengelolaan Barang Milik Daerah berbasis Next.js 14 + Supabase.
Shadow-ledger + layer transparansi — **bukan pengganti e-BMD** (e-BMD tetap
sistem legal/resmi).

⚠️ **Ini data LIVE pemerintah daerah yang dilaporkan ke inspektorat/BPK.**
Integritas data di atas segalanya. Sebelum menyentuh kode, baca
[rules.md](rules.md) — setiap aturan di sana lahir dari kerusakan nyata.

---

## Peta dokumen

Berkas ini adalah **satu-satunya tempat yang mendaftar seluruh dokumen**.
Kalau menambah dokumen baru, daftarkan di sini saja — jangan menyalin daftarnya
ke header berkas lain (itu mengulang persis pola "konstanta kembar" yang
dilarang [rules.md](rules.md) §25).

**Urutan baca untuk orang/agent baru:** README → rules → CODING-STANDARD →
sisanya sesuai kebutuhan.

### Dokumen yang selalu berlaku (root)

| Dokumen | Menjawab | Dibaca kapan |
|---|---|---|
| [rules.md](rules.md) | apa yang **tidak boleh rusak** | selalu, paling dulu |
| [CODING-STANDARD.md](CODING-STANDARD.md) | **bagaimana** menulisnya — lapisan, folder, primitif wajib (`paginate`/`assertOk`/`useAsyncData`), checklist commit | tiap kali menulis kode |
| [TESTING.md](TESTING.md) | apa yang diuji & di lapisan mana | tiap perubahan yang menyentuh angka |
| [REFACTOR-PLAN.md](REFACTOR-PLAN.md) | ke mana arah kode ini bergerak | saat memilih cara mengerjakan fitur |
| [CLAUDE.md](CLAUDE.md) | **sejarah & rincian per fitur** — kenapa sesuatu dibuat begitu, insiden apa yang melatarinya | saat bertanya "kenapa begini?" |
| [architecture.md](architecture.md) | bentuk sistem **sekarang** (lapisan, pola, RLS) | saat orientasi |
| [schema.md](schema.md) | peta tabel + mekanisme integritas | sebelum menyentuh DB |
| [design.md](design.md) | konvensi UI/UX & pola interaksi baku | saat menggarap tampilan |
| [PRD.md](PRD.md) | ruang lingkup produk & kebutuhan | saat menimbang fitur baru |

### Dokumen kerja & rujukan dalam ([docs/](docs/))

| Dokumen | Isi |
|---|---|
| [docs/runbook-migrasi.md](docs/runbook-migrasi.md) | **daftar centang pra-terbang** menjalankan migrasi SQL — dibaca sambil mengerjakan, urut |
| [docs/panduan-operator.md](docs/panduan-operator.md) | 👤 **satu-satunya dokumen untuk pengurus barang**, bukan untuk yang menulis kode — siap dicetak |
| [docs/insiden.md](docs/insiden.md) | **register insiden** — gejala · akar · perbaikan · test yang menjaganya. Alat cek janji TESTING.md §8 |
| [docs/kamus.md](docs/kamus.md) | **pasangan yang mirip tapi beda** — kolom/istilah/konsep yang gampang tertukar, berikut bug yang pernah lahir darinya |
| [docs/skema-database.md](docs/skema-database.md) | diagram ER (Mermaid) **per modul** — versi dalam dari `schema.md` |
| [docs/lra-plan.md](docs/lra-plan.md) | rencana modul LRA |
| [docs/rekonsiliasi-bmd-plan.md](docs/rekonsiliasi-bmd-plan.md) | rencana modul Rekonsiliasi |
| [docs/PLAN-period-lock.md](docs/PLAN-period-lock.md) | rencana kunci periode |

**Sumbu pemisahnya:** root = dokumen yang selalu berlaku dan dibaca berulang;
`docs/` = dokumen kerja/rujukan dalam yang dibaca sekali atau sesekali.
`CLAUDE.md` dan `README.md` **wajib tetap di root** (masing-masing dimuat
otomatis oleh Claude Code dan dirender GitHub).

### Hierarki: siapa menang kalau dua dokumen bertabrakan

Dokumen di repo ini ada **tiga jenis**, dan membedakannya penting — pernah ada
kasus [design.md](design.md) melestarikan pola yang justru dilarang
[CODING-STANDARD.md](CODING-STANDARD.md), dan tidak ada mekanisme apa pun yang
menyadarinya.

```
TINGKAT 0 ─ Keputusan user (bertanggal, dicatat di CLAUDE.md)  ← menang atas SEMUANYA
              │
TINGKAT 1 ─ rules.md                    ← integritas data. BLOCKING.
              │
TINGKAT 2 ─ PRD.md                      ← ruang lingkup produk
              │
TINGKAT 3 ─ CODING-STANDARD.md          ← cara menulis     (paling tinggi di tingkat ini)
            TESTING.md                  ← cara membuktikan
            design.md                   ← cara menampilkan
              │
TINGKAT 4 ─ REFACTOR-PLAN.md            ← arah. Boleh ditunda, tak pernah membatalkan fitur.

── DESKRIPTIF (menggambarkan keadaan, TIDAK memerintah) ──
   architecture.md · schema.md          ← "bentuknya sekarang"
   CLAUDE.md · docs/                    ← "kenapa jadi begini"
```

| Yang bertabrakan | Siapa menang |
|---|---|
| Normatif vs normatif | Yang **tingkatnya lebih atas** |
| Dokumen **normatif** vs kode | **Kodenya salah** → perbaiki kode |
| Dokumen **deskriptif** vs kode | **Dokumennya basi** → perbaiki dokumen |
| Rencana (REFACTOR-PLAN) vs fitur mendesak | **Fitur menang**; refactornya menumpang |

**Satu fakta, satu rumah.** Jangan menyalin isi antar-dokumen — cukup tautkan:

| Fakta | Rumahnya |
|---|---|
| Daftar jenis ledger & perilakunya (`LAHIR`/`SEMBUNYI`/`MUNCUL`) | **kode**: `lib/visibilitas.ts` |
| Aturan integritas yang tidak boleh dilanggar | `rules.md` |
| Sejarah, insiden, & keputusan per fitur | `CLAUDE.md` |
| Cara menulis kode | `CODING-STANDARD.md` |

---

## Prinsip inti

Ringkas saja di sini — rinciannya beserta sejarah insidennya di
[rules.md](rules.md) dan [CLAUDE.md](CLAUDE.md).

- **Ledger append-only mutlak.** Setiap pengelolaan = 1 baris immutable di
  `transaksi_bmd` (UPDATE/DELETE ditolak trigger, termasuk untuk `service_role`).
  Koreksi = **transaksi baru yang membalik** (`batal_*`), tidak pernah hapus
  baris lama.
- **Soft-delete.** Penghapusan barang = `aset.status='dihapus'` + transaksi.
- **Engine penyusutan event-driven.** Dihitung ulang dengan **mereplay ledger
  per aset** dari baseline sampai periode target — bukan batch, dan re-run
  selalu aman. `penyusutan_semester` = turunan, bukan sumber kebenaran.
- **Masa manfaat disimpan dalam TAHUN** di DB; konversi ×2 (ke semester) hanya
  di dalam engine.
- **Periode semesteran**: `YYYY-S1` (Jan–Jun) / `YYYY-S2` (Jul–Des).
- **Penegakan aturan di DB, bukan di UI.** RLS per-SKPD (ltree) + trigger +
  RPC `SECURITY DEFINER`. UI memvalidasi hanya demi pesan yang ramah.
- **Fail-closed.** Kolektor data wajib cek `error` lalu melempar; halaman
  laporan menolak menampilkan angka saat ada kegagalan. Halaman error jauh
  lebih murah daripada angka kurang-sebagian yang terlihat sah lalu ikut
  dilaporkan ke BPK.
- **Aliran data satu arah**: e-BMD → app (sekali, sebagai baseline). Tidak ada
  sinkronisasi balik.

---

## Setup

### 1. Supabase — jalankan migrasi di SQL Editor

Migrasi ada di [`supabase/migrations/`](supabase/migrations/) (**144 berkas**),
dijalankan **manual dan berurutan sesuai nama berkas**. `profiles.sql`
dijalankan lebih dulu bila belum ada.

⚠️ Dua hal yang wajib diingat:

- **Migrasi selalu PLAIN, bukan `CONCURRENTLY`** — SQL Editor membungkus skrip
  jadi satu transaksi, sehingga `CREATE INDEX CONCURRENTLY` **gagal senyap**.
- **Deploy-ordering**: migrasi (enum `ADD VALUE`, policy, guard, tabel baru)
  dijalankan **SEBELUM** deploy kode. Urutan per fitur ada di
  [CLAUDE.md](CLAUDE.md).

### 2. Environment variables (`.env.local` / Vercel)

```
NEXT_PUBLIC_SUPABASE_URL=https://gvwparkboopglytnjbad.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
OPENROUTER_API_KEY=your-openrouter-api-key
```

`OPENROUTER_API_KEY` dipakai **server-side saja**
(`app/api/ai-chat/route.ts`, opsi "Asisten AI" di ChatWidget) — jangan diberi
prefix `NEXT_PUBLIC_`.

### 3. Install & jalankan

```bash
npm install
npm run dev
npm test        # unit test (Vitest) — 264 hijau, termasuk golden test laporan
npm run lint    # ESLint, 6 aturan (eslint.config.mjs)
```

Tipe database digenerate ke
[`shared/types/database.types.ts`](shared/types/database.types.ts) —
**jangan disunting tangan**, regenerasi dengan:

```bash
SUPABASE_ACCESS_TOKEN=<token> npm run gen:types
```

Cara memakainya (`Tables<'aset'>`, `Enums<'jenis_transaksi_bmd'>`, dan kenapa
client-nya sendiri belum bertipe) ada di
[CODING-STANDARD.md](CODING-STANDARD.md) §4.4.

Type-check: `npx tsc --noEmit -p tsconfig.json` — **bersih, 0 error**
(2026-08-05). Exit code-nya bisa dibaca apa adanya; tidak perlu disaring lagi.
`npm run build` belum diuji.

Lint **0 error / 569 warning** (2026-08-06). Warning-nya utang lama yang sudah
terukur dan sengaja tidak memerahkan CI — alasan per aturan ada di
[`eslint.config.mjs`](eslint.config.mjs); adopsinya lewat *boy-scout rule*
([CODING-STANDARD.md](CODING-STANDARD.md) §10).

---

## Fitur

Ruang lingkup lengkap di [PRD.md](PRD.md); rincian & alasan desain per fitur di
[CLAUDE.md](CLAUDE.md).

- **RKBMD** — perencanaan kebutuhan T+1: **Standar Harga** (SSH · SBSK · ASB ·
  SBU · HSPK), **Usulan** per SKPD, **Validasi** (antrean telaah admin), dan
  **Pelaporan**. SSH/HSPK/ASB/SBU adalah **bak bersama lintas SKPD** — satu
  barang cukup diinput sekali se-kabupaten; bila SKPD lain memakai kode rekening
  berbeda, rekeningnya digabung ke barang yang sama, bukan jadi baris baru.
  RKBMD Pengadaan hanya boleh memakai barang yang sudah ada di SSH.
- **Pembukuan → Cara Perolehan** — pengadaan, hibah masuk, tukar menukar, hasil
  inventarisasi, perolehan lainnya. Pola **draft → approve**: barang ditampung
  sebagai `draft_items` di `jurnal_header`, baru masuk ledger saat disetujui.
  Termasuk import Excel template e-BMD dan pengadaan konstruksi (multi-KDP).
- **Pembukuan → Pengelolaan** — penggunaan & penerimaan internal, mutasi antar
  sub-SKPD, pengalihan status antar-SKPD, reklasifikasi, koreksi
  (nilai/spesifikasi/pencatatan ganda/pemecahan), kapitalisasi, penghapusan,
  pemanfaatan, pengamanan.
- **KIR** — Kartu Inventaris Ruangan (penempatan fisik barang per ruangan).
- **Daftar Barang** — register semua golongan. Menampilkan **NIBAR** (akta
  lahir, beku selamanya) + **Kode Register** (KTP — mengikuti posisi terakhir
  barang: SKPD, tahun masuk SKPD, kode barang, intra/ekstra), dengan penanda ⚠
  untuk barang yang posisinya sudah bergeser dari akta lahirnya.
- **Penyusutan** — hasil engine (`penyusutan_semester`). Admin bisa menjalankan
  engine dari UI.
- **Pelaporan** — rekonsiliasi, laporan BMD, rekap perolehan & pengelolaan per
  jenis/periode/SKPD, KIBAR, export Excel + export audit (BPK).
- **Saldo Awal** — snapshot baseline `aset_awal_2026` (foto saldo akhir 2025),
  display-only dan **tidak pernah dibaca engine**; hanya kolom spesifikasi yang
  boleh dikoreksi, itu pun terbatas pada barang yang belum pernah bergerak.
- **Admin** — manajemen user & pegawai, tutup tahun buku. Operator SKPD hanya
  melihat aset subtree SKPD-nya (RLS berbasis ltree path).

---

## Engine penyusutan

Jalankan dari UI (Penyusutan → **Jalankan Engine**, admin only) atau:

```
POST /api/engine/run  { "periode": "2026-S1" }
```

Engine mereplay ledger tiap aset dari checkpoint terbaru
(`saldo_awal` / `saldo_awal_checkpoint`), menerapkan
kapitalisasi/koreksi/reklas/penghapusan berikut pembatalannya, lalu upsert ke
`penyusutan_semester`. **Re-run aman.**

Baris hasil untuk periode di **tahun terkunci** difilter sebelum upsert — engine
tetap menghitungnya di memori tapi tidak pernah menimpa angka tahun yang sudah
final.

Aturan kapitalisasi (Perbup 30/2024, band di `admin_overhaul_band`):

```
persen  = nilai_rehab / nilai_perolehan        (bukan nilai buku)
masa'   = min(sisa_tahun + tambahan_band, masa_max_tahun)
beban   = (nilai_buku + rehab) / (masa' × 2)   (rupiah penuh)
sisa_semester = counter integer −1 per periode
                pembulatan diserap semester terakhir (nilai buku = 0 persis)
```

**Ekstrakomptabel ikut disusutkan** dengan aturan yang sama persis seperti
intrakomptabel; pemisahan "neraca hanya intra" terjadi di **laporan**, bukan di
engine. Golongan 1.5.4 (Aset Lain-Lain) beku — tidak pernah diakrualkan.

---

## Deploy

Vercel — `penyusutan-bmd.vercel.app`. Set env vars yang sama di dashboard
Vercel. Ingat **deploy-ordering**: jalankan migrasi di Supabase **sebelum**
men-deploy kode yang bergantung padanya.
