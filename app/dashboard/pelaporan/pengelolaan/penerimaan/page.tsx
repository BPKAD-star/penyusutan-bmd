'use client'
// Menu Pelaporan → Pengelolaan → Penerimaan Internal (ledger `mutasi_internal`).
//
// Kerangka tiga tabnya DIPAKAI BERSAMA dengan menu Penggunaan — lihat alasannya
// di kepala components/pelaporan/LaporanPerpindahan.tsx.
//
// ⚠️ `arahAwal="masuk"` WAJIB dipertahankan: menu Pengeluaran Internal membaca
// ledger yang PERSIS SAMA, jadi tanpa itu isinya identik dgn menu ini. Aturan
// yang sama sudah berlaku waktu halaman ini masih memakai `LaporanTransaksi`.
//
// ⚠️ Rekap GABUNGAN pengeluaran + penerimaan (Format IV.D.7) TIDAK di sini —
// rumahnya menu Pengeluaran Internal, karena nomornya milik keluarga IV.D dan
// dua pintu untuk satu lembar cepat atau lambat menyimpang. Alasan lengkapnya
// di `CABANG_GABUNGAN` (lib/formatPerpindahan.ts).
//
// ⚠️ Pindah ke sini ikut menutup satu cacat lama: versi `LaporanTransaksi` tak
// pernah mengirim `batalJenis`, jadi mutasi internal yang sudah DIBATALKAN
// (`batal_pengalihan` — enumnya sengaja dipakai bersama, CLAUDE.md) tetap
// tampil seolah masih berlaku, dan angkanya beda dgn Daftar Barang &
// Rekonsiliasi. Menu Pengeluaran Internal masih memakai jalur lama & masih
// menanggungnya.
import LaporanPerpindahan from '@/components/pelaporan/LaporanPerpindahan'

export default function Page() {
  return (
    <LaporanPerpindahan
      id="internal"
      idLembar="penerimaan-internal"
      jenis="mutasi_internal"
      judul="Laporan Penerimaan Internal"
      deskripsi="Mutasi internal antar sub-SKPD — barang yang DITERIMA. Pilih SKPD untuk memisahkan dari sisi pengeluaran (tanpa filter SKPD, seluruh mutasi se-kabupaten ditampilkan)."
      filePrefix="Laporan_Penerimaan_Internal"
      arahAwal="masuk"
    />
  )
}
