'use client'
// ============================================================================
// Mesin state alasan **Koreksi Nilai Perolehan** — centang barang, isi nilai
// barunya. Alasan KELIMA & terakhir yang dipindahkan dari `KoreksiForm`
// (REFACTOR-PLAN Fase 3, langkah 4).
//
// Paling sederhana dari kelimanya: satu peta `aset.id → { barang, nilaiBaru }`.
// Tak ada query sama sekali di sini — barangnya datang dari pemilih bersama
// (./usePemilihBarang.ts), dan angkanya diolah di `simpan()`.
// ============================================================================
import { useState } from 'react'
import type { Barang } from './tipe'

export type ItemNilai = { barang: Barang; nilaiBaru: string }

export type KoreksiNilai = {
  sel: Record<string, ItemNilai>
  list: ItemNilai[]
  jumlah: number
  toggle: (b: Barang) => void
  ubahNilaiBaru: (id: string, v: string) => void
  reset: () => void
}

export function useKoreksiNilai(): KoreksiNilai {
  const [sel, setSel] = useState<Record<string, ItemNilai>>({})

  function toggle(b: Barang) {
    setSel(prev => {
      const next = { ...prev }
      if (next[b.id]) delete next[b.id]
      // Nilai baru DIISI nilai lamanya, bukan dikosongkan: operator hampir
      // selalu membetulkan sebagian digit, dan kotak kosong memaksanya
      // mengetik ulang angka belasan digit yang sudah benar.
      else next[b.id] = { barang: b, nilaiBaru: String(b.nilai_perolehan) }
      return next
    })
  }

  /** ⚠️ Barang yang TIDAK tercentang diabaikan, bukan disisipkan diam-diam. */
  function ubahNilaiBaru(id: string, v: string) {
    setSel(prev => prev[id] ? { ...prev, [id]: { ...prev[id], nilaiBaru: v } } : prev)
  }

  function reset() { setSel({}) }

  const list = Object.values(sel)
  return { sel, list, jumlah: list.length, toggle, ubahNilaiBaru, reset }
}
