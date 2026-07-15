# Basis Pengetahuan Chatbot — Aplikasi Penyusutan BMD

> Dokumen ini adalah sumber kebenaran untuk chatbot asisten. Isinya menjelaskan
> **cara kerja pembukuan, penyusutan, dan pengelolaan** di aplikasi Penyusutan
> Barang Milik Daerah (BMD). Ditulis dalam bahasa pengurus barang, bukan istilah
> teknis kode. Chatbot HANYA boleh menjawab berdasarkan dokumen ini; kalau
> jawaban tidak ada di sini, arahkan user bertanya ke admin/pengelola barang.

---

## 0. Aturan main untuk chatbot (baca dulu)

- **Kamu asisten penjelas, bukan pelaksana.** Kamu menjelaskan *cara* melakukan
  sesuatu (mis. cara menghapus barang), tetapi tidak pernah benar-benar
  menghapus/mengubah data. Semua aksi tetap dilakukan user lewat menu aplikasi.
- **Jangan mengarang angka.** Kalau user tanya nilai/nominal spesifik (nilai buku
  aset X, akumulasi penyusutan, dll.) dan kamu tidak diberi datanya, jangan
  menebak. Arahkan ke menu **Penyusutan** atau **Daftar Barang**.
- **Bukan penasihat hukum/akuntansi.** Untuk kebijakan atau tafsir aturan
  (Permendagri, Perbup), sebut aturannya dan arahkan ke admin/inspektorat.
- **Kalau ragu, bilang tidak tahu** dan tunjukkan menu yang relevan.

---

## 1. Gambaran besar aplikasi

Aplikasi ini mengelola **Barang Milik Daerah (BMD)** milik pemerintah daerah:
mencatat perolehan barang, mengelola perubahan sepanjang umur barang, menghitung
**penyusutan** (depresiasi) tiap semester, dan menghasilkan laporan.

Ini adalah **data pemerintah yang hidup (live)** — dipakai untuk pelaporan resmi
ke atasan/inspektorat/BPK. Karena itu prinsip utamanya adalah **integritas dan
jejak audit**: setiap perubahan harus bisa ditelusuri, dan angka periode yang
sudah dilaporkan tidak boleh berubah diam-diam.

**Alur hidup barang (umum):**
Perolehan → (barang tercatat) → Pengelolaan sepanjang umur (penggunaan,
pemindahan, kapitalisasi, koreksi, dll.) → Penyusutan tiap semester → Penghapusan
saat barang keluar.

---

## 2. Konsep fundamental (WAJIB dipahami — ini yang bikin aplikasi ini beda)

### 2.1. Buku besar (ledger) bersifat "hanya-tambah" (append-only)

Setiap peristiwa yang menyangkut sebuah barang dicatat sebagai **satu baris
transaksi baru** di buku besar. Baris transaksi **tidak pernah diedit atau
dihapus** — selamanya. Ini prinsip mutlak.

**Konsekuensinya: koreksi = transaksi pembalik baru, bukan menghapus yang lama.**
Contoh:
- Salah menghapus barang → catat transaksi **Pembatalan Penghapusan** (bukan
  hapus baris penghapusannya).
- Salah kapitalisasi → catat **Pembatalan Kapitalisasi**.
- Kelebihan input saat pengadaan → catat **Pembatalan Pengadaan**.

Analogi: buku besar itu seperti buku catatan bertinta permanen. Kalau salah tulis,
kamu tidak menghapus baris lama; kamu menulis baris koreksi baru di bawahnya.

### 2.2. Status barang ditentukan dengan "memutar ulang" riwayatnya (replay)

Aplikasi tidak menentukan "barang ini masih ada atau tidak" hanya dari satu kolom
status. Ia **memutar ulang seluruh riwayat transaksi** barang tersebut, secara
berurutan, sampai periode yang sedang dilihat, lalu menyimpulkan kondisinya pada
periode itu.

Karena itu barang bisa "hilang" dari laporan di satu periode lalu "muncul" lagi di
periode lain, tergantung transaksi apa yang terjadi. Peristiwa yang
**menyembunyikan** barang antara lain: penghapusan, pembatalan pengadaan,
penyerapan ke induk (kapitalisasi). Peristiwa yang **memunculkan kembali**:
pembatalan penghapusan, pembatalan kapitalisasi.

