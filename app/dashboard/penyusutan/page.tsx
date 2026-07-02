'use client'
// Penyusutan — dua sumber:
//   1. Engine Ledger (baru): penyusutan_semester, dihitung event-driven dari transaksi_bmd
//   2. Data Lama (G&B): penyusutan_periode, hasil engine batch lama — dipertahankan (PLAN §11)
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { exportToExcel, formatRupiah } from '@/lib/export'

const PAGE_SIZE = 50
const PERIODE_LIST_LAMA = ['2025-S2', '2026-S1', '2026-S2']

export default function PenyusutanPage() {
  const [sumber, setSumber] = useState<'ledger' | 'lama'>('ledger')
  const [isAdmin, setIsAdmin] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase.from('profiles').select('role').eq('id', user.id).single()
      setIsAdmin(data?.role === 'admin')
    })()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="p-6">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-gray-900">Penyusutan BMD</h1>
        <p className="text-gray-500 text-sm mt-1">Detail penyusutan & amortisasi per aset per semester</p>
      </div>
      <div className="flex gap-1 mb-4 border-b border-gray-200">
        {([['ledger', 'Engine Ledger'], ['lama', 'Data Lama (G&B)']] as const).map(([k, label]) => (
          <button key={k} onClick={() => setSumber(k)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              sumber === k ? 'border-teal text-teal' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}>
            {label}
          </button>
        ))}
      </div>
      {sumber === 'ledger' ? <PenyusutanLedger isAdmin={isAdmin} /> : <PenyusutanLama />}
    </div>
  )
}

// ── Sumber baru: penyusutan_semester (event-driven) ─────────────────────────
type RowLedger = {
  periode: string
  metode: string
  nilai_perolehan: number
  nilai_buku_awal: number
  beban: number
  akumulasi: number
  nilai_buku_akhir: number
  sisa_semester: number
  aset: { nibar: string | null; nama_barang: string | null; kode: string; skpd: { nama: string } | null } | null
}

