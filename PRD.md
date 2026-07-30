# PRD — Aplikasi Penyusutan BMD Kabupaten Kediri

> Dokumen kebutuhan produk (Product Requirements Document).
> Dokumen pendamping: [architecture.md](architecture.md) · [design.md](design.md) ·
> [rules.md](rules.md) · [schema.md](schema.md) · CLAUDE.md (panduan agent/AI).

## 1. Latar Belakang & Tujuan

Pemerintah Kabupaten Kediri (BPKAD) membutuhkan sistem penatausahaan **Barang
Milik Daerah (BMD)** yang:

1. Menghitung **penyusutan semesteran** seluruh aset tetap secara otomatis,
   period-correct, dan dapat direplay/diaudit.
2. Menjadi **register barang** per SKPD (± 700 unit organisasi, ratusan ribu
   aset) dengan pembagian wewenang berjenjang.
3. Menghasilkan **laporan resmi** (Laporan BMD, Rekonsiliasi, KIBAR, KIR, LHI)
   yang angkanya konsisten satu sama lain dan siap diserahkan ke
   inspektorat/BPK.

Aplikasi ini adalah *shadow-ledger* internal: melengkapi (bukan menggantikan)
sistem e-BMD provinsi. Baseline data = saldo akhir 2025 hasil import e-BMD.

**Prinsip tertinggi: integritas data di atas segalanya.** Data yang dikelola
adalah data LIVE pemerintah daerah; angka salah yang tampil sah jauh lebih
berbahaya daripada halaman yang menolak tampil (fail-closed).

## 2. Pengguna & Peran

| Peran | Nilai di DB | Wewenang |
|---|---|---|
| Pengelola Barang (Admin Pemda / BKAD) | `admin` | Semua SKPD; approve semua jurnal; menu Admin; Tutup Tahun; jalankan engine |
| Pengurus Barang (SKPD induk) | `pengurus_barang` | Subtree SKPD-nya; approve jurnal Cara Perolehan milik sub-OPD **strict di bawahnya** (bukan node sendiri, bukan kartu buatannya sendiri) |
| Pengurus Barang Pembantu (sub-OPD) | `pengurus_pembantu` | Baca-tulis di subtree-nya, tanpa hak approve |
| Pengawas | `pengawas` | View-only lintas SKPD (inspektorat dsb.) |

Penegakan wewenang **di database** (RLS + trigger + RPC SECURITY DEFINER);
UI hanya cerminan (menyembunyikan tombol).

## 3. Ruang Lingkup Fungsional

### 3.1 Saldo Awal (baseline 2025 — beku)
- Rekapitulasi & Daftar Barang Awal dari `aset_awal_2026` (foto saldo akhir
  2025). **Angka beku**; hanya kolom spesifikasi yang boleh dikoreksi, itu pun
  hanya untuk barang yang belum pernah "bergerak" (dikunci trigger).

### 3.2 Pembukuan
- **Cara Perolehan** (Pengadaan, Hibah, Tukar Menukar, Hasil Inventarisasi,
  Perolehan Lainnya, + Konstruksi/KDP multi-barang): pola **draft → approve**.
  Barang ditampung sebagai draft di `jurnal_header.payload.draft_items`; ledger
  & register baru ditulis saat admin menyetujui. Import Excel ikut alur yang
  sama. Ada pemisahan tugas: pembuat kartu tidak boleh menyetujui kartunya
  sendiri.
- **Pengelolaan**: Penggunaan (pengalihan status antar SKPD, dengan persetujuan
  SKPD tujuan), Penerimaan/Pengeluaran Internal (mutasi antar sub-unit),
  Pemanfaatan (sewa/pinjam pakai/KSP/BGS-BSG/KSPI), Pengamanan (kustodi
  pegawai ber-BAST + Pakta Integritas), Reklasifikasi, Koreksi (nilai/
  spesifikasi/pencatatan ganda), Kapitalisasi (rehab + serap anak, band
  overhaul), Penghapusan (pemindahtanganan / sebab lain), Pemecahan.
- **KIR**: penempatan fisik barang per ruangan (administratif, non-ledger).
- **LRA**: rekonsiliasi belanja modal vs realisasi anggaran.
- Setiap pencatatan = **transaksi baru di ledger append-only**; pembatalan =
  transaksi pembalik (`batal_*`), tidak pernah menghapus baris.

