import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import DashboardChrome from '@/components/DashboardChrome'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('nama, role')
    .eq('id', user.id)
    .single()

  return (
    <DashboardChrome
      userName={profile?.nama || user.email || ''}
      userRole={profile?.role || 'user'}
    >
      {children}
    </DashboardChrome>
  )
}
