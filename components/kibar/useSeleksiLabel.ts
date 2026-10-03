'use client'
// Seleksi barang untuk CETAK LABEL di Daftar Barang (dulu di Pelaporan → KIBAR).
//
// Yang disimpan `LabelItem` JADI, bukan id saja — seleksinya bertahan lintas
// halaman (Daftar Barang dipaginasi di server, jadi baris halaman lain sudah tak
// ada di memori saat operator kembali mencetak), dan LabelSheet cuma butuh itu.
//
// ⚠️ Dibatasi `MAKS_LABEL`: LabelSheet membangkitkan satu QR per label di
// peramban. Centang-semua pada mode "tampilkan semua" (≤ 3.000 baris) tanpa
// batas akan membekukan tab. Yang melewati batas TIDAK dibuang diam-diam —
// `penuh` dipakai pemanggil untuk memberi tahu.
import { useCallback, useState } from 'react'
import type { LabelItem } from './LabelSheet'

export const MAKS_LABEL = 500

export type KandidatLabel = { id: string; item: LabelItem }

export function useSeleksiLabel() {
  const [dipilih, setDipilih] = useState<Map<string, LabelItem>>(new Map())

  const toggle = useCallback((k: KandidatLabel) => {
    setDipilih(prev => {
      const next = new Map(prev)
      if (next.has(k.id)) next.delete(k.id)
      else if (next.size < MAKS_LABEL) next.set(k.id, k.item)
      return next
    })
  }, [])

  /** Centang/lepas SEMUA kandidat halaman ini: kalau semuanya sudah terpilih → lepas, selain itu → tambahkan. */
  const toggleHalaman = useCallback((ks: KandidatLabel[]) => {
    setDipilih(prev => {
      const next = new Map(prev)
      if (ks.length > 0 && ks.every(k => next.has(k.id))) {
        for (const k of ks) next.delete(k.id)
      } else {
        for (const k of ks) {
          if (next.size >= MAKS_LABEL) break
          next.set(k.id, k.item)
        }
      }
      return next
    })
  }, [])

  const reset = useCallback(() => setDipilih(new Map()), [])

  return { dipilih, toggle, toggleHalaman, reset, jumlah: dipilih.size, penuh: dipilih.size >= MAKS_LABEL }
}
