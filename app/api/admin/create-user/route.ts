import { createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  const { email, password, nama, role } = await req.json()

  const supabase = createAdminClient()

  // Buat user di Supabase Auth
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })

  if (error) return NextResponse.json({ error: error.message })

  // Buat profil
  const { error: profileError } = await supabase.from('profiles').insert({
    id: data.user.id,
    email,
    nama,
    role,
  })

  if (profileError) return NextResponse.json({ error: profileError.message })

  return NextResponse.json({ success: true })
}
