# Pelaporan → Format Permendagri 47/2021 — peta & rencana

**Status: Fase 1 (sisi kiri) SELESAI, sisi kanan MENUNGGU RUJUKAN FORMAT.**
Disusun 2026-08-29 atas permintaan user: *"nyusun struktur aturan pelaporan itu
untuk bisa menyesuaikan format permendagri 47 2021 … jangan tiba-tiba langsung
diubah semua, tapi mulai dari aturan arsitektur."*

Berkas ini **bukan** panduan gaya menulis kode (itu CODING-STANDARD.md) dan bukan
daftar larangan (itu rules.md). Ia satu-satunya tempat yang menjawab:
**menu pelaporan mana yang sudah punya lembar resmi, mana yang belum, dan lembar
resminya yang mana.** Tanpa peta ini, tiap laporan akan ditebak formatnya
satu per satu — dan lembar yang salah format itu ditandatangani lalu dikirim ke
inspektorat/BPK.

---

## 1. Temuan awal yang mengubah rencana

Dugaan awal (sebelum kodenya disisir): *"baru sedikit yang sesuai Permendagri."*
**Kenyataannya sudah tujuh keluarga format terbangun** — sebagian di luar menu
Pelaporan sehingga tak terlihat dari sidebar:

| Format | Lembar | Berkas |
|---|---|---|
| III.A.1–III.A.7 | Lembar Kerja Inventarisasi (LKI) | `lib/inventarisasi.ts`, `components/inventarisasi/LkiForm.tsx`, `app/cetak/inventarisasi-lki` |
| III.B.1–III.B.11 | Laporan Hasil Inventarisasi (LHI) | `lib/inventarisasiLaporan.ts`, `components/inventarisasi/LhiTabel.tsx`, `app/cetak/inventarisasi-lhi` |
| III.K.2 | Kartu Inventaris Ruangan (KIR) | `lib/kir.ts`, `app/cetak/kir` |
| IV.A | Laporan Pengadaan BMD (aset tetap) | `lib/laporanPengadaan.ts`, `components/pelaporan/LaporanPengadaanTabel.tsx`, `app/cetak/laporan-pengadaan` |
| IV.L.4.1 / IV.L.4.3 | Rekapitulasi Mutasi Tambah-Kurang (per SKPD / se-pemda) | `lib/laporanBmdFormat.ts`, `components/pelaporan/LembarMutasiBmd.tsx` + `CetakMutasiBmdModal.tsx` |
| IV.L.4.2 / IV.L.4.4 | Laporan BMD (per SKPD / se-pemda) | `components/pelaporan/TabelLaporanBmd.tsx`, `app/cetak/laporan-bmd`, `app/cetak/laporan-bmd-pemda` |
| V.2 | Berita Acara Rekonsiliasi | `lib/beritaAcaraRekon.ts`, `components/pelaporan/BeritaAcaraRekon.tsx` + `BeritaAcaraRekonModal.tsx` |

⚠️ **Konsekuensi rencana:** pekerjaannya BUKAN "bangun kerangka Permendagri dari
nol", melainkan **"satukan tujuh yang sudah ada, lalu rambatkan ke yang belum"**.
Kerangka yang dibangun tanpa melihat tujuh ini akan jadi kerangka kedelapan.

---

## 2. Empat pola cetak yang hidup berdampingan

Ini utang yang perlu dinamai sebelum nyicil. Keempatnya SAH pada tempatnya —
yang berbahaya kalau pola kelima lahir tanpa alasan.

| # | Pola | Mekanik | Pemakai |
|---|---|---|---|
| **A** | Kerangka cetak bersama | `CetakLaporan.tsx` — `GayaCetakLaporan` (print CSS, isolasi `visibility:hidden` atas `body *`) + `KopCetak` + `TombolCetak` + `useKonfirmasiCetak` | `LaporanTransaksi` (7 laporan Pengelolaan), `LaporanPemanfaatan`, `LaporanPengamanan` → **9 laporan** |
| **B** | Lembar + pop-up, dirender di halaman itu juga | `window.print()` atas lembar tersembunyi | `BeritaAcaraRekon`+Modal (V.2), `LembarMutasiBmd`+`CetakMutasiBmdModal` (IV.L.4.1/4.3) |
| **C** | Rute `/cetak/...` terpisah, query ulang | URL bawa `?skpd=&periode=`, subtree dihitung ulang di halaman cetak | `/cetak/perolehan`, `/cetak/laporan-pengadaan`, `/cetak/laporan-bmd`, `/cetak/laporan-bmd-pemda`, `/cetak/kir` |
| **D** | Tabel layar Permendagri yang dipakai ulang oleh rute cetak | satu komponen tabel, dua pemakai | `LaporanPengadaanTabel` (tab + `/cetak/laporan-pengadaan`) |

