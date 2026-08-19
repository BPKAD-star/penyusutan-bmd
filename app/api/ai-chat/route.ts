import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { CHAT_SYSTEM_PROMPT } from '@/lib/chatbot/prompt'
import { TOOL_DEFS, jalankanTool } from '@/lib/chatbot/tools'

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

/** Berapa kali model boleh meminta data sebelum WAJIB menjawab. Cukup untuk
 *  rantai wajar "cari NIBAR-nya dulu, baru lihat penyusutannya" (2 langkah) plus
 *  sedikit ruang. Batas ini bukan hiasan: tanpa ambang, model yang bingung bisa
 *  memanggil tool berulang-ulang sampai `maxDuration` 60 dtk habis, dan
 *  pengguna cuma melihat "Asisten AI sedang mengetik..." sampai gagal. */
const MAKS_PUTARAN_TOOL = 4

type BlokIsi =
  | { type: 'text'; text?: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
type PesanApi = { role: 'user' | 'assistant'; content: string | unknown[] }

// ── Prompt caching ──────────────────────────────────────────────────────────
// `system` dikirim sebagai ARRAY blok supaya bisa ditandai `cache_control`.
// Awalan permintaan yang statis (definisi tool + system prompt) disimpan di
// sisi Anthropic dan dipakai ulang, jadi tidak dibayar penuh tiap giliran.
//
// Kenapa sekarang: basis pengetahuan baru saja diperluas berkali lipat dan ia
// dikirim ULANG pada SETIAP pesan — tanpa caching, memperkaya pengetahuan
// chatbot berarti menaikkan biaya tiap percakapan secara permanen. Dengan
// caching, memperkayanya nyaris gratis, dan itu mengubah arah trade-off-nya.
//
// Penanda ditaruh di blok system TERAKHIR. Urutan awalan yang di-cache adalah
// tools → system → messages, jadi satu penanda di ujung system ikut mencakup
// definisi tool di depannya.
//
// ⚠️ Cache-nya PER ORGANISASI & dicocokkan dari awalan yang SAMA PERSIS. Untung
// besarnya justru di aplikasi seperti ini: system prompt-nya identik untuk
// seluruh pengguna, jadi 100+ operator berbagi satu salinan cache — bukan
// masing-masing memanaskan cache sendiri.
//
// ⚠️ Kalau awalannya lebih pendek dari ambang minimum model, caching DIABAIKAN
// DIAM-DIAM (tak ada error). Jadi jangan pernah "merapikan" system prompt jadi
// jauh lebih ringkas lalu menganggap caching tetap bekerja — periksa
// `usage.cache_read_input_tokens` di respons kalau ragu.
const SYSTEM_BLOCKS = [
  { type: 'text' as const, text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' as const } },
]

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
  const msgs: PesanApi[] = ordered.map(m => ({ role: m.role, content: m.content }))
  while (msgs.length && msgs[0].role === 'assistant') msgs.shift()

  // ── Putaran tool-calling ──────────────────────────────────────────────────
  // Model boleh meminta data lewat alat BACA di lib/chatbot/tools.ts. Yang
  // dieksekusi di sini SELALU memakai `supabase` — client SESI USER (anon key +
  // cookie) dari createClient(). JANGAN PERNAH menggantinya dengan
  // createAdminClient(): RLS adalah satu-satunya yang menahan jawaban chatbot
  // tetap di dalam SKPD si penanya. Alasan panjangnya di kepala tools.ts.
  //
  // Riwayat percakapan di DB tetap TEKS BIASA — hanya jawaban akhir yang
  // disimpan. Blok tool_use/tool_result bersifat sementara dalam satu
  // permintaan, jadi skema `chat_messages_ai` tak berubah (tanpa migrasi) dan
  // giliran berikutnya tak menyeret ulang hasil query yang mungkin sudah basi.
  let reply = '(AI tidak memberi jawaban.)'
  try {
    let putaran = 0
    for (;;) {
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
          system: SYSTEM_BLOCKS,
          tools: TOOL_DEFS,
          messages: msgs,
        }),
      })
      if (!res.ok) {
        const errText = (await res.text()).slice(0, 300)
        throw new Error(`Anthropic ${res.status}: ${errText}`)
      }
      const json = await res.json()
      const blok = (json?.content as BlokIsi[] | undefined) || []
      const teks = blok.filter(b => b.type === 'text').map(b => (b as { text?: string }).text || '').join('').trim()
      const diminta = blok.filter((b): b is Extract<BlokIsi, { type: 'tool_use' }> => b.type === 'tool_use')

      if (json?.stop_reason !== 'tool_use' || diminta.length === 0) {
        reply = teks || '(AI tidak memberi jawaban.)'
        break
      }
      if (++putaran > MAKS_PUTARAN_TOOL) {
        // Berhenti dengan JUJUR, bukan diam-diam menjawab dari sisa ingatan.
        reply = teks || 'Maaf, saya butuh terlalu banyak langkah untuk menjawab itu. '
          + 'Coba persempit pertanyaannya (mis. sebutkan NIBAR atau jenis barangnya), '
          + 'atau lihat langsung di menu Daftar Barang / Penyusutan.'
        break
      }

      // Jalankan SEMUA tool yang diminta di putaran ini. Balasan `tool_result`
      // wajib satu pesan user berisi satu blok per `tool_use_id` — kalau ada
      // yang tak dibalas, permintaan berikutnya ditolak API.
      const hasil = await Promise.all(diminta.map(async t => ({
        type: 'tool_result' as const,
        tool_use_id: t.id,
        content: await jalankanTool(supabase, t.name, t.input || {}),
      })))
      msgs.push({ role: 'assistant', content: blok })
      msgs.push({ role: 'user', content: hasil })
    }
  } catch (e) {
    // ⚠️ Kegagalan TIDAK disimpan sebagai balasan asisten. Sampai 2026-08-19
    // teks "Maaf, AI sedang bermasalah: ..." di-INSERT ke chat_messages_ai
    // dengan role 'assistant' — akibatnya ia ikut jadi riwayat, dan giliran
    // berikutnya model membaca pesan error dirinya sendiri sebagai konteks
    // percakapan. Sekarang errornya dikembalikan ke klien saja; ChatWidget
    // sudah menampilkannya sebagai gelembung sementara yang tak tersimpan.
    return NextResponse.json(
      { error: `AI sedang bermasalah: ${e instanceof Error ? e.message : String(e)}` },
      { status: 502 },
    )
  }

  const { data: saved, error: saveErr } = await supabase.from('chat_messages_ai')
    .insert({ user_id: user.id, role: 'assistant', content: reply })
    .select('id,role,content,created_at').single()
  if (saveErr) return NextResponse.json({ error: `Gagal menyimpan balasan: ${saveErr.message}` }, { status: 500 })

  return NextResponse.json({ message: saved })
}
