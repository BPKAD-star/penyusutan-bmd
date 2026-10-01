'use client'
// ============================================================================
// PENYAJI lembar PEMANFAATAN — Laporan Pemanfaatan BMD (tabel datar 15 kolom).
//
// Murni tampilan — nol query, nol state. Barisnya dirakit
// `muatLaporanPemanfaatanPermendagri` (lib/laporanPemanfaatanPermendagri.ts),
// susunan kolomnya dari `FORMAT_PEMANFAATAN` (lib/formatPemanfaatan.ts).
//
// Pola PERSIS lembar Pengamanan/Penghapusan/Perpindahan: baris kelompok per
// golongan, "Total <jenis>", "TOTAL", NIBAR 9px, nominal 2 desimal.
//
// ⚠️ BEDA dgn Pengamanan: golongannya TIDAK satu — Pemanfaatan boleh atas
// Gedung & Bangunan, Aset Lain-Lain, plus kartu lama atas golongan yang sudah
// dicabut dari cakupan. Kelompoknya karena itu dibentuk dari data, bukan dari
// registry.
//
// ⚠️ Total dijumlah SEKALI per barang (`jumlahNilaiPerolehan`): satu barang bisa
// muncul di dua baris kalau dua perjanjian beririsan di periode yang sama, dan
// nilai perolehan itu milik BARANG, bukan perjanjian.
// ============================================================================
import { pecahNibar } from '@/lib/kodeRegister'
import { tglPanjang } from '@/lib/beritaAcaraRekon'
import { formatRupiah2 } from '@/lib/export'
import { GOLONGAN_REKAP, kodeLevel3 } from '@/lib/bmd'
import { JENIS_PEMANFAATAN_LABEL } from '@/lib/pemanfaatan'
import {
  type FormatPemanfaatan, type KolomRinciPemanfaatan,
} from '@/lib/formatPemanfaatan'
import {
  jumlahNilaiPerolehan, asetKembar, type BarisPemanfaatanLembar,
} from '@/lib/laporanPemanfaatanPermendagri'

const KABUPATEN = 'Kediri'
const PROVINSI = 'Jawa Timur'
const CETAK_WARNA = '[print-color-adjust:exact] [-webkit-print-color-adjust:exact]'
const SEL = 'border border-black px-1.5 py-1'

const tglID = (s: string | null | undefined) => {
  if (!s) return ''
  const [y, m, d] = s.slice(0, 10).split('-')
  return y && m && d ? `${d}/${m}/${y}` : s
}