function PenyusutanLedger({ isAdmin }: { isAdmin: boolean }) {
  const supabase = createClient()
  const [data, setData] = useState<RowLedger[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [running, setRunning] = useState(false)
  const [msg, setMsg] = useState('')
  const [periodeList, setPeriodeList] = useState<string[]>([])
  const [periode, setPeriode] = useState('2026-S1')
  const [skpdList, setSkpdList] = useState<{ id: number; nama: string }[]>([])
  const [selectedSkpd, setSelectedSkpd] = useState('')
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')

  useEffect(() => {
    supabase.from('skpd').select('id,nama').eq('level', 1).order('nama')
      .then(({ data }) => setSkpdList(data || []))
    supabase.from('penyusutan_semester').select('periode').order('periode', { ascending: false }).limit(1000)
      .then(({ data }) => {
        const uniq = [...new Set((data || []).map(r => r.periode))]
        setPeriodeList(uniq.length ? uniq : ['2026-S1'])
        if (uniq.length && !uniq.includes('2026-S1')) setPeriode(uniq[0])
      })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const buildQuery = useCallback((withCount: boolean) => {
    let q = supabase.from('penyusutan_semester')
      .select('periode,metode,nilai_perolehan,nilai_buku_awal,beban,akumulasi,nilai_buku_akhir,sisa_semester,aset!inner(nibar,nama_barang,kode,skpd_id,skpd(nama))',
        withCount ? { count: 'exact' } : undefined)
      .eq('periode', periode)
      .order('beban', { ascending: false })
    if (selectedSkpd) q = q.eq('aset.skpd_id', selectedSkpd)
    if (search) q = q.ilike('aset.nama_barang', `%${search}%`)
    return q
  }, [periode, selectedSkpd, search]) // eslint-disable-line react-hooks/exhaustive-deps

  const fetchData = useCallback(async () => {
    setLoading(true)
    const { data, count } = await buildQuery(true).range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)
    setData((data as never as RowLedger[]) || [])
    setTotal(count || 0)
    setLoading(false)
  }, [buildQuery, page])

  useEffect(() => { fetchData() }, [fetchData])

  async function runEngine() {
    if (!confirm(`Hitung ulang penyusutan sampai periode ${periode} dari ledger transaksi?`)) return
    setRunning(true)
    setMsg('')
    try {
      const res = await fetch('/api/engine/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ periode }),
      })
      const json = await res.json()
      if (json.error) setMsg(`Error: ${json.error}`)
      else {
        setMsg(`Engine selesai — ${json.disusutkan.toLocaleString('id-ID')} aset disusutkan, total beban ${formatRupiah(json.total_beban)} (${periode}).`)
        fetchData()
        if (!periodeList.includes(periode)) setPeriodeList(p => [periode, ...p])
      }
    } catch (e) {
      setMsg(`Error: ${e instanceof Error ? e.message : String(e)}`)
    }
    setRunning(false)
  }

  async function handleExport() {
    setExporting(true)
    const all: RowLedger[] = []
    for (let from = 0; ; from += 1000) {
      const { data } = await buildQuery(false).range(from, from + 999)
      if (!data || data.length === 0) break
      all.push(...(data as never as RowLedger[]))
      if (data.length < 1000) break
    }
    exportToExcel(all.map(r => ({
      'NIBAR': r.aset?.nibar || '',
      'Nama Barang': r.aset?.nama_barang || '',
      'Kode': r.aset?.kode || '',
      'SKPD': r.aset?.skpd?.nama || '',
      'Metode': r.metode,
      'Nilai Perolehan (Rp)': r.nilai_perolehan,
      'Nilai Buku Awal (Rp)': r.nilai_buku_awal,
      'Beban (Rp)': r.beban,
      'Akumulasi (Rp)': r.akumulasi,
      'Nilai Buku Akhir (Rp)': r.nilai_buku_akhir,
      'Sisa (Smt)': r.sisa_semester,
      'Periode': r.periode,
    })), `Penyusutan_BMD_${periode}`, 'Penyusutan')
    setExporting(false)
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)

  return (
    <div>
      {msg && (
        <div className={`mb-4 p-3 rounded-lg text-sm ${msg.startsWith('Error') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
          {msg}
        </div>
      )}
      <div className="card p-4 mb-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Periode</label>
          <select className="select-filter" value={periode} onChange={e => { setPeriode(e.target.value); setPage(0) }}>
            {[...new Set([...periodeList, '2026-S1', '2026-S2', '2027-S1'])].sort().map(p =>
              <option key={p} value={p}>{p}</option>)}
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
            <input className="select-filter" placeholder="Ketik lalu Enter..." value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { setSearch(searchInput); setPage(0) } }} />
            <button className="btn-secondary" onClick={() => { setSearch(searchInput); setPage(0) }}>Cari</button>
          </div>
        </div>
        <div className="ml-auto flex gap-2">
          {isAdmin && (
            <button className="btn-secondary" onClick={runEngine} disabled={running}>
              {running ? 'Menghitung...' : 'Jalankan Engine'}
            </button>
          )}
          <button onClick={handleExport} disabled={exporting} className="btn-primary">
            {exporting ? 'Mengekspor...' : 'Export Excel'}
          </button>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <span className="text-sm text-gray-500">{total.toLocaleString('id-ID')} aset</span>
          <span className="text-sm text-gray-500">Hal. {page + 1} / {totalPages || 1}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="table-th">Barang</th>
                <th className="table-th">SKPD</th>
                <th className="table-th text-center">Metode</th>
                <th className="table-th text-right">Nilai Buku Awal</th>
                <th className="table-th text-right">Beban</th>
                <th className="table-th text-right">Akumulasi</th>
                <th className="table-th text-right">Nilai Buku Akhir</th>
                <th className="table-th text-center">Sisa (Smt)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr><td colSpan={8} className="table-td text-center py-12 text-gray-400">Memuat data...</td></tr>
              ) : data.length === 0 ? (
                <tr><td colSpan={8} className="table-td text-center py-12 text-gray-400">
                  Belum ada hasil untuk periode ini{isAdmin ? ' — klik "Jalankan Engine"' : ''}
                </td></tr>
              ) : data.map((row, i) => (
                <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                  <td className="table-td">
                    <p className="font-medium text-gray-800 text-xs">{row.aset?.nama_barang || '-'}</p>
                    <p className="text-gray-400 text-xs mt-0.5 font-mono">{row.aset?.nibar || '-'}</p>
                  </td>
                  <td className="table-td text-xs text-gray-600">{row.aset?.skpd?.nama || '-'}</td>
                  <td className="table-td text-center text-xs">{row.metode}</td>
                  <td className="table-td text-right text-xs">{formatRupiah(row.nilai_buku_awal)}</td>
                  <td className="table-td text-right text-xs font-medium text-teal">{formatRupiah(row.beban)}</td>
                  <td className="table-td text-right text-xs">{formatRupiah(row.akumulasi)}</td>
                  <td className="table-td text-right text-xs">{formatRupiah(row.nilai_buku_akhir)}</td>
                  <td className="table-td text-center text-xs">{row.sisa_semester}</td>
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

// ── Sumber lama: penyusutan_periode (dipertahankan, read-only) ───────────────
type RowLama = {
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

function PenyusutanLama() {
  const supabase = createClient()
  const [data, setData] = useState<RowLama[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [periode, setPeriode] = useState('2026-S1')
  const [skpdList, setSkpdList] = useState<{ id: number; nama: string }[]>([])
  const [selectedSkpd, setSelectedSkpd] = useState('')
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')

  useEffect(() => {
    supabase.from('skpd').select('id,nama').eq('level', 1).order('nama')
      .then(({ data }) => setSkpdList(data || []))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

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
    setData((data as never as RowLama[]) || [])
    setTotal(count || 0)
    setLoading(false)
  }, [periode, selectedSkpd, search, page]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchData() }, [fetchData])

  async function handleExport() {
    setExporting(true)
    const all: RowLama[] = []
    for (let from = 0; ; from += 1000) {
      let query = supabase
        .from('penyusutan_periode')
        .select('nibar,nama_barang,kode_barang,periode,nilai_buku_awal,beban_penyusutan,akumulasi_akhir,nilai_buku_akhir,sisa_masa_manfaat_smt,skpd(nama)')
        .eq('periode', periode)
        .order('beban_penyusutan', { ascending: false })
        .range(from, from + 999)
      if (selectedSkpd) query = query.eq('skpd_id', selectedSkpd)
      if (search) query = query.ilike('nama_barang', `%${search}%`)
      const { data } = await query
      if (!data || data.length === 0) break
      all.push(...(data as never as RowLama[]))
      if (data.length < 1000) break
    }
    exportToExcel(all.map(r => ({
      'NIBAR': r.nibar,
      'Nama Barang': r.nama_barang,
      'Kode Barang': r.kode_barang,
      'SKPD': r.skpd?.nama || '',
      'Nilai Buku Awal (Rp)': r.nilai_buku_awal,
      'Beban Penyusutan (Rp)': r.beban_penyusutan,
      'Akumulasi Akhir (Rp)': r.akumulasi_akhir,
      'Nilai Buku Akhir (Rp)': r.nilai_buku_akhir,
      'Sisa Masa Manfaat (Smt)': r.sisa_masa_manfaat_smt,
      'Periode': r.periode,
    })), `Penyusutan_BMD_Lama_${periode}`, 'Penyusutan')
    setExporting(false)
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)

  return (
    <div>
      <div className="card p-4 mb-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Periode</label>
          <select className="select-filter" value={periode} onChange={e => { setPeriode(e.target.value); setPage(0) }}>
            {PERIODE_LIST_LAMA.map(p => <option key={p} value={p}>{p}</option>)}
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
            <input className="select-filter" placeholder="Ketik lalu Enter..." value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { setSearch(searchInput); setPage(0) } }} />
            <button className="btn-secondary" onClick={() => { setSearch(searchInput); setPage(0) }}>Cari</button>
          </div>
        </div>
        <button onClick={handleExport} disabled={exporting} className="btn-primary ml-auto">
          {exporting ? 'Mengekspor...' : 'Export Excel'}
        </button>
      </div>

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
                  <td className="table-td text-xs text-gray-600">{row.skpd?.nama || '-'}</td>
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
