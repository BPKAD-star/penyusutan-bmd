'use client'
// ============================================================================
// Mesin state alasan **Koreksi Pencatatan Ganda** — barang tercatat dua kali,
// satu bertahan (survivor) & sisanya dinonaktifkan.
//
// Diangkat dari `KoreksiForm` 2026-09-15 (REFACTOR-PLAN Fase 3). Aturannya
// (apa yang boleh berbeda antar duplikat, dan mana yang MEMBLOKIR) →
// lib/pencatatanGanda.ts, dikunci test terpisah.
//
// ⚠️ MURNI PINDAH — termasuk `cari()` yang tak memeriksa `error`. Lihat
// catatannya di bawah; membetulkannya bareng pemindahan membuat pemindahan
// ini tak bisa dibuktikan setara.
// ============================================================================
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { bedaKandidat } from '@/lib/pencatatanGanda'
import type { Kandidat } from './tipe'

const KANDIDAT_COLS = 'id,nibar,kode,nama_barang,spesifikasi_lainnya,nilai_perolehan,tgl_perolehan'

export type PencatatanGanda = {
  q: string
  setQ: (v: string) => void
  hasil: Kandidat[]
  kandidat: Kandidat[]
  survivorId: string | null
  setSurvivorId: (id: string | null) => void
  cari: () => Promise<void>
  tambah: (k: Kandidat) => void
  hapus: (id: string) => void
  reset: () => void
  beda: { kode: boolean; nilai: boolean; tahun: boolean; nama: boolean }
}

export function usePencatatanGanda(skpdId: number | null): PencatatanGanda {
  const supabase = createClient()

  const [q, setQ] = useState('')
  const [hasil, setHasil] = useState<Kandidat[]>([])
  const [kandidat, setKandidat] = useState<Kandidat[]>([])
  const [survivorId, setSurvivorId] = useState<string | null>(null)

  async function cari() {
    if (!q.trim()) return
    // ⚠️ `error` sengaja tak diperiksa — bentuk aslinya begitu, dipertahankan
    // saat pengangkatan. Akibatnya query gagal terbaca sebagai "tak ada yang
    // cocok". Layak dibetulkan, tapi sebagai perubahan tersendiri.
    const { data } = await supabase.from('aset').select(KANDIDAT_COLS)
      .eq('status', 'aktif').eq('skpd_id', skpdId)
      .or(`nibar.ilike.%${q}%,nama_barang.ilike.%${q}%,kode.ilike.%${q}%`)
      .limit(10)
    setHasil((data as Kandidat[]) || [])
  }

  function tambah(k: Kandidat) {
    if (kandidat.some(x => x.id === k.id)) return
    setKandidat(prev => [...prev, k])
    setHasil([]); setQ('')
    // Kandidat PERTAMA jadi survivor, dan yang berikutnya tak menggesernya —
    // kalau tidak, barang yang bertahan berpindah diam-diam tiap menambah.
    setSurvivorId(prev => prev ?? k.id)
  }

  function hapus(id: string) {
    setKandidat(prev => prev.filter(k => k.id !== id))
    setSurvivorId(prev => prev === id ? null : prev)
  }

  function reset() { setKandidat([]); setSurvivorId(null) }

  return { q, setQ, hasil, kandidat, survivorId, setSurvivorId, cari, tambah, hapus, reset, beda: bedaKandidat(kandidat) }
}
