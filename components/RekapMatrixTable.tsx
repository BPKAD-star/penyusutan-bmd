'use client'
// Rekap Model 2: matriks per SKPD (baris) × per jenis/golongan BMD (kolom).
// Metrik yang ditampilkan bisa dipilih: perolehan / akumulasi / beban / nilai buku,
// atau 'semua' (4 metrik per jenis). Presentational: rows sudah teragregasi.
import { formatRupiah } from '@/lib/export'
import type { RekapRow } from '@/components/RekapTable'

export type Metric = 'perolehan' | 'akumulasi' | 'beban' | 'nilaiBuku'
export type MetricOrAll = Metric | 'semua'

export type MatrixCell = { perolehan: number; akumulasi: number; beban: number; nilaiBuku: number }
export type MatrixRow = {
  skpdId: number
  skpdNama: string
  cells: Record<string, MatrixCell> // key = kode golongan (level-3)
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
  rows: MatrixRow[]
  golongan: Golongan[]
  metric: MetricOrAll
  loading: boolean
}) {
  const dash = <span className="text-gray-300">-</span>
  const emptyCell: MatrixCell = { perolehan: 0, akumulasi: 0, beban: 0, nilaiBuku: 0 }

  // Total per kolom (footer)
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
    applicable(m, g) ? formatRupiah(c[m]) : dash

  const rowTotal = (r: MatrixRow, m: Metric) =>
    golongan.reduce((a, g) => a + (applicable(m, g) ? (r.cells[g.kode]?.[m] || 0) : 0), 0)
  const colGrand = (m: Metric) =>
    golongan.reduce((a, g) => a + (applicable(m, g) ? totals[g.kode][m] : 0), 0)

  const showAll = metric === 'semua'
  const colCount = 1 + golongan.length * (showAll ? SUB_METRICS.length : 1) + (showAll ? 0 : 1)

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
            ) : rows.length === 0 ? (
              <tr><td colSpan={colCount} className="table-td text-center py-12 text-gray-400">Tidak ada data.</td></tr>
            ) : rows.map(r => (
              <tr key={r.skpdId}>
                <td className="table-td text-xs font-medium sticky left-0 bg-white z-10">{r.skpdNama}</td>
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
                  <td className="table-td text-right text-xs font-semibold">{formatRupiah(rowTotal(r, metric))}</td>
                )}
              </tr>
            ))}
          </tbody>

          {!loading && rows.length > 0 && (
            <tfoot className="bg-gray-100 border-t-2 border-gray-200">
              <tr>
                <td className="table-td text-xs font-bold sticky left-0 bg-gray-100 z-10">TOTAL</td>
                {showAll
                  ? golongan.map(g =>
                      SUB_METRICS.map((m, i) => (
                        <td key={g.kode + m} className={`table-td text-right text-xs font-bold ${i === 0 ? 'border-l border-gray-200' : ''}`}>
                          {applicable(m, g) ? formatRupiah(totals[g.kode][m]) : dash}
                        </td>
                      ))
                    )
                  : golongan.map(g => (
                      <td key={g.kode} className="table-td text-right text-xs font-bold">
                        {applicable(metric, g) ? formatRupiah(totals[g.kode][metric]) : dash}
                      </td>
                    ))}
                {!showAll && (
                  <td className="table-td text-right text-xs font-bold text-teal">{formatRupiah(colGrand(metric))}</td>
                )}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  )
}
