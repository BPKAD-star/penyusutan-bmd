'use client'
// ============================================================================
// Pemilih barang di form Penghapusan — filter golongan + komptabel + cari →
// daftar barang aktif se-SKPD, dengan centang (satuan & massal).
//
// Diangkat dari `BarangForm` (components/pengelolaan/Penghapusan.tsx)
// 2026-09-15, REFACTOR-PLAN Fase 3. `BarangForm` komponen paling padat state
// di luar menu Koreksi (356 baris / 17 `useState`), dan tujuh di antaranya
// adalah pemilih ini.
//
// ⚠️ KEMUNCULAN KEDUA dari bentuk yang sama — koreksi/usePemilihBarang.ts
// mengerjakan hal serupa untuk menu Koreksi. SENGAJA TIDAK disatukan
// (CODING-STANDARD §1.2 "rule of three": kedua dicatat, ketiga baru
// diekstrak). Keduanya berbeda nyata, bukan cuma beda nama:
//   · di sini ada filter KOMPTABEL; di sana tidak
//   · kolom yang ditarik berbeda (di sini nomor kendaraan & tahun pengadaan,
//     di sana kolom yang dipakai koreksi spesifikasi)
//   · kotak carinya menyisir nomor polisi/rangka/mesin (permintaan user
//     2026-09-09); di sana tidak
//   · di sana ada `preset` & uraian baku; di sini tidak
//   · di sini ada centang MASSAL; di sana tidak
// Menyatukannya sekarang berarti satu hook ber-belasan bendera — persis
// anti-pola yang dilarang CODING-STANDARD §1.5. **Kalau menu KETIGA butuh
// pemilih serupa, barulah angkat bentuk bersamanya.**
//
// ✅ Fase 1 (2026-09-15): `tampilkan()` tak lagi menelan `error` —
// kegagalannya dialirkan ke saluran error form & `loaded` TIDAK diset, supaya
// layar tak berkata "tidak ada barang" untuk query yang sebenarnya gagal.
// ============================================================================
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

/** Kolom yang dibutuhkan tabel pemilih — nomor kendaraan ikut karena kotak
 *  carinya menyisir ketiganya. */
const BARANG_COLS =
  'id,nibar,kode,nama_barang,uraian_barang,merek_tipe,spesifikasi_lainnya,' +
  'no_polisi,no_rangka,no_mesin,tgl_perolehan,tahun_pengadaan,jumlah,satuan,nilai_perolehan,skpd_id'

export type BarangHapus = {
  id: string
  nibar: string | null
  kode: string
  nama_barang: string | null
  uraian_barang: string | null
  merek_tipe: string | null
  spesifikasi_lainnya: string | null
  no_polisi: string | null
  no_rangka: string | null
  no_mesin: string | null
  tgl_perolehan: string | null
  tahun_pengadaan: number | null
  jumlah: number
  satuan: string | null
  nilai_perolehan: number
  skpd_id: number | null
}

export type PemilihBarangHapus = {
  fGolongan: string
  setFGolongan: (v: string) => void
  fKomptabel: string
  setFKomptabel: (v: string) => void
  fSearch: string
  setFSearch: (v: string) => void
  rows: BarangHapus[]
  loaded: boolean
  loading: boolean
  tampilkan: () => Promise<void>
  sel: Record<string, BarangHapus>
  setSel: React.Dispatch<React.SetStateAction<Record<string, BarangHapus>>>
  selList: BarangHapus[]
  selTotal: number
  toggle: (b: BarangHapus) => void
  toggleAll: () => void
}

export function usePemilihBarangHapus(skpdId: number | null, onErr: (msg: string) => void): PemilihBarangHapus {
  const supabase = createClient()

  const [fGolongan, setFGolongan] = useState('')
  const [fKomptabel, setFKomptabel] = useState('')
  const [fSearch, setFSearch] = useState('')
  const [rows, setRows] = useState<BarangHapus[]>([])
  const [loaded, setLoaded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [sel, setSel] = useState<Record<string, BarangHapus>>({})

  async function tampilkan() {
    setLoading(true)
    try {
    let q = supabase.from('aset').select(BARANG_COLS)
      .eq('status', 'aktif').eq('skpd_id', skpdId)
    if (fGolongan) q = q.like('kode', `${fGolongan}.%`)
    if (fKomptabel) q = q.eq('intra_ekstra', fKomptabel)
    // Cari: nama barang / NIBAR / kode (prefix) + nomor kendaraan (polisi /
    // rangka / mesin) — permintaan user 2026-09-09.
    if (fSearch) q = q.or(
      `nama_barang.ilike.%${fSearch}%,nibar.ilike.%${fSearch}%,kode.ilike.${fSearch}%,` +
      `no_polisi.ilike.%${fSearch}%,no_rangka.ilike.%${fSearch}%,no_mesin.ilike.%${fSearch}%`)
    const { data, error } = await q.order('nilai_perolehan', { ascending: false }).limit(500)
    if (error) throw new Error(`gagal memuat daftar barang: ${error.message}`)
    setRows((data as unknown as BarangHapus[]) || [])
    setLoaded(true)
    } catch (e) {
      onErr(e instanceof Error ? e.message : String(e))   // `loaded` tetap false
    } finally {
      setLoading(false)   // di `finally`, bukan jalur sukses (INS-10)
    }
  }

  function toggle(b: BarangHapus) {
    setSel(prev => {
      const next = { ...prev }
      if (next[b.id]) delete next[b.id]; else next[b.id] = b
      return next
    })
  }

  /**
   * Centang/lepas SEMUA baris yang sedang tampil.
   *
   * ⚠️ Dianggap "semua tercentang" hanya kalau SELURUH baris tampil ada di
   * centang — dan centang di luar hasil filter TIDAK ikut dilepas, karena
   * `{}` cuma dikembalikan pada keadaan itu. Konsekuensi yang disengaja:
   * operator bisa mengumpulkan barang dari beberapa kata kunci, pola yang
   * sama dengan `draftSeleksi` di menu Pengadaan.
   */
  function toggleAll() {
    setSel(prev => {
      const allSelected = rows.length > 0 && rows.every(r => prev[r.id])
      if (allSelected) return {}
      const next = { ...prev }
      for (const r of rows) next[r.id] = r
      return next
    })
  }

  const selList = Object.values(sel)
  const selTotal = selList.reduce((s, b) => s + b.nilai_perolehan, 0)

  return {
    fGolongan, setFGolongan, fKomptabel, setFKomptabel, fSearch, setFSearch,
    rows, loaded, loading, tampilkan,
    sel, setSel, selList, selTotal, toggle, toggleAll,
  }
}
