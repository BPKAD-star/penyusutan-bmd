import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Sidebar from '@/components/Sidebar'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Ambil profil user
  const { data: profile } = await supabase
    .from('profiles')
    .select('nama, role')
    .eq('id', user.id)
    .single()

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar
        userName={profile?.nama || user.email || ''}
        userRole={profile?.role || 'user'}
      />
      <main className="flex-1 overflow-auto bg-gray-50">
        {children}
      </main>
    </div>
  )
}
