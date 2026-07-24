'use client'
import LaporanPerolehan from '@/components/LaporanPerolehan'
export default function Page() {
  return <LaporanPerolehan judul="Laporan Pengadaan" deskripsi="Rekap perolehan via pengadaan per periode & SKPD."
    jenis="pengadaan" filePrefix="Laporan_Pengadaan" enableModel3 />
}
