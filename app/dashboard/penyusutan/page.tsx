'use client'
// Penyusutan — filter ala e-SIMBADA: organisasi (SKPD/Sub OPD/Sub Sub OPD) →
// jenis aset → komptabel → semester → Tampilkan.
//
// Semester & engine: penyusutan dihitung PER SEMESTER (tiap periode YYYY-S1/S2
// adalah dataset hasil engine tersendiri). Filter semester di sini hanya MEMILIH
// periode mana yang ditampilkan; perhitungan beban/akumulasi tetap tanggung jawab
// engine. Register aset (semua golongan) diambil dari saldo_awal_2026; angka
// penyusutan dari penyusutan_periode. Golongan tanpa penyusutan → kolom "-".
//
// Tampilan: SEMUA baris hasil filter ditampilkan sekaligus (tanpa halaman) +
// baris TOTAL di bawah. Angka polos tanpa "Rp" agar mudah di-copy ke Excel.
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { exportToExcel } from '@/lib/export'
import { GOLONGAN_REKAP, perlakuanKode } from '@/lib/bmd'
import OrgFilter, { type OrgSelection } from '@/components/OrgFilter'
import { KapitalisasiDetailModal, type KapItem } from '@/components/KapitalisasiDetail'

type Base = {
  nibar: string; kode_barang: string; nama_barang: string; skpd_id: number
  nilai_perolehan: number; intra_ekstra: string | null
  tgl_perolehan: string | null; masa_manfaat_smt: number | null
}
type Peny = { nilai_buku_awal: number; beban_penyusutan: number; akumulasi_akhir: number; nilai_buku_akhir: number; sisa_masa_manfaat_smt: number }
type Applied = { org: OrgSelection; golongan: string; komptabel: string; periode: string; search: string }

