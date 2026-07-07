'use client'
import LaporanTransaksi from '@/components/LaporanTransaksi'
export default function Page() {
  return <LaporanTransaksi judul="Laporan Koreksi" deskripsi="Rekap koreksi nilai & spesifikasi."
    jenisList={['koreksi_nilai', 'koreksi_spesifikasi']} filePrefix="Laporan_Koreksi" />
}
