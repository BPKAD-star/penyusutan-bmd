'use client'
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { exportToExcel, formatRupiah } from '@/lib/export'

const PERIODE_LIST = ['2025-S2', '2026-S1', '2026-S2']
const PAGE_SIZE = 50

type Row = {
  nibar: string
  nama_barang: string
  kode_barang: string
  periode: string
  nilai_buku_awal: number
  beban_penyusutan: number
  akumulasi_akhir: number
  nilai_buku_akhir: number
  sisa_masa_manfaat_smt: number
  skpd: { nama: string } | null
}

export default function PenyusutanPage() {
  const supabase = createClient()
  const [data, setData] = useState<Row[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)

  const [periode, setPeriode] = useState('2026-S1')
  const [skpdList, setSkpdList] = useState<{ id: number; nama: string }[]>([])
  const [selectedSkpd, setSelectedSkpd] = useState('')
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')

  // Load SKPD list
  useEffect(() => {
    supabase.from('skpd').select('id,nama').eq('level', 1).order('nama')
      .then(({ data }) => setSkpdList(data || []))
  }, [])

  const fetchData = useCallback(async () => {
    setLoading(true)
    let query = supabase
      .from('penyusutan_periode')
      .select('nibar,nama_barang,kode_barang,periode,nilai_buku_awal,beban_penyusutan,akumulasi_akhir,nilai_buku_akhir,sisa_masa_manfaat_smt,skpd(nama)', { count: 'exact' })
      .eq('periode', periode)
      .order('beban_penyusutan', { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

    if (selectedSkpd) query = query.eq('skpd_id', selectedSkpd)
    if (search) query = query.ilike('nama_barang', `%${search}%`)

    const { data, count } = await query
    setData((data as Row[]) || [])
    setTotal(count || 0)
    setLoading(false)
  }, [periode, selectedSkpd, search, page])

  useEffect(() => { fetchData() }, [fetchData])

  async function handleExport() {
    setExporting(true)
    let allData: Row[] = []
    let from = 0
    const batchSize = 1000

    while (true) {
      let query = supabase
        .from('penyusutan_periode')
        .select('nibar,nama_barang,kode_barang,periode,nilai_buku_awal,beban_penyusutan,akumulasi_akhir,nilai_buku_akhir,sisa_masa_manfaat_smt,skpd(nama)')
        .eq('periode', periode)
        .order('beban_penyusutan', { ascending: false })
        .range(from, from + batchSize - 1)

      if (selectedSkpd) query = query.eq('skpd_id', selectedSkpd)
      if (search) query = query.ilike('nama_barang', `%${search}%`)

      const { data } = await query
      if (!data || data.length === 0) break
      allData = [...allData, ...(data as Row[])]
      if (data.length < batchSize) break
      from += batchSize
    }

    const rows = allData.map(r => ({
      'NIBAR': r.nibar,
      'Nama Barang': r.nama_barang,
      'Kode Barang': r.kode_barang,
      'SKPD': (r.skpd as { nama: string } | null)?.nama || '',
      'Nilai Buku Awal (Rp)': r.nilai_buku_awal,
      'Beban Penyusutan (Rp)': r.beban_penyusutan,
      'Akumulasi Akhir (Rp)': r.akumulasi_akhir,
      'Nilai Buku Akhir (Rp)': r.nilai_buku_akhir,
      'Sisa Masa Manfaat (Smt)': r.sisa_masa_manfaat_smt,
      'Periode': r.periode,
    }))

    exportToExcel(rows, `Penyusutan_BMD_${periode}`, 'Penyusutan')
    setExporting(false)
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Penyusutan BMD</h1>
          <p className="text-gray-500 text-sm mt-1">Detail penyusutan per aset</p>
        </div>
        <button onClick={handleExport} disabled={exporting} className="btn-primary flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          {exporting ? 'Mengekspor...' : 'Export Excel'}
        </button>
      </div>

      {/* Filters */}
      <div className="card p-4 mb-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Periode</label>
          <select className="select-filter" value={periode} onChange={e => { setPeriode(e.target.value); setPage(0) }}>
            {PERIODE_LIST.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">SKPD</label>
          <select className="select-filter" value={selectedSkpd} onChange={e => { setSelectedSkpd(e.target.value); setPage(0) }}>
            <option value="">Semua SKPD</option>
            {skpdList.map(s => <option key={s.id} value={s.id}>{s.nama}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Cari Nama Barang</label>
          <div className="flex gap-2">
            <input
              className="select-filter"
              placeholder="Ketik nama barang..."
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { setSearch(searchInput); setPage(0) } }}
            />
            <button className="btn-secondary" onClick={() => { setSearch(searchInput); setPage(0) }}>Cari</button>
            {search && <button className="btn-secondary" onClick={() => { setSearch(''); setSearchInput(''); setPage(0) }}>Reset</button>}
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <span className="text-sm text-gray-500">{total.toLocaleString('id-ID')} aset ditemukan</span>
          <span className="text-sm text-gray-500">Hal. {page + 1} / {totalPages || 1}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="table-th">Nama Barang</th>
                <th className="table-th">SKPD</th>
                <th className="table-th text-right">Nilai Buku Awal</th>
                <th className="table-th text-right">Beban Penyusutan</th>
                <th className="table-th text-right">Akumulasi</th>
                <th className="table-th text-right">Nilai Buku Akhir</th>
                <th className="table-th text-center">Sisa (Smt)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr><td colSpan={7} className="table-td text-center py-12 text-gray-400">Memuat data...</td></tr>
              ) : data.length === 0 ? (
                <tr><td colSpan={7} className="table-td text-center py-12 text-gray-400">Tidak ada data</td></tr>
              ) : data.map((row, i) => (
                <tr key={row.nibar} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                  <td className="table-td">
                    <p className="font-medium text-gray-800 text-xs">{row.nama_barang || '-'}</p>
                    <p className="text-gray-400 text-xs mt-0.5">{row.nibar}</p>
                  </td>
                  <td className="table-td text-xs text-gray-600">{(row.skpd as { nama: string } | null)?.nama || '-'}</td>
                  <td className="table-td text-right text-xs">{formatRupiah(row.nilai_buku_awal)}</td>
                  <td className="table-td text-right text-xs font-medium text-teal">{formatRupiah(row.beban_penyusutan)}</td>
                  <td className="table-td text-right text-xs">{formatRupiah(row.akumulasi_akhir)}</td>
                  <td className="table-td text-right text-xs">{formatRupiah(row.nilai_buku_akhir)}</td>
                  <td className="table-td text-center text-xs">{row.sisa_masa_manfaat_smt}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
            <button className="btn-secondary" disabled={page === 0} onClick={() => setPage(p => p - 1)}>← Sebelumnya</button>
            <button className="btn-secondary" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>Berikutnya →</button>
          </div>
        )}
      </div>
    </div>
  )
}
