'use client'
// Dashboard muat PAS di layar tiap pengguna, tanpa scroll (permintaan user
// 2026-10-02). Sebelumnya tingginya "dipaskan" lewat angka px di kartu
// (min-h-[164px], last:mb-0, …) untuk SATU kombinasi layar (1920×1080 zoom
// 90%) — begitu jendela peramban lebih pendek 34 px karena ada bookmark bar,
// scrollbar muncul lagi. Bukan soal akun: dua tangkapan layar berbeda cuma
// beda tinggi viewport-nya.
//
// Caranya CSS `zoom` yang dihitung dari tinggi wadah (`main`) — persis efek
// Ctrl −/+ yang selama ini dilakukan manual. Sengaja `zoom`, BUKAN
// `transform: scale`: kartu-kartu dashboard merender popup `fixed inset-0`
// DI DALAM subtree-nya, dan leluhur ber-transform menjadikan dirinya
// containing block untuk elemen fixed → popup terperangkap & terpotong.
// `zoom` tak punya efek itu (popup tetap menutup viewport, cuma ikut
// terskala seperti halaman yang di-zoom).
//
// Aturan:
//  · Hanya di lebar ≥ 1024 px. Di bawah itu kartu menumpuk satu kolom dan
//    halaman memang panjang — memaksa muat satu layar cuma mengecilkan huruf.
//  · Dibatasi 0,6–1,25. Di bawah 0,6 huruf tak terbaca → biarkan `main`
//    menggulir seperti biasa; di atas 1,25 layar sangat besar jadi
//    berlebihan.
//  · Tiap hitung MULAI dari zoom 1 (bukan dari zoom sebelumnya) supaya
//    hasilnya fungsi murni dari (tinggi wadah, isi) — pengamat ukuran yang
//    terpicu oleh perubahan zoom-nya sendiri menghasilkan angka yang sama &
//    berhenti, tak berosilasi.
//  · Isi dashboard datang bertahap (Suspense) → pengamat ukuran menghitung
//    ulang tiap isinya berubah.
import { useLayoutEffect, useRef } from 'react'

const ZOOM_MIN = 0.6
const ZOOM_MAX = 1.25
const LEBAR_MIN_PX = 1024

export default function FitLayar({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const el = ref.current
    const host = el?.parentElement
    if (!el || !host) return

    // Tinggi VISUAL (sesudah zoom) — sebanding dgn `host.clientHeight`.
    const tinggi = () => el.getBoundingClientRect().height

    function hitung() {
      if (!el || !host) return
      const H = host.clientHeight - 1 // sisa 1 px: cegah scrollbar 1 px akibat pembulatan
      if (window.innerWidth < LEBAR_MIN_PX || H <= 0) { el.style.zoom = ''; return }
      let z = 1
      el.style.zoom = '1'
      for (let i = 0; i < 6; i++) {
        const h = tinggi()
        if (h <= 0) break
        const next = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z * (H / h)))
        if (Math.abs(next - z) < 0.004) break
        z = next
        el.style.zoom = String(z)
      }
      // Jaminan akhir: reflow bisa membuat tinggi meleset sedikit dari
      // perkiraan linear. Kalau masih melebihi, kecilkan sekali lagi.
      const h = tinggi()
      if (h > H && z > ZOOM_MIN) z = Math.max(ZOOM_MIN, z * (H / h))
      el.style.zoom = z.toFixed(3)
    }

    let raf = 0
    const jadwalkan = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(hitung) }

    hitung()
    // rAF, bukan langsung: mengubah ukuran elemen di dalam callback pengamat
    // memicu "ResizeObserver loop completed with undelivered notifications".
    const ro = new ResizeObserver(jadwalkan)
    ro.observe(host)
    ro.observe(el)
    return () => { cancelAnimationFrame(raf); ro.disconnect(); el.style.zoom = '' }
  }, [])

  return <div ref={ref}>{children}</div>
}
