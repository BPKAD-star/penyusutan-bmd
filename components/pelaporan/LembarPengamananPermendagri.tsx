'use client'
// ============================================================================
// PENYAJI lembar PENGAMANAN format Permendagri 47/2021 — IV.J.1.2 & IV.J.2.2.
//
// Murni tampilan — nol query, nol state. Barisnya dirakit
// `muatLaporanPengamanan` (lib/laporanPengamanan.ts), susunan kolomnya dari
// `FORMAT_PENGAMANAN` (lib/formatPengamanan.ts).
//
// ⚠️ SATU LEMBAR SAJA per cabang — keluarga ini TAK punya lembar rekap `.3`–`.6`.
// Bentuknya DATAR & BERNOMOR: kolom "Kode Barang" satu kolom teks biasa (bukan
// sel segmen) dan tak ada satu pun baris kelompok atau subtotal. Karena itu
// penyaji ini tak menyentuh mesin subtotal sama sekali — beda dari SELURUH
// keluarga lembar lain di aplikasi ini.
//
// ⚠️ TAK ADA cabang `if` per format: yang membedakan IV.J.1.2 & IV.J.2.2
// seluruhnya data (judul, judul blok orang, golongan yang disaring pemuatnya).
// ============================================================================
import { pecahNibar } from '@/lib/kodeRegister'
import { tglPanjang } from '@/lib/beritaAcaraRekon'
import {
  grupKolomPengamanan,
  type FormatPengamanan, type KolomLembarPengamanan,
} from '@/lib/formatPengamanan'
import { orangPengamanan, type BarisPengamanan } from '@/lib/laporanPengamanan'

const KABUPATEN = 'Kediri'
const PROVINSI = 'Jawa Timur'

/** ⚠️ `[overflow-wrap:anywhere]`, bukan `break-words` — lihat lembar IV.B/IV.F. */
const WRAP = 'border border-black px-0.5 py-1 [overflow-wrap:anywhere]'
const SEL_ISI = 'border border-black px-1 py-0.5'

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
  const grup = grupKolomPengamanan(f)

  const isi = (k: KolomLembarPengamanan, r: BarisPengamanan, i: number): React.ReactNode => {
    const a = r.aset!
    const o = orangPengamanan(r)
    switch (k.key) {
      // ⚠️ Nomor urut DIHITUNG SAAT TAMPIL — lembar ini datar & tak berkelompok,
      // jadi nomornya memang sekadar urutan baris di kertas. Bandingkan kode
      // register, yang justru WAJIB diterbitkan & disimpan (CLAUDE.md).
      case 'no': return i + 1
      case 'nibar': {
        const pc = pecahNibar(a.nibar)
        return pc ? <>{pc[0]}<br />{pc[1]}</> : (a.nibar || '')
      }
      case 'kode': return a.kode || ''
      // ⚠️ "Nama Barang" = nomenklatur baku (`uraian_barang`), "Spesifikasi Nama
      // Barang" = yang diketik operator. Dua hal berbeda — jangan ditukar.
      case 'nama': return a.uraian_barang || ''
      case 'spek_nama': return a.nama_barang || ''
      case 'lokasi': return a.alamat_detail || ''
      case 'p_nama': return o.nama
      case 'p_identitas': return o.identitas
      case 'p_status': return o.status
      case 'p_jabatan': return o.jabatan
      case 'p_alamat': return o.alamat
      // BAST = dokumen penyerahan kustodinya, yaitu kartu jurnal ini sendiri.
      case 'bast_nomor': return r.header?.no_sk || ''
      case 'bast_tanggal': return tglID(r.header?.tanggal || r.tanggal)
      case 'pakta_nomor': return o.paktaNo
      case 'pakta_tanggal': return tglID(o.paktaTgl)
      case 'keterangan': return a.keterangan || ''
      default: return ''
    }
  }

  const rata = (k: KolomLembarPengamanan) =>
    k.rata === 'kanan' ? 'text-right' : k.rata === 'tengah' ? 'text-center' : ''

  return (
    <section>
      <p className="text-right text-[12px] mb-1">Format {f.kode}</p>
      <KopLembar judul={f.judul} sebutan={sebutan} skpd={skpd}
        periode={judulPeriode} tahun={tahun} />
      <table className="w-full table-fixed border-collapse text-[8px] leading-[1.15]">
        <colgroup>
          {f.kolom.map(k => <col key={k.key} style={{ width: `${k.lebar}%` }} />)}
        </colgroup>
        <thead>
          <tr className="text-center font-semibold">
            {grup.map((g, i) => g.judul
              ? <th key={i} className={WRAP} colSpan={g.kolom.length}>{g.judul}</th>
              : <th key={i} className={WRAP} rowSpan={2}>{g.kolom[0].judul}</th>)}
          </tr>
          <tr className="text-center font-semibold">
            {grup.filter(g => g.judul).flatMap(g =>
              g.kolom.map(k => <th key={k.key} className={WRAP}>{k.judul}</th>))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id} className="align-top">
              {f.kolom.map(k => (
                <td key={k.key}
                  className={`${SEL_ISI} ${rata(k)} ${
                    k.key === 'nibar' ? 'break-all tracking-tighter text-[6.5px]'
                      : k.rata === 'tengah' ? 'whitespace-nowrap' : '[overflow-wrap:anywhere]'}`}>
                  {isi(k, r, i)}
                </td>
              ))}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><td colSpan={f.kolom.length} className="border border-black px-1 py-3 text-center">
              Tidak ada pengamanan yang berlaku pada periode ini.
            </td></tr>
          )}
        </tbody>
      </table>
      <BlokTtd sebutan={sebutan} nama={ttd?.nama || null} nip={ttd?.nip || null} tgl={tglTtd} />
    </section>
  )
}