function KopLembar({ judul, kode, sebutan, skpd, periode, tahun }: {
  judul: string; kode: string; sebutan: string
  skpd: { kode: string; nama: string } | null
  periode: string; tahun: string
}) {
  return (
    <>
      {/* Logo kiri + spacer kanan selebar sama — pola kop seluruh keluarga lembar.
          Penanda (1)…(5) TIDAK dicetak (keputusan user 2026-08-30). */}
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
      {/* Nomor format dicetak HANYA kalau memang sudah diketahui — lihat kepala
          lib/formatPemanfaatan.ts. Jangan dikarang. */}
      {kode && <p className="text-right text-[12px] mb-1">Format {kode}</p>}
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

export type PropLembarPemanfaatan = {
  f: FormatPemanfaatan
  rows: BarisPemanfaatanLembar[]
  skpd: { kode: string; nama: string } | null
  judulPeriode: string
  tahun: string
  sebutan: string
  ttd: { nama: string; nip: string | null } | null
  tglTtd: string
}

/** Keterangan = isian kotak Keterangan di KARTU dulu (kartu menang, pola keluarga
 *  lembar lain). Pemanfaatan SEBAGIAN diberi penanda di depannya — tanpa itu
 *  lembar menyatakan seluruh gedung disewakan padahal cuma satu ruang. */
export function keteranganPemanfaatan(r: BarisPemanfaatanLembar): string {
  const dasar = r.header.keterangan || r.aset.keterangan || ''
  if (r.lingkup !== 'sebagian') return dasar
  const sebagian = `Sebagian${r.bagian ? `: ${r.bagian}` : ''}`
  return dasar ? `${sebagian}. ${dasar}` : sebagian
}

type Kelompok = { kode: string; nama: string; rows: BarisPemanfaatanLembar[] }

/** Kelompokkan per golongan (3 segmen kode) yang ADA di data, urut kode. */
export function kelompokPemanfaatan(rows: BarisPemanfaatanLembar[]): Kelompok[] {
  const peta = new Map<string, BarisPemanfaatanLembar[]>()
  for (const r of rows) {
    const g = kodeLevel3(r.aset.kode || '')
    const l = peta.get(g); if (l) l.push(r); else peta.set(g, [r])
  }
  return [...peta.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([kode, rs]) => ({
      kode, rows: rs,
      nama: GOLONGAN_REKAP.find(g => g.kode === kode)?.uraian || '',
    }))
}

export default function LembarPemanfaatanPermendagri(p: PropLembarPemanfaatan) {
  const { f, rows, skpd, judulPeriode, tahun, sebutan, ttd, tglTtd } = p
  const kolom = f.kolom
  const nKolom = kolom.length
  const iUang = kolom.findIndex(k => k.key === 'nilai_perolehan')
  const nSisa = nKolom - iUang - 1
  const kelompok = kelompokPemanfaatan(rows)
  const kembar = asetKembar(rows)

  const isiKolom = (k: KolomRinciPemanfaatan, r: BarisPemanfaatanLembar): React.ReactNode => {
    const a = r.aset
    const pl = r.header.payload || {}
    switch (k.key) {
      case 'nibar': {
        const pc = pecahNibar(a.nibar)
        return pc ? <>{pc[0]}<br />{pc[1]}</> : (a.nibar || '')
      }
      // Uraian = NOMENKLATUR BAKU kodefikasi; "Nama Barang" = spesifikasi nama
      // yang diketik operator — dua hal berbeda, jangan digabung.
      case 'kode': return <>{a.kode || ''}<br />{a.uraian_barang || ''}</>
      case 'nama': return a.nama_barang || ''
      case 'merek': return a.merek_tipe || ''
      case 'no_polisi': return a.no_polisi || ''
      case 'lokasi': return a.alamat_detail || ''
      // Nilai PEROLEHAN BARANG (register) — BUKAN nominal pemanfaatan (nilai
      // sewa); yang kedua tak punya kolom di lembar ini.
      case 'nilai_perolehan': return formatRupiah2(a.nilai_perolehan ?? 0)
      case 'jenis': return JENIS_PEMANFAATAN_LABEL[pl.jenis_pemanfaatan || ''] || pl.jenis_pemanfaatan || ''
      case 'mitra': return pl.mitra || ''
      case 'jangka': return pl.masa_tahun ? `${pl.masa_tahun} tahun` : ''
      case 'mulai': return tglID(pl.mulai)
      case 'berakhir': return tglID(pl.berakhir)
      // Dokumen sumber = dokumen perjanjiannya, yaitu kartu jurnal ini sendiri.
      case 'dok_nomor': return r.header.no_sk || ''
      case 'dok_tanggal': return tglID(r.header.tanggal)
      case 'keterangan': return keteranganPemanfaatan(r)
      default: return ''
    }
  }

  const rata = (k: KolomRinciPemanfaatan) =>
    k.rata === 'kanan' ? 'text-right' : k.rata === 'tengah' ? 'text-center' : ''

  return (
    <section>
      <KopLembar judul={f.judul} kode={f.kode} sebutan={sebutan} skpd={skpd}
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
          {kelompok.map(g => (
            <KelompokRows key={g.kode} g={g} kolom={kolom} nKolom={nKolom}
              iUang={iUang} nSisa={nSisa} rata={rata} isiKolom={isiKolom} />
          ))}
          {rows.length > 0 && (
            <tr className={`font-bold bg-gray-200 ${CETAK_WARNA}`}>
              <td className={`${SEL} text-right`} colSpan={iUang}>TOTAL</td>
              <td className={`${SEL} text-right [overflow-wrap:anywhere]`}>{formatRupiah2(jumlahNilaiPerolehan(rows))}</td>
              <td className={SEL} colSpan={nSisa} />
            </tr>
          )}
          {rows.length === 0 && (
            <tr><td colSpan={nKolom} className={`${SEL} py-3 text-center`}>{f.kosong}</td></tr>
          )}
        </tbody>
      </table>
      {kembar.size > 0 && (
        <p className="text-[9px] mt-1 text-gray-600">
          Catatan: {kembar.size.toLocaleString('id-ID')} barang tercantum pada lebih dari satu
          perjanjian dalam periode ini; Nilai Perolehan-nya dijumlahkan satu kali pada Total.
        </p>
      )}
      <BlokTtd sebutan={sebutan} nama={ttd?.nama || null} nip={ttd?.nip || null} tgl={tglTtd} />
    </section>
  )
}

function KelompokRows({ g, kolom, nKolom, iUang, nSisa, rata, isiKolom }: {
  g: Kelompok
  kolom: KolomRinciPemanfaatan[]
  nKolom: number; iUang: number; nSisa: number
  rata: (k: KolomRinciPemanfaatan) => string
  isiKolom: (k: KolomRinciPemanfaatan, r: BarisPemanfaatanLembar) => React.ReactNode
}) {
  return (
    <>
      <tr className={`font-semibold bg-teal/5 ${CETAK_WARNA}`}>
        <td className={SEL} colSpan={nKolom}>{g.kode}{g.nama ? ` — ${g.nama}` : ''}</td>
      </tr>
      {g.rows.map(r => (
        <tr key={r.key} className="align-top">
          {kolom.map(k => (
            <td key={k.key}
              // NIBAR 9px supaya potongan 26 digitnya muat sebaris.
              className={`${SEL} ${rata(k)} ${
                k.key === 'nibar' ? 'break-all tracking-tighter text-[9px]'
                  : k.rata === 'tengah' || k.rata === 'kanan' ? 'whitespace-nowrap' : '[overflow-wrap:anywhere]'}`}>
              {isiKolom(k, r)}
            </td>
          ))}
        </tr>
      ))}
      <tr className={`font-semibold bg-gray-100 ${CETAK_WARNA}`}>
        <td className={`${SEL} text-right`} colSpan={iUang}>Total {g.kode}{g.nama ? ` ${g.nama}` : ''}</td>
        <td className={`${SEL} text-right [overflow-wrap:anywhere]`}>{formatRupiah2(jumlahNilaiPerolehan(g.rows))}</td>
        <td className={SEL} colSpan={nSisa} />
      </tr>
    </>
  )
}
