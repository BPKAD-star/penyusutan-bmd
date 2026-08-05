# Design — Konvensi UI/UX Penyusutan BMD

> Konvensi tampilan & interaksi yang berlaku di seluruh halaman.
>
> **Peta seluruh dokumen: [README.md](README.md).**

## 1. Kerangka Halaman

- **Layout**: sidebar navigasi kiri (`components/Sidebar.tsx`, grup bersarang
  bisa dilipat) + top bar (`TopBar.tsx`: brand "BMD last game", badge
  "Tahun Kerja", user dropdown). Dirangkai `DashboardChrome.tsx`.
- **Bahasa**: seluruh UI berbahasa Indonesia, istilah resmi penatausahaan BMD
  (SKPD, NIBAR, intra/ekstrakomptabel, KIB, dst.).
- **Styling**: Tailwind utility + beberapa kelas komponen ringkas (`card`,
  `btn-primary`, `btn-secondary`, `table-td`). Tidak ada UI library eksternal.

## 2. Pola Interaksi Baku

### 2.1 Filter → Tombol proses → Hasil
Halaman daftar/laporan selalu: kartu **"Filter data"** full-width (SKPD via
`SkpdCombobox`/`OrgFilter`, periode tahun+semester, filter lain) → tombol aksi
eksplisit (**Tampilkan** / **Proses**) → hasil di kartu terpisah. Data TIDAK
di-fetch otomatis saat filter berubah — operator yang menekan tombol.
Filter yang sudah diterapkan disimpan sebagai state `applied` (bukan membaca
state filter live) supaya hasil tidak "bergeser" saat operator mengubah filter
sebelum menekan tombol lagi.

### 2.2 Kartu jurnal ber-SK
Menu pembukuan menampilkan **kartu per dokumen** (No SK/BAST + tanggal +
daftar barang), pola `jurnal_header`. Edit No SK/tanggal inline di kartu
(dibatasi semester yang sama); pembatalan per baris atau per kartu dengan
tombol 🗑/⏹ + konfirmasi.

### 2.3 Edit spesifikasi = selalu popup
Field spesifikasi banyak dan berbeda per golongan → edit lewat modal
(`EditSpesifikasiModal`), dipicu dari checklist baris + satu tombol "Edit
Spesifikasi". **Jangan** menaruh form spesifikasi inline di baris tabel.
Centang lintas golongan menonaktifkan tombol (kolomnya beda).

### 2.4 Picker berjenjang
- SKPD: combobox pohon (`SkpdCombobox`), bisa `rootOnly` / `lockToOperator`.
- Wilayah: `WilayahPicker` (Provinsi→Kab→Kec→Desa).
- Koordinat: `MapPicker` (Leaflet, dynamic import ssr:false).
- Barang: `AsetPicker` dengan filter eligible-only per menu (mis. golongan
  yang boleh dimanfaatkan/diamankan) — barang tak-eligible tidak ditampilkan,
  bukan ditampilkan-lalu-ditolak.

## 3. Menampilkan Keadaan (state)

### 3.1 Error — WAJIB terlihat
Kegagalan query ditampilkan sebagai **banner merah** (`card border-red-200
bg-red-50 …`) di atas area hasil, berisi pesan asli + kalimat penjelas +
instruksi ("Coba Proses lagi; kalau berulang, kabari admin"). Halaman
laporan/daftar bersifat **fail-closed**: saat error, data dikosongkan — tidak
pernah menampilkan hasil separuh. Loading pakai `finally`, jadi tombol tidak
pernah beku di "Memuat...". (Latar insiden: [rules.md](rules.md) §2.)