Inilah kenapa baris riwayat tidak boleh dihapus: kalau jejaknya hilang,
"pemutaran ulang" jadi salah dan barang bisa keliru muncul/hilang.

### 2.3. Menghapus barang = "soft-delete", bukan benar-benar dihapus

Menghapus barang berarti menandainya sebagai terhapus + mencatat transaksi
penghapusan. Datanya **tetap tersimpan** di database untuk audit; ia hanya hilang
dari laporan dan berhenti disusutkan. Tidak ada penghapusan permanen.

### 2.4. Periode itu semesteran

Waktu akuntansi dibagi per **semester**, ditulis dengan format `TAHUN-S1` atau
`TAHUN-S2`:
- **S1** = Januari–Juni
- **S2** = Juli–Desember

Contoh: `2026-S1` = semester pertama 2026 (Jan–Jun 2026). Penyusutan dihitung
per semester, bukan per bulan atau per tahun.

### 2.5. Saldo Awal 2025 = titik nol yang beku

Kondisi seluruh barang per akhir 2025 (`2025-S2`) diambil sebagai **saldo awal**
(baseline) — foto saldo yang dibekukan, hasil impor dari sistem e-BMD. Semua
perhitungan penyusutan tahun-tahun berikutnya "diputar ulang" mulai dari titik ini.
Saldo awal ini sifatnya tampilan/acuan dan tidak pernah diubah oleh transaksi.

---

## 3. Golongan BMD dan perlakuan penyusutannya

Setiap barang punya **kode barang** yang menentukan golongannya (3 angka pertama =
golongan). Perlakuan penyusutan tergantung golongan:

| Kode | Golongan | Perlakuan |
|------|----------|-----------|
| 1.3.1 | Tanah | **Tidak** disusutkan |
| 1.3.2 | Peralatan dan Mesin | **Disusutkan** |
| 1.3.3 | Gedung dan Bangunan | **Disusutkan** |
| 1.3.4 | Jalan, Jaringan dan Irigasi | **Disusutkan** |
| 1.3.5 | Aset Tetap Lainnya (ATL) | **Tidak** disusutkan |
| 1.3.6 | Konstruksi Dalam Pengerjaan (KDP) | **Tidak** disusutkan (belum selesai) |
| 1.5.3 | Aset Tidak Berwujud (ATB) | **Diamortisasi** (sama mekanismenya dengan penyusutan) |
| 1.5.4 | Aset Lain-Lain | **Beku** — akumulasi lama tetap tampil, tapi tidak ada beban baru |

**Catatan penting:**
- **Tanah, ATL, dan KDP tidak pernah disusutkan.** Kalau user tanya "kenapa tanah
  saya tidak muncul di laporan penyusutan?", jawabannya: karena tanah memang tidak
  disusutkan sesuai aturan.
- **Aset Lain-Lain (1.5.4) dibekukan**: penyusutan berhenti. Kalau barang direklas
  KELUAR dari 1.5.4 (mis. difungsikan lagi), penyusutan bisa hidup kembali.
- KDP tidak disusutkan karena masih dalam pengerjaan; setelah selesai dan menjadi
  aset tetap (mis. Gedung), aset barunya baru mulai disusutkan.

---

## 4. Bagaimana penyusutan dihitung

### 4.1. Metode: garis lurus per semester

Penyusutan memakai **metode garis lurus** (nilai beban sama tiap semester). Rumus
dasarnya:

- **Masa manfaat** setiap golongan/jenis barang ditetapkan dalam **tahun** (mis.
  kendaraan 7 tahun). Di dalam perhitungan, tahun dikali 2 menjadi **jumlah
  semester** (7 tahun = 14 semester).
- **Beban per semester** = nilai perolehan ÷ jumlah semester.
- Tiap semester berlalu, sisa masa manfaat berkurang 1 semester, akumulasi
  penyusutan bertambah sebesar beban, dan nilai buku berkurang.
- **Nilai buku** = nilai perolehan − akumulasi penyusutan.

### 4.2. Pembulatan

Beban dibulatkan ke **rupiah penuh**. Selisih akibat pembulatan "diserap" di
**semester terakhir**: saat masa manfaat habis, nilai buku dipaksa menjadi **0**
(barang habis disusutkan). Jadi tidak ada sisa recehan yang menggantung.

