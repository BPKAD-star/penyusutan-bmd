'use client'
import LaporanTransaksi from '@/components/LaporanTransaksi'
export default function Page() {
  return <LaporanTransaksi judul="Laporan Penghapusan" deskripsi="Rekap penghapusan: pemindahtanganan & sebab lain (hanya barang yang statusnya sekarang masih dihapus)."
    jenisList={['penghapusan_pemindahtanganan', 'penghapusan_sebab_lain']} filePrefix="Laporan_Penghapusan"
    efektifPerAsetStatus="dihapus" />
}
