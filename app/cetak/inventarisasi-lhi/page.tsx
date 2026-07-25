'use client'
// Cetak Laporan Hasil Inventarisasi (LHI) — Format III.B.1–III.B.11.
// Standalone (tanpa sidebar), A4 landscape. Query:
//   ?tahun=2026&golongan=1.3.3&kode=III.B.7[&skpd=<id>]
// Subtree SKPD dihitung ulang di sini (URL ringkas, tak membawa daftar id) —
// pola sama dgn app/cetak/laporan-pengadaan/page.tsx.
import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import LhiTabel from '@/components/inventarisasi/LhiTabel'
import { useLhiData } from '@/components/inventarisasi/useLhiData'
import { konfigLki, type LhiKode } from '@/lib/inventarisasi'
import { nilaiBarisLhi } from '@/lib/inventarisasiLaporan'

type SkpdRow = { id: number; parent_id: number | null }

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

const tglID = () => new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })

export default function CetakLhiPage() {
  const supabase = createClient()
  const [siap, setSiap] = useState(false)
  const [tahun, setTahun] = useState(new Date().getFullYear())
  const [golongan, setGolongan] = useState('1.3.3')
  const [kode, setKode] = useState<LhiKode>('III.B.7')
  const [skpdId, setSkpdId] = useState<number | null>(null)
  const [skpdIds, setSkpdIds] = useState<number[] | null>(null)

  useEffect(() => {
    (async () => {
      const q = new URLSearchParams(window.location.search)
      const t = Number(q.get('tahun')) || new Date().getFullYear()
      const g = q.get('golongan') || '1.3.3'
      const k = (q.get('kode') as LhiKode) || 'III.B.7'
      const sk = q.get('skpd') ? Number(q.get('skpd')) : null
      setTahun(t); setGolongan(g); setKode(k); setSkpdId(sk)

      if (sk) {
        const all: SkpdRow[] = []
        for (let from = 0; ; from += 1000) {
          const { data } = await supabase.from('admin_skpd').select('id,parent_id').range(from, from + 999)
          if (!data || data.length === 0) break
          all.push(...(data as SkpdRow[]))
          if (data.length < 1000) break
        }
        setSkpdIds(descendantsOf(all, sk))
      }
      setSiap(true)
    })()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const { headers, loading, barisUntuk } = useLhiData({ tahun, golongan, skpdIds })
  const rows = useMemo(
    () => (siap ? barisUntuk(kode).map((b, i) => nilaiBarisLhi(kode, b, i + 1)) : []),
    [siap, barisUntuk, kode],
  )
  const namaSkpd = skpdId ? headers.find(h => h.skpd_id === skpdId)?.skpd?.nama : undefined
  const petugas = headers[0]?.petugas || []

  return (
    <div className="min-h-screen bg-gray-100 py-6 print:bg-white print:py-0">
      <style>{`@media print { .no-print { display: none !important; } @page { size: A4 landscape; margin: 1cm; } body { background: white; } }`}</style>

      <div className="max-w-[1400px] mx-auto mb-3 flex justify-end no-print px-4">
        <button onClick={() => window.print()} className="btn-primary text-sm">🖨 Cetak / Simpan PDF</button>
      </div>

      <div className="max-w-[1400px] mx-auto bg-white p-6 shadow print:shadow-none print:p-0">
        {!siap || loading ? (
          <p className="py-8 text-center text-gray-400 text-sm">Memuat…</p>
        ) : (
          <>
            <LhiTabel kode={kode} rows={rows}
              periodeLabel={`${konfigLki(golongan).label} — Tahun ${tahun}`}
              judulSkpd={namaSkpd || (skpdId ? `#${skpdId}` : 'Seluruh Kabupaten')} />

            <div className="mt-8 flex justify-between text-[11px]">
              <div>
                {petugas.length > 0 && (
                  <>
                    <p className="font-semibold mb-1">Pelaksana / Petugas Inventarisasi</p>
                    <ol className="list-decimal ml-4 space-y-0.5">
                      {petugas.map(p => <li key={p.pegawai_id}>{p.nama}{p.nip ? ` — NIP. ${p.nip}` : ''}</li>)}
                    </ol>
                  </>
                )}
              </div>
              <div className="text-center">
                <p>Kediri, {tglID()}</p>
                <p>Kuasa Pengguna Barang, Pengguna Barang atau Pengelola Barang</p>
                <div className="h-16" />
                <p className="font-semibold underline">(………………………………)</p>
                <p>NIP. ……………………………</p>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
