'use client'
// Penyusutan — filter ala e-SIMBADA: organisasi (SKPD/Sub OPD/Sub Sub OPD) →
// jenis aset → komptabel → semester → Tampilkan.
//
// Semester & engine: penyusutan dihitung PER SEMESTER (tiap periode YYYY-S1/S2
// adalah dataset hasil engine tersendiri). Filter semester di sini hanya MEMILIH
// periode mana yang ditampilkan; perhitungan beban/akumulasi tetap tanggung jawab
// engine. Register aset (semua golongan) diambil dari saldo_awal_2026; angka
// penyusutan dari penyusutan_periode. Golongan tanpa penyusutan → kolom "-".
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { exportToExcel, formatRupiah } from '@/lib/export'
import { GOLONGAN_REKAP, kodeLevel3, perlakuanKode } from '@/lib/bmd'
import OrgFilter, { type OrgSelection } from '@/components/OrgFilter'

const PAGE_SIZE = 50

type Base = { nibar: string; kode_barang: string; nama_barang: string; skpd_id: number; nilai_perolehan: number; intra_ekstra: string | null }
type Peny = { nilai_buku_awal: number; beban_penyusutan: number; akumulasi_akhir: number; nilai_buku_akhir: number; sisa_masa_manfaat_smt: number }
type Applied = { org: OrgSelection; golongan: string; komptabel: string; periode: string; search: string }

const METODE_LABEL: Record<string, string> = { penyusutan: 'Penyusutan', amortisasi: 'Amortisasi', lain_lain: 'Penyusutan', tidak: '-' }

