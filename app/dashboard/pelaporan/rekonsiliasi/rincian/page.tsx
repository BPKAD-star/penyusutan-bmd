'use client'
// Rincian Transaksi Rekonsiliasi (Bukti Dukung) — daftar SEMUA transaksi AKTIF
// yang memengaruhi Rekonsiliasi BMD pada satu periode. Sumber = fetchMutasiLines
// (SAMA dgn agregat Rekonsiliasi), jadi rincian ini pasti menjumlah ke angka
// mutasi. Se-pemda (SKPD kosong) atau per SKPD. Deliverable utama = Export Excel.
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { exportToExcel } from '@/lib/export'
import { GOLONGAN_REKAP } from '@/lib/bmd'
import SkpdCombobox, { type SkpdSelection as OrgSelection } from '@/components/SkpdCombobox'
import { tahunAwal } from '@/lib/tahunKerja'
import { fetchMutasiLines, KATEGORI_LABEL, type MutasiLine } from '@/lib/rekon'

const angka = (v: number) => new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(v || 0)
const PREVIEW_MAX = 1000
const golUraian = (kode: string) => GOLONGAN_REKAP.find(g => g.kode === kode)?.uraian || kode
const golIdx = (kode: string) => { const i = GOLONGAN_REKAP.findIndex(g => g.kode === kode); return i < 0 ? 99 : i }

