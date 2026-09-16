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
// anti-pola yang dilarang CODING-STANDARD §1.5.
//
// ✅ 2026-09-16 — menu KETIGA datang (Pengamanan), dan janji di atas ditagih
// SEBAGIAN: yang diangkat bersama HANYA mesin centangnya
// (`shared/ui/useSeleksiBarang.ts`, kemunculan kelima), bukan pemilihnya.
// Kelima perbedaan yang didaftar di atas masih berlaku & masih jadi alasan
// query-nya tetap berdiri sendiri.
//
// ✅ Fase 1 (2026-09-15): `tampilkan()` tak lagi menelan `error` —
// kegagalannya dialirkan ke saluran error form & `loaded` TIDAK diset, supaya
// layar tak berkata "tidak ada barang" untuk query yang sebenarnya gagal.
// ============================================================================
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useSeleksiBarang, type SeleksiBarang } from '@/shared/ui/useSeleksiBarang'

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

export type PemilihBarangHapus = SeleksiBarang<BarangHapus> & {
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
  /** Σ nilai perolehan yang tercentang — dihitung di sini, bukan di mesin
   *  centang bersama: hanya menu ini yang menampilkannya. */
  selTotal: number
}

export function usePemilihBarangHapus(skpdId: number | null, onErr: (msg: string) => void): PemilihBarangHapus {
  const supabase = createClient()

  const [fGolongan, setFGolongan] = useState('')
  const [fKomptabel, setFKomptabel] = useState('')
  const [fSearch, setFSearch] = useState('')
  const [rows, setRows] = useState<BarangHapus[]>([])
  const [loaded, setLoaded] = useState(false)
  const [loading, setLoading] = useState(false)
  const seleksi = useSeleksiBarang<BarangHapus>(rows)

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

  return {
    fGolongan, setFGolongan, fKomptabel, setFKomptabel, fSearch, setFSearch,
    rows, loaded, loading, tampilkan,
    ...seleksi,
    selTotal: seleksi.selList.reduce((s, b) => s + b.nilai_perolehan, 0),
  }
}
