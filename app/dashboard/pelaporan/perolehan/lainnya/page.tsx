'use client'
import LaporanTransaksi from '@/components/LaporanTransaksi'
export default function Page() {
  return <LaporanTransaksi judul="Laporan Perolehan Lainnya" deskripsi="Rekap perolehan lainnya per periode & SKPD."
    jenisList={['perolehan_lainnya']} filePrefix="Laporan_Perolehan_Lainnya" sembunyikanAsetDihapus />
}
