'use client'
// Filter organisasi bertingkat ala e-SIMBADA: SKPD (Unit) → Sub OPD (Sub Unit)
// → Sub Sub OPD (Lokasi). Pilih granularitas lewat radio; select cascading.
// Emit { skpdId, descendantIds } — descendantIds = node terpilih + semua turunannya
// (dipakai query .in('skpd_id', ...)). Null = semua SKPD.
import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export type Skpd = { id: number; nama: string; level: number; parent_id: number | null }
export type OrgSelection = { skpdId: number | null; descendantIds: number[] | null }

const LEVELS = [
  { key: 1, label: 'SKPD' },
  { key: 2, label: 'Sub OPD' },
  { key: 3, label: 'Sub Sub OPD' },
] as const

export default function OrgFilter({ onChange }: { onChange: (sel: OrgSelection) => void }) {
  const supabase = createClient()
  const [all, setAll] = useState<Skpd[]>([])
  const [granular, setGranular] = useState<1 | 2 | 3>(1)
  const [l1, setL1] = useState('')
  const [l2, setL2] = useState('')
  const [l3, setL3] = useState('')

  useEffect(() => {
    (async () => {
      const rows: Skpd[] = []
      for (let from = 0; ; from += 1000) {
        const { data } = await supabase.from('skpd').select('id,nama,level,parent_id').range(from, from + 999)
        if (!data || data.length === 0) break
        rows.push(...(data as Skpd[]))
        if (data.length < 1000) break
      }
      setAll(rows)
    })()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const childrenOf = useMemo(() => {
    const m = new Map<number, Skpd[]>()
    for (const s of all) {
      if (s.parent_id == null) continue
      const arr = m.get(s.parent_id) || []
      arr.push(s)
      m.set(s.parent_id, arr)
    }
    for (const arr of m.values()) arr.sort((a, b) => a.nama.localeCompare(b.nama))
    return m
  }, [all])

  const level1 = useMemo(() => all.filter(s => s.level === 1).sort((a, b) => a.nama.localeCompare(b.nama)), [all])
  const level2 = l1 ? (childrenOf.get(Number(l1)) || []) : []
  const level3 = l2 ? (childrenOf.get(Number(l2)) || []) : []

  // Node terpilih terdalam sesuai granularitas
  function selectedId(): number | null {
    if (granular === 1) return l1 ? Number(l1) : null
    if (granular === 2) return l2 ? Number(l2) : (l1 ? Number(l1) : null)
    return l3 ? Number(l3) : (l2 ? Number(l2) : (l1 ? Number(l1) : null))
  }

  function descendants(id: number): number[] {
    const out = [id]
    const stack = [id]
    while (stack.length) {
      const cur = stack.pop()!
      for (const c of childrenOf.get(cur) || []) { out.push(c.id); stack.push(c.id) }
    }
    return out
  }

  useEffect(() => {
    const id = selectedId()
    onChange(id == null ? { skpdId: null, descendantIds: null } : { skpdId: id, descendantIds: descendants(id) })
  }, [granular, l1, l2, l3, all]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-3">
      {/* Radio granularitas */}
      <div className="flex items-center gap-3">
        <label className="w-40 text-sm text-gray-600 text-right flex-shrink-0">Tingkat :</label>
        <div className="flex gap-4">
          {LEVELS.map(lv => (
            <label key={lv.key} className="flex items-center gap-1.5 text-sm cursor-pointer">
              <input type="radio" name="granular" checked={granular === lv.key}
                onChange={() => { setGranular(lv.key); if (lv.key < 3) setL3(''); if (lv.key < 2) setL2('') }} />
              {lv.label}
            </label>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <label className="w-40 text-sm text-gray-600 text-right flex-shrink-0">SKPD :</label>
        <select className="select-filter flex-1" value={l1} onChange={e => { setL1(e.target.value); setL2(''); setL3('') }}>
          <option value="">Semua SKPD</option>
          {level1.map(s => <option key={s.id} value={s.id}>{s.nama}</option>)}
        </select>
      </div>

      {granular >= 2 && (
        <div className="flex items-center gap-3">
          <label className="w-40 text-sm text-gray-600 text-right flex-shrink-0">Sub OPD :</label>
          <select className="select-filter flex-1" value={l2} disabled={!l1}
            onChange={e => { setL2(e.target.value); setL3('') }}>
            <option value="">{l1 ? 'Semua Sub OPD' : '— pilih SKPD dulu —'}</option>
            {level2.map(s => <option key={s.id} value={s.id}>{s.nama}</option>)}
          </select>
        </div>
      )}

      {granular >= 3 && (
        <div className="flex items-center gap-3">
          <label className="w-40 text-sm text-gray-600 text-right flex-shrink-0">Sub Sub OPD :</label>
          <select className="select-filter flex-1" value={l3} disabled={!l2}
            onChange={e => setL3(e.target.value)}>
            <option value="">{l2 ? 'Semua Sub Sub OPD' : '— pilih Sub OPD dulu —'}</option>
            {level3.map(s => <option key={s.id} value={s.id}>{s.nama}</option>)}
          </select>
        </div>
      )}
    </div>
  )
}
