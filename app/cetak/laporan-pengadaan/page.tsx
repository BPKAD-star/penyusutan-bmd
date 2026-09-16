'use client'
// Cetak Laporan Pengadaan format Permendagri 47/2021 (Format IV.A — aset tetap).
// Standalone (tanpa sidebar), A4 landscape. Query: ?periode=YYYY-Sx&skpd=<id>.
// Subtree SKPD dihitung ulang di sini dari `skpd` (URL ringkas — tak bawa daftar
// id). Isi tabel + footer diserahkan ke LaporanPengadaanTabel (satu sumber render).
import { useEffect, useState } from 'react'
import { fetchSkpd } from '@/lib/skpdMaster'
import { createClient } from '@/lib/supabase/client'
import LaporanPengadaanTabel from '@/components/pelaporan/LaporanPengadaanTabel'

type SkpdRow = { id: number; parent_id: number | null }

// Node + SEMUA turunannya (samakan dgn SkpdCombobox.descendants).
function descendantsOf(all: SkpdRow[], root: number): number[] {
  const childrenOf = new Map<number, number[]>()
  for (const s of all) {
    if (s.parent_id == null) continue
    const a = childrenOf.get(s.parent_id) || []; a.push(s.id); childrenOf.set(s.parent_id, a)
  }
  const out: number[] = []
  const stack = [root]
  const seen = new Set<number>()
  while (stack.length) {
    const id = stack.pop()!
    if (seen.has(id)) continue
    seen.add(id); out.push(id)
    for (const c of childrenOf.get(id) || []) stack.push(c)
  }
  return out
}

export default function CetakLaporanPengadaanPage() {
  const supabase = createClient()
  const [periode, setPeriode] = useState('')
  const [skpdId, setSkpdId] = useState<number | null>(null)
  const [descIds, setDescIds] = useState<number[] | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    (async () => {
      const q = new URLSearchParams(window.location.search)
      const per = q.get('periode') || ''
      const sk = q.get('skpd') ? Number(q.get('skpd')) : null
      setPeriode(per); setSkpdId(sk)
      if (sk) {
        const all = await fetchSkpd<SkpdRow>(supabase, 'id,parent_id')
        setDescIds(descendantsOf(all, sk))
      } else {
        setDescIds(null)
      }
      setReady(true)
    })()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="min-h-screen bg-gray-100 py-6 print:bg-white print:py-0">
      <style>{`@media print { .no-print { display: none !important; } @page { size: A4 landscape; margin: 1cm; } body { background: white; } }`}</style>

      <div className="max-w-[1400px] mx-auto mb-3 flex justify-end no-print px-4">
        <button onClick={() => window.print()} className="btn-primary text-sm">🖨 Cetak / Simpan PDF</button>
      </div>

      <div className="max-w-[1400px] mx-auto bg-white p-6 shadow print:shadow-none print:p-0">
        {ready
          ? <LaporanPengadaanTabel periode={periode} skpdId={skpdId} descIds={descIds} />
          : <p className="py-8 text-center text-gray-400 text-sm">Memuat…</p>}
      </div>
    </div>
  )
}
