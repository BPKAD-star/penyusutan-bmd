import Link from 'next/link'

const ITEMS = [
  { href: '/dashboard/pelaporan/perolehan/pengadaan', label: 'Laporan Pengadaan' },
  { href: '/dashboard/pelaporan/perolehan/hibah', label: 'Laporan Hibah' },
  { href: '/dashboard/pelaporan/perolehan/inventarisasi', label: 'Laporan Hasil Inventarisasi' },
  { href: '/dashboard/pelaporan/perolehan/lainnya', label: 'Laporan Perolehan Lainnya' },
]

export default function Page() {
  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Laporan Perolehan</h1>
        <p className="text-gray-500 text-sm mt-1">Pilih jenis perolehan untuk melihat rekap & export.</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-3xl">
        {ITEMS.map(it => (
          <Link key={it.href} href={it.href} className="card p-5 hover:border-teal transition-colors">
            <p className="font-semibold text-gray-800">{it.label}</p>
          </Link>
        ))}
      </div>
    </div>
  )
}
