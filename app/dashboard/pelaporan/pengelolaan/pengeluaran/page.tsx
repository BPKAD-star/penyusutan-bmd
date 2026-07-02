'use client'
import LaporanTransaksi from '@/components/LaporanTransaksi'
export default function Page() {
  return <LaporanTransaksi judul="Laporan Pengeluaran Internal"
    deskripsi="Rekap mutasi internal antar sub-SKPD (kolom SKPD Asal = pengirim)."
    jenisList={['mutasi_internal']} filePrefix="Laporan_Pengeluaran_Internal" />
}
