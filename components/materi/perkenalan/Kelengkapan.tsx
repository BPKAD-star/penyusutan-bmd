'use client'
// Materi "Perkenalan Aplikasi SMART Asset" — slide 9–13: yang diminta dari
// pengurus barang (titik koordinat tanah, spesifikasi barang, nama profil) dan
// cara menemukan data yang belum lengkap lewat IPA.
//
// ⚠️ Nama menu, tombol, & tab di slide ini DISALIN dari layarnya (GIS Tanah,
// Daftar Barang Awal, Koreksi, IPA → Capaian SKPD). Kalau labelnya diganti di
// aplikasi, materi ini ikut disesuaikan — peserta mencari tulisan yang sama
// persis dengan yang ditunjukkan di paparan.
import type { ReactNode } from 'react'
import { SlideBersih, SlideTerang, Ikon, Nomor, Jejak, Tbl, Catatan, d, type NamaIkon } from '../bagian'
import { MATERI } from './Pembuka'

const DICEK: { ikon: NamaIkon; judul: string; isi: string }[] = [
  { ikon: 'orang', judul: 'Nama profil pengguna', isi: 'Akun memakai nama yang benar' },
  { ikon: 'periksa', judul: 'Spesifikasi data barang', isi: 'Merk, nomor, luas, kondisi, foto' },
  { ikon: 'pin', judul: 'Titik koordinat tanah + sertipikat', isi: 'Titik di peta, bidang, dan sertipikatnya' },
]

export function Pembatas() {
  return (
    <SlideBersih materi={MATERI}>
      <div className="absolute left-20 right-20 top-[110px]">
        <p className="mt-in flex items-center gap-3 text-[15px] font-semibold tracking-[0.2em] uppercase text-teal">
          <span className="mt-lebar inline-block w-10 h-[3px] bg-teal rounded-full" />Tindak lanjut
        </p>
        <h2 className="mt-up mt-4 text-[54px] leading-[1.1] font-bold text-navy" style={d(120)}>
          Yang perlu dicek<br />oleh Pengurus Barang
        </h2>
        <p className="mt-up mt-5 text-[21px] text-gray-500" style={d(300)}>
          Data yang lengkap adalah dasar laporan yang bisa dipertanggungjawabkan.
        </p>
      </div>
      <div className="absolute left-20 right-20 bottom-[92px] grid grid-cols-3 gap-6">
        {DICEK.map((c, i) => (
          <div key={c.judul} className="mt-up rounded-2xl bg-white border border-gray-200 shadow-lg p-6" style={d(550 + i * 200)}>
            <div className="flex items-center gap-4">
              <Nomor n={i + 1} />
              <Ikon nama={c.ikon} ukuran={30} className="text-teal" />
            </div>
            <p className="mt-4 text-[24px] font-bold leading-tight text-navy">{c.judul}</p>
            <p className="mt-1.5 text-[16px] text-gray-500">{c.isi}</p>
          </div>
        ))}
      </div>
    </SlideBersih>
  )
}

function Langkah({ n, jeda, children }: { n: number; jeda: number; children: ReactNode }) {
  return (
    <div className="mt-kiri flex items-start gap-4" style={d(jeda)}>
      <Nomor n={n} />
      <div className="text-[19px] leading-relaxed text-gray-700 pt-1">{children}</div>
    </div>
  )
}

