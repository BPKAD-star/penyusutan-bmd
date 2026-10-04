'use client'
// Sisi browser cache peta GIS Tanah — aturan & alasannya di ./cacheGis.ts.
//
// `basi` = yang tampil SEKARANG data tersimpan (belum segar); selama itu
// pemanggil WAJIB mematikan aksi tulis. Pemuat data server memanggil
// `tandaiSegar()` begitu hasilnya (sukses MAUPUN gagal) dipasang — sesudah itu
// pembacaan cache yang kebetulan selesai belakangan TIDAK boleh menimpanya.
import { useCallback, useEffect, useRef, useState } from 'react'
import { uidSesi } from '@/components/dashboard/CadanganDashboard'
import { bacaCache, tulisCache } from '@/components/dashboard/cacheDashboard'
import { pakGis, bukaPakGis, sahPakGis, type AsetGis, type BidangGis } from './cacheGis'

export function useCacheGis(p: {
  rows: AsetGis[]
  bidangByAset: Record<string, BidangGis[]>
  loading: boolean
  error: string | null
  pulihkan: (rows: AsetGis[], bidangByAset: Record<string, BidangGis[]>) => void
}) {
  const { rows, bidangByAset, loading, error } = p
  const [tersimpanPada, setTersimpanPada] = useState<number | null>(null)
  const [uid, setUid] = useState<string | null>(null)
  const segarRef = useRef(false)
  const pulihkanRef = useRef(p.pulihkan)
  pulihkanRef.current = p.pulihkan
  const basi = tersimpanPada != null

  useEffect(() => {
    let batal = false
    void (async () => {
      const u = await uidSesi()
      if (batal) return
      setUid(u)
      if (!u || segarRef.current) return
      const c = bacaCache(window.sessionStorage, u, 'gis', sahPakGis)
      if (!c || segarRef.current) return
      const isi = bukaPakGis(c.data)
      pulihkanRef.current(isi.rows, isi.bidangByAset)
      setTersimpanPada(c.t)
    })()
    return () => { batal = true }
  }, [])

  // Simpan tiap kali data SEGAR berubah — sesudah muat awal, dan sesudah tiap
  // tulisan (Set/Hapus Titik memperbarui `rows`/`bidangByAset`, Kelola Bidang
  // memuat ulang baris aset & bidangnya). Hasil yang gagal TAK pernah disimpan.
  useEffect(() => {
    if (loading || error || basi || !segarRef.current || !uid) return
    tulisCache(window.sessionStorage, uid, 'gis', pakGis(rows, bidangByAset))
  }, [rows, bidangByAset, loading, error, basi, uid])

  const tandaiSegar = useCallback(() => { segarRef.current = true; setTersimpanPada(null) }, [])

  return { tersimpanPada, basi, tandaiSegar }
}
