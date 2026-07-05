'use client'
import LaporanTransaksi from '@/components/LaporanTransaksi'
export default function Page() {
  return <LaporanTransaksi judul="Laporan Pengadaan" deskripsi="Rekap perolehan via pengadaan per periode & SKPD."
    jenisList={['pengadaan']} filePrefix="Laporan_Pengadaan" sembunyikanAsetDihapus />
}
