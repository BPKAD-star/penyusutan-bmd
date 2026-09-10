'use client'
// Rekap Model 2: matriks per SKPD (baris) × per jenis/golongan BMD (kolom).
// Metrik yang ditampilkan bisa dipilih: perolehan / akumulasi / beban / nilai buku,
// atau 'semua' (4 metrik per jenis). Presentational: rows sudah teragregasi.
//
// ⚠️ BERJENJANG sejak 2026-09-10 (keputusan user) — bukan lagi daftar datar.
// Baris bisa punya `anak` (sub-OPD/sub-sub-OPD di bawahnya), dibuka/tutup
// lewat ikon panah. `cells` tiap baris KUMULATIF (dirinya + seluruh
// turunannya) — lihat lib/rekapPohon.ts utk penjelasan & yang menyusunnya.
import { useState } from 'react'
import { formatRupiah2 } from '@/lib/export'
import type { RekapRow } from '@/components/RekapTable'

export type Metric = 'perolehan' | 'akumulasi' | 'beban' | 'nilaiBuku'
export type MetricOrAll = Metric | 'semua'

export type MatrixCell = { perolehan: number; akumulasi: number; beban: number; nilaiBuku: number }
export type MatrixRow = {
  skpdId: number
  skpdNama: string
  cells: Record<string, MatrixCell> // key = kode golongan (level-3)
  /** Sub-OPD/sub-sub-OPD di bawahnya, kalau ada. `cells` di atas SUDAH
   *  memuat jumlah seluruh anak ini — lihat catatan kumulatif di kepala berkas. */
  anak?: MatrixRow[]
}

// Golongan = kolom. Reuse tipe uraian/disusutkan dari GOLONGAN_REKAP.
export type Golongan = Pick<RekapRow, 'kode' | 'uraian' | 'disusutkan'>

export const METRIC_LABEL: Record<Metric, string> = {
  perolehan: 'Harga Perolehan',
  akumulasi: 'Akumulasi Penyusutan',
  beban: 'Beban Penyusutan',
  nilaiBuku: 'Nilai Buku',
}
const SUB_METRICS: Metric[] = ['perolehan', 'akumulasi', 'beban', 'nilaiBuku']

// Metrik penyusutan (akumulasi/beban) tak berlaku utk golongan tak disusutkan.
function applicable(metric: Metric, g: Golongan): boolean {
  if (metric === 'akumulasi' || metric === 'beban') return g.disusutkan
  return true
}

