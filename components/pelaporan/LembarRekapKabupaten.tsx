'use client'
// ============================================================================
// PENYAJI lembar rekap SE-KABUPATEN — Format IV.A.<n>.7–10.
//
// Murni tampilan; angkanya dirakit `muatLembarKabupaten`.
//
// ⚠️ KEEMPATNYA TIDAK SERAGAM (lihat `REKAP_KABUPATEN` di lib/formatPermendagri):
// `.7` berjudul LAPORAN bukan REKAPITULASI, dan hanya `.10` yang memecah per
// Pengguna Barang. Jangan disamakan jadi satu bentuk "karena mirip".
//
// ⚠️ Kop-nya mengganti baris SKPD dengan "PROVINSI, KABUPATEN/KOTA" — itulah
// pembeda lembar ini dari IV.A.<n>.3–6 yang per-SKPD. Kalau kop-nya menyebut
// se-Kabupaten sementara isinya satu SKPD (karena RLS menyaring), lembar itu
// SALAH dan tak ada yang akan berteriak: gerbang `bolehLembarKabupaten` wajib
// diperiksa pemanggil SEBELUM memuat datanya.
// ============================================================================
import { formatRupiah } from '@/lib/export'
import { tglPanjang } from '@/lib/beritaAcaraRekon'
import {
  REKAP_KABUPATEN, SEBUTAN_TTD_KABUPATEN, segmenKode, susunRekap,
  totalSemua, type ItemLaporan,
} from '@/lib/formatPermendagri'

const KABUPATEN = 'Kediri'
const PROVINSI = 'Jawa Timur'

/** Sel kode terdalam di lembar se-Kabupaten = 6 segmen (`.7`). */
const SEL_KODE_KAB = 6

export type ItemKab<T> = ItemLaporan<T> & { skpdRoot: string }

export type PropRekapKab<T> = {
  /** Judul dasar lembar, tanpa "MENURUT …" dan tanpa awalan LAPORAN/REKAPITULASI. */
  judulDasar: string
  /** Awalan kode format, mis. 'IV.A.2'. */
  awalan: string
  items: ItemKab<T>[]
  namaTingkat: Map<string, string>
  berupa: string
  labelKomptabel: string
  judulPeriode: string
  tahun: string
  ttd: { nama: string; nip: string | null } | null
  tglTtd: string
  /** Akhiran lembar yang ditampilkan (7–10). Kosong = semuanya. */
  lembar?: number[]
}