**Batas B vs C — ini aturannya, bukan selera:**
lembar yang butuh `descendantIds` (subtree Dinas Pendidikan = **694 id**) atau
angka yang mahal dihitung (Rekonsiliasi ≈ **30 dtk**) **WAJIB pola B**. URL tak
muat 694 id, dan menghitung ulang di rute cetak membuka celah **PDF berbeda dari
yang dilihat operator** — pada lembar bertanda tangan itu kerusakan senyap.
Yang cuma butuh `skpd` tunggal + periode boleh pola C.

**Pola D adalah bentuk yang benar** dan sudah terbukti: satu tabel, tak bisa
menyimpang antara layar dan kertas.

---

## 3. Inventaris 21 laporan

Kolom **Format** = padanan resmi Permendagri 47/2021.
✅ sudah dibangun · ❔ perlu dikonfirmasi Bidang Aset · ⬜ belum ada padanan yang
ditetapkan · ➖ alat internal, memang tak punya padanan.

### 3.1 Laporan Perolehan (5) — komponen bersama `components/LaporanPerolehan.tsx`

| Menu | Excel | PDF | Pola | Format |
|---|---|---|---|---|
| Laporan Pengadaan | ✔ daftar · rekap · lembar | `/cetak/perolehan` + `/cetak/laporan-pengadaan` | C + D | ✅ **IV.A** |
| Laporan Hibah | ✔ daftar · rekap | `/cetak/perolehan` | C | ❔ |
| Laporan Tukar Menukar | ✔ daftar · rekap | `/cetak/perolehan` | C | ❔ |
| Laporan Hasil Inventarisasi | ✔ daftar · rekap | `/cetak/perolehan` | C | ❔ |
| Laporan Perolehan Lainnya | ✔ daftar · rekap | `/cetak/perolehan` | C | ❔ |

⚠️ Keempat yang ❔ **sudah punya lembar cetak** — "Laporan Penerimaan BMD Berupa
Aset Tetap Dengan Cara Perolehan Dari …" (`app/cetak/perolehan`), lengkap dengan
blok tanda tangan & pemilih penanda tangan. Yang **tidak diketahui** cuma nomor
formatnya di Permendagri. Jadi pekerjaannya kemungkinan besar **memberi label**,
bukan membangun ulang. Jangan diasumsikan — konfirmasi dulu.

### 3.2 Laporan Pengelolaan (9)

| Menu | Komponen | Excel | PDF | Pola | Format |
|---|---|---|---|---|---|
| Laporan Penggunaan | `LaporanTransaksi` | ✔ | kop generik | A | ⬜ |
| Laporan Penerimaan Internal | `LaporanTransaksi` | ✔ | kop generik | A | ⬜ |
| Laporan Pengeluaran Internal | `LaporanTransaksi` | ✔ | kop generik | A | ⬜ |
| Laporan Reklasifikasi | `LaporanTransaksi` | ✔ | kop generik | A | ⬜ |
| Laporan Koreksi | `LaporanTransaksi` | ✔ | kop generik | A | ⬜ |
| Laporan Kapitalisasi | `LaporanTransaksi` | ✔ | kop generik | A | ⬜ |
| Laporan Penghapusan | `LaporanTransaksi` | ✔ | kop generik | A | ⬜ |
| Laporan Pemanfaatan | `LaporanPemanfaatan` | ✔ | kop generik | A | ⬜ |
| Laporan Pengamanan | `LaporanPengamanan` | ✔ | kop generik | A | ⬜ |

