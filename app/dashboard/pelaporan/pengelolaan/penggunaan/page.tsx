'use client'
// Menu Pelaporan → Pengelolaan → Penggunaan.
//
// ⚠️ Sejak 2026-08-31 halaman ini TIDAK lagi memakai `LaporanTransaksi` yang
// generik: ia butuh tiga tab (Daftar Transaksi · Rekap per SKPD · Format
// Permendagri IV.B.1.2–1.6) dan pemilih periode tahun-kerja, dua-duanya tak ada
// di komponen generik itu — dan menambahkannya ke sana akan mengubah enam menu
// Pengelolaan lain yang belum diminta berubah. Alasan lengkapnya di kepala
// components/pelaporan/LaporanPenggunaan.tsx.
//
// Saringan `batal_pengalihan` yang dulu dipasang di sini pindah ke dalam
// komponennya (`saringBatal`) — dan di sana ia TERSCOPE ke aset yang memang
// ditanya, bukan menyapu seluruh ledger seperti versi lama.
import LaporanPenggunaan from '@/components/pelaporan/LaporanPenggunaan'

export default function Page() {
  return <LaporanPenggunaan />
}
