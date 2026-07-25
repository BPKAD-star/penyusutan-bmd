'use client'
import LaporanTransaksi from '@/components/LaporanTransaksi'
import { BATAL_TARGET_JENIS } from '@/lib/voidedAset'
export default function Page() {
  // Catatan: batal_pemecahan / batal_pemecahan_masuk SENGAJA tetap di jenisList
  // (ditampilkan sbg baris tersendiri, bukan penganulir lewat target_trx_id) —
  // pembatalan pemecahan adalah peristiwa yang memang perlu terlihat di rekap.
  return <LaporanTransaksi judul="Laporan Koreksi" deskripsi="Rekap koreksi nilai, spesifikasi, pencatatan ganda, & pemecahan barang (koreksi yang sudah dibatalkan tidak ditampilkan)."
    jenisList={['koreksi_nilai', 'koreksi_spesifikasi', 'koreksi_pencatatan_ganda', 'pemecahan_keluar', 'pemecahan_masuk', 'batal_pemecahan', 'batal_pemecahan_masuk']} filePrefix="Laporan_Koreksi"
    batalJenis={BATAL_TARGET_JENIS.koreksi} />
}
