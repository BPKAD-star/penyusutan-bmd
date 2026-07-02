'use client'
// Laporan BMD (model 1): rekap per SKPD (pengguna barang / level 1) dengan
// rincian nilai per golongan — tanah berapa, peralatan & mesin berapa, dst.
// Nilai = jumlah nilai perolehan aset aktif; sub-SKPD di-roll up ke induk level 1.
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { exportToExcel, formatRupiah } from '@/lib/export'
import { GOLONGAN_DAFTAR_BARANG, kodeLevel3 } from '@/lib/bmd'

type Skpd = { id: number; nama: string; parent_id: number | null; level: number }

export default function LaporanBmdPage() {
  const supabase = createClient()
  const [labels, setLabels] = useState<Record<string, string>>({})
  const [matrix, setMatrix] = useState<Record<number, Record<string, number>>>({})
  const [skpdNama, setSkpdNama] = useState<Record<number, string>>({})
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')

  useEffect(() => {
    (async () => {
      setLoading(true)

      // Label golongan dari data
      const { data: jenis } = await supabase.from('jenis_aset').select('id,nama')
      const namaById = new Map((jenis || []).map(j => [j.id, j.nama]))
      const lbl: Record<string, string> = {}
      await Promise.all(GOLONGAN_DAFTAR_BARANG.map(async prefix => {
        const { data } = await supabase.from('kodefikasi_bmd')
          .select('jenis_aset_id').eq('kode_jenis', prefix).not('jenis_aset_id', 'is', null).limit(1)
        const id = data?.[0]?.jenis_aset_id
        lbl[prefix] = (id != null && namaById.get(id)) || prefix
      }))
      setLabels(lbl)

      // Hierarki SKPD → map ke induk level 1
      const allSkpd: Skpd[] = []
      for (let from = 0; ; from += 1000) {
        const { data } = await supabase.from('skpd').select('id,nama,parent_id,level').range(from, from + 999)
        if (!data || data.length === 0) break
        allSkpd.push(...(data as Skpd[]))
        if (data.length < 1000) break
      }
      const byId = new Map(allSkpd.map(s => [s.id, s]))
      const rootOf = (id: number | null): number | null => {
        let cur = id != null ? byId.get(id) : undefined
        let guard = 0
        while (cur && cur.level > 1 && cur.parent_id != null && guard++ < 20) cur = byId.get(cur.parent_id)
        return cur ? cur.id : null
      }
      const namaRoot: Record<number, string> = {}
      for (const s of allSkpd) if (s.level === 1) namaRoot[s.id] = s.nama

      // Semua aset aktif (RLS otomatis membatasi ke SKPD user)
      const mtx: Record<number, Record<string, number>> = {}
      for (let from = 0; ; from += 1000) {
        const { data } = await supabase.from('aset')
          .select('skpd_id,kode,nilai_perolehan').eq('status', 'aktif').range(from, from + 999)
        if (!data || data.length === 0) break
        for (const a of data as { skpd_id: number | null; kode: string; nilai_perolehan: number }[]) {
          const root = rootOf(a.skpd_id) ?? -1
          const gol = kodeLevel3(a.kode)
          if (!GOLONGAN_DAFTAR_BARANG.includes(gol)) continue
          mtx[root] ??= {}
          mtx[root][gol] = (mtx[root][gol] || 0) + (a.nilai_perolehan || 0)
        }
        if (data.length < 1000) break
      }
      namaRoot[-1] = '(Tanpa SKPD)'
      setSkpdNama(namaRoot)
      setMatrix(mtx)
      setLoading(false)
    })()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const golCols = GOLONGAN_DAFTAR_BARANG
  const rowIds = Object.keys(matrix).map(Number)
    .filter(id => !q || (skpdNama[id] || '').toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => (skpdNama[a] || '').localeCompare(skpdNama[b] || ''))

  const rowTotal = (id: number) => golCols.reduce((s, g) => s + (matrix[id]?.[g] || 0), 0)
  const colTotal = (g: string) => rowIds.reduce((s, id) => s + (matrix[id]?.[g] || 0), 0)
  const grandTotal = rowIds.reduce((s, id) => s + rowTotal(id), 0)

  function handleExport() {
    const rows = rowIds.map(id => {
      const r: Record<string, string | number> = { 'SKPD': skpdNama[id] || `#${id}` }
      for (const g of golCols) r[`${g} ${labels[g] || ''}`.trim()] = matrix[id]?.[g] || 0
      r['Total'] = rowTotal(id)
      return r
    })
    const totalRow: Record<string, string | number> = { 'SKPD': 'TOTAL' }
    for (const g of golCols) totalRow[`${g} ${labels[g] || ''}`.trim()] = colTotal(g)
    totalRow['Total'] = grandTotal
    rows.push(totalRow)
    exportToExcel(rows, 'Laporan_BMD_per_SKPD', 'Laporan BMD')
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Laporan BMD</h1>
          <p className="text-gray-500 text-sm mt-1">Rekap nilai perolehan aset aktif per SKPD, dirinci per golongan.</p>
        </div>
        <button onClick={handleExport} disabled={loading || rowIds.length === 0} className="btn-primary">Export Excel</button>
      </div>

      <div className="card p-4 mb-4">
        <label className="block text-xs text-gray-500 mb-1">Cari SKPD</label>
        <input className="select-filter" placeholder="Ketik nama SKPD..." value={q} onChange={e => setQ(e.target.value)} />
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="table-th sticky left-0 bg-gray-50 z-10">SKPD</th>
                {golCols.map(g => (
                  <th key={g} className="table-th text-right whitespace-nowrap">
                    <span className="block">{labels[g] || g}</span>
                    <span className="block text-gray-400 font-normal">{g}</span>
                  </th>
                ))}
                <th className="table-th text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr><td colSpan={golCols.length + 2} className="table-td text-center py-12 text-gray-400">Memuat data...</td></tr>
              ) : rowIds.length === 0 ? (
                <tr><td colSpan={golCols.length + 2} className="table-td text-center py-12 text-gray-400">Tidak ada data</td></tr>
              ) : rowIds.map((id, i) => (
                <tr key={id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                  <td className="table-td text-xs font-medium sticky left-0 bg-inherit z-10">{skpdNama[id] || `#${id}`}</td>
                  {golCols.map(g => (
                    <td key={g} className="table-td text-right text-xs">
                      {matrix[id]?.[g] ? formatRupiah(matrix[id][g]) : <span className="text-gray-300">—</span>}
                    </td>
                  ))}
                  <td className="table-td text-right text-xs font-semibold">{formatRupiah(rowTotal(id))}</td>
                </tr>
              ))}
            </tbody>
            {!loading && rowIds.length > 0 && (
              <tfoot className="bg-gray-100 border-t-2 border-gray-200">
                <tr>
                  <td className="table-td text-xs font-bold sticky left-0 bg-gray-100 z-10">TOTAL</td>
                  {golCols.map(g => (
                    <td key={g} className="table-td text-right text-xs font-bold">{formatRupiah(colTotal(g))}</td>
                  ))}
                  <td className="table-td text-right text-xs font-bold text-teal">{formatRupiah(grandTotal)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  )
}
