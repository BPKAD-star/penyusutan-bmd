'use client'
// Lembar Kerja Inventarisasi — SEMUA jenis aset. Sidebar biasanya mengarahkan ke
// /dashboard/inventarisasi/jenis/<golongan> (terkunci satu jenis); halaman ini
// jadi tampilan gabungan bila diakses langsung.
import DaftarInventarisasi from '@/components/inventarisasi/DaftarInventarisasi'

export default function Page() {
  return <DaftarInventarisasi />
}
