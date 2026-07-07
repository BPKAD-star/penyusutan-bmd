'use client'
// Laporan Cara Perolehan (Pengadaan/Hibah/Tukar Menukar/Hasil Inventarisasi/
// Perolehan Lainnya) — kolom detail spesifikasi barang, BEDA dari
// LaporanTransaksi generik (dipakai menu lain spt Reklasifikasi/Koreksi yang
// gak butuh kolom sedetail ini). Kolom (kiri→kanan): [Pihak, kalau ada] Kode
// Barang, Uraian Barang, Spesifikasi Nama Barang+NIBAR, Merk/Tipe, Spesifikasi
// Lainnya, Komptabel, Nomor Dokumen Sumber, Tanggal Perolehan (BAST), Nilai
// Perolehan, Keterangan.
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { exportToExcel, formatRupiah } from '@/lib/export'
import SkpdCombobox from '@/components/SkpdCombobox'

type Trx = {
  id: number
  periode: string
  tanggal: string
  nilai: number
  keterangan: string | null
  payload: { pihak?: string } | null
  header: { no_sk: string } | null
  aset: {
    kode: string; uraian_barang: string | null; nama_barang: string | null; nibar: string | null
    merek_tipe: string | null; spesifikasi_lainnya: string | null; intra_ekstra: string | null; status: string
  } | null
}

export default function LaporanPerolehan({ judul, deskripsi, jenis, filePrefix, pihakLabel }: {
  judul: string
  deskripsi: string
  jenis: string
  filePrefix: string
  /** Diisi (mis. "Pihak Pemberi Hibah") utk Hibah/Tukar Menukar → tambah kolom paling kiri. Null utk yang lain. */
  pihakLabel?: string | null
}) {
  const supabase = createClient()
  const [rows, setRows] = useState<Trx[]>([])
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [periodeList, setPeriodeList] = useState<string[]>([])
  const [periode, setPeriode] = useState('')
  const [descIds, setDescIds] = useState<number[] | null>(null)

  useEffect(() => {
    supabase.from('transaksi_bmd').select('periode').eq('jenis', jenis)
      .order('periode', { ascending: false }).limit(1000)
      .then(({ data }) => setPeriodeList([...new Set((data || []).map(r => r.periode))]))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const buildQuery = useCallback(() => {
    let q = supabase.from('transaksi_bmd')
      .select('id,periode,tanggal,nilai,keterangan,payload,header:header_id(no_sk),aset:aset_id(kode,uraian_barang,nama_barang,nibar,merek_tipe,spesifikasi_lainnya,intra_ekstra,status)')
      .eq('jenis', jenis)
      .order('id', { ascending: false })
    if (periode) q = q.eq('periode', periode)
    if (descIds && descIds.length > 0) {
      const list = descIds.join(',')
      q = q.or(`skpd_asal.in.(${list}),skpd_tujuan.in.(${list})`)
    }
    return q
  }, [periode, descIds, jenis]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    (async () => {
      setLoading(true)
      const { data } = await buildQuery().limit(500)
      const hasil = ((data as never as Trx[]) || []).filter(r => r.aset?.status !== 'dihapus')
      setRows(hasil)
      setLoading(false)
    })()
  }, [buildQuery])

  const totalNilai = rows.reduce((s, r) => s + (r.nilai || 0), 0)

  async function handleExport() {
    setExporting(true)
    const all: Trx[] = []
    for (let from = 0; ; from += 1000) {
      const { data } = await buildQuery().range(from, from + 999)
      if (!data || data.length === 0) break
      all.push(...(data as never as Trx[]))
      if (data.length < 1000) break
    }
    const hasil = all.filter(r => r.aset?.status !== 'dihapus')
    exportToExcel(hasil.map(r => ({
      ...(pihakLabel ? { [pihakLabel]: r.payload?.pihak || '' } : {}),
      'Kode Barang': r.aset?.kode || '',
      'Uraian Barang': r.aset?.uraian_barang || '',
      'Spesifikasi Nama Barang': r.aset?.nama_barang || '',
      'NIBAR': r.aset?.nibar || '',
      'Merk/Tipe': r.aset?.merek_tipe || '',
      'Spesifikasi Lainnya': r.aset?.spesifikasi_lainnya || '',
      'Komptabel': (r.aset?.intra_ekstra || '').toUpperCase(),
      'Nomor Dokumen Sumber': r.header?.no_sk || '',
      'Tanggal Perolehan (BAST)': r.tanggal,
      'Periode': r.periode,
      'Nilai Perolehan (Rp)': r.nilai,
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

      <div className="card p-4 mb-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Periode</label>
          <select className="select-filter" value={periode} onChange={e => setPeriode(e.target.value)}>
            <option value="">Semua Periode</option>
            {periodeList.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div className="min-w-[280px]">
          <label className="block text-xs text-gray-500 mb-1">SKPD / Lokasi</label>
          <SkpdCombobox onChangeSelection={sel => setDescIds(sel.descendantIds)} allowClear
            placeholder="Semua SKPD — atau ketik SKPD / Sub OPD / Lokasi..." />
        </div>
      </div>

      <div className="card p-4 mb-4 max-w-xs">
        <p className="text-xs text-gray-500">{judul}</p>
        <p className="text-lg font-bold text-gray-900 mt-1">{rows.length.toLocaleString('id-ID')} <span className="text-xs font-normal text-gray-400">transaksi</span></p>
        <p className="text-xs text-teal font-medium">{formatRupiah(totalNilai)}</p>
      </div>

      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <span className="text-sm text-gray-500">{rows.length} transaksi (maks. 500 ditampilkan — export untuk semua)</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                {pihakLabel && <th className="table-th">{pihakLabel}</th>}
                <th className="table-th">Kode Barang</th>
                <th className="table-th">Uraian Barang</th>
                <th className="table-th">Spesifikasi Nama Barang / NIBAR</th>
                <th className="table-th">Merk/Tipe</th>
                <th className="table-th">Spesifikasi Lainnya</th>
                <th className="table-th">Komptabel</th>
                <th className="table-th">No. Dokumen Sumber</th>
                <th className="table-th">Tgl Perolehan (BAST)</th>
                <th className="table-th text-right">Nilai Perolehan</th>
                <th className="table-th">Keterangan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr><td colSpan={pihakLabel ? 11 : 10} className="table-td text-center py-12 text-gray-400">Memuat data...</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={pihakLabel ? 11 : 10} className="table-td text-center py-12 text-gray-400">Tidak ada transaksi</td></tr>
              ) : rows.map(r => (
                <tr key={r.id}>
                  {pihakLabel && <td className="table-td text-xs">{r.payload?.pihak || '-'}</td>}
                  <td className="table-td text-xs">{r.aset?.kode || '-'}</td>
                  <td className="table-td text-xs">{r.aset?.uraian_barang || '-'}</td>
                  <td className="table-td text-xs">
                    <p className="font-medium">{r.aset?.nama_barang || '-'}</p>
                    <p className="text-gray-400">{r.aset?.nibar || '-'}</p>
                  </td>
                  <td className="table-td text-xs">{r.aset?.merek_tipe || '-'}</td>
                  <td className="table-td text-xs">{r.aset?.spesifikasi_lainnya || '-'}</td>
                  <td className="table-td text-xs">{(r.aset?.intra_ekstra || '-').toUpperCase()}</td>
                  <td className="table-td text-xs">{r.header?.no_sk || '-'}</td>
                  <td className="table-td text-xs">{r.tanggal}<br /><span className="text-gray-400">{r.periode}</span></td>
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
