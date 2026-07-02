import Link from 'next/link'

const ITEMS = [
  { href: '/dashboard/pelaporan/pengelolaan/penggunaan', label: 'Laporan Penggunaan' },
  { href: '/dashboard/pelaporan/pengelolaan/penerimaan', label: 'Laporan Penerimaan Internal' },
  { href: '/dashboard/pelaporan/pengelolaan/pengeluaran', label: 'Laporan Pengeluaran Internal' },
  { href: '/dashboard/pelaporan/pengelolaan/reklasifikasi', label: 'Laporan Reklasifikasi' },
  { href: '/dashboard/pelaporan/pengelolaan/koreksi', label: 'Laporan Koreksi' },
  { href: '/dashboard/pelaporan/pengelolaan/kapitalisasi', label: 'Laporan Kapitalisasi' },
  { href: '/dashboard/pelaporan/pengelolaan/penghapusan', label: 'Laporan Penghapusan' },
]

export default function Page() {
  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Laporan Pengelolaan</h1>
        <p className="text-gray-500 text-sm mt-1">Pilih jenis pengelolaan untuk melihat rekap & export.</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {ITEMS.map(it => (
          <Link key={it.href} href={it.href} className="card p-5 hover:border-teal transition-colors">
            <p className="font-semibold text-gray-800">{it.label}</p>
          </Link>
        ))}
      </div>
    </div>
  )
}
