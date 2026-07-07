'use client'
// Kartu "Mutasi & Transfer" + donut disetujui/menunggu, sama pola dgn
// CaraPerolehanCards. "Transfer Keluar" & "Transfer Masuk" (begitu juga
// "Pengeluaran"/"Penerimaan" Internal) menampilkan angka yang SAMA — dashboard
// ini global (bukan per-SKPD), jadi keluar dari SKPD A = masuk ke SKPD B,
// satu set jurnal_header yang sama, cuma dilabeli dari dua sisi.
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

const nf = (n: number) => n.toLocaleString('id-ID')

type Kategori = 'pengalihan_status' | 'mutasi_internal'

export default function MutasiTransferCards({ approved }: {
  approved: { transfer: number; mutasiInternal: number }
}) {
  const supabase = createClient()
  const [pending, setPending] = useState({ transfer: 0, mutasiInternal: 0 })

  useEffect(() => {
    (async () => {
      async function pendingCount(kategori: Kategori): Promise<number> {
        let total = 0
        for (let from = 0; ; from += 500) {
          const { data } = await supabase.from('jurnal_header').select('payload')
            .eq('kategori', kategori).eq('approval_status', 'pending').range(from, from + 499)
          if (!data || data.length === 0) break
          for (const r of data as { payload: { draft_items?: unknown[] } }[]) total += r.payload?.draft_items?.length || 0
          if (data.length < 500) break
        }
        return total
      }
      const [transfer, mutasiInternal] = await Promise.all([
        pendingCount('pengalihan_status'),
        pendingCount('mutasi_internal'),
      ])
      setPending({ transfer, mutasiInternal })
    })()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const cards = [
    { key: 'transfer-keluar', label: 'Transfer Keluar SKPD', note: 'Pengalihan status — sisi pengirim', disetujui: approved.transfer, belum: pending.transfer },
    { key: 'transfer-masuk', label: 'Transfer Masuk SKPD', note: 'Pengalihan status — sisi penerima', disetujui: approved.transfer, belum: pending.transfer },
    { key: 'keluar-internal', label: 'Pengeluaran Internal', note: 'Mutasi antar sub-SKPD — sisi pengirim', disetujui: approved.mutasiInternal, belum: pending.mutasiInternal },
    { key: 'masuk-internal', label: 'Penerimaan Internal', note: 'Mutasi antar sub-SKPD — sisi penerima', disetujui: approved.mutasiInternal, belum: pending.mutasiInternal },
  ]

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {cards.map(c => <DonutCard key={c.key} label={c.label} note={c.note} disetujui={c.disetujui} belum={c.belum} />)}
    </div>
  )
}

function DonutCard({ label, note, disetujui, belum }: {
  label: string; note: string; disetujui: number; belum: number
}) {
  const total = disetujui + belum
  const pct = total > 0 ? Math.round((disetujui / total) * 100) : 100
  return (
    <div className="card p-4">
      <p className="text-xs text-gray-600 leading-tight h-8">{label}</p>
      <div className="flex items-center gap-3 mt-1">
        <div
          className="relative flex-shrink-0"
          style={{ width: 56, height: 56, borderRadius: '50%', background: `conic-gradient(#0d9488 ${pct}%, #fbbf24 ${pct}% 100%)` }}
          title={`${pct}% disetujui`}
        >
          <div className="absolute inset-[5px] bg-white rounded-full flex items-center justify-center">
            <span className="text-[10px] font-semibold text-gray-700">{pct}%</span>
          </div>
        </div>
        <div className="text-xs space-y-1">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-teal inline-block" />
            <span className="text-gray-700">{nf(disetujui)} disetujui</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />
            <span className="text-gray-700">{nf(belum)} menunggu</span>
          </div>
        </div>
      </div>
      <p className="text-[11px] text-gray-400 mt-1 leading-tight">{note}</p>
    </div>
  )
}