⚠️ **Ini pusat gravitasi pekerjaannya: 9 dari 21 laporan, dan SEMUANYA belum
punya lembar resmi.** Yang keluar sekarang tabel aplikasi ber-kop
"Pemerintah Kabupaten Kediri" — sah sebagai berkas kerja, tapi bukan lampiran
resmi. Tujuh di antaranya lahir dari SATU komponen (`LaporanTransaksi`), jadi
kalau padanan formatnya ternyata sekeluarga, tujuh laporan bisa beres sekaligus.
**Itu pertanyaan pertama yang perlu dijawab Bidang Aset.**

### 3.3 Laporan lainnya (7)

| Menu | Excel | PDF | Pola | Format |
|---|---|---|---|---|
| Laporan BMD | ✔ | `/cetak/laporan-bmd`, `/cetak/laporan-bmd-pemda`, `LembarMutasiBmd` | B + C | ✅ **IV.L.4.1 · 4.2 · 4.3 · 4.4** |
| Rekonsiliasi BMD | ✔ | `window.print()` tabel + Berita Acara | B | ✅ **V.2** |
| KIR | ✔ | `/cetak/kir` | C | ✅ **III.K.2** |
| KIBAR | ✕ | `LabelSheet` (`window.print()`) | — | ❔ |
| Rincian Transaksi (Rekonsiliasi) | ✔ | ✕ | — | ➖ alat telusur |
| Uji Konsistensi | ✔ | ✕ | — | ➖ alat uji internal |
| LRA — Rekonsiliasi Belanja Modal | ✔ | ✕ | — | ➖ jembatan ke LRA; dirujuk V.2 |

### 3.4 Rekap

| | Jumlah |
|---|---|
| ✅ sudah berformat Permendagri | **4** laporan (IV.A · IV.L.4.x · V.2 · III.K.2) |
| ❔ perlu dikonfirmasi | **5** (4 Perolehan non-Pengadaan + KIBAR) |
| ⬜ belum ada padanan ditetapkan | **9** (seluruh Pengelolaan) |
| ➖ memang alat internal | **3** |

---

## 4. Aturan arsitektur yang diusulkan

Belum berlaku — jadi aturan resmi kalau dipindahkan ke rules.md.

- **R1 — Format Permendagri itu artefak CETAK, bukan mode tampilan.** Layar kerja
  (filter, cari, drill-down) tetap format aplikasi. Memaksa layar jadi lembar
  berarti membangun dua tabel untuk satu laporan, dan dua tabel selalu menyimpang.
- **R2 — Satu komponen lembar, dua pemakai** (tab pratinjau + halaman cetak).
  Pola D. Sudah berlaku di `LaporanPengadaanTabel` — tiru itu.
- **R3 — Batas pola B vs C** seperti §2. Butuh `descendantIds`/angka mahal → B.
- **R4 — Registry format, bukan cabang `if`.** ✅ **BERLAKU sejak 2026-08-29** —
  `lib/permendagriFormat.ts` memuat 9 lembar dari 7 keluarga format (§1). Kode
  format, judul resmi, kertas, & berkas perendernya jadi DATA. Pelajaran
  `JUDUL_PENGADAAN`/`KOLOM_PENGADAAN` di cetak RKBMD: dulu angka 12/10/8 ditulis
  tangan di sembilan tempat, jadi menyisipkan satu kolom berarti menyunting
  sembilannya.
  ⚠️ Registry SENGAJA cuma memuat lembar yang **sudah dibangun** — entri untuk
  yang belum ada takkan pernah dibaca siapa pun lalu basi diam-diam (pelajaran
  cache `aset.pemanfaatan`). Daftar yang BELUM punya padanan tinggal di §3,
  bukan di kode.
  ⚠️ Kolom `berkas` **diverifikasi test ada di disk**. Itu bukan formalitas:
  berkas lembar sudah pernah di-rename (`LaporanPengadaanModel3` →
  `LaporanPengadaanPermendagri`, 2026-08-29) dan penunjuk basi tak menghasilkan
  satu pun error saat dijalankan.