export default function LembarRekapKabupaten<T>(p: PropRekapKab<T>) {
  const nama = (kode: string) => p.namaTingkat.get(kode) || ''
  const tampil = (n: number) => !p.lembar || p.lembar.includes(n)
  const dipakai = REKAP_KABUPATEN.filter(r => tampil(r.akhiran))

  function Kop({ judulAwal, menurut }: { judulAwal: string; menurut: string }) {
    return (
      <>
        <div className="text-center leading-tight mb-2">
          <p className="font-bold text-[11px]">{judulAwal} {p.judulDasar} {p.berupa}</p>
          <p className="font-bold text-[11px]">MENURUT {menurut}</p>
          <p className="font-bold text-[11px]">{p.labelKomptabel}</p>
          {/* ⚠️ Baris ini yang membedakannya dari lembar per-SKPD: TIDAK ada
              nama SKPD & tidak ada sebutan pejabat penggunanya. */}
          <p className="font-bold text-[11px]">PROVINSI {PROVINSI.toUpperCase()}, KABUPATEN {KABUPATEN.toUpperCase()}</p>
          <p className="font-bold text-[11px]">{p.judulPeriode}</p>
          <p className="font-bold text-[11px]">TAHUN {p.tahun}</p>
        </div>
        <table className="text-[9px] mb-1">
          <tbody>
            <tr><td className="pr-6">Provinsi</td><td>: {PROVINSI}</td></tr>
            <tr><td className="pr-6">Kabupaten/Kota</td><td>: {KABUPATEN}</td></tr>
          </tbody>
        </table>
      </>
    )
  }

  function Ttd() {
    return (
      <div className="flex justify-end mt-8 text-[10px]">
        <div className="text-center w-80">
          <p>{KABUPATEN}, {tglPanjang(p.tglTtd)}</p>
          {/* ⚠️ DIPAKU dari formatnya, bukan diturunkan dari peran pemakai. */}
          <p>{SEBUTAN_TTD_KABUPATEN}</p>
          <div className="h-14" />
          <p className="font-semibold">{p.ttd?.nama || '…………………………………'}</p>
          <p>NIP. {p.ttd?.nip || '……………………'}</p>
        </div>
      </div>
    )
  }

  function SelKode({ kode, sampai }: { kode: string; sampai: number }) {
    const seg = segmenKode(kode)
    return (
      <>
        {Array.from({ length: SEL_KODE_KAB }, (_, i) => (
          <td key={i} className={`border border-black px-0.5 py-0.5 text-center ${sampai <= 3 ? 'font-bold' : ''}`}>
            {i < sampai ? (seg[i] ?? '') : ''}
          </td>
        ))}
      </>
    )
  }

  /** `.7`–`.9`: empat kolom, se-kabupaten TANPA pecahan per SKPD. */
  function LembarPolos({ seg }: { seg: number }) {
    const baris = susunRekap(p.items, seg)
    const total = totalSemua(p.items)
    return (
      <table className="w-full table-fixed border-collapse text-[9px] leading-tight">
        <colgroup>
          {Array.from({ length: SEL_KODE_KAB }, (_, i) => <col key={i} style={{ width: `${30 / SEL_KODE_KAB}%` }} />)}
          <col style={{ width: '38%' }} />
          <col style={{ width: '16%' }} />
          <col style={{ width: '16%' }} />
        </colgroup>
        <thead>
          <tr className="text-center font-semibold">
            <th className="border border-black px-1 py-1" colSpan={SEL_KODE_KAB + 1}>
              Penggolongan dan Kodefikasi Barang
            </th>
            <th className="border border-black px-1 py-1" rowSpan={2}>Jumlah Barang</th>
            <th className="border border-black px-1 py-1" rowSpan={2}>Jumlah (Rp)</th>
          </tr>
          <tr className="text-center font-semibold">
            <th className="border border-black px-1 py-1" colSpan={SEL_KODE_KAB}>Kode Barang</th>
            <th className="border border-black px-1 py-1">Nama Barang</th>
          </tr>
        </thead>
        <tbody>
          {baris.map((b, i) => (
            <tr key={i} className={b.seg <= 3 ? 'font-bold' : ''}>
              <SelKode kode={b.kode} sampai={b.seg} />
              <td className="border border-black px-1 py-0.5 break-words">{nama(b.kode) || b.kode}</td>
              <td className="border border-black px-1 py-0.5 text-right">{b.jumlah}</td>
              <td className="border border-black px-1 py-0.5 text-right">{formatRupiah(b.nilai)}</td>
            </tr>
          ))}
          {baris.length === 0 && (
            <tr><td colSpan={SEL_KODE_KAB + 3} className="border border-black px-1 py-3 text-center">
              Tidak ada perolehan pada periode ini.
            </td></tr>
          )}
          <tr className="font-bold">
            <td className="border border-black px-1 py-0.5 text-center" colSpan={SEL_KODE_KAB + 1}>JUMLAH</td>
            <td className="border border-black px-1 py-0.5 text-right">{total.jumlah}</td>
            <td className="border border-black px-1 py-0.5 text-right">{formatRupiah(total.nilai)}</td>
          </tr>
        </tbody>
      </table>
    )
  }

  /**
   * `.10`: sama, tapi dipecah per **Pengguna Barang**. Nomor & nama SKPD hanya
   * di baris PERTAMA tiap blok — begitu bentuk lembar aslinya.
   */
  function LembarPerSkpd() {
    const perSkpd = new Map<string, ItemKab<T>[]>()
    for (const it of p.items) {
      const k = it.skpdRoot || '(tanpa SKPD)'
      const a = perSkpd.get(k) || []; a.push(it); perSkpd.set(k, a)
    }
    const urut = [...perSkpd.entries()].sort((a, b) => a[0].localeCompare(b[0]))
    const total = totalSemua(p.items)
    return (
      <table className="w-full table-fixed border-collapse text-[9px] leading-tight">
        <colgroup>
          <col style={{ width: '4%' }} />
          <col style={{ width: '20%' }} />
          {Array.from({ length: SEL_KODE_KAB }, (_, i) => <col key={i} style={{ width: `${18 / SEL_KODE_KAB}%` }} />)}
          <col style={{ width: '28%' }} />
          <col style={{ width: '15%' }} />
          <col style={{ width: '15%' }} />
        </colgroup>
        <thead>
          <tr className="text-center font-semibold">
            <th className="border border-black px-1 py-1" rowSpan={2}>No</th>
            <th className="border border-black px-1 py-1" rowSpan={2}>Pengguna Barang dan Pengelola Barang</th>
            <th className="border border-black px-1 py-1" colSpan={SEL_KODE_KAB + 1}>
              Penggolongan dan Kodefikasi Barang
            </th>
            <th className="border border-black px-1 py-1" rowSpan={2}>Jumlah Barang</th>
            <th className="border border-black px-1 py-1" rowSpan={2}>Jumlah (Rp)</th>
          </tr>
          <tr className="text-center font-semibold">
            <th className="border border-black px-1 py-1" colSpan={SEL_KODE_KAB}>Kode Barang</th>
            <th className="border border-black px-1 py-1">Nama Barang</th>
          </tr>
        </thead>
        <tbody>
          {urut.map(([skpd, isi], iSkpd) => {
            const baris = susunRekap(isi, 3)
            return baris.map((b, i) => (
              <tr key={`${iSkpd}-${i}`} className={b.seg <= 3 ? 'font-bold' : ''}>
                <td className="border border-black px-1 py-0.5 text-center">{i === 0 ? `${iSkpd + 1}.` : ''}</td>
                <td className="border border-black px-1 py-0.5 break-words">{i === 0 ? skpd : ''}</td>
                <SelKode kode={b.kode} sampai={b.seg} />
                <td className="border border-black px-1 py-0.5 break-words">{nama(b.kode) || b.kode}</td>
                <td className="border border-black px-1 py-0.5 text-right">{b.jumlah}</td>
                <td className="border border-black px-1 py-0.5 text-right">{formatRupiah(b.nilai)}</td>
              </tr>
            ))
          })}
          {urut.length === 0 && (
            <tr><td colSpan={SEL_KODE_KAB + 5} className="border border-black px-1 py-3 text-center">
              Tidak ada perolehan pada periode ini.
            </td></tr>
          )}
          <tr className="font-bold">
            <td className="border border-black px-1 py-0.5 text-center" colSpan={SEL_KODE_KAB + 3}>JUMLAH</td>
            <td className="border border-black px-1 py-0.5 text-right">{total.jumlah}</td>
            <td className="border border-black px-1 py-0.5 text-right">{formatRupiah(total.nilai)}</td>
          </tr>
        </tbody>
      </table>
    )
  }

  return (
    <>
      {dipakai.map((r, i) => (
        <section key={r.akhiran} className={i > 0 ? 'break-before-page' : ''}>
          <p className="text-right text-[12px] mb-1">Format {p.awalan}.{r.akhiran}</p>
          <Kop judulAwal={r.judulAwal} menurut={r.menurut} />
          {r.perSkpd ? <LembarPerSkpd /> : <LembarPolos seg={r.seg} />}
          <Ttd />
        </section>
      ))}
    </>
  )
}
