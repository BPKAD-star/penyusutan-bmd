import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import DashboardChrome from '@/components/DashboardChrome'
import { jkPegawai } from '@/components/AvatarPegawai'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // `nip` ikut ditarik sebagai CADANGAN jenis kelamin: banyak baris pegawai lama
  // kolom `jenis_kelamin`-nya masih kosong, sementara digit ke-15 NIP ASN memang
  // menyatakannya (lihat jkDariNip). Tanpa itu, avatarnya jatuh ke huruf awal
  // untuk sebagian besar pengguna dan fiturnya nyaris tak terasa.
  const { data: profile } = await supabase
    .from('admin_profiles')
    .select('role, pegawai:admin_pegawai(nama, nip, jenis_kelamin)')
    .eq('id', user.id)
    .single()

  const pegawai = profile?.pegawai as
    { nama?: string; nip?: string | null; jenis_kelamin?: string | null } | null

  return (
    <DashboardChrome
      userName={pegawai?.nama || user.email || ''}
      userRole={profile?.role || 'user'}
      userJk={jkPegawai(pegawai?.jenis_kelamin, pegawai?.nip)}
    >
      {children}
    </DashboardChrome>
  )
}
