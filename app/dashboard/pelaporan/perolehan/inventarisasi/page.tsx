'use client'
import LaporanTransaksi from '@/components/LaporanTransaksi'
export default function Page() {
  return <LaporanTransaksi judul="Laporan Hasil Inventarisasi" deskripsi="Rekap perolehan via hasil inventarisasi per periode & SKPD."
    jenisList={['hasil_inventarisasi']} filePrefix="Laporan_Inventarisasi" sembunyikanAsetDihapus />
}
