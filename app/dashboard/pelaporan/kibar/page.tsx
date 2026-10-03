// Menu Pelaporan → KIBAR sudah TIDAK punya isi sendiri (2026-10-03, permintaan
// user): membuka KIBAR (ikon dokumen) & Cetak Label (centang → tombol kuning)
// kini ada di Daftar Barang, kolom paling kiri — satu tempat untuk melihat
// barang, membuka kartunya, & mencetak labelnya. Rutenya dibiarkan hidup sebagai
// pengalih supaya pranala lama tidak mati (pola SSH/HSPK & GIS daftar-bidang).
import { redirect } from 'next/navigation'

export default function Page() {
  redirect('/dashboard/daftar-barang')
}
