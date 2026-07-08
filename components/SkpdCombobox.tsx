'use client'
// Combobox pencarian SKPD / Sub OPD / Sub Sub OPD (Lokasi) — ketik utk filter,
// panah bawah/atas utk pindah sorotan, Enter utk pilih. Bisa pilih node level mana
// pun (bukan cuma SKPD induk). Dipakai di SEMUA menu sebagai pengganti <select>.
//   - onChange(id)          : untuk form entry (pilih SATU pemilik/lokasi pasti).
//   - onChangeSelection(sel): untuk laporan/filter (pilih node + SEMUA turunannya
//                             → descendantIds utk query .in('skpd_id', ...)).
import { useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type SkpdRow = { id: number; nama: string; level: number; parent_id: number | null }
export type SkpdSelection = { skpdId: number | null; descendantIds: number[] | null }

export default function SkpdCombobox({ value, onChange, onChangeSelection, placeholder, allowClear, rootOnly }: {
  value?: string
  onChange?: (id: string) => void
  onChangeSelection?: (sel: SkpdSelection) => void
  placeholder?: string
  allowClear?: boolean
  rootOnly?: boolean // hanya SKPD induk (parent_id null) — dipakai target Pengalihan Status
}) {
  const supabase = createClient()
  const [all, setAll] = useState<SkpdRow[]>([])
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [hi, setHi] = useState(0)
  const [internalId, setInternalId] = useState('') // dipakai kalau `value` tak dikontrol (menu laporan)
  const boxRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const effectiveId = value !== undefined ? value : internalId

  useEffect(() => {
    (async () => {
      const rows: SkpdRow[] = []
      for (let from = 0; ; from += 1000) {
        const { data } = await supabase.from('admin_skpd').select('id,nama,level,parent_id').range(from, from + 999)
        if (!data || data.length === 0) break
        rows.push(...(data as SkpdRow[]))
        if (data.length < 1000) break
      }
      setAll(rows)
    })()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const byId = useMemo(() => new Map(all.map(s => [s.id, s])), [all])
  const childrenOf = useMemo(() => {
    const m = new Map<number, number[]>()
    for (const s of all) if (s.parent_id != null) { const a = m.get(s.parent_id) || []; a.push(s.id); m.set(s.parent_id, a) }
    return m
  }, [all])

  function pathOf(id: number): string {
    const parts: string[] = []
    let cur = byId.get(id)
    const seen = new Set<number>()
    while (cur && !seen.has(cur.id)) { seen.add(cur.id); parts.unshift(cur.nama); cur = cur.parent_id != null ? byId.get(cur.parent_id) : undefined }
    return parts.join(' › ')
  }
  function descendants(id: number): number[] {
    const out = [id]; const stack = [id]
    while (stack.length) { const cur = stack.pop()!; for (const c of childrenOf.get(cur) || []) { out.push(c); stack.push(c) } }
    return out
  }

  const options = useMemo(
    () => all.filter(s => !rootOnly || s.parent_id == null)
      .map(s => ({ id: s.id, label: pathOf(s.id) })).sort((a, b) => a.label.localeCompare(b.label)),
    [all, byId, rootOnly] // eslint-disable-line react-hooks/exhaustive-deps
  )

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  const selectedLabel = effectiveId ? pathOf(Number(effectiveId)) : ''
  const q = query.trim().toLowerCase()
  const filtered = useMemo(
    () => (q ? options.filter(o => o.label.toLowerCase().includes(q)) : options).slice(0, 60),
    [q, options]
  )

  function pilih(id: number) {
    setInternalId(String(id))
    onChange?.(String(id))
    onChangeSelection?.({ skpdId: id, descendantIds: descendants(id) })
    setOpen(false); setQuery('')
  }
  function clear() {
    setInternalId('')
    onChange?.('')
    onChangeSelection?.({ skpdId: null, descendantIds: null })
    setOpen(false); setQuery('')
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter')) { setOpen(true); setQuery(''); setHi(0); return }
    if (e.key === 'ArrowDown') { e.preventDefault(); setHi(h => Math.min(h + 1, filtered.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi(h => Math.max(h - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); if (filtered[hi]) pilih(filtered[hi].id) }
    else if (e.key === 'Escape') { setOpen(false) }
  }

  useEffect(() => {
    if (!open || !listRef.current) return
    const el = listRef.current.children[hi] as HTMLElement | undefined
    el?.scrollIntoView({ block: 'nearest' })
  }, [hi, open])

  return (
    <div className="relative flex-1" ref={boxRef}>
      <div className="flex items-center gap-2">
        <input
          className="select-filter w-full"
          placeholder={placeholder || 'Ketik utk cari SKPD / Sub OPD / Lokasi...'}
          value={open ? query : selectedLabel}
          onFocus={() => { setOpen(true); setQuery(''); setHi(0) }}
          onChange={e => { setQuery(e.target.value); setHi(0); if (!open) setOpen(true) }}
          onKeyDown={onKeyDown}
        />
        {allowClear && effectiveId && !open && (
          <button type="button" onClick={clear} title="Kosongkan"
            className="text-gray-400 hover:text-gray-600 text-lg leading-none flex-shrink-0">×</button>
        )}
      </div>
      {open && (
        <div ref={listRef} className="absolute z-20 mt-1 w-full max-h-64 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg divide-y divide-gray-50">
          {allowClear && (
            <button type="button" onClick={clear} className="w-full text-left px-3 py-2 hover:bg-gray-50 text-xs text-gray-500 italic">— Semua / kosongkan —</button>
          )}
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-xs text-gray-400">Tidak ditemukan.</div>
          ) : filtered.map((o, i) => (
            <button key={o.id} type="button"
              onMouseEnter={() => setHi(i)}
              onClick={() => pilih(o.id)}
              className={`w-full text-left px-3 py-2 text-xs ${i === hi ? 'bg-teal/10 text-gray-800' : 'text-gray-700 hover:bg-teal/5'}`}>
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
