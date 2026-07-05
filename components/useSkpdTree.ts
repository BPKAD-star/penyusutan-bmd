'use client'
// Muat pohon SKPD sekali, sediakan pemetaan id → SKPD level-1 (root). Dipakai
// rekap Model 2 (per SKPD per jenis) untuk mengelompokkan barang ke induk SKPD-nya.
import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export type SkpdNode = { id: number; nama: string; level: number; parent_id: number | null }

export function useSkpdTree() {
  const [all, setAll] = useState<SkpdNode[]>([])

  useEffect(() => {
    const supabase = createClient()
    ;(async () => {
      const rows: SkpdNode[] = []
      for (let from = 0; ; from += 1000) {
        const { data } = await supabase.from('skpd').select('id,nama,level,parent_id').range(from, from + 999)
        if (!data || data.length === 0) break
        rows.push(...(data as SkpdNode[]))
        if (data.length < 1000) break
      }
      setAll(rows)
    })()
  }, [])

  const byId = useMemo(() => new Map(all.map(s => [s.id, s])), [all])

  // SKPD level-1 (root) dari id manapun; naik lewat parent_id sampai mentok.
  function rootOf(id: number): SkpdNode | null {
    let cur = byId.get(id) || null
    const seen = new Set<number>()
    while (cur && cur.parent_id != null && byId.has(cur.parent_id) && !seen.has(cur.id)) {
      seen.add(cur.id)
      cur = byId.get(cur.parent_id)!
    }
    return cur
  }

  return { all, byId, rootOf, loaded: all.length > 0 }
}
