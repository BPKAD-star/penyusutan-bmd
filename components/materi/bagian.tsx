'use client'
// Bahan penyusun slide materi paparan — dipakai bersama semua materi supaya
// tampilannya satu keluarga. Ukuran di sini dalam px TETAP: panggungnya
// 1280×720 dan diskalakan utuh oleh Deck (lihat app/materi/materi.css).
import { createContext, useContext, useId, type CSSProperties, type ReactNode } from 'react'

export const KonteksSlide = createContext<{ no: number; total: number }>({ no: 1, total: 1 })

/** Jeda animasi masuk: `style={d(300)}` → mulai 300 ms sesudah slide tampil. */
export const d = (ms: number): CSSProperties => ({ ['--d' as string]: `${ms}ms` })

const MERAH = '#f44141'

export function Merek({ gelap, besar }: { gelap?: boolean; besar?: boolean }) {
  return (
    <span className={`font-bold leading-none ${besar ? 'text-[92px] tracking-tight' : 'text-[15px]'}`}>
      <span style={{ color: gelap ? '#ffffff' : '#264c7d' }}>SMART</span>{' '}
      <span style={{ color: gelap ? '#ff6b6b' : MERAH }}>Asset</span>
    </span>
  )
}

function Kaki({ gelap, materi }: { gelap?: boolean; materi: string }) {
  const { no, total } = useContext(KonteksSlide)
  return (
    <div className={`absolute left-16 right-16 bottom-7 flex items-center justify-between text-[13px] ${gelap ? 'text-white/50' : 'text-gray-400'}`}>
      <div className="flex items-center gap-2.5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-kab-kediri.png" alt="" className="w-6 h-6 object-contain" />
        <Merek gelap={gelap} />
        <span className="opacity-60">·</span>
        <span>{materi}</span>
      </div>
      <span className="tabular-nums">{String(no).padStart(2, '0')} / {String(total).padStart(2, '0')}</span>
    </div>
  )
}

/** Slide isi (latar terang): label kecil + judul di atas, isi di bawahnya. */
export function SlideTerang({ label, judul, materi, children }: {
  label: string; judul: ReactNode; materi: string; children: ReactNode
}) {
  return (
    <div className="absolute inset-0 bg-white text-gray-800">
      <div className="absolute -top-40 -right-40 w-[520px] h-[520px] rounded-full bg-teal/[0.07]" />
      <div className="absolute -bottom-52 -left-40 w-[460px] h-[460px] rounded-full bg-navy/[0.05]" />
      <div className="absolute left-0 top-0 h-full w-2 bg-gradient-to-b from-teal to-navy" />
      <div className="absolute left-16 right-16 top-12">
        <p className="mt-in flex items-center gap-3 text-[14px] font-semibold tracking-[0.18em] uppercase text-teal">
          <span className="mt-lebar inline-block w-10 h-[3px] bg-teal rounded-full" />{label}
        </p>
        <h2 className="mt-up mt-3 text-[40px] leading-[1.15] font-bold text-navy" style={d(80)}>{judul}</h2>
      </div>
      <div className="absolute left-16 right-16 top-[170px] bottom-[76px]">{children}</div>
      <Kaki materi={materi} />
    </div>
  )
}

/** Slide sampul / pembatas bagian / penutup (latar navy, ornamen bergerak). */
export function SlideGelap({ materi, children, tanpaKaki }: {
  materi: string; children: ReactNode; tanpaKaki?: boolean
}) {
  // id pola WAJIB unik per slide: semua slide ada di DOM sekaligus, dan pola
  // milik slide yang sedang `display:none` tak bisa dirujuk slide lain.
  const kisi = `mt-kisi-${useId().replace(/:/g, '')}`
  return (
    <div className="absolute inset-0 text-white" style={{ background: 'linear-gradient(135deg, #0f2038 0%, #1e3a5f 52%, #0d5f66 100%)' }}>
      <div className="mt-apung absolute -top-32 -left-24 w-[420px] h-[420px] rounded-full bg-teal-light/10 blur-2xl" />
      <div className="mt-apung absolute -bottom-40 right-40 w-[480px] h-[480px] rounded-full bg-sky-400/10 blur-2xl" style={d(1800)} />
      <svg className="absolute inset-0 w-full h-full opacity-[0.07]" aria-hidden>
        <defs>
          <pattern id={kisi} width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M40 0H0V40" fill="none" stroke="#fff" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#${kisi})`} />
      </svg>
      {children}
      {!tanpaKaki && <Kaki gelap materi={materi} />}
    </div>
  )
}

// Ikon garis 24×24 (gaya yang sama dgn ikon Sidebar aplikasi).
const JALUR = {
  rumah: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6',
  dokumen: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
  daftar: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01',
  periksa: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4',
  buku: 'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253',
  peta: 'M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7',
  pin: 'M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0zM15 11a3 3 0 11-6 0 3 3 0 016 0z',
  truk: 'M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1M5 17a2 2 0 104 0m-4 0a2 2 0 114 0m6 0a2 2 0 104 0m-4 0a2 2 0 114 0',
  grafik: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z',
  turun: 'M13 17h8m0 0V9m0 8l-8-8-4 4-6-6',
  bola: 'M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9',
  map: 'M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z',
  hitung: 'M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z',
  centang: 'M5 13l4 4L19 7',
  orang: 'M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0zm6 2a9 9 0 11-18 0 9 9 0 0118 0z',
  kamera: 'M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9zM15 13a3 3 0 11-6 0 3 3 0 016 0z',
  perisai: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z',
  qr: 'M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z',
  gembok: 'M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z',
  ulang: 'M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15',
  obrolan: 'M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z',
  kalender: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',
  pensil: 'M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z',
  gedung: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4',
  keranjang: 'M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z',
  tukar: 'M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4',
  lampu: 'M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z',
  cetak: 'M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z',
  cari: 'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z',
} as const

export type NamaIkon = keyof typeof JALUR

export function Ikon({ nama, ukuran = 24, className, tebal = 1.8 }: {
  nama: NamaIkon; ukuran?: number; className?: string; tebal?: number
}) {
  return (
    <svg width={ukuran} height={ukuran} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={tebal} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d={JALUR[nama]} />
    </svg>
  )
}

/** Bulatan bernomor untuk langkah-langkah. */
export function Nomor({ n, gelap }: { n: number; gelap?: boolean }) {
  return (
    <span className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-[18px] font-bold ${
      gelap ? 'bg-white text-navy' : 'bg-navy text-white'}`}>{n}</span>
  )
}

/** Jejak menu: "GIS Tanah › Peta › Set Titik Koordinat". */
export function Jejak({ langkah }: { langkah: string[] }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {langkah.map((l, i) => (
        <span key={i} className="inline-flex items-center gap-1.5">
          {i > 0 && <span className="text-teal font-bold">›</span>}
          <span className="px-2.5 py-1 rounded-md bg-navy/[0.07] text-navy text-[15px] font-semibold whitespace-nowrap">{l}</span>
        </span>
      ))}
    </span>
  )
}