export default function PenyusutanPage() {
  const supabase = createClient()

  const [org, setOrg] = useState<OrgSelection>({ skpdId: null, descendantIds: null })
  const [golongan, setGolongan] = useState('')
  const [komptabel, setKomptabel] = useState('')
  const [tahun, setTahun] = useState('2026')
  const [smt, setSmt] = useState('1')
  const [search, setSearch] = useState('')

  const [applied, setApplied] = useState<Applied | null>(null)
  const [rows, setRows] = useState<(Base & { p?: Peny })[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [skpdNama, setSkpdNama] = useState<Record<number, string>>({})

  useEffect(() => {
    (async () => {
      const map: Record<number, string> = {}
      for (let from = 0; ; from += 1000) {
        const { data } = await supabase.from('skpd').select('id,nama').range(from, from + 999)
        if (!data || data.length === 0) break
        for (const s of data) map[s.id] = s.nama
        if (data.length < 1000) break
      }
      setSkpdNama(map)
    })()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function baseQuery(f: Applied, withCount: boolean) {
    let q = supabase.from('saldo_awal_2026')
      .select('nibar,kode_barang,nama_barang,skpd_id,nilai_perolehan,intra_ekstra', withCount ? { count: 'exact' } : undefined)
    if (f.org.descendantIds) q = q.in('skpd_id', f.org.descendantIds)
    if (f.golongan) q = q.like('kode_barang', `${f.golongan}.%`)
    if (f.komptabel) q = q.eq('intra_ekstra', f.komptabel)
    if (f.search) q = q.or(`nama_barang.ilike.%${f.search}%,nibar.ilike.%${f.search}%,kode_barang.ilike.${f.search}%`)
    return q.order('nilai_perolehan', { ascending: false })
  }

  async function fetchPeny(nibars: string[], periode: string) {
    const map = new Map<string, Peny>()
    for (let i = 0; i < nibars.length; i += 200) {
      const { data } = await supabase.from('penyusutan_periode')
        .select('nibar,nilai_buku_awal,beban_penyusutan,akumulasi_akhir,nilai_buku_akhir,sisa_masa_manfaat_smt')
        .eq('periode', periode).in('nibar', nibars.slice(i, i + 200))
      for (const r of data || []) map.set(r.nibar, r as Peny)
    }
    return map
  }

  async function load(f: Applied, pg: number) {
    setLoading(true)
    const { data, count } = await baseQuery(f, true).range(pg * PAGE_SIZE, (pg + 1) * PAGE_SIZE - 1)
    const base = (data as Base[]) || []
    const pmap = await fetchPeny(base.map(b => b.nibar), f.periode)
    setRows(base.map(b => ({ ...b, p: pmap.get(b.nibar) })))
    setTotal(count || 0)
    setLoading(false)
  }

  function tampilkan() {
    const f: Applied = { org, golongan, komptabel, periode: `${tahun}-S${smt}`, search }
    setApplied(f); setPage(0); load(f, 0)
  }
  function goPage(pg: number) { if (applied) { setPage(pg); load(applied, pg) } }

  async function handleExport() {
    if (!applied) return
    setExporting(true)
    const base: Base[] = []
    for (let from = 0; ; from += 1000) {
      const { data } = await baseQuery(applied, false).range(from, from + 999)
      if (!data || data.length === 0) break
      base.push(...(data as Base[]))
      if (data.length < 1000) break
    }
    const pmap = await fetchPeny(base.map(b => b.nibar), applied.periode)
    exportToExcel(base.map(b => {
      const p = pmap.get(b.nibar)
      const susut = perlakuanKode(b.kode_barang) !== 'tidak'
      return {
        'NIBAR': b.nibar, 'Nama Barang': b.nama_barang, 'Kode': b.kode_barang,
        'SKPD': skpdNama[b.skpd_id] || '', 'Komptabel': b.intra_ekstra || '',
        'Metode': METODE_LABEL[perlakuanKode(b.kode_barang)],
        'Nilai Buku Awal': susut && p ? p.nilai_buku_awal : '',
        'Beban': susut && p ? p.beban_penyusutan : '',
        'Akumulasi': susut && p ? p.akumulasi_akhir : '',
        'Nilai Buku Akhir': susut && p ? p.nilai_buku_akhir : b.nilai_perolehan,
        'Sisa (Smt)': susut && p ? p.sisa_masa_manfaat_smt : '',
        'Periode': applied.periode,
      }
    }), `Penyusutan_${applied.periode}`, 'Penyusutan')
    setExporting(false)
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)
  const dash = (v: React.ReactNode, ok: boolean) => (ok ? v : <span className="text-gray-300">-</span>)

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Penyusutan BMD</h1>
        <p className="text-gray-500 text-sm mt-1">Detail penyusutan & amortisasi per aset per semester</p>
      </div>

      <div className="card p-5 mb-4">
        <h2 className="text-base font-semibold text-gray-800 mb-4">Filter data</h2>
        <div className="space-y-3 max-w-3xl">
          <OrgFilter onChange={setOrg} />

          <div className="flex items-center gap-3">
            <label className="w-40 text-sm text-gray-600 text-right flex-shrink-0">Jenis Aset :</label>
            <select className="select-filter flex-1" value={golongan} onChange={e => setGolongan(e.target.value)}>
              <option value="">Semua Jenis (KIB Tanah s.d. Aset Lain-Lain)</option>
              {GOLONGAN_REKAP.map(g => <option key={g.kode} value={g.kode}>{g.kode} — {g.uraian}</option>)}
            </select>
          </div>

          <div className="flex items-center gap-3">
            <label className="w-40 text-sm text-gray-600 text-right flex-shrink-0">Komptabel :</label>
            <div className="flex gap-4">
              {[['', 'Semua'], ['intra', 'Intrakomptabel'], ['ekstra', 'Ekstrakomptabel']].map(([v, l]) => (
                <label key={v} className="flex items-center gap-1.5 text-sm cursor-pointer">
                  <input type="radio" name="komptabel" checked={komptabel === v} onChange={() => setKomptabel(v)} />{l}
                </label>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <label className="w-40 text-sm text-gray-600 text-right flex-shrink-0">Semester :</label>
            <select className="select-filter w-28" value={tahun} onChange={e => setTahun(e.target.value)}>
              {['2025', '2026', '2027'].map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <div className="flex gap-4">
              {[['1', 'Semester I'], ['2', 'Semester II']].map(([v, l]) => (
                <label key={v} className="flex items-center gap-1.5 text-sm cursor-pointer">
                  <input type="radio" name="smt" checked={smt === v} onChange={() => setSmt(v)} />{l}
                </label>
              ))}
            </div>
          </div>

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
            <span className="text-sm text-gray-500">
              {total.toLocaleString('id-ID')} aset · periode {applied.periode}
              {applied.org.skpdId && skpdNama[applied.org.skpdId] ? ` · ${skpdNama[applied.org.skpdId]}` : ''}
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
                ) : rows.length === 0 ? (
                  <tr><td colSpan={8} className="table-td text-center py-12 text-gray-400">Tidak ada data untuk filter ini</td></tr>
                ) : rows.map((r, i) => {
                  const susut = perlakuanKode(r.kode_barang) !== 'tidak'
                  const p = r.p
                  return (
                    <tr key={r.nibar} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                      <td className="table-td">
                        <p className="font-medium text-gray-800 text-xs">{r.nama_barang || '-'}</p>
                        <p className="text-gray-400 text-xs mt-0.5">{r.nibar} · {r.kode_barang}</p>
                      </td>
                      <td className="table-td text-xs text-gray-600">{skpdNama[r.skpd_id] || '-'}</td>
                      <td className="table-td text-center text-xs">{METODE_LABEL[perlakuanKode(r.kode_barang)]}</td>
                      <td className="table-td text-right text-xs">{dash(p ? formatRupiah(p.nilai_buku_awal) : '-', susut && !!p)}</td>
                      <td className="table-td text-right text-xs font-medium text-teal">{dash(p ? formatRupiah(p.beban_penyusutan) : '-', susut && !!p)}</td>
                      <td className="table-td text-right text-xs">{dash(p ? formatRupiah(p.akumulasi_akhir) : '-', susut && !!p)}</td>
                      <td className="table-td text-right text-xs">{susut && p ? formatRupiah(p.nilai_buku_akhir) : formatRupiah(r.nilai_perolehan)}</td>
                      <td className="table-td text-center text-xs">{dash(p ? p.sisa_masa_manfaat_smt : '-', susut && !!p)}</td>
                    </tr>
                  )
                })}
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
