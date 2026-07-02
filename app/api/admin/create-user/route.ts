import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  const { email, password, nama, role, nip, pangkat_golongan, username, skpd_id } = await req.json()

  // Hanya admin yang boleh membuat user
  const session = createClient()
  const { data: { user } } = await session.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: me } = await session.from('profiles').select('role').eq('id', user.id).single()
  if (me?.role !== 'admin') return NextResponse.json({ error: 'Hanya admin' }, { status: 403 })

  const supabase = createAdminClient()

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })

  if (error) return NextResponse.json({ error: error.message })

  const { error: profileError } = await supabase.from('profiles').insert({
    id: data.user.id,
    email,
    nama,
    role,
    nip: nip || null,
    pangkat_golongan: pangkat_golongan || null,
    username: username || null,
    skpd_id: skpd_id || null,
  })

  if (profileError) return NextResponse.json({ error: profileError.message })

  return NextResponse.json({ success: true })
}
