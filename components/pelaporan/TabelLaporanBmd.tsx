'use client'
// Badan tabel lembar LAPORAN BMD (Permendagri 47/2021) — dipakai BERSAMA oleh
// Format IV.L.4.2 (per SKPD) & IV.L.4.4 (se-pemda). Kedua lembar itu isinya
// SAMA PERSIS; yang beda cuma kop & blok tanda tangannya, jadi tabelnya ditulis
// sekali di sini. Kalau tiap halaman menyalin tabelnya sendiri, dua lembar
// resmi pelan-pelan menyimpang & tak ada satu pun yang gagal saat itu terjadi.
//
// Nomor kolom lampiran ((8)(9)(10)(11) di 4.2, (5)(6)(7)(8) di 4.4) SENGAJA
// TIDAK dicetak — itu penomoran petunjuk pengisian di template, bukan bagian
// dari laporan jadi.
import { BARIS_LAPORAN_BMD, nilaiBaris, type UkuranGolongan } from '@/lib/laporanBmdFormat'

const angka = (v: number) => new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(v || 0)
/** Akun lawan dicetak dalam kurung — konvensi neraca untuk nilai pengurang. */
const kurung = (v: number) => `(${angka(v)})`

export default function TabelLaporanBmd({ peta }: { peta: Map<string, UkuranGolongan> }) {
  return (
    <table className="w-full table-fixed border-collapse text-[10px]">
      <colgroup>
        <col className="w-[4%]" /><col className="w-[4%]" /><col className="w-[4%]" />
        <col className="w-[40%]" />
        <col className="w-[20%]" />
        <col className="w-[28%]" />
      </colgroup>
      <thead>
        <tr className="text-center font-semibold">
          <th className="border border-black px-1 py-1" colSpan={4}>Penggolongan dan Kodefikasi Barang</th>
          <th className="border border-black px-1 py-1" rowSpan={2}>Jumlah BMD</th>
          <th className="border border-black px-1 py-1" rowSpan={2}>Saldo akhir (Rp)</th>
        </tr>
        <tr className="text-center font-semibold">
          <th className="border border-black px-1 py-1" colSpan={3}>Kode Barang</th>
          <th className="border border-black px-1 py-1">Nama Barang</th>
        </tr>
      </thead>
      <tbody>
        {BARIS_LAPORAN_BMD.map(b => {
          const n = nilaiBaris(b, peta)
          const akum = b.jenis === 'akumulasi'
          return (
            <tr key={b.kode.join('.') + b.nama} className={b.jenis === 'kelompok' ? 'font-bold' : ''}>
              {b.kode.map((k, i) => (
                <td key={i} className="border border-black px-1 py-0.5 text-center">{k}</td>
              ))}
              <td className="border border-black px-1 py-0.5">{b.nama}</td>
              {/* Baris akun lawan: "Jumlah BMD" sengaja "–" — akumulasi tak
                  punya jumlah unit (persis seperti di lampiran aslinya). */}
              <td className="border border-black px-1 py-0.5 text-right">
                {n.jumlahBmd == null ? '–' : angka(n.jumlahBmd)}
              </td>
              <td className="border border-black px-1 py-0.5 text-right">
                {n.saldoAkhir == null ? '–' : akum ? kurung(n.saldoAkhir) : angka(n.saldoAkhir)}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
