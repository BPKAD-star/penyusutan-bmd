'use client'
// Banner info di halaman laporan yang punya pemilih tahun/semester — muncul
// kalau tahun yang DILIHAT sudah tutup buku (terkunci). Murni informatif:
// bukan larangan (laporan tahun terkunci justru itu yang paling sering dicari —
// angka final/teraudit), cuma penanda supaya jelas ini bukan angka berjalan.
import { useTahunBukuMap } from './useTahunBuku'

export default function TahunTerkunciNote({ tahun }: { tahun: number }) {
  const map = useTahunBukuMap()
  if (map[tahun] !== 'terkunci') return null
  return (
    <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4">
      🔒 Tahun {tahun} sudah tutup buku (terkunci) — angka ini final/teraudit, tidak bisa ditambah transaksi baru ke tahun ini.
    </p>
  )
}
