'use client'
// Menu Pelaporan → Pengelolaan → Pengeluaran Internal (ledger `mutasi_internal`).
//
// Kerangka tiga tabnya DIPAKAI BERSAMA dengan Penggunaan & Penerimaan Internal —
// lihat alasannya di kepala components/pelaporan/LaporanPerpindahan.tsx.
//
// ⚠️ `arahAwal="keluar"` WAJIB dipertahankan: menu Penerimaan Internal membaca
// ledger yang PERSIS SAMA, jadi tanpa itu isinya identik dgn menu ini. Aturan
// yang sama sudah berlaku waktu halaman ini masih memakai `LaporanTransaksi`.
//
// ⚠️ Pindah ke sini menutup cacat lama yang SAMA dgn menu Penerimaan: versi
// `LaporanTransaksi` tak pernah mengirim `batalJenis`, jadi mutasi internal yang
// sudah DIBATALKAN (`batal_pengalihan` — enumnya sengaja dipakai bersama,
// CLAUDE.md) tetap tampil seolah masih berlaku, dan angkanya beda dgn Daftar
// Barang & Rekonsiliasi.
import LaporanPerpindahan from '@/components/pelaporan/LaporanPerpindahan'

export default function Page() {
  return (
    <LaporanPerpindahan
      id="pengeluaran"
      idLembar="pengeluaran-internal"
      jenis="mutasi_internal"
      judul="Laporan Pengeluaran Internal"
      deskripsi="Mutasi internal antar sub-SKPD — barang yang DIKELUARKAN. Pilih SKPD untuk memisahkan dari sisi penerimaan (tanpa filter SKPD, seluruh mutasi se-kabupaten ditampilkan)."
      filePrefix="Laporan_Pengeluaran_Internal"
      arahAwal="keluar"
    />
  )
}
