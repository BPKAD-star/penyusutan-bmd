import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { CHAT_SYSTEM_PROMPT } from '@/lib/chatbot/prompt'

// Chat AI (ChatWidget opsi "Asisten AI") — proxy ke Anthropic Messages API.
// API key HARUS server-side (process.env.ANTHROPIC_API_KEY, tanpa prefix
// NEXT_PUBLIC_) — pola sama dgn SUPABASE_SERVICE_ROLE_KEY di
// lib/supabase/server.ts, tak boleh bocor ke browser. Model: Claude Haiku 4.5
// (keputusan admin 2026-07-16, pindah dari OpenRouter/nemotron krn halusinasi).
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const MODEL = 'claude-haiku-4-5'
// System prompt + basis pengetahuan (grounding) ada di lib/chatbot/prompt.ts —
// TANPA ini model mengarang dari pengetahuan umum (SAKTI/SIMAK-BMN dll).
const SYSTEM_PROMPT = CHAT_SYSTEM_PROMPT
const HISTORY_LIMIT = 20
const MAX_TOKENS = 2048

export async function POST(req: Request) {
  const body = await req.json().catch(() => null)
  const content = String(body?.message || '').trim()
  if (!content) return NextResponse.json({ error: 'Pesan kosong.' }, { status: 400 })
  if (content.length > 4000) return NextResponse.json({ error: 'Pesan maksimal 4000 karakter.' }, { status: 400 })

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'ANTHROPIC_API_KEY belum diset di server (env Vercel).' }, { status: 500 })

  const { error: insErr } = await supabase.from('chat_messages_ai').insert({ user_id: user.id, role: 'user', content })
  if (insErr) return NextResponse.json({ error: `Gagal menyimpan pesan: ${insErr.message}` }, { status: 500 })

  const { data: history } = await supabase.from('chat_messages_ai')
    .select('role,content').eq('user_id', user.id).order('id', { ascending: false }).limit(HISTORY_LIMIT)
  const ordered = ((history || []) as { role: 'user' | 'assistant'; content: string }[]).reverse()

  // Anthropic: `system` terpisah (bukan role di messages), messages HANYA
  // user/assistant, dan pesan pertama WAJIB 'user'. History bisa terpotong di
  // tengah (HISTORY_LIMIT) & mulai dari 'assistant' → buang prefiks assistant.
  const msgs = ordered.map(m => ({ role: m.role, content: m.content }))
  while (msgs.length && msgs[0].role === 'assistant') msgs.shift()

  let reply: string
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: SYSTEM_PROMPT,
        messages: msgs,
      }),
    })
    if (!res.ok) {
      const errText = (await res.text()).slice(0, 300)
      throw new Error(`Anthropic ${res.status}: ${errText}`)
    }
    const json = await res.json()
    reply = ((json?.content as { type: string; text?: string }[] | undefined) || [])
      .filter(b => b.type === 'text').map(b => b.text || '').join('').trim() || '(AI tidak memberi jawaban.)'
  } catch (e) {
    reply = `Maaf, AI sedang bermasalah: ${e instanceof Error ? e.message : String(e)}`
  }

  const { data: saved, error: saveErr } = await supabase.from('chat_messages_ai')
    .insert({ user_id: user.id, role: 'assistant', content: reply })
    .select('id,role,content,created_at').single()
  if (saveErr) return NextResponse.json({ error: `Gagal menyimpan balasan: ${saveErr.message}` }, { status: 500 })

  return NextResponse.json({ message: saved })
}
