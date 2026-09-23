'use client'
// Lembar Kerja Inventarisasi untuk SATU jenis aset — ditautkan dari submenu
// Sidebar (Inventarisasi > Lembar Kerja > Tanah / Peralatan dan Mesin / …).
// Segmen path dipakai (bukan query string) supaya penanda menu aktif di Sidebar
// — yang membandingkan `pathname` — hanya menyala di satu menu.
import { useParams } from 'next/navigation'
import LembarKerjaInventarisasi from '@/components/inventarisasi/LembarKerjaInventarisasi'

export default function Page() {
  const params = useParams<{ golongan: string }>()
  const golongan = decodeURIComponent((params?.golongan as string) || '')
  // `key` memaksa komponen dibangun ulang saat pindah jenis aset — kalau tidak,
  // filter & halaman milik jenis sebelumnya ikut terbawa diam-diam.
  return <LembarKerjaInventarisasi key={golongan} golongan={golongan} />
}
