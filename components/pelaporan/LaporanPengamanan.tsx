'use client'
// Laporan Pengamanan BMD — rekap barang yang diamankan pegawai penanggung jawab
// (BAST + Pakta Integritas), difilter SKPD (kosong = se-kabupaten; pilih =
// per-SKPD/turunannya). Sumber = jurnal_header kategori 'pengamanan' + ledger
// (keanggotaan per header+aset, baris terakhir menentukan; batal_pengamanan
// dibuang). Export Excel.
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { exportToExcel, formatRupiah } from '@/lib/export'
import SkpdCombobox from '@/components/SkpdCombobox'

type HeaderPayload = {
  nama_pegawai?: string; nip?: string; pangkat_golongan?: string; jabatan?: string
  pakta_no?: string; pakta_tgl?: string
}
type Row = {
  key: string; skpd: string; pegawai: string; nip: string; pangkat: string; jabatan: string
  bastNo: string; bastTgl: string; paktaNo: string; paktaTgl: string
  nibar: string; nama: string; status: string; nilai: number
}

export default function LaporanPengamanan() {
  const supabase = createClient()
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [status, setStatus] = useState('')
  const [descIds, setDescIds] = useState<number[] | null>(null)

  const build = useCallback(async (): Promise<Row[]> => {
    let hq = supabase.from('jurnal_header')
      .select('id,no_sk,tanggal,skpd_id,payload').eq('kategori', 'pengamanan')
    if (descIds && descIds.length > 0) hq = hq.in('skpd_id', descIds)
    const { data: headers } = await hq.order('tanggal', { ascending: false })
    const hs = (headers || []) as unknown as { id: string; no_sk: string; tanggal: string; skpd_id: number; payload: HeaderPayload | null }[]
    if (hs.length === 0) return []

    const skpdIds = [...new Set(hs.map(h => h.skpd_id))]
    const { data: skpdRows } = await supabase.from('admin_skpd').select('id,nama').in('id', skpdIds)
    const skpdNama: Record<number, string> = Object.fromEntries((skpdRows || []).map(s => [s.id, s.nama]))
    const hById = new Map(hs.map(h => [h.id, h]))

    const { data: led } = await supabase.from('transaksi_bmd')
      .select('id,header_id,jenis,nilai,aset:aset_id(id,nibar,nama_barang)')
      .in('jenis', ['pengamanan', 'pengembalian_pengamanan', 'batal_pengamanan'] as never)
      .in('header_id', hs.map(h => h.id)).order('id', { ascending: true })
    const ledRows = (led || []) as unknown as {
      id: number; header_id: string; jenis: string; nilai: number
      aset: { id: string; nibar: string | null; nama_barang: string | null } | null
    }[]

    const acc = new Map<string, { nibar: string; nama: string; nilai: number; dikembalikan: boolean; headerId: string }>()
    for (const r of ledRows) {
      if (!r.aset || !hById.has(r.header_id)) continue
      const key = `${r.header_id}|${r.aset.id}`
      if (r.jenis === 'pengamanan') {
        acc.set(key, { nibar: r.aset.nibar || '-', nama: r.aset.nama_barang || '-', nilai: r.nilai, dikembalikan: false, headerId: r.header_id })
      } else if (r.jenis === 'pengembalian_pengamanan') {
        const cur = acc.get(key); if (cur) cur.dikembalikan = true
      } else { acc.delete(key) }
    }
    const out: Row[] = []
    for (const [key, v] of acc) {
      const h = hById.get(v.headerId)!
      const p = h.payload || {}
      out.push({
        key, skpd: skpdNama[h.skpd_id] || '-', pegawai: p.nama_pegawai || '-', nip: p.nip || '-',
        pangkat: p.pangkat_golongan || '-', jabatan: p.jabatan || '-', bastNo: h.no_sk, bastTgl: h.tanggal,
        paktaNo: p.pakta_no || '-', paktaTgl: p.pakta_tgl || '-', nibar: v.nibar, nama: v.nama,
        status: v.dikembalikan ? 'Dikembalikan' : 'Diamankan', nilai: v.nilai,
      })
    }
    return status ? out.filter(r => r.status === status) : out
  }, [descIds, status]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { (async () => { setLoading(true); setRows(await build()); setLoading(false) })() }, [build])

  const nDiamankan = rows.filter(r => r.status === 'Diamankan').length
  const nKembali = rows.filter(r => r.status === 'Dikembalikan').length

  async function handleExport() {
    setExporting(true)
    exportToExcel(rows.map(r => ({
      'SKPD': r.skpd, 'Nama Pegawai': r.pegawai, 'NIP': r.nip, 'Pangkat/Golongan': r.pangkat, 'Jabatan': r.jabatan,
      'No. BAST': r.bastNo, 'Tgl BAST': r.bastTgl, 'No. Pakta': r.paktaNo, 'Tgl Pakta': r.paktaTgl,
      'NIBAR': r.nibar, 'Nama Barang': r.nama, 'Status': r.status, 'Nilai Perolehan (Rp)': r.nilai,
    })), 'Laporan_Pengamanan', 'Pengamanan')
    setExporting(false)
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Laporan Pengamanan</h1>
          <p className="text-gray-500 text-sm mt-1">Rekap barang dalam kustodi pegawai penanggung jawab. Kosongkan SKPD untuk se-kabupaten.</p>
        </div>
        <button onClick={handleExport} disabled={exporting || rows.length === 0} className="btn-primary">{exporting ? 'Mengekspor...' : 'Export Excel'}</button>
      </div>

      <div className="card p-4 mb-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Status</label>
          <select className="select-filter" value={status} onChange={e => setStatus(e.target.value)}>
            <option value="">Semua</option>
            <option value="Diamankan">Diamankan</option>
            <option value="Dikembalikan">Dikembalikan</option>
          </select>
        </div>
        <div className="min-w-[280px]">
          <label className="block text-xs text-gray-500 mb-1">SKPD / Lokasi</label>
          <SkpdCombobox lockToOperator onChangeSelection={sel => setDescIds(sel.descendantIds)} allowClear
            placeholder="Semua SKPD — atau ketik SKPD / Sub OPD / Lokasi..." />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="card p-4"><p className="text-xs text-gray-500">Total Barang</p><p className="text-lg font-bold text-gray-900 mt-1">{rows.length.toLocaleString('id-ID')}</p></div>
        <div className="card p-4"><p className="text-xs text-gray-500">Diamankan</p><p className="text-lg font-bold text-green-700 mt-1">{nDiamankan.toLocaleString('id-ID')}</p></div>
        <div className="card p-4"><p className="text-xs text-gray-500">Dikembalikan</p><p className="text-lg font-bold text-gray-500 mt-1">{nKembali.toLocaleString('id-ID')}</p></div>
      </div>

      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100"><span className="text-sm text-gray-500">{rows.length} barang</span></div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="table-th">SKPD</th><th className="table-th">Pegawai</th><th className="table-th">BAST</th>
                <th className="table-th">Pakta Integritas</th><th className="table-th">Barang</th>
                <th className="table-th text-center">Status</th><th className="table-th text-right">Nilai</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr><td colSpan={7} className="table-td text-center py-12 text-gray-400">Memuat data...</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={7} className="table-td text-center py-12 text-gray-400">Tidak ada data pengamanan</td></tr>
              ) : rows.map(r => (
                <tr key={r.key}>
                  <td className="table-td text-xs">{r.skpd}</td>
                  <td className="table-td text-xs"><p className="font-medium">{r.pegawai}</p><p className="text-gray-400">NIP {r.nip} · {r.pangkat}{r.jabatan !== '-' ? ` · ${r.jabatan}` : ''}</p></td>
                  <td className="table-td text-xs">{r.bastNo}<br /><span className="text-gray-400">{r.bastTgl}</span></td>
                  <td className="table-td text-xs">{r.paktaNo}<br /><span className="text-gray-400">{r.paktaTgl}</span></td>
                  <td className="table-td text-xs"><p className="font-medium">{r.nama}</p><p className="text-gray-400">{r.nibar}</p></td>
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
