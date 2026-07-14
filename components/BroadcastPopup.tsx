'use client'
// Popup pengumuman (broadcast) dari Pengelola Barang. Dipasang di
// DashboardChrome → muncul di halaman dashboard mana pun saat shell mount
// (login / reload penuh), BUKAN tiap navigasi internal SPA. Query jalan
// client-side ke Supabase, jadi status broadcast selalu terbaru walau halaman
// sebelumnya sempat ter-cache.
//
// Audiens: HANYA pengurus_barang & pengurus_pembantu (keputusan user
// 2026-07-14). Admin (pengelola) & pengawas tidak diganggu — mereka toh yang
// bikin / cuma baca-saja.
//
// "Sekali per pengumuman": tiap pengumuman aktif punya signature `id:updated_at`.
// Yang sudah ditutup user disimpan di localStorage; begitu isinya diedit
// (updated_at berubah) atau ada pengumuman baru, signature-nya beda → muncul
// lagi. Tanpa read-receipt / tabel tracking DB.
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type Broadcast = { id: string; judul: string; isi: string; updated_at: string }

const AUDIENS = ['pengurus_barang', 'pengurus_pembantu']
const LS_KEY = 'bmd_broadcast_ditutup' // array of "id:updated_at" yang sudah ditutup

const sig = (b: Broadcast) => `${b.id}:${b.updated_at}`

function ditutupSet(): Set<string> {
  if (typeof window === 'undefined') return new Set()
  try {
    const raw = localStorage.getItem(LS_KEY)
    return new Set(raw ? (JSON.parse(raw) as string[]) : [])
  } catch {
    return new Set()
  }
}

const fmtTgl = (s: string) =>
  new Date(s).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })

export default function BroadcastPopup({ userRole }: { userRole: string }) {
  const supabase = createClient()
  const [items, setItems] = useState<Broadcast[]>([]) // pengumuman aktif yg BELUM ditutup

  useEffect(() => {
    if (!AUDIENS.includes(userRole)) return
    ;(async () => {
      const { data } = await supabase
        .from('admin_broadcast')
        .select('id,judul,isi,updated_at')
        .eq('aktif', true)
        .order('updated_at', { ascending: false })
      const aktif = (data as Broadcast[] | null) || []
      const ditutup = ditutupSet()
      setItems(aktif.filter(b => !ditutup.has(sig(b))))
    })()
  }, [userRole]) // eslint-disable-line react-hooks/exhaustive-deps

  function tutup() {
    try {
      const gabung = new Set([...ditutupSet(), ...items.map(sig)])
      localStorage.setItem(LS_KEY, JSON.stringify([...gabung]))
    } catch {
      /* localStorage penuh/diblokir — abaikan, popup tetap ketutup utk sesi ini */
    }
    setItems([])
  }

  if (items.length === 0) return null

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40" role="dialog" aria-modal="true">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col">
        <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100">
          <div className="inline-flex items-center justify-center w-9 h-9 bg-teal/10 text-teal rounded-lg flex-shrink-0">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
            </svg>
          </div>
          <div>
            <h2 className="text-base font-semibold text-gray-900">Pengumuman</h2>
            <p className="text-xs text-gray-400">Dari Pengelola Barang</p>
          </div>
        </div>

        <div className="px-6 py-4 overflow-y-auto space-y-5">
          {items.map(b => (
            <div key={b.id}>
              <div className="flex items-baseline justify-between gap-3 mb-1">
                <h3 className="text-sm font-semibold text-gray-800">{b.judul}</h3>
                <span className="text-xs text-gray-400 flex-shrink-0">{fmtTgl(b.updated_at)}</span>
              </div>
              <p className="text-sm text-gray-600 whitespace-pre-wrap leading-relaxed">{b.isi}</p>
            </div>
          ))}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex justify-end">
          <button onClick={tutup} className="btn-primary">Mengerti</button>
        </div>
      </div>
    </div>
  )
}
