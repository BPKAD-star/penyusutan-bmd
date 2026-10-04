'use client'
// Materi "Perkenalan Aplikasi SMART Asset" — slide terakhir: langkah sesudah
// paparan & penutup (dengan QR menuju aplikasi). Slide "Aturan main" dicabut
// 2026-10-04 (tak ada di rekapan user).
import QRCode from 'qrcode'
import { SlideBersih, SlideTerang, Merek, Ikon, d } from '../bagian'
import { MATERI } from './Pembuka'

const TINDAK = [
  ['Login & periksa nama profil', 'pojok kanan atas layar'],
  ['Cocokkan Daftar Barang dengan kondisi sebenarnya', 'jenis, jumlah, dan kondisi barang'],
  ['Lengkapi titik koordinat seluruh tanah', 'menu GIS Tanah'],
  ['Lengkapi spesifikasi & foto barang', 'Edit Spesifikasi atau Koreksi'],
  ['Sampaikan kendala yang ditemui', 'chat di aplikasi atau menu Notes'],
]

export function Tindak() {
  return (
    <SlideTerang materi={MATERI} label="Tindak lanjut" judul="Langkah setelah paparan ini">
      <div className="absolute left-0 top-0 w-[660px]">
        <svg className="absolute left-[21px] top-[22px]" width="4" height="376" aria-hidden>
          <line x1="2" y1="0" x2="2" y2="376" stroke="#0d9488" strokeWidth="4" strokeOpacity=".3" pathLength={1} className="mt-gambar" style={{ ...d(300), animationDuration: '2.2s' }} />
        </svg>
        <div className="space-y-[22px]">
          {TINDAK.map(([judul, ket], i) => (
            <div key={judul} className="mt-kiri relative flex items-center gap-5" style={d(300 + i * 320)}>
              <span className="mt-pop w-[46px] h-[46px] rounded-full bg-teal text-white flex items-center justify-center flex-shrink-0 shadow-md" style={d(450 + i * 320)}>
                <Ikon nama="centang" ukuran={24} tebal={3} />
              </span>
              <div className="flex-1 rounded-xl border border-gray-200 bg-white shadow-sm px-5 py-3">
                <p className="text-[19.5px] font-bold text-navy leading-tight">{judul}</p>
                <p className="text-[15px] text-gray-500 mt-0.5">{ket}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-kanan absolute right-0 top-0 w-[440px] rounded-2xl bg-navy text-white p-8 shadow-2xl" style={d(900)}>
        <p className="text-[14px] font-semibold tracking-[0.18em] uppercase text-amber-300">Butuh bantuan?</p>
        <div className="mt-5 flex gap-4">
          <div className="relative w-14 h-14 flex-shrink-0">
            <span className="mt-riak mt-tak-cetak absolute inset-0 rounded-full bg-teal-light/40" />
            <div className="relative w-full h-full rounded-full bg-teal flex items-center justify-center"><Ikon nama="obrolan" ukuran={28} /></div>
          </div>
          <div>
            <p className="text-[20px] font-bold">Chat di aplikasi</p>
            <p className="text-[16px] text-white/70 leading-snug mt-1">Tombol bulat di pojok kanan bawah: tanya Asisten AI, grup, atau admin langsung.</p>
          </div>
        </div>
        <div className="mt-6 flex gap-4">
          <div className="w-14 h-14 rounded-full bg-white/[0.12] border border-white/20 flex items-center justify-center flex-shrink-0"><Ikon nama="lampu" ukuran={28} /></div>
          <div>
            <p className="text-[20px] font-bold">Saran & masukan</p>
            <p className="text-[16px] text-white/70 leading-snug mt-1 mb-2">Tulis di menu:</p>
            <span className="inline-flex items-center gap-1.5 text-[15px] font-semibold">
              <span className="px-2.5 py-1 rounded-md bg-white/[0.15]">Admin</span><span className="text-amber-300">›</span>
              <span className="px-2.5 py-1 rounded-md bg-white/[0.15]">Notes</span>
            </span>
          </div>
        </div>
      </div>
    </SlideTerang>
  )
}

const ALAMAT = 'https://bmdlastgame.vercel.app'

/** QR dirakit SINKRON dari matriks modul (`QRCode.create`) jadi SVG — tanpa
 *  efek/async, sehingga ikut tercetak ke PDF & tak bergantung pada peramban. */
function KodeQr({ teks, ukuran }: { teks: string; ukuran: number }) {
  const qr = QRCode.create(teks, { errorCorrectionLevel: 'M' })
  const n = qr.modules.size
  const sel: string[] = []
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (qr.modules.get(y, x)) sel.push(`M${x + 2} ${y + 2}h1v1h-1z`)
  return (
    <svg width={ukuran} height={ukuran} viewBox={`0 0 ${n + 4} ${n + 4}`} shapeRendering="crispEdges" role="img" aria-label={`QR code menuju ${teks}`}>
      <rect width={n + 4} height={n + 4} fill="#fff" />
      <path d={sel.join('')} fill="#1e3a5f" />
    </svg>
  )
}

export function Penutup() {
  return (
    <SlideBersih materi={MATERI} tanpaKaki>
      <div className="absolute left-20 top-1/2 -translate-y-1/2 w-[700px]">
        <div className="relative w-[120px] h-[120px]">
          <span className="mt-riak mt-tak-cetak absolute inset-0 rounded-full border-2 border-teal/50" />
          <div className="mt-pop absolute inset-0 rounded-full bg-white shadow-xl border border-gray-200 flex items-center justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-kab-kediri.png" alt="Logo Kabupaten Kediri" className="w-[76px] h-[76px] object-contain" />
          </div>
        </div>
        <h2 className="mt-up mt-7 text-[76px] font-bold leading-none text-navy" style={d(250)}>Terima kasih</h2>
        <div className="mt-lebar mt-6 w-28 h-1.5 rounded-full bg-amber-400" style={d(500)} />
        <p className="mt-up mt-6 text-[22px] font-medium text-gray-600" style={d(650)}>
          Data lengkap <span className="text-amber-500 mx-2">·</span> Laporan terpercaya <span className="text-amber-500 mx-2">·</span> Aset terjaga
        </p>
        <p className="mt-in mt-9 text-[19px] text-gray-500" style={d(950)}>
          <Merek kelas="text-[24px]" /> <span className="mx-1.5">–</span> Badan Keuangan dan Aset Daerah Kabupaten Kediri
        </p>
      </div>

      <div className="mt-kanan absolute right-20 top-1/2 -translate-y-1/2 w-[360px] rounded-3xl border border-gray-200 bg-white shadow-2xl p-8 text-center" style={d(500)}>
        <p className="text-[15px] font-semibold tracking-[0.18em] uppercase text-teal">Buka aplikasi</p>
        <div className="mt-pop mx-auto mt-5 w-[260px] h-[260px]" style={d(900)}><KodeQr teks={ALAMAT} ukuran={260} /></div>
        <p className="mt-5 text-[22px] font-bold text-navy">bmdlastgame.vercel.app</p>
        <p className="mt-1 text-[14px] text-gray-500">Pindai dengan kamera ponsel</p>
      </div>
    </SlideBersih>
  )
}
