'use client'
// Rekap Tindak Lanjut per SKPD INDUK — Fase 3, untuk Pengelola Barang (admin)
// & auditor. Diturunkan dari baris yang SAMA dgn tab Daftar (tak ada query
// kedua), jadi angkanya mustahil berbeda dari daftar dgn filter yang sama.
// Diurut % selesai menaik: SKPD yang paling tertinggal tampil paling atas.
import { useMemo } from 'react'
import { exportToExcel } from '@/lib/export'
import { namaBerkasLaporan } from '@/lib/namaBerkas'
import { rekapTindakLanjut, STATUS_TL_LABEL } from '@/lib/tindakLanjut'
import type { TemuanTLMuat } from '@/lib/tindakLanjutData'
import type { SkpdNode } from '@/components/useSkpdTree'

export default function RekapTindakLanjut({ temuan, byId, rootOf, tahun }: {
  temuan: TemuanTLMuat[]
  byId: Map<number, SkpdNode>
  rootOf: (id: number) => number
  tahun: number
}) {
  const rekap = useMemo(() => rekapTindakLanjut(temuan, rootOf), [temuan, rootOf])
  const nama = (id: number) => byId.get(id)?.nama || `SKPD #${id}`
  const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0)
  const total = rekap.reduce((a, r) => ({
    temuan: a.temuan + r.temuan, belum: a.belum + r.belum, proses: a.proses + r.proses,
    selesai: a.selesai + r.selesai, manual: a.manual + r.manual,
  }), { temuan: 0, belum: 0, proses: 0, selesai: 0, manual: 0 })

  function exportExcel() {
    exportToExcel(rekap.map(r => ({
      'SKPD': nama(r.kunci), 'Temuan': r.temuan,
      [STATUS_TL_LABEL.belum]: r.belum, [STATUS_TL_LABEL.proses]: r.proses,
      [STATUS_TL_LABEL.selesai]: r.selesai, [STATUS_TL_LABEL.manual]: r.manual,
      '% Selesai': pct(r.selesai, r.temuan),
    })), namaBerkasLaporan({ laporan: 'Rekap Tindak Lanjut Inventarisasi', periode: tahun, skpd: null }), 'Rekap')
  }

  if (rekap.length === 0) return <p className="py-8 text-center text-sm text-gray-400">Belum ada temuan untuk direkap.</p>

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-gray-500">
          Per SKPD induk (temuan unit di bawahnya ikut dijumlahkan). Mengikuti filter Tahun, SKPD &amp; Format di atas;
          satu temuan = satu barang × satu format LHI.
        </p>
        <button onClick={exportExcel} className="btn-secondary text-sm">Export Excel</button>
      </div>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-gray-500 border-b border-gray-200">
            <th className="py-2 pr-3 font-medium">SKPD</th>
            <th className="py-2 pr-3 font-medium text-right">Temuan</th>
            <th className="py-2 pr-3 font-medium text-right">{STATUS_TL_LABEL.belum}</th>
            <th className="py-2 pr-3 font-medium text-right">{STATUS_TL_LABEL.proses}</th>
            <th className="py-2 pr-3 font-medium text-right">{STATUS_TL_LABEL.selesai}</th>
            <th className="py-2 pr-3 font-medium text-right">{STATUS_TL_LABEL.manual}</th>
            <th className="py-2 font-medium w-40">% Selesai</th>
          </tr>
        </thead>
        <tbody>
          {rekap.map(r => (
            <tr key={r.kunci} className="border-b border-gray-100">
              <td className="py-2 pr-3 text-gray-800">{nama(r.kunci)}</td>
              <td className="py-2 pr-3 text-right">{r.temuan}</td>
              <td className="py-2 pr-3 text-right text-red-700">{r.belum || '–'}</td>
              <td className="py-2 pr-3 text-right text-amber-700">{r.proses || '–'}</td>
              <td className="py-2 pr-3 text-right text-teal">{r.selesai || '–'}</td>
              <td className="py-2 pr-3 text-right text-gray-500">{r.manual || '–'}</td>
              <td className="py-2">
                <div className="flex items-center gap-2">
                  <div className="h-2 flex-1 rounded bg-gray-100 overflow-hidden">
                    <div className="h-full bg-teal" style={{ width: `${pct(r.selesai, r.temuan)}%` }} />
                  </div>
                  <span className="w-9 text-right tabular-nums">{pct(r.selesai, r.temuan)}%</span>
                </div>
              </td>
            </tr>
          ))}
          <tr className="font-semibold border-t border-gray-300">
            <td className="py-2 pr-3">TOTAL</td>
            <td className="py-2 pr-3 text-right">{total.temuan}</td>
            <td className="py-2 pr-3 text-right">{total.belum}</td>
            <td className="py-2 pr-3 text-right">{total.proses}</td>
            <td className="py-2 pr-3 text-right">{total.selesai}</td>
            <td className="py-2 pr-3 text-right">{total.manual}</td>
            <td className="py-2 text-right pr-0">{pct(total.selesai, total.temuan)}%</td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}