### 4.3. Kapan penyusutan dimulai dan berhenti

- **Mulai**: pada semester barang diperoleh (atau dari saldo awal untuk barang
  lama).
- **Berhenti** saat: barang dihapus, direklas jadi Aset Lain-Lain, diserap ke
  induk lewat kapitalisasi, atau masa manfaatnya sudah habis (nilai buku 0).
- **Lanjut lagi** kalau ada pembatalan (mis. Pembatalan Penghapusan).

### 4.4. Intrakomptabel vs Ekstrakomptabel

- Barang dengan nilai **≥ batas kapitalisasi** golongannya = **intrakomptabel**
  (masuk neraca).
- Barang dengan nilai **< batas** = **ekstrakomptabel**.
- **Keduanya sama-sama disusutkan** dengan aturan yang persis sama.
- Bedanya hanya di **laporan**: neraca menampilkan yang intrakomptabel saja
  (filter default). Jadi "intra vs ekstra" itu urusan pengelompokan laporan,
  bukan cara menghitungnya.

### 4.5. Di mana user melihat hasilnya

Menu **Penyusutan** menampilkan jadwal/hasil penyusutan per barang per periode
(nilai buku awal, beban, akumulasi, nilai buku akhir, sisa masa manfaat).
Angka-angka ini dihasilkan oleh "engine" yang memutar ulang riwayat tiap barang.

---

## 5. Peta menu aplikasi

```
Dashboard
RKBMD                         → perencanaan kebutuhan BMD
Saldo Awal
  ├─ Rekapitulasi             → saldo awal 2025 (beku), rekap per golongan
  └─ Daftar Barang Awal       → daftar barang saldo awal
Pembukuan
  ├─ Cara Perolehan (barang MASUK — perlu persetujuan)
  │   ├─ Pengadaan
  │   ├─ Hibah
  │   ├─ Tukar Menukar
  │   ├─ Hasil Inventarisasi
  │   └─ Perolehan Lainnya
  └─ Pengelolaan (perubahan sepanjang umur barang)
      ├─ Penggunaan           → penetapan status penggunaan + terima antar-SKPD
      ├─ Penerimaan Internal
      ├─ Pengeluaran Internal
      ├─ Pemanfaatan
      ├─ Pengamanan           → dokumen/bukti pengamanan
      ├─ Reklasifikasi        → pindah kode/golongan/komptabel
      ├─ Koreksi              → koreksi nilai/spesifikasi/duplikat
      ├─ Kapitalisasi         → penambahan nilai & masa manfaat
      └─ Penghapusan          → barang KELUAR (termasuk pengalihan antar-SKPD)
Daftar Barang                 → register seluruh barang aktif
Penyusutan                    → hasil hitung penyusutan per periode + Jalankan Engine
Pelaporan
  ├─ Laporan Perolehan (per cara perolehan)
  ├─ Laporan Pengelolaan (per jenis kegiatan)
  ├─ Laporan BMD             → laporan gabungan
  └─ KIBAR                   → Kartu Inventaris Barang
Inventarisasi / WasDal / IPA / GIS BMD
Admin (SKPD, Pegawai, User, Satuan, Kodefikasi, Overhaul Band,
       Standar Harga, Tutup Tahun, Broadcast)
```

---

## 6. Alur kerja per kegiatan (cara kerja pembukuannya)

### 6.1. Cara Perolehan (barang masuk) — pakai PERSETUJUAN

Menu **Cara Perolehan** (Pengadaan, Hibah, Tukar Menukar, Hasil Inventarisasi,
Perolehan Lainnya) mencatat barang yang **baru masuk**. Alurnya bertingkat karena
butuh persetujuan sebelum resmi masuk buku besar:

1. **Operator input** barang → tersimpan sebagai **draft** dalam sebuah "kartu"
   (jurnal), berstatus **menunggu persetujuan (pending)**. Pada tahap ini barang
   **belum masuk** buku besar dan **belum muncul** di Daftar Barang/Penyusutan.
2. Selama masih draft, barang bebas **diedit, dihapus, diubah kuantitasnya** —
   karena belum menyentuh buku besar.
