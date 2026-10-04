'use client'
// Materi "Perkenalan Aplikasi SMART Asset" — slide 1–4: sampul, konteks, siklus,
// peta menu. Disusun ulang 2026-10-04 menurut rekapan user: sampul memamerkan
// layar Dashboard, konteks = segitiga E-Simbada · E-BMD · AI, & semua slide putih.
import { SlideBersih, SlideTerang, Merek, Ikon, Jendela, d, type NamaIkon } from '../bagian'

export const MATERI = 'Perkenalan Aplikasi'

// ── Gambaran layar Dashboard (sampul) ───────────────────────────────────────
const BATANG = [46, 70, 54, 88, 64, 100, 78]
const MENU_MINI: NamaIkon[] = ['rumah', 'buku', 'pensil', 'periksa', 'peta', 'grafik']

function LayarDashboard() {
  return (
    <Jendela className="absolute right-16 top-[128px] w-[600px]" jeda={250}>
      <div className="flex h-[400px]">
        <div className="w-[88px] bg-navy py-4 flex flex-col items-center gap-3.5">
          {MENU_MINI.map((m, i) => (
            <span key={m} className={`mt-pop w-10 h-10 rounded-lg flex items-center justify-center text-white ${i === 0 ? 'bg-teal' : 'bg-white/10'}`} style={d(500 + i * 90)}>
              <Ikon nama={m} ukuran={20} />
            </span>
          ))}
        </div>
        <div className="flex-1 bg-gray-50 p-4">
          <div className="grid grid-cols-3 gap-3">
            {[['Total Nilai BMD', 'bg-teal'], ['Aset per Jenis', 'bg-navy'], ['Penghapusan', 'bg-amber-500']].map(([t, w], i) => (
              <div key={t} className="mt-up rounded-xl bg-white border border-gray-200 shadow-sm p-3" style={d(700 + i * 130)}>
                <div className={`h-1.5 w-8 rounded-full ${w}`} />
                <p className="mt-2 text-[11px] text-gray-500 font-semibold">{t}</p>
                <div className="mt-2 h-3.5 w-24 rounded bg-gray-200" />
                <div className="mt-1.5 h-2.5 w-14 rounded bg-gray-100" />
              </div>
            ))}
          </div>
          <div className="mt-3 grid grid-cols-5 gap-3">
            <div className="col-span-3 rounded-xl bg-white border border-gray-200 shadow-sm p-3 h-[212px]">
              <p className="text-[11px] text-gray-500 font-semibold">Cara Perolehan</p>
              <div className="mt-3 flex items-end gap-2.5 h-[150px]">
                {BATANG.map((h, i) => (
                  <div key={i} className="mt-tinggi flex-1 rounded-t-md bg-gradient-to-t from-teal to-teal-light" style={{ height: `${h}%`, ...d(1000 + i * 90) }} />
                ))}
              </div>
            </div>
            <div className="col-span-2 rounded-xl bg-white border border-gray-200 shadow-sm p-3 h-[212px]">
              <p className="text-[11px] text-gray-500 font-semibold">Indeks IPA</p>
              <svg viewBox="0 0 120 80" className="mt-3 w-full" aria-hidden>
                <path d="M10 70 A50 50 0 0 1 110 70" fill="none" stroke="#e5e7eb" strokeWidth="12" strokeLinecap="round" />
                <path d="M10 70 A50 50 0 0 1 92 32" fill="none" stroke="#0d9488" strokeWidth="12" strokeLinecap="round" pathLength={1} className="mt-gambar" style={d(1300)} />
                <circle cx="60" cy="70" r="5" fill="#1e3a5f" />
              </svg>
              <div className="mt-2 mx-auto h-3 w-16 rounded bg-gray-200" />
            </div>
          </div>
        </div>
      </div>
    </Jendela>
  )
}

