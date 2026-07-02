'use client'
import LaporanTransaksi from '@/components/LaporanTransaksi'
import { JENIS_PEROLEHAN } from '@/lib/bmd'

export default function PelaporanPerolehanPage() {
  return (
    <LaporanTransaksi
      judul="Pelaporan Perolehan"
      deskripsi="Rekap perolehan BMD per jenis, periode, dan SKPD. Barang yang sudah dihapus tidak muncul."
      jenisList={[...JENIS_PEROLEHAN]}
      filePrefix="Laporan_Perolehan_BMD"
      sembunyikanAsetDihapus
    />
  )
}
