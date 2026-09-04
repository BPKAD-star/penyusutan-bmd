'use client'
// Rincian (drill-down) sebuah sel matriks LRA — pola "pivot Excel": klik angka
// → lihat baris pembentuknya, dikelompokkan per SKPD + subtotal.
// Sumbernya baris LRA yang SUDAH ada di memori halaman (tak ada query baru).
import { useMemo, useState } from 'react'
import { formatRupiah, exportToExcel } from '@/lib/export'
import { namaBerkasLaporan } from '@/lib/namaBerkas'
import type { LraRow } from '@/lib/lra'

export default function LraDetailModal({ judul, periode, skpd, rows, skpdNama, onClose }: {
  judul: string
  /** Tahun & SKPD ikut ke NAMA BERKAS — pop-up ini tak punya filternya sendiri. */
  periode: string | number
  skpd?: string
  rows: LraRow[]
  skpdNama: Map<number, string>
  onClose: () => void
}) {
  const [q, setQ] = useState('')

  const term = q.trim().toLowerCase()
  const tampil = useMemo(() => rows.filter(r => !term ||
    r.uraian?.toLowerCase().includes(term) ||
    r.no_bukti?.toLowerCase().includes(term) ||
    r.keterangan?.toLowerCase().includes(term) ||
    r.kode_rekening.includes(term) ||
    (skpdNama.get(r.skpd_id) || '').toLowerCase().includes(term)
  ), [rows, term, skpdNama])

  // Kelompokkan per SKPD (urut nama), tiap grup urut tanggal.
  const grup = useMemo(() => {
    const m = new Map<number, LraRow[]>()
    for (const r of tampil) {
      const arr = m.get(r.skpd_id) || []; arr.push(r); m.set(r.skpd_id, arr)
    }
    return [...m.entries()]
      .map(([id, rs]) => ({
        id, nama: skpdNama.get(id) || `SKPD #${id}`,
        rows: [...rs].sort((a, b) => a.tanggal.localeCompare(b.tanggal)),
        total: rs.reduce((s, r) => s + r.debit, 0),
      }))
      .sort((a, b) => a.nama.localeCompare(b.nama))
  }, [tampil, skpdNama])

  const total = tampil.reduce((s, r) => s + r.debit, 0)

  function handleExport() {
    exportToExcel(tampil.map(r => ({
      SKPD: skpdNama.get(r.skpd_id) || r.skpd_id,
      Tanggal: r.tanggal,
      'Kode Rekening': r.kode_rekening,
      Uraian: r.uraian || '',
      'No. Bukti': r.no_bukti,
      Keterangan: r.keterangan || '',
      Debit: r.debit,
    })), namaBerkasLaporan({
      laporan: 'Rincian LRA', periode, skpd, akhiran: [judul],
    }), 'Rincian')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 overflow-y-auto">
      <div className="card w-full max-w-6xl my-8 bg-white">
        <div className="flex items-start justify-between px-5 py-3 border-b border-gray-100 gap-4">
          <div>
            <h2 className="text-base font-semibold text-gray-800">Rincian — {judul}</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {tampil.length} baris · {grup.length} SKPD · total <b>{formatRupiah(total)}</b>
            </p>
          </div>
          <button className="text-gray-400 hover:text-gray-600 text-xl leading-none flex-shrink-0" onClick={onClose}>×</button>
        </div>

        <div className="px-5 py-3 flex flex-wrap items-center gap-3 border-b border-gray-100">
          <input className="select-filter flex-1 min-w-[220px]" placeholder="Cari SKPD / uraian / no. bukti / kode..."
            value={q} onChange={e => setQ(e.target.value)} />
          <button className="btn-secondary" onClick={handleExport} disabled={tampil.length === 0}>Export Excel</button>
        </div>

        <div className="max-h-[65vh] overflow-auto">
          {grup.length === 0 ? (
            <div className="p-10 text-center text-gray-400 text-sm">Tidak ada baris.</div>
          ) : (
            <table className="text-xs" style={{ minWidth: '1400px', width: '100%' }}>
              <thead className="bg-gray-50 border-b border-gray-100 sticky top-0 z-10">
                <tr>
                  <th className="table-th text-left whitespace-nowrap">Tanggal</th>
                  <th className="table-th text-left whitespace-nowrap">Kode Rekening</th>
                  <th className="table-th text-left" style={{ minWidth: '260px' }}>Uraian</th>
                  <th className="table-th text-left" style={{ minWidth: '200px' }}>No. Bukti</th>
                  <th className="table-th text-left" style={{ minWidth: '280px' }}>Keterangan</th>
                  <th className="table-th text-right whitespace-nowrap">Debit</th>
                </tr>
              </thead>
              {grup.map(g => (
                  <tbody key={g.id} className="divide-y divide-gray-50">
                    <tr className="bg-teal/5">
                      <td className="table-td font-semibold text-gray-800 whitespace-nowrap" colSpan={5}>{g.nama}</td>
                      <td className="table-td text-right font-semibold tabular-nums text-gray-800 whitespace-nowrap">{formatRupiah(g.total)}</td>
                    </tr>
                    {g.rows.map(r => (
                      <tr key={r.id}>
                        <td className="table-td whitespace-nowrap">{r.tanggal}</td>
                        <td className="table-td whitespace-nowrap">{r.kode_rekening}</td>
                        <td className="table-td whitespace-nowrap">{r.uraian || '-'}</td>
                        <td className="table-td whitespace-nowrap">{r.no_bukti}</td>
                        <td className="table-td whitespace-nowrap">{r.keterangan || '-'}</td>
                        <td className="table-td text-right tabular-nums whitespace-nowrap">{formatRupiah(r.debit)}</td>
                      </tr>
                    ))}
                  </tbody>
              ))}
              <tfoot className="border-t-2 border-gray-200 bg-gray-50 sticky bottom-0">
                <tr>
                  <td className="table-td font-semibold text-gray-900 whitespace-nowrap" colSpan={5}>TOTAL</td>
                  <td className="table-td text-right font-semibold tabular-nums text-gray-900 whitespace-nowrap">{formatRupiah(total)}</td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>

        <div className="flex justify-end px-5 py-3 border-t border-gray-100">
          <button className="btn-secondary" onClick={onClose}>Tutup</button>
        </div>
      </div>
    </div>
  )
}
