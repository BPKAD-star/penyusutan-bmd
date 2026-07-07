'use client'
import LaporanTransaksi from '@/components/LaporanTransaksi'
export default function Page() {
  return <LaporanTransaksi judul="Laporan Reklasifikasi" deskripsi="Rekap reklasifikasi: komptabel, perubahan fungsi BMD, dan kesalahan kodefikasi."
    jenisList={['reklas_kode', 'reklas_komptabel', 'reklas_golongan']} filePrefix="Laporan_Reklasifikasi" />
}