- **R5 — Tab "Format Permendagri" muncul dari registry, bukan prop boolean.**
  ✅ **BERLAKU sejak 2026-08-29** — `lib/permendagriFormat.ts`, dikunci
  `lib/permendagriFormat.test.ts`. Laporan tanpa entri → tab-nya TIDAK ADA sama
  sekali (bukan tab kosong / "belum tersedia"). Prop `formatPermendagri` sudah
  DIHAPUS: prop opsional yang lupa dikirim tak menghasilkan error TypeScript,
  jadi menu Perolehan keenam yang lupa mendaftarkannya akan kehilangan tabnya
  DIAM-DIAM. Nambah lembar = nambah SATU entri; tabnya muncul sendiri.
- **R6 — Kode format dicetak DI LEMBAR (kanan atas), bukan di nama tab/menu.**
  Sudah diterapkan 2026-08-29. Alasan: di lembar ia berguna (pemeriksa mencocokkan
  lampiran), di tab ia jargon.
- **R7 — Satu pop-up baku untuk yang tak bisa disimpulkan sistem**: penanda tangan
  (+Definitif/Plt lewat `fetchCalonTtd`), tanggal, kop on/off, cakupan Intra vs
  Intra+Ekstra. Preseden: `BeritaAcaraRekonModal`, `CetakMutasiBmdModal`.
  Pilihan disimpan `localStorage` per (SKPD × format) — lembar ini diteken lalu
  dipindai, jadi cetak ulang WAJIB menghasilkan lembar yang SAMA.
- **R8 — Pilihan cetak dibekukan (`applied`), jangan baca state hidup.** Pelajaran
  BeritaAcaraRekon: nama SKPD dari nilai hidup → operator ganti SKPD tanpa Proses
  → angka SKPD lama di bawah kop SKPD baru, tanpa satu pun tanda.
- **R9 — Excel TIDAK ikut diseragamkan.** Excel = berkas kerja (sortir, pivot);
  PDF = yang dikirim. Excel bentuk Permendagri boleh jadi tombol KEDUA, tapi
  Excel datar yang ada sekarang jangan dihapus.
- **R10 — Fail-closed, dan lebih keras untuk lembar cetak.** Lembar yang menolak
  dirakit jauh lebih murah daripada lembar bertanda tangan yang isinya kurang.

---

## 4b. Kerangka lembar — apa yang disatukan, apa yang TIDAK

`lib/cetakLembar.ts` (2026-08-29). Dua fungsi MURNI, jadi bisa diuji tanpa DOM:

- **`cssCetakLembar({ id, kertas, margin, sembunyikan, tambahan })`** — blok
  `@media print`. Menggantikan **4 salinan** (`CetakLaporan.tsx`, Rekonsiliasi
  ×2, Laporan BMD). MELEMPAR untuk dua kekeliruan yang menghasilkan berkas
  KOSONG tanpa satu pun error: `id` diawali `#`/berspasi (selektornya jadi
  `##id` → seluruh halaman tetap tersembunyi), dan `sembunyikan` memuat `id`
  lembarnya sendiri.
- **`namaBerkasCetak(...bagian)`** — nama bawaan "Save as PDF" lewat
  `document.title`. Menggantikan **6 salinan**, salah satunya
  (`bmd/page.tsx`) sudah menyimpang: kehilangan `.trim()`, jadi nama SKPD
  berspasi ujung menghasilkan `…_Dinas X _2026-S1`.
- `kertas` bertipe **`Kertas`**, bukan teks bebas — dan `LembarPermendagri.kertas`
  di registry ikut bertipe itu. Nilai tak dikenal menghasilkan `size: undefined`
  yang **diabaikan peramban**: lembarnya diam-diam tercetak pada ukuran bawaan
  pengguna, bukan yang diminta format.

⚠️ **Pop-upnya SENGAJA TIDAK disatukan.** `CetakMutasiBmdModal` (194 baris)
cuma menanyakan penanda tangan & tanggal; `BeritaAcaraRekonModal` (372 baris)
juga menanyakan nomor BA, DUA pihak berikut pangkat/jabatan, cakupan
Intra/Ekstra, kop, & tiga catatan — karena Format V.2 memang memintanya.
Bedanya bukan gaya penulisan, melainkan **bentuk formatnya**; memaksa keduanya
jadi satu komponen menghasilkan penyatuan palsu yang parameternya lebih banyak
daripada kode yang dihemat. Yang memang layak disatukan berikutnya cuma
**ingatan pilihan cetak** — itu Fase 2c di bawah.

