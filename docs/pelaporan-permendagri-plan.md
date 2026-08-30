# Rencana modul Pelaporan Permendagri 47/2021

Rencana membuat keluaran aplikasi ini **sesuai format baku Permendagri 47/2021**
— lembar ber-kode `IV.x` (Laporan) dan `V.x` (Rekonsiliasi).

**Berkas ini adalah papan kerjanya.** Diisi bertahap: user menyerahkan format
(tangkapan layar / berkas), dicatat di sini, lalu dikerjakan satu per satu.
Kalau kamu agent yang baru masuk dan diminta "kerjakan format IV.A.2.2", mulai
dari sini.

Sumber daftar formatnya: mindmap Miro **"LAPORAN BMD PADA KPB, PB, atau
PENGELOLA BARANG"** (board `uXjVIXaz4aY`, Frame 3, 163 node) — dibaca
2026-08-30.

---

## 1. Temuan pokok: modulnya sudah ada, formatnya yang belum

Mindmap memuat **13 kategori laporan**. Disandingkan dengan modul yang sudah
berjalan:

| Cabang mindmap | Modul di aplikasi | Status |
|---|---|---|
| Perolehan (IV.A) | 5 menu Cara Perolehan + KDP · `LaporanPerolehan` · `/cetak/perolehan` | ada |
| Penggunaan | Pengalihan Status Penggunaan | ada |
| Penerimaan Internal Pengguna Barang | Penggunaan Masuk / mutasi internal | ada |
| Pengeluaran Internal Pengguna Barang | Pengeluaran Internal | ada |
| Pemanfaatan (IV.E) | menu Pemanfaatan · `LaporanPemanfaatan` | ada |
| Reklasifikasi | menu Reklasifikasi | ada |
| Koreksi | menu Koreksi (5 alasan) | ada |
| Penyusutan | engine · menu Penyusutan · Laporan BMD | ada |
| **Persediaan** | — | **DI LUAR CAKUPAN** |
| Pengamanan | menu Pengamanan · `LaporanPengamanan` | ada |
| Penghapusan (IV.K) | menu Penghapusan | ada |
| Rekapitulasi | Laporan BMD Model 1/2/3 · Rekap Saldo Akhir | ada |
| Rekonsiliasi (V.1–V.4) | **BA Rekon 4 varian** | **SELESAI** |

**Dua belas dari tiga belas cabang sudah punya modulnya.** Peristiwanya sudah
tercatat di ledger; yang belum ada cuma **lapisan format** yang mengubahnya jadi
lembar ber-kode. Jadi pekerjaan ini **bukan membangun modul baru** — kalau suatu
saat terasa perlu menambah tabel atau jenis ledger demi sebuah format, berhenti
dulu dan periksa ulang: kemungkinan besar datanya sudah ada di tempat lain.

---

## 2. Keputusan yang sudah diambil

Semuanya keputusan user, supaya tak diperdebatkan ulang tiap kali membuka
berkas ini.

### 2.1 Persediaan di luar cakupan — SELAMANYA (2026-08-30)

Aplikasi ini tak pernah mencatat persediaan; itu ranah SIPD/keuangan. Seluruh
cabang **Aset Lancar** di bawah Pengadaan APBD (IV.A.1.1.1 – 1.1.8) **tidak
dibuat**.

⚠️ Ini sejalan dengan sel Persediaan & Kemitraan di lampiran Saldo BA Rekon yang
sengaja **dikosongkan, bukan diberi nol** — kosong berarti "di luar cakupan
aplikasi", nol berarti "belum ada menunya". Bedanya dijaga `barisSaldoBA` vs
`barisTrxBA` (lihat CLAUDE.md bagian BA Rekon). Pakai pembedaan yang sama di
sini.

### 2.2 Frekuensi = RENTANG TANGGAL, bukan jenis laporan (2026-08-30)

Mindmap memecah tiap laporan jadi Bulanan / Semester / Tahunan. **Jangan
membuat tiga jenis laporan.** Buat satu laporan dengan satu pemilih rentang;
frekuensi hanya menyetel tanggal awal & akhir. Bawaan: Semester.

**Alasannya, dan ini yang menentukan sah-tidaknya:** laporan-laporan ini
**laporan ARUS** (daftar peristiwa dalam rentang tanggal), bukan **POSISI**.
Baris ledger punya `tanggal` harian, jadi bulanan gratis — satu filter, nol
jalur perhitungan baru.

⚠️ **JANGAN tiru pola ini untuk laporan yang bersandar `penyusutan_semester`**
(Laporan BMD, Penyusutan, Rekapitulasi Saldo). Di sana periodenya semesteran
secara hakiki — "posisi per Maret" adalah pertanyaan yang tak punya jawaban di
model data ini, dan memaksakannya menghasilkan angka yang tampak sah tapi tak
berarti apa-apa.

### 2.3 Kelompok aset = FILTER KODE, bukan laporan terpisah (2026-08-30)

Aset Tetap (`1.3.%`) dan Aset Lainnya (`1.5.%`) punya susunan kolom yang sama.
Satu generator, satu saringan golongan — bukan dua berkas yang saling menyalin.