export default function RincianRekonsiliasiPage() {
  const supabase = createClient()
  const [org, setOrg] = useState<OrgSelection>({ skpdId: null, descendantIds: null })
  const [tahun, setTahun] = useState(() => tahunAwal('2026'))
  const [smt, setSmt] = useState('1')
  const [applied, setApplied] = useState<string | null>(null)
  const [lines, setLines] = useState<MutasiLine[]>([])
  const [skpdMap, setSkpdMap] = useState<Record<number, string>>({})
  const [loading, setLoading] = useState(false)

  async function proses() {
    setLoading(true)
    const periode = `${tahun}-S${smt}`
    // map SKPD id→nama (murah) + daftar rinci
    const [rows] = await Promise.all([
      fetchMutasiLines(supabase, periode, org.descendantIds ?? null),
      (async () => {
        const map: Record<number, string> = {}
        for (let from = 0; ; from += 1000) {
          const { data } = await supabase.from('admin_skpd').select('id,nama').range(from, from + 999)
          if (!data || data.length === 0) break
          for (const s of data as { id: number; nama: string }[]) map[s.id] = s.nama
          if (data.length < 1000) break
        }
        setSkpdMap(map)
      })(),
    ])
    // urut: golongan (urutan KIB) → arah (tambah dulu) → kategori
    rows.sort((a, b) => golIdx(a.golongan) - golIdx(b.golongan)
      || (a.arah === b.arah ? 0 : a.arah === 'tambah' ? -1 : 1)
      || a.kategori.localeCompare(b.kategori))
    setLines(rows)
    setApplied(periode)
    setLoading(false)
  }

  const tot = lines.reduce((a, l) => { if (l.arah === 'tambah') a.tambah += l.nilai; else a.kurang += l.nilai; return a }, { tambah: 0, kurang: 0 })

  function baris(l: MutasiLine): Record<string, string | number> {
    return {
      'Periode': applied || '', 'Arah': l.arah === 'tambah' ? 'Penambahan' : 'Pengurangan',
      'Kategori': KATEGORI_LABEL[l.kategori], 'Jenis Ledger': l.jenis, 'Tanggal': l.tanggal,
      'No Dokumen/SK': l.no_dokumen || '', 'SKPD': (l.skpd_id != null && skpdMap[l.skpd_id]) || '',
      'Golongan': `${l.golongan} — ${golUraian(l.golongan)}`, 'Kode Barang': l.kode, 'NIBAR': l.nibar || '',
      'Nama Barang': l.nama || '', 'Komptabel': l.komp === 'intra' ? 'Intra' : 'Ekstra', 'Nilai': l.nilai,
    }
  }

  function handleExport() {
    if (!applied) return
    exportToExcel(lines.map(baris), `Rincian_Rekonsiliasi_${applied}`, 'Rincian Rekonsiliasi')
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Rincian Transaksi Rekonsiliasi</h1>
        <p className="text-gray-500 text-sm mt-1">
          Bukti dukung — semua transaksi aktif yang memengaruhi Rekonsiliasi BMD pada periode terpilih. Se-pemda (SKPD kosong) atau per SKPD.
        </p>
      </div>

      <div className="card p-5 mb-4">
        <h2 className="text-base font-semibold text-gray-800 mb-4">Filter data</h2>
        <div className="space-y-3 max-w-3xl">
          <div className="flex items-center gap-3">
            <label className="w-40 text-sm text-gray-600 text-right flex-shrink-0">SKPD / Lokasi :</label>
            <SkpdCombobox lockToOperator onChangeSelection={setOrg} allowClear placeholder="Kosongkan = se-pemda; atau ketik SKPD / Sub OPD..." />
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
            <span className="w-40 flex-shrink-0" />
            <button className="btn-primary" onClick={proses} disabled={loading}>{loading ? 'Memproses...' : 'Proses'}</button>
            {applied && lines.length > 0 && <button className="btn-secondary" onClick={handleExport}>Export Excel</button>}
          </div>
        </div>
      </div>

      {applied === null ? (
        <div className="card p-12 text-center text-gray-400 text-sm">
          Atur filter lalu klik <span className="font-medium text-gray-600">Proses</span>.
        </div>
      ) : loading ? (
        <div className="card p-12 text-center text-gray-400 text-sm">Memproses...</div>
      ) : lines.length === 0 ? (
        <div className="card p-12 text-center text-gray-400 text-sm">Tidak ada transaksi yang memengaruhi Rekonsiliasi pada periode ini.</div>
      ) : (
        <div className="card overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-gray-100 text-sm text-gray-600">
            <span>
              <span className="font-semibold text-gray-900">{lines.length.toLocaleString('id-ID')}</span> transaksi · periode {applied}
              <span className="text-gray-300 mx-2">·</span>
              Penambahan <span className="font-semibold text-teal">{angka(tot.tambah)}</span>
              <span className="text-gray-300 mx-2">·</span>
              Pengurangan <span className="font-semibold text-rose-600">{angka(tot.kurang)}</span>
            </span>
            {lines.length > PREVIEW_MAX && <span className="text-xs text-amber-700">Tampil {PREVIEW_MAX.toLocaleString('id-ID')} pertama — Export utk semua.</span>}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  {['Arah', 'Kategori', 'Jenis', 'Tanggal', 'No Dok/SK', 'SKPD', 'Golongan', 'Kode', 'NIBAR', 'Nama Barang', 'Komptabel', 'Nilai'].map(h => (
                    <th key={h} className={`table-th whitespace-nowrap ${h === 'Nilai' ? 'text-right' : 'text-left'}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {lines.slice(0, PREVIEW_MAX).map((l, i) => (
                  <tr key={i} className="hover:bg-gray-50/60 align-top">
                    <td className={`table-td text-xs whitespace-nowrap ${l.arah === 'tambah' ? 'text-teal' : 'text-rose-600'}`}>{l.arah === 'tambah' ? 'Tambah' : 'Kurang'}</td>
                    <td className="table-td text-xs text-gray-700 max-w-[220px]">{KATEGORI_LABEL[l.kategori]}</td>
                    <td className="table-td text-xs text-gray-500 whitespace-nowrap">{l.jenis}</td>
                    <td className="table-td text-xs text-gray-600 whitespace-nowrap">{l.tanggal}</td>
                    <td className="table-td text-xs text-gray-600 whitespace-nowrap">{l.no_dokumen || '-'}</td>
                    <td className="table-td text-xs text-gray-600 min-w-[140px] max-w-[220px]">{(l.skpd_id != null && skpdMap[l.skpd_id]) || '-'}</td>
                    <td className="table-td text-xs text-gray-600 whitespace-nowrap">{l.golongan}</td>
                    <td className="table-td text-xs text-gray-600 whitespace-nowrap">{l.kode}</td>
                    <td className="table-td text-xs text-gray-500 font-mono whitespace-nowrap max-w-[150px] truncate" title={l.nibar || ''}>{l.nibar || '-'}</td>
                    <td className="table-td text-xs text-gray-800 min-w-[160px] max-w-[260px]">{l.nama || '-'}</td>
                    <td className="table-td text-xs text-gray-600 text-center whitespace-nowrap capitalize">{l.komp}</td>
                    <td className="table-td text-right text-xs tabular-nums whitespace-nowrap">{angka(l.nilai)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
