# BMD Kabupaten Kediri

Sistem pengelolaan Barang Milik Daerah berbasis Next.js + Supabase.
Shadow-ledger + layer transparansi — **bukan pengganti e-bmd** (e-bmd tetap sistem legal/resmi).

Prinsip inti:
- **Ledger append-only**: setiap pengelolaan = 1 transaksi immutable di `transaksi_bmd`
  (UPDATE/DELETE diblokir trigger). Koreksi = transaksi baru.
- **Engine penyusutan event-driven**: dihitung ulang dari histori transaksi per aset per
  semester, bukan batch. Masa manfaat di DB dalam TAHUN; ×2 semester hanya di engine.
- **Data flow satu arah**: e-bmd → app (sekali, baseline `saldo_awal_2026`). Tidak sync balik.

## Setup

### 1. Supabase — jalankan migrasi berurutan di SQL Editor
```
supabase/migrations/profiles.sql                        (existing, kalau belum)
supabase/migrations/20260702_01_bmd_core.sql            (aset, ledger, penyusutan_semester, RLS)
supabase/migrations/20260702_02_overhaul_band_seed.sql  (band overhaul 242 baris)
supabase/migrations/20260702_03_saldo_awal_ke_ledger.sql (migrasi 6.518 aset existing → ledger)
```

### 2. Environment variables (`.env.local` / Vercel)
```
NEXT_PUBLIC_SUPABASE_URL=https://gvwparkboopglytnjbad.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
OPENROUTER_API_KEY=your-openrouter-api-key
```
`OPENROUTER_API_KEY` dipakai server-side saja (`app/api/ai-chat/route.ts`) untuk opsi "Asisten AI" di ChatWidget — jangan diberi prefix `NEXT_PUBLIC_`.

### 3. Install & jalankan
```bash
npm install
npm run dev
```

## Fitur

- **Pembukuan → Cara Perolehan**: import Excel template export e-bmd (pengadaan, hibah masuk,
  hasil inventarisasi, perolehan lainnya). Kode 7 segmen digabung & divalidasi ke `kodefikasi_bmd`.
- **Pembukuan → Pengelolaan**: penggunaan & penerimaan internal (display-only), pengeluaran
  internal (mutasi antar sub-SKPD satu induk), reklasifikasi kode, koreksi nilai/spesifikasi,
  kapitalisasi (band overhaul + cap masa manfaat), penghapusan (pemindahtanganan, pengalihan
  status, sebab lain — soft-delete, data tetap di DB).
- **Daftar Barang**: register semua golongan BMD (label golongan dari data, bukan hardcode).
  Menampilkan **NIBAR** (akta lahir, beku) + **Kode Register** (KTP — mengikuti posisi
  terakhir barang: SKPD, tahun masuk SKPD, kode barang, intra/ekstra), dengan penanda
  untuk barang yang posisinya sudah bergeser dari akta lahirnya.
- **Penyusutan**: hasil engine ledger (`penyusutan_semester`) + data lama G&B
  (`penyusutan_periode`, dipertahankan). Admin bisa jalankan engine dari UI.
- **Pelaporan**: rekap perolehan & pengelolaan per jenis/periode/SKPD, export Excel.
  Barang dihapus tidak muncul di laporan (tetap queryable di DB).
- **Admin**: manajemen user (nama, NIP, pangkat/golongan, username, SKPD, role).
  Operator SKPD hanya melihat aset subtree SKPD-nya (RLS berbasis ltree path).
- **IPA & GIS BMD**: link eksternal di sidebar.

## Engine penyusutan

Jalankan dari UI (menu Penyusutan → Jalankan Engine, admin only) atau:
```
POST /api/engine/run  { "periode": "2026-S1" }
```
Engine me-replay ledger tiap aset dari saldo awal, menerapkan kapitalisasi/koreksi/reklas/
penghapusan, lalu upsert ke `penyusutan_semester` (re-run aman).

Aturan kapitalisasi (Perbup 30/2024, band di `overhaul_band`):
```
persen  = nilai_rehab / nilai_perolehan        (bukan nilai buku)
masa'   = min(sisa_tahun + tambahan_band, masa_max_tahun)
beban   = (nilai_buku + rehab) / (masa' × 2)   (rupiah penuh)
sisa_semester = counter integer −1 per periode; pembulatan diserap semester terakhir (NB = 0 persis)
```

**Ditunda (jangan dibangun sebelum ada rules)**: reklas komptabel; alokasi akumulasi
penyusutan saat koreksi kuantitas (split/merge). Struktur DB sudah siap, logika dikosongkan.

## Deploy
Vercel — `penyusutan-bmd.vercel.app`. Set env vars yang sama di dashboard Vercel.
