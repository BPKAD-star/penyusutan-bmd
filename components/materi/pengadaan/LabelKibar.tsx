'use client'
// Materi "Entry Belanja Modal · Pengadaan" — slide label barang & KIBAR (permintaan
// user 2026-10-07): sesudah barang tercatat, ia bisa diberi label QR yang
// dipindai menuju KIBAR. Tiruan layar, bukan data produksi.
//
// ⚠️ Isi label disalin dari components/kibar/LabelSheet.tsx (SKPD, Spesifikasi
// Nama Barang, Merek/Tipe, NIBAR, tanggal perolehan) dan isi kartu dari
// app/kibar/[nibar]/page.tsx (kop, I Unit Pemakai, II Data Barang). Kalau
// keduanya berubah, slide ini disesuaikan. QR di sini GAMBAR hiasan (acak
// bersemai), BUKAN kode yang bisa dipindai.
import type { ReactNode } from 'react'
import { SlideTerang, Poin, Tbl, d } from '../bagian'
import { MATERI, Contoh } from './bahan'

/** QR hiasan 21×21: tiga pola sudut + sel acak bersemai (deterministik → tak berkedip antar render). */
function QrHiasan({ ukuran }: { ukuran: number }) {
  const N = 21
  const sel: ReactNode[] = []
  let s = 7
  const acak = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff }
  const sudut = (x: number, y: number) => (x < 7 && y < 7) || (x >= N - 7 && y < 7) || (x < 7 && y >= N - 7)
  const pola = (x: number, y: number) => {
    const px = x >= N - 7 ? x - (N - 7) : x, py = y >= N - 7 ? y - (N - 7) : y
    const tepi = px === 0 || px === 6 || py === 0 || py === 6
    return tepi || (px >= 2 && px <= 4 && py >= 2 && py <= 4)
  }
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const isi = sudut(x, y) ? pola(x, y) : acak() > 0.52
    if (isi) sel.push(<rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" />)
  }
  return (
    <svg width={ukuran} height={ukuran} viewBox={`-1 -1 ${N + 2} ${N + 2}`} className="bg-white flex-shrink-0" fill="#111827" shapeRendering="crispEdges" aria-hidden>{sel}</svg>
  )
}

function Baris({ k, v }: { k: string; v: ReactNode }) {
  return <p className="flex text-[11.5px] leading-[1.7]"><span className="w-[170px] flex-shrink-0 text-gray-500">{k}</span><span className="text-gray-400 pr-1.5">:</span><span className="text-gray-800 min-w-0">{v}</span></p>
}

const Bagian = ({ no, judul, children }: { no: string; judul: string; children: ReactNode }) => (
  <div className="border-t border-gray-200">
    <p className="bg-gray-100 px-3 py-1 text-[12px] font-bold text-gray-800">{no}. {judul}</p>
    <div className="px-3 py-1.5">{children}</div>
  </div>
)

export function LabelKibar() {
  return (
    <SlideTerang materi={MATERI} label="Sesudah tercatat" judul="Label barang & KIBAR">
      {/* ── 1. Label ── */}
      <div className="absolute left-0 top-0 w-[440px]">
        <p className="mt-in text-[13px] font-bold tracking-[0.12em] uppercase text-teal" style={d(200)}>1 · Label barang</p>
        <div className="mt-pop mt-2 flex items-center gap-3 rounded-lg border border-gray-400 bg-white p-3 shadow-lg" style={d(350)}>
          <QrHiasan ukuran={96} />
          <div className="min-w-0 text-[13px] leading-snug text-gray-700">
            <p className="font-bold text-gray-900">Badan Keuangan dan Aset Daerah</p>
            <p className="text-gray-900">Laptop ASUS Vivobook 14</p>
            <p className="text-gray-500">ASUS X1404</p>
            <p className="text-[9.5px] text-gray-600 break-all leading-tight">1201350620000000000000002026131010307003000001</p>
            <p className="text-gray-500">14/08/2026</p>
          </div>
        </div>
        <div className="mt-5 space-y-3.5">
          <Poin jeda={650}>Dicetak dari <b>Daftar Barang</b>: centang barang di kolom <b>KIBAR</b>, lalu tekan <Tbl>Cetak Label</Tbl>.</Poin>
          <Poin jeda={850}>Satu halaman A4 memuat <b>16 label</b> — tempelkan di barangnya.</Poin>
          <Poin jeda={1050}>Barang <b>tanpa NIBAR</b> belum bisa dilabel — NIBAR terbit saat kartu disetujui.</Poin>
        </div>
      </div>

      {/* ── penghubung ── */}
      <div className="mt-in absolute left-[452px] top-[88px] w-[78px] flex flex-col items-center text-teal" style={d(1100)}>
        <span className="text-[34px] leading-none font-bold">›</span>
        <span className="text-[12px] font-bold uppercase tracking-wide">scan QR</span>
      </div>

      {/* ── 2. KIBAR ── */}
      <div className="absolute right-0 top-0 w-[600px]">
        <p className="mt-in text-[13px] font-bold tracking-[0.12em] uppercase text-teal" style={d(500)}>2 · KIBAR — halaman publik, tanpa login</p>
        <div className="mt-kanan relative mt-2 h-[430px] overflow-hidden rounded-lg border border-gray-300 bg-white shadow-xl" style={d(650)}>
          <div className="grid grid-cols-[52px_1fr_52px] items-center gap-3 px-3 py-2.5 border-b-2 border-gray-800">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-kab-kediri.png" alt="" className="w-full h-auto object-contain" />
            <div className="text-center">
              <p className="text-[14px] font-bold text-gray-900 tracking-wide">KARTU IDENTITAS BARANG (KIBAR)</p>
              <p className="text-[11.5px] font-semibold text-gray-700">1.3.2 Peralatan dan Mesin</p>
              <p className="text-[11px] text-gray-600">PEMERINTAH KABUPATEN KEDIRI</p>
            </div>
            <QrHiasan ukuran={52} />
          </div>
          <Bagian no="I" judul="Unit Pemakai">
            <Baris k="1. Kuasa Pengguna Barang" v="Bagian Umum" />
            <Baris k="2. Pengguna Barang" v="Badan Keuangan dan Aset Daerah" />
            <Baris k="3. Pengelola Barang" v="Badan Keuangan dan Aset Daerah (BKAD)" />
          </Bagian>
          <Bagian no="II" judul="Data Barang">
            <Baris k="1. Kode Barang" v="1.3.2.10.01.02.002" />
            <Baris k="3. Kode Register Barang" v="1201350620000000…" />
            <Baris k="4. Uraian Barang" v="Lap Top" />
            <Baris k="5. Nama Barang" v="Laptop ASUS Vivobook 14" />
            <Baris k="9. Nilai Perolehan" v="Rp12.500.000" />
            <Baris k="10. Kondisi Barang" v="Baik" />
          </Bagian>
          <div className="absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-white to-transparent" />
          <p className="absolute inset-x-0 bottom-1.5 text-center text-[11.5px] font-semibold text-gray-500">… III Penerimaan Awal · IV–XI Penggunaan s.d. Penghapusan · Foto · Riwayat Transaksi</p>
        </div>
      </div>
      <Contoh />
    </SlideTerang>
  )
}