export function Sampul() {
  return (
    <SlideBersih materi={MATERI} tanpaKaki>
      <LayarDashboard />
      <span className="mt-apung absolute right-[72px] top-[96px] px-4 py-2 rounded-full bg-white shadow-lg border border-gray-200 text-[15px] font-semibold text-navy">
        <span className="text-teal">●</span> Dashboard
      </span>

      <div className="absolute left-20 top-[150px] w-[560px]">
        <p className="mt-kiri inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-teal/10 border border-teal/30 text-[15px] font-semibold text-teal tracking-wide">
          <span className="mt-kedip w-2 h-2 rounded-full bg-amber-400" /> Materi Paparan · Bidang Pengelolaan BMD
        </p>
        <h1 className="mt-up mt-7" style={d(200)}><Merek besar /></h1>
        <div className="mt-lebar mt-6 w-28 h-1.5 rounded-full bg-amber-400" style={d(450)} />
        <p className="mt-up mt-6 text-[30px] leading-snug font-semibold text-navy" style={d(550)}>
          Perkenalan Aplikasi Pengelolaan<br />Barang Milik Daerah
        </p>
        <p className="mt-up mt-4 text-[19px] text-gray-500 leading-relaxed" style={d(700)}>
          Apa saja fiturnya, apa yang bisa dikerjakan, dan data apa<br />yang perlu dicek oleh pengurus barang.
        </p>
      </div>
      <p className="mt-in absolute left-20 bottom-12 text-[16px] text-gray-400" style={d(950)}>
        Badan Keuangan dan Aset Daerah · Kabupaten Kediri · 2026
      </p>
    </SlideBersih>
  )
}

// ── Konteks: segitiga E-Simbada · E-BMD · AI, otak di tengah ───────────────
/** Otak bergaya sirkuit: dua belahan, lipatan, dan simpul. viewBox 120×100. */
function Otak({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 100" className={className} fill="none" stroke="#1e3a5f" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M58 14C46 6 28 10 22 24C10 26 4 40 10 50C4 60 10 76 24 78C28 90 46 94 58 86Z" fill="#0d9488" fillOpacity=".14" />
      <path d="M62 14C74 6 92 10 98 24C110 26 116 40 110 50C116 60 110 76 96 78C92 90 74 94 62 86Z" fill="#0d9488" fillOpacity=".14" />
      <path d="M60 14V86" strokeOpacity=".55" />
      <path d="M30 36C40 34 44 42 38 48M24 60C34 58 40 64 36 72M90 36C80 34 76 42 82 48M96 60C86 58 80 64 84 72" stroke="#0d9488" />
      <circle cx="38" cy="48" r="3.4" fill="#f59e0b" stroke="none" /><circle cx="36" cy="72" r="3.4" fill="#f59e0b" stroke="none" />
      <circle cx="82" cy="48" r="3.4" fill="#f59e0b" stroke="none" /><circle cx="84" cy="72" r="3.4" fill="#f59e0b" stroke="none" />
    </svg>
  )
}

// Koordinat di dalam area isi slide (1152×474): titik pusat tiap kartu sudut.
// Susunan (keputusan user 2026-10-04): AI di puncak, E-Simbada kiri bawah, E-BMD kanan bawah.
const SUDUT: { nama: string; isi: string; ikon: NamaIkon; x: number; y: number }[] = [
  { nama: 'AI', isi: 'Asisten yang menjawab dari data', ikon: 'obrolan', x: 576, y: 50 },
  { nama: 'E-Simbada', isi: 'Sumber data sertipikat & aset', ikon: 'gedung', x: 250, y: 380 },
  { nama: 'E-BMD', isi: 'Sumber saldo awal barang', ikon: 'daftar', x: 902, y: 380 },
]
const PUSAT = { x: 576, y: 258 }