// Angka polos bergaya id-ID tanpa "Rp" (enak di-copas ke Excel).
const angka = (v: number | null | undefined) =>
  v == null ? '-' : new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(v)

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
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [skpdNama, setSkpdNama] = useState<Record<number, string>>({})
  const [kapMap, setKapMap] = useState<Record<string, KapItem[]>>({})
  const [detail, setDetail] = useState<{ nama: string; items: KapItem[] } | null>(null)

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

  function baseQuery(f: Applied) {
    let q = supabase.from('saldo_awal_2026')
      .select('nibar,kode_barang,nama_barang,skpd_id,nilai_perolehan,intra_ekstra,tgl_perolehan,masa_manfaat_smt')
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

  // Ambil SEMUA baris hasil filter (loop 1000-an) lalu gabung angka penyusutan.
  async function fetchAllBase(f: Applied) {
    const base: Base[] = []
    for (let from = 0; ; from += 1000) {
      const { data } = await baseQuery(f).range(from, from + 999)
      if (!data || data.length === 0) break
      base.push(...(data as Base[]))
      if (data.length < 1000) break
    }
    return base
  }

  // Peta kapitalisasi per NIBAR induk (buang yang sudah dibatalkan), urut tertua→termuda.
  async function fetchKap(f: Applied) {
    let kq = supabase.from('transaksi_bmd').select('id,tanggal,keterangan,payload,aset:aset_id(nibar)').eq('jenis', 'kapitalisasi')
    let bq = supabase.from('transaksi_bmd').select('payload').eq('jenis', 'batal_kapitalisasi')
    if (f.org.descendantIds) { kq = kq.in('skpd_asal', f.org.descendantIds); bq = bq.in('skpd_asal', f.org.descendantIds) }
    const [{ data: kap }, { data: batal }] = await Promise.all([kq.order('id', { ascending: true }), bq])
    const cancelled = new Set<number>()
    for (const b of (batal || []) as { payload: { target_trx_id?: number } }[]) {
      const t = Number(b.payload?.target_trx_id); if (Number.isFinite(t)) cancelled.add(t)
    }
    const map: Record<string, KapItem[]> = {}
    for (const r of (kap || []) as unknown as {
      id: number; tanggal: string; keterangan: string | null
      payload: { no_dokumen?: string; anak?: KapItem['anak']; snapshot?: KapItem['snapshot'] }; aset: { nibar: string | null } | null
    }[]) {
      if (cancelled.has(r.id) || !r.aset?.nibar) continue
      const item: KapItem = { no_dokumen: r.payload?.no_dokumen || '(tanpa no. dok)', tanggal: r.tanggal, keterangan: r.keterangan, snapshot: r.payload?.snapshot || null, anak: r.payload?.anak || [] }
      ;(map[r.aset.nibar] ||= []).push(item)
    }
    return map
  }

  async function load(f: Applied) {
    setLoading(true)
    const base = await fetchAllBase(f)
    const pmap = await fetchPeny(base.map(b => b.nibar), f.periode)
    setRows(base.map(b => ({ ...b, p: pmap.get(b.nibar) })))
    setKapMap(await fetchKap(f))
    setLoading(false)
  }

  function tampilkan() {
    const f: Applied = { org, golongan, komptabel, periode: `${tahun}-S${smt}`, search }
    setApplied(f); load(f)
  }

  async function handleExport() {
    if (!applied) return
    setExporting(true)
    const base = await fetchAllBase(applied)
    const pmap = await fetchPeny(base.map(b => b.nibar), applied.periode)
    exportToExcel(base.map(b => {
      const p = pmap.get(b.nibar)
      const susut = perlakuanKode(b.kode_barang) !== 'tidak'
      return {
        'NIBAR': b.nibar, 'Nama Barang': b.nama_barang, 'Kode Barang': b.kode_barang,
        'SKPD': skpdNama[b.skpd_id] || '', 'Komptabel': b.intra_ekstra || '',
        'Tgl Perolehan': b.tgl_perolehan || '',
        'Nilai Perolehan': b.nilai_perolehan,
        'Beban': susut && p ? p.beban_penyusutan : '',
        'Akumulasi': susut && p ? p.akumulasi_akhir : '',
        'Nilai Buku Akhir': susut && p ? p.nilai_buku_akhir : b.nilai_perolehan,
        'Masa Manfaat (Smt)': susut ? (b.masa_manfaat_smt ?? '') : '',
        'Sisa (Smt)': susut && p ? p.sisa_masa_manfaat_smt : '',
        'Periode': applied.periode,
      }
    }), `Penyusutan_${applied.periode}`, 'Penyusutan')
    setExporting(false)
  }

  const dash = (v: React.ReactNode, ok: boolean) => (ok ? v : <span className="text-gray-300">-</span>)

  // Total kolom angka untuk baris TOTAL di bawah tabel.
  const tot = rows.reduce((a, r) => {
    const susut = perlakuanKode(r.kode_barang) !== 'tidak'
    const p = r.p
    a.perolehan += r.nilai_perolehan || 0
    if (susut && p) { a.beban += p.beban_penyusutan; a.akum += p.akumulasi_akhir }
    a.nba += (susut && p) ? p.nilai_buku_akhir : (r.nilai_perolehan || 0)
    return a
  }, { perolehan: 0, beban: 0, akum: 0, nba: 0 })

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
              {rows.length.toLocaleString('id-ID')} aset · periode {applied.periode}
              {applied.org.skpdId && skpdNama[applied.org.skpdId] ? ` · ${skpdNama[applied.org.skpdId]}` : ''}
            </span>
            <button onClick={handleExport} disabled={exporting || rows.length === 0} className="btn-secondary text-xs">
              {exporting ? 'Mengekspor...' : 'Export Excel'}
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="table-th">SKPD</th>
                  <th className="table-th">Nama Barang</th>
                  <th className="table-th">Kode Barang</th>
                  <th className="table-th">Tgl Perolehan</th>
                  <th className="table-th text-right">Nilai Perolehan</th>
                  <th className="table-th text-right">Beban</th>
                  <th className="table-th text-right">Akumulasi</th>
                  <th className="table-th text-right">Nilai Buku Akhir</th>
                  <th className="table-th text-center">Masa Manfaat (Smt)</th>
                  <th className="table-th text-center">Sisa (Smt)</th>
                  <th className="table-th text-center w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {loading ? (
                  <tr><td colSpan={11} className="table-td text-center py-12 text-gray-400">Memuat data...</td></tr>
                ) : rows.length === 0 ? (
                  <tr><td colSpan={11} className="table-td text-center py-12 text-gray-400">Tidak ada data untuk filter ini</td></tr>
                ) : rows.map((r, i) => {
                  const susut = perlakuanKode(r.kode_barang) !== 'tidak'
                  const p = r.p
                  const kap = kapMap[r.nibar]
                  return (
                    <tr key={r.nibar} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                      <td className="table-td text-xs text-gray-600">{skpdNama[r.skpd_id] || '-'}</td>
                      <td className="table-td">
                        <p className={`text-xs ${kap ? 'font-bold text-gray-900' : 'font-medium text-gray-800'}`}>{r.nama_barang || '-'}</p>
                        <p className="text-gray-400 text-xs mt-0.5">{r.nibar}</p>
                      </td>
                      <td className="table-td text-xs text-gray-600">{r.kode_barang}</td>
                      <td className="table-td text-xs text-gray-600">{r.tgl_perolehan || '-'}</td>
                      <td className="table-td text-right text-xs">{angka(r.nilai_perolehan)}</td>
                      <td className="table-td text-right text-xs font-medium text-teal">{dash(angka(p?.beban_penyusutan), susut && !!p)}</td>
                      <td className="table-td text-right text-xs">{dash(angka(p?.akumulasi_akhir), susut && !!p)}</td>
                      <td className="table-td text-right text-xs">{susut && p ? angka(p.nilai_buku_akhir) : angka(r.nilai_perolehan)}</td>
                      <td className="table-td text-center text-xs">{susut ? (r.masa_manfaat_smt ?? <span className="text-gray-300">-</span>) : <span className="text-gray-300">-</span>}</td>
                      <td className="table-td text-center text-xs">{dash(p?.sisa_masa_manfaat_smt, susut && !!p)}</td>
                      <td className="table-td text-center">
                        {kap && (
                          <button title="Lihat rincian kapitalisasi/rehab" onClick={() => setDetail({ nama: r.nama_barang || r.nibar, items: kap })}
                            className="inline-flex items-center justify-center w-7 h-7 rounded bg-gray-100 hover:bg-gray-200 text-gray-700">👁</button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              {!loading && rows.length > 0 && (
                <tfoot>
                  <tr className="bg-gray-50 border-t-2 border-gray-200 font-semibold text-gray-800">
                    <td className="table-td text-xs" colSpan={4}>TOTAL ({rows.length.toLocaleString('id-ID')} aset)</td>
                    <td className="table-td text-right text-xs">{angka(tot.perolehan)}</td>
                    <td className="table-td text-right text-xs text-teal">{angka(tot.beban)}</td>
                    <td className="table-td text-right text-xs">{angka(tot.akum)}</td>
                    <td className="table-td text-right text-xs">{angka(tot.nba)}</td>
                    <td className="table-td" />
                    <td className="table-td" />
                    <td className="table-td" />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}

      {detail && <KapitalisasiDetailModal title={`Rincian Kapitalisasi — ${detail.nama}`} items={detail.items} onClose={() => setDetail(null)} />}
    </div>
  )
}
