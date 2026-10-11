'use client'
// Pencatat kunjungan halaman (migrasi 20261011_02). Dipasang sekali di
// DashboardChrome; tiap pindah halaman dashboard mengirim satu panggilan kecil
// di latar. Halaman yang sama dalam 2 menit tak dihitung ulang (muat ulang /
// bolak-balik tab tak menggelembungkan angka). Gagal = diam: pencatatan tak
// boleh pernah mengganggu kerja operator.
import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { normalisasiHalaman } from '@/lib/aktivitasPengguna'
import { catatKunjungan } from '@/lib/aktivitasPenggunaData'

const JEDA_MS = 2 * 60 * 1000
const terakhirDicatat = new Map<string, number>()

export default function AktivitasTracker() {
  const pathname = usePathname()
  useEffect(() => {
    const halaman = normalisasiHalaman(pathname || '')
    if (!halaman) return
    const kini = Date.now()
    if (kini - (terakhirDicatat.get(halaman) ?? 0) < JEDA_MS) return
    terakhirDicatat.set(halaman, kini)
    catatKunjungan(createClient(), halaman)
  }, [pathname])
  return null
}
