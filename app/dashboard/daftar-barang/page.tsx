'use client'
// Daftar Barang — alur filter-lalu-tampilkan (mirip e-SIMBADA):
// SKPD → Jenis Aset → Komptabel (intra/ekstra) → Cari → klik Tampilkan.
// Data baru di-fetch setelah tombol Tampilkan ditekan.
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
  intra_ekstra: string | null
  status: string
  skpd: { nama: string } | null
}

type Applied = { skpd: string; golongan: string; komptabel: string; search: string }

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
  const [total, setTotal] = useState(0)
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

  const buildQuery = useCallback((f: Applied, withCount: boolean) => {
    let q = supabase.from('aset')
      .select('id,nibar,kode,nama_barang,spesifikasi,merek_tipe,jumlah,satuan,nilai_perolehan,tgl_perolehan,cara_perolehan,intra_ekstra,status,skpd(nama)',
        withCount ? { count: 'exact' } : undefined)
      .eq('status', 'aktif')
    if (f.skpd) q = q.eq('skpd_id', f.skpd)
    if (f.golongan) q = q.like('kode', `${f.golongan}.%`)
    if (f.komptabel) q = q.eq('intra_ekstra', f.komptabel)
    if (f.search) q = q.or(`nama_barang.ilike.%${f.search}%,nibar.ilike.%${f.search}%,kode.ilike.${f.search}%`)
    return q.order('nilai_perolehan', { ascending: false })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const fetchData = useCallback(async (f: Applied, pg: number) => {
    setLoading(true)
    const { data, count } = await buildQuery(f, true).range(pg * PAGE_SIZE, (pg + 1) * PAGE_SIZE - 1)
    setData((data as unknown as Row[]) || [])
    setTotal(count || 0)
    setLoading(false)
  }, [buildQuery])

  function handleTampilkan() {
    const f: Applied = { skpd: fSkpd, golongan: fGolongan, komptabel: fKomptabel, search: fSearch }
    setApplied(f)
    setPage(0)
    fetchData(f, 0)
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
    exportToExcel(all.map(r => ({
      'NIBAR': r.nibar || '',
      'Kode': r.kode,
      'Golongan': golonganLabels[kodeLevel3(r.kode)] || kodeLevel3(r.kode),
      'Nama Barang': r.nama_barang || '',
      'Spesifikasi': r.spesifikasi || '',
      'Merek/Tipe': r.merek_tipe || '',
      'Jumlah': r.jumlah,
      'Satuan': r.satuan || '',
      'Komptabel': r.intra_ekstra || '',
      'Nilai Perolehan (Rp)': r.nilai_perolehan,
      'Tgl Perolehan': r.tgl_perolehan || '',
      'Cara Perolehan': r.cara_perolehan,
      'SKPD': r.skpd?.nama || '',
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
                  <th className="table-th">Barang</th>
                  <th className="table-th">Golongan</th>
                  <th className="table-th">SKPD</th>
                  <th className="table-th text-center">Komptabel</th>
                  <th className="table-th text-right">Nilai Perolehan</th>
                  <th className="table-th">Perolehan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {loading ? (
                  <tr><td colSpan={6} className="table-td text-center py-12 text-gray-400">Memuat data...</td></tr>
                ) : data.length === 0 ? (
                  <tr><td colSpan={6} className="table-td text-center py-12 text-gray-400">Tidak ada data untuk filter ini</td></tr>
                ) : data.map((row, i) => (
                  <tr key={row.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                    <td className="table-td">
                      <p className="font-medium text-gray-800 text-xs">{row.nama_barang || '-'}</p>
                      <p className="text-gray-400 text-xs mt-0.5">{row.nibar || '-'} · {row.kode}</p>
                    </td>
                    <td className="table-td text-xs">{golonganLabels[kodeLevel3(row.kode)] || kodeLevel3(row.kode)}</td>
                    <td className="table-td text-xs text-gray-600">{row.skpd?.nama || '-'}</td>
                    <td className="table-td text-center text-xs capitalize">{row.intra_ekstra || '-'}</td>
                    <td className="table-td text-right text-xs">{formatRupiah(row.nilai_perolehan)}</td>
                    <td className="table-td text-xs">
                      {row.cara_perolehan.replace(/_/g, ' ')}
                      {row.tgl_perolehan && <span className="text-gray-400"> · {row.tgl_perolehan}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
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
