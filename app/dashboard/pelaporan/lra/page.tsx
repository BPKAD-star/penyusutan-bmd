'use client'
// LRA — Realisasi Belanja Modal (bahan Rekonsiliasi). Fase A: import Excel
// akuntansi + Box LRA (belanja modal 5.2 per jenis × bulan). Kapitalisasi/Reklas
// + kolom Check = Fase B. Lihat docs/lra-plan.md.
import { useCallback, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { exportToExcel } from '@/lib/export'
import SkpdCombobox, { type SkpdSelection } from '@/components/SkpdCombobox'
import LraImport from '@/components/pelaporan/LraImport'
import { JENIS_BM, BULAN_SINGKAT, rekapModal, type LraRow } from '@/lib/lra'
import { tahunAwal } from '@/lib/tahunKerja'

const angka = (v: number) => new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(v || 0)

export default function LraPage() {
  const supabase = createClient()
  const [org, setOrg] = useState<SkpdSelection>({ skpdId: null, descendantIds: null })
  const [tahun, setTahun] = useState(() => tahunAwal('2026'))
  const [rows, setRows] = useState<LraRow[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [msg, setMsg] = useState('')

  const proses = useCallback(async () => {
    setLoading(true); setMsg('')
    const desc = org.descendantIds ?? null
    const out: LraRow[] = []
    for (let from = 0; ; from += 1000) {
      let q = supabase.from('lra_realisasi')
        .select('skpd_id,tanggal,bulan,no_bukti,kode_rekening,kode_grup3,kelompok,uraian,keterangan,debit,klasifikasi,jenis_tujuan')
        .eq('tahun', Number(tahun)).order('id').range(from, from + 999)
      if (desc) q = q.in('skpd_id', desc)
      const { data, error } = await q
      if (error) { setMsg(`Error: ${error.message}`); setLoading(false); return }
      const batch = (data || []) as LraRow[]
      out.push(...batch)
      if (batch.length < 1000) break
    }
    setRows(out)
    setLoading(false)
  }, [org, tahun, supabase])

  const rekap = rows ? rekapModal(rows) : null
  const nBarjas = rows ? rows.filter(r => r.kelompok === 'barjas').length : 0
  const nBukti = rows ? new Set(rows.map(r => r.no_bukti)).size : 0

  function handleExport() {
    if (!rekap) return
    const out: Record<string, string | number>[] = []
    for (const j of JENIS_BM) {
      const rec: Record<string, string | number> = { 'Jenis': `${j.grup} — ${j.uraian}` }
      BULAN_SINGKAT.forEach((b, i) => { rec[b] = rekap.perJenis[j.grup][i] })
      rec['Total'] = rekap.totalJenis[j.grup]
      out.push(rec)
    }
    const totalRec: Record<string, string | number> = { 'Jenis': 'TOTAL' }
    BULAN_SINGKAT.forEach((b, i) => { totalRec[b] = rekap.totalBulan[i] })
    totalRec['Total'] = rekap.totalKeseluruhan
    out.push(totalRec)
    exportToExcel(out, `LRA_Belanja_Modal_${tahun}`, 'LRA Belanja Modal')
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">LRA — Realisasi Belanja Modal</h1>
        <p className="text-gray-500 text-sm mt-1">
          Import realisasi belanja (LRA) dari akuntansi sebagai bahan rekonsiliasi belanja modal. Fase A: Box LRA per jenis aset.
        </p>
      </div>

      {msg && (
        <div className={`mb-4 p-3 rounded-lg text-sm ${msg.startsWith('Error') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>{msg}</div>
      )}

      <div className="card p-5 mb-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-800">Filter data</h2>
          <button className="btn-primary" onClick={() => setShowImport(true)}>+ Import Excel LRA</button>
        </div>
        <div className="space-y-3 max-w-3xl">
          <div className="flex items-center gap-3">
            <label className="w-40 text-sm text-gray-600 text-right flex-shrink-0">SKPD / Lokasi :</label>
            <SkpdCombobox lockToOperator onChangeSelection={setOrg} allowClear placeholder="Semua — atau ketik SKPD / Sub OPD / Lokasi..." />
          </div>
          <div className="flex items-center gap-3">
            <label className="w-40 text-sm text-gray-600 text-right flex-shrink-0">Tahun :</label>
            <select className="select-filter w-28" value={tahun} onChange={e => setTahun(e.target.value)}>
              {['2025', '2026', '2027'].map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-3">
            <span className="w-40 flex-shrink-0" />
            <button className="btn-primary" onClick={proses} disabled={loading}>{loading ? 'Memproses...' : 'Proses'}</button>
            {rekap && <button className="btn-secondary" onClick={handleExport}>Export Excel</button>}
          </div>
        </div>
      </div>

      {rows === null ? (
        <div className="card p-12 text-center text-gray-400 text-sm">
          Atur filter lalu klik <span className="font-medium text-gray-600">Proses</span>. Belum ada data? Klik <span className="font-medium text-gray-600">Import Excel LRA</span> dulu.
        </div>
      ) : loading ? (
        <div className="card p-12 text-center text-gray-400 text-sm">Memproses...</div>
      ) : rows.length === 0 ? (
        <div className="card p-12 text-center text-gray-400 text-sm">Belum ada data LRA untuk tahun {tahun} pada lingkup ini. Import dulu.</div>
      ) : (
        <div className="space-y-3">
          <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-2 text-xs text-amber-800">
            <span className="font-medium">Fase A</span> — Box LRA (belanja modal 5.2). {nBukti} No. Bukti · {rows.length} baris ·
            {' '}<b>{nBarjas}</b> baris belanja barjas (5.1) tersimpan sebagai kandidat Kapitalisasi (Fase B). Kapitalisasi/Reklas &amp; kolom Check menyusul.
          </div>

          <div className="card overflow-hidden">
            <div className="px-4 py-2.5 border-b border-gray-100 bg-gray-50/60">
              <p className="text-sm font-semibold text-gray-800">LRA — Belanja Modal per Jenis Aset ({tahun})</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="table-th text-left sticky left-0 bg-gray-50">Jenis</th>
                    {BULAN_SINGKAT.map(b => <th key={b} className="table-th text-right">{b}</th>)}
                    <th className="table-th text-right border-l border-gray-100">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {JENIS_BM.map(j => (
                    <tr key={j.grup}>
                      <td className="table-td sticky left-0 bg-white whitespace-nowrap"><span className="text-gray-400">{j.grup}</span> {j.uraian}</td>
                      {rekap!.perJenis[j.grup].map((v, i) => (
                        <td key={i} className="table-td text-right tabular-nums">{v ? angka(v) : <span className="text-gray-300">–</span>}</td>
                      ))}
                      <td className="table-td text-right tabular-nums font-medium border-l border-gray-100">{angka(rekap!.totalJenis[j.grup])}</td>
                    </tr>
                  ))}
                  <tr className="bg-gray-50 font-semibold text-gray-900">
                    <td className="table-td sticky left-0 bg-gray-50">TOTAL</td>
                    {rekap!.totalBulan.map((v, i) => <td key={i} className="table-td text-right tabular-nums">{v ? angka(v) : <span className="text-gray-300">–</span>}</td>)}
                    <td className="table-td text-right tabular-nums border-l border-gray-100">{angka(rekap!.totalKeseluruhan)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {showImport && (
        <LraImport
          onClose={() => setShowImport(false)}
          onDone={(m) => { setShowImport(false); setMsg(m); proses() }}
        />
      )}
    </div>
  )
}
