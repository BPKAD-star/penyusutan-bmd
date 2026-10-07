'use client'
// Materi "Entry Belanja Modal · Pengadaan" — slide penutup jalur Non Konstruksi:
// tampilan SATU KONTRAK UTUH sesudah disetujui (permintaan user 2026-10-07,
// mengikuti tangkapan layar menu Pengadaan). Tiruan layar, bukan data produksi.
//
// Nomor bulat 1–4 menautkan tiap bagian kartu ke langkah entry-nya (Buat Kontrak,
// BAST, Tambah Barang, Spesifikasi & Foto). Label kolom & tombol DISALIN dari
// components/pengelolaan/Pengadaan.tsx — kalau di aplikasi diganti, ikut diganti.
import type { ReactNode } from 'react'
import { SlideTerang, d } from '../bagian'
import { MATERI, Tombol, Lencana, FotoMini, Contoh } from './bahan'

const Nomor = ({ n, className = '' }: { n: number; className?: string }) => (
  <span className={`absolute w-6 h-6 rounded-full bg-navy text-white text-[12px] font-bold flex items-center justify-center ring-2 ring-white shadow ${className}`}>{n}</span>
)

function Baris({ k, v }: { k: string; v: ReactNode }) {
  return <p className="flex gap-2"><span className="w-[92px] flex-shrink-0 text-gray-400">{k}</span><span className="text-gray-700">: {v}</span></p>
}

const KOLOM = ['Kode Rekening', 'Kode Barang', 'Spesifikasi Nama Barang', 'Merk/Tipe', 'Spesifikasi Lainnya', 'No. Seri', 'Tgl Perolehan', 'Jumlah', 'Nilai', 'Foto', 'Komptabel']

const BARANG = [
  { seri: 'ABC123456', foto: true },
  { seri: 'ABC123457', foto: true },
  { seri: 'ABC123458', foto: true },
]

export function KontrakLengkap() {
  return (
    <SlideTerang materi={MATERI} label="Non Konstruksi · Hasil" judul="Satu kontrak utuh — sesudah disetujui">
      <div className="absolute inset-x-0 top-0">
        <span className="mt-in inline-flex items-center gap-1.5 rounded-full bg-teal/10 border border-teal/30 px-3 py-0.5 text-[12px] font-semibold text-teal" style={d(200)}>📦 Non Konstruksi</span>

        <div className="mt-up relative mt-3 rounded-xl border border-gray-200 bg-white shadow-xl" style={d(300)}>
          <div className="grid grid-cols-[1fr_1fr_190px] gap-4 p-4">
            <div className="relative rounded-lg border border-gray-200 p-3 text-[11.5px] leading-[1.55]">
              <Nomor n={1} className="-top-3 -left-3" />
              <p className="text-[10.5px] font-bold text-gray-700 mb-0.5">KONTRAK <span className="font-normal text-gray-400">· 2026-S2</span></p>
              <Baris k="Jenis Kontrak" v="Surat Perintah Kerja (SPK)" />
              <Baris k="Nomor Kontrak" v="027/123/418.xx/2026" />
              <Baris k="Tanggal Kontrak" v="2026-08-03" />
              <Baris k="Sub Kegiatan" v="Pengadaan Peralatan dan Mesin Lainnya" />
              <Baris k="Nama Penyedia" v="CV Maju Jaya" />
              <Baris k="Nama PPK" v="Nama Pejabat, S.E., M.M." />
            </div>
            <div className="relative rounded-lg border border-gray-200 p-3 text-[11.5px] leading-[1.55]">
              <Nomor n={2} className="-top-3 -left-3" />
              <p className="text-[10.5px] font-bold text-gray-700 mb-0.5">BAST</p>
              <Baris k="Nomor BAST" v="BAST/045/2026" />
              <Baris k="Tanggal BAST" v="2026-08-14" />
              <Baris k="Keterangan" v="Penyerahan barang dalam keadaan baik" />
              <p className="mt-1 text-gray-400">Dokumen: <span className="text-teal underline">BAST-045-2026.pdf</span></p>
              <p className="text-teal">Disetujui 2026-08-20</p>
            </div>
            <div className="flex flex-col items-end justify-between">
              <div className="text-right"><p className="text-[10.5px] text-gray-400">Total Pengadaan</p><p className="text-[17px] font-bold text-navy">37.500.000,00</p></div>
              <div className="flex flex-col gap-1.5 w-full">
                <Tombol className="justify-center">📜 Surat Pernyataan</Tombol>
                <Tombol gaya="kuning" className="justify-center">🔓 Buka Kunci</Tombol>
              </div>
            </div>
          </div>

          <div className="relative border-t border-gray-100">
            <Nomor n={3} className="-top-3 -left-3" />
            <Nomor n={4} className="-top-3 right-[205px]" />
            <table className="w-full text-[11.5px]">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>{KOLOM.map(k => <th key={k} className="px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-gray-500">{k}</th>)}</tr>
              </thead>
              <tbody>
                {BARANG.map((b, i) => (
                  <tr key={b.seri} className="mt-up border-b border-gray-50 last:border-0" style={d(700 + i * 180)}>
                    <td className="px-2 py-1.5 text-gray-700">5.2.02.10.002.00003<p className="text-[10px] text-gray-400">Belanja Modal Komputer</p></td>
                    <td className="px-2 py-1.5 text-gray-700 font-medium">1.3.2.10.01.02.002<p className="text-[10px] font-normal text-gray-400">Lap Top</p></td>
                    <td className="px-2 py-1.5 text-gray-700">Laptop ASUS Vivobook 14</td>
                    <td className="px-2 py-1.5 text-gray-600">ASUS X1404</td>
                    <td className="px-2 py-1.5 text-gray-600">Core i5 · RAM 16 GB · SSD 512 GB</td>
                    <td className="px-2 py-1.5 text-gray-600">{b.seri}</td>
                    <td className="px-2 py-1.5 text-gray-600 whitespace-nowrap">2026-08-14</td>
                    <td className="px-2 py-1.5 text-center text-gray-600">1<p className="text-[10px] text-gray-400">Unit</p></td>
                    <td className="px-2 py-1.5 text-right text-gray-700 whitespace-nowrap">12.500.000,00</td>
                    <td className="px-2 py-1.5 text-center"><FotoMini kosong={!b.foto} ukuran={30} /></td>
                    <td className="px-2 py-1.5 text-center text-gray-600">Intra</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-in mt-3 flex items-center gap-6 text-[14px] text-gray-600" style={d(1400)}>
          <span><b className="text-navy">1</b> Buat Kontrak</span>
          <span><b className="text-navy">2</b> Isi dan Upload BAST</span>
          <span><b className="text-navy">3</b> Tambah Barang</span>
          <span><b className="text-navy">4</b> Edit Spesifikasi &amp; Foto</span>
          <span className="ml-auto"><Lencana nada="ok">TERKUNCI</Lencana></span>
        </div>
      </div>
      <Contoh />
    </SlideTerang>
  )
}
