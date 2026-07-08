'use client'
// Saldo Awal → Rekapitulasi. Rekap dari saldo_awal_2026 (baseline 2026 = saldo
// akhir 2025). Isi HANYA saldo awal (belum ada mutasi/penyusutan berjalan).
// Model 1: per golongan. Model 2: matriks per SKPD × per jenis.
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { exportToExcel } from '@/lib/export'
import { GOLONGAN_REKAP, kodeLevel3 } from '@/lib/bmd'
import SkpdCombobox, { type SkpdSelection as OrgSelection } from '@/components/SkpdCombobox'
import KomptabelRadio from '@/components/KomptabelRadio'
import RekapTable, { type RekapRow } from '@/components/RekapTable'
import RekapMatrixTable, { METRIC_LABEL, type MatrixRow, type MetricOrAll, type Metric } from '@/components/RekapMatrixTable'
import RekapModelControls from '@/components/RekapModelControls'
import { useSkpdTree } from '@/components/useSkpdTree'

type SA = { skpd_id: number; kode_barang: string; nilai_perolehan: number; akumulasi_2025: number; beban_penyusutan_per_smt: number; nilai_buku_awal: number }
const SUB_METRICS: Metric[] = ['perolehan', 'akumulasi', 'beban', 'nilaiBuku']

export default function Page() {
  const supabase = createClient()
  const { rootOf } = useSkpdTree()
  const [org, setOrg] = useState<OrgSelection>({ skpdId: null, descendantIds: null })
  const [komptabel, setKomptabel] = useState('')
  const [model, setModel] = useState<1 | 2>(1)
  const [metric, setMetric] = useState<MetricOrAll>('perolehan')
  const [rows, setRows] = useState<RekapRow[] | null>(null)
  const [matrix, setMatrix] = useState<MatrixRow[]>([])
  const [loading, setLoading] = useState(false)

  async function proses() {
    setLoading(true)
    setRows([])
    const agg: Record<string, { kuantitas: number; perolehan: number; akumulasi: number; beban: number; nilaiBuku: number }> = {}
    const mtx: Record<number, MatrixRow> = {}
    for (let from = 0; ; from += 1000) {
      let q = supabase.from('aset_awal_2026')
        .select('skpd_id,kode_barang,nilai_perolehan,akumulasi_2025,beban_penyusutan_per_smt,nilai_buku_awal')
      if (org.descendantIds) q = q.in('skpd_id', org.descendantIds)
      if (komptabel) q = q.eq('intra_ekstra', komptabel)
      const { data } = await q.range(from, from + 999)
      if (!data || data.length === 0) break
      for (const r of data as SA[]) {
        const g = kodeLevel3(r.kode_barang)
        const perolehan = r.nilai_perolehan || 0
        const akumulasi = r.akumulasi_2025 || 0
        const beban = r.beban_penyusutan_per_smt || 0
        const nilaiBuku = r.nilai_buku_awal || perolehan
        // Model 1: per golongan
        agg[g] ??= { kuantitas: 0, perolehan: 0, akumulasi: 0, beban: 0, nilaiBuku: 0 }
        agg[g].kuantitas += 1
        agg[g].perolehan += perolehan; agg[g].akumulasi += akumulasi
        agg[g].beban += beban; agg[g].nilaiBuku += nilaiBuku
        // Model 2: per SKPD (root) per golongan
        const root = rootOf(r.skpd_id)
        const rid = root?.id ?? r.skpd_id
        const rnama = root?.nama ?? `SKPD #${r.skpd_id}`
        mtx[rid] ??= { skpdId: rid, skpdNama: rnama, cells: {} }
        const c = (mtx[rid].cells[g] ??= { perolehan: 0, akumulasi: 0, beban: 0, nilaiBuku: 0 })
        c.perolehan += perolehan; c.akumulasi += akumulasi; c.beban += beban; c.nilaiBuku += nilaiBuku
      }
      if (data.length < 1000) break
    }
    setRows(GOLONGAN_REKAP.map(g => ({
      kode: g.kode, uraian: g.uraian, disusutkan: g.disusutkan,
      kuantitas: agg[g.kode]?.kuantitas || 0,
      perolehan: agg[g.kode]?.perolehan || 0,
      akumulasi: agg[g.kode]?.akumulasi || 0,
      beban: agg[g.kode]?.beban || 0,
      nilaiBuku: agg[g.kode]?.nilaiBuku || (agg[g.kode]?.perolehan || 0),
    })))
    setMatrix(Object.values(mtx).sort((a, b) => a.skpdNama.localeCompare(b.skpdNama)))
    setLoading(false)
  }

  function handleExport() {
    if (model === 1) {
      if (!rows) return
      exportToExcel(rows.map(r => ({
        'Kode Jenis': r.kode, 'Uraian': r.uraian,
        'Kuantitas': r.kuantitas,
        'Harga Perolehan': r.perolehan,
        'Akumulasi Penyusutan (Saldo Awal)': r.disusutkan ? r.akumulasi : '',
        'Beban Penyusutan / Smt': r.disusutkan ? r.beban : '',
        'Nilai Buku': r.nilaiBuku,
      })), 'Rekap_Saldo_Awal_2026', 'Rekap Saldo Awal')
      return
    }
    // Model 2 matriks
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
    }), 'Rekap_Saldo_Awal_2026_per_SKPD', 'Rekap per SKPD')
  }

  const hasData = model === 1 ? (rows && rows.length > 0) : matrix.length > 0

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Saldo Awal — Rekapitulasi</h1>
        <p className="text-gray-500 text-sm mt-1">Posisi saldo awal 2026 (baseline e-BMD / akhir 2025), per golongan BMD.</p>
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
          labelAkumulasi="Akumulasi Penyusutan (Saldo Awal)" labelBeban="Beban Penyusutan / Smt" />
      ) : (
        <RekapMatrixTable rows={matrix} golongan={GOLONGAN_REKAP} metric={metric} loading={loading} />
      )}
    </div>
  )
}
