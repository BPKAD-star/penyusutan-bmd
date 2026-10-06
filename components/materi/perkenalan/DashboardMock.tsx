'use client'
// Tiruan layar DASHBOARD aplikasi (slide "1. Dashboard"): 8 kotak jenis aset,
// 5 cara perolehan, 4 mutasi & transfer, 5 penghapusan, dan 1 kotak Indeks IPA —
// disusun SAMA dgn app/dashboard/page.tsx, dan memakai ilustrasi aslinya
// (public/dashboard/*.webp). Dimampatkan ke area ±948×474 px.
//
// ⚠️ Label kotak DISALIN dari components/dashboard/*Cards.tsx & DashboardView.tsx
// (judul seksi, nama kartu, "N disetujui / N menunggu"). Angkanya ILUSTRASI:
// nilai per jenis aset diambil dari rekap saldo awal supaya senada dengan slide
// sesudahnya; kotak lain angka contoh. Kalau susunan Dashboard di aplikasi
// berubah, sesuaikan di sini — tak ada test yang menjaganya.
import { d } from '../bagian'
import { GaugeIndeks } from '@/components/ipa/GaugeIndeks'

/* eslint-disable @next/next/no-img-element -- berkas statis; ini tiruan layar, bukan halaman aplikasi */

const JENIS: [string, string, string, string, string][] = [
  ['1.3.1', 'Tanah', '1.156.309.715.727,16', '2.732', 'aset-1-3-1'],
  ['1.3.2', 'Peralatan dan Mesin', '1.405.199.655.505,97', '660.470', 'aset-1-3-2'],
  ['1.3.3', 'Gedung dan Bangunan', '2.134.344.993.957,62', '8.350', 'aset-1-3-3'],
  ['1.3.4', 'Jalan, Jaringan dan Irigasi', '3.778.566.895.300,36', '8.127', 'aset-1-3-4'],
  ['1.3.5', 'Aset Tetap Lainnya', '173.260.204.231,82', '173.929', 'aset-1-3-5'],
  ['1.3.6', 'Konstruksi Dalam Pengerjaan', '195.710.710.149,00', '233', 'aset-1-3-6'],
  ['1.5.3', 'Aset Tidak Berwujud', '17.239.249.988,00', '120', 'aset-1-5-3'],
  ['1.5.4', 'Aset Lain-Lain', '124.500.266.399,63', '50.479', 'aset-1-5-4'],
]

const CARA: [string, string, number, number, string][] = [
  ['Pengadaan', 'Rp4.812.300.000', 412, 18, 'cara-pengadaan'],
  ['Hibah', 'Rp2.140.000.000', 96, 4, 'cara-hibah'],
  ['Tukar Menukar', 'Rp310.500.000', 12, 0, 'cara-tukar-menukar'],
  ['Hasil Inventarisasi', 'Rp95.200.000', 30, 9, 'cara-hasil-inventarisasi'],
  ['Perolehan Lainnya', 'Rp40.000.000', 8, 2, 'cara-perolehan-lainnya'],
]

const MUTASI: [string, number, number, string][] = [
  ['Transfer Keluar SKPD', 57, 3, 'transfer-skpd'],
  ['Transfer Masuk SKPD', 57, 3, 'transfer-skpd'],
  ['Pengeluaran Internal', 41, 2, 'internal-skpd'],
  ['Penerimaan Internal', 41, 2, 'internal-skpd'],
]

const HAPUS: [string, string, number, string, string][] = [
  ['Karena Hibah', 'Rp120.000.000', 3, 'hapus-hibah', ''],
  ['Karena Penjualan', 'Rp85.500.000', 5, 'hapus-penjualan', ''],
  ['Karena Tukar Menukar', 'Rp0', 0, 'hapus-tukar-menukar', ''],
  ['Karena Penyertaan Modal', 'Rp0', 0, 'hapus-penyertaan-modal', ''],
  ['Karena Sebab Lainnya', 'Rp26.400.000', 4, 'hapus-sebab-lain', 'Force majeure, dsb.'],
]

const Gambar = ({ nama, kelas }: { nama: string; kelas: string }) => (
  <img src={`/dashboard/${nama}.webp`} alt="" aria-hidden width={110} height={84} draggable={false}
    className={`object-contain object-right drop-shadow-[0_2px_3px_rgba(15,23,42,0.18)] ${kelas}`} />
)

function Donut({ setuju, tunggu }: { setuju: number; tunggu: number }) {
  const total = setuju + tunggu
  const pct = total === 0 ? 100 : Math.round((setuju / total) * 100)
  return (
    <span className="relative flex-shrink-0 w-[26px] h-[26px] rounded-full" style={{ background: `conic-gradient(#0d9488 ${pct}%, #fbbf24 ${pct}% 100%)` }}>
      <span className="absolute inset-[3px] rounded-full bg-white flex items-center justify-center text-[7px] font-semibold text-gray-700">{pct}%</span>
    </span>
  )
}

function KotakDonut({ judul, nilai, setuju, tunggu, gambar, bg, jeda }: {
  judul: string; nilai?: string; setuju: number; tunggu: number; gambar: string; bg: string; jeda: number
}) {
  return (
    <div className={`mt-pop rounded-lg border border-gray-100 shadow-sm px-2.5 py-2 flex items-center gap-1.5 min-w-0 ${bg}`} style={d(jeda)}>
      <div className="flex-1 min-w-0">
        <p className="text-[9px] leading-tight text-gray-600 truncate">{judul}</p>
        {nilai && <p className="text-[9.5px] font-bold text-teal leading-tight truncate">{nilai}</p>}
        <div className="mt-1 flex items-center gap-1.5">
          <Donut setuju={setuju} tunggu={tunggu} />
          <div className="text-[8px] leading-[1.35] text-gray-700 whitespace-nowrap">
            <p className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-teal" />{setuju.toLocaleString('id-ID')} disetujui</p>
            <p className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-amber-400" />{tunggu.toLocaleString('id-ID')} menunggu</p>
          </div>
        </div>
      </div>
      <Gambar nama={gambar} kelas="w-[34px] h-[30px] flex-shrink-0" />
    </div>
  )
}

