// Menu per-jenis ini sudah TIDAK punya isi sendiri (2026-08-14, migrasi
// 20260814_01): menambah/mengubah/menghapus baris acuan bersama langsung dari
// sini adalah shortcut yang memintas Usulan → Validasi, dan GRANT tulisnya kini
// dicabut di DB. Yang tersisa dari halaman lama cuma daftar bacaannya — itu
// sudah dilayani Pelaporan Standar Harga, jadi rutenya dialihkan ke sana
// (dibiarkan hidup supaya pranala lama tidak mati).
import { redirect } from 'next/navigation'
export default function Page() {
  redirect('/dashboard/rkbmd/standar-harga/pelaporan')
}
