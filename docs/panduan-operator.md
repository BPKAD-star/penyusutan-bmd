# Panduan Pengurus Barang — Aplikasi BMD Kabupaten Kediri

> Untuk **pengurus barang dan operator SKPD** yang memasukkan data ke aplikasi
> ini. Boleh dicetak dan dibagikan.
>
> Isinya bukan cara mengklik tombol — itu sudah kelihatan di layar. Isinya
> **enam hal yang kalau salah, susah atau tidak bisa diperbaiki**, dan sudah
> pernah benar-benar salah.

---

## Cara membaca panduan ini

Ada satu gagasan yang mendasari seluruh aplikasi ini, dan kalau gagasan itu
sudah dipegang, sisanya masuk akal sendiri:

> **Aplikasi ini menyimpan RIWAYAT, bukan cuma keadaan sekarang.**

Bedanya begini. Kalau aplikasi hanya menyimpan keadaan sekarang, salah ketik
tinggal dihapus lalu diketik ulang, dan tidak ada yang tahu. Aplikasi ini
tidak begitu: **setiap kejadian dicatat dan catatannya tidak pernah dibuang.**
Barang yang dihapus tetap punya jejak kapan dan dengan surat apa ia dihapus.

Itu bukan kerepotan yang dibuat-buat — itu justru gunanya. Kalau nanti
inspektorat atau BPK bertanya "barang ini ke mana perginya", jawabannya harus
bisa ditunjukkan, bukan diingat-ingat.

Konsekuensinya untuk Bapak/Ibu: **memperbaiki kesalahan bukan dengan menghapus,
tapi dengan mencatat koreksinya.** Enam bab di bawah semuanya berangkat dari
sana.

---

## 1. BATAL ≠ AKHIRI ≠ KEMBALIKAN

**Ini bab yang paling penting.** Salah pilih di sini meninggalkan jejak
permanen, dan jejaknya ikut terbaca di laporan.

Beberapa menu punya dua tombol yang sekilas mirip — sama-sama "menghentikan":

| Menu | Tombol A | Tombol B |
|---|---|---|
| Pemanfaatan | ⏹ **Akhiri** | 🗑 **Batal** |
| Pengamanan | ⤺ **Kembalikan** | 🗑 **Batal** |
| Pengalihan Status | **Kembalikan** | 🗑 **Batal** |
| Penghapusan | — | **Batal Penghapusan** |

Keduanya **bukan** pilihan selera. Keduanya menjawab pertanyaan yang berbeda:

### Akhiri / Kembalikan — "peristiwanya BENAR, dan sekarang sudah selesai"

Pakai ini kalau kejadiannya **memang terjadi**, lalu berakhir.

> Gedung disewakan ke Bank Jatim tiga tahun. Masa sewanya habis, atau
> diakhiri lebih awal. → **Akhiri.**
>
> Laptop diserahkan ke Pak Budi lewat BAST. Pak Budi pindah tugas dan
> mengembalikan laptopnya. → **Kembalikan.**

Yang terjadi: barangnya **tetap tampil** dengan keterangan "Selesai" atau
"Dikembalikan". Riwayatnya utuh — kalau nanti ditanya "gedung ini pernah
disewakan ke siapa saja", jawabannya masih ada.

### Batal — "peristiwanya SALAH CATAT, tidak pernah terjadi"

Pakai ini **hanya** kalau Bapak/Ibu salah memasukkan data.

> Waktu mencatat sewa gedung, yang tercentang gedung nomor 12 padahal yang
> disewa gedung nomor 21. → **Batal** untuk yang nomor 12, lalu catat yang
> benar.
>
> BAST pengamanan salah pilih pegawai. → **Batal**, lalu buat lagi.

Yang terjadi: barangnya **hilang total** dari kartu itu, seolah tidak pernah
dicatat. Kalau kartunya jadi kosong, kartunya ikut hilang.

### Kenapa tidak boleh tertukar

