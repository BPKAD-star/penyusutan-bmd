'use client'
// Apakah user login = role 'pengawas' (view-only lintas SKPD, mis. akuntansi/
// auditor). Dipakai UNTUK MENYEMBUNYIKAN tombol tulis (Tambah/Simpan/Approve/
// Hapus/Jalankan Engine) supaya operator tidak klik lalu kena error. Penegak
// SESUNGGUHNYA tetap DB (fn_skpd_visible=false utk pengawas + role guard route),
// jadi walau ada tombol yang kelupaan disembunyikan, data tetap aman.
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export function useIsViewer(): boolean {
  const [isViewer, setIsViewer] = useState(false)
  useEffect(() => {
    let alive = true
    ;(async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user || !alive) return
      const { data } = await supabase.from('admin_profiles').select('role').eq('id', user.id).single()
      if (alive && (data as { role?: string } | null)?.role === 'pengawas') setIsViewer(true)
    })()
    return () => { alive = false }
  }, [])
  return isViewer
}
