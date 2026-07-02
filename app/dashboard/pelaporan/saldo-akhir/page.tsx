import Link from 'next/link'

const ITEMS = [
  { href: '/dashboard/pelaporan/saldo-akhir/rekapitulasi', label: 'Rekapitulasi', desc: 'Rekap nilai & penyusutan per golongan s.d. akhir tahun berjalan' },
]

export default function Page() {
  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Saldo Akhir</h1>
        <p className="text-gray-500 text-sm mt-1">Posisi BMD dan akumulasi penyusutan sampai dengan akhir tahun berjalan.</p>
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
