'use client'
import LaporanTransaksi from '@/components/LaporanTransaksi'
export default function Page() {
  return <LaporanTransaksi judul="Laporan Koreksi" deskripsi="Rekap koreksi nilai, spesifikasi, pencatatan ganda, & pemecahan barang."
    jenisList={['koreksi_nilai', 'koreksi_spesifikasi', 'koreksi_pencatatan_ganda', 'pemecahan_keluar', 'pemecahan_masuk', 'batal_pemecahan', 'batal_pemecahan_masuk']} filePrefix="Laporan_Koreksi" />
}
