'use client'
import LaporanTransaksi from '@/components/LaporanTransaksi'
export default function Page() {
  return <LaporanTransaksi judul="Laporan Kapitalisasi" deskripsi="Rekap kapitalisasi / penambahan masa manfaat."
    jenisList={['kapitalisasi']} filePrefix="Laporan_Kapitalisasi" />
}