**Kalau salah catat lalu ditekan "Akhiri":** di kartu dan di laporan akan
tercatat selamanya bahwa gedung nomor 12 **pernah disewakan** lalu selesai.
Padahal tidak pernah. Laporan pemanfaatan jadi menyebut perjanjian yang tidak
ada.

**Kalau memang sudah selesai lalu ditekan "Batal":** seluruh riwayat sewanya
lenyap. Padahal uang sewanya masuk, perjanjiannya ada, arsipnya ada di lemari.
Kertas dan layar jadi tidak cocok.

### Satu aturan tambahan: Batal hanya untuk kejadian TERAKHIR

Kalau setelah kejadian yang mau dibatalkan barang itu sudah mengalami hal lain
(dipindah, direklas, dikapitalisasi, dihapus), tombol Batalnya **akan ditolak
aplikasi**. Itu bukan gangguan — membatalkan kejadian di tengah membuat urutan
riwayatnya patah, dan perhitungan penyusutannya ikut kacau.

**Cara mengatasinya:** batalkan dulu kejadian yang paling baru, mundur satu per
satu sampai sampai ke yang mau dibatalkan.

> ### Kalau ragu, jangan menebak
> Tanya dulu. **Salah pilih di sini tidak bisa dibatalkan dengan menekan tombol
> yang satunya** — yang muncul justru dua catatan yang saling bertentangan.

---

## 2. Barang baru belum langsung muncul — dan itu memang disengaja

Untuk menu **Cara Perolehan** (Pengadaan, Hibah Masuk, Tukar Menukar, Hasil
Inventarisasi, Perolehan Lainnya), alurnya:

```
   Bapak/Ibu isi kartu + daftar barang
                 ↓
        Kartu berstatus MENUNGGU PERSETUJUAN
                 ↓
        Diperiksa & disetujui
                 ↓
   Barang MUNCUL di Daftar Barang, Penyusutan, dan laporan
```

**Selama masih "Menunggu Persetujuan", barangnya belum ada di mana-mana.**
Bukan tersembunyi — memang belum tercatat. Jangan bingung kalau barang yang
baru diinput tidak ketemu di Daftar Barang.

**Justru di situ enaknya.** Selama belum disetujui, daftar barangnya **bebas
diubah**: tambah, hapus, ganti jumlah, betulkan spesifikasi, tempel foto. Tidak
ada bekas apa pun, karena belum ada yang tercatat.

**Sesudah disetujui, kartunya terkunci.** Untuk mengubahnya, admin harus
menekan **Buka Kunci** dulu → kartunya kembali jadi draft → dibetulkan →
disetujui ulang.

> **Karena itu: periksa baik-baik SEBELUM minta persetujuan.** Membetulkan
> sebelum disetujui itu gratis; sesudahnya berarti buka kunci dan menyetujui
> ulang.

### Nomor barang terbit saat disetujui

Nomor barang (NIBAR) **baru dibuatkan pada saat disetujui**, bukan saat
diinput. Kolom nomor di file Excel yang diimpor pun diabaikan — aplikasi
menerbitkan nomornya sendiri supaya tidak ada nomor kembar.

Kalau kartu dibuka kunci lalu disetujui ulang, **nomornya diterbitkan lagi
(nomor baru)**. Jadi kalau label barang sudah terlanjur dicetak, cetak ulang.

---

## 3. Yang membuat kartu tidak boleh menyetujui kartunya sendiri

Kalau tombol **Setujui** tidak muncul pada kartu yang Bapak/Ibu buat sendiri,
itu **bukan kerusakan aplikasi**.

Aturannya: **yang memasukkan data dan yang menyetujui harus orang yang
berbeda.** Ini prinsip pengendalian internal biasa — sama seperti bendahara
yang tidak menandatangani SPM-nya sendiri.

Kenapa perlu: sejak aplikasi mengizinkan pengurus barang mencatat atas nama
unit di bawahnya, tanpa aturan ini satu orang bisa mencatat barang **dan**
mengesahkannya sendiri, tanpa ada mata kedua sama sekali.