### Fase 2c — ingatan pilihan cetak (2026-08-29)

`lib/ingatanCetak.ts`. Menggantikan pasangan baca/tulis `localStorage` yang
disalin di **8 tempat** (5 halaman cetak + 2 pop-up + modal BA).

- **`ingatanCetak<T>(kunci)`** — muatan JSON, dipakai 7 dari 8 lembar.
- **`ingatanTeksCetak(kunci)`** — muatan TEKS POLOS. ⚠️ Dipakai SATU lembar
  (RKBMD se-Kabupaten, `bmd_rkbmd_ttd_sekab`) yang menyimpan id pegawai apa
  adanya sejak awal. Membacanya sebagai JSON akan `JSON.parse('<uuid>')` →
  melempar → `null`, jadi pilihan yang sudah tersimpan di peramban operator
  LENYAP tanpa satu pun error. Bentuknya **dipertahankan, bukan "dirapikan"**.
- Semua kunci dikumpulkan di lib itu. ⚠️ **NILAINYA WARISAN & JANGAN DIGANTI** —
  kunci itu tempat preferensi tersimpan di peramban OPERATOR; menggantinya tak
  error sama sekali, cuma membuat semua pilihan lenyap dan lembar cetak ulang
  mendadak bertitik-titik lagi. Penamaannya memang tak seragam
  (`bmd_laporanbmd_…` vs `bmd_rkbmd_…` vs `bmd_ba_rekon_…`); menyeragamkannya
  lebih mahal daripada manfaatnya. Dikunci HARFIAH di `lib/ingatanCetak.test.ts`.

⚠️ **Cacat nyata yang ditutup: TIGA titik menulis TANPA `try/catch`**
(`standar-harga`, `rkbmd` ×2). `localStorage.setItem` MELEMPAR di mode privat &
saat kuota penuh, dan di ketiga titik itu ia dipanggil dari dalam
`onChange`/`onPilih` — jadi sekadar *memilih penanda tangan* bisa menjatuhkan
halaman cetaknya. Pembacanya sudah dijaga sejak awal di semua tempat; penulisnya
yang kelewat.

⚠️ **Bentuk MUATANNYA sengaja tidak diseragamkan** — `{id,tgl}` · `{kiri,kanan,tgl}`
· `{id,plt,tgl}` · `{id,jabatan}` · `{ttd,kiri,tgl}` · `Partial<KonfigBA>`.
Tiap lembar menyimpan hal berbeda karena formatnya memang menanyakan hal
berbeda; yang disatukan MEKANIKNYA (generik `<T>`). Memaksa satu tipe bersama
menghasilkan objek serba-opsional yang tak menjelaskan apa pun — alasan yang
sama dengan tidak menyatukan pop-upnya.

⚠️ **Pemilih penanda tangannya sendiri (`fetchCalonTtd` + dropdown + radio
Definitif/Plt) BELUM disatukan** dan sengaja ditunda: bentuk UI-nya berbeda
per lembar (per-SKPD vs se-pemda vs dua-pihak), jadi ia perlu ditelaah bareng
Fase 3 ketika sudah ada pemakai ketiga yang bentuknya beda.

⚠️ **Tiga aturan IKUT TERPASANG** di lembar yang sebelumnya tak punya, dan
sudah diperiksa aman: `.no-print{display:none}` di lembar BA & Mutasi (nol
elemen `.no-print` di dalamnya → no-op); `thead{table-header-group}` &
`tr{break-inside:avoid}` di tabel Rekonsiliasi (kartunya sudah
`break-after:page` per golongan, jadi paling banter ia mengulang judul kolom
kalau satu golongan melebihi satu halaman — perbaikan, bukan kemunduran).
`display:block` yang kini selalu ikut juga no-op: ketiga lembar `<div>` polos.

---

## 5. Urutan pengerjaan

