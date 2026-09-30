import { redirect } from 'next/navigation'

// Rute lama (satu sub-menu per jenis aset) — kini pengalih ke halaman Validasi
// tunggal dgn jenisnya terpilih, supaya pranala yang terlanjur tersebar tak mati.
export default function Page({ params }: { params: { golongan: string } }) {
  redirect(`/dashboard/inventarisasi/validasi?jenis=${encodeURIComponent(decodeURIComponent(params.golongan))}`)
}