### 3.2 Loading & kosong
- Tombol proses berubah label ("Memuat...") + `disabled`.
- Belum ada filter diterapkan → kartu abu-abu berisi instruksi ("Atur filter
  lalu klik Proses").
- Hasil kosong yang SAH tampil "0 barang" dengan konteks filter — bisa
  dibedakan dari error karena error selalu ber-banner.

### 3.3 Badge & penanda
- Badge "Tahun Kerja YYYY" di top bar; banner info `TahunTerkunciNote` di
  halaman ber-pemilih tahun ketika tahun terpilih terkunci (informatif, bukan
  larangan).
- Status per baris: "Selesai" (pemanfaatan), "Dikembalikan" (pengamanan &
  pengalihan), 🔒 (baseline terkunci), "N bidang · luas belum lengkap" (tanah).
- **Penanda ⚠ kode register** (Daftar Barang, baris `REG` di bawah NIBAR):
  nyala kuning hanya kalau posisi barang **bergeser** dari NIBAR-nya. Tiga
  keadaan, dan yang ketiga sering dilupakan:
  | Keadaan | Tampilan |
  |---|---|
  | Sama dengan NIBAR | abu-abu pucat, tanpa tanda |
  | Bergeser (pernah pindah/reklas) | kuning + ⚠ |
  | **Tak bisa dinilai** (NIBAR kosong / warisan e-BMD yang susunannya beda) | abu-abu, **tanpa tanda** |

  "Tak bisa dinilai" **bukan** "sama" — tapi juga tak boleh ditandai. Menandai
  149.960 barang warisan membuat 148 yang benar-benar bergeser tenggelam, dan
  penandanya jadi tak ada gunanya.
- **Tombol penghentian selalu SEPASANG** dengan warna & maksud yang beda:
  Akhiri/Kembalikan (kuning — peristiwa sah yang berakhir) vs 🗑 Batal (merah —
  salah catat, dianggap tak pernah terjadi). Konfirmasinya wajib menjelaskan
  bedanya, bukan cuma "Yakin?" — operator yang salah pilih meninggalkan jejak
  permanen. Lihat [rules.md](rules.md) §1.6.

## 4. Tabel & Data Besar

- Kolom per golongan didefinisikan sekali (mis. `COLS` di Daftar Barang).
  ⚠️ Saat ini daftarnya **masih disalin** ke halaman kembarnya (`BASE_COLS` di
  Daftar Barang Awal) dan cuma dijaga komentar "ubah satu, samakan yang lain".
  **Itu utang desain, bukan konvensi yang boleh ditiru** — [CODING-STANDARD.md](CODING-STANDARD.md)
  §1.2 mewajibkan aturan integritas diekstrak sejak kemunculan **kedua**, dan
  penyatuannya sudah dijadwalkan di [REFACTOR-PLAN.md](REFACTOR-PLAN.md) 2.3.
  Selama belum disatukan: ubah satu, samakan yang lain. Kalau kamu menambah
  pasangan kembar **baru**, ekstrak — jangan menyalin lagi.
- Golongan tak-disusutkan tidak diberi kolom penyusutan sama sekali (pakai
  flag `disusutkan` di `GOLONGAN_REKAP`, jangan hardcode daftar golongan).
- Paginasi tampilan: ≤ 3.000 baris tampil semua, lebih → per halaman.
  Data besar dipaginasi **di server** bila tidak butuh replay period-aware.
- Angka uang diformat `Intl.NumberFormat('id-ID')`, tanpa desimal.
- Export Excel per halaman; laporan audit (BPK) punya export terpisah dengan
  kolom jejak penghapusan. Export ikut dibungkus try/catch — file setengah
  jadi tidak boleh terunduh.

## 5. Drill-down Laporan

Angka agregat yang bisa ditelusuri dibuat **klik-able** → modal rincian
(pola LRA & Rekonsiliasi: `RekonDetailModal`) berisi baris transaksi
pembentuknya + kolom posisi penyusutan. Rincian dihitung **dari array yang
sama** dengan agregatnya (satu sumber, bukan query kedua) supaya angka popup
pasti sama dengan angka tabel. Data tambahan (posisi penyusutan) di-fetch saat
diklik, bukan diprefetch.

## 6. Dokumen Cetak

Halaman cetak terpisah di `app/cetak/*` (mis. KIR A4 landscape), menerima
query param (`?ruangan=` / `?skpd=`), page-break per unit, blok tanda tangan
mengikuti format resmi (nama pejabat di-snapshot saat penetapan agar dokumen
yang sudah dicetak tetap sesuai arsip fisik). Foto/berkas dari bucket privat
selalu lewat signed URL.

## 7. Keputusan Desain yang Disengaja (jangan "dirapikan")

- Filter tahun/semester dikelola **per halaman**, bukan context global —
  refactor besar 15+ halaman sengaja dihindari. Pilihan "Tahun Kerja" di login
  hanya default awal, bukan gerbang.
- Kotak pemilih "Lokasi / SKPD" di menu pengelolaan full-width (tanpa
  `max-w-3xl`).
- `uraian_barang` read-only (baku dari kodefikasi); `nama_barang` =
  "spesifikasi nama barang" yang bebas diisi — dua kolom berbeda, jangan
  disatukan.
- Tombol Tolak pada approval Pengadaan sudah dihapus (alur: edit draft lalu
  setujui); status `ditolak` dipakai ulang sebagai mekanisme **arsip**.