export function Konteks() {
  return (
    <SlideTerang materi={MATERI} label="Apa itu SMART Asset" judul="E-Simbada + E-BMD + AI = SMART Asset">
      <svg className="absolute inset-0 w-full h-full" viewBox="0 0 1152 474" aria-hidden>
        <polygon points={SUDUT.map(s => `${s.x},${s.y}`).join(' ')} fill="#0d9488" fillOpacity=".05"
          stroke="#cbd5e1" strokeWidth="2" pathLength={1} className="mt-gambar" style={d(300)} />
        {SUDUT.map(s => (
          <line key={s.nama} x1={s.x} y1={s.y} x2={PUSAT.x} y2={PUSAT.y} stroke="#0d9488" strokeOpacity=".6"
            strokeWidth="2.5" className="mt-alir mt-tak-cetak" />
        ))}
      </svg>
      {SUDUT.map((s, i) => (
        <div key={s.nama} className="mt-up absolute w-[290px] h-[88px] rounded-2xl border border-gray-200 bg-white shadow-xl px-5 flex items-center gap-4"
          style={{ left: s.x - 145, top: s.y - 44, ...d(500 + i * 220) }}>
          <span className="w-14 h-14 rounded-xl bg-navy text-white flex items-center justify-center flex-shrink-0"><Ikon nama={s.ikon} ukuran={30} /></span>
          <div>
            <p className="text-[26px] font-bold text-navy leading-tight">{s.nama}</p>
            <p className="text-[14px] text-gray-500 leading-snug">{s.isi}</p>
          </div>
        </div>
      ))}
      {/* Pusat: otak + merek DI DALAM lingkaran. */}
      <div className="absolute" style={{ left: PUSAT.x - 100, top: PUSAT.y - 100 }}>
        <div className="relative w-[200px] h-[200px]">
          <span className="mt-riak mt-tak-cetak absolute inset-0 rounded-full border-2 border-teal/50" />
          <span className="mt-riak mt-tak-cetak absolute inset-0 rounded-full border-2 border-teal/50" style={d(1200)} />
          <div className="mt-pop absolute inset-0 rounded-full bg-white shadow-2xl border border-gray-200 flex flex-col items-center justify-center gap-2" style={d(900)}>
            <Otak className="w-[104px] h-[87px]" />
            <Merek kelas="text-[25px]" />
          </div>
        </div>
      </div>
      <p className="mt-in absolute left-0 right-0 bottom-0 text-center text-[17px] text-gray-500" style={d(1500)}>
        Tiga sumber digabung menjadi satu <b className="text-navy">otak</b> pengelolaan aset daerah — itulah SMART Asset.
      </p>
    </SlideTerang>
  )
}

// ── Siklus pengelolaan BMD ──────────────────────────────────────────────────
const SIKLUS = [
  'Perencanaan', 'Pengadaan', 'Penggunaan', 'Pemanfaatan', 'Pengamanan', 'Penilaian',
  'Pemindahtanganan', 'Pemusnahan', 'Penghapusan', 'Penatausahaan', 'Wasdal',
]
// Biru = menu pengembangan di luar menu inti, hitam = menu inti (warna dari rekapan user).
const MENU_SIKLUS: { menu: string; isi: string; biru: boolean }[] = [
  { menu: 'RKBMD', isi: 'Perencanaan kebutuhan & standar harga', biru: true },
  { menu: 'Pembukuan', isi: 'Perolehan, pengelolaan, LRA, KIR', biru: false },
  { menu: 'Inventarisasi', isi: 'Lembar kerja, validasi, laporan, tindak lanjut', biru: false },
  { menu: 'Pelaporan', isi: 'Laporan BMD, rekonsiliasi, KIBAR, KIR', biru: false },
  { menu: 'Penyusutan', isi: 'Beban, akumulasi, dan nilai buku', biru: true },
  { menu: 'GIS Tanah', isi: 'Peta tanah, bidang, dan sertipikat', biru: true },
  { menu: 'IPA', isi: 'Indeks Pengelolaan Aset per SKPD', biru: true },
]

