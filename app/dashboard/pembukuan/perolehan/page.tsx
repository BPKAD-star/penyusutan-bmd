import Link from 'next/link'

const ITEMS = [
  { href: '/dashboard/pembukuan/perolehan/pengadaan', label: 'Pengadaan', desc: 'Import pengadaan barang dari template e-bmd' },
  { href: '/dashboard/pembukuan/perolehan/hibah', label: 'Hibah', desc: 'Barang hibah masuk (BA hibah)' },
  { href: '/dashboard/pembukuan/perolehan/inventarisasi', label: 'Hasil Inventarisasi', desc: 'Temuan hasil inventarisasi' },
  { href: '/dashboard/pembukuan/perolehan/lainnya', label: 'Perolehan Lainnya', desc: 'Cara perolehan lain yang sah' },
]

export default function Page() {
  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Pembukuan — Cara Perolehan</h1>
        <p className="text-gray-500 text-sm mt-1">Pilih jenis perolehan untuk mengimport data BMD baru.</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-3xl">
        {ITEMS.map(it => (
          <Link key={it.href} href={it.href} className="card p-5 hover:border-teal transition-colors">
            <p className="font-semibold text-gray-800">{it.label}</p>
            <p className="text-sm text-gray-500 mt-1">{it.desc}</p>
          </Link>
        ))}
      </div>
    </div>
  )
}
