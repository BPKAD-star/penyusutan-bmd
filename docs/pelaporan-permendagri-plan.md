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

### 2.5 Tiap cara perolehan = 1 lembar RINCI + 4 lembar REKAP (2026-08-30)

Susunannya berulang identik di seluruh IV.A:

```
IV.A.<n>.2   lembar RINCI    — 24 kolom, satu baris per barang
IV.A.<n>.3   rekap menurut SUB RINCIAN OBJEK   (kode 6 segmen)
IV.A.<n>.4   rekap menurut RINCIAN OBJEK       (kode 5 segmen)
IV.A.<n>.5   rekap menurut OBJEK               (kode 4 segmen)
IV.A.<n>.6   rekap menurut JENIS               (kode 3 segmen)
```

Terbukti di Hibah (IV.A.2.2–6), Hasil Inventarisasi (7.2–6), Tukar Menukar
(8.2–6), Perolehan Lainnya (10.2–6).

⚠️ **Keempat rekap itu SATU tabel di empat kedalaman**, bukan empat laporan.
Kolomnya identik — Kode Barang · Nama Barang · Jumlah Barang · Jumlah (Rp) — dan
satu-satunya yang berbeda adalah sampai level mana kode dijumlahkan. IV.A.2.6
sendirian menambah kolom **No** dan baris **JUMLAH (14)**.

Konsekuensi kerja: **mesin subtotal bertingkat yang dibangun untuk lembar RINCI
itu juga yang melahirkan keempat rekapnya** — rekap = mesin yang sama dipanggil
dengan parameter kedalaman, lalu berhenti sebelum baris barang. Jangan menulis
agregasi terpisah untuk lembar rekap; kalau angkanya bisa berbeda dari lembar
rinci, salah satunya pasti salah dan tak ada yang akan menyadarinya.

### 2.6 Kolom uang sebagian besar TURUNAN

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
| Hibah / sumbangan | IV.A.2.1 | **IV.A.2.2–6 ✅** | IV.A.2.7–10 = **se-Kabupaten** (§9b) | per-SKPD **SELESAI**; se-Kabupaten belum |
| Perjanjian Kontrak | ? | ? | ? | ⛔ belum ada menunya |
| Ketentuan perundang-undangan | ? | ? | ? | ⛔ belum ada menunya |
| Putusan Pengadilan berkekuatan hukum tetap | ? | ? | ? | ⛔ belum ada menunya |
| Divestasi | ? | ? | ? | ⛔ belum ada menunya |
| Hasil Inventarisasi | IV.A.7.1 | IV.A.7.2–6 | IV.A.7.7–10 | lembar SIAP; kurang field header (§10) |
| Hasil Tukar Menukar | IV.A.8.1 | IV.A.8.2–6 | IV.A.8.7–10 | lembar SIAP; kurang field header (§10) |
| Pembatalan Penghapusan | ? | ? | ? | ⛔ belum ada menunya (§3) |
| Perolehan Lainnya | IV.A.10.1 | IV.A.10.2–6 | IV.A.10.7–10 | lembar SIAP; kurang field header (§10) |
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

**Mulai dari IV.A.2.2–6 (Hibah/Sumbangan, Semester)** — ditetapkan 2026-08-30.

⚠️ Sengaja **BUKAN** IV.A.1.2.x walaupun itu cabang terbesar: ia terkunci dua
keputusan yang belum diambil (biaya atribusi & kaki LRA, §6). Hibah tidak
terkunci apa pun — formatnya tak punya kolom biaya atribusi maupun kaki
rekonsiliasi LRA, sebab hibah memang bukan belanja modal.

Urutan di dalamnya:

✅ **Langkah 1–3 SELESAI 2026-08-30** — `lib/formatPermendagri.ts` (registry +
mesin subtotal, 43 test), `components/pelaporan/LembarPerolehanPermendagri.tsx`
(penyaji), `app/cetak/perolehan-permendagri/page.tsx` (data), tombol di menu
Pelaporan. Keempat cara perolehan sudah punya lembarnya; tiga di antaranya
menunggu field header (§10d).

1. **IV.A.2.2 (lembar RINCI)** — di sinilah seluruh sambungan datanya. Tulang
   punggungnya sudah berdiri: `/cetak/perolehan` (2026-08-20), yang pada
   dasarnya versi ringkas 14 kolom dari lembar ini. Dua kolom yang paling
   "baru" — **Sumber Dana** & **Pihak Pemberi Hibah** — kebetulan sudah ada
   sejak 2026-08-20 di `jurnal_header.payload`.
2. **Mesin subtotal bertingkat** — bagian yang belum ada sama sekali, dan yang
   dipakai ulang oleh SEMUA format lain di pohon ini.
