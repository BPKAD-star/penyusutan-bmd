'use client'
import LaporanTransaksi from '@/components/LaporanTransaksi'
export default function Page() {
  return <LaporanTransaksi judul="Laporan Penghapusan" deskripsi="Rekap penghapusan: pemindahtanganan & sebab lain."
    jenisList={['penghapusan_pemindahtanganan', 'penghapusan_sebab_lain']} filePrefix="Laporan_Penghapusan" />
}
