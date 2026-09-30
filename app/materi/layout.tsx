// Materi paparan Bidang Pengelolaan BMD — layar penuh, di luar kerangka
// dashboard (tanpa sidebar/topbar) supaya bisa dipresentasikan & dicetak bersih.
//
// ⚠️ Rute ini di luar `/dashboard`, jadi TIDAK dijaga middleware.ts (matcher-nya
// cuma `/dashboard/:path*` & `/login`). Penjaganya di sini: materi internal
// pemda hanya untuk pengguna yang sudah login — sama seperti dashboard/layout.
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import './materi.css'

export default async function MateriLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient()
  // Gagal memeriksa sesi diperlakukan sama dgn belum login (fail-closed).
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) redirect('/login')
  return <>{children}</>
}
