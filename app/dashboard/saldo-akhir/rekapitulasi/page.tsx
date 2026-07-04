'use client'
// Saldo Akhir → Rekapitulasi. Harga perolehan dari saldo_awal_2026 (baseline) +
// akumulasi/beban/nilai buku dari penyusutan_periode pada periode terpilih.
// Model 1: per golongan. Model 2: matriks per SKPD × per jenis.
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { exportToExcel } from '@/lib/export'
import { GOLONGAN_REKAP, kodeLevel3 } from '@/lib/bmd'
import SkpdCombobox, { type SkpdSelection as OrgSelection } from '@/components/SkpdCombobox'
import KomptabelRadio from '@/components/KomptabelRadio'
import RekapTable, { type RekapRow } from '@/components/RekapTable'
import RekapMatrixTable, { METRIC_LABEL, type MatrixRow, type MatrixCell, type MetricOrAll, type Metric } from '@/components/RekapMatrixTable'
import RekapModelControls from '@/components/RekapModelControls'
import { useSkpdTree } from '@/components/useSkpdTree'

const SUB_METRICS: Metric[] = ['perolehan', 'akumulasi', 'beban', 'nilaiBuku']

export default function Page() {
  const supabase = createClient()
  const { rootOf } = useSkpdTree()
  const [org, setOrg] = useState<OrgSelection>({ skpdId: null, descendantIds: null })
  const [komptabel, setKomptabel] = useState('')
  const [tahun, setTahun] = useState('2026')
  const [smt, setSmt] = useState('2')
  const [model, setModel] = useState<1 | 2>(1)
  const [metric, setMetric] = useState<MetricOrAll>('perolehan')
  const [rows, setRows] = useState<RekapRow[] | null>(null)
  const [matrix, setMatrix] = useState<MatrixRow[]>([])
  const [loading, setLoading] = useState(false)
  const periode = `${tahun}-S${smt}`

  const rootId = (skpdId: number) => rootOf(skpdId)?.id ?? skpdId
  const mtxKey = (skpdId: number, g: string) => `${rootId(skpdId)}|${g}`

  // Ambil/siapkan sel matriks (skpd root × golongan) sekali.
  function ensureCell(mtx: Record<number, MatrixRow>, skpdId: number, g: string): MatrixCell {
    const root = rootOf(skpdId)
    const rid = root?.id ?? skpdId
    const rnama = root?.nama ?? `SKPD #${skpdId}`
    mtx[rid] ??= { skpdId: rid, skpdNama: rnama, cells: {} }
    return (mtx[rid].cells[g] ??= { perolehan: 0, akumulasi: 0, beban: 0, nilaiBuku: 0 })
  }

  async function proses() {
    setLoading(true); setRows([])
    const mtx: Record<number, MatrixRow> = {}
    const disusutkanKode = new Set(GOLONGAN_REKAP.filter(g => g.disusutkan).map(g => g.kode))
    const hasPeny = new Set<string>() // `${rid}|${golongan}` yg punya hasil engine

    // 1. Harga perolehan per golongan (Model 1) + per SKPD (Model 2) dari baseline
    const perolehan: Record<string, number> = {}
    for (let from = 0; ; from += 1000) {
      let q = supabase.from('saldo_awal_2026').select('skpd_id,kode_barang,nilai_perolehan')
      if (org.descendantIds) q = q.in('skpd_id', org.descendantIds)
      if (komptabel) q = q.eq('intra_ekstra', komptabel)
      const { data } = await q.range(from, from + 999)
      if (!data || data.length === 0) break
      for (const r of data as { skpd_id: number; kode_barang: string; nilai_perolehan: number }[]) {
        const g = kodeLevel3(r.kode_barang)
        const v = r.nilai_perolehan || 0
        perolehan[g] = (perolehan[g] || 0) + v
        ensureCell(mtx, r.skpd_id, g).perolehan += v
      }
      if (data.length < 1000) break
    }

    // 2. Penyusutan kumulatif per golongan (Model 1) + per SKPD (Model 2) pd periode.
    //    Nilai buku sel diakumulasi dari engine (nilai_buku_akhir), konsisten Model 1.
    const peny: Record<string, { akumulasi: number; beban: number; nilaiBuku: number }> = {}
    for (let from = 0; ; from += 1000) {
      let q = supabase.from('penyusutan_periode')
        .select('skpd_id,kode_barang,beban_penyusutan,akumulasi_akhir,nilai_buku_akhir').eq('periode', periode)
      if (org.descendantIds) q = q.in('skpd_id', org.descendantIds)
      const { data } = await q.range(from, from + 999)
      if (!data || data.length === 0) break
      for (const r of data as { skpd_id: number; kode_barang: string; beban_penyusutan: number; akumulasi_akhir: number; nilai_buku_akhir: number }[]) {
        const g = kodeLevel3(r.kode_barang)
        peny[g] ??= { akumulasi: 0, beban: 0, nilaiBuku: 0 }
        peny[g].akumulasi += r.akumulasi_akhir || 0
        peny[g].beban += r.beban_penyusutan || 0
        peny[g].nilaiBuku += r.nilai_buku_akhir || 0
        const c = ensureCell(mtx, r.skpd_id, g)
        c.akumulasi += r.akumulasi_akhir || 0
        c.beban += r.beban_penyusutan || 0
        c.nilaiBuku += r.nilai_buku_akhir || 0
        hasPeny.add(mtxKey(r.skpd_id, g))
      }
      if (data.length < 1000) break
    }

    // Rekonsiliasi nilai buku sel: golongan disusutkan dgn hasil engine → pakai
    // akumulasi engine; selain itu (non-disusutkan / belum ada engine) → = perolehan.
    for (const row of Object.values(mtx)) {
      for (const g of GOLONGAN_REKAP) {
        const c = row.cells[g.kode]
        if (!c) continue
        if (!(disusutkanKode.has(g.kode) && hasPeny.has(mtxKey(row.skpdId, g.kode)))) {
          c.nilaiBuku = c.perolehan
        }
      }
    }

    setRows(GOLONGAN_REKAP.map(g => {
      const hp = perolehan[g.kode] || 0
      const p = peny[g.kode]
      if (g.disusutkan && p) {
        return { kode: g.kode, uraian: g.uraian, disusutkan: true, perolehan: hp, akumulasi: p.akumulasi, beban: p.beban, nilaiBuku: p.nilaiBuku }
      }
      return { kode: g.kode, uraian: g.uraian, disusutkan: g.disusutkan, perolehan: hp, akumulasi: 0, beban: 0, nilaiBuku: hp }
    }))
    setMatrix(Object.values(mtx).sort((a, b) => a.skpdNama.localeCompare(b.skpdNama)))
    setLoading(false)
  }

  function handleExport() {
    if (model === 1) {
      if (!rows) return
      exportToExcel(rows.map(r => ({
        'Kode Jenis': r.kode, 'Uraian': r.uraian, 'Harga Perolehan': r.perolehan,
        [`Akumulasi Penyusutan s.d. ${periode}`]: r.disusutkan ? r.akumulasi : '',
        [`Beban Penyusutan ${periode}`]: r.disusutkan ? r.beban : '',
        'Nilai Buku': r.nilaiBuku,
      })), `Rekap_Saldo_Akhir_${periode}`, 'Rekap Saldo Akhir')
      return
    }
    const metrics: Metric[] = metric === 'semua' ? SUB_METRICS : [metric]
    exportToExcel(matrix.map(r => {
      const row: Record<string, unknown> = { SKPD: r.skpdNama }
      for (const g of GOLONGAN_REKAP) {
        const c = r.cells[g.kode]
        for (const m of metrics) {
          const applicable = (m !== 'akumulasi' && m !== 'beban') || g.disusutkan
          const key = metric === 'semua' ? `${g.uraian} — ${METRIC_LABEL[m]}` : g.uraian
          row[key] = applicable ? (c?.[m] || 0) : ''
        }
      }
      return row
    }), `Rekap_Saldo_Akhir_${periode}_per_SKPD`, 'Rekap per SKPD')
  }

  const hasData = model === 1 ? (rows && rows.length > 0) : matrix.length > 0

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Saldo Akhir — Rekapitulasi</h1>
        <p className="text-gray-500 text-sm mt-1">Total rekapitulasi & penyusutan s.d. periode {periode}, per golongan BMD.</p>
      </div>

      <div className="card p-5 mb-4">
        <h2 className="text-base font-semibold text-gray-800 mb-4">Filter data</h2>
        <div className="space-y-3 max-w-3xl">
          <RekapModelControls model={model} onModel={setModel} metric={metric} onMetric={setMetric} />
          <div className="flex items-center gap-3">
            <label className="w-40 text-sm text-gray-600 text-right flex-shrink-0">SKPD / Lokasi :</label>
            <SkpdCombobox onChangeSelection={setOrg} allowClear placeholder="Semua — atau ketik SKPD / Sub OPD / Lokasi..." />
          </div>
          <KomptabelRadio value={komptabel} onChange={setKomptabel} />
          <div className="flex items-center gap-3">
            <label className="w-40 text-sm text-gray-600 text-right flex-shrink-0">Sampai Semester :</label>
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
            <span className="w-40 flex-shrink-0" />
            <button className="btn-primary" onClick={proses} disabled={loading}>{loading ? 'Memproses...' : 'Proses'}</button>
            {hasData && <button className="btn-secondary" onClick={handleExport}>Export Excel</button>}
          </div>
        </div>
      </div>

      {rows === null ? (
        <div className="card p-12 text-center text-gray-400 text-sm">
          Atur filter lalu klik <span className="font-medium text-gray-600">Proses</span>.
        </div>
      ) : model === 1 ? (
        <RekapTable rows={rows} loading={loading}
          labelAkumulasi={`Akumulasi s.d. ${periode}`} labelBeban={`Beban ${periode}`} />
      ) : (
        <RekapMatrixTable rows={matrix} golongan={GOLONGAN_REKAP} metric={metric} loading={loading} />
      )}
    </div>
  )
}