3. **IV.A.2.3–6 (rekap)** — jatuh hampir gratis dari langkah 2 (§2.5).
4. **Cabang lain**: Hasil Inventarisasi (7.x), Tukar Menukar (8.x), Perolehan
   Lainnya (10.x) — bentuknya identik, tinggal ganti saringan jenis ledger.

Sesudah satu format selesai, catat sejarah & alasan desainnya di **CLAUDE.md**
seperti fitur lain — berkas ini papan rencana, bukan tempat menyimpan sejarah.

---

## 9. Keputusan teknis lembar (2026-08-30)

Berlaku untuk set IV.A.2.x; jadi bawaan untuk format berikutnya kecuali user
menentukan lain.

| Hal | Keputusan |
|---|---|
| Ukuran kertas | **F4 lanskap** (`330mm 215mm`) — sama dengan lembar se-Kabupaten RKBMD |
| Kolom (12) NIBAR/NUSP | **NIBAR saja**; NUSP tidak dipakai |
| Penomoran kolom | **ikuti lembar aslinya APA ADANYA** |

⚠️ Soal penomoran: lembar asli IV.A.2.2 menomori "(14)" **dua kali** (Jumlah
Barang & Satuan Barang) lalu lompat ke (16). Itu salah ketik di sumbernya, dan
**tetap diikuti** — lembar resmi dicocokkan pemeriksa kolom per kolom, jadi
merapikan penomoran justru membuatnya tak cocok. Jangan "diperbaiki" oleh siapa
pun yang membaca kode ini nanti dan mengira itu kekeliruan kita.

⚠️ NIBAR 45 digit + F4 lanskap: perhatikan pelajaran `/cetak/perolehan` —
NIBAR dipenggal dua baris di **batas segmen** lewat `pecahNibar()`
(lib/kodeRegister.ts), bukan `break-all`. Dan penjaganya sama dengan
`prefixNibar`: 150.101 NIBAR warisan impor ATL Diknas juga 45 digit tapi
susunannya BEDA, jadi `null` = tampilkan utuh, jangan menebak.

**Diputuskan sambil membangun (2026-08-30):**

- **Blok tanda tangan ada di SETIAP lembar**, rinci maupun rekap. Gambar rekap
  yang diserahkan terpotong di bawah tabel jadi tak bisa dipastikan, dan user
  meminta "sediakan aja penandatanganannya" — lembar bertanda tangan yang tak
  terpakai jauh lebih murah daripada lembar yang harus dicetak ulang.
- **SATU berkas berisi kelima lembar**, page-break antar lembar (pola BA Rekon).
- **Sebutan pejabat DITURUNKAN dari level SKPD** (keputusan user): level 1
  → `Pengguna Barang`, sub unit → `Kuasa Pengguna Barang`. Lembar aslinya
  menuliskan ketiga kemungkinan untuk dicoret salah satunya; di sini yang benar
  langsung dipilih karena levelnya sudah diketahui. ⚠️ `Pengelola Barang`
  sengaja TIDAK pernah dihasilkan otomatis — itu jabatan pemda, bukan turunan
  kedalaman node, dan menebaknya akan salah untuk BPKAD sendiri.
- **Tanggal pelaporan bisa dipilih** (permintaan user), disimpan per SKPD di
  `localStorage` bersama pilihan penanda tangan — berkas ini diteken lalu
  dipindai, jadi cetak ulang wajib menghasilkan lembar yang SAMA.
- **Komptabel bisa diganti di bilah atas tanpa memuat ulang.** Kop (2)
  menyatakan SATU komptabel, jadi isinya disaring; barang tanpa nilai kolom itu
  dianggap intra, sejalan `klasifikasiKomptabel`.

---

## 9b. IV.A.<n>.7–10 = SE-KABUPATEN, bukan versi tahunan (2026-08-30)

Mindmap mengelompokkan IV.A.2.7–10 sebagai "Tahunan", dan itu **menyesatkan**.
Dibandingkan kop-nya, IV.A.2.10 ternyata versi **se-Kabupaten** dari IV.A.2.6:

| | IV.A.2.6 | IV.A.2.10 |
|---|---|---|
| kop baris 3 | KUASA PENGGUNA/PENGGUNA/PENGELOLA (3) | **PROVINSI, KABUPATEN/KOTA (3)** |
| baris SKPD | `SKPD……(4)` | **tidak ada** |
| kolom tabel mulai | (9) | **(6)** |
| kolom tambahan | — | **"Pengguna Barang dan Pengelola Barang" (7)** |

Penomoran tabelnya yang menentukan: IV.A.2.6 mulai (9) karena kop-nya 8 isian;
IV.A.2.10 mulai (6) karena kop-nya 5 — isian SKPD & pejabatnya hilang, diganti
Provinsi/Kabupaten. Dan ia **masih menulis `SEMESTER…..(4)`**, jadi periode tetap
isian, bukan pembeda format.

