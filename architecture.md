# Arsitektur — Penyusutan BMD

> Berkas ini menggambarkan arsitektur **sekarang**. Arah perubahannya —
> pemisahan lapisan `domain`/`data`/`ui`, pemindahan pembacaan berat ke server —
> ada di [REFACTOR-PLAN.md](REFACTOR-PLAN.md).
>
> **Peta seluruh dokumen: [README.md](README.md).**

## 1. Tumpukan Teknologi

| Lapisan | Teknologi |
|---|---|
| Frontend | Next.js 14 (App Router) + React 18 + TypeScript + Tailwind CSS |
| Data & Auth | Supabase (PostgreSQL 17 + PostgREST + Auth + Storage) |
| Akses data | `@supabase/supabase-js` langsung dari client (RLS sebagai penegak) |
| Peta | Leaflet + OpenStreetMap (`next/dynamic`, ssr:false) |
| Export | SheetJS (`xlsx`) di client |
| Deploy | Vercel (app) · Supabase SQL Editor (migrasi, dijalankan manual berurutan) |

Tidak ada backend API tersendiri kecuali route `/api/engine/run` (menjalankan
engine penyusutan server-side). Hampir semua logika berjalan di client dan di
database (RLS, trigger, RPC).

## 2. Gambaran Lapisan

```
┌──────────────────────────────────────────────────────────┐
│ Next.js App Router (client components)                   │
│  app/dashboard/** (halaman)  components/** (UI bersama)  │
│  lib/** (kolektor data, aturan bisnis, engine)           │
└──────────────┬───────────────────────────────────────────┘
               │ supabase-js (PostgREST, role authenticated)
┌──────────────▼───────────────────────────────────────────┐
│ PostgreSQL (Supabase)                                    │
│  RLS per-SKPD (ltree) · trigger penjaga · RPC SECURITY   │
│  DEFINER (fn_terima_pengalihan, fn_tutup_tahun, dst.)    │
│  RPC agregasi (fn_daftar_barang, fn_rekap_bmd, ...)      │
└──────────────────────────────────────────────────────────┘
```

**Penegakan aturan selalu di DB.** UI memvalidasi hanya demi pesan yang ramah;
trigger/RLS/RPC-lah gerbang sesungguhnya (append-only, kunci semester, kunci
tahun, guard approval, guard baseline).

## 3. Model Data Inti (ringkas — detail di [schema.md](schema.md))

Dua tabel jantung, sengaja **tidak dipecah** per jenis aset maupun per tahun:

- **`aset`** — keadaan terkini tiap barang (register). Wide table: kolom
  spesifikasi nullable untuk semua golongan (template per golongan di
  `lib/asetFields.ts`). Soft-delete via `status`.
- **`transaksi_bmd`** — ledger kejadian **append-only mutlak** (trigger menolak
  UPDATE/DELETE untuk siapa pun). Satu enum `jenis` untuk semua peristiwa;
  koreksi = baris pembalik (`batal_*`) yang menunjuk `payload.target_trx_id`.

Turunannya:

- **`penyusutan_semester`** — hasil engine (bukan sumber kebenaran; bisa
  dihitung ulang dari ledger).
- **`jurnal_header`** — "sampul" kartu ber-No SK/dokumen (boleh diedit; baris
  ledger di bawahnya tetap beku). Juga wadah draft approval
  (`payload.draft_items`) untuk menu Cara Perolehan.
- **`aset_awal_2026`** — snapshot baseline 2025, display-only, tidak pernah
  dibaca engine.

## 4. Pola-Pola Arsitektural

### 4.1 Replay ledger (event sourcing per aset)
Visibilitas barang per periode, kepemilikan SKPD per periode, dan seluruh
perhitungan penyusutan diturunkan dengan **mereplay `transaksi_bmd` per aset
secara kronologis** (urut periode, lalu id ledger):

- **Visibilitas**: event `SEMBUNYI` (serap, penghapusan, `batal_pengadaan`, …)
  vs `MUNCUL` (`batal_penghapusan`, …); aksi terakhir menang.
- **Kepemilikan period-aware** (`lib/pengalihan.ts`): `pengalihan_status` &
  `mutasi_internal` direplay → barang yang pindah semester depan tetap
  teratribusi ke SKPD asal saat melihat semester lampau.
- **Engine penyusutan** (`lib/engine/penyusutan.ts`): replay dari baseline
  (`saldo_awal` / `saldo_awal_checkpoint` terbaru) sampai periode target;
  event dibatalkan diabaikan lewat `target_trx_id`.

### 4.2 Draft → Approve (menu Cara Perolehan)
Barang belum resmi ditampung sebagai JSON `draft_items` di `jurnal_header`
(status `pending`), **bukan** baris ledger yang difilter. Materialisasi ke
`aset` + `transaksi_bmd` terjadi saat approve — sehingga tidak ada satu pun
halaman pembaca yang perlu tahu konsep "pending". Unapprove = `batal_pengadaan`
retroaktif + rekonstruksi draft.

