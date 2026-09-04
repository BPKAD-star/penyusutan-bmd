'use client'
// Saldo Awal → Rekapitulasi. Rekap dari saldo_awal_2026 (baseline 2026 = saldo
// akhir 2025). Isi HANYA saldo awal (belum ada mutasi/penyusutan berjalan).
// Model 1: per golongan. Model 2: matriks per SKPD × per jenis.
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { exportToExcel } from '@/lib/export'
import { namaBerkasLaporan } from '@/lib/namaBerkas'
import { GOLONGAN_REKAP } from '@/lib/bmd'
import SkpdCombobox, { type SkpdSelection as OrgSelection } from '@/components/SkpdCombobox'
import KomptabelRadio from '@/components/KomptabelRadio'
import RekapTable, { type RekapRow } from '@/components/RekapTable'
import RekapMatrixTable, { METRIC_LABEL, type MatrixRow, type MetricOrAll, type Metric } from '@/components/RekapMatrixTable'
import RekapModelControls from '@/components/RekapModelControls'
import { useSkpdTree } from '@/components/useSkpdTree'
import { assertOk } from '@/shared/db/query'

const SUB_METRICS: Metric[] = ['perolehan', 'akumulasi', 'beban', 'nilaiBuku']

export default function Page() {
  const supabase = createClient()
  const { rootOf } = useSkpdTree()
  const [org, setOrg] = useState<OrgSelection>({ skpdId: null, descendantIds: null })
  const [komptabel, setKomptabel] = useState('')
  const [model, setModel] = useState<1 | 2 | 3>(1) // Model 3 tidak dipakai di halaman ini (RekapModelControls default models=[1,2])
  const [metric, setMetric] = useState<MetricOrAll>('perolehan')
  const [rows, setRows] = useState<RekapRow[] | null>(null)
  const [matrix, setMatrix] = useState<MatrixRow[]>([])
  const [loading, setLoading] = useState(false)
  // ⚠️ WAJIB ADA & WAJIB DITAMPILKAN (rules.md §2.4). Sebelum 2026-08-10 halaman
  // ini memakai `const { data } = await supabase.rpc(...)` lalu `(data || [])`:
  // query gagal → data null → loop nol kali → SELURUH tabel terisi 0 tanpa satu
  // pun pesan. Nol yang terlihat sah itu lebih berbahaya daripada halaman error
  // — operator menyimpulkan "asetnya belum diinput", padahal query-nya yang
  // tembus statement timeout 8 dtk. Keluarga INS-06/INS-08.
  const [err, setErr] = useState('')

  async function proses() {
    setLoading(true)
    setErr('')
    setRows([])
    const agg: Record<string, { kuantitas: number; perolehan: number; akumulasi: number; beban: number; nilaiBuku: number }> = {}
    const mtx: Record<number, MatrixRow> = {}
    // Agregasi per (skpd_id, golongan) dilakukan di DB via RPC (satu query
    // GROUP BY) — BUKAN lagi paging seluruh aset_awal_2026 ke browser lalu
    // jumlah di JS (ratusan request se-kabupaten sejak import 218rb baris P&M).
    // nilai_buku sudah = COALESCE(nilai_buku_awal, nilai_perolehan) di SQL.
    // Rollup ke SKPD induk (rootOf) & mapping GOLONGAN_REKAP tetap di client.
    try {
    const data = assertOk(await supabase.rpc('fn_rekap_saldo_awal', {
      p_skpd_ids: org.descendantIds ?? null,
      p_komptabel: komptabel || null,
    }), 'rekap saldo awal')
    for (const r of (data || []) as { skpd_id: number; golongan: string; kuantitas: number; perolehan: number; akumulasi: number; beban: number; nilai_buku: number }[]) {
      const g = r.golongan
      const kuantitas = Number(r.kuantitas); const perolehan = Number(r.perolehan)
      const akumulasi = Number(r.akumulasi); const beban = Number(r.beban); const nilaiBuku = Number(r.nilai_buku)
      // Model 1: per golongan
      agg[g] ??= { kuantitas: 0, perolehan: 0, akumulasi: 0, beban: 0, nilaiBuku: 0 }
      agg[g].kuantitas += kuantitas
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
    setRows(GOLONGAN_REKAP.map(g => ({
      kode: g.kode, uraian: g.uraian, disusutkan: g.disusutkan,
      kuantitas: agg[g.kode]?.kuantitas || 0,
      perolehan: agg[g.kode]?.perolehan || 0,
      akumulasi: agg[g.kode]?.akumulasi || 0,
      beban: agg[g.kode]?.beban || 0,
      nilaiBuku: agg[g.kode]?.nilaiBuku ?? 0,
    })))
    setMatrix(Object.values(mtx).sort((a, b) => a.skpdNama.localeCompare(b.skpdNama)))
    } catch (e) {
      // MENOLAK menampilkan angka, bukan menampilkan nol.
      setErr(`${(e as Error).message} — angka TIDAK ditampilkan supaya tidak ada nol yang terbaca sebagai "belum ada data". Coba Proses lagi; kalau berulang, kabari admin.`)
      setRows(null)
      setMatrix([])
    } finally {
      // Di `finally`, bukan di akhir jalur sukses (rules.md §2.2, INS-10).
      setLoading(false)
    }
  }

  function handleExport() {
    // Export ikut fail-closed (rules.md §2.3): Excel setengah jadi yang
    // terlanjur terunduh tidak punya tanda apa pun bahwa isinya kurang.
    if (err) return
    if (model === 1) {
      if (!rows) return
      exportToExcel(rows.map(r => ({
        'Kode Jenis': r.kode, 'Uraian': r.uraian,
        'Kuantitas': r.kuantitas,
        'Harga Perolehan': r.perolehan,
        'Akumulasi Penyusutan (Saldo Awal)': r.disusutkan ? r.akumulasi : '',
        'Beban Penyusutan / Smt': r.disusutkan ? r.beban : '',
        'Nilai Buku': r.nilaiBuku,
      })), namaBerkasLaporan({
        // Snapshot: satu-satunya posisi yang ada, bukan filter operator.
        laporan: 'Rekap Saldo Awal', periode: 2026,
        skpd: org.skpdId ? rootOf(org.skpdId)?.nama : null, akhiran: ['Model 1'],
      }), 'Rekap Saldo Awal')
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
    }), namaBerkasLaporan({
      laporan: 'Rekap Saldo Awal', periode: 2026,
      skpd: org.skpdId ? rootOf(org.skpdId)?.nama : null, akhiran: ['per SKPD'],
    }), 'Rekap per SKPD')
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
            <SkpdCombobox lockToOperator onChangeSelection={setOrg} allowClear placeholder="Semua — atau ketik SKPD / Sub OPD / Lokasi..." />
          </div>
          <KomptabelRadio value={komptabel} onChange={setKomptabel} />
          <div className="flex items-center gap-3">
            <span className="w-40 flex-shrink-0" />
            <button className="btn-primary" onClick={proses} disabled={loading}>{loading ? 'Memproses...' : 'Proses'}</button>
            {hasData && <button className="btn-secondary" onClick={handleExport}>Export Excel</button>}
          </div>
        </div>
      </div>

      {err ? (
        <div role="alert" className="card border-red-200 bg-red-50 p-4 text-sm text-red-700">{err}</div>
      ) : rows === null ? (
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
