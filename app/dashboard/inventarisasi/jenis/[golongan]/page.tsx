'use client'
// Lembar Kerja Inventarisasi untuk SATU jenis aset — ditautkan dari submenu
// Sidebar (Inventarisasi > Lembar Kerja (LKI) > Tanah / Peralatan dan Mesin / …).
// Segmen path dipakai (bukan query string) supaya penanda menu aktif di Sidebar
// — yang membandingkan `pathname` — hanya menyala di satu menu.
import { useParams } from 'next/navigation'
import DaftarInventarisasi from '@/components/inventarisasi/DaftarInventarisasi'

export default function Page() {
  const params = useParams<{ golongan: string }>()
  const golongan = decodeURIComponent((params?.golongan as string) || '')
  return <DaftarInventarisasi golonganLock={golongan} />
}
