'use client'
import LaporanTransaksi from '@/components/LaporanTransaksi'
export default function Page() {
  // arah="masuk": begitu SKPD dipilih, hanya baris dgn SKPD itu sbg TUJUAN yang
  // tampil — tanpa ini isinya identik dgn Laporan Pengeluaran Internal.
  return <LaporanTransaksi judul="Laporan Penerimaan Internal"
    deskripsi="Rekap mutasi internal antar sub-SKPD — barang yang DITERIMA. Pilih SKPD untuk memisahkan dari sisi pengeluaran (tanpa filter SKPD, seluruh mutasi se-kabupaten ditampilkan)."
    jenisList={['mutasi_internal']} filePrefix="Laporan_Penerimaan_Internal" arah="masuk" />
}
