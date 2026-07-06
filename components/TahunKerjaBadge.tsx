'use client'
// Badge "Tahun Kerja" di TopBar — penanda visual tahun buku yang sedang terbuka
// (bisa entry transaksi baru), dibaca dari tahun_buku. Murni UI/UX; penegak
// sesungguhnya tetap trigger fn_cek_tahun_buku di server (lihat migrasi 23).
import { useTahunBukuMap } from './useTahunBuku'

export default function TahunKerjaBadge() {
  const map = useTahunBukuMap()
  const openYears = Object.entries(map).filter(([, s]) => s === 'terbuka').map(([y]) => Number(y))
  if (openYears.length === 0) return null
  const tahunKerja = Math.max(...openYears)
  return (
    <span
      className="hidden sm:inline-flex items-center text-xs font-medium bg-teal/10 text-teal px-2.5 py-1 rounded-full"
      title="Tahun buku yang sedang berjalan — transaksi baru hanya bisa dicatat di tahun ini."
    >
      Tahun Kerja {tahunKerja}
    </span>
  )
}
