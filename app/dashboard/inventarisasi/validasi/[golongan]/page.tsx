'use client'
// Validasi Inventarisasi untuk SATU jenis aset — submenu Sidebar
// (Inventarisasi > Validasi > Tanah / Peralatan dan Mesin / …). Pola route
// kembar dgn Lembar Kerja (/dashboard/inventarisasi/jenis/<golongan>).
import { useParams } from 'next/navigation'
import ValidasiInventarisasi from '@/components/inventarisasi/ValidasiInventarisasi'

export default function Page() {
  const params = useParams<{ golongan: string }>()
  const golongan = decodeURIComponent((params?.golongan as string) || '')
  return <ValidasiInventarisasi key={golongan} golongan={golongan} />
}