export function Siklus() {
  const cx = 330, cy = 237, r = 160
  return (
    <SlideTerang materi={MATERI} label="Cakupan" judul="Mengikuti siklus pengelolaan BMD (Permendagri 19/2016)">
      <svg className="absolute left-0 top-0" width="680" height="474" viewBox="0 0 680 474" aria-hidden>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#cbd5e1" strokeWidth="2" pathLength={1} className="mt-gambar" style={d(150)} />
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#0d9488" strokeWidth="2.5" className="mt-alir mt-tak-cetak" opacity=".55" />
        <g className="mt-putar mt-tak-cetak" style={{ transformOrigin: `${cx}px ${cy}px`, ['--lama' as string]: '11s' }}>
          <circle cx={cx} cy={cy - r} r="9" fill="#f59e0b" />
          <circle cx={cx} cy={cy - r} r="16" fill="#f59e0b" opacity=".25" />
        </g>
        <g className="mt-pop" style={{ ...d(100), transformOrigin: `${cx}px ${cy}px` }}>
          <circle cx={cx} cy={cy} r="82" fill="#1e3a5f" />
          <text x={cx} y={cy - 4} textAnchor="middle" fontSize="26" fontWeight="700" fill="#fff">SMART</text>
          <text x={cx} y={cy + 26} textAnchor="middle" fontSize="26" fontWeight="700" fill="#ff6b6b">Asset</text>
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
                fontSize="16" fontWeight="600" fill="#1e3a5f">{nama}</text>
            </g>
          )
        })}
      </svg>

      <div className="absolute right-0 top-0 w-[455px]">
        <p className="mt-in text-[17px] font-semibold text-gray-500 mb-2" style={d(700)}>Menu aplikasi disusun mengikuti Permendagri 47/2021:</p>
        <div className="space-y-1.5">
          {MENU_SIKLUS.map((m, i) => (
            <div key={m.menu} className="mt-kanan flex gap-3 rounded-xl border border-gray-200 bg-white shadow-sm px-4 py-1.5" style={d(850 + i * 120)}>
              <span className={`mt-1.5 w-2.5 h-2.5 rounded-full flex-shrink-0 ${m.biru ? 'bg-blue-600' : 'bg-gray-900'}`} />
              <div>
                <p className={`text-[18px] font-bold leading-tight ${m.biru ? 'text-blue-600' : 'text-gray-900'}`}>{m.menu}</p>
                <p className="text-[14.5px] text-gray-500 leading-snug">{m.isi}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </SlideTerang>
  )
}

const MENU: { ikon: NamaIkon; nama: string; isi: string }[] = [
  { ikon: 'rumah', nama: 'Dashboard', isi: 'Ringkasan aset per jenis, cara perolehan, dan penghapusan' },
  { ikon: 'buku', nama: 'Saldo Awal', isi: 'Posisi barang akhir 2025 sebagai titik awal' },
  { ikon: 'kalender', nama: 'RKBMD', isi: 'Standar harga & rencana kebutuhan' },
  { ikon: 'pensil', nama: 'Pembukuan', isi: 'Perolehan, pengelolaan, LRA, dan KIR' },
  { ikon: 'periksa', nama: 'Inventarisasi', isi: 'Lembar kerja, validasi, laporan hasil, tindak lanjut' },
  { ikon: 'peta', nama: 'GIS Tanah', isi: 'Peta tanah, bidang, dan sertipikat' },
  { ikon: 'truk', nama: 'Kendaraan', isi: 'Kendaraan dinas berikut pemakainya' },
  { ikon: 'daftar', nama: 'Daftar Barang', isi: 'Register barang per semester' },
  { ikon: 'turun', nama: 'Penyusutan', isi: 'Beban, akumulasi, dan nilai buku' },
  { ikon: 'bola', nama: 'IPA', isi: 'Indeks Pengelolaan Aset per SKPD' },
  { ikon: 'grafik', nama: 'Pelaporan', isi: 'Perolehan, Pengelolaan, BMD, Rekon, KIR' },
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
