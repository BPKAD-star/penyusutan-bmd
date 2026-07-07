'use client'
import LaporanTransaksi from '@/components/LaporanTransaksi'
export default function Page() {
  return <LaporanTransaksi judul="Laporan Hibah" deskripsi="Rekap perolehan via hibah masuk per periode & SKPD."
    jenisList={['hibah_masuk']} filePrefix="Laporan_Hibah" sembunyikanAsetDihapus />
}
