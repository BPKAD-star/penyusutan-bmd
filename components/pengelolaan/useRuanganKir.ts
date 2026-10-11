'use client'
// Daftar ruangan KIR satu SKPD untuk popup Edit Spesifikasi (Pengadaan &
// PerolehanManual). Dimuat HANYA saat popup dibuka (`aktif`) — kebanyakan
// kartu tak pernah membukanya. Kegagalan memuat dilaporkan lewat `galat`, TIDAK
// jadi "belum ada ruangan": operator yang diberi tahu "belum ada ruangan" akan
// membuat ruangan yang sebenarnya sudah ada.
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { muatRuanganSkpd, type RuanganOpsi } from '@/lib/kirOtomatis'

export function useRuanganKir(skpdId: number | null, aktif: boolean) {
  const [opsi, setOpsi] = useState<RuanganOpsi[]>([])
  const [galat, setGalat] = useState('')
  const [memuat, setMemuat] = useState(false)

  useEffect(() => {
    if (!aktif || !skpdId) return
    let batal = false
    setMemuat(true); setGalat('')
    muatRuanganSkpd(createClient(), skpdId)
      .then(r => { if (!batal) setOpsi(r) })
      .catch(e => { if (!batal) { setOpsi([]); setGalat(e instanceof Error ? e.message : String(e)) } })
      .finally(() => { if (!batal) setMemuat(false) })
    return () => { batal = true }
  }, [skpdId, aktif])

  return { opsi, galat, memuat }
}
