# Rencana Implementasi — Menu LRA (Rekonsiliasi Belanja Modal)

Status: **DRAFT untuk review** (belum ada kode fitur). Disepakati dari sesi
diskusi 2026-07-22.

Menu baru: **Pelaporan → LRA** (halaman terpisah, **di atas** "Rekonsiliasi
BMD"). Beda sumbu dari Rekonsiliasi BMD: yang itu rekonsiliasi **mutasi nilai
BMD** (Saldo Awal + Penambahan − Pengurangan); yang ini rekonsiliasi **realisasi
belanja (LRA akuntansi)** vs **entri pengadaan aplikasi**. Saling melengkapi.

---

## 1. Tujuan & keputusan kunci (LOCKED)

Import data realisasi belanja (LRA) dari akuntansi, lalu cocokkan dengan belanja
modal yang benar-benar tercatat sebagai aset di aplikasi — **per SKPD, per jenis
aset tetap (`5.2.0x`), per bulan**. Worksheet mengikuti gambar target dengan
rantai cek:

> **LRA (5.2) + Kapitalisasi (5.1 → modal) − Reklasifikasi (5.2 keluar) = Belanja
> Modal (entry aplikasi)**

Keputusan yang sudah dikunci:

| # | Keputusan | Pilihan |
|---|---|---|
| 1 | Yang masuk **box LRA** | Hanya baris **`5.2`** (belanja modal), dikelompokkan per `5.2.0x`. |
| 2 | Sumber **Kapitalisasi** | Baris **`5.1`** (barjas) dari import → ditandai + pilih **jenis tujuan** (`5.2.0x`). WAJIB dari 5.1, kalau tidak Check dobel-hitung. |
| 3 | Sumber **Reklasifikasi** | Baris **`5.2`** di box LRA → ditandai "keluar". **Jenis otomatis** = kode-nya sendiri. |
| 4 | Nilai tanda | **Persis nominal baris LRA**, tidak boleh sebagian (tandai seluruh baris). |
| 5 | Tanda = rekonsiliasi saja | Menandai Kapitalisasi/Reklas di sini **TIDAK** membuat transaksi di ledger Pembukuan. Murni untuk hitungan Check. |
| 6 | **Belanja Modal (entry app)** | Otomatis dari ledger `pengadaan` per SKPD, dikelompokkan golongan → `5.2.0x`, per bulan (tgl perolehan/BAST). |
| 7 | SKPD di file | Kolom **`id_skpd`** (match langsung ke master; TANPA alias/pencocokan nama). Boleh sampai **sub-unit**; rekap **roll-up ke SKPD induk** (keputusan D-3). |
| 8 | Anti-dobel | Natural key **(`skpd_id`, `no_bukti`, `kode_rekening`)**; re-import = upsert. |
| 9 | Mapping `5.2.0x` → jenis | Hardcode 5 baris (BAS nasional, stabil): 01 Tanah · 02 Peralatan & Mesin · 03 Gedung & Bangunan · 04 Jalan/Irigasi/Jaringan · 05 Aset Tetap Lainnya. |
| 10 | Sifat data | Tabel referensi TERPISAH, **tidak menyentuh** `transaksi_bmd`/`aset`/ledger. Bukan subjek kunci Tahun Buku. |

---

## 2. Skema Excel import (LOCKED)

Satu file bisa berisi banyak SKPD & banyak bulan. Kolom:

| Kolom Excel | Parse |
|---|---|
| **Tanggal** | `dd/mm/yyyy` → `tanggal` (date), turunkan `bulan` (1–12) & `tahun`. |
| **Uraian** | Satu sel gabungan `KODE - NAMA`, mis. `5.2.02.05.001.00005 - Belanja Modal Alat Kantor Lainnya`. Parse: `kode_rekening` = token angka-titik di depan (`^[\d.]+`); `uraian` = sisanya setelah pemisah pertama ` - `. |
| **No. Bukti/Dok. Sumber** | `no_bukti` (teks apa adanya). Natural key anti-dobel. |
| **SKPD** | `id_skpd` (integer) — cocokkan ke `admin_skpd.id`. |
| **Keterangan** | `keterangan` (display/audit). |
| **Debit (Rp)** | `debit` numerik. Format Indonesia `28.140.002,00` → buang titik ribuan, koma→titik desimal. |

Turunan yang dihitung sistem saat parse:
- `kode_grup3` = 3 segmen pertama kode (`5.2.02`, `5.1.02`, …).
- `kelompok` = `'modal'` (diawali `5.2`) / `'barjas'` (diawali `5.1`) / `'lain'`.
- Baris **`5.2`** → tampil di box LRA. Baris **`5.1` (SEMUA, keputusan D-1)** →
  daftar "kandidat kapitalisasi" (tidak masuk jumlah LRA). Baris di luar
  `5.1`/`5.2` (mis. `5.3`/`5.4`) → **diabaikan**, ditampilkan sebagai "dilewati"
  di preview.

---

## 3. Model data

### 3.1 Tabel `lra_realisasi` (baru)

```
id            bigserial PK
skpd_id       int  FK admin_skpd(id)
tahun         int
bulan         int  (1–12)
tanggal       date
no_bukti      text
kode_rekening text            -- 5.2.02.05.001.00005
kode_grup3    text            -- 5.2.02  (generated / diisi saat import)
kelompok      text            -- 'modal' | 'barjas'
uraian        text
keterangan    text
debit         numeric(18,2)
-- kolom TANDA (rekonsiliasi, diisi lewat aksi, bukan dari file):
klasifikasi   text NULL       -- NULL | 'kapitalisasi' | 'reklas_keluar'
jenis_tujuan  text NULL       -- 5.2.0x (WAJIB utk kapitalisasi; utk reklas = kode_grup3 sendiri)
created_at/by, updated_at

UNIQUE (skpd_id, no_bukti, kode_rekening)   -- natural key
INDEX (skpd_id, tahun, bulan), (skpd_id, kelompok)
```

Catatan:
- **TANPA tabel alias SKPD** (keputusan #7 — file pakai `id_skpd`).
- Kolom tanda menempel di baris (bukan tabel terpisah) karena tanda = seluruh
  baris & satu jenis (keputusan #4).
- Kalau satu `(skpd, no_bukti, kode)` muncul >1 kali dalam file (dua rincian
  identik) → **dijumlahkan** jadi satu baris, dengan peringatan di preview.

### 3.2 Belanja Modal sisi aplikasi

Tidak perlu tabel baru — diturunkan dari `transaksi_bmd`/`aset` yang sudah ada:
`pengadaan` per SKPD, golongan (`kodeLevel3`) dipetakan ke `5.2.0x`, per bulan
(dari `tanggal`). Lewat RPC agregasi (lihat §5).

---

## 4. Alur import (2 langkah: parse → preview → commit)

Reuse pola `PerolehanImport.tsx` (baca Excel di client) + `SkpdCombobox
lockToOperator`.

1. **Parse (client).** Baca file, parse tiap baris (§2), validasi:
   - format kode & tanggal valid,
   - `id_skpd` ada di master **dan** dalam scope operator (RLS),
   - `debit` terparse.
   Baris gagal → dikumpulkan sebagai error, tidak ikut commit.

2. **Preview.** Tampilkan ringkasan sebelum menulis:
   - **Baru** vs **akan ditimpa** — dikelompokkan per **No Bukti**. Contoh:
     "Bukti A, B sudah ada (12 baris) → akan diperbarui; Bukti C–F baru (30 baris)."
   - **Tanda yang terdampak** — "3 baris yang akan ditimpa sudah punya tanda
     Kapitalisasi; tanda dipertahankan karena bukti+kode sama." (lihat §4.1)
   - Baris **error** & baris **dilewati** (kode non-5.1/5.2).

3. **Commit.** Per `(skpd_id, no_bukti)` di file:
   - **upsert** baris berdasar natural key (update `tanggal/uraian/keterangan/
     debit/…`);
   - **hapus** baris DB milik bukti itu yang `kode_rekening`-nya **tidak ada
     lagi** di file (baris yang benar-benar dihapus dari dokumen);
   - kolom **tanda dipertahankan** untuk baris yang natural key-nya tetap ada.

### 4.1 Interaksi tanda ↔ re-import (teratasi oleh natural key)

Karena upsert **update di tempat** (bukan hapus-lalu-buat), `klasifikasi` &
`jenis_tujuan` **tidak hilang** saat re-import selama `(skpd, no_bukti, kode)`
sama. Tanda hanya hilang kalau barisnya memang dihapus dari dokumen. Ini
menyelesaikan kekhawatiran "tanda ikut kehapus" tanpa mekanik tambahan.

---

## 5. Agregasi & RPC (server-side, tunduk RLS)

Prinsip sama dok rekon: agregasi di server, jangan tarik ratusan ribu baris ke
browser. Pola RLS InitPlan/set-membership (`20260720_01`) dijaga.

1. **`fn_lra_rekap(p_tahun, p_skpd_ids)`** → dari `lra_realisasi`:
   agregat `debit` per `(jenis 5.2.0x, bulan)` untuk **box LRA** (kelompok
   `modal`), plus subtotal **Kapitalisasi** (rows `klasifikasi='kapitalisasi'`
   dijumlahkan ke `jenis_tujuan`) dan **Reklas** (`klasifikasi='reklas_keluar'`
   dijumlahkan ke `kode_grup3` sendiri).

2. **`fn_belanja_modal_app(p_tahun, p_skpd_ids)`** → dari `pengadaan`:
   agregat `nilai` per `(jenis 5.2.0x, bulan)`. (period-aware sederhana:
   `tanggal` = bulan; golongan → 5.2.0x via mapping #9.)

**Roll-up SKPD (keputusan D-3):** baris bisa tersimpan di `skpd_id` **sub-unit**,
tapi rekap yang dilihat di level SKPD **induk** harus menjumlahkan seluruh
keturunannya. `p_skpd_ids` diisi himpunan **descendant** dari SKPD terpilih
(pola `descendantIds` / rollup root yang sudah dipakai laporan lain, mis.
`20260716_08_rekap_rollup_root_skpd.sql`, `LaporanPengamanan`). Sisi app
(`fn_belanja_modal_app`) pakai himpunan descendant yang sama supaya kedua sisi
Check sebanding.

3. **Check** (di UI atau RPC gabungan): per `(skpd, jenis)`
   `LRA + Kapitalisasi − Reklas` vs `Belanja Modal app` → badge ✓/selisih.

RLS `lra_realisasi`: SELECT/INSERT/UPDATE dibatasi kepemilikan SKPD operator
(subtree) — pola `fn_is_admin()`/scope SKPD yang sudah dipakai, **dibungkus
InitPlan**. Admin: semua SKPD.

---

## 6. Halaman & komponen

- `app/dashboard/pelaporan/lra/page.tsx` — filter (SKPD `lockToOperator`,
  Tahun), tombol **Import** (buka modal 2-langkah §4), render worksheet.
- Worksheet (mengikuti gambar): 4 blok baris **Jan–Dec + Total**:
  1. **LRA** (rows `5.2.01`–`05` + Total),
  2. **Kapitalisasi** (baris hasil tanda),
  3. **Reklasifikasi** (baris hasil tanda),
  4. **Belanja Modal (Entryan Aplikasi)** (rows `5.2.01`–`05`) + kolom **Check**.
- Aksi **"+ Tambah Kapitalisasi"** → picker baris `5.1` (kandidat) + pilih jenis
  tujuan `5.2.0x` → set `klasifikasi='kapitalisasi'`, `jenis_tujuan=…`.
- Aksi **"+ Tambah Reklas"** → picker baris `5.2` di box LRA → set
  `klasifikasi='reklas_keluar'`, `jenis_tujuan=kode_grup3`.
- **Export Excel** (`exportToExcel`, `lib/export.ts`) — layout worksheet + Check.

Reuse: `PerolehanImport` (baca Excel), `SkpdCombobox lockToOperator`,
`kodeLevel3`, `exportToExcel`. Mapping `5.2.0x → jenis` = konstanta baru.

---

## 7. Fase implementasi

- **Fase A** — tabel `lra_realisasi` + RLS, import 2-langkah (parse→preview→
  commit, natural key No Bukti), box **LRA** + rekap per jenis/SKPD/bulan +
  total. (menjawab kebutuhan inti: import, tampil, rekap, anti-dobel)
- **Fase B** — tanda **Kapitalisasi** (dari 5.1) & **Reklas** (dari 5.2) +
  **Belanja Modal (app)** + kolom **Check** + badge reconcile.
- **Fase C** — Export Excel + polish.

---

## 8. Keputusan lanjutan (RESOLVED 2026-07-22)

- **D-1 (scope 5.1):** ✅ **Semua `5.1`** jadi kandidat kapitalisasi (bukan cuma
  `5.1.02`). Lihat §2.
- **D-2 (id_skpd untuk pengisi Excel):** ✅ **Tidak perlu tooling** — user isi
  `id_skpd` manual saat menyiapkan Excel; id hanya dipakai **saat import** untuk
  menempatkan baris (tak disimpan sebagai referensi berjalan).
- **D-3 (level SKPD):** ✅ **Boleh sampai sub-unit**; rekap tetap **roll-up ke
  SKPD induk** (lihat §5, himpunan descendant).
- **D-4 (duplikat bukti+kode):** ✅ **Dijumlahkan** (§3.1).

Tidak ada lagi item terbuka → siap mulai **Fase A**.

## 9. Prinsip yang tidak dilanggar

- Tabel referensi TERPISAH; **tidak menyentuh** `transaksi_bmd`/`aset`/ledger.
  Append-only ledger aman. Bukan subjek trigger Tahun Buku.
- Tanda Kapitalisasi/Reklas = data rekonsiliasi, **tidak** menghasilkan transaksi
  BMD (keputusan #5).
- Agregasi via RPC tunduk RLS; pola InitPlan/set-membership dijaga; paginasi/
  agregasi di server (jangan tarik semua baris ke browser).
