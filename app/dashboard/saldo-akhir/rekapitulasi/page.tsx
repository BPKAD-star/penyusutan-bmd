'use client'
// Saldo Akhir → Rekapitulasi. Rekap per golongan s.d. akhir tahun terpilih:
// Harga perolehan dari saldo_awal_2026 (baseline) + akumulasi/beban/nilai buku
// dari penyusutan_periode pada periode terpilih (hasil engine kumulatif).
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { exportToExcel } from '@/lib/export'
import { GOLONGAN_REKAP, kodeLevel3 } from '@/lib/bmd'
import OrgFilter, { type OrgSelection } from '@/components/OrgFilter'
import KomptabelRadio from '@/components/KomptabelRadio'
import RekapTable, { type RekapRow } from '@/components/RekapTable'

export default function Page() {
  const supabase = createClient()
  const [org, setOrg] = useState<OrgSelection>({ skpdId: null, descendantIds: null })
  const [komptabel, setKomptabel] = useState('')
  const [tahun, setTahun] = useState('2026')
  const [smt, setSmt] = useState('2')
  const [rows, setRows] = useState<RekapRow[] | null>(null)
  const [loading, setLoading] = useState(false)
  const periode = `${tahun}-S${smt}`

  async function proses() {
    setLoading(true); setRows([])

    // 1. Harga perolehan per golongan dari saldo awal (baseline)
    const perolehan: Record<string, number> = {}
    for (let from = 0; ; from += 1000) {
      let q = supabase.from('saldo_awal_2026').select('kode_barang,nilai_perolehan')
      if (org.descendantIds) q = q.in('skpd_id', org.descendantIds)
      if (komptabel) q = q.eq('intra_ekstra', komptabel)
      const { data } = await q.range(from, from + 999)
      if (!data || data.length === 0) break
      for (const r of data as { kode_barang: string; nilai_perolehan: number }[]) {
        const g = kodeLevel3(r.kode_barang)
        perolehan[g] = (perolehan[g] || 0) + (r.nilai_perolehan || 0)
      }
      if (data.length < 1000) break
    }

    // 2. Penyusutan kumulatif per golongan pada periode terpilih
    const peny: Record<string, { akumulasi: number; beban: number; nilaiBuku: number }> = {}
    for (let from = 0; ; from += 1000) {
      let q = supabase.from('penyusutan_periode')
        .select('kode_barang,beban_penyusutan,akumulasi_akhir,nilai_buku_akhir').eq('periode', periode)
      if (org.descendantIds) q = q.in('skpd_id', org.descendantIds)
      const { data } = await q.range(from, from + 999)
      if (!data || data.length === 0) break
      for (const r of data as { kode_barang: string; beban_penyusutan: number; akumulasi_akhir: number; nilai_buku_akhir: number }[]) {
        const g = kodeLevel3(r.kode_barang)
        peny[g] ??= { akumulasi: 0, beban: 0, nilaiBuku: 0 }
        peny[g].akumulasi += r.akumulasi_akhir || 0
        peny[g].beban += r.beban_penyusutan || 0
        peny[g].nilaiBuku += r.nilai_buku_akhir || 0
      }
      if (data.length < 1000) break
    }

    setRows(GOLONGAN_REKAP.map(g => {
      const hp = perolehan[g.kode] || 0
      const p = peny[g.kode]
      if (g.disusutkan && p) {
        return { kode: g.kode, uraian: g.uraian, disusutkan: true, perolehan: hp, akumulasi: p.akumulasi, beban: p.beban, nilaiBuku: p.nilaiBuku }
      }
      // non-disusutkan atau belum ada hasil engine → nilai buku = perolehan
      return { kode: g.kode, uraian: g.uraian, disusutkan: g.disusutkan, perolehan: hp, akumulasi: 0, beban: 0, nilaiBuku: hp }
    }))
    setLoading(false)
  }

  function handleExport() {
    if (!rows) return
    exportToExcel(rows.map(r => ({
      'Kode Jenis': r.kode, 'Uraian': r.uraian, 'Harga Perolehan': r.perolehan,
      [`Akumulasi Penyusutan s.d. ${periode}`]: r.disusutkan ? r.akumulasi : '',
      [`Beban Penyusutan ${periode}`]: r.disusutkan ? r.beban : '',
      'Nilai Buku': r.nilaiBuku,
    })), `Rekap_Saldo_Akhir_${periode}`, 'Rekap Saldo Akhir')
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Saldo Akhir — Rekapitulasi</h1>
        <p className="text-gray-500 text-sm mt-1">Total rekapitulasi & penyusutan s.d. periode {periode}, per golongan BMD.</p>
      </div>

      <div className="card p-5 mb-4">
        <h2 className="text-base font-semibold text-gray-800 mb-4">Filter data</h2>
        <div className="space-y-3 max-w-3xl">
          <OrgFilter onChange={setOrg} />
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
          labelAkumulasi={`Akumulasi s.d. ${periode}`} labelBeban={`Beban ${periode}`} />
      )}
    </div>
  )
}