export function PetaBesar() {
  const sudah: [number, number][] = [[118, 120], [250, 84], [392, 150], [206, 232], [420, 300], [96, 306]]
  return (
    <svg viewBox="0 0 520 400" className="w-full h-full" aria-hidden>
      <defs><clipPath id="mt-peta-klip"><rect width="520" height="400" rx="18" /></clipPath></defs>
      <g clipPath="url(#mt-peta-klip)">
        <rect width="520" height="400" fill="#e6f4ef" />
        <path d="M-10 368 C120 330 180 380 300 352 S470 330 530 356 V410 H-10z" fill="#bfe3f5" />
        <path d="M-10 196 L530 162 M158 -10 L196 410 M330 -10 L300 410 M-10 60 L530 40" stroke="#fff" strokeWidth="13" fill="none" />
        <path d="M-10 196 L530 162" stroke="#f1e6bf" strokeWidth="3" strokeDasharray="14 12" fill="none" />
        {[[30, 90, 96, 70], [214, 84, 80, 52], [352, 64, 110, 66], [36, 226, 100, 58], [218, 214, 62, 96], [346, 198, 130, 74]].map(([x, y, w, h], i) => (
          <rect key={i} x={x} y={y} width={w} height={h} rx="6" fill="#c9e8dc" stroke="#9fd3bf" className="mt-in" style={d(200 + i * 60)} />
        ))}
      </g>
      {sudah.map(([x, y], i) => (
        <g key={i} className="mt-jatuh" style={d(700 + i * 210)}>
          <ellipse cx={x} cy={y + 3} rx="9" ry="3" fill="#000" opacity=".16" />
          <path d={`M${x} ${y} c-12 -15 -15 -21 -15 -27 a15 15 0 0 1 30 0 c0 6 -3 12 -15 27z`} fill="#0d9488" />
          <circle cx={x} cy={y - 27} r="5.5" fill="#fff" />
        </g>
      ))}
      {/* Titik yang sedang dipasang: pin draft + riak. */}
      <g className="mt-in" style={d(2100)}>
        <circle cx="300" cy="262" r="16" fill="none" stroke="#2563eb" strokeWidth="2.5" className="mt-riak mt-tak-cetak" style={{ transformOrigin: '300px 262px' }} />
        <path d="M300 262 c-12 -15 -15 -21 -15 -27 a15 15 0 0 1 30 0 c0 6 -3 12 -15 27z" fill="#2563eb" fillOpacity=".2" stroke="#2563eb" strokeWidth="2.5" strokeDasharray="5 4" />
        <circle cx="300" cy="235" r="5.5" fill="#2563eb" />
      </g>
    </svg>
  )
}

export function Koordinat() {
  return (
    <SlideTerang materi={MATERI} label="Cek kelengkapan · 3" judul="Titik koordinat tanah">
      <div className="absolute left-0 top-0 w-[560px] space-y-5">
        <Langkah n={1} jeda={250}>Buka menu <Tbl>GIS Tanah</Tbl>, tab <b>Peta</b>.</Langkah>
        <Langkah n={2} jeda={450}>Saring <Tbl>⚠ Belum Titik</Tbl> untuk melihat tanah yang belum dititik.</Langkah>
        <Langkah n={3} jeda={650}>Pilih tanahnya, tekan <Tbl>📍 Set Titik Koordinat</Tbl>, lalu klik lokasinya di peta.</Langkah>
        <Langkah n={4} jeda={850}>Periksa posisi pin-nya, lalu <Tbl>Simpan</Tbl>.</Langkah>
        <Catatan jeda={1150} nada="teal" ikon="dokumen">
          <b>Sudah ada bidang &amp; sertipikatnya?</b> Kalau belum dan tanahnya memang sudah bersertipikat, tambahkan di panel bidang. Datanya diambil dari <b>e-Simbada</b>.
        </Catatan>
        <p className="mt-in inline-flex items-center gap-2 px-3.5 py-2 rounded-full bg-navy text-white text-[15px] font-semibold" style={d(1400)}>
          <Ikon nama="bola" ukuran={18} className="text-amber-300" /> Berpengaruh terhadap nilai IPA
        </p>
      </div>
      <div className="mt-kanan absolute right-0 top-0 w-[548px] h-[422px] rounded-[20px] shadow-2xl border border-gray-200 bg-white p-2" style={d(300)}>
        <div className="relative w-full h-full">
          <PetaBesar />
          <span className="mt-pop absolute left-3 top-3 px-3 py-1.5 rounded-full bg-white shadow text-[13px] font-semibold text-amber-700" style={d(1000)}>⚠ Belum Titik</span>
          <span className="mt-pop absolute left-3 bottom-3 px-3 py-1.5 rounded-lg bg-white shadow text-[13px] font-semibold text-gray-600" style={d(1150)}>
            Jalan · <span className="text-teal">Satelit</span>
          </span>
          <span className="mt-up absolute left-[310px] top-[178px] px-3 py-1.5 rounded-lg bg-blue-600 text-white text-[13px] font-semibold shadow-lg" style={d(2300)}>Simpan titik ini?</span>
        </div>
      </div>
    </SlideTerang>
  )
}