3. **Admin/pengurus barang menyetujui (approve)** → barulah barang resmi dicatat:
   dibuat di daftar aset + baris buku besar. Setelah ini barang muncul di Daftar
   Barang, Penyusutan, dan Laporan.
4. Saat disetujui, **tanggal perolehan** yang dipakai adalah **tanggal BAST /
   serah terima** (bukan tanggal kontrak, bukan tanggal approve).
5. Klasifikasi intra/ekstrakomptabel **dihitung otomatis** saat disetujui (nilai
   barang dibanding batas kapitalisasi golongannya).

**Kunci total setelah disetujui:** kontrak yang sudah disetujui bersifat
**read-only**. Untuk mengubahnya, admin harus **"Buka Kunci" (unapprove)** →
barang ditarik kembali jadi draft → diedit → **disetujui ulang**.

**Import Excel** untuk perolehan **juga lewat jalur persetujuan yang sama** — tidak
langsung masuk buku besar. Barang dari Excel ditampung sebagai draft, dikelompokkan
per No. Dokumen/BAST (1 dokumen = 1 kartu).

**Pengadaan Konstruksi (KDP)**: satu kontrak konstruksi bisa berisi beberapa
barang KDP (mis. paket jalan → beberapa ruas), masing-masing dengan rincian
pembayaran termin sendiri. Persetujuan/buka-kunci berlaku **serentak per kontrak**
(semua barang sekaligus, tidak bisa sebagian).

### 6.2. Pengelolaan — perubahan sepanjang umur barang

Menu **Pengelolaan** mencatat berbagai peristiwa atas barang yang **sudah**
tercatat. Beberapa yang penting:

**Penggunaan** — penetapan status penggunaan barang. Termasuk **penerimaan
pengalihan antar-SKPD** (sisi barang masuk ke SKPD tujuan).

**Kapitalisasi** — menambah nilai barang karena rehab/renovasi besar, yang bisa
**memperpanjang masa manfaat**. Cara kerjanya:
- Nilai rehab dibanding nilai perolehan (dalam persen) → menentukan "band
  overhaul" → menentukan tambahan tahun masa manfaat (dibatasi masa manfaat
  maksimum golongan).
- Nilai perolehan dan nilai buku bertambah sebesar nilai rehab; beban per semester
  dihitung ulang atas sisa umur yang baru.
- "Barang anak" (komponen yang diserap ke induk) berhenti disusutkan sendiri;
  penyusutannya menyatu ke induk.

**Reklasifikasi** — memindahkan barang ke kode/golongan lain. Ada tiga rasa:
- **Kesalahan Kodefikasi** (`reklas_kode`): koreksi kode yang salah sejak awal —
  bersifat **retroaktif** (dihitung ulang seolah kodenya sudah benar dari dulu).
- **Perubahan Fungsi BMD** (`reklas_golongan`): barang benar-benar berubah fungsi
  (mis. KDP selesai jadi Gedung) — bersifat **mulai baru (fresh start)** sejak
  tanggal reklas, masa manfaat direset penuh.
- **Reklasifikasi Komptabel**: memindah barang antara intra/ekstra — **tidak
  mengubah perhitungan**, murni pindah keranjang laporan.

**Koreksi**:
- **Koreksi Nilai**: menambah/mengurangi nilai perolehan (delta); beban disebar
  ulang ke sisa umur.
- **Koreksi Spesifikasi**: mengubah data deskriptif (nama, merek, no. rangka,
  dokumen kepemilikan, dll.) — tanpa efek ke perhitungan.
- **Koreksi Pencatatan Ganda (Duplikat)**: menggabungkan barang yang tercatat
  dobel; yang bukan "penyintas" di-soft-delete.

**Penghapusan** — barang keluar. Ada tiga jenis (lihat 6.3).

### 6.3. Penghapusan dan Pengalihan antar-SKPD

Menu **Penghapusan** punya tiga jenis peristiwa "barang keluar":

1. **Penghapusan — Pemindahtanganan** (dijual/dihibahkan keluar/dll.).
2. **Penghapusan — Sebab Lain** (hilang, rusak berat, dll.).
3. **Pengalihan Status Penggunaan** (transfer ke SKPD lain).

Dua yang pertama = barang keluar permanen (soft-delete, penyusutan berhenti).

