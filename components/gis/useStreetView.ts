'use client'
// Tombol "Street View" GIS Tanah. Google tak punya parameter radius utk link
// Street View, dan tanah yang jauh dari jalan sering dijawab "tak ada Street
// View". Jadi cari dulu titik JALAN terdekat (OpenStreetMap, lib/streetView.ts)
// dan buka Street View DI SANA menghadap ke tanah. Gagal/tak ada jalan → link
// lama (titik tanah apa adanya).
//
// ⚠️ Tab dibuka SEKARANG (sebelum await) lalu diarahkan sesudah jalannya ketemu —
// `window.open` sesudah await diblokir peramban sbg popup.
import { useCallback, useState } from 'react'
import { cariTitikStreetView, urlStreetView, type Titik } from '@/lib/streetView'

export function useStreetView(titik: Titik | null) {
  const [mencari, setMencari] = useState(false)
  const [info, setInfo] = useState<string | null>(null)

  const buka = useCallback(async () => {
    if (!titik || mencari) return
    const tab = window.open('about:blank', '_blank')
    setMencari(true); setInfo(null)
    try {
      const j = await cariTitikStreetView(titik)
      const url = j ? urlStreetView(j, j.heading) : urlStreetView(titik)
      setInfo(j
        ? `Street View dibuka dari jalan terdekat (±${Math.round(j.jarak)} m dari titik), menghadap ke tanah.`
        : 'Jalan terdekat tak ditemukan/terjangkau — Street View dibuka dari titik tanah langsung.')
      if (tab) tab.location.href = url
      else window.open(url, '_blank')
    } finally {
      setMencari(false)
    }
  }, [titik, mencari])

  return { mencari, info, buka, reset: () => setInfo(null) }
}
