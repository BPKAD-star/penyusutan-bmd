'use client'
// Rekap transaksi ledger per jenis / periode / SKPD + export Excel (PLAN §9).
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { exportToExcel, formatRupiah } from '@/lib/export'
import { JENIS_TRANSAKSI_LABEL } from '@/lib/bmd'

type Trx = {
  id: number
  jenis: string
  periode: string
  tanggal: string
  nilai: number
  keterangan: string | null
  payload: Record<string, unknown>
  aset: { nibar: string | null; nama_barang: string | null; kode: string; status: string } | null
  asal: { nama: string } | null
  tujuan: { nama: string } | null
}

export default function LaporanTransaksi({ judul, deskripsi, jenisList, filePrefix, sembunyikanAsetDihapus }: {
  judul: string
  deskripsi: string
  jenisList: string[]
  filePrefix: string
  sembunyikanAsetDihapus?: boolean
}) {
  const supabase = createClient()
  const [rows, setRows] = useState<Trx[]>([])
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [periodeList, setPeriodeList] = useState<string[]>([])
  const [periode, setPeriode] = useState('')
  const [jenis, setJenis] = useState('')
  const [skpdList, setSkpdList] = useState<{ id: number; nama: string }[]>([])
  const [skpd, setSkpd] = useState('')

  useEffect(() => {
    supabase.from('skpd').select('id,nama').eq('level', 1).order('nama')
      .then(({ data }) => setSkpdList(data || []))
    // daftar periode yang ada transaksi (dropdown dinamis)
    supabase.from('transaksi_bmd').select('periode').in('jenis', jenisList as never)
      .order('periode', { ascending: false }).limit(1000)
      .then(({ data }) => setPeriodeList([...new Set((data || []).map(r => r.periode))]))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const buildQuery = useCallback(() => {
    let q = supabase.from('transaksi_bmd')
      .select('id,jenis,periode,tanggal,nilai,keterangan,payload,aset(nibar,nama_barang,kode,status),asal:skpd_asal(nama),tujuan:skpd_tujuan(nama)')
      .in('jenis', (jenis ? [jenis] : jenisList) as never)
      .order('id', { ascending: false })
    if (periode) q = q.eq('periode', periode)
    if (skpd) q = q.or(`skpd_asal.eq.${skpd},skpd_tujuan.eq.${skpd}`)
    return q
  }, [jenis, periode, skpd, jenisList]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    (async () => {
      setLoading(true)
      const { data } = await buildQuery().limit(500)
      let hasil = (data as never as Trx[]) || []
      if (sembunyikanAsetDihapus) hasil = hasil.filter(r => r.aset?.status !== 'dihapus')
      setRows(hasil)
      setLoading(false)
    })()
  }, [buildQuery, sembunyikanAsetDihapus])

  // Rekap per jenis
  const rekap = new Map<string, { n: number; nilai: number }>()
  for (const r of rows) {
    const cur = rekap.get(r.jenis) || { n: 0, nilai: 0 }
    cur.n += 1
    cur.nilai += r.nilai || 0
    rekap.set(r.jenis, cur)
  }

  async function handleExport() {
    setExporting(true)
    const all: Trx[] = []
    for (let from = 0; ; from += 1000) {
      const { data } = await buildQuery().range(from, from + 999)
      if (!data || data.length === 0) break
      all.push(...(data as never as Trx[]))
      if (data.length < 1000) break
    }
    const hasil = sembunyikanAsetDihapus ? all.filter(r => r.aset?.status !== 'dihapus') : all
    exportToExcel(hasil.map(r => ({
      'Tanggal': r.tanggal,
      'Periode': r.periode,
      'Jenis': JENIS_TRANSAKSI_LABEL[r.jenis] || r.jenis,
      'NIBAR': r.aset?.nibar || '',
      'Nama Barang': r.aset?.nama_barang || '',
      'Kode': r.aset?.kode || '',
      'SKPD Asal': r.asal?.nama || '',
      'SKPD Tujuan': r.tujuan?.nama || '',
      'Nilai (Rp)': r.nilai,
      'Keterangan': r.keterangan || '',
    })), `${filePrefix}${periode ? '_' + periode : ''}`, 'Laporan')
    setExporting(false)
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{judul}</h1>
          <p className="text-gray-500 text-sm mt-1">{deskripsi}</p>
        </div>
        <button onClick={handleExport} disabled={exporting} className="btn-primary">
          {exporting ? 'Mengekspor...' : 'Export Excel'}
        </button>
      </div>

      {/* Filters */}
      <div className="card p-4 mb-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Periode</label>
          <select className="select-filter" value={periode} onChange={e => setPeriode(e.target.value)}>
            <option value="">Semua Periode</option>
            {periodeList.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Jenis</label>
          <select className="select-filter" value={jenis} onChange={e => setJenis(e.target.value)}>
            <option value="">Semua Jenis</option>
            {jenisList.map(j => <option key={j} value={j}>{JENIS_TRANSAKSI_LABEL[j] || j}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">SKPD</label>
          <select className="select-filter" value={skpd} onChange={e => setSkpd(e.target.value)}>
            <option value="">Semua SKPD</option>
            {skpdList.map(s => <option key={s.id} value={s.id}>{s.nama}</option>)}
          </select>
        </div>
      </div>

      {/* Rekap */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        {[...rekap.entries()].map(([j, v]) => (
          <div key={j} className="card p-4">
            <p className="text-xs text-gray-500">{JENIS_TRANSAKSI_LABEL[j] || j}</p>
            <p className="text-lg font-bold text-gray-900 mt-1">{v.n.toLocaleString('id-ID')} <span className="text-xs font-normal text-gray-400">transaksi</span></p>
            <p className="text-xs text-teal font-medium">{formatRupiah(v.nilai)}</p>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <span className="text-sm text-gray-500">{rows.length} transaksi (maks. 500 ditampilkan — export untuk semua)</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="table-th">Tanggal</th>
                <th className="table-th">Jenis</th>
                <th className="table-th">Barang</th>
                <th className="table-th">SKPD</th>
                <th className="table-th text-right">Nilai</th>
                <th className="table-th">Keterangan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr><td colSpan={6} className="table-td text-center py-12 text-gray-400">Memuat data...</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={6} className="table-td text-center py-12 text-gray-400">Tidak ada transaksi</td></tr>
              ) : rows.map(r => (
                <tr key={r.id}>
                  <td className="table-td text-xs">{r.tanggal}<br /><span className="text-gray-400">{r.periode}</span></td>
                  <td className="table-td text-xs">{JENIS_TRANSAKSI_LABEL[r.jenis] || r.jenis}</td>
                  <td className="table-td text-xs">
                    <p className="font-medium">{r.aset?.nama_barang || '-'}</p>
                    <p className="text-gray-400 font-mono">{r.aset?.nibar || '-'}</p>
                  </td>
                  <td className="table-td text-xs">
                    {r.asal?.nama && <p>Dari: {r.asal.nama}</p>}
                    {r.tujuan?.nama && <p>Ke: {r.tujuan.nama}</p>}
                  </td>
                  <td className="table-td text-xs text-right">{formatRupiah(r.nilai)}</td>
                  <td className="table-td text-xs text-gray-500 max-w-[200px] truncate">{r.keterangan || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
