'use client'
import LaporanTransaksi from '@/components/LaporanTransaksi'
export default function Page() {
  return <LaporanTransaksi judul="Laporan Penerimaan Internal"
    deskripsi="Rekap mutasi internal antar sub-SKPD (kolom SKPD Tujuan = penerima)."
    jenisList={['mutasi_internal']} filePrefix="Laporan_Penerimaan_Internal" />
}
