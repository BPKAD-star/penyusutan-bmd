'use client'
// Chat Grup — satu ruang obrolan global buat semua user terdaftar platform
// ini (bukan per-SKPD/DM, itu belum dibangun — "satu aja dulu, nanti
// dikembangin lagi", keputusan user 2026-07-10). Realtime via Postgres
// Changes (chat_messages sudah didaftarkan ke publication supabase_realtime
// di migrasi 20260710_14_chat_grup.sql).
import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type Msg = { id: number; sender_id: string; content: string; created_at: string }
type ProfileRow = { id: string; email: string | null; pegawai: { nama: string } | null }

const fmtJam = (s: string) => new Date(s).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
const fmtTgl = (s: string) => new Date(s).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })

export default function ChatGrupPage() {
  const supabase = createClient()
  const [myId, setMyId] = useState<string | null>(null)
  const [namaMap, setNamaMap] = useState<Record<string, string>>({})
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      setMyId(user?.id ?? null)

      const map: Record<string, string> = {}
      for (let from = 0; ; from += 1000) {
        const { data } = await supabase.from('admin_profiles')
          .select('id,email,pegawai:admin_pegawai(nama)').range(from, from + 999)
        if (!data || data.length === 0) break
        for (const p of data as unknown as ProfileRow[]) map[p.id] = p.pegawai?.nama || p.email || 'User'
        if (data.length < 1000) break
      }
      setNamaMap(map)

      const { data: initial } = await supabase.from('chat_messages')
        .select('id,sender_id,content,created_at').order('id', { ascending: true }).limit(300)
      setMsgs((initial as Msg[]) || [])
      setLoading(false)
    })()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const channel = supabase.channel('chat_messages_rt')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, payload => {
        setMsgs(prev => (prev.some(m => m.id === (payload.new as Msg).id) ? prev : [...prev, payload.new as Msg]))
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'chat_messages' }, payload => {
        setMsgs(prev => prev.filter(m => m.id !== (payload.old as Msg).id))
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs.length])

  async function kirim() {
    const content = text.trim()
    if (!content || !myId || sending) return
    setSending(true)
    setText('')
    const { error } = await supabase.from('chat_messages').insert({ sender_id: myId, content })
    if (error) { alert(`Gagal kirim pesan: ${error.message}`); setText(content) }
    setSending(false)
  }

  async function hapus(id: number) {
    if (!confirm('Hapus pesan ini?')) return
    const { error } = await supabase.from('chat_messages').delete().eq('id', id)
    if (error) alert(`Gagal hapus: ${error.message}`)
    else setMsgs(prev => prev.filter(m => m.id !== id))
  }

  return (
    <div className="p-6 h-full flex flex-col min-h-0">
      <div className="mb-4 flex-shrink-0">
        <h1 className="text-2xl font-bold text-gray-900">Chat Grup</h1>
        <p className="text-gray-500 text-sm mt-1">Obrolan bareng semua user platform ini.</p>
      </div>

      <div className="card flex-1 flex flex-col overflow-hidden min-h-0">
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {loading ? (
            <p className="text-xs text-gray-400 text-center py-8">Memuat...</p>
          ) : msgs.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-8">Belum ada pesan. Mulai obrolan!</p>
          ) : msgs.map((m, i) => {
            const mine = m.sender_id === myId
            const prev = msgs[i - 1]
            const tglBaru = !prev || fmtTgl(prev.created_at) !== fmtTgl(m.created_at)
            return (
              <div key={m.id}>
                {tglBaru && (
                  <p className="text-center text-[11px] text-gray-400 my-3">{fmtTgl(m.created_at)}</p>
                )}
                <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                  <div className={`group max-w-[70%] rounded-lg px-3 py-2 text-sm relative ${mine ? 'bg-teal text-white' : 'bg-gray-100 text-gray-800'}`}>
                    {!mine && <p className="text-[11px] font-medium text-teal mb-0.5">{namaMap[m.sender_id] || 'User'}</p>}
                    <p className="whitespace-pre-wrap break-words">{m.content}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <p className={`text-[10px] ${mine ? 'text-white/70' : 'text-gray-400'}`}>{fmtJam(m.created_at)}</p>
                      {mine && (
                        <button onClick={() => hapus(m.id)}
                          className="text-[10px] text-white/70 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity">
                          Hapus
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
          <div ref={bottomRef} />
        </div>
        <form onSubmit={e => { e.preventDefault(); kirim() }} className="border-t border-gray-100 p-3 flex gap-2 flex-shrink-0">
          <input className="select-filter flex-1" placeholder="Ketik pesan..." value={text}
            onChange={e => setText(e.target.value)} maxLength={4000} />
          <button type="submit" disabled={sending || !text.trim()} className="btn-primary text-sm">Kirim</button>
        </form>
      </div>
    </div>
  )
}
