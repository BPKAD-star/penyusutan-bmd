'use client'
// Kartu "Penghapusan Barang" — 4 kartu mekanisme pemindahtanganan (Hibah,
// Penjualan, Tukar Menukar, Penyertaan Modal) + 1 kartu Sebab Lainnya. Klik
// kartu (kalau ada isinya) → popup rincian per SKPD (jumlah barang + total
// nilai + daftar barang), sama pola dgn MutasiTransferCards.
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatRupiah } from '@/lib/export'
import { backdropClose } from '@/components/backdropClose'

export type PenghapusanCount = { n: number; nilai: number }
export type PenghapusanData = Record<'hibah' | 'jual' | 'tukar' | 'modal' | 'sebabLain', PenghapusanCount>

type Kartu = { key: string; label: string; jenis: string; subJenis: string | null; note?: string } & PenghapusanCount

export default function PenghapusanCards({ data }: { data: PenghapusanData }) {
  const [detail, setDetail] = useState<{ label: string; jenis: string; subJenis: string | null } | null>(null)

  const kartu: Kartu[] = [
    { key: 'hibah', label: 'Karena Hibah', jenis: 'penghapusan_pemindahtanganan', subJenis: 'hibah', ...data.hibah },
    { key: 'jual', label: 'Karena Penjualan', jenis: 'penghapusan_pemindahtanganan', subJenis: 'penjualan', ...data.jual },
    { key: 'tukar', label: 'Karena Tukar Menukar', jenis: 'penghapusan_pemindahtanganan', subJenis: 'tukar_menukar', ...data.tukar },
    { key: 'modal', label: 'Karena Penyertaan Modal', jenis: 'penghapusan_pemindahtanganan', subJenis: 'penyertaan_modal', ...data.modal },
    { key: 'sebabLain', label: 'Karena Sebab Lainnya', jenis: 'penghapusan_sebab_lain', subJenis: null, note: 'Force majeure, dsb.', ...data.sebabLain },
  ]

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {kartu.map(k => (
          <button key={k.key} type="button" disabled={k.n === 0}
            onClick={() => setDetail({ label: k.label, jenis: k.jenis, subJenis: k.subJenis })}
            className="card p-4 text-left hover:border-teal transition-colors disabled:cursor-default disabled:hover:border-gray-100">
            <p className="text-xs text-gray-600 leading-tight h-8">{k.label}</p>
            <p className="text-xl font-bold text-gray-900 mt-1">{k.n.toLocaleString('id-ID')}</p>
            <p className="text-xs font-medium text-rose-600 mt-1">{formatRupiah(k.nilai)}</p>
            {k.note && <p className="text-[11px] text-gray-400 mt-1 leading-tight">{k.note}</p>}
          </button>
        ))}
      </div>
      {detail && (
        <DetailModal label={detail.label} jenis={detail.jenis} subJenis={detail.subJenis} onClose={() => setDetail(null)} />
      )}
    </>
  )
}

function DetailModal({ label, jenis, subJenis, onClose }: { label: string; jenis: string; subJenis: string | null; onClose: () => void }) {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [groups, setGroups] = useState<{ skpdNama: string; n: number; total: number; items: { nama_barang: string | null; nibar: string | null; nilai: number }[] }[]>([])

  useEffect(() => {
    (async () => {
      const skpdMap: Record<number, string> = {}
      for (let from = 0; ; from += 1000) {
        const { data } = await supabase.from('admin_skpd').select('id,nama').range(from, from + 999)
        if (!data || data.length === 0) break
        for (const s of data as { id: number; nama: string }[]) skpdMap[s.id] = s.nama
        if (data.length < 1000) break
      }
      const rows: {
        skpd_asal: number; nilai: number; payload: { sub_jenis?: string } | null
        aset: { nama_barang: string | null; nibar: string | null; status: string } | null
      }[] = []
      for (let from = 0; ; from += 1000) {
        const { data } = await supabase.from('transaksi_bmd')
          .select('skpd_asal,nilai,payload,aset:aset_id(nama_barang,nibar,status)')
          .eq('jenis', jenis).range(from, from + 999)
        if (!data || data.length === 0) break
        rows.push(...(data as unknown as typeof rows))
        if (data.length < 1000) break
      }
      const groupMap = new Map<number, { n: number; total: number; items: { nama_barang: string | null; nibar: string | null; nilai: number }[] }>()
      for (const r of rows) {
        if (!r.aset || r.aset.status !== 'dihapus') continue
        if (subJenis && r.payload?.sub_jenis !== subJenis) continue
        const g = groupMap.get(r.skpd_asal) || { n: 0, total: 0, items: [] }
        g.n += 1
        g.total += r.nilai || 0
        g.items.push({ nama_barang: r.aset.nama_barang, nibar: r.aset.nibar, nilai: r.nilai })
        groupMap.set(r.skpd_asal, g)
      }
      const out = [...groupMap.entries()]
        .map(([id, g]) => ({ skpdNama: skpdMap[id] || `SKPD #${id}`, ...g }))
        .sort((a, b) => a.skpdNama.localeCompare(b.skpdNama))
      setGroups(out)
      setLoading(false)
    })()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" {...backdropClose(onClose)}>
      <div className="card w-full max-w-2xl max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white">
          <h3 className="font-semibold text-gray-800">{label} — Rincian per SKPD</h3>
          <button className="text-gray-400 hover:text-gray-700 text-xl leading-none" onClick={onClose}>×</button>
        </div>
        <div className="p-5">
          {loading ? (
            <p className="text-sm text-gray-400 text-center py-8">Memuat...</p>
          ) : groups.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">Belum ada data.</p>
          ) : (
            <div className="space-y-4">
              {groups.map(g => (
                <div key={g.skpdNama}>
                  <div className="flex items-baseline justify-between mb-2">
                    <p className="text-sm font-semibold text-gray-800">{g.skpdNama}</p>
                    <p className="text-xs text-gray-500">{g.n} barang · <span className="text-rose-600 font-medium">{formatRupiah(g.total)}</span></p>
                  </div>
                  <ul className="border border-gray-100 rounded-lg divide-y divide-gray-50">
                    {g.items.map((it, i) => (
                      <li key={i} className="px-3 py-2 flex items-center justify-between text-xs">
                        <span className="text-gray-700">{it.nama_barang || '-'} <span className="text-gray-400">({it.nibar || '-'})</span></span>
                        <span className="text-gray-600 flex-shrink-0 ml-3">{formatRupiah(it.nilai)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
