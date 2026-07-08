'use client'
// Tabel rekap Model 3 — Laporan Mutasi BMD (Saldo Awal + Penambahan −
// Pengurangan = Saldo Akhir) per golongan, nilai perolehan saja. Klik angka
// Penambahan/Pengurangan → modal breakdown per kategori sumbernya (pola sama
// dgn drill-down di components/dashboard/MutasiTransferCards.tsx).
import { useMemo, useState } from 'react'
import { formatRupiah } from '@/lib/export'

export type MutasiRow = {
  kode: string
  uraian: string
  saldoAwal: number
  penambahan: number
  pengurangan: number
  saldoAkhir: number
}

export type MutasiDetailLine = {
  kategori: string
  tanggal: string
  skpdNama: string
  namaBarang: string | null
  nibar: string | null
  nilai: number
}

export type MutasiDetail = Record<string, { tambah: MutasiDetailLine[]; kurang: MutasiDetailLine[] }>

export default function RekapMutasiTable({ rows, detail, loading }: {
  rows: MutasiRow[]
  detail: MutasiDetail
  loading: boolean
}) {
  const [modal, setModal] = useState<{ kode: string; uraian: string; arah: 'tambah' | 'kurang' } | null>(null)

  const tot = rows.reduce((a, r) => ({
    saldoAwal: a.saldoAwal + r.saldoAwal,
    penambahan: a.penambahan + r.penambahan,
    pengurangan: a.pengurangan + r.pengurangan,
    saldoAkhir: a.saldoAkhir + r.saldoAkhir,
  }), { saldoAwal: 0, penambahan: 0, pengurangan: 0, saldoAkhir: 0 })

  const modalLines = modal ? (detail[modal.kode]?.[modal.arah] || []) : []

  return (
    <>
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="table-th">Kode Jenis</th>
                <th className="table-th">Uraian</th>
                <th className="table-th text-right">Saldo Awal</th>
                <th className="table-th text-right">Penambahan</th>
                <th className="table-th text-right">Pengurangan</th>
                <th className="table-th text-right">Saldo Akhir</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr><td colSpan={6} className="table-td text-center py-12 text-gray-400">Memuat data...</td></tr>
              ) : rows.map(r => (
                <tr key={r.kode}>
                  <td className="table-td text-xs">{r.kode}</td>
                  <td className="table-td text-xs font-medium">{r.uraian}</td>
                  <td className="table-td text-right text-xs">{formatRupiah(r.saldoAwal)}</td>
                  <td className="table-td text-right text-xs">
                    {r.penambahan > 0 ? (
                      <button className="text-teal hover:underline" onClick={() => setModal({ kode: r.kode, uraian: r.uraian, arah: 'tambah' })}>
                        {formatRupiah(r.penambahan)}
                      </button>
                    ) : formatRupiah(0)}
                  </td>
                  <td className="table-td text-right text-xs">
                    {r.pengurangan > 0 ? (
                      <button className="text-red-600 hover:underline" onClick={() => setModal({ kode: r.kode, uraian: r.uraian, arah: 'kurang' })}>
                        {formatRupiah(r.pengurangan)}
                      </button>
                    ) : formatRupiah(0)}
                  </td>
                  <td className="table-td text-right text-xs font-medium">{formatRupiah(r.saldoAkhir)}</td>
                </tr>
              ))}
            </tbody>
            {!loading && rows.length > 0 && (
              <tfoot className="bg-gray-100 border-t-2 border-gray-200">
                <tr>
                  <td className="table-td text-xs font-bold" colSpan={2}>TOTAL</td>
                  <td className="table-td text-right text-xs font-bold">{formatRupiah(tot.saldoAwal)}</td>
                  <td className="table-td text-right text-xs font-bold">{formatRupiah(tot.penambahan)}</td>
                  <td className="table-td text-right text-xs font-bold">{formatRupiah(tot.pengurangan)}</td>
                  <td className="table-td text-right text-xs font-bold text-teal">{formatRupiah(tot.saldoAkhir)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {modal && (
        <DetailModal
          title={`${modal.uraian} (${modal.kode}) — ${modal.arah === 'tambah' ? 'Penambahan' : 'Pengurangan'}`}
          lines={modalLines}
          onClose={() => setModal(null)}
        />
      )}
    </>
  )
}

function DetailModal({ title, lines, onClose }: { title: string; lines: MutasiDetailLine[]; onClose: () => void }) {
  const groups = useMemo(() => {
    const m = new Map<string, { total: number; lines: MutasiDetailLine[] }>()
    for (const l of lines) {
      const g = m.get(l.kategori) || { total: 0, lines: [] }
      g.total += l.nilai
      g.lines.push(l)
      m.set(l.kategori, g)
    }
    return [...m.entries()].sort((a, b) => b[1].total - a[1].total)
  }, [lines])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="card w-full max-w-2xl max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white">
          <h3 className="font-semibold text-gray-800">{title}</h3>
          <button className="text-gray-400 hover:text-gray-700 text-xl leading-none" onClick={onClose}>×</button>
        </div>
        <div className="p-5">
          {groups.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">Tidak ada data.</p>
          ) : (
            <div className="space-y-4">
              {groups.map(([kategori, g]) => (
                <div key={kategori}>
                  <div className="flex items-baseline justify-between mb-2">
                    <p className="text-sm font-semibold text-gray-800">{kategori}</p>
                    <p className="text-xs text-teal font-medium">{formatRupiah(g.total)}</p>
                  </div>
                  <ul className="border border-gray-100 rounded-lg divide-y divide-gray-50">
                    {g.lines.map((l, i) => (
                      <li key={i} className="px-3 py-2 flex items-center justify-between text-xs">
                        <span className="text-gray-700">
                          {l.namaBarang || '-'} <span className="text-gray-400">({l.nibar || '-'})</span>
                          <span className="text-gray-400"> — {l.skpdNama} · {l.tanggal}</span>
                        </span>
                        <span className="text-gray-600 flex-shrink-0 ml-3">{formatRupiah(l.nilai)}</span>
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
