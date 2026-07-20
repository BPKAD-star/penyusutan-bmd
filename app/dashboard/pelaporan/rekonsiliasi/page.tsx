'use client'
// Rekonsiliasi BMD — Berita Acara Rekonsiliasi (laporan mutasi). Per SKPD, per
// semester, per golongan; Saldo Awal + Penambahan − Pengurangan = Saldo Akhir,
// 4 ukuran (Perolehan/Beban/Akumulasi/Nilai Buku) × Intra/Ekstra. Angka
// PERIOD-CORRECT (fn rekon.ts: penyusutan_semester per-periode + replay
// visibilitas/kepemilikan) — identik dgn halaman Penyusutan, jadi bisa tie-out.
// Lihat docs/rekonsiliasi-bmd-plan.md.
//
// FASE 1 (ini): baru Saldo Awal & Saldo Akhir tiap semester (fondasi snapshot).
// Baris Penambahan/Pengurangan (dekomposisi mutasi) menyusul Fase 2–3.
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { exportToExcel } from '@/lib/export'
import { GOLONGAN_REKAP } from '@/lib/bmd'
import SkpdCombobox, { type SkpdSelection as OrgSelection } from '@/components/SkpdCombobox'
import TahunTerkunciNote from '@/components/TahunTerkunciNote'
import { tahunAwal } from '@/lib/tahunKerja'
import { fetchSnapshot, measuresOf, type Snapshot, type Measures, type Komptabel } from '@/lib/rekon'

const angka = (v: number) => new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(v || 0)
const KOMPS: Komptabel[] = ['intra', 'ekstra']
const UKURAN: { key: keyof Measures; label: string }[] = [
  { key: 'perolehan', label: 'Nilai Perolehan' },
  { key: 'beban', label: 'Beban' },
  { key: 'akumulasi', label: 'Akumulasi' },
  { key: 'nilaiBuku', label: 'Nilai Buku' },
]

type BarisSnap = { label: string; snap: Snapshot | undefined }