const SPEK: [string, string[]][] = [
  ['Semua barang', ['Nama & spesifikasi', 'Lokasi / alamat', 'Kondisi', 'Penggunaan', 'Foto']],
  ['Peralatan & Mesin', ['Merk / Tipe']],
  ['Kendaraan', ['No. Polisi', 'No. Rangka', 'No. Mesin', 'No. BPKB']],
  ['Tanah · Gedung · Jalan', ['Luas']],
]
const CONTOH = ['Merk / Tipe', 'No. Polisi', 'No. Rangka', 'No. Mesin', 'No. BPKB', 'Kondisi', 'Foto']

export function Spesifikasi() {
  return (
    <SlideTerang materi={MATERI} label="Cek kelengkapan · 2" judul="Kelengkapan spesifikasi barang">
      <div className="absolute left-0 top-0 w-[690px]">
        <div className="rounded-2xl border border-gray-200 bg-white shadow-md overflow-hidden">
          {SPEK.map(([jenis, isi], i) => (
            <div key={jenis} className={`mt-kiri flex items-center gap-4 px-5 py-2 ${i ? 'border-t border-gray-100' : ''}`} style={d(250 + i * 160)}>
              <p className="w-[190px] flex-shrink-0 text-[17px] font-bold text-navy leading-tight">{jenis}</p>
              <div className="flex flex-wrap gap-2">
                {isi.map(x => <span key={x} className="px-3 py-1 rounded-md bg-teal/10 text-teal text-[15.5px] font-semibold">{x}</span>)}
              </div>
            </div>
          ))}
        </div>
        <p className="mt-in mt-3 text-[15px] font-semibold text-gray-500 uppercase tracking-wider" style={d(1000)}>Melengkapinya lewat</p>
        <div className="mt-up mt-2" style={d(1100)}>
          <Jejak langkah={['Saldo Awal', 'Daftar Barang Awal', 'centang barang', 'Edit Spesifikasi']} />
          <p className="text-[14.5px] text-gray-500 mt-1">untuk barang saldo awal yang belum pernah bertransaksi</p>
        </div>
        <div className="mt-up mt-2" style={d(1250)}>
          <Jejak langkah={['Pembukuan', 'Pengelolaan', 'Koreksi', 'Spesifikasi Barang']} />
          <p className="text-[14.5px] text-gray-500 mt-1">untuk barang lainnya — disertai dokumen dasar</p>
        </div>
        <p className="mt-up mt-3 inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-navy text-white text-[15px] font-semibold" style={d(1450)}>
          <Ikon nama="bola" ukuran={18} className="text-amber-300" /> Berpengaruh terhadap nilai IPA
        </p>
      </div>

      <div className="mt-kanan absolute right-0 top-0 w-[420px] rounded-2xl border border-gray-200 bg-white shadow-2xl overflow-hidden" style={d(350)}>
        <div className="flex items-center gap-3 px-5 py-4 bg-navy text-white">
          <Ikon nama="truk" ukuran={26} />
          <div>
            <p className="text-[18px] font-bold leading-tight">Contoh: kendaraan dinas</p>
            <p className="text-[13px] text-white/[0.65]">yang diperiksa di kartu barangnya</p>
          </div>
        </div>
        <div className="px-5 py-3">
          {CONTOH.map((c, i) => (
            <div key={c} className="flex items-center justify-between py-[7px] border-b border-gray-100 last:border-0">
              <span className="text-[17px] text-gray-700">{c}</span>
              <span className="mt-pop w-7 h-7 rounded-full bg-teal text-white flex items-center justify-center" style={d(800 + i * 230)}>
                <Ikon nama="centang" ukuran={17} tebal={3} />
              </span>
            </div>
          ))}
        </div>
        <div className="px-5 pb-5">
          <div className="flex justify-between text-[14px] font-semibold text-gray-500 mb-1.5"><span>Kelengkapan</span><span className="mt-in text-teal" style={d(2500)}>Lengkap</span></div>
          <div className="h-3 rounded-full bg-gray-100 overflow-hidden">
            <div className="mt-lebar h-full w-full rounded-full bg-gradient-to-r from-teal-light to-teal" style={{ ...d(800), animationDuration: '1.8s' }} />
          </div>
        </div>
      </div>
    </SlideTerang>
  )
}

