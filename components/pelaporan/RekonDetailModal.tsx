'use client'
// Rincian (drill-down) sebuah sel Rekonsiliasi BMD — pola yang sama dgn
// LraDetailModal: klik angka → lihat transaksi pembentuknya, dikelompokkan per
// SKPD + subtotal. Sumbernya baris mutasi yang SUDAH ada di memori halaman
// (hasil fetchMutasiLines), jadi tak ada query baru DAN totalnya dijamin sama
// dengan angka yang diklik — dua-duanya dijumlah dari array yang sama.
import { useMemo, useState } from 'react'
import { exportToExcel } from '@/lib/export'
import { KATEGORI_LABEL, type MutasiLine } from '@/lib/rekon'

// Format polos bergaya id-ID tanpa "Rp" — mengikuti tabel Rekonsiliasi di
// belakangnya, biar enak dibandingkan angkanya saat tie-out.
const angka = (v: number) => new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(v || 0)

export default function RekonDetailModal({ judul, rows, skpdNama, onClose }: {
  judul: string
  rows: MutasiLine[]
  skpdNama: Record<number, string>
  onClose: () => void
}) {
  const [q, setQ] = useState('')

  const term = q.trim().toLowerCase()
  const tampil = useMemo(() => rows.filter(r => !term ||
    (r.nama || '').toLowerCase().includes(term) ||
    (r.nibar || '').toLowerCase().includes(term) ||
    (r.no_dokumen || '').toLowerCase().includes(term) ||
    r.kode.toLowerCase().includes(term) ||
    KATEGORI_LABEL[r.kategori].toLowerCase().includes(term) ||
    ((r.skpd_id != null && skpdNama[r.skpd_id]) || '').toLowerCase().includes(term)
  ), [rows, term, skpdNama])

  // Kelompokkan per SKPD (urut nama), tiap grup urut tanggal.
  const grup = useMemo(() => {
    const m = new Map<number, MutasiLine[]>()
    for (const r of tampil) {
      const id = r.skpd_id ?? -1
      const arr = m.get(id) || []; arr.push(r); m.set(id, arr)
    }
    return [...m.entries()]
      .map(([id, rs]) => ({
        id, nama: (id >= 0 && skpdNama[id]) || 'SKPD tidak diketahui',
        rows: [...rs].sort((a, b) => a.tanggal.localeCompare(b.tanggal)),
        total: rs.reduce((s, r) => s + r.nilai, 0),
      }))
      .sort((a, b) => a.nama.localeCompare(b.nama))
  }, [tampil, skpdNama])

  const total = tampil.reduce((s, r) => s + r.nilai, 0)

  function handleExport() {
    exportToExcel(tampil.map(r => ({
      SKPD: (r.skpd_id != null && skpdNama[r.skpd_id]) || '',
      Tanggal: r.tanggal,
      Kategori: KATEGORI_LABEL[r.kategori],
      'Jenis Ledger': r.jenis,
      'No Dokumen/SK': r.no_dokumen || '',
      'Kode Barang': r.kode,
      NIBAR: r.nibar || '',
      'Nama Barang': r.nama || '',
      Komptabel: r.komp === 'intra' ? 'Intra' : 'Ekstra',
      Nilai: r.nilai,
    })), `Rincian_Rekonsiliasi_${judul.replace(/[^a-zA-Z0-9]+/g, '_').slice(0, 60)}`, 'Rincian')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 overflow-y-auto">
      <div className="card w-full max-w-6xl my-8 bg-white">
        <div className="flex items-start justify-between px-5 py-3 border-b border-gray-100 gap-4">
          <div>
            <h2 className="text-base font-semibold text-gray-800">Rincian — {judul}</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {tampil.length} transaksi · {grup.length} SKPD · total <b>{angka(total)}</b>
            </p>
          </div>
          <button className="text-gray-400 hover:text-gray-600 text-xl leading-none flex-shrink-0" onClick={onClose}>×</button>
        </div>

        <div className="px-5 py-3 flex flex-wrap items-center gap-3 border-b border-gray-100">
          <input className="select-filter flex-1 min-w-[220px]" placeholder="Cari SKPD / nama barang / NIBAR / no. dokumen / kode..."
            value={q} onChange={e => setQ(e.target.value)} />
          <button className="btn-secondary" onClick={handleExport} disabled={tampil.length === 0}>Export Excel</button>
        </div>

        <div className="max-h-[65vh] overflow-y-auto">
          {grup.length === 0 ? (
            <div className="p-10 text-center text-gray-400 text-sm">Tidak ada transaksi.</div>
          ) : (
            <table className="w-full text-xs">
              <thead className="bg-gray-50 border-b border-gray-100 sticky top-0">
                <tr>
                  <th className="table-th text-left">Tanggal</th>
                  <th className="table-th text-left">Kategori</th>
                  <th className="table-th text-left">No Dok/SK</th>
                  <th className="table-th text-left">Kode</th>
                  <th className="table-th text-left">Nama Barang</th>
                  <th className="table-th text-right">Nilai</th>
                </tr>
              </thead>
              {grup.map(g => (
                <tbody key={g.id} className="divide-y divide-gray-50">
                  <tr className="bg-teal/5">
                    <td className="table-td font-semibold text-gray-800" colSpan={5}>{g.nama}</td>
                    <td className="table-td text-right font-semibold tabular-nums text-gray-800">{angka(g.total)}</td>
                  </tr>
                  {g.rows.map((r, i) => (
                    <tr key={`${r.aset_id}-${r.jenis}-${r.kategori}-${i}`}>
                      <td className="table-td whitespace-nowrap">{r.tanggal}</td>
                      <td className="table-td max-w-[220px] truncate" title={`${KATEGORI_LABEL[r.kategori]} · ${r.jenis}`}>{KATEGORI_LABEL[r.kategori]}</td>
                      <td className="table-td max-w-[180px] truncate" title={r.no_dokumen || ''}>{r.no_dokumen || '-'}</td>
                      <td className="table-td whitespace-nowrap">{r.kode}</td>
                      <td className="table-td max-w-[280px]">
                        <p className="text-gray-800">{r.nama || '-'}</p>
                        <p className="text-gray-400 truncate" title={r.nibar || ''}>{r.nibar || '-'}</p>
                      </td>
                      <td className="table-td text-right tabular-nums whitespace-nowrap">{angka(r.nilai)}</td>
                    </tr>
                  ))}
                </tbody>
              ))}
              <tfoot className="border-t-2 border-gray-200 bg-gray-50 sticky bottom-0">
                <tr>
                  <td className="table-td font-semibold text-gray-900" colSpan={5}>TOTAL</td>
                  <td className="table-td text-right font-semibold tabular-nums text-gray-900">{angka(total)}</td>
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