**Yang perlu dilakukan:** minta admin BPKAD atau pengurus barang di atasnya
untuk memeriksa dan menyetujui. Kalau ada yang perlu dibetulkan, mereka bisa
membetulkan draftnya dulu sebelum menyetujui.

---

## 4. Salah semester = batalkan dan input ulang, bukan ganti tanggal

Kartu ber-Nomor SK / Nomor Dokumen (Penghapusan, Kapitalisasi, Pengalihan,
Pemanfaatan, Pengamanan) menyimpan **periode**-nya:

- **Semester 1** = Januari sampai Juni
- **Semester 2** = Juli sampai Desember

Aturannya:

| Yang diubah | Boleh? |
|---|---|
| Nomor SK / nomor dokumen | ✅ boleh |
| Tanggal, **selama masih di semester yang sama** | ✅ boleh |
| Tanggal yang **pindah semester** (mis. 20 Juni → 3 Juli) | ❌ **ditolak** |

**Kenapa ditolak.** Angka semester yang sudah lewat kemungkinan besar sudah
dilaporkan ke pimpinan, inspektorat, atau BPK. Kalau tanggal boleh digeser
melewati batas semester, angka yang sudah dilaporkan itu **berubah sendiri di
belakang layar** — dan tidak ada satu pun tanda bahwa ia pernah berubah.

**Cara yang benar:** batalkan kartunya, lalu input ulang dengan tanggal yang
benar. Lebih repot, tapi jejaknya jelas: ada pembatalan, ada pencatatan baru.

### Dua tanggal yang juga selalu ditolak

- **Tanggal di masa depan.** Tanpa kecuali. Barang belum diterima berarti belum
  dicatat.
- **Tanggal di tahun yang sudah ditutup.** Kalau Tahun Buku 2026 sudah ditutup,
  tidak ada lagi pencatatan bertanggal 2026 — kecuali beberapa jenis
  pembatalan yang memang harus mundur ke tanggal aslinya.

---

## 5. Membaca layar: kapan angkanya boleh dipercaya

Ini bab pendek tapi jangan dilewati. Aplikasi ini sengaja dibuat **lebih baik
menolak menampilkan angka daripada menampilkan angka yang kurang.**

### "0 barang" — ini SAH

Kalau tabelnya kosong dan **tidak ada** kotak merah, artinya memang tidak ada
barang yang cocok dengan filter yang dipilih. Periksa lagi pilihan SKPD, jenis
aset, periode, dan kata kunci pencarian.

### Kotak MERAH — angkanya JANGAN dipercaya sama sekali

Kalau muncul kotak merah berisi pesan seperti *"gagal membaca …"*, artinya ada
bagian data yang tidak berhasil diambil. Aplikasi sengaja **tidak menampilkan
tabelnya** dan **tidak membuat file Excel-nya**.

> **Yang bahaya bukan angkanya salah — yang bahaya angkanya salah tapi
> kelihatan benar.** Tabel yang tampil dengan seratus baris hilang tidak
> kelihatan bedanya dari tabel yang lengkap. Karena itu aplikasi memilih
> menolak.

**Yang perlu dilakukan:**

1. Klik **Tampilkan** sekali lagi — sering kali cuma jaringan yang sedang lambat.
2. Kalau berulang, **kabari admin** dan **sebutkan bunyi pesan merahnya** —
   kalimat itu yang dipakai untuk melacak sebabnya.
3. **Jangan** memakai angka dari layar yang sedang ada kotak merahnya, dan
   jangan mengambil file Excel dari layar itu.

### Tombol yang tetap tertulis "Memuat…"

Kalau lebih dari satu menit tombolnya masih "Memuat…" dan tidak ada apa-apa
yang berubah, muat ulang halamannya (F5). Kalau berulang, kabari admin —
biasanya halaman yang berat sedang kelebihan beban.

---

## 6. NIBAR dan Kode Register — dua nomor, dua gunanya

