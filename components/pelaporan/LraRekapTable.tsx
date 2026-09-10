'use client'
// Rekap LRA per SKPD, BERJENJANG (drill-down) — pola & keputusan yang sama
// dgn RekapMatrixTable (2026-09-10), tapi kolomnya TETAP (bukan per golongan):
// Total LRA · Kapitalisasi · Reklasifikasi · Belanja Modal (App) · Selisih.
//
// ⚠️ "Selisih" dihitung DI SINI (bukan disimpan di `LraCell`), murni
// `totalLra + kapitalisasi - reklas - belanjaModal` — definisi yg SAMA persis
// dgn `selisihMatrix` di lib/lra.ts. Karena `cell` tiap baris sudah kumulatif,
// selisihnya OTOMATIS ikut kumulatif juga (jumlah dari komponen yg kumulatif
// tetap kumulatif) — tak perlu ditambahkan terpisah ke `bangunPohonLra`.
//
// ⚠️ Dinas Pendidikan (& SKPD besar sejenis) WAJIB tampil selisih bukan-nol di
// sini — realisasi belanja modal anak-anaknya (694 unit di bawahnya) dicatat
// atas nama Dinas Pendidikan sendiri di ledger `pengadaan`, sementara sebagian
// box LRA-nya mungkin tercatat di SKPD anak. Itu bukan bug (keputusan &
// pengakuan user 2026-09-10, "sah sah aja sih") — makanya kolom Selisih TIDAK
// diberi badge merah/hijau seperti Check di tab Ringkasan; ia angka biasa.
import { useState } from 'react'
import { formatRupiah2 } from '@/lib/export'
import type { LraNode } from '@/lib/lraPohon'

export default function LraRekapTable({ rows, loading }: {
  /** Baris TERATAS saja (akar pohon) — anaknya nempel lewat `row.anak`. */
  rows: LraNode[]
  loading: boolean
}) {
  const [terbuka, setTerbuka] = useState<Set<number>>(new Set())
  function toggle(id: number) {
    setTerbuka(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  // ⚠️ Total footer HANYA dari `rows` (baris akar) — `cell` anak sudah ikut
  // terhitung di cell induknya (kumulatif). Menjumlah baris yg SEDANG
  // KELIHATAN (termasuk yg di-expand) akan dobel-hitung.
  const total = rows.reduce((a, r) => ({
    totalLra: a.totalLra + r.cell.totalLra,
    kapitalisasi: a.kapitalisasi + r.cell.kapitalisasi,
    reklas: a.reklas + r.cell.reklas,
    belanjaModal: a.belanjaModal + r.cell.belanjaModal,
  }), { totalLra: 0, kapitalisasi: 0, reklas: 0, belanjaModal: 0 })
  const selisih = (c: { totalLra: number; kapitalisasi: number; reklas: number; belanjaModal: number }) =>
    c.totalLra + c.kapitalisasi - c.reklas - c.belanjaModal

  function baseBaris(list: LraNode[], depth: number): { r: LraNode; depth: number }[] {
    const out: { r: LraNode; depth: number }[] = []
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
            <tr>
              <th className="table-th sticky left-0 bg-gray-50 z-10">SKPD</th>
              <th className="table-th text-right">Total LRA</th>
              <th className="table-th text-right">Kapitalisasi</th>
              <th className="table-th text-right">Reklasifikasi</th>
              <th className="table-th text-right border-l border-gray-100">Belanja Modal (App)</th>
              <th className="table-th text-right border-l border-gray-100">Selisih</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-gray-50">
            {loading ? (
              <tr><td colSpan={6} className="table-td text-center py-12 text-gray-400">Memuat data...</td></tr>
            ) : baris.length === 0 ? (
              <tr><td colSpan={6} className="table-td text-center py-12 text-gray-400">Tidak ada data.</td></tr>
            ) : baris.map(({ r, depth }) => {
              const adaAnak = (r.anak?.length ?? 0) > 0
              const d = selisih(r.cell)
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
                  <td className="table-td text-right text-xs tabular-nums">{formatRupiah2(r.cell.totalLra)}</td>
                  <td className="table-td text-right text-xs tabular-nums">{formatRupiah2(r.cell.kapitalisasi)}</td>
                  <td className="table-td text-right text-xs tabular-nums">{formatRupiah2(r.cell.reklas)}</td>
                  <td className="table-td text-right text-xs tabular-nums border-l border-gray-100">{formatRupiah2(r.cell.belanjaModal)}</td>
                  <td className={`table-td text-right text-xs tabular-nums border-l border-gray-100 ${d === 0 ? 'text-gray-400' : 'font-medium text-amber-700'}`}>
                    {formatRupiah2(d)}
                  </td>
                </tr>
              )
            })}
          </tbody>

          {!loading && rows.length > 0 && (
            <tfoot className="bg-gray-100 border-t-2 border-gray-200">
              <tr>
                <td className="table-td text-xs font-bold sticky left-0 bg-gray-100 z-10">TOTAL</td>
                <td className="table-td text-right text-xs font-bold">{formatRupiah2(total.totalLra)}</td>
                <td className="table-td text-right text-xs font-bold">{formatRupiah2(total.kapitalisasi)}</td>
                <td className="table-td text-right text-xs font-bold">{formatRupiah2(total.reklas)}</td>
                <td className="table-td text-right text-xs font-bold border-l border-gray-200">{formatRupiah2(total.belanjaModal)}</td>
                <td className="table-td text-right text-xs font-bold border-l border-gray-200 text-teal">{formatRupiah2(selisih(total))}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  )
}
