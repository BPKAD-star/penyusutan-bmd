import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// Chat AI (ChatWidget opsi "Asisten AI") — proxy ke OpenRouter. API key HARUS
// server-side (process.env.OPENROUTER_API_KEY, tanpa prefix NEXT_PUBLIC_) —
// pola sama dgn SUPABASE_SERVICE_ROLE_KEY di lib/supabase/server.ts, tak boleh
// bocor ke browser. Model gratis via credit OpenRouter user (keputusan admin
// 2026-07-12): nvidia/nemotron-3-ultra-550b-a55b:free.
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const MODEL = 'nvidia/nemotron-3-ultra-550b-a55b:free'
const SYSTEM_PROMPT =
  'Kamu asisten AI di aplikasi Penyusutan BMD (Barang Milik Daerah) milik Pemerintah ' +
  'Kabupaten Kediri. Jawab singkat, jelas, dan sopan dalam Bahasa Indonesia kecuali ' +
  'user menulis dalam bahasa lain.'
const HISTORY_LIMIT = 20

export async function POST(req: Request) {
  const body = await req.json().catch(() => null)
  const content = String(body?.message || '').trim()
  if (!content) return NextResponse.json({ error: 'Pesan kosong.' }, { status: 400 })
  if (content.length > 4000) return NextResponse.json({ error: 'Pesan maksimal 4000 karakter.' }, { status: 400 })

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'OPENROUTER_API_KEY belum diset di server (env Vercel).' }, { status: 500 })

  const { error: insErr } = await supabase.from('ai_chat_messages').insert({ user_id: user.id, role: 'user', content })
  if (insErr) return NextResponse.json({ error: `Gagal menyimpan pesan: ${insErr.message}` }, { status: 500 })

  const { data: history } = await supabase.from('ai_chat_messages')
    .select('role,content').eq('user_id', user.id).order('id', { ascending: false }).limit(HISTORY_LIMIT)
  const ordered = ((history || []) as { role: 'user' | 'assistant'; content: string }[]).reverse()

  let reply: string
  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...ordered.map(m => ({ role: m.role, content: m.content }))],
      }),
    })
    if (!res.ok) {
      const errText = (await res.text()).slice(0, 300)
      throw new Error(`OpenRouter ${res.status}: ${errText}`)
    }
    const json = await res.json()
    reply = String(json?.choices?.[0]?.message?.content || '').trim() || '(AI tidak memberi jawaban.)'
  } catch (e) {
    reply = `Maaf, AI sedang bermasalah: ${e instanceof Error ? e.message : String(e)}`
  }

  const { data: saved, error: saveErr } = await supabase.from('ai_chat_messages')
    .insert({ user_id: user.id, role: 'assistant', content: reply })
    .select('id,role,content,created_at').single()
  if (saveErr) return NextResponse.json({ error: `Gagal menyimpan balasan: ${saveErr.message}` }, { status: 500 })

  return NextResponse.json({ message: saved })
}