### 2.4 Pembagian Lancar/Tetap/Lainnya itu soal REKONSILIASI, bukan tata letak

Pemisahan di Permendagri lahir karena ketiganya bertemu angka pembanding yang
berbeda:

| Kelompok | Direkonsiliasi ke | Di neraca |
|---|---|---|
| Aset Lancar (Persediaan) | Belanja Barang & Jasa (5.1.02) | aset lancar, dibebankan saat dipakai |
| Aset Tetap | **Belanja Modal (5.2)** | aset tetap, disusutkan |
| Aset Lainnya | campuran | ATB diamortisasi; 1.5.4 beku |

Buktinya ada di kaki formatnya sendiri: **IV.A.1.2.3** (Aset Tetap) memuat baris
`Jumlah LRA Belanja Modal − Jumlah Pengadaan Aset Tetap = Selisih`, sedangkan
**IV.A.1.1.1** (Persediaan) tidak. Jadi kaki rekonsiliasi itu bagian yang paling
tidak boleh dihilangkan dari format Aset Tetap.

### 2.5 Kolom uang sebagian besar TURUNAN

Formatnya sendiri mencantumkan rumusnya, jadi jangan disimpan:

```
(14) Total Nilai Barang      = (11) Jumlah × (13) Harga Satuan
(16) Nilai Perolehan Barang  = (14) + (15) Biaya Atribusi
(17) Harga Satuan Perolehan  = (16) ÷ (11)
```

Yang benar-benar perlu tersimpan cuma **harga satuan** dan **biaya atribusi**.

---

## 3. Pasangan yang gampang tertukar

⚠️ **"Pembatalan Penghapusan" (IV.A.9) ≠ `batal_penghapusan` di aplikasi ini**
(ditegaskan user 2026-08-30).

| | Peristiwanya | Tanggal | Akibat |
|---|---|---|---|
| `batal_penghapusan` (aplikasi) | **KOREKSI** — penghapusannya dianggap tak pernah terjadi | dicatat MUNDUR ke tanggal penghapusan asli | barang muncul lagi di SEMUA periode |
| Pembatalan Penghapusan (IV.A.9) | **PEROLEHAN baru** — ber-SK & bertanggal sendiri | tanggal SK pembatalan | barang masuk lagi SEJAK tanggal itu |

Karena itu IV.A.9 **butuh menu sendiri** (pola jurnal ber-SK), bukan menumpang
jalur `batal_penghapusan` yang sudah ada. Sampai menunya dibangun, baris
"i. pembatalan Penghapusan" di BA Rekon **tetap 0** — dan itu memang benar.

Keluarga yang sama dengan pasangan yang sudah tercatat di
[kamus.md](kamus.md): Penggabungan vs Pencatatan Ganda, Kembalikan vs Batal,
Akhiri vs Batal Pemanfaatan. **Pindahkan pasangan ini ke `kamus.md` begitu
menunya benar-benar dibangun.**

---

## 4. Bentuk teknis yang disepakati

Satu **daftar format** (registry) + satu generator. Enam puluhan lembar di
mindmap itu bukan enam puluh halaman cetak — ia enam puluh baris konfigurasi di
atas empat-lima bentuk tabel.

Tiap entri daftar memuat: kode `IV.x` · judul lembar · kategori (jenis ledger
sumbernya) · kelompok aset · frekuensi yang berlaku · bentuk tabel · kaki
(ada/tidak rekonsiliasi LRA).

⚠️ **Pemetaan jenis ledger → baris format WAJIB dikunci test**, dengan aturan
"tiap jenis dipakai TEPAT SEKALI". Ini bukan kehati-hatian belaka: jenis yang
lupa dipetakan **tidak menghasilkan satu pun error**, ia cuma hilang dari lembar
dan jumlahnya diam-diam kurang. Polanya sudah ada dan terbukti — `BARIS_TRX` di
`lib/beritaAcaraRekon.ts` + testnya. Tiru itu.

---

## 5. Daftar format

Diisi bertahap. `?` = kodenya belum dibaca dari mindmap/berkas aslinya.

### IV.A — Perolehan

| Cabang | Bulanan | Semester | Tahunan | Status |
|---|---|---|---|---|
| Pengadaan APBD → Aset Lancar | IV.A.1.1.1 | IV.A.1.1.2–5 | IV.A.1.1.6–8 | ❌ di luar cakupan (§2.1) |
| Pengadaan APBD → Aset Tetap | IV.A.1.2.1–2 | IV.A.1.2.3–19 | IV.A.1.2.20–26 | belum |
| Pengadaan APBD → Aset Lainnya | IV.A.1.3.1 | IV.A.1.3.2–6 | IV.A.1.3.7–10 | belum |
| Hibah / sumbangan | IV.A.2.1 | IV.A.2.2–6 | IV.A.2.7–10 | belum |
| Perjanjian Kontrak | ? | ? | ? | ⛔ belum ada menunya |
| Ketentuan perundang-undangan | ? | ? | ? | ⛔ belum ada menunya |
| Putusan Pengadilan berkekuatan hukum tetap | ? | ? | ? | ⛔ belum ada menunya |
| Divestasi | ? | ? | ? | ⛔ belum ada menunya |
| Hasil Inventarisasi | IV.A.7.1 | IV.A.7.2–6 | IV.A.7.7–10 | belum |
| Hasil Tukar Menukar | IV.A.8.1 | IV.A.8.2–6 | IV.A.8.7–10 | belum |
| Pembatalan Penghapusan | ? | ? | ? | ⛔ belum ada menunya (§3) |
| Perolehan Lainnya | IV.A.10.1 | IV.A.10.2–6 | IV.A.10.7–10 | belum |
| Rekapitulasi gabungan perolehan/penerimaan | — | IV.A.11.1–4 | IV.A.11.5–8 | belum |

