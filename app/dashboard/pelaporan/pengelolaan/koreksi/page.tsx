'use client'
// Menu Pelaporan → Pengelolaan → Koreksi.
//
// ⚠️ Sejak 2026-09-07 halaman ini TIDAK lagi memakai `LaporanTransaksi` yang
// generik: ia butuh tiga tab (Daftar Transaksi · Rekap per SKPD · Format
// Permendagri IV.G.2–G.7), dan komponen generik itu tak punya satu pun.
//
// ⚠️ Dua hal yang IKUT pindah & gampang tertinggal — lihat kepala
// components/pelaporan/LaporanKoreksi.tsx:
//   1. saringan `batal_koreksi_*`, kini TERSCOPE ke aset yang ditanya;
//   2. penyaring "Asal baris" berbawaan `menu`, supaya 200 baris
//      `koreksi_pencatatan_ganda` hasil batch SQL admin tak ikut tampil
//      (keputusan user 2026-09-07).
//
// ⚠️ Kepindahan ini juga menutup cacat lama: `LaporanTransaksi` menyaring SKPD
// lewat `skpd_asal`/`skpd_tujuan`, dan baris koreksi tak punya kedua kolom itu —
// jadi memilih SKPD di menu lama menghasilkan 0 transaksi yang kelihatan sah.
import LaporanKoreksi from '@/components/pelaporan/LaporanKoreksi'

export default function Page() {
  return <LaporanKoreksi />
}
