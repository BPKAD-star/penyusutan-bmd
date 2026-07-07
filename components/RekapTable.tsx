'use client'
// Tabel rekapitulasi penyusutan per golongan (mirip e-SIMBADA "Saldo Awal/Akhir
// Penyusutan"). Presentational: menerima rows sudah teragregasi.
import { formatRupiah } from '@/lib/export'

export type RekapRow = {
  kode: string
  uraian: string
  disusutkan: boolean
  perolehan: number
  akumulasi: number
  beban: number
  nilaiBuku: number
}

export default function RekapTable({ rows, loading, labelAkumulasi, labelBeban }: {
  rows: RekapRow[]
  loading: boolean
  labelAkumulasi: string
  labelBeban: string
}) {
  const dash = (v: number, show: boolean) => (show ? formatRupiah(v) : <span className="text-gray-300">-</span>)
  const tot = rows.reduce((a, r) => ({
    perolehan: a.perolehan + r.perolehan,
    akumulasi: a.akumulasi + r.akumulasi,
    beban: a.beban + r.beban,
    nilaiBuku: a.nilaiBuku + r.nilaiBuku,
  }), { perolehan: 0, akumulasi: 0, beban: 0, nilaiBuku: 0 })

  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="table-th">Kode Jenis</th>
              <th className="table-th">Uraian</th>
              <th className="table-th text-right">Harga Perolehan</th>
              <th className="table-th text-right">{labelAkumulasi}</th>
              <th className="table-th text-right">{labelBeban}</th>
              <th className="table-th text-right">Nilai Buku</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {loading ? (
              <tr><td colSpan={6} className="table-td text-center py-12 text-gray-400">Memuat data...</td></tr>
            ) : rows.map(r => (
              <tr key={r.kode}>
                <td className="table-td text-xs">{r.kode}</td>
                <td className="table-td text-xs font-medium">{r.uraian}</td>
                <td className="table-td text-right text-xs">{formatRupiah(r.perolehan)}</td>
                <td className="table-td text-right text-xs">{dash(r.akumulasi, r.disusutkan)}</td>
                <td className="table-td text-right text-xs">{dash(r.beban, r.disusutkan)}</td>
                <td className="table-td text-right text-xs">{formatRupiah(r.nilaiBuku)}</td>
              </tr>
            ))}
          </tbody>
          {!loading && rows.length > 0 && (
            <tfoot className="bg-gray-100 border-t-2 border-gray-200">
              <tr>
                <td className="table-td text-xs font-bold" colSpan={2}>TOTAL</td>
                <td className="table-td text-right text-xs font-bold">{formatRupiah(tot.perolehan)}</td>
                <td className="table-td text-right text-xs font-bold">{formatRupiah(tot.akumulasi)}</td>
                <td className="table-td text-right text-xs font-bold">{formatRupiah(tot.beban)}</td>
                <td className="table-td text-right text-xs font-bold text-teal">{formatRupiah(tot.nilaiBuku)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  )
}
