import Link from 'next/link'

const ITEMS = [
  { href: '/dashboard/pembukuan/pengelolaan/penggunaan', label: 'Penggunaan', desc: 'BMD masuk dari pengalihan status SKPD lain (display-only)' },
  { href: '/dashboard/pembukuan/pengelolaan/penerimaan', label: 'Penerimaan Internal', desc: 'BMD masuk dari sub-SKPD satu induk (display-only)' },
  { href: '/dashboard/pembukuan/pengelolaan/pengeluaran', label: 'Pengeluaran Internal', desc: 'Pindahkan BMD ke sub-SKPD lain satu induk' },
  { href: '/dashboard/pembukuan/pengelolaan/reklasifikasi', label: 'Reklasifikasi', desc: 'Ganti kode barang' },
  { href: '/dashboard/pembukuan/pengelolaan/koreksi', label: 'Koreksi', desc: 'Koreksi nilai / spesifikasi' },
  { href: '/dashboard/pembukuan/pengelolaan/kapitalisasi', label: 'Kapitalisasi', desc: 'Rehab / penambahan masa manfaat' },
  { href: '/dashboard/pembukuan/pengelolaan/penghapusan', label: 'Penghapusan', desc: 'Pemindahtanganan / pengalihan status / sebab lain' },
]

export default function Page() {
  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Pembukuan — Pengelolaan</h1>
        <p className="text-gray-500 text-sm mt-1">Setiap entry tercatat sebagai transaksi permanen di ledger (koreksi = transaksi baru).</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
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
