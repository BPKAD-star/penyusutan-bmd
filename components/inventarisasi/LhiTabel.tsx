'use client'
// Tabel Laporan Hasil Inventarisasi (LHI) — Format III.B.1–III.B.11.
// Dipakai bersama halaman laporan & halaman cetak. Header bisa dua baris:
// kolom ber-`grup` (mis. "Data Awal/Induk", "Sebelum/Setelah Inventarisasi")
// digabung jadi satu sel span di baris pertama.
import { useMemo } from 'react'
import { formatRupiah } from '@/lib/export'
import { LHI_LABEL, type LhiKode } from '@/lib/inventarisasi'
import {
  CATATAN_KAKI, jalurGrup, kolomLhi, kolomLhiCetak, nilaiSelCetak, totalNilaiLhi,
} from '@/lib/inventarisasiLaporan'

/** Tiga baris identitas di kop lampiran — butir (3), (4), (5) tiap format.
 *  Yang tak diketahui sengaja dibiarkan bertitik-titik utk diisi tangan,
 *  BUKAN ditebak: ini dokumen yang ditandatangani. */
export type IdentitasLhi = { kuasa?: string; pengguna?: string; pengelola?: string }

export default function LhiTabel({ kode, rows, judulSkpd, periodeLabel, identitas, cetak }: {
  kode: LhiKode
  rows: Record<string, string | number>[]
  judulSkpd?: string
  periodeLabel?: string
  identitas?: IdentitasLhi
  /** Pakai bentuk kolom lampiran (petak centang bertingkat). Halaman cetak
   *  saja — tabel di layar & Excel tetap datar supaya bisa disaring. */
  cetak?: boolean
}) {
  const kolom = useMemo(() => (cetak ? kolomLhiCetak(kode) : kolomLhi(kode)), [kode, cetak])
  const total = useMemo(() => totalNilaiLhi(rows), [rows])

  // Susun header bertingkat. Lampiran III.B.6 punya 3 tingkat grup di atas
  // nama kolom ("Penggunaan" → "Pemerintah Pusat" → "Ada" → "Nama Instansi"),
  // jadi builder-nya dibuat rekursif — bukan dipatok dua baris.
  const barisHeader = useMemo(() => {
    const dalam = Math.max(0, ...kolom.map(k => jalurGrup(k).length))
    const total = dalam + 1
    const out: { label: string; colSpan: number; rowSpan: number }[][] =
      Array.from({ length: total }, () => [])

    const susun = (level: number, dari: number, sampai: number) => {
      let i = dari
      while (i < sampai) {
        const j = jalurGrup(kolom[i])
        if (j.length <= level) {
          // Kolom biasa (atau grupnya sudah habis) → tarik ke dasar tabel.
          out[level].push({ label: kolom[i].label, colSpan: 1, rowSpan: total - level })
          i++
          continue
        }
        let n = 1
        while (i + n < sampai && jalurGrup(kolom[i + n])[level] === j[level]) n++
        out[level].push({ label: j[level], colSpan: n, rowSpan: 1 })
        susun(level + 1, i, i + n)
        i += n
      }
    }
    susun(0, 0, kolom.length)
    return out.filter(r => r.length > 0)
  }, [kolom])

  const th = 'brd px-2 py-1 text-center font-semibold bg-gray-50'

  return (
    <div className="text-[11px] text-gray-900">
      <style>{`.brd{border:1px solid #9ca3af}`}</style>

      <div className="text-center mb-3">
        <p className="font-bold uppercase text-[13px]">Laporan Hasil Inventarisasi (LHI)</p>
        <p className="font-semibold uppercase">Rekapitulasi {LHI_LABEL[kode]}</p>
        {periodeLabel && <p className="font-semibold uppercase">BMD Berupa {periodeLabel}</p>}
        <p className="font-semibold uppercase">Provinsi Jawa Timur, Kabupaten Kediri</p>
        <p className="text-[11px] text-gray-500">Format {kode}</p>
      </div>

      {/* Butir (3)–(5) lampiran. Selalu dicetak ketiganya, walau kosong. */}
      <table className="mb-2">
        <tbody>
          {([
            ['Kuasa Pengguna Barang', identitas?.kuasa],
            ['Pengguna Barang', identitas?.pengguna],
            ['Pengelola Barang', identitas?.pengelola],
          ] as [string, string | undefined][]).map(([label, isi]) => (
            <tr key={label}>
              <td className="pr-3 align-top">{label}</td>
              <td className="pr-2 align-top">:</td>
              <td className="align-top">{isi || '……………………………………'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {judulSkpd && <p className="mb-2 font-semibold">SKPD: {judulSkpd}</p>}

      {rows.length === 0 ? (
        <p className="py-8 text-center text-gray-400">Tidak ada temuan untuk format ini.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="border-collapse w-full">
            <thead>
              {barisHeader.map((baris, li) => (
                <tr key={li}>
                  {baris.map((a, i) => (
                    <th key={`${li}-${i}`} className={th} colSpan={a.colSpan} rowSpan={a.rowSpan}>{a.label}</th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  {kolom.map(k => {
                    const v = cetak ? nilaiSelCetak(k, r) : (r[k.key] ?? '')
                    const rupiah = k.key === 'nilai' || k.key === 'harga_satuan' || k.key === 'g_nilai'
                    return (
                      <td key={k.key}
                        className={`brd px-2 py-1 align-top ${k.tanda ? 'text-center' : ''} ${k.angka ? 'text-right whitespace-nowrap' : ''}`}>
                        {rupiah ? (typeof v === 'number' ? formatRupiah(v) : '') : v}
                      </td>
                    )
                  })}
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

      {(CATATAN_KAKI[kode] || []).length > 0 && (
        <div className="mt-2 space-y-0.5 text-[10px] text-gray-600">
          {(CATATAN_KAKI[kode] || []).map(c => <p key={c}>{c}</p>)}
        </div>
      )}
    </div>
  )
}