const Judul = ({ children }: { children: string }) => <p className="text-[11px] font-semibold text-gray-800 mb-1">{children}</p>

export function DashboardMock() {
  return (
    <div className="absolute inset-0 rounded-xl bg-gray-50 border border-gray-200 shadow-xl overflow-hidden px-3 py-2.5">
      <div className="mt-in flex items-start justify-between" style={d(250)}>
        <p className="text-[20px] font-bold text-gray-900 leading-none">Dashboard</p>
        <div className="text-right leading-tight">
          <p className="text-[8.5px] text-gray-400">Total Nilai BMD</p>
          <p className="text-[13px] font-bold text-teal">Rp8.985.131.691.259,56</p>
          <p className="text-[8.5px] text-gray-400">904.440 aset</p>
        </div>
      </div>

      <div className="mt-1.5">
        <Judul>Total Aset per Jenis</Judul>
        <div className="grid grid-cols-4 gap-1.5">
          {JENIS.map(([kode, uraian, nilai, unit, gambar], i) => (
            <div key={kode} className="mt-pop relative overflow-hidden rounded-lg border border-gray-100 bg-white shadow-sm h-[56px] px-2.5 py-1.5 flex gap-1" style={d(350 + i * 60)}>
              <svg aria-hidden viewBox="0 0 1920 1080" preserveAspectRatio="xMaxYMid slice" className="absolute inset-0 w-full h-full">
                <path fill="#ECFBF1" d="M1470,0 C1400,210 1160,330 960,460 C790,570 700,760 700,1080 L1920,1080 L1920,0 Z" />
                <path fill="#CDF1D9" d="M1480,0 C1420,230 1190,380 1070,520 C985,620 985,820 990,1080 L1920,1080 L1920,0 Z" />
              </svg>
              <div className="relative z-10 flex flex-col justify-between min-w-0 flex-1">
                <div>
                  <p className="text-[8.5px] text-gray-700 leading-tight whitespace-nowrap"><span className="text-gray-400">{kode}</span> · {uraian}</p>
                  <p className="text-[10.5px] font-bold text-teal leading-tight whitespace-nowrap">{nilai}</p>
                </div>
                <p className="text-[13px] font-bold text-gray-900 leading-none">{unit} <span className="text-[8px] font-normal text-gray-500">unit</span></p>
              </div>
              <Gambar nama={gambar} kelas="relative w-[46px] h-[40px] self-center flex-shrink-0" />
            </div>
          ))}
        </div>
      </div>

      <div className="mt-2 grid grid-cols-[1fr_150px] gap-2">
        <div className="space-y-1.5 min-w-0">
          <div>
            <Judul>Total Barang per Cara Perolehan</Judul>
            <div className="grid grid-cols-5 gap-1.5">
              {CARA.map(([j, n, s, t, g], i) => <KotakDonut key={j} judul={j} nilai={n} setuju={s} tunggu={t} gambar={g} bg="bg-[#f4fff7]" jeda={900 + i * 60} />)}
            </div>
          </div>
          <div>
            <Judul>Mutasi &amp; Transfer</Judul>
            <div className="grid grid-cols-4 gap-1.5">
              {MUTASI.map(([j, s, t, g], i) => <KotakDonut key={j} judul={j} setuju={s} tunggu={t} gambar={g} bg="bg-white" jeda={1250 + i * 60} />)}
            </div>
          </div>
          <div>
            <Judul>Penghapusan Barang</Judul>
            <div className="grid grid-cols-5 gap-1.5">
              {HAPUS.map(([j, nilai, n, g, cat], i) => (
                <div key={j} className="mt-pop rounded-lg border border-gray-100 shadow-sm bg-[#fff5f5] px-2.5 py-2 flex items-center gap-1 min-w-0 h-[52px]" style={d(1550 + i * 60)}>
                  <div className="flex-1 min-w-0 flex flex-col justify-between self-stretch">
                    <div>
                      <p className="text-[8.5px] text-gray-700 leading-tight truncate">{j}</p>
                      <p className="text-[9px] font-bold text-rose-600 leading-tight truncate">{nilai}</p>
                      {cat && <p className="text-[7px] text-gray-400 leading-tight truncate">{cat}</p>}
                    </div>
                    <p className="text-[13px] font-bold text-gray-900 leading-none">{n}</p>
                  </div>
                  <Gambar nama={g} kelas="w-[32px] h-[28px] flex-shrink-0" />
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="mt-pop flex flex-col" style={d(1800)}>
          <Judul>Indeks Pengelolaan Aset</Judul>
          <div className="flex-1 rounded-lg border border-gray-100 bg-white shadow-sm flex flex-col items-center justify-center px-1">
            <GaugeIndeks nilai={3.32} kategori="Baik" label="Indeks Kabupaten" ukuran={130} />
            <p className="text-[8px] text-gray-400 mt-1">Tahun 2026 · lihat rincian →</p>
          </div>
        </div>
      </div>
    </div>
  )
}
