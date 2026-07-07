'use client'
import LaporanTransaksi from '@/components/LaporanTransaksi'
export default function Page() {
  return <LaporanTransaksi judul="Laporan Koreksi" deskripsi="Rekap koreksi nilai, spesifikasi, & pencatatan ganda."
    jenisList={['koreksi_nilai', 'koreksi_spesifikasi', 'koreksi_pencatatan_ganda']} filePrefix="Laporan_Koreksi" />
}
