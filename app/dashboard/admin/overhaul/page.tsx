'use client'
// Admin > Overhaul Band — VIEW ONLY (keputusan user 2026-07-10, sama alasan
// dgn Kodefikasi BMD: ambang persentase overhaul ini dipakai LANGSUNG oleh
// engine penyusutan, jadi nggak boleh keubah nggak sengaja).
import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import FormShell from '@/components/pengelolaan/FormShell'

type Band = {
  id: number
  kode_prefix: string
  uraian: string | null
  band_no: number
  label: string | null
  pct_min: number
  pct_max: number | null
  tambahan_tahun: number
}

export default function AdminOverhaulPage() {
  const supabase = createClient()
  const [rows, setRows] = useState<Band[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
    (async () => {
      const rowsAll: Band[] = []
      for (let from = 0; ; from += 1000) {
        const { data } = await supabase.from('admin_overhaul_band').select('*')
          .order('kode_prefix').order('band_no').range(from, from + 999)
        if (!data || data.length === 0) break
        rowsAll.push(...(data as Band[]))
        if (data.length < 1000) break
      }
      setRows(rowsAll)
      setLoading(false)
    })()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(r => r.kode_prefix.toLowerCase().includes(q) || (r.uraian || '').toLowerCase().includes(q))
  }, [rows, search])

  return (
    <FormShell judul="Overhaul Band" deskripsi="Ambang persentase overhaul/kapitalisasi per kode aset — view only, dipakai langsung oleh engine penyusutan" msg="">
      <div className="mb-4">
        <input placeholder="Cari kode prefix / uraian..." className="select-filter w-full max-w-sm"
          value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="table-th">Kode Prefix</th>
                <th className="table-th">Uraian</th>
                <th className="table-th">#</th>
                <th className="table-th">Label</th>
                <th className="table-th">Pct Min</th>
                <th className="table-th">Pct Max</th>
                <th className="table-th">+Tahun</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr><td colSpan={7} className="table-td text-center py-8 text-gray-400">Memuat...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={7} className="table-td text-center py-8 text-gray-400">Tidak ada hasil.</td></tr>
              ) : filtered.map(row => (
                <tr key={row.id}>
                  <td className="table-td text-xs">{row.kode_prefix}</td>
                  <td className="table-td text-xs text-gray-600">{row.uraian || '-'}</td>
                  <td className="table-td text-xs text-gray-400">{row.band_no}</td>
                  <td className="table-td text-xs text-gray-600">{row.label || '-'}</td>
                  <td className="table-td text-xs text-gray-600">{row.pct_min}</td>
                  <td className="table-td text-xs text-gray-600">{row.pct_max ?? '-'}</td>
                  <td className="table-td text-xs text-gray-600">{row.tambahan_tahun}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </FormShell>
  )
}
