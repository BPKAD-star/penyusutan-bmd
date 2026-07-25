'use client'
import LaporanTransaksi from '@/components/LaporanTransaksi'
import { BATAL_TARGET_JENIS } from '@/lib/voidedAset'
export default function Page() {
  return <LaporanTransaksi judul="Laporan Kapitalisasi" deskripsi="Rekap kapitalisasi / penambahan masa manfaat (yang sudah dibatalkan tidak ditampilkan)."
    jenisList={['kapitalisasi']} filePrefix="Laporan_Kapitalisasi"
    batalJenis={BATAL_TARGET_JENIS.kapitalisasi} />
}
