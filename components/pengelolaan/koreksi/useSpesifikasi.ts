'use client'
// ============================================================================
// Mesin state alasan **Koreksi Spesifikasi Barang** — centang barang (boleh
// banyak) → satu popup mengubah field yang sama untuk semuanya.
//
// Diangkat dari `KoreksiForm` 2026-09-15 (REFACTOR-PLAN Fase 3).
//
// ✅ Fase 1 (2026-09-15): `openModal()` tak lagi menelan `error`. Dulu query
// yang gagal membuat popup terbuka dgn field KOSONG — dan operator yang
// menekan Simpan di situ menulis kekosongan itu ke register sbg "koreksi".
// ============================================================================
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { allSameGolongan, koreksiFieldKeys } from '@/lib/asetFields'
import { newKey } from './usePemecahan'
import type { Barang, SpekEdit } from './tipe'

export type Spesifikasi = {
  sel: Record<string, Barang>
  setSel: React.Dispatch<React.SetStateAction<Record<string, Barang>>>
  list: Barang[]
  sameGol: boolean
  toggle: (b: Barang) => void
  modalOpen: boolean
  setModalOpen: (v: boolean) => void
  openModal: () => Promise<void>
  initFields: Record<string, string>
  initFoto: string[]
  prefix: string
  edit: SpekEdit | null
  setEdit: (e: SpekEdit | null) => void
  reset: () => void
}

/**
 * @param preset barang yang sudah tercentang sejak awal — pintasan "✎ Spesifikasi"
 *   dari kartu Pemecahan. Dibaca SEKALI sbg nilai awal; menggantinya kemudian
 *   tak memindahkan centang (pola `useState(() => …)` yang memang disengaja).
 */
export function useSpesifikasi(preset: { barang: Barang } | null | undefined, onErr: (msg: string) => void): Spesifikasi {
  const supabase = createClient()

  const [sel, setSel] = useState<Record<string, Barang>>(preset ? { [preset.barang.id]: preset.barang } : {})
  const [modalOpen, setModalOpen] = useState(false)
  const [initFields, setInitFields] = useState<Record<string, string>>({})
  const [initFoto, setInitFoto] = useState<string[]>([])
  const [prefix, setPrefix] = useState('')
  const [edit, setEdit] = useState<SpekEdit | null>(null)

  const list = Object.values(sel)
  // Barang beda GOLONGAN tak boleh digabung dalam satu popup — kolom
  // spesifikasinya berbeda, jadi field yang ditawarkan tak bisa disatukan.
  const sameGol = allSameGolongan(list.map(b => b.kode))

  function toggle(b: Barang) {
    setSel(prev => {
      const next = { ...prev }
      if (next[b.id]) delete next[b.id]; else next[b.id] = b
      return next
    })
    setEdit(null) // seleksi berubah → edit tersusun tak lagi valid
  }

  // Buka popup: single → prefill nilai field & foto barang; bulk → kosong.
  // ⚠️ Prefix penyimpanan foto ikut bercabang: SATU barang memakai id-nya
  // sendiri (jadi unggahan ulang menimpa berkas yang sama), banyak barang
  // memakai kunci acak — kalau tidak, foto massal saling menimpa.
  async function openModal() {
    if (list.length === 0 || !sameGol) return
    const single = list.length === 1
    setPrefix(`draft/koreksi-spek/${single ? list[0].id : newKey()}`)
    if (single) {
      const b = list[0]
      const keys = koreksiFieldKeys(b.kode)
      const { data, error } = await supabase.from('aset').select([...keys, 'foto_paths'].join(',')).eq('id', b.id).single()
      // ⚠️ Popup TIDAK dibuka kalau prefill-nya gagal: field kosong di popup
      // koreksi spesifikasi terbaca sbg "nilai lamanya memang kosong", dan
      // Simpan akan menuliskannya ke register.
      if (error) { onErr(`gagal memuat spesifikasi barang: ${error.message}`); return }
      const row = (data || {}) as Record<string, unknown>
      const f: Record<string, string> = {}
      for (const k of keys) { const v = row[k]; if (v != null) f[k] = String(v) }
      setInitFields(f)
      setInitFoto(Array.isArray(row.foto_paths) ? (row.foto_paths as string[]) : [])
    } else {
      setInitFields({}); setInitFoto([])
    }
    setModalOpen(true)
  }

  function reset() { setSel({}); setEdit(null); setModalOpen(false) }

  return { sel, setSel, list, sameGol, toggle, modalOpen, setModalOpen, openModal, initFields, initFoto, prefix, edit, setEdit, reset }
}
