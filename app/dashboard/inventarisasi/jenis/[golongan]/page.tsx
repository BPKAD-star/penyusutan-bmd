import { redirect } from 'next/navigation'

// Rute lama (satu sub-menu per jenis aset) — kini pengalih ke halaman Lembar
// Kerja tunggal dgn jenisnya terpilih, supaya pranala yang terlanjur tersebar
// (termasuk bookmark petugas) tak mati.
export default function Page({ params }: { params: { golongan: string } }) {
  redirect(`/dashboard/inventarisasi/lembar-kerja?jenis=${encodeURIComponent(decodeURIComponent(params.golongan))}`)
}