export function Profil() {
  return (
    <SlideTerang materi={MATERI} label="Cek kelengkapan · 1" judul="Nama profil pengguna">
      <div className="absolute left-0 top-0 w-[610px]">
        <p className="mt-in text-[18px] text-gray-600" style={d(200)}>Setelah login, lihat <b className="text-navy">pojok kanan atas</b> layar:</p>
        <div className="mt-up mt-4 flex items-center justify-between rounded-xl border border-gray-200 bg-white shadow-xl px-5 h-[76px]" style={d(350)}>
          <div className="flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-kab-kediri.png" alt="" className="w-8 h-8 object-contain" />
            <span className="text-[19px] font-bold"><span style={{ color: '#264c7d' }}>SMART</span> <span style={{ color: '#f44141' }}>Asset</span></span>
          </div>
          <div className="relative flex items-center gap-2.5 px-3 py-2 rounded-lg">
            <span className="mt-kedip mt-tak-cetak absolute -inset-1 rounded-xl border-[3px] border-amber-400" />
            <span className="absolute -inset-1 rounded-xl border-[3px] border-amber-400/40" />
            <span className="w-9 h-9 rounded-full bg-teal/[0.15] text-teal flex items-center justify-center"><Ikon nama="orang" /></span>
            <span className="text-[16px] text-gray-600">Welcome, <b className="text-gray-900">Nama Lengkap, S.E.</b></span>
          </div>
        </div>
        <div className="mt-6 space-y-3.5">
          {[
            'Nama lengkap dan gelar sudah benar — bukan alamat email.',
            'Akun dipakai oleh orangnya sendiri, tidak bergantian.',
          ].map((t, i) => (
            <div key={t} className="mt-kiri flex items-center gap-3.5" style={d(750 + i * 200)}>
              <span className="w-8 h-8 rounded-full bg-teal text-white flex items-center justify-center flex-shrink-0"><Ikon nama="centang" ukuran={18} tebal={3} /></span>
              <span className="text-[18.5px] text-gray-700">{t}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-kanan absolute right-0 top-0 w-[480px] rounded-2xl bg-navy text-white p-8 shadow-2xl" style={d(500)}>
        <p className="text-[14px] font-semibold tracking-[0.18em] uppercase text-amber-300">Kenapa penting</p>
        <div className="mt-5 space-y-5">
          {([
            ['orang', 'Identitas akun', 'Nama ini yang tampil di aplikasi dan dikenali pengguna lain.'],
            ['pensil', 'Jejak pencatatan', 'Setiap transaksi mencatat akun yang mengentrinya.'],
            ['cetak', 'Dokumen cetak', 'Data pengurus barang dipakai pada blok tanda tangan dokumen.'],
          ] as [NamaIkon, string, string][]).map(([ikon, judul, isi], i) => (
            <div key={judul} className="mt-up flex gap-4" style={d(800 + i * 220)}>
              <div className="w-12 h-12 rounded-xl bg-white/[0.12] border border-white/20 flex items-center justify-center flex-shrink-0"><Ikon nama={ikon} ukuran={26} /></div>
              <div>
                <p className="text-[19px] font-bold">{judul}</p>
                <p className="text-[16px] text-white/70 leading-snug mt-0.5">{isi}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </SlideTerang>
  )
}

// Titik pada busur setengah lingkaran: f = 0 (kiri) … 1 (kanan).
const titik = (cx: number, cy: number, r: number, f: number) => {
  const a = Math.PI * (1 - f)
  return `${(cx + r * Math.cos(a)).toFixed(2)} ${(cy - r * Math.sin(a)).toFixed(2)}`
}
// Batas pita = ambang kategori IPA pada skala indeks 1–4 (2,65 · 3,10 · 3,55),
// kembar dgn `kategoriDariSkor` di lib/ipa.ts. Gambar ini ILUSTRASI: jarumnya
// tak menunjuk nilai SKPD mana pun.
const PITA: [number, number, string][] = [
  [0, 0.55, '#ef4444'], [0.55, 0.7, '#f59e0b'], [0.7, 0.85, '#14b8a6'], [0.85, 1, '#0f766e'],
]
const ASPEK = ['Integritas', 'Kepatuhan', 'Akuntabilitas', 'Legalitas', 'Ekonomi']

export function Ipa() {
  const cx = 230, cy = 215, r = 170
  return (
    <SlideTerang materi={MATERI} label="Cek kelengkapan · cara cepat" judul="Menemukan data yang belum lengkap">
      <div className="mt-up absolute left-0 top-0 w-[480px] h-[440px] rounded-2xl border border-gray-200 bg-white shadow-lg p-5" style={d(250)}>
        <svg viewBox="0 0 460 250" className="w-full" aria-hidden>
          {PITA.map(([a, b, warna], i) => (
            <path key={i} d={`M ${titik(cx, cy, r, a)} A ${r} ${r} 0 0 1 ${titik(cx, cy, r, b)}`}
              fill="none" stroke={warna} strokeWidth="34" pathLength={1} className="mt-gambar" style={d(400 + i * 180)} />
          ))}
          <g className="mt-jarum" style={{ transform: 'rotate(44deg)', transformOrigin: `${cx}px ${cy}px`, ...d(1100) }}>
            <path d={`M ${cx - 7} ${cy} L ${cx} ${cy - r + 22} L ${cx + 7} ${cy} Z`} fill="#1e3a5f" />
          </g>
          <circle cx={cx} cy={cy} r="15" fill="#1e3a5f" /><circle cx={cx} cy={cy} r="6" fill="#fff" />
        </svg>
        <p className="text-center text-[22px] font-bold text-navy -mt-1">Indeks Pengelolaan Aset (IPA)</p>
        <p className="text-center text-[15px] text-gray-500 mt-1">menilai tiap SKPD pada lima aspek</p>
        <div className="flex flex-wrap justify-center gap-2 mt-3.5">
          {ASPEK.map((a, i) => (
            <span key={a} className="mt-pop px-3 py-1.5 rounded-full bg-navy/[0.07] text-navy text-[14.5px] font-semibold" style={d(1500 + i * 90)}>{a}</span>
          ))}
        </div>
      </div>

      <div className="absolute right-0 top-0 w-[620px] space-y-5">
        <p className="mt-in text-[18px] text-gray-600 leading-relaxed" style={d(400)}>
          Kelengkapan data barang ikut dinilai dalam IPA — dan aplikasi menunjukkan <b className="text-navy">barang mana</b> yang masih kurang.
        </p>
        <Langkah n={1} jeda={650}>Buka <Jejak langkah={['IPA', 'Capaian SKPD']} /></Langkah>
        <Langkah n={2} jeda={850}>Pada indikator <b>Kelengkapan Data Administrasi</b>, tekan <Tbl>👁 Lihat</Tbl>.</Langkah>
        <Langkah n={3} jeda={1050}>Tab <Tbl>Perlu ditindaklanjuti</Tbl> berisi daftar barang yang datanya belum lengkap.</Langkah>
        <div className="mt-up flex gap-3 rounded-xl bg-teal/10 border border-teal/30 px-5 py-4 text-[17px] text-teal leading-snug" style={d(1400)}>
          <Ikon nama="grafik" className="flex-shrink-0 mt-0.5" />
          <p className="text-gray-700">Semakin lengkap datanya, semakin baik nilai IPA SKPD.</p>
        </div>
      </div>
    </SlideTerang>
  )
}
