import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { pesanAuthID } from '@/lib/pesanAuth'

export async function POST(req: Request) {
  const { id, password } = await req.json()
  if (!password || String(password).length < 8) {
    return NextResponse.json({ error: 'Password minimal 8 karakter.' }, { status: 400 })
  }

  // Hanya admin yang boleh reset password user lain (pola sama dgn create-user/delete-user).
  const session = createClient()
  const { data: { user } } = await session.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: me } = await session.from('admin_profiles').select('role').eq('id', user.id).single()
  if (me?.role !== 'admin') return NextResponse.json({ error: 'Hanya admin' }, { status: 403 })

  const supabase = createAdminClient()
  const { error } = await supabase.auth.admin.updateUserById(id, { password })

  if (error) return NextResponse.json({ error: pesanAuthID(error as { message?: string; code?: string; status?: number; reasons?: string[] }, 'Gagal mereset password.') })
  return NextResponse.json({ success: true })
}
