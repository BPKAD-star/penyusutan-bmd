'use client'
import LaporanPerolehan from '@/components/LaporanPerolehan'
export default function Page() {
  return <LaporanPerolehan judul="Laporan Hibah" deskripsi="Rekap perolehan via hibah masuk per periode & SKPD."
    jenis="hibah_masuk" filePrefix="Laporan_Hibah" pihakLabel="Pihak Pemberi Hibah" />
}
