'use client'
// Kecamatan di GIS Tanah: memuat poligon (sekali, lazy), menentukan tiap tanah
// berada di kecamatan mana MENURUT TITIK DI PETA, & memegang pilihan aktif.
// Aturan & alasannya di lib/gisKecamatan.ts.
import { useEffect, useMemo, useState } from 'react'
import { buatPenentuKecamatan, type KoleksiKecamatan } from '@/lib/gisKecamatan'

const URL_BERKAS = '/gis/kecamatan-kediri.geojson'

type BarisTitik = { id: string; latitude: number | null; longitude: number | null }
type BidangTitik = { latitude: number | null; longitude: number | null }

export function useKecamatan(rows: BarisTitik[], bidangByAset: Record<string, BidangTitik[]>) {
  const [fc, setFc] = useState<KoleksiKecamatan | null>(null)
  const [galat, setGalat] = useState<string | null>(null)
  const [terpilih, setTerpilih] = useState<string | null>(null)

  useEffect(() => {
    let batal = false
    fetch(URL_BERKAS)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() as Promise<KoleksiKecamatan> })
      .then(d => { if (!batal) setFc(d) })
      .catch(e => { if (!batal) setGalat(e instanceof Error ? e.message : 'gagal memuat batas kecamatan') })
    return () => { batal = true }
  }, [])

  // id register → kode kecamatan, `null` = titiknya ada tapi di luar semua
  // kecamatan. Register TANPA titik apa pun tak punya entri sama sekali (tak
  // bisa dinilai ≠ di luar batas). Titik yang dipakai = yang digambar di peta:
  // register dulu, cadangan = titik bidang pertama (lihat `markers` PetaView).
  const kecOf = useMemo(() => {
    const m = new Map<string, string | null>()
    if (!fc) return m
    const tentukan = buatPenentuKecamatan(fc)
    for (const r of rows) {
      let lat = r.latitude, lng = r.longitude
      if (lat == null || lng == null) {
        const b = (bidangByAset[r.id] || []).find(x => x.latitude != null && x.longitude != null)
        if (!b) continue
        lat = b.latitude; lng = b.longitude
      }
      m.set(r.id, tentukan(lat as number, lng as number))
    }
    return m
  }, [fc, rows, bidangByAset])

  return { fc, galat, terpilih, setTerpilih, kecOf }
}