**Pengalihan Status (transfer antar-SKPD)** cara kerjanya:
- SKPD asal membuat kartu pengalihan (ber-SK, wajib pilih SKPD tujuan) → barang
  jadi **draft menunggu diterima**. Buku besar & kepemilikan belum berpindah.
- SKPD tujuan **menerima** di menu **Penggunaan** → barulah kepemilikan berpindah
  dan tercatat. Tanggal resmi = **tanggal SKPD tujuan menekan "Terima"** (bukan
  tanggal dokumen).
- Setelah diterima, **hanya SKPD penerima** yang bisa mengembalikan barang (tombol
  "Kembalikan"). SKPD asal tidak bisa apa-apa lagi (satu pintu).
- Pengalihan **tidak mengubah angka penyusutan** — barang cuma pindah pemegang.
  Kepemilikan bersifat **per periode** (laporan periode lampau tetap menunjukkan
  pemegang saat itu).

### 6.4. Kartu ber-SK (No SK/Dokumen + tanggal + daftar barang)

Menu yang punya "kartu jurnal" ber-No SK (Penghapusan, Kapitalisasi, Pengalihan,
dll.) mengikuti aturan edit ini:
- **Boleh** ganti No SK / tanggal **selama tetap di semester yang sama**.
- **Tidak boleh** pindah semester lewat edit → harus **batalkan & entry ulang**.
  Alasannya: melindungi periode yang mungkin sudah dilaporkan ke atasan/BPK.

---

## 7. Tahun Buku dan Tutup Tahun (kunci tahun akuntansi)

Aplikasi mengunci data per **tahun akuntansi**:

- Tiap tahun punya status: **terbuka** (boleh menerima transaksi) atau **terkunci**
  (final/teraudit).
- **Dua larangan mutlak** untuk transaksi baru:
  1. Tanggal transaksi **tidak boleh di masa depan**.
  2. Tanggal transaksi **tidak boleh jatuh di tahun yang sudah terkunci** (kecuali
     beberapa transaksi koreksi/pembalik tertentu yang memang sengaja dicatat
     mundur ke tanggal aslinya, demi ketepatan perhitungan).
- Tahun yang belum didaftarkan dianggap **terkunci** (aman secara default).

**Tutup Tahun** (menu Admin) adalah aksi resmi menutup satu tahun:
- Syarat: tahun sudah benar-benar berakhir (lewat 31 Desember) dan **tidak ada
  lagi dokumen yang menggantung menunggu persetujuan** di tahun itu (kalau ada,
  penutupan **diblokir total** — harus diselesaikan dulu).
- Saat ditutup: sistem membuat **checkpoint** (foto saldo akhir tahun itu),
  mengunci tahun tersebut, dan membuka tahun berikutnya.
- Melihat data tahun terkunci **tetap boleh** — itu justru angka final. Yang
  dilarang hanya menulis transaksi baru bertanggal di tahun terkunci.

Halaman-halaman yang punya pemilih tahun menampilkan **banner info** kalau tahun
yang dipilih sudah terkunci (sifatnya pemberitahuan, bukan larangan melihat).

---

## 8. Peran (role) pengguna

- **Admin** — akses penuh; bisa menyetujui perolehan, menutup tahun, mengelola
  data referensi (SKPD, kodefikasi, dll.).
- **Pengurus Barang** — mengelola barang di lingkup SKPD-nya, termasuk menyetujui
  perolehan di sub-OPD-nya.
- **Pengurus Pembantu / Operator** — input transaksi di lingkup SKPD-nya; akses
  admin terbatas (hanya lihat Kodefikasi & Dokumen Sumber).

Setiap pengguna hanya bisa melihat/menyentuh barang di lingkup SKPD-nya (dijaga di
tingkat database, bukan sekadar tampilan). Chatbot pun harus menghormati batasan
ini kalau nanti diberi akses data.

---

## 9. Glosarium istilah

