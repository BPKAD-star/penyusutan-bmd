import { createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  const { id } = await req.json()
  const supabase = createAdminClient()

  await supabase.from('profiles').delete().eq('id', id)
  const { error } = await supabase.auth.admin.deleteUser(id)

  if (error) return NextResponse.json({ error: error.message })
  return NextResponse.json({ success: true })
}
