import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  const { id } = await req.json()

  // Hanya admin yang boleh menghapus user (guard sama dgn create-user —
  // sebelumnya route ini TIDAK dicek sama sekali, ditemukan audit 2026-07-13).
  const session = createClient()
  const { data: { user } } = await session.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: me } = await session.from('admin_profiles').select('role').eq('id', user.id).single()
  if (me?.role !== 'admin') return NextResponse.json({ error: 'Hanya admin' }, { status: 403 })
  if (user.id === id) return NextResponse.json({ error: 'Tidak bisa menghapus akun sendiri' }, { status: 400 })

  const supabase = createAdminClient()

  await supabase.from('admin_profiles').delete().eq('id', id)
  const { error } = await supabase.auth.admin.deleteUser(id)

  if (error) return NextResponse.json({ error: error.message })
  return NextResponse.json({ success: true })
}
