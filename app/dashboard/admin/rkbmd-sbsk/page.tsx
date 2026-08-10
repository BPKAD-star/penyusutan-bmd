// SBSK pindah ke RKBMD > Standar Harga > SBSK (2026-08-10). Rute lama
// dibiarkan hidup sebagai pengalih — lihat catatan di rkbmd-ssh/page.tsx.
import { redirect } from 'next/navigation'
export default function Page() {
  redirect('/dashboard/rkbmd/standar-harga/sbsk')
}
