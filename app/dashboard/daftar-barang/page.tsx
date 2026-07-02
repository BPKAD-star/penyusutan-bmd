'use client'
// Daftar Barang — full register SEMUA golongan BMD (PLAN §8).
// Label golongan diambil dari data (kodefikasi_bmd → jenis_aset), tidak di-hardcode.
// Exclusion penyusutan urusan engine, bukan halaman ini.
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { exportToExcel, formatRupiah } from '@/lib/export'
import { GOLONGAN_DAFTAR_BARANG, kodeLevel3 } from '@/lib/bmd'

const PAGE_SIZE = 50

type Row = {
  id: string
  nibar: string | null
  kode: string
  nama_barang: string | null
  spesifikasi: string | null
  merek_tipe: string | null
  jumlah: number
  satuan: string | null
  nilai_perolehan: number
  tgl_perolehan: string | null
  cara_perolehan: string
  status: string
  skpd: { nama: string } | null
}

export default function DaftarBarangPage() {
  const supabase = createClient()
  const [data, setData] = useState<Row[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)

  const [golonganLabels, setGolonganLabels] = useState<Record<string, string>>({})
  const [golongan, setGolongan] = useState('')
  const [skpdList, setSkpdList] = useState<{ id: number; nama: string }[]>([])
  const [selectedSkpd, setSelectedSkpd] = useState('')
  const [status, setStatus] = useState('aktif')
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')

  useEffect(() => {
    supabase.from('skpd').select('id,nama').eq('level', 1).order('nama')
      .then(({ data }) => setSkpdList(data || []))
    // Label golongan dari data: kodefikasi_bmd.jenis_aset_id → jenis_aset.nama
    ;(async () => {
      const { data: jenis } = await supabase.from('jenis_aset').select('id,nama')
      const namaById = new Map((jenis || []).map(j => [j.id, j.nama]))
      const labels: Record<string, string> = {}
      await Promise.all(GOLONGAN_DAFTAR_BARANG.map(async prefix => {
        const { data } = await supabase.from('kodefikasi_bmd')
          .select('jenis_aset_id').eq('kode_jenis', prefix).not('jenis_aset_id', 'is', null).limit(1)
        const id = data?.[0]?.jenis_aset_id
        labels[prefix] = (id != null && namaById.get(id)) || prefix
      }))
      setGolonganLabels(labels)
    })()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const buildQuery = useCallback((withCount: boolean) => {
    let q = supabase.from('aset')
      .select('id,nibar,kode,nama_barang,spesifikasi,merek_tipe,jumlah,satuan,nilai_perolehan,tgl_perolehan,cara_perolehan,status,skpd(nama)',
        withCount ? { count: 'exact' } : undefined)
    if (status !== 'semua') q = q.eq('status', status)
    if (golongan) q = q.like('kode', `${golongan}.%`)
    if (selectedSkpd) q = q.eq('skpd_id', selectedSkpd)
    if (search) q = q.or(`nama_barang.ilike.%${search}%,nibar.ilike.%${search}%,kode.ilike.${search}%`)
    return q.order('nilai_perolehan', { ascending: false })
  }, [status, golongan, selectedSkpd, search]) // eslint-disable-line react-hooks/exhaustive-deps

  const fetchData = useCallback(async () => {
    setLoading(true)
    const { data, count } = await buildQuery(true).range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)
    setData((data as unknown as Row[]) || [])
    setTotal(count || 0)
    setLoading(false)
  }, [buildQuery, page])

  useEffect(() => { fetchData() }, [fetchData])

  async function handleExport() {
    setExporting(true)
    const all: Row[] = []
    for (let from = 0; ; from += 1000) {
      const { data } = await buildQuery(false).range(from, from + 999)
      if (!data || data.length === 0) break
      all.push(...(data as unknown as Row[]))
      if (data.length < 1000) break
    }
    exportToExcel(all.map(r => ({
      'NIBAR': r.nibar || '',
      'Kode': r.kode,
      'Golongan': golonganLabels[kodeLevel3(r.kode)] || kodeLevel3(r.kode),
      'Nama Barang': r.nama_barang || '',
      'Spesifikasi': r.spesifikasi || '',
      'Merek/Tipe': r.merek_tipe || '',
      'Jumlah': r.jumlah,
      'Satuan': r.satuan || '',
      'Nilai Perolehan (Rp)': r.nilai_perolehan,
      'Tgl Perolehan': r.tgl_perolehan || '',
      'Cara Perolehan': r.cara_perolehan,
      'SKPD': r.skpd?.nama || '',
      'Status': r.status,
    })), `Daftar_Barang_BMD${golongan ? '_' + golongan : ''}`, 'Daftar Barang')
    setExporting(false)
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Daftar Barang</h1>
          <p className="text-gray-500 text-sm mt-1">Register seluruh golongan BMD</p>
        </div>
        <button onClick={handleExport} disabled={exporting} className="btn-primary">
          {exporting ? 'Mengekspor...' : 'Export Excel'}
        </button>
      </div>

      {/* Filters */}
      <div className="card p-4 mb-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Golongan</label>
          <select className="select-filter" value={golongan} onChange={e => { setGolongan(e.target.value); setPage(0) }}>
            <option value="">Semua Golongan</option>
            {GOLONGAN_DAFTAR_BARANG.map(g => (
              <option key={g} value={g}>{g} — {golonganLabels[g] || '...'}</option>
            ))}
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
          <label className="block text-xs text-gray-500 mb-1">Status</label>
          <select className="select-filter" value={status} onChange={e => { setStatus(e.target.value); setPage(0) }}>
            <option value="aktif">Aktif</option>
            <option value="dihapus">Dihapus</option>
            <option value="semua">Semua</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Cari (nama / NIBAR / kode)</label>
          <div className="flex gap-2">
            <input className="select-filter" placeholder="Ketik lalu Enter..." value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { setSearch(searchInput); setPage(0) } }} />
            <button className="btn-secondary" onClick={() => { setSearch(searchInput); setPage(0) }}>Cari</button>
            {search && <button className="btn-secondary" onClick={() => { setSearch(''); setSearchInput(''); setPage(0) }}>Reset</button>}
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <span className="text-sm text-gray-500">{total.toLocaleString('id-ID')} barang</span>
          <span className="text-sm text-gray-500">Hal. {page + 1} / {totalPages || 1}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="table-th">Barang</th>
                <th className="table-th">Golongan</th>
                <th className="table-th">SKPD</th>
                <th className="table-th text-right">Nilai Perolehan</th>
                <th className="table-th">Perolehan</th>
                <th className="table-th text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr><td colSpan={6} className="table-td text-center py-12 text-gray-400">Memuat data...</td></tr>
              ) : data.length === 0 ? (
                <tr><td colSpan={6} className="table-td text-center py-12 text-gray-400">Tidak ada data</td></tr>
              ) : data.map((row, i) => (
                <tr key={row.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                  <td className="table-td">
                    <p className="font-medium text-gray-800 text-xs">{row.nama_barang || '-'}</p>
                    <p className="text-gray-400 text-xs mt-0.5 font-mono">{row.nibar || '-'} · {row.kode}</p>
                  </td>
                  <td className="table-td text-xs">{golonganLabels[kodeLevel3(row.kode)] || kodeLevel3(row.kode)}</td>
                  <td className="table-td text-xs text-gray-600">{row.skpd?.nama || '-'}</td>
                  <td className="table-td text-right text-xs">{formatRupiah(row.nilai_perolehan)}</td>
                  <td className="table-td text-xs">
                    {row.cara_perolehan.replace(/_/g, ' ')}
                    {row.tgl_perolehan && <span className="text-gray-400"> · {row.tgl_perolehan}</span>}
                  </td>
                  <td className="table-td text-center">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      row.status === 'aktif' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'
                    }`}>{row.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
