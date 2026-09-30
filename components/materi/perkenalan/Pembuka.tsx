'use client'
// Materi "Perkenalan Aplikasi SMART Asset" — slide 1–4: sampul, tujuan, siklus,
// peta menu.
import { SlideGelap, SlideTerang, Merek, Ikon, d, type NamaIkon } from '../bagian'

export const MATERI = 'Perkenalan Aplikasi'

// Satu lintasan ikon yang mengelilingi logo di sampul. Pembungkusnya berputar,
// tiap ikon berputar BALIK dgn lama yang sama supaya tetap tegak.
function Lintasan({ r, lama, ikon, balik, fase = 0 }: {
  r: number; lama: string; ikon: NamaIkon[]; balik?: boolean
  /** Geser sudut awal (radian) supaya dua lintasan tak bertumpuk saat diam/dicetak. */
  fase?: number
}) {
  const lamaStyle = { ['--lama' as string]: lama }
  return (
    <div className={`absolute inset-0 ${balik ? 'mt-putar-balik' : 'mt-putar'}`} style={lamaStyle}>
      {ikon.map((nama, i) => {
        const sudut = fase + (i / ikon.length) * Math.PI * 2
        return (
          <div key={nama} className="absolute w-14 h-14"
            style={{ left: 310 + r * Math.cos(sudut) - 28, top: 310 + r * Math.sin(sudut) - 28 }}>
            <div className={`w-full h-full ${balik ? 'mt-putar' : 'mt-putar-balik'}`} style={lamaStyle}>
              <div className="mt-pop w-full h-full rounded-full bg-white/10 border border-white/25 backdrop-blur flex items-center justify-center text-white"
                style={d(500 + i * 120)}>
                <Ikon nama={nama} ukuran={26} />
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

export function Sampul() {
  return (
    <SlideGelap materi={MATERI} tanpaKaki>
      <div className="absolute right-0 top-[50px] w-[620px] h-[620px]">
        <svg className="absolute inset-0 w-full h-full" viewBox="0 0 620 620" aria-hidden>
          {[130, 200, 270].map((r, i) => (
            <circle key={r} cx="310" cy="310" r={r} fill="none" stroke="#fff" strokeOpacity={0.22 - i * 0.05}
              strokeWidth="1.5" strokeDasharray="3 9" className="mt-in" style={d(200 + i * 150)} />
          ))}
        </svg>
        <Lintasan r={200} lama="48s" fase={0.5} ikon={['pin', 'truk', 'gedung', 'dokumen']} />
        <Lintasan r={270} lama="72s" balik fase={1.25} ikon={['grafik', 'qr', 'kamera', 'perisai', 'hitung']} />
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[190px] h-[190px]">
          <span className="mt-riak absolute inset-0 rounded-full border-2 border-teal-light/60" />
          <span className="mt-riak absolute inset-0 rounded-full border-2 border-teal-light/60" style={d(1200)} />
          <div className="mt-pop absolute inset-0 rounded-full bg-white shadow-2xl flex items-center justify-center" style={d(150)}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-kab-kediri.png" alt="Logo Kabupaten Kediri" className="w-[118px] h-[118px] object-contain" />
          </div>
        </div>
      </div>

      <div className="absolute left-20 top-[150px] w-[640px]">
        <p className="mt-kiri inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/10 border border-white/20 text-[15px] font-medium tracking-wide">
          <span className="mt-kedip w-2 h-2 rounded-full bg-amber-400" /> Materi Paparan · Bidang Pengelolaan BMD
        </p>
        <h1 className="mt-up mt-7" style={d(200)}><Merek gelap besar /></h1>
        <div className="mt-lebar mt-6 w-28 h-1.5 rounded-full bg-amber-400" style={d(450)} />
        <p className="mt-up mt-6 text-[30px] leading-snug font-semibold" style={d(550)}>
          Perkenalan Aplikasi Pengelolaan<br />Barang Milik Daerah
        </p>
        <p className="mt-up mt-4 text-[19px] text-white/70 leading-relaxed" style={d(700)}>
          Apa saja fiturnya, apa yang bisa dikerjakan, dan data apa<br />yang perlu dicek oleh pengurus barang.
        </p>
      </div>
      <p className="mt-in absolute left-20 bottom-12 text-[16px] text-white/60" style={d(950)}>
        Badan Keuangan dan Aset Daerah · Kabupaten Kediri · 2026
      </p>
    </SlideGelap>
  )
}

const TUJUAN: { ikon: NamaIkon; judul: string; isi: string }[] = [
  { ikon: 'daftar', judul: 'Satu Data', isi: 'Register barang tunggal — sub-unit, SKPD, sampai kabupaten membaca data yang sama.' },
  { ikon: 'ulang', judul: 'Berjejak', isi: 'Perolehan, perpindahan, koreksi, dan penghapusan tercatat — bisa ditelusuri per barang.' },
  { ikon: 'grafik', judul: 'Siap Lapor', isi: 'Laporan semester dan tahunan tersusun dari data yang sama, tanpa rekap manual.' },
]

export function Tujuan() {
  return (
    <SlideTerang materi={MATERI} label="Apa itu SMART Asset" judul="Satu aplikasi untuk seluruh siklus Barang Milik Daerah">
      <div className="grid grid-cols-3 gap-6 mt-2">
        {TUJUAN.map((t, i) => (
          <div key={t.judul} className="mt-up relative rounded-2xl border border-gray-200 bg-white shadow-lg p-9 h-[340px] overflow-hidden" style={d(250 + i * 180)}>
            <div className="relative w-[84px] h-[84px]">
              <span className="mt-riak absolute inset-0 rounded-full bg-teal/30" style={d(i * 700)} />
              <div className="mt-pop relative w-full h-full rounded-full bg-teal text-white flex items-center justify-center" style={d(450 + i * 180)}>
                <Ikon nama={t.ikon} ukuran={42} />
              </div>
            </div>
            <h3 className="mt-7 text-[30px] font-bold text-navy">{t.judul}</h3>
            <p className="mt-3 text-[19px] leading-relaxed text-gray-600">{t.isi}</p>
            <div className="mt-lebar absolute left-0 bottom-0 h-1.5 w-full bg-gradient-to-r from-teal to-navy" style={d(700 + i * 180)} />
          </div>
        ))}
      </div>
      <p className="mt-in mt-10 text-center text-[19px] text-gray-500" style={d(1100)}>
        Berbasis web — dibuka dari peramban, dan tiap pengguna bekerja pada barang <b className="text-navy">SKPD-nya sendiri</b>.
      </p>
    </SlideTerang>
  )
}

const SIKLUS = [
  'Perencanaan', 'Pengadaan', 'Penggunaan', 'Pemanfaatan', 'Pengamanan', 'Penilaian',
  'Pemindahtanganan', 'Pemusnahan', 'Penghapusan', 'Penatausahaan', 'Wasdal',
]
const MENU_SIKLUS: [string, string][] = [
  ['RKBMD', 'Perencanaan kebutuhan & standar harga'],
  ['Pembukuan', 'Perolehan, penggunaan, pemanfaatan, pengamanan, penghapusan'],
  ['Inventarisasi · Penyusutan', 'Penatausahaan: cek fisik & nilai buku'],
  ['Pelaporan', 'Laporan BMD, rekonsiliasi, KIBAR, KIR'],
  ['IPA · WasDal', 'Pengawasan dan pengendalian'],
]

export function Siklus() {
  const cx = 390, cy = 237, r = 165
  return (
    <SlideTerang materi={MATERI} label="Cakupan" judul="Mengikuti siklus pengelolaan BMD">
      <svg className="absolute left-0 top-0" width="760" height="474" viewBox="0 0 760 474" aria-hidden>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#cbd5e1" strokeWidth="2" pathLength={1} className="mt-gambar" style={d(150)} />
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#0d9488" strokeWidth="2.5" className="mt-alir mt-tak-cetak" opacity=".55" />
        <g className="mt-putar mt-tak-cetak" style={{ transformOrigin: `${cx}px ${cy}px`, ['--lama' as string]: '11s' }}>
          <circle cx={cx} cy={cy - r} r="9" fill="#f59e0b" />
          <circle cx={cx} cy={cy - r} r="16" fill="#f59e0b" opacity=".25" />
        </g>
        <g className="mt-pop" style={{ ...d(100), transformOrigin: `${cx}px ${cy}px` }}>
          <circle cx={cx} cy={cy} r="84" fill="#1e3a5f" />
          <text x={cx} y={cy - 4} textAnchor="middle" fontSize="27" fontWeight="700" fill="#fff">SMART</text>
          <text x={cx} y={cy + 26} textAnchor="middle" fontSize="27" fontWeight="700" fill="#ff6b6b">Asset</text>
        </g>
        {SIKLUS.map((nama, i) => {
          const a = -Math.PI / 2 + (i / SIKLUS.length) * Math.PI * 2
          const x = cx + r * Math.cos(a), y = cy + r * Math.sin(a)
          const lx = cx + (r + 30) * Math.cos(a), ly = cy + (r + 30) * Math.sin(a)
          const sisi = Math.cos(a) > 0.2 ? 'start' : Math.cos(a) < -0.2 ? 'end' : 'middle'
          return (
            <g key={nama} className="mt-pop" style={{ ...d(400 + i * 110), transformOrigin: `${x}px ${y}px` }}>
              <circle cx={x} cy={y} r="17" fill="#0d9488" stroke="#fff" strokeWidth="3" />
              <text x={x} y={y + 5} textAnchor="middle" fontSize="14" fontWeight="700" fill="#fff">{i + 1}</text>
              <text x={lx} y={ly + (sisi === 'middle' ? (Math.sin(a) < 0 ? -2 : 14) : 5)} textAnchor={sisi}
                fontSize="16.5" fontWeight="600" fill="#1e3a5f">{nama}</text>
            </g>
          )
        })}
      </svg>

      <div className="absolute right-0 top-2 w-[400px]">
        <p className="mt-in text-[17px] text-gray-500 mb-4" style={d(700)}>Menu aplikasi disusun mengikuti siklus itu:</p>
        <div className="space-y-3">
          {MENU_SIKLUS.map(([menu, isi], i) => (
            <div key={menu} className="mt-kanan flex gap-3 rounded-xl border border-gray-200 bg-white shadow-sm px-4 py-3" style={d(850 + i * 140)}>
              <span className="mt-1 w-2.5 h-2.5 rounded-full bg-teal flex-shrink-0" />
              <div>
                <p className="text-[18px] font-bold text-navy leading-tight">{menu}</p>
                <p className="text-[15px] text-gray-500 leading-snug mt-0.5">{isi}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </SlideTerang>
  )
}

const MENU: { ikon: NamaIkon; nama: string; isi: string }[] = [
  { ikon: 'rumah', nama: 'Dashboard', isi: 'Ringkasan aset per jenis & cara perolehan' },
  { ikon: 'buku', nama: 'Saldo Awal', isi: 'Posisi barang akhir 2025 sebagai titik awal' },
  { ikon: 'kalender', nama: 'RKBMD', isi: 'Standar harga & rencana kebutuhan' },
  { ikon: 'pensil', nama: 'Pembukuan', isi: 'Perolehan, pengelolaan, LRA, dan KIR' },
  { ikon: 'periksa', nama: 'Inventarisasi', isi: 'Lembar kerja, validasi, laporan hasil' },
  { ikon: 'peta', nama: 'GIS Tanah', isi: 'Peta tanah, bidang, dan sertifikat' },
  { ikon: 'truk', nama: 'Kendaraan', isi: 'Kendaraan dinas berikut pemakainya' },
  { ikon: 'daftar', nama: 'Daftar Barang', isi: 'Register barang per semester' },
  { ikon: 'turun', nama: 'Penyusutan', isi: 'Beban, akumulasi, dan nilai buku' },
  { ikon: 'bola', nama: 'IPA', isi: 'Indeks Pengelolaan Aset per SKPD' },
  { ikon: 'grafik', nama: 'Pelaporan', isi: 'Laporan BMD, rekonsiliasi, KIBAR' },
  { ikon: 'map', nama: 'Dokumen Sumber', isi: 'Peraturan, arsip SK/BAST, materi' },
]

export function PetaMenu() {
  return (
    <SlideTerang materi={MATERI} label="Fitur" judul="Peta menu — apa ada di mana">
      <div className="grid grid-cols-4 gap-4 mt-3">
        {MENU.map((m, i) => (
          <div key={m.nama} className="mt-pop rounded-xl border border-gray-200 bg-white shadow-md px-5 py-4 h-[142px]" style={d(200 + i * 70)}>
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-lg bg-teal/10 text-teal flex items-center justify-center flex-shrink-0">
                <Ikon nama={m.ikon} ukuran={24} />
              </div>
              <p className="text-[20px] font-bold text-navy leading-tight">{m.nama}</p>
            </div>
            <p className="mt-3 text-[15.5px] text-gray-500 leading-snug">{m.isi}</p>
          </div>
        ))}
      </div>
    </SlideTerang>
  )
}
