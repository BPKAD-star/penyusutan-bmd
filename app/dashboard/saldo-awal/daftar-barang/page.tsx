'use client'
// Saldo Awal → Daftar Barang Awal. Gabungan Daftar Barang + Penyusutan pada posisi
// saldo awal 2026 (= saldo akhir 2025), sumber saldo_awal_2026 (angka penyusutan
// baseline: masa manfaat, beban/smt, akumulasi 2025, nilai buku awal, sisa).
// Urutan: SKPD · Kode · Nama(+NIBAR) · Komptabel · Tgl · Masa Manfaat · Nilai ·
// Beban · Akumulasi · Nilai Buku · Sisa · Keterangan.
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { exportToExcel } from '@/lib/export'
import { GOLONGAN_REKAP } from '@/lib/bmd'
import SkpdCombobox, { type SkpdSelection as OrgSelection } from '@/components/SkpdCombobox'
import KomptabelRadio from '@/components/KomptabelRadio'

const PAGE_SIZE = 50

type Row = {
  nibar: string; kode_barang: string; nama_barang: string; skpd_id: number
  intra_ekstra: string | null; tgl_perolehan: string | null; nilai_perolehan: number
  akumulasi_2025: number; nilai_buku_awal: number; sisa_masa_manfaat_smt: number
  masa_manfaat_smt: number | null; beban_penyusutan_per_smt: number | null
}
type Applied = { org: OrgSelection; golongan: string; komptabel: string; search: string }

const angka = (v: number | null | undefined) =>
  v == null ? '-' : new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(v)

