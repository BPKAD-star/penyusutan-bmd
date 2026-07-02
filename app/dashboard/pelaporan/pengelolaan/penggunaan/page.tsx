'use client'
import LaporanTransaksi from '@/components/LaporanTransaksi'
export default function Page() {
  return <LaporanTransaksi judul="Laporan Penggunaan" deskripsi="Rekap BMD yang dialihkan antar SKPD (pengalihan status)."
    jenisList={['pengalihan_status']} filePrefix="Laporan_Penggunaan" />
}
