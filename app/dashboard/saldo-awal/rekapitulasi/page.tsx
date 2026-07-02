'use client'
// Saldo Awal → Rekapitulasi. Rekap per golongan dari saldo_awal_2026 (baseline
// 2026 = saldo akhir 2025). Isi HANYA saldo awal (belum ada mutasi/penyusutan berjalan).
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { exportToExcel } from '@/lib/export'
import { GOLONGAN_REKAP, kodeLevel3 } from '@/lib/bmd'
import OrgFilter, { type OrgSelection } from '@/components/OrgFilter'
import KomptabelRadio from '@/components/KomptabelRadio'
import RekapTable, { type RekapRow } from '@/components/RekapTable'

type SA = { kode_barang: string; nilai_perolehan: number; akumulasi_2025: number; beban_penyusutan_per_smt: number; nilai_buku_awal: number }

export default function Page() {
  const supabase = createClient()
  const [org, setOrg] = useState<OrgSelection>({ skpdId: null, descendantIds: null })
  const [komptabel, setKomptabel] = useState('')
  const [rows, setRows] = useState<RekapRow[] | null>(null)
  const [loading, setLoading] = useState(false)

  async function proses() {
    setLoading(true)
    setRows([])
    const agg: Record<string, { perolehan: number; akumulasi: number; beban: number; nilaiBuku: number }> = {}
    for (let from = 0; ; from += 1000) {
      let q = supabase.from('saldo_awal_2026')
        .select('kode_barang,nilai_perolehan,akumulasi_2025,beban_penyusutan_per_smt,nilai_buku_awal')
      if (org.descendantIds) q = q.in('skpd_id', org.descendantIds)
      if (komptabel) q = q.eq('intra_ekstra', komptabel)
      const { data } = await q.range(from, from + 999)
      if (!data || data.length === 0) break
      for (const r of data as SA[]) {
        const g = kodeLevel3(r.kode_barang)
        agg[g] ??= { perolehan: 0, akumulasi: 0, beban: 0, nilaiBuku: 0 }
        agg[g].perolehan += r.nilai_perolehan || 0
        agg[g].akumulasi += r.akumulasi_2025 || 0
        agg[g].beban += r.beban_penyusutan_per_smt || 0
        agg[g].nilaiBuku += r.nilai_buku_awal || 0
      }
      if (data.length < 1000) break
    }
    setRows(GOLONGAN_REKAP.map(g => ({
      kode: g.kode, uraian: g.uraian, disusutkan: g.disusutkan,
      perolehan: agg[g.kode]?.perolehan || 0,
      akumulasi: agg[g.kode]?.akumulasi || 0,
      beban: agg[g.kode]?.beban || 0,
      nilaiBuku: agg[g.kode]?.nilaiBuku || (agg[g.kode]?.perolehan || 0),
    })))
    setLoading(false)
  }

  function handleExport() {
    if (!rows) return
    exportToExcel(rows.map(r => ({
      'Kode Jenis': r.kode, 'Uraian': r.uraian,
      'Harga Perolehan': r.perolehan,
      'Akumulasi Penyusutan (Saldo Awal)': r.disusutkan ? r.akumulasi : '',
      'Beban Penyusutan / Smt': r.disusutkan ? r.beban : '',
      'Nilai Buku': r.nilaiBuku,
    })), 'Rekap_Saldo_Awal_2026', 'Rekap Saldo Awal')
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Saldo Awal — Rekapitulasi</h1>
        <p className="text-gray-500 text-sm mt-1">Posisi saldo awal 2026 (baseline e-BMD / akhir 2025), per golongan BMD.</p>
      </div>

      <div className="card p-5 mb-4">
        <h2 className="text-base font-semibold text-gray-800 mb-4">Filter data</h2>
        <div className="space-y-3 max-w-3xl">
          <OrgFilter onChange={setOrg} />
          <KomptabelRadio value={komptabel} onChange={setKomptabel} />
          <div className="flex items-center gap-3">
            <span className="w-40 flex-shrink-0" />
            <button className="btn-primary" onClick={proses} disabled={loading}>{loading ? 'Memproses...' : 'Proses'}</button>
            {rows && rows.length > 0 && <button className="btn-secondary" onClick={handleExport}>Export Excel</button>}
          </div>
        </div>
      </div>

      {rows === null ? (
        <div className="card p-12 text-center text-gray-400 text-sm">
          Atur filter lalu klik <span className="font-medium text-gray-600">Proses</span>.
        </div>
      ) : (
        <RekapTable rows={rows} loading={loading}
          labelAkumulasi="Akumulasi Penyusutan (Saldo Awal)" labelBeban="Beban Penyusutan / Smt" />
      )}
    </div>
  )
}
