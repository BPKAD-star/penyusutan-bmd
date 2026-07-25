'use client'
import LaporanTransaksi from '@/components/LaporanTransaksi'
import { BATAL_TARGET_JENIS } from '@/lib/voidedAset'
export default function Page() {
  return <LaporanTransaksi judul="Laporan Reklasifikasi" deskripsi="Rekap reklasifikasi: komptabel, perubahan fungsi BMD, dan kesalahan kodefikasi (yang sudah dibatalkan tidak ditampilkan)."
    jenisList={['reklas_kode', 'reklas_komptabel', 'reklas_golongan']} filePrefix="Laporan_Reklasifikasi"
    batalJenis={BATAL_TARGET_JENIS.reklasifikasi} />
}