### 4.3 RPC untuk lintas-wewenang & agregasi
Operasi yang menembus scope RLS (terima pengalihan antar SKPD, tutup tahun)
lewat **RPC SECURITY DEFINER** — jangan pernah melonggarkan policy sebagai
gantinya. Agregasi berat (rekap, dashboard, daftar ber-paginasi server) juga
lewat RPC (`fn_rekap_bmd`, `fn_daftar_barang`, …) agar tidak menarik ratusan
ribu baris ke browser.

### 4.4 Kolektor client fail-closed
Fungsi pengumpul data di `lib/` (rekon, voidedAset, pengalihan) wajib:
paginasi **keyset** (`.gt('id', last)` + `.order('id')`), **cek `error` dan
melempar**, dan discope ke daftar `aset_id` bila pemanggil tahu asetnya.
Pemanggilnya wajib `try/catch/finally` + banner error. Rasionalnya (dan sejarah
insidennya) ada di [rules.md](rules.md).

### 4.5 Performa di bawah RLS
Pelajaran termahal repo ini: **operator non-leakproof (`LIKE`, bahkan `=` pada
enum) tidak pernah boleh jadi index-cond di bawah RLS.** Konsekuensinya:

- Semua fungsi di policy dibungkus InitPlan: `(SELECT fn_is_admin())`.
- Filter langka di tabel besar → **partial index** yang predikatnya persis
  sama dengan qual di kode (`idx_aset_tanah_skpd`, `idx_trx_pindah_id`).
- Verifikasi EXPLAIN **wajib dengan RLS aktif** (`SET LOCAL role
  authenticated`) — tanpa RLS, query yang rusak tetap terlihat sehat.
- Setiap import massal diakhiri `ANALYZE` tabel yang diisi.

### 4.6 Tahun Buku
Satu ledger kontinu; kunci per tahun lewat tabel kontrol `tahun_buku` yang
dibaca trigger. Tutup Tahun = checkpoint massal `saldo_awal_checkpoint` (salin
hasil engine S2) + kunci tahun + buka tahun berikutnya — engine tahun
berikutnya replay dari checkpoint, bukan dari 2025 lagi.

### 4.7 Identitas yang DITERBITKAN, bukan dihitung (kode register)

Sebagian besar turunan di aplikasi ini dihitung ulang saat dibaca (penyusutan,
visibilitas, kepemilikan per periode). **Kode register justru sebaliknya**, dan
pengecualian ini disengaja.

Kode register mengikuti posisi terakhir barang, jadi ia *berubah*. Tapi nomor
urut 7 digit di ekornya **tidak boleh** diturunkan dari urutan baris: begitu satu
barang hilang dari tengah, nomor semua barang di bawahnya bergeser — padahal
nomor itu tercetak di label barang, KIR, dan BAST. Kertas dan layar jadi tak
cocok, tanpa ada yang sadar.

Karena itu mekanismenya:

| Lapisan | Peran |
|---|---|
| `kode_register_seq` | Alokator `UPDATE … RETURNING` per prefiks — O(1), aman balapan, monoton |
| Trigger `fn_aset_kode_register_sync` di `aset` | **Satu-satunya** penerbit. Di DB, bukan di kode |
| `aset.kode_register` | Nilai yang berlaku sekarang (cache) |
| `aset_kode_register` | Riwayat append-only, satu baris per perpindahan |

**Kenapa trigger, bukan dipanggil dari kode:** ada 6+ pintu yang menggeser posisi
barang (`fn_terima_pengalihan`, `fn_kembalikan_pengalihan_barang`,
`fn_terima_mutasi_internal` + pengembaliannya, `patchAsetDari` untuk reklas,
`batal_reklas`, approve Cara Perolehan). Kalau penegakannya di sisi klien, satu
pintu kelupaan = kode basi **diam-diam** — persis nasib cache `aset.pemanfaatan`
yang sampai sekarang tak pernah auto-null saat masa berakhir lewat.

Bandingkan dengan aturan sebaliknya di §4.1: Σ luas bidang tanah **tak boleh**
disimpan balik ke kolom, karena ia wajib ikut data hidup. Kode register wajib
**berhenti** ikut. Membedakan dua kasus ini adalah pertanyaan pertama sebelum
memutuskan simpan-atau-hitung.

## 5. Penyimpanan Berkas

Supabase Storage, semua bucket **privat**, tampil via signed URL (~1 jam):

| Bucket | Isi | Batas |
|---|---|---|
| `aset-foto` | Foto barang (`aset.foto_paths[]`) | 10MB, image saja |
| `dokumen-sumber` | Dokumen pengalihan, BAST/Pakta pengamanan, dll. | 10MB, image+PDF |

## 6. Lingkungan Pengembangan

- Kode di WSL Ubuntu (`~/penyusutan-bmd`), diakses dari Windows.
- Type-check: `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json`
  (ada error pre-existing dari dependency opsional yang belum terpasang —
  saring ke berkas yang disentuh). `next build` lokal tidak jalan.
- Migrasi SQL: file di `supabase/migrations/`, dijalankan user secara manual di
  Supabase SQL Editor **berurutan sesuai nama file**. SQL Editor membungkus
  skrip dalam satu transaksi → `CREATE INDEX CONCURRENTLY` gagal senyap,
  selalu pakai PLAIN.
- Urutan deploy penting: migrasi enum/policy/guard **sebelum** deploy kode
  (rincian per fitur di CLAUDE.md).