- **Fase 0 — SELESAI (2026-08-29).** Nomenklatur "Model 2"/"Model 3" dicabut dari
  menu Perolehan; kode format pindah ke lembar (R6). Alasannya ditulis lengkap di
  JSDoc prop `formatPermendagri` (`components/LaporanPerolehan.tsx`) — di situ ia
  terbaca oleh orang yang hendak mengembalikannya.
  ⚠️ **"Model 1/2/3" di Laporan BMD & Saldo Awal → Rekapitulasi SENGAJA TIDAK
  ikut dicabut** (`components/RekapModelControls.tsx`). Di sana ia penamaan
  aplikasi sendiri untuk tiga bentuk rekap yang memang berbeda, sudah dipakai
  operator, dan menyentuhnya berarti menyentuh laporan Lapis 1. Justru
  tabrakan arti itulah yang bikin angka di menu Perolehan harus pergi.
- **Fase 1 — sisi kiri SELESAI** (dokumen ini). **Sisi kanan MENUNGGU** rujukan
  format dari Bidang Aset — lihat §6.
- **Fase 2a — registry: SELESAI (2026-08-29).** `lib/permendagriFormat.ts` +
  test. R4 & R5 berlaku. Tak butuh rujukan Permendagri karena isinya diturunkan
  dari 7 keluarga format yang memang sudah terbangun di kode.
- **Fase 2b — kerangka lembar: SELESAI (2026-08-29).** `lib/cetakLembar.ts` +
  test. Yang disatukan MEKANIKNYA, bukan pop-upnya — lihat §4b.
- **Fase 2c — ingatan pilihan cetak: SELESAI (2026-08-29).** `lib/ingatanCetak.ts`
  + test; 8 salinan jadi satu & 3 penulis tanpa `try/catch` ditutup — §4b.
- **Fase 3 — uji kerangka pada bentuk yang paling BEDA**, yaitu satu laporan
  Pengelolaan (daftar transaksi, bukan rekap). Kalau kerangkanya bertahan tanpa
  dibedah, dia benar. Kalau harus dibedah, bedah SEKARANG selagi pemakainya
  baru dua.
- **Fase 4 — sisanya satu per satu**, tiap kali cuma menambah satu entri registry.
  Tujuh laporan `LaporanTransaksi` kemungkinan sekali pukul.
- **Fase 5 — halaman "Paket Laporan Permendagri"**: cetak beberapa lembar
  sekaligus untuk satu SKPD × periode. Ia KONSUMEN dari lembar yang sudah ada,
  bukan penggantinya.

⚠️ **Keputusan UX yang sudah diambil (user 2026-08-29): tetap tab per laporan,
BUKAN toggle/filter global dan BUKAN menu terpisah.** Alasannya: tidak semua
laporan punya padanan Permendagri (§3.4 — 3 memang alat internal), jadi toggle
global memaksa menu-menu itu menjawab "mode ini tak berlaku di sini" — kegagalan
senyap. Menu terpisah memaksa operator memilih SKPD & periode dua kali, dan repo
ini sudah punya preseden menolak dua pintu untuk satu hal (tombol Cetak dicabut
dari Validasi RKBMD). Kebutuhan "semua lampiran di satu tempat" dijawab Fase 5.

---

## 6. Yang DIBUTUHKAN dari Bidang Aset

Tanpa ini Fase 1 tak bisa ditutup, dan **menebaknya adalah jenis kesalahan
termahal** — lembarnya ditandatangani.

1. **Salinan lampiran Permendagri 47/2021**, atau minimal daftar format yang
   memang dipakai Bidang Aset.
2. **Padanan format untuk 9 laporan Pengelolaan (§3.2)** — khususnya: apakah
   Penggunaan / Penerimaan / Pengeluaran / Reklasifikasi / Koreksi / Kapitalisasi
   / Penghapusan itu satu keluarga format? Kalau ya, tujuh laporan beres sekaligus.
3. **Nomor format untuk lembar "Laporan Penerimaan BMD"** (§3.1) yang sudah ada di
   `app/cetak/perolehan` — dan apakah ia berlaku sama untuk keempat cara perolehan
   non-Pengadaan.
4. **KIBAR** — apakah padanannya KIB (A–F) di Permendagri 47/2021, dan yang mana.
