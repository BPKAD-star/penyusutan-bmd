'use client'
// Mesin presentasi materi paparan (/materi/<slug>).
//
// Bentuknya sengaja sederhana: SEMUA slide selalu ada di DOM, yang tampil di
// layar cuma yang aktif (`data-aktif`), dan saat DICETAK semuanya tampil —
// satu slide satu halaman 16:9 (aturannya di app/materi/materi.css). Jadi
// "Export PDF" = `window.print()` atas halaman ini sendiri, tanpa pustaka PDF
// & tanpa rute cetak kedua yang bisa menyimpang dari yang dipresentasikan.
//
// Animasi masuk tiap elemen terpicu ulang sendiri tiap slide berganti: slide
// yang tak aktif `display:none`, dan animasi CSS mulai dari awal begitu
// elemennya kembali dirender. Tak ada state animasi di React.
//
// ⚠️ Nama berkas PDF mengikuti JUDUL TAB, yang disetel `generateMetadata` di
// app/materi/[slug]/page.tsx — bukan `document.title` dari sini. Materi bukan
// laporan ber-periode/ber-SKPD, jadi ia sengaja di luar `namaBerkasLaporan`.
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { KonteksSlide } from './bagian'

const LEBAR = 1280
const TINGGI = 720

export default function Deck({ slides, kembali }: {
  slides: ReactNode[]
  /** Ke mana tombol ✕ membawa pulang. */
  kembali: string
}) {
  const total = slides.length
  const [aktif, setAktif] = useState(0)
  const [skala, setSkala] = useState(1)
  const [sembunyi, setSembunyi] = useState(false)
  const [hashTerbaca, setHashTerbaca] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const ke = useCallback((n: number) => setAktif(Math.max(0, Math.min(total - 1, n))), [total])

  // Skala panggung mengikuti jendela — isi slide ditulis dalam px tetap
  // (1280×720), jadi tata letaknya identik di laptop, proyektor, & PDF.
  useEffect(() => {
    const ukur = () => setSkala(Math.min(window.innerWidth / LEBAR, window.innerHeight / TINGGI))
    ukur()
    window.addEventListener('resize', ukur)
    return () => window.removeEventListener('resize', ukur)
  }, [])

  // Nomor slide ikut di URL (#5) supaya muat ulang tak melempar balik ke sampul.
  // Menulis hash baru boleh SESUDAH hash awal terbaca — kalau tidak, efek tulis
  // (yang jalan di render pertama dgn aktif = 0) menimpanya jadi #1 lebih dulu.
  useEffect(() => {
    const n = Number(window.location.hash.slice(1))
    if (Number.isInteger(n) && n >= 1 && n <= total) setAktif(n - 1)
    setHashTerbaca(true)
  }, [total])
  useEffect(() => {
    if (hashTerbaca) window.history.replaceState(null, '', `#${aktif + 1}`)
  }, [aktif, hashTerbaca])

  useEffect(() => {
    const tekan = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      switch (e.key) {
        case 'ArrowRight': case 'PageDown': case ' ': case 'Enter':
          e.preventDefault(); setAktif(a => Math.min(total - 1, a + 1)); break
        case 'ArrowLeft': case 'PageUp': case 'Backspace':
          e.preventDefault(); setAktif(a => Math.max(0, a - 1)); break
        case 'Home': e.preventDefault(); setAktif(0); break
        case 'End': e.preventDefault(); setAktif(total - 1); break
        case 'f': case 'F': layarPenuh(); break
      }
    }
    window.addEventListener('keydown', tekan)
    return () => window.removeEventListener('keydown', tekan)
  }, [total])

  // Bilah kendali menepi sesudah kursor diam — supaya tak menutupi slide saat
  // dipresentasikan — dan kembali begitu kursor bergerak.
  useEffect(() => {
    const bangun = () => {
      setSembunyi(false)
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => setSembunyi(true), 3000)
    }
    bangun()
    window.addEventListener('mousemove', bangun)
    window.addEventListener('touchstart', bangun)
    return () => {
      window.removeEventListener('mousemove', bangun)
      window.removeEventListener('touchstart', bangun)
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  return (
    <div className="mt-root">
      <div className="mt-panggung" style={{ ['--mt-skala' as string]: skala }}>
        {slides.map((s, i) => (
          <section key={i} className="mt-slide" data-aktif={i === aktif}>
            <KonteksSlide.Provider value={{ no: i + 1, total }}>{s}</KonteksSlide.Provider>
          </section>
        ))}
      </div>

      {/* Zona klik kiri/kanan: maju-mundur tanpa harus membidik tombol. */}
      <button aria-label="Slide sebelumnya" onClick={() => ke(aktif - 1)}
        className="mt-tak-cetak absolute left-0 top-0 h-full w-[12%] cursor-w-resize focus:outline-none" />
      <button aria-label="Slide berikutnya" onClick={() => ke(aktif + 1)}
        className="mt-tak-cetak absolute right-0 top-0 h-full w-[12%] cursor-e-resize focus:outline-none" />

      <div className="mt-tak-cetak absolute bottom-0 left-0 right-0 h-1 bg-white/10">
        <div className="h-full bg-teal-light transition-all duration-300" style={{ width: `${((aktif + 1) / total) * 100}%` }} />
      </div>

      <div data-sembunyi={sembunyi}
        className="mt-kendali mt-tak-cetak absolute bottom-5 left-1/2 -translate-x-1/2 flex items-center gap-1 rounded-full bg-black/70 backdrop-blur px-2 py-1.5 text-white text-sm shadow-xl">
        <Tombol label="Sebelumnya (←)" onClick={() => ke(aktif - 1)} mati={aktif === 0}>‹</Tombol>
        <span className="px-2 tabular-nums text-xs text-white/80 select-none">{aktif + 1} / {total}</span>
        <Tombol label="Berikutnya (→)" onClick={() => ke(aktif + 1)} mati={aktif === total - 1}>›</Tombol>
        <span className="w-px h-5 bg-white/20 mx-1" />
        <Tombol label="Layar penuh (F)" onClick={layarPenuh}>⛶</Tombol>
        <button onClick={() => window.print()}
          title="Cetak seluruh slide — pilih tujuan 'Save as PDF'"
          className="px-3 py-1 rounded-full bg-teal hover:bg-teal-light text-xs font-medium transition-colors">
          ⬇ Export PDF
        </button>
        <Link href={kembali} title="Tutup paparan"
          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/[0.15] transition-colors">✕</Link>
      </div>
    </div>
  )
}

function layarPenuh() {
  if (document.fullscreenElement) void document.exitFullscreen()
  else void document.documentElement.requestFullscreen().catch(() => { /* ditolak peramban: biarkan */ })
}

function Tombol({ label, onClick, mati, children }: {
  label: string; onClick: () => void; mati?: boolean; children: ReactNode
}) {
  return (
    <button title={label} aria-label={label} onClick={onClick} disabled={mati}
      className="w-8 h-8 flex items-center justify-center rounded-full text-lg leading-none hover:bg-white/[0.15] disabled:opacity-30 disabled:hover:bg-transparent transition-colors">
      {children}
    </button>
  )
}
