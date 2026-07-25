'use client'
import LaporanTransaksi from '@/components/LaporanTransaksi'
export default function Page() {
  // arah="keluar": begitu SKPD dipilih, hanya baris dgn SKPD itu sbg ASAL yang
  // tampil — tanpa ini isinya identik dgn Laporan Penerimaan Internal.
  return <LaporanTransaksi judul="Laporan Pengeluaran Internal"
    deskripsi="Rekap mutasi internal antar sub-SKPD — barang yang DIKELUARKAN. Pilih SKPD untuk memisahkan dari sisi penerimaan (tanpa filter SKPD, seluruh mutasi se-kabupaten ditampilkan)."
    jenisList={['mutasi_internal']} filePrefix="Laporan_Pengeluaran_Internal" arah="keluar" />
}