Satu barang punya **dua nomor 45 digit** yang bentuknya mirip. Sering
tertukar, jadi mudahnya begini:

| | **NIBAR** | **Kode Register** |
|---|---|---|
| Ibaratnya | **Akta kelahiran** | **KTP** |
| Terbit | sekali, saat barang masuk | ikut berubah |
| Berubah kalau barang pindah unit? | **tidak pernah** | **ya** |
| Berubah kalau barang direklasifikasi? | **tidak pernah** | **ya** |
| Gunanya | menemukan kembali barang yang sama sepanjang hidupnya | menunjukkan **posisi barang sekarang** |

Kode register ikut berubah karena empat hal: pindah SKPD, ganti kode barang
(reklasifikasi), pindah intra/ekstrakomptabel, dan tahun masuk ke SKPD itu.

> ⚠️ **Perhatikan:** angka tahun di kode register adalah **tahun barang masuk
> ke SKPD itu**, *bukan* tahun perolehan barangnya. Mobil yang dibeli 2019 lalu
> dialihkan ke kecamatan pada 2026 akan berkode register bertahun **2026** di
> kecamatan — dan itu benar, bukan salah ketik.

### Yang mana yang ditulis di dokumen?

**Untuk saat ini: NIBAR.** Kartu yang dicetak aplikasi ini (KIR dan KIBAR)
masih memakai NIBAR, termasuk pada kolom yang berjudul "Nomor Register". Kode
register **belum** ikut tercetak di sana.

Kode register bisa dilihat di layar **Daftar Barang** dan **Penyusutan** (baris
kecil bertuliskan `REG …` di bawah nama barang), dan ikut di file Excel hasil
Export dua menu itu.

> **Kalau menyalin nomor ke BAST atau berita acara, pakai nomor yang sama
> dengan yang tercetak di kartu barangnya** — supaya kertas dan layar tidak
> bertengkar. Kalau ragu, tanya admin.

### Tanda ⚠ di sebelah kode register

Kalau di baris `REG …` ada tanda **⚠**, artinya: **barang ini posisinya sudah
tidak sama lagi dengan waktu ia pertama dicatat** — pernah pindah unit atau
pernah direklasifikasi.

**Itu keterangan, bukan peringatan kesalahan.** Barang yang memang pernah
dialihkan sudah seharusnya bertanda itu.

Kalau ada barang bertanda ⚠ padahal **setahu Bapak/Ibu tidak pernah pindah ke
mana-mana**, itu baru perlu dilaporkan — kemungkinan ada pencatatan pengalihan
atau reklasifikasi yang salah masuk.

Barang yang **tidak** bertanda apa-apa berarti salah satu dari dua: posisinya
memang belum pernah bergeser, atau nomornya warisan dari sistem lama sehingga
tidak bisa dibandingkan. Aplikasi sengaja tidak menandai yang tidak bisa
dinilai — kalau ditandai semua, yang benar-benar bergeser justru tenggelam.

---

## Ringkasan satu halaman

| Situasi | Yang benar |
|---|---|
| Kejadiannya benar, sekarang sudah selesai | **Akhiri / Kembalikan** |
| Salah catat, kejadiannya tidak pernah ada | **Batal** |
| Barang baru belum muncul di Daftar Barang | normal — tunggu **disetujui** |
| Mau membetulkan kartu yang sudah disetujui | minta admin **Buka Kunci** dulu |
| Tombol Setujui tidak muncul di kartu sendiri | normal — minta orang lain menyetujui |
| Tanggal salah, masih di semester yang sama | **edit tanggalnya** |
| Tanggal salah, pindah semester | **batalkan & input ulang** |
| Tabel kosong, tidak ada kotak merah | wajar — periksa filternya |
| Ada kotak **merah** | **jangan pakai angkanya**, kabari admin |
| Perlu menomori barang di dokumen | pakai nomor yang tercetak di kartunya |
| Ada tanda ⚠ padahal barang tak pernah pindah | laporkan ke admin |