### Kategori lain

Kodenya belum dibaca; diisi saat user menyerahkan formatnya.

Penggunaan · Penerimaan Internal · Pengeluaran Internal · Pemanfaatan (IV.E,
a.l. IV.E.5) · Reklasifikasi · Koreksi · Penyusutan · Pengamanan (BMD PM & BMD
GB) · Penghapusan (IV.K, rekap gabungan IV.K.7) · Rekapitulasi (Aset Lancar,
Aset Tetap, Aset Lainnya, Lap BMD).

### V — Rekonsiliasi

| Format | Pihak | Status |
|---|---|---|
| V.1 | Pengurus Barang Pembantu ↔ Pengguna | ✅ selesai (BA Rekon) |
| V.2 | Pengguna ↔ Pengelola | ✅ selesai |
| V.3 | Pengguna ↔ Pelaksana Akuntansi SKPD | ✅ selesai |
| V.4 | Pengelola ↔ Pelaksana Akuntansi Pemda | ✅ selesai |

---

## 6. Pertanyaan terbuka — butuh keputusan user

**(a) Total Biaya Atribusi — kolom (15).** Biaya angkut, pemasangan, konsultan
pengawas yang menempel ke harga perolehan. Sekarang `aset.nilai_perolehan`
adalah satu angka gelondongan; kolom ini memisahkan nilai barang dari biaya
atribusinya.

- Opsi 1 — simpan terpisah: kolom baru + kotak isian di menu Pengadaan. Akurat,
  tapi menyentuh alur entry yang sudah jalan.
- Opsi 2 — cetak nol, seluruh biaya dianggap sudah melebur di harga satuan.
  Nol biaya, tapi kolom (15) selalu kosong dan (16) = (14) selamanya.

**(b) Kaki rekonsiliasi LRA — baris (31)(32)(33) di format Aset Tetap.** Angka
"Jumlah LRA Belanja Modal" datang dari SIPD; aplikasi ini tak memilikinya.

- Opsi 1 — kotak isian manual di layar cetak (pola penanda tangan RKBMD).
- Opsi 2 — barisnya dicetak kosong untuk ditulis tangan.

⚠️ Bandingkan dengan keputusan BA Rekon: baris LRA (17)(24) di situ akhirnya
**DIHAPUS** karena input manual dinilai lebih mengganggu daripada berguna. Di
format IV.A.1.2.x kaki itu jauh lebih sentral (ia inti rekonsiliasinya), jadi
keputusannya belum tentu sama.

---

## 7. Cara menyerahkan format baru

Supaya sekali serah langsung bisa dikerjakan, sertakan:

1. **Kode format** — mis. `IV.A.2.2`
2. **Tangkapan layar / berkas** lembarnya (yang memperlihatkan judul, kepala
   kolom, nomor kolom, dan kakinya)
3. **Jenis aset** yang berlaku — Aset Tetap / Aset Lainnya / keduanya
4. **Frekuensi** yang benar-benar dipakai di lapangan
5. **Ukuran kertas** — A4 atau F4, potret atau lanskap
6. **Penanda tangan** — siapa, dan apakah perlu pilihan Definitif/Plt

Poin 5 & 6 sering terlewat lalu baru ketahuan sesudah lembarnya dicetak. Untuk
poin 6, aturan yang sudah berlaku: calon penanda tangan diambil lewat
`fetchCalonTtd` (lib/penandaTangan.ts), **jangan** query `admin_pegawai`
ber-`.eq('skpd_id')` — dari 816 SKPD hanya 57 yang punya pegawai berjabatan
"Kepala".

---

## 8. Urutan pengerjaan

Belum ditetapkan. Usul: mulai dari **IV.A.1.2.x (Pengadaan APBD → Aset Tetap)**
— cabang paling besar, paling sering diminta, dan sudah punya tulang punggungnya
(`LaporanPerolehan` + `/cetak/perolehan` 14 kolom, dibangun 2026-08-20). Begitu
bentuknya jadi, cabang perolehan lain tinggal mengganti saringan jenis.

Sesudah satu format selesai, catat sejarah & alasan desainnya di **CLAUDE.md**
seperti fitur lain — berkas ini papan rencana, bukan tempat menyimpan sejarah.
