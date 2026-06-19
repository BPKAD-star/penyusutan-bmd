'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { exportToExcel, formatRupiah } from '@/lib/export'

const PERIODE_LIST = ['2026-S1', '2026-S2']

type RekapRow = {
  nama: string
  jumlah_aset: number
  total_beban: number
  total_akumulasi: number
  total_nilai_buku: number
}

export default function RekapPage() {
  const supabase = createClient()
  const [data, setData] = useState<RekapRow[]>([])
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [periode, setPeriode] = useState('2026-S1')

  useEffect(() => {
    async function fetchRekap() {
      setLoading(true)
      // Ambil semua data periode ini
      const allRows: { skpd: { nama: string } | null; beban_penyusutan: number; akumulasi_akhir: number; nilai_buku_akhir: number }[] = []
      let from = 0
      while (true) {
        const { data } = await supabase
          .from('penyusutan_periode')
          .select('skpd(nama),beban_penyusutan,akumulasi_akhir,nilai_buku_akhir')
          .eq('periode', periode)
          .range(from, from + 999)
        if (!data || data.length === 0) break
        allRows.push(...(data as typeof allRows))
        if (data.length < 1000) break
        from += 1000
      }

      // Aggregate
      const map: Record<string, RekapRow> = {}
      for (const r of allRows) {
        const nama = (r.skpd as { nama: string } | null)?.nama || '(Tidak Diketahui)'
        if (!map[nama]) map[nama] = { nama, jumlah_aset: 0, total_beban: 0, total_akumulasi: 0, total_nilai_buku: 0 }
        map[nama].jumlah_aset++
        map[nama].total_beban += r.beban_penyusutan || 0
        map[nama].total_akumulasi += r.akumulasi_akhir || 0
        map[nama].total_nilai_buku += r.nilai_buku_akhir || 0
      }

      setData(Object.values(map).sort((a, b) => b.total_beban - a.total_beban))
      setLoading(false)
    }
    fetchRekap()
  }, [periode])

  function handleExport() {
    setExporting(true)
    const rows = data.map((r, i) => ({
      'No': i + 1,
      'SKPD': r.nama,
      'Jumlah Aset': r.jumlah_aset,
      'Total Beban Penyusutan (Rp)': r.total_beban,
      'Total Akumulasi Akhir (Rp)': r.total_akumulasi,
      'Total Nilai Buku Akhir (Rp)': r.total_nilai_buku,
      'Periode': periode,
    }))
    exportToExcel(rows, `Rekap_Penyusutan_per_SKPD_${periode}`, 'Rekap SKPD')
    setExporting(false)
  }

  const grandTotal = data.reduce((acc, r) => ({
    jumlah_aset: acc.jumlah_aset + r.jumlah_aset,
    total_beban: acc.total_beban + r.total_beban,
    total_akumulasi: acc.total_akumulasi + r.total_akumulasi,
    total_nilai_buku: acc.total_nilai_buku + r.total_nilai_buku,
  }), { jumlah_aset: 0, total_beban: 0, total_akumulasi: 0, total_nilai_buku: 0 })

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Rekap per SKPD</h1>
          <p className="text-gray-500 text-sm mt-1">Agregat penyusutan per Satuan Kerja Perangkat Daerah</p>
        </div>
        <button onClick={handleExport} disabled={exporting || loading} className="btn-primary flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          {exporting ? 'Mengekspor...' : 'Export Excel'}
        </button>
      </div>

      {/* Filter */}
      <div className="card p-4 mb-4 flex gap-3 items-end">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Periode</label>
          <select className="select-filter" value={periode} onChange={e => setPeriode(e.target.value)}>
            {PERIODE_LIST.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="table-th w-8">No</th>
                <th className="table-th">Nama SKPD</th>
                <th className="table-th text-center">Jml Aset</th>
                <th className="table-th text-right">Total Beban (Rp)</th>
                <th className="table-th text-right">Total Akumulasi (Rp)</th>
                <th className="table-th text-right">Total Nilai Buku (Rp)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr><td colSpan={6} className="table-td text-center py-12 text-gray-400">Memuat data...</td></tr>
              ) : data.map((row, i) => (
                <tr key={row.nama} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                  <td className="table-td text-gray-400 text-xs">{i + 1}</td>
                  <td className="table-td font-medium text-gray-800 text-sm">{row.nama}</td>
                  <td className="table-td text-center text-sm">{row.jumlah_aset.toLocaleString('id-ID')}</td>
                  <td className="table-td text-right text-sm text-teal font-medium">{formatRupiah(row.total_beban)}</td>
                  <td className="table-td text-right text-sm">{formatRupiah(row.total_akumulasi)}</td>
                  <td className="table-td text-right text-sm">{formatRupiah(row.total_nilai_buku)}</td>
                </tr>
              ))}
            </tbody>
            {!loading && data.length > 0 && (
              <tfoot className="bg-navy text-white">
                <tr>
                  <td colSpan={2} className="px-4 py-3 text-sm font-bold">TOTAL</td>
                  <td className="px-4 py-3 text-sm font-bold text-center">{grandTotal.jumlah_aset.toLocaleString('id-ID')}</td>
                  <td className="px-4 py-3 text-sm font-bold text-right">{formatRupiah(grandTotal.total_beban)}</td>
                  <td className="px-4 py-3 text-sm font-bold text-right">{formatRupiah(grandTotal.total_akumulasi)}</td>
                  <td className="px-4 py-3 text-sm font-bold text-right">{formatRupiah(grandTotal.total_nilai_buku)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  )
}
