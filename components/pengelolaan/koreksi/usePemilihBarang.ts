'use client'
// ============================================================================
// Pemilih barang di form Koreksi — filter golongan + kotak cari → daftar
// barang aktif se-SKPD.
//
// Diangkat dari `KoreksiForm` 2026-09-15 (REFACTOR-PLAN Fase 3, langkah 4).
// Ini satu-satunya mesin state yang DIPAKAI BERSAMA tiga alasan sekaligus
// (Koreksi Nilai · Spesifikasi · Pemecahan), jadi ia memang milik form, bukan
// milik satu alasan — itu sebabnya ia berdiri sendiri, bukan ditempelkan ke
// salah satu hook alasan.
//
// ✅ Fase 1 (2026-09-15): `error` TIDAK lagi ditelan. Sebelumnya kedua query
// di sini memakai `const { data } = await …` telanjang, jadi query yang GAGAL
// menghasilkan daftar kosong yang terbaca operator sebagai "barangnya memang
// tak ada" — persis kelas INS-06. Sekarang kegagalannya dialirkan ke saluran
// error form (`onErr`) DAN `loaded` sengaja TIDAK diset, supaya layar tak
// pernah berkata "tidak ada hasil" untuk sesuatu yang sebenarnya gagal.
// ============================================================================
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Barang } from './tipe'

const BARANG_COLS = 'id,nibar,kode,nama_barang,merek_tipe,jumlah,satuan,nilai_perolehan,skpd_id,tgl_perolehan,cara_perolehan,foto_paths,intra_ekstra'

export type PemilihBarang = {
  fGolongan: string
  setFGolongan: (v: string) => void
  fSearch: string
  setFSearch: (v: string) => void
  rows: Barang[]
  setRows: React.Dispatch<React.SetStateAction<Barang[]>>
  loaded: boolean
  setLoaded: (v: boolean) => void
  loading: boolean
  uraianMap: Record<string, string>
  tampilkan: () => Promise<void>
  fetchUraian: (kodes: string[]) => Promise<Record<string, string>>
  reset: () => void
}

/**
 * @param alasan menentukan DUA hal: uraian baku hanya ditarik untuk
 *   Spesifikasi (satu-satunya tabel yang menampilkan kolomnya), dan barang
 *   `preset` hanya dipaksa muncul di alasan itu.
 * @param preset barang dari pintasan "✎ Spesifikasi" kartu Pemecahan —
 *   sudah tercentang sejak awal, jadi ia WAJIB kelihatan walau filternya tak
 *   memuatnya.
 *   ⚠️ IDENTITASNYA harus stabil: efek pemuat uraian di bawah ber-dependency
 *   `[preset]`, jadi objek literal baru tiap render membuatnya berputar tanpa
 *   henti. Hari ini aman — `presetSpek` adalah STATE di `KoreksiTransaksi` —
 *   dan pemanggil baru wajib menjaga itu (state/useMemo, bukan literal inline).
 */
export function usePemilihBarang(
  skpdId: number | null,
  alasan: string,
  preset: { barang: Barang } | null | undefined,
  onErr: (msg: string) => void,
): PemilihBarang {
  const supabase = createClient()

  const [fGolongan, setFGolongan] = useState('')
  const [fSearch, setFSearch] = useState('')
  const [rows, setRows] = useState<Barang[]>(preset ? [preset.barang] : [])
  const [loaded, setLoaded] = useState(!!preset)
  const [loading, setLoading] = useState(false)
  const [uraianMap, setUraianMap] = useState<Record<string, string>>({})

  /** Uraian baku per kode (`admin_kodefikasi_bmd`) — untuk kolom Kode Barang. */
  async function fetchUraian(kodes: string[]) {
    const uniq = [...new Set(kodes)]
    const map: Record<string, string> = {}
    // Per 200: `.in()` yang terlalu panjang ditolak PostgREST, dan satu halaman
    // daftar bisa memuat 500 barang.
    for (let i = 0; i < uniq.length; i += 200) {
      const { data, error } = await supabase.from('admin_kodefikasi_bmd').select('kode,uraian').in('kode', uniq.slice(i, i + 200))
      // MELEMPAR, tak sekadar dilaporkan: pemanggilnya menaruh hasilnya di
      // kolom "Uraian Barang", dan peta yang separuh terisi terbaca sebagai
      // "kode ini memang tak terdaftar di kodefikasi".
      if (error) throw new Error(`gagal membaca uraian kodefikasi: ${error.message}`)
      for (const r of data || []) if (r.uraian) map[r.kode] = r.uraian
    }
    return map
  }

  // Preset dari kartu Pemecahan: barangnya sudah ada di `rows`, tinggal uraian
  // baku per kodenya supaya kolom Kode Barang tak tampil "-" seolah kodenya
  // tak terdaftar di kodefikasi.
  useEffect(() => {
    if (!preset) return
    ;(async () => {
      try { setUraianMap(await fetchUraian([preset.barang.kode])) }
      catch (e) { onErr(e instanceof Error ? e.message : String(e)) }
    })()
  }, [preset]) // eslint-disable-line react-hooks/exhaustive-deps

  async function tampilkan() {
    setLoading(true)
    try {
    let q = supabase.from('aset').select(BARANG_COLS)
      .eq('status', 'aktif').eq('skpd_id', skpdId)
    if (fGolongan) q = q.like('kode', `${fGolongan}.%`)
    if (fSearch) q = q.or(`nama_barang.ilike.%${fSearch}%,nibar.ilike.%${fSearch}%,kode.ilike.${fSearch}%`)
    const { data, error } = await q.order('nilai_perolehan', { ascending: false }).limit(500)
    if (error) throw new Error(`gagal memuat daftar barang: ${error.message}`)
    const list = (data as unknown as Barang[]) || []
    // Barang preset (dari kartu Pemecahan) tetap kelihatan walau filternya tak
    // memuatnya — ia SUDAH tercentang, dan centang atas baris yang tak tampil
    // adalah persis kebingungan yang dihindari `draftSeleksi` di menu lain.
    if (preset && alasan === 'spesifikasi' && !list.some(b => b.id === preset.barang.id)) list.unshift(preset.barang)
    setRows(list)
    if (alasan === 'spesifikasi') setUraianMap(await fetchUraian(list.map(b => b.kode)))
    setLoaded(true)
    } catch (e) {
      // `loaded` SENGAJA dibiarkan false — layar yang berkata "tidak ada
      // hasil" untuk query yang gagal itu kebohongan yang paling mahal di
      // halaman daftar (CLAUDE.md, INS-06).
      onErr(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)   // di `finally`, bukan di jalur sukses (INS-10)
    }
  }

  /** Pindah alasan → daftar dikosongkan; filternya SENGAJA dibiarkan. */
  function reset() { setRows([]); setLoaded(false) }

  return {
    fGolongan, setFGolongan, fSearch, setFSearch, rows, setRows,
    loaded, setLoaded, loading, uraianMap, tampilkan, fetchUraian, reset,
  }
}
