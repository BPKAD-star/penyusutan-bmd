'use client'
import LaporanTransaksi from '@/components/LaporanTransaksi'
export default function Page() {
  return <LaporanTransaksi judul="Laporan Reklasifikasi" deskripsi="Rekap reklasifikasi kode barang."
    jenisList={['reklas_kode']} filePrefix="Laporan_Reklasifikasi" />
}
