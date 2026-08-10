// SSH pindah ke RKBMD > Standar Harga > SSH (2026-08-10). Rute lama dibiarkan
// hidup sebagai pengalih supaya pranala/bookmark yang terlanjur tersebar tidak
// mati — bukan dihapus.
import { redirect } from 'next/navigation'
export default function Page() {
  redirect('/dashboard/rkbmd/standar-harga/ssh')
}
