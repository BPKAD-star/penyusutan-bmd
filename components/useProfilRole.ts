'use client'
// Role + SKPD user login — query paling ringan yang cukup (SATU baris
// admin_profiles), dipakai buat gerbang "Rekap per SKPD" berjenjang
// (keputusan user 2026-09-10). SENGAJA bukan `fetchApprovalScope`
// (lib/roles.ts): fungsi itu, untuk role pengurus_barang, ikut menyisir
// SELURUH `admin_skpd` (≤5000 baris) demi menghitung `bawahan` — padahal
// komponen laporan yang memakai hook ini SUDAH menarik seluruh admin_skpd
// sendiri lewat `useSkpdTree()` (buat rootOf/childrenOf). Memanggil
// fetchApprovalScope di sini berarti menyisir tabel yang sama DUA KALI.
// "Punya anak SKPD atau tidak" cukup dijawab pemanggil sendiri:
// `childrenOf.get(skpdId)` dari `useSkpdTree()` yang sudah dimuatnya.
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export type ProfilRole = { role: string | null; skpdId: number | null }
const KOSONG: ProfilRole = { role: null, skpdId: null }

export function useProfilRole(): ProfilRole {
  const [p, setP] = useState<ProfilRole>(KOSONG)
  useEffect(() => {
    let alive = true
    ;(async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user || !alive) return
      const { data } = await supabase.from('admin_profiles').select('role,skpd_id').eq('id', user.id).single()
      const row = data as { role: string | null; skpd_id: number | null } | null
      if (alive && row) setP({ role: row.role, skpdId: row.skpd_id })
    })()
    return () => { alive = false }
  }, [])
  return p
}
