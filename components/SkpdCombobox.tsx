'use client'
// Combobox pencarian SKPD / Sub OPD / Sub Sub OPD (Lokasi) — ketik utk filter,
// pilih node level mana pun (bukan cuma SKPD induk) sbg satu nilai skpd_id.
// Beda dari OrgFilter (yang emit descendantIds utk filter laporan bertingkat):
// ini utk memilih SATU pemilik/lokasi barang yang pasti (form entry).
import { useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type SkpdRow = { id: number; nama: string; level: number; parent_id: number | null }

export default function SkpdCombobox({ value, onChange, placeholder }: {
  value: string
  onChange: (id: string) => void
  placeholder?: string
}) {
  const supabase = createClient()
  const [all, setAll] = useState<SkpdRow[]>([])
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    (async () => {
      const rows: SkpdRow[] = []
      for (let from = 0; ; from += 1000) {
        const { data } = await supabase.from('skpd').select('id,nama,level,parent_id').range(from, from + 999)
        if (!data || data.length === 0) break
        rows.push(...(data as SkpdRow[]))
        if (data.length < 1000) break
      }
      setAll(rows)
    })()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const byId = useMemo(() => new Map(all.map(s => [s.id, s])), [all])
  function pathOf(id: number): string {
    const parts: string[] = []
    let cur = byId.get(id)
    const seen = new Set<number>()
    while (cur && !seen.has(cur.id)) {
      seen.add(cur.id)
      parts.unshift(cur.nama)
      cur = cur.parent_id != null ? byId.get(cur.parent_id) : undefined
    }
    return parts.join(' › ')
  }

  const options = useMemo(
    () => all.map(s => ({ id: s.id, label: pathOf(s.id) })).sort((a, b) => a.label.localeCompare(b.label)),
    [all, byId] // eslint-disable-line react-hooks/exhaustive-deps
  )

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  const selectedLabel = value ? pathOf(Number(value)) : ''
  const q = query.trim().toLowerCase()
  const filtered = q ? options.filter(o => o.label.toLowerCase().includes(q)).slice(0, 50) : options.slice(0, 50)

  return (
    <div className="relative flex-1" ref={boxRef}>
      <input
        className="select-filter w-full"
        placeholder={placeholder || 'Ketik utk cari SKPD / Sub OPD / Lokasi...'}
        value={open ? query : selectedLabel}
        onFocus={() => { setOpen(true); setQuery('') }}
        onChange={e => setQuery(e.target.value)}
      />
      {open && (
        <div className="absolute z-20 mt-1 w-full max-h-64 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg divide-y divide-gray-50">
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-xs text-gray-400">Tidak ditemukan.</div>
          ) : filtered.map(o => (
            <button key={o.id} type="button"
              onClick={() => { onChange(String(o.id)); setOpen(false); setQuery('') }}
              className="w-full text-left px-3 py-2 hover:bg-teal/5 text-xs text-gray-700">
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
