'use client'
import LaporanTransaksi from '@/components/LaporanTransaksi'
import { BATAL_TARGET_JENIS } from '@/lib/voidedAset'
export default function Page() {
  // `batalJenis` WAJIB: tanpa itu pengalihan yang sudah dibatalkan
  // (`batal_pengalihan`, migrasi 20260729_07) tetap tampil seolah masih berlaku,
  // padahal Daftar Barang, Penyusutan, & Rekonsiliasi sudah membuangnya — jadi
  // angka laporan ini beda dgn halaman lain untuk periode yang sama.
  return <LaporanTransaksi judul="Laporan Penggunaan" deskripsi="Rekap BMD yang dialihkan antar SKPD (pengalihan status)."
    jenisList={['pengalihan_status']} batalJenis={BATAL_TARGET_JENIS.pengalihan}
    filePrefix="Laporan_Penggunaan" />
}