export default function RekonsiliasiPage() {
  const supabase = createClient()
  const [org, setOrg] = useState<OrgSelection>({ skpdId: null, descendantIds: null })
  const [tahun, setTahun] = useState(() => tahunAwal('2026'))
  const [applied, setApplied] = useState<string | null>(null) // tahun yang sudah diproses
  // snapshot per periode kunci (S2 thn lalu, S1, S2)
  const [snaps, setSnaps] = useState<Record<string, Snapshot>>({})
  const [loading, setLoading] = useState(false)

  // Periode render mengikuti tahun yang SUDAH diproses (applied) supaya cocok
  // dgn key di `snaps` walau pemilih tahun diubah sebelum Proses ulang.
  const renderYear = applied ?? tahun
  const pPrev = `${Number(renderYear) - 1}-S2` // = Saldo Awal S1
  const pS1 = `${renderYear}-S1`               // = Saldo Akhir S1 = Saldo Awal S2
  const pS2 = `${renderYear}-S2`               // = Saldo Akhir S2

  async function proses() {
    setLoading(true)
    const desc = org.descendantIds ?? null
    const prevK = `${Number(tahun) - 1}-S2`, s1K = `${tahun}-S1`, s2K = `${tahun}-S2`
    const [prev, s1, s2] = await Promise.all([
      fetchSnapshot(supabase, prevK, desc),
      fetchSnapshot(supabase, s1K, desc),
      fetchSnapshot(supabase, s2K, desc),
    ])
    setSnaps({ [prevK]: prev, [s1K]: s1, [s2K]: s2 })
    setApplied(tahun)
    setLoading(false)
  }

  // Baris per semester: Saldo Awal & Saldo Akhir (Fase 1).
  const barisFor = (sem: 1 | 2): BarisSnap[] => sem === 1
    ? [{ label: 'Saldo Awal (Smt I)', snap: snaps[pPrev] }, { label: 'Saldo Akhir (Smt I)', snap: snaps[pS1] }]
    : [{ label: 'Saldo Awal (Smt II)', snap: snaps[pS1] }, { label: 'Saldo Akhir (Smt II)', snap: snaps[pS2] }]

  function handleExport() {
    if (!applied) return
    const rows: Record<string, string | number>[] = []
    for (const g of GOLONGAN_REKAP) {
      for (const sem of [1, 2] as const) {
        for (const b of barisFor(sem)) {
          const row: Record<string, string | number> = { 'Jenis Aset': `${g.kode} — ${g.uraian}`, 'Semester': `Smt ${sem === 1 ? 'I' : 'II'}`, 'Baris': b.label }
          for (const k of KOMPS) {
            const m = measuresOf(b.snap, g.kode, k)
            for (const u of UKURAN) row[`${k === 'intra' ? 'Intra' : 'Ekstra'} — ${u.label}`] = m[u.key]
          }
          rows.push(row)
        }
      }
    }
    exportToExcel(rows, `Rekonsiliasi_BMD_${applied}`, 'Rekonsiliasi BMD')
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Rekonsiliasi BMD</h1>
        <p className="text-gray-500 text-sm mt-1">
          Berita Acara Rekonsiliasi — mutasi per jenis aset & semester. Angka period-correct (setara halaman Penyusutan).
        </p>
      </div>

      <div className="card p-5 mb-4">
        <h2 className="text-base font-semibold text-gray-800 mb-4">Filter data</h2>
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
            {applied && <button className="btn-secondary" onClick={handleExport}>Export Excel</button>}
          </div>
        </div>
      </div>

      <TahunTerkunciNote tahun={Number(tahun)} />

      {applied === null ? (
        <div className="card p-12 text-center text-gray-400 text-sm">
          Atur filter lalu klik <span className="font-medium text-gray-600">Proses</span>.
        </div>
      ) : loading ? (
        <div className="card p-12 text-center text-gray-400 text-sm">Memproses snapshot period-correct...</div>
      ) : (
        <div className="space-y-3">
          <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-2 text-xs text-amber-800">
            <span className="font-medium">Fase 1</span> — menampilkan Saldo Awal &amp; Saldo Akhir tiap semester
            (rantai: Saldo Akhir Smt I = Saldo Awal Smt II). Baris Penambahan/Pengurangan menyusul.
          </div>
          {GOLONGAN_REKAP.map(g => (
            <div key={g.kode} className="card overflow-hidden">
              <div className="px-4 py-2.5 border-b border-gray-100 bg-gray-50/60">
                <p className="text-sm font-semibold text-gray-800">{g.kode} — {g.uraian}</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      <th className="table-th text-left" rowSpan={2}>Baris</th>
                      {KOMPS.map(k => <th key={k} className="table-th text-center border-l border-gray-100" colSpan={4}>{k === 'intra' ? 'Intrakomptabel' : 'Ekstrakomptabel'}</th>)}
                    </tr>
                    <tr>
                      {KOMPS.map(k => UKURAN.map(u => <th key={`${k}-${u.key}`} className={`table-th text-right ${u.key === 'perolehan' ? 'border-l border-gray-100' : ''}`}>{u.label}</th>))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {([1, 2] as const).flatMap(sem => barisFor(sem).map(b => {
                      const saldo = b.label.startsWith('Saldo')
                      return (
                        <tr key={`${sem}-${b.label}`} className={saldo ? 'bg-gray-50/40 font-medium text-gray-800' : ''}>
                          <td className="table-td text-xs">{b.label}</td>
                          {KOMPS.map(k => {
                            const m = measuresOf(b.snap, g.kode, k)
                            return UKURAN.map(u => (
                              <td key={`${k}-${u.key}`} className={`table-td text-right text-xs tabular-nums ${u.key === 'perolehan' ? 'border-l border-gray-100' : ''}`}>
                                {angka(m[u.key])}
                              </td>
                            ))
                          })}
                        </tr>
                      )
                    }))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
