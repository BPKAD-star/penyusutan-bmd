// RKBMD kini punya sub-menu (Standar Harga · Usulan · Validasi · Pelaporan),
// jadi akar /dashboard/rkbmd tidak lagi menampilkan apa-apa sendiri — ia
// mengalihkan ke Usulan, layar yang dulu ada di sini.
import { redirect } from 'next/navigation'
export default function Page() {
  redirect('/dashboard/rkbmd/usulan')
}
