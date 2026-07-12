'use client'
// Chat widget mengambang (pojok kanan-bawah, muncul di semua halaman dashboard
// lewat DashboardChrome). Room "Publik" = Chat Grup lama (recipient_id NULL,
// lihat migrasi 20260710_14), plus DM 1-on-1 ke user lain (migrasi
// 20260710_15_chat_dm.sql). Realtime via Postgres Changes, satu channel utk
// semua room — RLS chat_select yang menyaring mana row yang boleh saya lihat.
import { useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type Msg = { id: number; sender_id: string; recipient_id: string | null; content: string; created_at: string }
type AiMsg = { id: number; role: 'user' | 'assistant'; content: string; created_at: string }
type Profile = { id: string; nama: string; skpd: string | null }
type ProfileRow = { id: string; email: string | null; pegawai: { nama: string } | null; skpd: { nama: string } | null }

const ICON_CHAT = 'M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z'
const ICON_AI = 'M13 10V3L4 14h7v7l9-11h-7z'

const fmtJam = (s: string) => new Date(s).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
const fmtTgl = (s: string) => new Date(s).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })

export default function ChatWidget() {
  const supabase = createClient()
  const [open, setOpen] = useState(false)
  const [myId, setMyId] = useState<string | null>(null)
  const [profiles, setProfiles] = useState<Record<string, Profile>>({})
  const [publicMsgs, setPublicMsgs] = useState<Msg[]>([])
  const [dmMsgs, setDmMsgs] = useState<Msg[]>([]) // pesan DM utk seluruh kontak (dipakai list preview + thread aktif)
  const [dmLoaded, setDmLoaded] = useState(false)
  const [aiMsgs, setAiMsgs] = useState<AiMsg[]>([]) // percakapan pribadi dgn Asisten AI (tabel chat_messages_ai, terpisah dari chat_messages)
  const [aiLoaded, setAiLoaded] = useState(false)
  const [aiBusy, setAiBusy] = useState(false) // true selagi menunggu balasan OpenRouter
  const [lastRead, setLastRead] = useState<Record<string, number>>({}) // room_key -> last_read_id
  const [activeRoom, setActiveRoom] = useState<'public' | string | null>(null) // null = list view
  const [search, setSearch] = useState('')
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      setMyId(user?.id ?? null)
      if (!user) return

      const map: Record<string, Profile> = {}
      for (let from = 0; ; from += 1000) {
        const { data } = await supabase.from('admin_profiles')
          .select('id,email,pegawai:admin_pegawai(nama),skpd:admin_skpd(nama)').range(from, from + 999)
        if (!data || data.length === 0) break
        for (const p of data as unknown as ProfileRow[]) {
          map[p.id] = { id: p.id, nama: p.pegawai?.nama || p.email || 'User', skpd: p.skpd?.nama || null }
        }
        if (data.length < 1000) break
      }
      setProfiles(map)

      const { data: initial } = await supabase.from('chat_messages')
        .select('id,sender_id,recipient_id,content,created_at')
        .is('recipient_id', null).order('id', { ascending: true }).limit(300)
      setPublicMsgs((initial as Msg[]) || [])

      const { data: reads } = await supabase.from('chat_reads').select('room_key,last_read_id').eq('user_id', user.id)
      const rm: Record<string, number> = {}
      for (const r of reads || []) rm[r.room_key] = r.last_read_id
      setLastRead(rm)
    })()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Muat riwayat DM (utk preview list + thread) sekali saat panel pertama dibuka
  useEffect(() => {
    if (!open || dmLoaded || !myId) return
    ;(async () => {
      const { data } = await supabase.from('chat_messages')
        .select('id,sender_id,recipient_id,content,created_at')
        .or(`sender_id.eq.${myId},recipient_id.eq.${myId}`)
        .not('recipient_id', 'is', null)
        .order('id', { ascending: true }).limit(500)
      setDmMsgs((data as Msg[]) || [])
      setDmLoaded(true)
    })()
  }, [open, dmLoaded, myId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Muat riwayat chat AI (pribadi, tak perlu realtime — balasan datang langsung dari respons API)
  useEffect(() => {
    if (!open || aiLoaded || !myId) return
    ;(async () => {
      const { data } = await supabase.from('chat_messages_ai')
        .select('id,role,content,created_at').eq('user_id', myId).order('id', { ascending: true }).limit(300)
      setAiMsgs((data as AiMsg[]) || [])
      setAiLoaded(true)
    })()
  }, [open, aiLoaded, myId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!myId) return
    const channel = supabase.channel('chat_messages_rt')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, payload => {
        const m = payload.new as Msg
        if (m.recipient_id === null) {
          setPublicMsgs(prev => (prev.some(x => x.id === m.id) ? prev : [...prev, m]))
        } else if (m.sender_id === myId || m.recipient_id === myId) {
          setDmMsgs(prev => (prev.some(x => x.id === m.id) ? prev : [...prev, m]))
        }
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'chat_messages' }, payload => {
        const id = (payload.old as Msg).id
        setPublicMsgs(prev => prev.filter(m => m.id !== id))
        setDmMsgs(prev => prev.filter(m => m.id !== id))
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [myId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [publicMsgs.length, dmMsgs.length, aiMsgs.length, aiBusy, activeRoom])

  // Tandai room aktif sudah dibaca sampai pesan terakhir yang terlihat.
  useEffect(() => {
    if (!myId || activeRoom === null) return
    const roomKey = activeRoom
    const list = activeRoom === 'public' ? publicMsgs : dmMsgs.filter(m => m.sender_id === activeRoom || m.recipient_id === activeRoom)
    if (list.length === 0) return
    const maxId = list[list.length - 1].id
    if ((lastRead[roomKey] || 0) >= maxId) return
    setLastRead(prev => ({ ...prev, [roomKey]: maxId }))
    supabase.from('chat_reads').upsert({ user_id: myId, room_key: roomKey, last_read_id: maxId }).then()
  }, [activeRoom, publicMsgs, dmMsgs, myId]) // eslint-disable-line react-hooks/exhaustive-deps

  const dmByPeer = useMemo(() => {
    const g: Record<string, Msg[]> = {}
    for (const m of dmMsgs) {
      const peer = m.sender_id === myId ? m.recipient_id! : m.sender_id
      ;(g[peer] ??= []).push(m)
    }
    return g
  }, [dmMsgs, myId])

  const kontakList = useMemo(() => {
    const q = search.trim().toLowerCase()
    return Object.values(profiles)
      .filter(p => p.id !== myId)
      .filter(p => !q || p.nama.toLowerCase().includes(q) || (p.skpd || '').toLowerCase().includes(q))
      .map(p => {
        const msgs = dmByPeer[p.id] || []
        const last = msgs[msgs.length - 1]
        const unread = msgs.filter(m => m.id > (lastRead[p.id] || 0) && m.sender_id !== myId).length
        return { ...p, last, unread }
      })
      .sort((a, b) => {
        if (a.last && b.last) return b.last.id - a.last.id
        if (a.last) return -1
        if (b.last) return 1
        return a.nama.localeCompare(b.nama)
      })
  }, [profiles, search, myId, dmByPeer, lastRead])

  const unreadPublic = publicMsgs.filter(m => m.id > (lastRead.public || 0) && m.sender_id !== myId).length
  const unreadTotal = unreadPublic + kontakList.reduce((sum, k) => sum + k.unread, 0)

  const threadMsgs = activeRoom === null || activeRoom === 'ai' ? [] : activeRoom === 'public' ? publicMsgs : (dmByPeer[activeRoom] || [])
  const threadTitle = activeRoom === null ? '' : activeRoom === 'ai' ? 'Asisten AI' : activeRoom === 'public' ? 'Publik / Chat Grup' : (profiles[activeRoom]?.nama || 'User')

  async function kirim() {
    const content = text.trim()
    if (!content || !myId || sending || activeRoom === null || activeRoom === 'ai') return
    setSending(true)
    setText('')
    const recipient_id = activeRoom === 'public' ? null : activeRoom
    const { error } = await supabase.from('chat_messages').insert({ sender_id: myId, recipient_id, content })
    if (error) { alert(`Gagal kirim pesan: ${error.message}`); setText(content) }
    setSending(false)
  }

  async function hapus(id: number) {
    if (!confirm('Hapus pesan ini?')) return
    const { error } = await supabase.from('chat_messages').delete().eq('id', id)
    if (error) alert(`Gagal hapus: ${error.message}`)
  }

  // ── Chat AI: kirim ke /api/ai-chat (server, simpan API key aman) lalu tampilkan balasan ──
  async function kirimAi() {
    const content = text.trim()
    if (!content || aiBusy) return
    setText('')
    setAiBusy(true)
    setAiMsgs(prev => [...prev, { id: -Date.now(), role: 'user', content, created_at: new Date().toISOString() }])
    try {
      const res = await fetch('/api/ai-chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: content }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || 'Gagal menghubungi AI.')
      setAiMsgs(prev => [...prev, json.message as AiMsg])
    } catch (e) {
      setAiMsgs(prev => [...prev, { id: -Date.now(), role: 'assistant', content: `Maaf, gagal menghubungi AI: ${e instanceof Error ? e.message : String(e)}`, created_at: new Date().toISOString() }])
    }
    setAiBusy(false)
  }

  async function hapusAi(id: number) {
    if (id < 0) { setAiMsgs(prev => prev.filter(m => m.id !== id)); return } // pesan lokal (gagal simpan), belum ada di DB
    if (!confirm('Hapus pesan ini?')) return
    const { error } = await supabase.from('chat_messages_ai').delete().eq('id', id)
    if (error) { alert(`Gagal hapus: ${error.message}`); return }
    setAiMsgs(prev => prev.filter(m => m.id !== id))
  }

  if (!myId) return null

  return (
    <>
      {!open && (
        <button onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-teal text-white shadow-xl flex items-center justify-center hover:brightness-110 transition">
          <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={ICON_CHAT} />
          </svg>
          {unreadTotal > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 rounded-full bg-red-500 text-white text-[11px] font-semibold flex items-center justify-center">
              {unreadTotal > 99 ? '99+' : unreadTotal}
            </span>
          )}
        </button>
      )}

      {open && (
        <div className="fixed bottom-6 right-6 z-50 w-[360px] h-[520px] max-h-[70vh] bg-white rounded-xl shadow-2xl border border-gray-100 flex flex-col overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2 flex-shrink-0 bg-navy text-white">
            {activeRoom !== null && (
              <button onClick={() => setActiveRoom(null)} className="text-white/70 hover:text-white">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
            )}
            <h3 className="font-semibold text-sm flex-1 truncate">{activeRoom === null ? 'Chat' : threadTitle}</h3>
            <button onClick={() => { setOpen(false); setActiveRoom(null) }} className="text-white/70 hover:text-white text-xl leading-none">×</button>
          </div>

          {activeRoom === null ? (
            <div className="flex-1 overflow-y-auto min-h-0">
              <div className="p-2 border-b border-gray-100 sticky top-0 bg-white">
                <input className="select-filter w-full text-sm" placeholder="Cari user / SKPD..."
                  value={search} onChange={e => setSearch(e.target.value)} />
              </div>
              <button onClick={() => setActiveRoom('ai')}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 text-left border-b border-gray-50">
                <div className="w-9 h-9 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={ICON_AI} />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800">Asisten AI</p>
                  <p className="text-xs text-gray-400 truncate">
                    {aiMsgs.length > 0 ? aiMsgs[aiMsgs.length - 1].content : 'Tanya apa saja'}
                  </p>
                </div>
              </button>
              <button onClick={() => setActiveRoom('public')}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 text-left border-b border-gray-50">
                <div className="w-9 h-9 rounded-full bg-teal/10 text-teal flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-1.13a4 4 0 100-8 4 4 0 000 8zm6 3v-1a4 4 0 00-3-3.87" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800">Publik / Chat Grup</p>
                  <p className="text-xs text-gray-400 truncate">
                    {publicMsgs.length > 0 ? publicMsgs[publicMsgs.length - 1].content : 'Obrolan bareng semua user'}
                  </p>
                </div>
                {unreadPublic > 0 && (
                  <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-semibold flex items-center justify-center flex-shrink-0">{unreadPublic}</span>
                )}
              </button>
              {kontakList.map(k => (
                <button key={k.id} onClick={() => setActiveRoom(k.id)}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 text-left border-b border-gray-50">
                  <div className="w-9 h-9 rounded-full bg-gray-100 text-gray-500 flex items-center justify-center flex-shrink-0 text-sm font-semibold">
                    {k.nama.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{k.nama}</p>
                    <p className="text-xs text-gray-400 truncate">{k.last ? k.last.content : (k.skpd || '—')}</p>
                  </div>
                  {k.unread > 0 && (
                    <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-semibold flex items-center justify-center flex-shrink-0">{k.unread}</span>
                  )}
                </button>
              ))}
              {kontakList.length === 0 && search && (
                <p className="text-xs text-gray-400 text-center py-6">Tidak ada user yang cocok.</p>
              )}
            </div>
          ) : activeRoom === 'ai' ? (
            <>
              <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
                {aiMsgs.length === 0 ? (
                  <p className="text-xs text-gray-400 text-center py-8">Belum ada percakapan. Tanya apa saja ke Asisten AI!</p>
                ) : aiMsgs.map((m, i) => {
                  const mine = m.role === 'user'
                  const prev = aiMsgs[i - 1]
                  const tglBaru = !prev || fmtTgl(prev.created_at) !== fmtTgl(m.created_at)
                  return (
                    <div key={m.id}>
                      {tglBaru && <p className="text-center text-[11px] text-gray-400 my-3">{fmtTgl(m.created_at)}</p>}
                      <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                        <div className={`group max-w-[75%] rounded-lg px-3 py-2 text-sm relative ${mine ? 'bg-teal text-white' : 'bg-indigo-50 text-gray-800'}`}>
                          {!mine && <p className="text-[11px] font-medium text-indigo-600 mb-0.5">Asisten AI</p>}
                          <p className="whitespace-pre-wrap break-words">{m.content}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <p className={`text-[10px] ${mine ? 'text-white/70' : 'text-gray-400'}`}>{fmtJam(m.created_at)}</p>
                            <button onClick={() => hapusAi(m.id)}
                              className={`text-[10px] opacity-0 group-hover:opacity-100 transition-opacity ${mine ? 'text-white/70 hover:text-white' : 'text-gray-400 hover:text-gray-600'}`}>
                              Hapus
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
                {aiBusy && (
                  <div className="flex justify-start">
                    <div className="bg-indigo-50 text-gray-500 rounded-lg px-3 py-2 text-sm italic">Asisten AI sedang mengetik...</div>
                  </div>
                )}
                <div ref={bottomRef} />
              </div>
              <form onSubmit={e => { e.preventDefault(); kirimAi() }} className="border-t border-gray-100 p-2 flex gap-2 flex-shrink-0">
                <input className="select-filter flex-1 text-sm" placeholder="Tanya sesuatu ke AI..." value={text}
                  onChange={e => setText(e.target.value)} maxLength={4000} disabled={aiBusy} />
                <button type="submit" disabled={aiBusy || !text.trim()} className="btn-primary text-sm px-3">Kirim</button>
              </form>
            </>
          ) : (
            <>
              <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
                {threadMsgs.length === 0 ? (
                  <p className="text-xs text-gray-400 text-center py-8">Belum ada pesan. Mulai obrolan!</p>
                ) : threadMsgs.map((m, i) => {
                  const mine = m.sender_id === myId
                  const prev = threadMsgs[i - 1]
                  const tglBaru = !prev || fmtTgl(prev.created_at) !== fmtTgl(m.created_at)
                  return (
                    <div key={m.id}>
                      {tglBaru && <p className="text-center text-[11px] text-gray-400 my-3">{fmtTgl(m.created_at)}</p>}
                      <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                        <div className={`group max-w-[75%] rounded-lg px-3 py-2 text-sm relative ${mine ? 'bg-teal text-white' : 'bg-gray-100 text-gray-800'}`}>
                          {!mine && activeRoom === 'public' && (
                            <p className="text-[11px] font-medium text-teal mb-0.5">{profiles[m.sender_id]?.nama || 'User'}</p>
                          )}
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
              <form onSubmit={e => { e.preventDefault(); kirim() }} className="border-t border-gray-100 p-2 flex gap-2 flex-shrink-0">
                <input className="select-filter flex-1 text-sm" placeholder="Ketik pesan..." value={text}
                  onChange={e => setText(e.target.value)} maxLength={4000} />
                <button type="submit" disabled={sending || !text.trim()} className="btn-primary text-sm px-3">Kirim</button>
              </form>
            </>
          )}
        </div>
      )}
    </>
  )
}
