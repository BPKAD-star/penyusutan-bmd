'use client'
// Laporan Pemanfaatan BMD — rekap per barang yang sedang/pernah dimanfaatkan,
// difilter jenis pemanfaatan (Sewa/Pinjam Pakai/KSP/BGS-BSG/KSPI) & SKPD
// (kosong = se-kabupaten; pilih = per-SKPD/turunannya). Sumber = jurnal_header
// kategori 'pemanfaatan' + ledger (keanggotaan per header+aset, baris terakhir
// menentukan; batal_pemanfaatan dibuang). Export Excel.
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { exportToExcel, formatRupiah } from '@/lib/export'
import SkpdCombobox from '@/components/SkpdCombobox'
import { JENIS_PEMANFAATAN, JENIS_PEMANFAATAN_LABEL } from '@/lib/pemanfaatan'

type HeaderPayload = {
  jenis_pemanfaatan?: string; mitra?: string; alamat_mitra?: string
  mulai?: string; berakhir?: string; peruntukan?: string
}
type Row = {
  key: string; skpd: string; jenis: string; mitra: string; nibar: string; nama: string
  lingkup: string; mulai: string; berakhir: string; status: string; nilai: number; noDok: string
}

const todayISO = () => new Date().toISOString().slice(0, 10)

export default function LaporanPemanfaatan() {
  const supabase = createClient()
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [jenis, setJenis] = useState('')
  const [descIds, setDescIds] = useState<number[] | null>(null)

  const build = useCallback(async (): Promise<Row[]> => {
    let hq = supabase.from('jurnal_header')
      .select('id,no_sk,tanggal,skpd_id,payload').eq('kategori', 'pemanfaatan')
    if (descIds && descIds.length > 0) hq = hq.in('skpd_id', descIds)
    const { data: headers } = await hq.order('tanggal', { ascending: false })
    let hs = (headers || []) as unknown as { id: string; no_sk: string; tanggal: string; skpd_id: number; payload: HeaderPayload | null }[]
    if (jenis) hs = hs.filter(h => (h.payload?.jenis_pemanfaatan || '') === jenis)
    if (hs.length === 0) return []

    const skpdIds = [...new Set(hs.map(h => h.skpd_id))]
    const { data: skpdRows } = await supabase.from('admin_skpd').select('id,nama').in('id', skpdIds)
    const skpdNama: Record<number, string> = Object.fromEntries((skpdRows || []).map(s => [s.id, s.nama]))
    const hById = new Map(hs.map(h => [h.id, h]))

    const { data: led } = await supabase.from('transaksi_bmd')
      .select('id,header_id,jenis,nilai,payload,aset:aset_id(id,nibar,nama_barang)')
      .in('jenis', ['pemanfaatan', 'pemanfaatan_selesai', 'batal_pemanfaatan'] as never)
      .in('header_id', hs.map(h => h.id)).order('id', { ascending: true })
    const ledRows = (led || []) as unknown as {
      id: number; header_id: string; jenis: string; nilai: number
      payload: { lingkup?: string; bagian?: string | null } | null
      aset: { id: string; nibar: string | null; nama_barang: string | null } | null
    }[]

    const acc = new Map<string, { nibar: string; nama: string; lingkup: string; nilai: number; selesai: boolean; headerId: string }>()
    for (const r of ledRows) {
      if (!r.aset || !hById.has(r.header_id)) continue
      const key = `${r.header_id}|${r.aset.id}`
      if (r.jenis === 'pemanfaatan') {
        acc.set(key, {
          nibar: r.aset.nibar || '-', nama: r.aset.nama_barang || '-',
          lingkup: r.payload?.lingkup === 'sebagian' ? `Sebagian${r.payload?.bagian ? ` — ${r.payload.bagian}` : ''}` : 'Seluruhnya',
          nilai: r.nilai, selesai: false, headerId: r.header_id,
        })
      } else if (r.jenis === 'pemanfaatan_selesai') {
        const cur = acc.get(key); if (cur) cur.selesai = true
      } else { acc.delete(key) }
    }
    const today = todayISO()
    const out: Row[] = []
    for (const [key, v] of acc) {
      const h = hById.get(v.headerId)!
      const p = h.payload || {}
      const status = v.selesai ? 'Selesai' : (p.berakhir && today > p.berakhir ? 'Berakhir' : 'Aktif')
      out.push({
        key, skpd: skpdNama[h.skpd_id] || '-', jenis: JENIS_PEMANFAATAN_LABEL[p.jenis_pemanfaatan || ''] || (p.jenis_pemanfaatan || '-'),
        mitra: p.mitra || '-', nibar: v.nibar, nama: v.nama, lingkup: v.lingkup,
        mulai: p.mulai || '-', berakhir: p.berakhir || '-', status, nilai: v.nilai, noDok: h.no_sk,
      })
    }
    return out
  }, [descIds, jenis]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { (async () => { setLoading(true); setRows(await build()); setLoading(false) })() }, [build])

  const rekap = new Map<string, number>()
  for (const r of rows) rekap.set(r.jenis, (rekap.get(r.jenis) || 0) + 1)

  async function handleExport() {
    setExporting(true)
    exportToExcel(rows.map(r => ({
      'SKPD': r.skpd, 'Jenis Pemanfaatan': r.jenis, 'Mitra': r.mitra, 'NIBAR': r.nibar, 'Nama Barang': r.nama,
      'Lingkup': r.lingkup, 'Mulai': r.mulai, 'Berakhir': r.berakhir, 'Status': r.status,
      'Nilai Perolehan (Rp)': r.nilai, 'No. Dokumen': r.noDok,
    })), `Laporan_Pemanfaatan${jenis ? '_' + jenis : ''}`, 'Pemanfaatan')
    setExporting(false)
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Laporan Pemanfaatan</h1>
          <p className="text-gray-500 text-sm mt-1">Rekap barang yang dimanfaatkan (sewa/pinjam pakai/KSP/BGS-BSG/KSPI). Kosongkan SKPD untuk se-kabupaten.</p>
        </div>
        <button onClick={handleExport} disabled={exporting || rows.length === 0} className="btn-primary">{exporting ? 'Mengekspor...' : 'Export Excel'}</button>
      </div>

      <div className="card p-4 mb-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Jenis Pemanfaatan</label>
          <select className="select-filter" value={jenis} onChange={e => setJenis(e.target.value)}>
            <option value="">Semua Jenis</option>
            {JENIS_PEMANFAATAN.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div className="min-w-[280px]">
          <label className="block text-xs text-gray-500 mb-1">SKPD / Lokasi</label>
          <SkpdCombobox lockToOperator onChangeSelection={sel => setDescIds(sel.descendantIds)} allowClear
            placeholder="Semua SKPD — atau ketik SKPD / Sub OPD / Lokasi..." />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
        <div className="card p-4">
          <p className="text-xs text-gray-500">Total Barang</p>
          <p className="text-lg font-bold text-gray-900 mt-1">{rows.length.toLocaleString('id-ID')}</p>
        </div>
        {[...rekap.entries()].map(([j, n]) => (
          <div key={j} className="card p-4">
            <p className="text-xs text-gray-500 truncate" title={j}>{j}</p>
            <p className="text-lg font-bold text-gray-900 mt-1">{n.toLocaleString('id-ID')}</p>
          </div>
        ))}
      </div>

      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100"><span className="text-sm text-gray-500">{rows.length} barang</span></div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="table-th">SKPD</th><th className="table-th">Jenis</th><th className="table-th">Mitra</th>
                <th className="table-th">Barang</th><th className="table-th">Lingkup</th><th className="table-th">Mulai s.d. Berakhir</th>
                <th className="table-th text-center">Status</th><th className="table-th text-right">Nilai</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr><td colSpan={8} className="table-td text-center py-12 text-gray-400">Memuat data...</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={8} className="table-td text-center py-12 text-gray-400">Tidak ada data pemanfaatan</td></tr>
              ) : rows.map(r => (
                <tr key={r.key}>
                  <td className="table-td text-xs">{r.skpd}</td>
                  <td className="table-td text-xs">{r.jenis}</td>
                  <td className="table-td text-xs">{r.mitra}</td>
                  <td className="table-td text-xs"><p className="font-medium">{r.nama}</p><p className="text-gray-400">{r.nibar}</p></td>
                  <td className="table-td text-xs">{r.lingkup}</td>
                  <td className="table-td text-xs">{r.mulai} s.d. {r.berakhir}</td>
                  <td className="table-td text-center text-xs">{r.status}</td>
                  <td className="table-td text-right text-xs">{formatRupiah(r.nilai)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
