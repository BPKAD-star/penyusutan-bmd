'use client'
// Daftar Barang — alur filter-lalu-tampilkan (mirip e-SIMBADA):
// SKPD → Jenis Aset → Komptabel (intra/ekstra) → Cari → klik Tampilkan.
// Data baru di-fetch setelah tombol Tampilkan ditekan.
//
// Kolom: SKPD (paling kiri) · Nama Barang · Kode Barang · Uraian (nama baku dari
// kodefikasi) · Komptabel · Tgl Perolehan · Nilai Perolehan · Keterangan.
// Angka tanpa "Rp" (enak di-copas ke Excel) + baris TOTAL grand-total nilai
// perolehan seluruh hasil filter (bukan cuma halaman ini).
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { exportToExcel } from '@/lib/export'
import { GOLONGAN_DAFTAR_BARANG } from '@/lib/bmd'

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
  intra_ekstra: string | null
  keterangan: string | null
  status: string
  skpd: { nama: string } | null
}

type Applied = { skpd: string; golongan: string; komptabel: string; search: string }

// Angka polos bergaya id-ID tanpa "Rp" (enak di-copas ke Excel).
const angka = (v: number | null | undefined) =>
  v == null ? '-' : new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(v)

export default function DaftarBarangPage() {
  const supabase = createClient()

  // ── Nilai filter (belum diterapkan) ──
  const [skpdList, setSkpdList] = useState<{ id: number; nama: string }[]>([])
  const [golonganLabels, setGolonganLabels] = useState<Record<string, string>>({})
  const [fSkpd, setFSkpd] = useState('')
  const [fGolongan, setFGolongan] = useState('')
  const [fKomptabel, setFKomptabel] = useState('')
  const [fSearch, setFSearch] = useState('')

  // ── Filter yang sudah diterapkan (dipakai query) ──
  const [applied, setApplied] = useState<Applied | null>(null)

  const [data, setData] = useState<Row[]>([])
  const [uraianMap, setUraianMap] = useState<Record<string, string>>({})
  const [total, setTotal] = useState(0)
  const [grandTotal, setGrandTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    supabase.from('skpd').select('id,nama').eq('level', 1).order('nama')
      .then(({ data }) => setSkpdList(data || []))
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

  // Filter dipisah agar dipakai bareng query utama, query hitung total, & export.
  const applyFilters = useCallback(<T,>(q: T, f: Applied): T => {
    // @ts-expect-error — chain PostgREST builder
    let b = q.eq('status', 'aktif')
    if (f.skpd) b = b.eq('skpd_id', f.skpd)
    if (f.golongan) b = b.like('kode', `${f.golongan}.%`)
    if (f.komptabel) b = b.eq('intra_ekstra', f.komptabel)
    if (f.search) b = b.or(`nama_barang.ilike.%${f.search}%,nibar.ilike.%${f.search}%,kode.ilike.${f.search}%`)
    return b
  }, [])

  const buildQuery = useCallback((f: Applied, withCount: boolean) => {
    const q = supabase.from('aset')
      .select('id,nibar,kode,nama_barang,spesifikasi,merek_tipe,jumlah,satuan,nilai_perolehan,tgl_perolehan,cara_perolehan,intra_ekstra,keterangan,status,skpd(nama)',
        withCount ? { count: 'exact' } : undefined)
    return applyFilters(q, f).order('nilai_perolehan', { ascending: false })
  }, [applyFilters]) // eslint-disable-line react-hooks/exhaustive-deps

  // Uraian (nama baku) per kode, diambil dari kodefikasi_bmd untuk kode di halaman ini.
  async function fetchUraian(kodes: string[]) {
    const uniq = [...new Set(kodes)]
    const map: Record<string, string> = {}
    for (let i = 0; i < uniq.length; i += 200) {
      const { data } = await supabase.from('kodefikasi_bmd').select('kode,uraian').in('kode', uniq.slice(i, i + 200))
      for (const r of data || []) if (r.uraian) map[r.kode] = r.uraian
    }
    return map
  }

  // Grand total nilai perolehan SELURUH hasil filter (bukan cuma halaman ini).
  const fetchGrandTotal = useCallback(async (f: Applied) => {
    let sum = 0
    for (let from = 0; ; from += 1000) {
      const b = applyFilters(supabase.from('aset').select('nilai_perolehan'), f)
      const { data } = await b.range(from, from + 999)
      if (!data || data.length === 0) break
      for (const r of data as { nilai_perolehan: number }[]) sum += r.nilai_perolehan || 0
      if (data.length < 1000) break
    }
    return sum
  }, [applyFilters]) // eslint-disable-line react-hooks/exhaustive-deps

  const fetchData = useCallback(async (f: Applied, pg: number) => {
    setLoading(true)
    const { data, count } = await buildQuery(f, true).range(pg * PAGE_SIZE, (pg + 1) * PAGE_SIZE - 1)
    const rows = (data as unknown as Row[]) || []
    setData(rows)
    setTotal(count || 0)
    setUraianMap(await fetchUraian(rows.map(r => r.kode)))
    setLoading(false)
  }, [buildQuery]) // eslint-disable-line react-hooks/exhaustive-deps

  function handleTampilkan() {
    const f: Applied = { skpd: fSkpd, golongan: fGolongan, komptabel: fKomptabel, search: fSearch }
    setApplied(f)
    setPage(0)
    setGrandTotal(0)
    fetchData(f, 0)
    fetchGrandTotal(f).then(setGrandTotal)
  }

  function goPage(pg: number) {
    if (!applied) return
    setPage(pg)
    fetchData(applied, pg)
  }

  async function handleExport() {
    if (!applied) return
    setExporting(true)
    const all: Row[] = []
    for (let from = 0; ; from += 1000) {
      const { data } = await buildQuery(applied, false).range(from, from + 999)
      if (!data || data.length === 0) break
      all.push(...(data as unknown as Row[]))
      if (data.length < 1000) break
    }
    const uraian = await fetchUraian(all.map(r => r.kode))
    exportToExcel(all.map(r => ({
      'SKPD': r.skpd?.nama || '',
      'Nama Barang': r.nama_barang || '',
      'NIBAR': r.nibar || '',
      'Kode Barang': r.kode,
      'Uraian': uraian[r.kode] || '',
      'Komptabel': r.intra_ekstra || '',
      'Tgl Perolehan': r.tgl_perolehan || '',
      'Nilai Perolehan': r.nilai_perolehan,
      'Keterangan': r.keterangan || '',
    })), `Daftar_Barang_BMD${applied.golongan ? '_' + applied.golongan : ''}`, 'Daftar Barang')
    setExporting(false)
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)
  const skpdNama = skpdList.find(s => String(s.id) === applied?.skpd)?.nama

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Daftar Barang</h1>
        <p className="text-gray-500 text-sm mt-1">Register seluruh golongan BMD — pilih filter lalu klik Tampilkan.</p>
      </div>

      {/* Filter data */}
      <div className="card p-5 mb-4">
        <h2 className="text-base font-semibold text-gray-800 mb-4">Filter data</h2>
        <div className="space-y-3 max-w-3xl">
          <div className="flex items-center gap-3">
            <label className="w-40 text-sm text-gray-600 text-right flex-shrink-0">Lokasi / SKPD :</label>
            <select className="select-filter flex-1" value={fSkpd} onChange={e => setFSkpd(e.target.value)}>
              <option value="">Semua SKPD</option>
              {skpdList.map(s => <option key={s.id} value={s.id}>{s.nama}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-3">
            <label className="w-40 text-sm text-gray-600 text-right flex-shrink-0">Kode Jenis :</label>
            <select className="select-filter flex-1" value={fGolongan} onChange={e => setFGolongan(e.target.value)}>
              <option value="">Semua Jenis Aset</option>
              {GOLONGAN_DAFTAR_BARANG.map(g => (
                <option key={g} value={g}>{g} — {golonganLabels[g] || '...'}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-3">
            <label className="w-40 text-sm text-gray-600 text-right flex-shrink-0">Komptabel :</label>
            <select className="select-filter flex-1" value={fKomptabel} onChange={e => setFKomptabel(e.target.value)}>
              <option value="">Semua</option>
              <option value="intra">Intrakomptabel</option>
              <option value="ekstra">Ekstrakomptabel</option>
            </select>
          </div>
          <div className="flex items-center gap-3">
            <label className="w-40 text-sm text-gray-600 text-right flex-shrink-0">Cari :</label>
            <input className="select-filter flex-1" placeholder="Nama barang / NIBAR / kode..."
              value={fSearch} onChange={e => setFSearch(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleTampilkan() }} />
          </div>
          <div className="flex items-center gap-3">
            <span className="w-40 flex-shrink-0" />
            <button className="btn-primary" onClick={handleTampilkan} disabled={loading}>
              {loading ? 'Memuat...' : 'Tampilkan'}
            </button>
          </div>
        </div>
      </div>

      {/* Hasil */}
      {applied === null ? (
        <div className="card p-12 text-center text-gray-400 text-sm">
          Silakan atur filter di atas lalu klik <span className="font-medium text-gray-600">Tampilkan</span> untuk melihat daftar barang.
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <span className="text-sm text-gray-500">
              {total.toLocaleString('id-ID')} barang{skpdNama ? ` — ${skpdNama}` : ''}
            </span>
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-500">Hal. {page + 1} / {totalPages || 1}</span>
              <button onClick={handleExport} disabled={exporting || total === 0} className="btn-secondary text-xs">
                {exporting ? 'Mengekspor...' : 'Export Excel'}
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="table-th">SKPD</th>
                  <th className="table-th">Nama Barang</th>
                  <th className="table-th">Kode Barang</th>
                  <th className="table-th">Uraian</th>
                  <th className="table-th text-center">Komptabel</th>
                  <th className="table-th">Tgl Perolehan</th>
                  <th className="table-th text-right">Nilai Perolehan</th>
                  <th className="table-th">Keterangan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {loading ? (
                  <tr><td colSpan={8} className="table-td text-center py-12 text-gray-400">Memuat data...</td></tr>
                ) : data.length === 0 ? (
                  <tr><td colSpan={8} className="table-td text-center py-12 text-gray-400">Tidak ada data untuk filter ini</td></tr>
                ) : data.map((row, i) => (
                  <tr key={row.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                    <td className="table-td text-xs text-gray-600">{row.skpd?.nama || '-'}</td>
                    <td className="table-td">
                      <p className="font-medium text-gray-800 text-xs">{row.nama_barang || '-'}</p>
                      <p className="text-gray-400 text-xs mt-0.5">{row.nibar || '-'}</p>
                    </td>
                    <td className="table-td text-xs text-gray-600">{row.kode}</td>
                    <td className="table-td text-xs text-gray-600">{uraianMap[row.kode] || '-'}</td>
                    <td className="table-td text-center text-xs capitalize">{row.intra_ekstra || '-'}</td>
                    <td className="table-td text-xs text-gray-600">{row.tgl_perolehan || '-'}</td>
                    <td className="table-td text-right text-xs">{angka(row.nilai_perolehan)}</td>
                    <td className="table-td text-xs text-gray-600">{row.keterangan || '-'}</td>
                  </tr>
                ))}
              </tbody>
              {!loading && data.length > 0 && (
                <tfoot>
                  <tr className="bg-gray-50 border-t-2 border-gray-200 font-semibold text-gray-800">
                    <td className="table-td text-xs" colSpan={6}>TOTAL ({total.toLocaleString('id-ID')} barang)</td>
                    <td className="table-td text-right text-xs">{grandTotal ? angka(grandTotal) : '…'}</td>
                    <td className="table-td" />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
              <button className="btn-secondary" disabled={page === 0} onClick={() => goPage(page - 1)}>← Sebelumnya</button>
              <button className="btn-secondary" disabled={page >= totalPages - 1} onClick={() => goPage(page + 1)}>Berikutnya →</button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
