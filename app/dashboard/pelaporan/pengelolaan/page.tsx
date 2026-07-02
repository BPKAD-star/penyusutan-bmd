'use client'
import LaporanTransaksi from '@/components/LaporanTransaksi'

const JENIS_PENGELOLAAN = [
  'mutasi_internal',
  'pengalihan_status',
  'reklas_kode',
  'koreksi_nilai',
  'koreksi_spesifikasi',
  'kapitalisasi',
  'penghapusan_pemindahtanganan',
  'penghapusan_sebab_lain',
]

export default function PelaporanPengelolaanPage() {
  return (
    <LaporanTransaksi
      judul="Pelaporan Pengelolaan"
      deskripsi="Rekap mutasi, reklas, koreksi, penambahan masa manfaat, dan penghapusan dari ledger transaksi."
      jenisList={JENIS_PENGELOLAAN}
      filePrefix="Laporan_Pengelolaan_BMD"
    />
  )
}
