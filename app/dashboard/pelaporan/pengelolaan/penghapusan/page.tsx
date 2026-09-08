'use client'
// Menu Pelaporan → Pengelolaan → Penghapusan.
//
// ⚠️ Sejak 2026-09-07 halaman ini TIDAK lagi memakai `LaporanTransaksi` yang
// generik: ia butuh penyaring ALASAN penghapusan (pemindahtanganan · pengalihan
// status · sebab lain) di atas tiga tab — Daftar Transaksi · Rekap per SKPD ·
// Format Permendagri IV.K.1/2/6 — dan komponen generik itu tak punya satu pun.
//
// ⚠️ Dua hal yang IKUT pindah & gampang tertinggal — lihat kepala
// components/pelaporan/LaporanPenghapusan.tsx:
//   1. penyaringan barang yang penghapusannya sudah DIBATALKAN. Versi lama
//      memakai `efektifPerAsetStatus="dihapus"` (barang yang statusnya SEKARANG
//      masih dihapus); penggantinya menyaring `batal_penghapusan` lewat
//      `fetchBatalTargets` yang TERSCOPE — menjawab pertanyaan yang sama dengan
//      cara yang sepakat dgn seluruh modul pelaporan lain.
//   2. cabang PENGALIHAN STATUS, yang di versi lama tak pernah masuk laporan ini
//      sama sekali (`jenisList` cuma memuat dua jenis `penghapusan_*`) padahal
//      Permendagri memberinya lembar sendiri, IV.K.2.
import LaporanPenghapusan from '@/components/pelaporan/LaporanPenghapusan'

export default function Page() {
  return <LaporanPenghapusan />
}