**Keputusan (user 2026-08-30): periode = FILTER, bukan nama format.** Satu
lembar dipakai untuk Semester I / Semester II / Akhir Tahun; yang berganti cuma
isian kop. Memecah nama format per periode melahirkan tiga entri untuk lembar
yang sama.

Jadi centangnya dua kelompok:

```
Per SKPD       IV.A.<n>.2 rinci · .3 · .4 · .5 · .6
Se-Kabupaten   IV.A.<n>.7 · .8 · .9 · .10        ← BELUM DIBANGUN
```

⚠️ Kelompok se-Kabupaten **tak boleh terkunci filter SKPD** — justru gunanya
menjumlah seluruh SKPD, dengan tiap Pengguna Barang jadi baris. Itu wajib
tertulis di layar supaya operator tak mengira angkanya tersaring. Pola yang sama
dengan lembar RKBMD: per-SKPD diteken kepala kantor, se-Kabupaten diteken
Pengelola Barang.

⚠️ **"Akhir Tahun" bernilai TAHUN (mis. `2026`), bukan string kosong.** Kosong
berarti SELURUH periode yang pernah ada — melintasi tahun lain, sehingga kop
lembar berbohong tentang isinya. Penerjemahnya `periodeDiminta()` di
lib/laporanPerolehanPermendagri.ts; **setiap query yang menyaring periode wajib
lewat situ**, kalau tidak `.eq('periode','2026')` menghasilkan "0 transaksi" yang
kelihatan sah. Dikunci test.

---

## 10. Temuan saat membangun IV.A.2.x (2026-08-30)

**(a) Lembar REKAP itu HIERARKIS, bukan daftar datar.** Bacaan awal keliru:
keempat lembar rekap ternyata membuka dengan baris `x. x.` — **2 segmen**
(kelompok neraca `1.3` Aset Tetap / `1.5` Aset Lainnya) — lalu turun bertingkat
sampai kedalaman masing-masing. Jadi rekap = hierarki yang SAMA dengan lembar
rinci, dipotong lebih dangkal, bukan `GROUP BY` di satu tingkat. Lembar rinci
sendiri mulai di 3 segmen. Keduanya kini dilayani satu penyusun
(`jalanKelompok` di atas satu `petaTotal`) supaya mustahil menyimpang; dikunci
lib/formatPermendagri.test.ts.

**(b) `admin_kodefikasi_bmd` HANYA berisi baris 7 segmen** (15.353 baris,
diverifikasi ke produksi). TIDAK ada baris tersendiri untuk awalan yang lebih
pendek — jadi `.in('kode', <daftar awalan>)` mengembalikan **nol baris tanpa
satu pun error**, dan kolom "Nama Barang" di SELURUH baris subtotal tinggal
kosong. Nama tiap tingkat ada di KOLOM baris 7-segmen itu sendiri:
`nama_jenis` (3 seg) · `nama_objek` (4) · `nama_rincian` (5) ·
`nama_sub_rincian` (6) · `uraian` (7). Tingkat 2 segmen tak ada di mana pun →
konstanta `NAMA_KELOMPOK`. **Ambil dari kolom hierarkinya, jangan mencari
barisnya.**

**(c) Seluruh 420.433 aset berkode TEPAT 7 segmen** (diverifikasi ke produksi),
jadi tak ada kasus tepi kode pendek. Penjaganya tetap dipasang di
`jalanKelompok` — kode pendek tak boleh melahirkan baris kelompok kembar.

**(d) Tiga format masih kurang field HEADER**, semuanya kunci baru di
`jurnal_header.payload` (jsonb — **nol migrasi**, persis cara `sumber_dana`
ditambahkan 2026-08-20). Kolomnya sudah ada di lembar & sengaja dibiarkan
KOSONG sampai form headernya menyediakan isian — bukan diisi tebakan:

| Format | Kunci payload yang perlu ditambah |
|---|---|
| IV.A.7.2 Hasil Inventarisasi | `dok_nama` (+ nomor & tanggal "Dokumen Lainnya" — dokumen KEDUA di luar BA-nya) |
| IV.A.8.2 Tukar Menukar | tanggal & nomor "Perjanjian Tukar Menukar" (dokumen kedua). Mitra sudah terlayani `pihak` |
| IV.A.10.2 Perolehan Lainnya | `dok_nama`, `penyebab` |

⚠️ Untuk IV.A.10.2 tak ada kolom BAST sama sekali — dokumen satu-satunya adalah
"Dokumen Sumber Perolehan", jadi Nomor & Tanggal-nya dilayani `no_sk`/`tanggal`
header yang sudah ada.
