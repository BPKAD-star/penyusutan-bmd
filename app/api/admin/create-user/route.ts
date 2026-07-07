import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  const { email, password, pegawai_id, role, username } = await req.json()

  // Hanya admin yang boleh membuat user
  const session = createClient()
  const { data: { user } } = await session.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: me } = await session.from('profiles').select('role').eq('id', user.id).single()
  if (me?.role !== 'admin') return NextResponse.json({ error: 'Hanya admin' }, { status: 403 })

  const supabase = createAdminClient()

  const { data: pegawai, error: pegawaiError } = await supabase
    .from('pegawai').select('id,skpd_id').eq('id', pegawai_id).single()
  if (pegawaiError || !pegawai) return NextResponse.json({ error: 'Pegawai tidak ditemukan' })

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })

  if (error) return NextResponse.json({ error: error.message })

  const { error: profileError } = await supabase.from('profiles').insert({
    id: data.user.id,
    email,
    role,
    username: username || null,
    pegawai_id: pegawai.id,
    skpd_id: pegawai.skpd_id,
  })

  if (profileError) return NextResponse.json({ error: profileError.message })

  return NextResponse.json({ success: true })
}
