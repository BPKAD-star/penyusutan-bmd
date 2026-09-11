'use client'
// Pratinjau ON-SCREEN Format IV.L.4.2 (per SKPD) / IV.L.4.4 (se-pemda) — tab
// "Rekapitulasi BMD" di menu Laporan BMD (relabeling 2026-09-11, permintaan
// user: "ketika diproses itu langsung nampilin sesuai format permendagri aja").
//
// ⚠️ TANPA blok tanda tangan, SENGAJA — pola yang sama dengan
// KoreksiFormatPermendagri/ReklasFormatPermendagri/dst: pratinjau di layar
// menjawab "bagaimana bentuk lembarnya", bukan "siapa yang menandatangani".
// Penanda tangan tetap ditanyakan di halaman /cetak/laporan-bmd(-pemda) yang
// SUDAH ADA (tak disentuh sama sekali) — angkanya cuma satu panggilan RPC
// (`fn_rekap_bmd`), jadi aman direcompute di rute terpisah tanpa risiko
// menyimpang dari yang dilihat operator di layar (beda dari Mutasi, yang
// dirender in-page karena angkanya mahal — lihat LembarMutasiBmd).
import TabelLaporanBmd from './TabelLaporanBmd'
import { pecahPeriode, labelKomptabel, type UkuranGolongan } from '@/lib/laporanBmdFormat'

const PROVINSI = 'Jawa Timur'
const KABUPATEN = 'Kediri'

export default function PratinjauLaporanBmd({ periode, komptabel, peta, namaSkpd }: {
  periode: string
  komptabel: string
  peta: Map<string, UkuranGolongan>
  /** `null` = lingkup se-Kabupaten (IV.L.4.4), sesuai SKPD yang dipilih di filter. */
  namaSkpd: string | null
}) {
  const { semester, tahun } = pecahPeriode(periode)
  return (
    <div className="card p-4">
      <div className="overflow-x-auto">
        <div className="min-w-[600px] bg-white p-4 text-[11px] text-black">
          <div className="text-center leading-tight mb-4">
            <p className="font-bold text-[13px]">LAPORAN BMD</p>
            <p className="font-bold text-[12px]">{labelKomptabel(komptabel)}</p>
            <p className="font-bold text-[12px] uppercase">
              {namaSkpd || `Provinsi ${PROVINSI}, Kabupaten ${KABUPATEN}`}
            </p>
            <p className="font-bold text-[12px]">SEMESTER {semester || '……'}</p>
            <p className="font-bold text-[12px]">TAHUN {tahun || '……'}</p>
          </div>
          <TabelLaporanBmd peta={peta} />
        </div>
      </div>
    </div>
  )
}
