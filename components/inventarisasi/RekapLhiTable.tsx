'use client'
// Tabel Rekap per SKPD LHI: baris SKPD × kolom III.B.1–III.B.12, sel = jumlah
// barang. SKPD yang punya anak punya panah buka/tutup (permintaan user
// 2026-10-01). Presentasional — angka sudah dihitung lib/rekapLhi.ts.
//
// ⚠️ Footer TOTAL hanya dari baris TERATAS: angka induk sudah kumulatif, jadi
// menjumlah anak yang sedang terbuka menghitungnya dua kali.
import { useState } from 'react'
import { LHI_URUT, type LhiKode } from '@/lib/inventarisasi'
import { totalRekapLhi, type NodeLhi } from '@/lib/rekapLhi'

/** Judul kolom ringkas — uraian resmi (LHI_LABEL) terlalu panjang untuk 12 kolom. */
export const JUDUL_KOLOM_LHI: Record<LhiKode, string> = {
  'III.B.1': 'Hilang',
  'III.B.2': 'Tidak Ditemukan',
  'III.B.3': 'Belum Dikapitalisasi (Induk Diketahui)',
  'III.B.4': 'Belum Dikapitalisasi (Induk Tidak Diketahui)',
  'III.B.5': 'Digunakan Pegawai Pemda',
  'III.B.6': 'Digunakan Pihak Lain',
  'III.B.7': 'Perubahan Kondisi',
  'III.B.8': 'Perubahan Data',
  'III.B.9': 'Tercatat Ganda',
  'III.B.10': 'Berdiri di Tanah Bukan Milik Pemda',
  'III.B.11': 'Belum Tercatat',
  'III.B.12': 'Perubahan Kodefikasi',
}

export default function RekapLhiTable({ rows, loading }: { rows: NodeLhi[]; loading: boolean }) {
  const [terbuka, setTerbuka] = useState<Set<number>>(new Set())
  const toggle = (id: number) => setTerbuka(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })

  // Ratakan HANYA untuk tampil; `rows` & total tak disentuh.
  function baris(list: NodeLhi[], depth: number): { r: NodeLhi; depth: number }[] {
    const out: { r: NodeLhi; depth: number }[] = []
    for (const r of list) {
      out.push({ r, depth })
      if (r.anak && terbuka.has(r.skpdId)) out.push(...baris(r.anak, depth + 1))
    }
    return out
  }
  const tampil = baris(rows, 0)
  const total = totalRekapLhi(rows)
  const nKolom = LHI_URUT.length + 2

  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="table-th sticky left-0 bg-gray-50 z-10 min-w-[220px]" rowSpan={2}>SKPD</th>
              <th className="table-th text-center border-l border-gray-200" colSpan={LHI_URUT.length}>Jumlah Barang</th>
              <th className="table-th text-right border-l border-gray-200" rowSpan={2}>Barang Ada Temuan</th>
            </tr>
            <tr>
              {LHI_URUT.map(k => (
                <th key={k} className="table-th text-center align-bottom border-l border-gray-100 min-w-[88px]">
                  <span className="block text-[10px] font-semibold text-gray-500">{k}</span>
                  <span className="block text-[11px] font-normal leading-tight">{JUDUL_KOLOM_LHI[k]}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {loading ? (
              <tr><td colSpan={nKolom} className="table-td text-center py-12 text-gray-400">Memuat data...</td></tr>
            ) : tampil.length === 0 ? (
              <tr><td colSpan={nKolom} className="table-td text-center py-12 text-gray-400">
                Belum ada isian inventarisasi yang divalidasi dan memiliki temuan.
              </td></tr>
            ) : tampil.map(({ r, depth }) => {
              const adaAnak = (r.anak?.length ?? 0) > 0
              return (
                <tr key={r.skpdId}>
                  <td className="table-td text-xs font-medium sticky left-0 bg-white z-10">
                    <span className="inline-flex items-center gap-1" style={{ paddingLeft: `${depth * 16}px` }}>
                      {adaAnak ? (
                        <button type="button" onClick={() => toggle(r.skpdId)}
                          className="w-5 h-5 flex-shrink-0 flex items-center justify-center text-sm text-gray-400 hover:text-teal transition-colors"
                          aria-label={terbuka.has(r.skpdId) ? `Tutup ${r.skpdNama}` : `Buka ${r.skpdNama}`}
                          aria-expanded={terbuka.has(r.skpdId)}>
                          {terbuka.has(r.skpdId) ? '▾' : '▸'}
                        </button>
                      ) : <span className="w-5 flex-shrink-0" aria-hidden="true" />}
                      <span>{r.skpdNama}</span>
                    </span>
                  </td>
                  {LHI_URUT.map(k => (
                    <td key={k} className="table-td text-center text-xs border-l border-gray-50">
                      {r.hitung[k] > 0 ? r.hitung[k].toLocaleString('id-ID') : <span className="text-gray-300">-</span>}
                    </td>
                  ))}
                  <td className="table-td text-right text-xs font-semibold border-l border-gray-100">
                    {r.barang.toLocaleString('id-ID')}
                  </td>
                </tr>
              )
            })}
          </tbody>
          {!loading && rows.length > 0 && (
            <tfoot className="bg-gray-100 border-t-2 border-gray-200">
              <tr>
                <td className="table-td text-xs font-bold sticky left-0 bg-gray-100 z-10">TOTAL</td>
                {LHI_URUT.map(k => (
                  <td key={k} className="table-td text-center text-xs font-bold border-l border-gray-200">
                    {total.hitung[k].toLocaleString('id-ID')}
                  </td>
                ))}
                <td className="table-td text-right text-xs font-bold text-teal border-l border-gray-200">
                  {total.barang.toLocaleString('id-ID')}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  )
}