export default function RekapMatrixTable({ rows, golongan, metric, loading }: {
  /** Baris TERATAS saja (akar pohon) — anaknya nempel lewat `row.anak`. */
  rows: MatrixRow[]
  golongan: Golongan[]
  metric: MetricOrAll
  loading: boolean
}) {
  // Anak-anak yg sedang dibuka. State-nya di SINI (bukan per baris) supaya
  // tetap kepake tanpa reset waktu `rows` diganti (mis. filter metrik ganti).
  const [terbuka, setTerbuka] = useState<Set<number>>(new Set())
  function toggle(id: number) {
    setTerbuka(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const dash = <span className="text-gray-300">-</span>
  const emptyCell: MatrixCell = { perolehan: 0, akumulasi: 0, beban: 0, nilaiBuku: 0 }

  // ⚠️ Total per kolom (footer) HANYA dari `rows` (baris TERATAS) — cells
  // anak sudah ikut terhitung di cells induknya (kumulatif), jadi menjumlah
  // baris yang sedang kelihatan TERMASUK yang di-expand akan dobel-hitung.
  const totals: Record<string, MatrixCell> = {}
  for (const g of golongan) totals[g.kode] = { ...emptyCell }
  for (const r of rows) {
    for (const g of golongan) {
      const c = r.cells[g.kode]
      if (!c) continue
      totals[g.kode].perolehan += c.perolehan
      totals[g.kode].akumulasi += c.akumulasi
      totals[g.kode].beban += c.beban
      totals[g.kode].nilaiBuku += c.nilaiBuku
    }
  }

  const cellVal = (c: MatrixCell, m: Metric, g: Golongan) =>
    applicable(m, g) ? formatRupiah2(c[m]) : dash

  const rowTotal = (r: MatrixRow, m: Metric) =>
    golongan.reduce((a, g) => a + (applicable(m, g) ? (r.cells[g.kode]?.[m] || 0) : 0), 0)
  const colGrand = (m: Metric) =>
    golongan.reduce((a, g) => a + (applicable(m, g) ? totals[g.kode][m] : 0), 0)

  const showAll = metric === 'semua'
  const colCount = 1 + golongan.length * (showAll ? SUB_METRICS.length : 1) + (showAll ? 0 : 1)

  // Ratakan pohon jadi baris TAMPIL (induk, lalu anak yang sedang terbuka,
  // rekursif) — TANPA menyentuh `rows`/`totals` di atas, biar total tetap benar
  // apa pun yang sedang di-expand.
  function baseBaris(list: MatrixRow[], depth: number): { r: MatrixRow; depth: number }[] {
    const out: { r: MatrixRow; depth: number }[] = []
    for (const r of list) {
      out.push({ r, depth })
      if (r.anak && r.anak.length > 0 && terbuka.has(r.skpdId)) {
        out.push(...baseBaris(r.anak, depth + 1))
      }
    }
    return out
  }
  const baris = baseBaris(rows, 0)

  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-100">
            {showAll ? (
              <>
                <tr>
                  <th className="table-th sticky left-0 bg-gray-50 z-10" rowSpan={2}>SKPD</th>
                  {golongan.map(g => (
                    <th key={g.kode} className="table-th text-center border-l border-gray-200" colSpan={SUB_METRICS.length}>
                      {g.uraian}
                    </th>
                  ))}
                </tr>
                <tr>
                  {golongan.map(g =>
                    SUB_METRICS.map((m, i) => (
                      <th key={g.kode + m} className={`table-th text-right whitespace-nowrap ${i === 0 ? 'border-l border-gray-200' : ''}`}>
                        {METRIC_LABEL[m]}
                      </th>
                    ))
                  )}
                </tr>
              </>
            ) : (
              <tr>
                <th className="table-th sticky left-0 bg-gray-50 z-10">SKPD</th>
                {golongan.map(g => (
                  <th key={g.kode} className="table-th text-right whitespace-nowrap">{g.uraian}</th>
                ))}
                <th className="table-th text-right">Total</th>
              </tr>
            )}
          </thead>

          <tbody className="divide-y divide-gray-50">
            {loading ? (
              <tr><td colSpan={colCount} className="table-td text-center py-12 text-gray-400">Memuat data...</td></tr>
            ) : baris.length === 0 ? (
              <tr><td colSpan={colCount} className="table-td text-center py-12 text-gray-400">Tidak ada data.</td></tr>
            ) : baris.map(({ r, depth }) => {
              const adaAnak = (r.anak?.length ?? 0) > 0
              return (
                <tr key={r.skpdId}>
                  <td className="table-td text-xs font-medium sticky left-0 bg-white z-10">
                    <span className="inline-flex items-center gap-1" style={{ paddingLeft: `${depth * 16}px` }}>
                      {adaAnak ? (
                        <button type="button" onClick={() => toggle(r.skpdId)}
                          className="w-4 h-4 flex-shrink-0 flex items-center justify-center text-gray-400 hover:text-teal transition-colors"
                          aria-label={terbuka.has(r.skpdId) ? `Tutup ${r.skpdNama}` : `Buka ${r.skpdNama}`}
                          aria-expanded={terbuka.has(r.skpdId)}>
                          {terbuka.has(r.skpdId) ? '▾' : '▸'}
                        </button>
                      ) : (
                        <span className="w-4 flex-shrink-0" aria-hidden="true" />
                      )}
                      <span>{r.skpdNama}</span>
                    </span>
                  </td>
                  {showAll
                    ? golongan.map(g => {
                        const c = r.cells[g.kode] || emptyCell
                        return SUB_METRICS.map((m, i) => (
                          <td key={g.kode + m} className={`table-td text-right text-xs ${i === 0 ? 'border-l border-gray-100' : ''}`}>
                            {cellVal(c, m, g)}
                          </td>
                        ))
                      })
                    : golongan.map(g => (
                        <td key={g.kode} className="table-td text-right text-xs">
                          {cellVal(r.cells[g.kode] || emptyCell, metric, g)}
                        </td>
                      ))}
                  {!showAll && (
                    <td className="table-td text-right text-xs font-semibold">{formatRupiah2(rowTotal(r, metric))}</td>
                  )}
                </tr>
              )
            })}
          </tbody>

          {!loading && rows.length > 0 && (
            <tfoot className="bg-gray-100 border-t-2 border-gray-200">
              <tr>
                <td className="table-td text-xs font-bold sticky left-0 bg-gray-100 z-10">TOTAL</td>
                {showAll
                  ? golongan.map(g =>
                      SUB_METRICS.map((m, i) => (
                        <td key={g.kode + m} className={`table-td text-right text-xs font-bold ${i === 0 ? 'border-l border-gray-200' : ''}`}>
                          {applicable(m, g) ? formatRupiah2(totals[g.kode][m]) : dash}
                        </td>
                      ))
                    )
                  : golongan.map(g => (
                      <td key={g.kode} className="table-td text-right text-xs font-bold">
                        {applicable(metric, g) ? formatRupiah2(totals[g.kode][metric]) : dash}
                      </td>
                    ))}
                {!showAll && (
                  <td className="table-td text-right text-xs font-bold text-teal">{formatRupiah2(colGrand(metric))}</td>
                )}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  )
}