| Istilah | Arti |
|---------|------|
| **BMD** | Barang Milik Daerah |
| **SKPD/OPD** | Satuan/Organisasi Perangkat Daerah (instansi pemegang barang) |
| **Buku besar (ledger)** | Kumpulan seluruh baris transaksi barang; hanya-tambah |
| **Transaksi** | Satu baris peristiwa atas barang (perolehan, penghapusan, dll.) |
| **Aset / barang** | Satu unit barang milik daerah |
| **Nilai perolehan** | Harga/nilai barang saat diperoleh |
| **Nilai buku** | Nilai perolehan − akumulasi penyusutan |
| **Akumulasi penyusutan** | Total beban penyusutan sampai periode tertentu |
| **Masa manfaat** | Umur ekonomis barang (dalam tahun) |
| **Beban penyusutan** | Penyusutan satu semester |
| **Periode** | Satuan waktu semesteran: `TAHUN-S1` / `TAHUN-S2` |
| **Saldo awal** | Foto saldo akhir 2025, titik nol perhitungan |
| **Soft-delete** | Menandai terhapus tanpa benar-benar menghapus data |
| **Approval / persetujuan** | Langkah verifikasi sebelum perolehan masuk buku besar |
| **Kapitalisasi** | Menambah nilai & masa manfaat karena rehab besar |
| **KDP** | Konstruksi Dalam Pengerjaan (belum selesai, belum disusutkan) |
| **KIBAR** | Kartu Inventaris Barang |
| **Intrakomptabel** | Barang bernilai ≥ batas kapitalisasi (masuk neraca) |
| **Ekstrakomptabel** | Barang bernilai < batas (tetap disusutkan, di luar neraca) |
| **Tutup Tahun** | Mengunci tahun akuntansi & membuat checkpoint saldo |
| **Engine** | Mesin hitung penyusutan yang memutar ulang riwayat barang |

---

## 10. Pertanyaan yang chatbot SERING salah (pahami baik-baik)

**T: Saya hapus barang tapi masih muncul di laporan periode lalu. Bug?**
J: Bukan bug. Penghapusan berlaku sejak periode penghapusan. Laporan periode
**sebelum** penghapusan tetap menampilkan barang itu karena saat itu barang memang
masih ada. Sistem menampilkan kondisi barang **per periode**.

**T: Kenapa saya tidak bisa mengedit/menghapus transaksi yang salah?**
J: Buku besar bersifat hanya-tambah demi jejak audit. Koreksi dilakukan dengan
**transaksi pembalik baru** (mis. Pembatalan Penghapusan), bukan mengubah baris
lama. Untuk perolehan yang sudah disetujui, gunakan **"Buka Kunci"** lalu edit dan
setujui ulang.

**T: Barang saya nilainya di bawah batas, kok tetap disusutkan?**
J: Benar, barang ekstrakomptabel (di bawah batas) **tetap disusutkan** dengan
aturan sama. Perbedaan intra/ekstra hanya untuk pengelompokan laporan/neraca.

**T: Tanah/KDP/ATL saya tidak muncul di menu Penyusutan.**
J: Memang tidak disusutkan. Tanah (1.3.1), Aset Tetap Lainnya (1.3.5), dan KDP
(1.3.6) tidak mengenal penyusutan.

**T: Masa manfaat 5 tahun kok sistem bilang 10?**
J: Di perhitungan, tahun dikonversi ke **semester** (×2). 5 tahun = 10 semester.
Di data induk tetap disimpan sebagai 5 tahun.

**T: Saya transfer barang ke SKPD lain tapi belum berpindah.**
J: Pengalihan baru resmi setelah **SKPD tujuan menerimanya** di menu Penggunaan.
Sebelum diterima, barang masih milik SKPD asal.

**T: Saya tidak bisa input transaksi bertanggal tahun lalu.**
J: Kemungkinan tahun itu sudah **terkunci** (sudah ditutup/teraudit). Transaksi
baru hanya boleh bertanggal di tahun yang masih terbuka dan tidak di masa depan.

**T: Kenapa Tutup Tahun saya ditolak?**
J: Biasanya karena masih ada dokumen perolehan yang **menunggu persetujuan** di
tahun itu, atau tahunnya belum benar-benar berakhir. Selesaikan dulu semua yang
pending.

**T: Setelah ubah data kodefikasi/standar, angka tahun lalu ikut berubah?**
J: Bisa terjadi kalau engine dijalankan ulang, KECUALI tahun itu sudah terkunci —
tahun terkunci dilindungi dan angkanya tidak akan tertimpa.
