'use client'
// ============================================================================
// PENYAJI lembar PENGAMANAN format Permendagri 47/2021 — IV.J.1.2 & IV.J.2.2.
//
// Murni tampilan — nol query, nol state. Barisnya dirakit
// `muatLaporanPengamanan` (lib/laporanPengamanan.ts), susunan kolomnya dari
// `FORMAT_PENGAMANAN` (lib/formatPengamanan.ts).
//
// ⚠️ SATU LEMBAR SAJA per cabang — keluarga ini TAK punya lembar rekap `.3`–`.6`.
//
// ── BENTUK BARU (2026-09-28) — pola PERSIS Perpindahan/Reklas/Penghapusan ──
// Tabel datar dikelompokkan per golongan, ditutup baris TOTAL yang menjumlah
// Nilai Perolehan. ⚠️ `muatLaporanPengamanan` SUDAH menyaring satu golongan
// tunggal per cabang (kolomnya sendiri, `f.golongan`), jadi kelompoknya cuma
// SATU — sebuah label, BUKAN mesin subtotal `susunRekap` (yang dirancang utk
// banyak kelompok sekaligus). Kalau kelak golongan pengamanan diperluas jadi
// lebih dari satu per lembar, baru saatnya mengangkat mesin subtotal bersama.
//
// ⚠️ TAK ADA cabang `if` per format: yang membedakan IV.J.1.2 & IV.J.2.2
// seluruhnya data (judul, judul blok orang, golongan yang disaring pemuatnya).
// ============================================================================
import { pecahNibar } from '@/lib/kodeRegister'
import { tglPanjang } from '@/lib/beritaAcaraRekon'
import { formatRupiah2 } from '@/lib/export'
import { GOLONGAN_REKAP } from '@/lib/bmd'
import {
  type FormatPengamanan, type KolomRinciPengamanan,
} from '@/lib/formatPengamanan'
import { orangPengamanan, type BarisPengamanan } from '@/lib/laporanPengamanan'

const KABUPATEN = 'Kediri'
const PROVINSI = 'Jawa Timur'
const CETAK_WARNA = '[print-color-adjust:exact] [-webkit-print-color-adjust:exact]'
const SEL = 'border border-black px-1.5 py-1'

const tglID = (s: string | null | undefined) => {
  if (!s) return ''
  const [y, m, d] = s.slice(0, 10).split('-')
  return y && m && d ? `${d}/${m}/${y}` : s
}

