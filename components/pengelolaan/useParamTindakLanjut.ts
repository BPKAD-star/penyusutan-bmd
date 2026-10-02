'use client'
// Parameter URL dari tombol "Kerjakan →" menu Inventarisasi → Tindak Lanjut
// (Fase 2, 2026-10-02). Dibaca SEKALI saat halaman dibuka — sesudah itu operator
// bebas mengganti SKPD/alasan tanpa form terisi ulang diam-diam.
//
// Kembalian `null` = halaman dibuka biasa (tak ada `skpd` di URL). Pola yang
// sama dgn deep-link `?skpd=&nibar=` di Pengamanan/Pemanfaatan.
import { useEffect, useState } from 'react'

export function useParamTindakLanjut(wajib: string): Record<string, string> | null {
  const [p, setP] = useState<Record<string, string> | null>(null)
  useEffect(() => {
    const q = new URLSearchParams(window.location.search)
    if (q.get('skpd') && q.get(wajib)) setP(Object.fromEntries(q.entries()))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  return p
}