### 3.3 Register & Penyusutan
- **Daftar Barang** per jenis aset: period-aware (barang yang dihapus di
  semester depan tetap tampil saat melihat semester lalu; kepemilikan SKPD
  mengikuti periode), export Excel + export Audit (termasuk barang terhapus,
  untuk BPK).
- **Kode Register** — identitas 45 digit yang mengikuti **posisi terakhir**
  barang (SKPD, tahun masuk SKPD, kode barang, intra/ekstra), berdampingan
  dengan **NIBAR** yang beku sejak barang masuk. Analoginya: NIBAR akta lahir,
  kode register KTP. Diterbitkan & dibekukan otomatis oleh DB — barang yang
  posisinya bergeser dari akta lahirnya ditandai di Daftar Barang, supaya
  pengurus barang bisa menelusuri riwayat pindah/reklas.
- **Penyusutan**: hasil engine per aset per semester; tombol "Jalankan Engine"
  (admin). Ekstrakomptabel **ikut disusutkan**; pemisahan intra/ekstra hanya
  di lapisan laporan.
- **GIS Tanah** (bidang tanah + peta) dan **Kendaraan**: register golongan
  tunggal dengan detail spesifik.

### 3.4 Pelaporan
- Laporan Perolehan & Pengelolaan per menu; **Laporan BMD** (Model 3 dkk.);
  **Rekonsiliasi BMD** (Berita Acara: saldo awal → mutasi tambah/kurang →
  saldo akhir, per golongan × intra/ekstra, dengan drill-down rincian
  transaksi + posisi penyusutan per barang); **KIBAR**; **KIR**; semua bisa
  export Excel. Modul pelaporan **fail-closed**: jika satu query gagal,
  laporan menolak tampil.

### 3.5 Modul Penunjang
- **RKBMD** (perencanaan kebutuhan), **Inventarisasi** (LKI per golongan →
  Validasi → LHI), **WasDal**, **IPA** (indeks pengelolaan aset), **Tahun
  Buku** (kunci tahun akuntansi + Tutup Tahun dengan checkpoint), **Admin**
  (SKPD, pegawai, kodefikasi, wilayah, rekening, usulan pengurus, dst.).

## 4. Aturan Bisnis Kunci

- Periode = **semesteran**: `YYYY-S1` (Jan–Jun) / `YYYY-S2` (Jul–Des).
- Masa manfaat disimpan dalam **tahun**; engine mengonversi ke semester (×2).
- Golongan yang tidak disusutkan: Tanah 1.3.1, ATL 1.3.5, KDP 1.3.6;
  golongan 1.5.4 (Aset Lain-Lain) **beku** (tidak akrual).
- Tahun terkunci menolak transaksi bertanggal di dalamnya (kecuali whitelist
  `batal_*` retroaktif); tanggal masa depan selalu ditolak.
- Klasifikasi intra/ekstra otomatis dari nilai vs batas kapitalisasi kodefikasi.
- NIBAR digenerate saat approve (bukan dari input/Excel).
- Daftar lengkap aturan yang tidak boleh dilanggar: [rules.md](rules.md).

## 5. Non-Goals (di luar lingkup)

- Bukan pengganti e-BMD provinsi; tidak ada integrasi dua arah otomatis.
- Tidak ada penghapusan fisik data (hard delete) dari ledger/register.
- Amortisasi ATB tidak dipisah dari mekanisme masa manfaat biasa.
- Multi-pemda / multi-tenant: satu instance = satu kabupaten.

## 6. Kriteria Keberhasilan

1. Angka Rekonsiliasi = angka halaman Penyusutan = angka Laporan BMD untuk
   periode & scope yang sama (tie-out).
2. Semua halaman berat tetap responsif (< timeout 8 dtk) pada skala saat ini
   (± 418rb baris aset & ledger) — termasuk sebagai pengurus barang SKPD
   terbesar, bukan hanya admin.
3. Setiap kegagalan query **terlihat** oleh operator (banner error), tidak
   pernah tampil sebagai "0 barang" palsu atau halaman beku.
4. Seluruh riwayat perubahan aset dapat direkonstruksi dari ledger (auditable).