function KopLembar({ judul, sebutan, skpd, periode, tahun }: {
  judul: string; sebutan: string
  skpd: { kode: string; nama: string } | null
  periode: string; tahun: string
}) {
  return (
    <>
      {/* ⚠️ Penanda (1)…(5) TIDAK dicetak — angka dalam kurung di lembar
          Permendagri itu rujukan ke petunjuk pengisian, penanda TEMPLATE KOSONG
          (keputusan user 2026-08-30, berlaku untuk seluruh lembar).
          Logo kiri + spacer kanan selebar sama (permintaan user 2026-09-10) —
          pola sama dgn KOP KIBAR & keluarga IV.A (Perolehan). */}
      <div className="flex items-start gap-2 mb-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-kab-kediri.png" alt="Logo Kabupaten Kediri" className="w-11 h-auto flex-shrink-0" />
        <div className="flex-1 text-center leading-tight">
          <p className="font-bold text-[11px]">{judul}</p>
          <p className="font-bold text-[11px]">{sebutan.toUpperCase()}</p>
          <p className="font-bold text-[11px]">{(skpd?.nama || '').toUpperCase()}</p>
          <p className="font-bold text-[11px]">{periode}</p>
          <p className="font-bold text-[11px]">TAHUN {tahun}</p>
        </div>
        <div className="w-11 flex-shrink-0" aria-hidden="true" />
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

function BlokTtd({ sebutan, nama, nip, tgl }: {
  sebutan: string; nama: string | null; nip: string | null; tgl: string
}) {
  return (
    <div className="flex justify-end mt-8 text-[10px]">
      <div className="text-center w-80">
        <p>{KABUPATEN}, {tglPanjang(tgl)}</p>
        <p>{sebutan}</p>
        <div className="h-14" />
        {/* Yang belum dipilih DIBIARKAN bertitik-titik — mengarang nama di
            dokumen yang akan ditandatangani jauh lebih berbahaya. */}
        <p className="font-semibold">{nama || '…………………………………'}</p>
        <p>NIP. {nip || '……………………'}</p>
      </div>
    </div>
  )
}

export type PropLembarPengamanan = {
  f: FormatPengamanan
  rows: BarisPengamanan[]
  skpd: { kode: string; nama: string } | null
  judulPeriode: string
  tahun: string
  sebutan: string
  ttd: { nama: string; nip: string | null } | null
  tglTtd: string
}

export default function LembarPengamananPermendagri(p: PropLembarPengamanan) {
  const { f, rows, skpd, judulPeriode, tahun, sebutan, ttd, tglTtd } = p
  const kolom = f.kolom
  const nKolom = kolom.length
  const iUang = kolom.findIndex(k => k.key === 'nilai_perolehan')
  const nSisa = nKolom - iUang - 1

  const isiKolom = (k: KolomRinciPengamanan, r: BarisPengamanan): React.ReactNode => {
    const a = r.aset!
    const o = orangPengamanan(r)
    switch (k.key) {
      case 'nibar': {
        const pc = pecahNibar(a.nibar)
        return pc ? <>{pc[0]}<br />{pc[1]}</> : (a.nibar || '')
      }
      // Uraian = NOMENKLATUR BAKU kodefikasi (ikut kodefikasi terkini).
      case 'kode': return <>{a.kode || ''}<br />{a.uraian_barang || ''}</>
      // "Nama Barang" = spesifikasi nama yang diketik operator.
      case 'nama': return a.nama_barang || ''
      case 'merek': return a.merek_tipe || ''
      case 'no_polisi': return a.no_polisi || ''
      case 'nilai_perolehan': return formatRupiah2(a.nilai_perolehan ?? 0)
      case 'p_nama': return o.nama
      case 'p_status': return o.status
      case 'p_identitas': return o.identitas
      case 'p_jabatan': return o.jabatan
      // BAST = dokumen penyerahan kustodinya, yaitu kartu jurnal ini sendiri.
      case 'bast_nomor': return r.header?.no_sk || ''
      case 'bast_tanggal': return tglID(r.header?.tanggal || r.tanggal)
      case 'pakta_nomor': return o.paktaNo
      case 'pakta_tanggal': return tglID(o.paktaTgl)
      // Keterangan = isian kotak Keterangan di KARTU dulu (kartu menang, pola
      // yang sama dgn Perpindahan/Reklas/Penghapusan 2026-09-27/28).
      case 'keterangan': return r.header?.keterangan || a.keterangan || ''
      default: return ''
    }
  }

  const rata = (k: KolomRinciPengamanan) =>
    k.rata === 'kanan' ? 'text-right' : k.rata === 'tengah' ? 'text-center' : ''

  const namaGolongan = GOLONGAN_REKAP.find(g => g.kode === f.golongan)?.uraian || f.label
  const totalNilai = rows.reduce((s, r) => s + (r.aset?.nilai_perolehan ?? 0), 0)

  return (
    <section>
      <p className="text-right text-[12px] mb-1">Format {f.kode}</p>
      <KopLembar judul={f.judul} sebutan={sebutan} skpd={skpd}
        periode={judulPeriode} tahun={tahun} />
      <table className="w-full table-fixed border-collapse text-[10px] leading-snug">
        <colgroup>
          {kolom.map(k => <col key={k.key} style={{ width: `${k.lebar}%` }} />)}
        </colgroup>
        <thead>
          <tr className={`text-center font-semibold bg-gray-50 ${CETAK_WARNA}`}>
            {kolom.map(k => (
              <th key={k.key} className={`${SEL} [overflow-wrap:anywhere]`}>{k.judul}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length > 0 && (
            <>
              <tr className={`font-semibold bg-teal/5 ${CETAK_WARNA}`}>
                <td className={SEL} colSpan={nKolom}>{f.golongan} — {namaGolongan}</td>
              </tr>
              {rows.map(r => (
                <tr key={r.id} className="align-top">
                  {kolom.map(k => (
                    <td key={k.key}
                      // NIBAR 9px (pola keluarga Perpindahan/Reklas/Penghapusan)
                      // supaya potongan 26 digitnya muat sebaris.
                      className={`${SEL} ${rata(k)} ${
                        k.key === 'nibar' ? 'break-all tracking-tighter text-[9px]'
                          : k.rata === 'tengah' || k.rata === 'kanan' ? 'whitespace-nowrap' : '[overflow-wrap:anywhere]'}`}>
                      {isiKolom(k, r)}
                    </td>
                  ))}
                </tr>
              ))}
              <tr className={`font-bold bg-gray-200 ${CETAK_WARNA}`}>
                <td className={`${SEL} text-right`} colSpan={iUang}>TOTAL</td>
                <td className={`${SEL} text-right [overflow-wrap:anywhere]`}>{formatRupiah2(totalNilai)}</td>
                <td className={SEL} colSpan={nSisa} />
              </tr>
            </>
          )}
          {rows.length === 0 && (
            <tr><td colSpan={nKolom} className={`${SEL} py-3 text-center`}>{f.kosong}</td></tr>
          )}
        </tbody>
      </table>
      <BlokTtd sebutan={sebutan} nama={ttd?.nama || null} nip={ttd?.nip || null} tgl={tglTtd} />
    </section>
  )
}
