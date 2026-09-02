'use client'
// Menu Pelaporan → Pengelolaan → Penggunaan (ledger `pengalihan_status`).
//
// Kerangka tiga tabnya DIPAKAI BERSAMA dengan menu Penerimaan Internal — lihat
// alasannya di kepala components/pelaporan/LaporanPerpindahan.tsx.
//
// ⚠️ Sejak 2026-08-31 halaman ini TIDAK lagi memakai `LaporanTransaksi` yang
// generik: ia butuh tiga tab (Daftar Transaksi · Rekap per SKPD · Format
// Permendagri IV.B.1.2–1.6) dan pemilih periode tahun-kerja, dua-duanya tak ada
// di komponen generik itu.
//
// Saringan `batal_pengalihan` yang dulu dipasang di sini pindah ke dalam
// komponennya (`saringBatal`) — dan di sana ia TERSCOPE ke aset yang memang
// ditanya, bukan menyapu seluruh ledger seperti versi lama.
import LaporanPerpindahan from '@/components/pelaporan/LaporanPerpindahan'

export default function Page() {
  return (
    <LaporanPerpindahan
      id="penggunaan"
      idLembar="penggunaan-pengalihan"
      jenis="pengalihan_status"
      judul="Laporan Penggunaan"
      deskripsi="BMD yang dialihkan antar SKPD (pengalihan status penggunaan)."
      filePrefix="Laporan_Penggunaan"
      // Menu ini tak punya menu pasangan yang membaca ledger yang sama, jadi
      // bawaannya menampilkan kedua arah.
      arahAwal="semua"
    />
  )
}
