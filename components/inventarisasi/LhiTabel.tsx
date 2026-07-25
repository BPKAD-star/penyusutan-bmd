'use client'
// Tabel Laporan Hasil Inventarisasi (LHI) — Format III.B.1–III.B.11.
// Dipakai bersama halaman laporan & halaman cetak. Header bisa dua baris:
// kolom ber-`grup` (mis. "Data Awal/Induk", "Sebelum/Setelah Inventarisasi")
// digabung jadi satu sel span di baris pertama.
import { useMemo } from 'react'
import { formatRupiah } from '@/lib/export'
import { LHI_LABEL, type LhiKode } from '@/lib/inventarisasi'
import { kolomLhi, totalNilaiLhi, type KolomLhi } from '@/lib/inventarisasiLaporan'

export default function LhiTabel({ kode, rows, judulSkpd, periodeLabel }: {
  kode: LhiKode
  rows: Record<string, string | number>[]
  judulSkpd?: string
  periodeLabel?: string
}) {
  const kolom = useMemo(() => kolomLhi(kode), [kode])
  const total = useMemo(() => totalNilaiLhi(rows), [rows])

  // Susun header: kolom tanpa grup → rowSpan 2; kolom ber-grup → dikelompokkan
  // berurutan jadi satu sel colSpan di baris atas.
  const atas: { label: string; span: number; grup: boolean }[] = []
  const bawah: KolomLhi[] = []
  for (let i = 0; i < kolom.length; i++) {
    const k = kolom[i]
    if (!k.grup) { atas.push({ label: k.label, span: 1, grup: false }); continue }
    let n = 0
    while (i + n < kolom.length && kolom[i + n].grup === k.grup) { bawah.push(kolom[i + n]); n++ }
    atas.push({ label: k.grup, span: n, grup: true })
    i += n - 1
  }
  const adaGrup = bawah.length > 0

  const th = 'brd px-2 py-1 text-center font-semibold bg-gray-50'

  return (
    <div className="text-[11px] text-gray-900">
      <style>{`.brd{border:1px solid #9ca3af}`}</style>

      <div className="text-center mb-3">
        <p className="font-bold uppercase text-[13px]">Laporan Hasil Inventarisasi (LHI)</p>
        <p className="font-semibold uppercase">Rekapitulasi {LHI_LABEL[kode]}</p>
        {periodeLabel && <p>{periodeLabel}</p>}
        {judulSkpd && <p className="font-semibold">SKPD: {judulSkpd}</p>}
        <p className="text-[11px] text-gray-500">Format {kode}</p>
      </div>

      {rows.length === 0 ? (
        <p className="py-8 text-center text-gray-400">Tidak ada temuan untuk format ini.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="border-collapse w-full">
            <thead>
              <tr>
                {atas.map((a, i) => (
                  <th key={i} className={th} colSpan={a.span} rowSpan={a.grup || !adaGrup ? 1 : 2}>{a.label}</th>
                ))}
              </tr>
              {adaGrup && (
                <tr>{bawah.map(k => <th key={k.key} className={th}>{k.label}</th>)}</tr>
              )}
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  {kolom.map(k => (
                    <td key={k.key}
                      className={`brd px-2 py-1 align-top ${k.angka ? 'text-right whitespace-nowrap' : ''}`}>
                      {k.key === 'nilai' || k.key === 'harga_satuan' || k.key === 'g_nilai'
                        ? (typeof r[k.key] === 'number' ? formatRupiah(r[k.key] as number) : '')
                        : (r[k.key] ?? '') as string | number}
                    </td>
                  ))}
                </tr>
              ))}
              <tr className="bg-gray-100 font-semibold">
                <td className="brd px-2 py-1 text-right" colSpan={kolom.findIndex(k => k.key === 'nilai') || 1}>
                  Jumlah (Rp)
                </td>
                <td className="brd px-2 py-1 text-right whitespace-nowrap">{formatRupiah(total)}</td>
                <td className="brd px-2 py-1" colSpan={Math.max(0, kolom.length - (kolom.findIndex(k => k.key === 'nilai') + 1))}></td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
