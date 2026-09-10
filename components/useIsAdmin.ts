'use client'
// Apakah user login = role 'admin' (Pengelola Barang / BKAD, admin pemda).
// Dipakai buat MENYEMBUNYIKAN tab/tombol "Rekap per SKPD" dari pengurus
// barang di menu Pelaporan (keputusan user 2026-09-10) — rekap lintas-SKPD
// itu wewenang admin pemda; pengurus barang cuma boleh kerja di SKPD-nya
// sendiri. Data-nya sendiri sudah aman tanpa hook ini (SkpdCombobox
// lockToOperator mengunci pilihan SKPD non-admin + RLS transaksi_bmd/aset
// menolak baris di luar itu), jadi ini murni kerapian UI — jangan menawarkan
// tombol yang hasilnya cuma matriks satu-SKPD yang membingungkan.
// Pola SAMA PERSIS dgn useIsViewer.ts (hook kembar, sengaja tak digabung ke
// satu hook ber-return object — dua boolean independen, dua concern beda).
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export function useIsAdmin(): boolean {
  const [isAdmin, setIsAdmin] = useState(false)
  useEffect(() => {
    let alive = true
    ;(async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user || !alive) return
      const { data } = await supabase.from('admin_profiles').select('role').eq('id', user.id).single()
      if (alive && (data as { role?: string } | null)?.role === 'admin') setIsAdmin(true)
    })()
    return () => { alive = false }
  }, [])
  return isAdmin
}