export default function Page() {
  const supabase = createClient()
  const [org, setOrg] = useState<OrgSelection>({ skpdId: null, descendantIds: null })
  const [golongan, setGolongan] = useState('')
  const [komptabel, setKomptabel] = useState('')
  const [search, setSearch] = useState('')
  const [applied, setApplied] = useState<Applied | null>(null)
  const [rows, setRows] = useState<Row[]>([])
  const [ketMap, setKetMap] = useState<Record<string, string>>({})
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [skpdNama, setSkpdNama] = useState<Record<number, string>>({})

  useEffect(() => {
    (async () => {
      const map: Record<number, string> = {}
      for (let from = 0; ; from += 1000) {
        const { data } = await supabase.from('admin_skpd').select('id,nama').range(from, from + 999)
        if (!data || data.length === 0) break
        for (const s of data) map[s.id] = s.nama
        if (data.length < 1000) break
      }
      setSkpdNama(map)
    })()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function buildQuery(f: Applied, withCount: boolean) {
    let q = supabase.from('aset_awal_2026')
      .select('nibar,kode_barang,nama_barang,skpd_id,intra_ekstra,tgl_perolehan,nilai_perolehan,akumulasi_2025,nilai_buku_awal,sisa_masa_manfaat_smt,masa_manfaat_smt,beban_penyusutan_per_smt',
        withCount ? { count: 'exact' } : undefined)
    if (f.org.descendantIds) q = q.in('skpd_id', f.org.descendantIds)
    if (f.golongan) q = q.like('kode_barang', `${f.golongan}.%`)
    if (f.komptabel) q = q.eq('intra_ekstra', f.komptabel)
    if (f.search) q = q.or(`nama_barang.ilike.%${f.search}%,nibar.ilike.%${f.search}%,kode_barang.ilike.${f.search}%`)
    return q.order('nilai_perolehan', { ascending: false })
  }

  // Keterangan diambil dari register aset (saldo_awal_2026 tak simpan keterangan).
  async function fetchKet(nibars: string[]) {
    const map: Record<string, string> = {}
    for (let i = 0; i < nibars.length; i += 300) {
      const { data } = await supabase.from('aset').select('nibar,keterangan').in('nibar', nibars.slice(i, i + 300))
      for (const a of (data || []) as { nibar: string | null; keterangan: string | null }[]) if (a.nibar && a.keterangan) map[a.nibar] = a.keterangan
    }
    return map
  }

  async function load(f: Applied, pg: number) {
    setLoading(true)
    const { data, count } = await buildQuery(f, true).range(pg * PAGE_SIZE, (pg + 1) * PAGE_SIZE - 1)
    const rs = (data as Row[]) || []
    setRows(rs)
    setTotal(count || 0)
    setKetMap(await fetchKet(rs.map(r => r.nibar)))
    setLoading(false)
  }

  function tampilkan() {
    const f: Applied = { org, golongan, komptabel, search }
    setApplied(f); setPage(0); load(f, 0)
  }
  function goPage(pg: number) { if (applied) { setPage(pg); load(applied, pg) } }

  async function handleExport() {
    if (!applied) return
    setExporting(true)
    const all: Row[] = []
    for (let from = 0; ; from += 1000) {
      const { data } = await buildQuery(applied, false).range(from, from + 999)
      if (!data || data.length === 0) break
      all.push(...(data as Row[]))
      if (data.length < 1000) break
    }
    const ket = await fetchKet(all.map(r => r.nibar))
    exportToExcel(all.map(r => ({
      'SKPD': skpdNama[r.skpd_id] || '', 'Kode Barang': r.kode_barang, 'Nama Barang': r.nama_barang, 'NIBAR': r.nibar,
      'Komptabel': r.intra_ekstra || '', 'Tgl Perolehan': r.tgl_perolehan || '',
      'Masa Manfaat (Smt)': r.masa_manfaat_smt ?? '', 'Nilai Perolehan': r.nilai_perolehan,
      'Beban / Smt': r.beban_penyusutan_per_smt ?? '', 'Akumulasi 2025': r.akumulasi_2025,
      'Nilai Buku Awal': r.nilai_buku_awal, 'Sisa (Smt)': r.sisa_masa_manfaat_smt, 'Keterangan': ket[r.nibar] || '',
    })), 'Daftar_Barang_Awal_2026', 'Daftar Barang Awal')
    setExporting(false)
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Daftar Barang Awal</h1>
        <p className="text-gray-500 text-sm mt-1">Daftar aset + penyusutan pada posisi saldo awal 2026 (= saldo akhir 2025).</p>
      </div>

      <div className="card p-5 mb-4">
        <h2 className="text-base font-semibold text-gray-800 mb-4">Filter data</h2>
        <div className="space-y-3 max-w-3xl">
          <div className="flex items-center gap-3">
            <label className="w-40 text-sm text-gray-600 text-right flex-shrink-0">SKPD / Lokasi :</label>
            <SkpdCombobox onChangeSelection={setOrg} allowClear placeholder="Semua — atau ketik SKPD / Sub OPD / Lokasi..." />
          </div>
          <div className="flex items-center gap-3">
            <label className="w-40 text-sm text-gray-600 text-right flex-shrink-0">Jenis Aset :</label>
            <select className="select-filter flex-1" value={golongan} onChange={e => setGolongan(e.target.value)}>
              <option value="">Semua Jenis Aset</option>
              {GOLONGAN_REKAP.map(g => <option key={g.kode} value={g.kode}>{g.kode} — {g.uraian}</option>)}
            </select>
          </div>
          <KomptabelRadio value={komptabel} onChange={setKomptabel} />
          <div className="flex items-center gap-3">
            <label className="w-40 text-sm text-gray-600 text-right flex-shrink-0">Cari :</label>
            <input className="select-filter flex-1" placeholder="Nama barang / NIBAR / kode..."
              value={search} onChange={e => setSearch(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') tampilkan() }} />
          </div>
          <div className="flex items-center gap-3">
            <span className="w-40 flex-shrink-0" />
            <button className="btn-primary" onClick={tampilkan} disabled={loading}>{loading ? 'Memuat...' : 'Tampilkan'}</button>
          </div>
        </div>
      </div>

      {applied === null ? (
        <div className="card p-12 text-center text-gray-400 text-sm">
          Atur filter lalu klik <span className="font-medium text-gray-600">Tampilkan</span>.
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <span className="text-sm text-gray-500">{total.toLocaleString('id-ID')} barang</span>
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
                  <th className="table-th">Kode Barang</th>
                  <th className="table-th">Nama Barang</th>
                  <th className="table-th text-center">Komptabel</th>
                  <th className="table-th">Tgl Perolehan</th>
                  <th className="table-th text-center">Masa Manfaat (Smt)</th>
                  <th className="table-th text-right">Nilai Perolehan</th>
                  <th className="table-th text-right">Beban / Smt</th>
                  <th className="table-th text-right">Akumulasi 2025</th>
                  <th className="table-th text-right">Nilai Buku Awal</th>
                  <th className="table-th text-center">Sisa (Smt)</th>
                  <th className="table-th">Keterangan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {loading ? (
                  <tr><td colSpan={12} className="table-td text-center py-12 text-gray-400">Memuat data...</td></tr>
                ) : rows.length === 0 ? (
                  <tr><td colSpan={12} className="table-td text-center py-12 text-gray-400">Tidak ada data untuk filter ini</td></tr>
                ) : rows.map((r, i) => (
                  <tr key={r.nibar} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                    <td className="table-td text-xs text-gray-600">{skpdNama[r.skpd_id] || '-'}</td>
                    <td className="table-td text-xs text-gray-600">{r.kode_barang}</td>
                    <td className="table-td">
                      <p className="font-medium text-gray-800 text-xs">{r.nama_barang || '-'}</p>
                      <p className="text-gray-400 text-xs mt-0.5">{r.nibar}</p>
                    </td>
                    <td className="table-td text-center text-xs capitalize">{r.intra_ekstra || '-'}</td>
                    <td className="table-td text-xs text-gray-600">{r.tgl_perolehan || '-'}</td>
                    <td className="table-td text-center text-xs">{r.masa_manfaat_smt ?? <span className="text-gray-300">-</span>}</td>
                    <td className="table-td text-right text-xs">{angka(r.nilai_perolehan)}</td>
                    <td className="table-td text-right text-xs">{r.beban_penyusutan_per_smt != null ? angka(r.beban_penyusutan_per_smt) : <span className="text-gray-300">-</span>}</td>
                    <td className="table-td text-right text-xs">{angka(r.akumulasi_2025)}</td>
                    <td className="table-td text-right text-xs">{angka(r.nilai_buku_awal)}</td>
                    <td className="table-td text-center text-xs">{r.sisa_masa_manfaat_smt}</td>
                    <td className="table-td text-xs text-gray-600">{ketMap[r.nibar] || '-'}</td>
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
