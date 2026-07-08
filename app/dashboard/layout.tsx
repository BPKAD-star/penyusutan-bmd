import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import DashboardChrome from '@/components/DashboardChrome'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('admin_profiles')
    .select('role, pegawai:admin_pegawai(nama)')
    .eq('id', user.id)
    .single()

  return (
    <DashboardChrome
      userName={(profile?.pegawai as { nama?: string } | null)?.nama || user.email || ''}
      userRole={profile?.role || 'user'}
    >
      {children}
    </DashboardChrome>
  )
}
