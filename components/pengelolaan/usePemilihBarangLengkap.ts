'use client'
// ============================================================================
// Pemilih barang "lengkap" — filter golongan + komptabel + cari (nama / NIBAR
// / kode / no. polisi / rangka / mesin) → daftar barang aktif se-SKPD, dengan
// centang (satuan & massal) + kolom identitas kendaraan & uraian baku.
//
// Diangkat dari `BarangForm` (components/pengelolaan/Penghapusan.tsx)
// 2026-09-15, REFACTOR-PLAN Fase 3. `BarangForm` komponen paling padat state
// di luar menu Koreksi (356 baris / 17 `useState`), dan tujuh di antaranya
// adalah pemilih ini.
//
// ⚠️ KEMUNCULAN KEDUA dari bentuk yang sama — koreksi/usePemilihBarang.ts
// mengerjakan hal serupa untuk menu Koreksi. SENGAJA TIDAK disatukan
// (CODING-STANDARD §1.2 "rule of three"). Keduanya berbeda nyata, bukan cuma
// beda nama:
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
// query Pengamanan tetap berdiri sendiri.
//
// ✅ Fase 1 (2026-09-15): `tampilkan()` tak lagi menelan `error` —
// kegagalannya dialirkan ke saluran error form & `loaded` TIDAK diset, supaya
// layar tak berkata "tidak ada barang" untuk query yang sebenarnya gagal.
//
// ✅ 2026-09-17: `uraianMap` (lookup `admin_kodefikasi_bmd` per kode LIVE)
// digabung ke sini bareng `useSeleksiBarang` — dua perubahan yang sempat
// bentrok jadi satu commit ber-marker konflik yang KETINGGALAN belum
// dibereskan (`<<<<<<<`/`=======`/`>>>>>>>` sampai ikut ter-push ke
// origin/main, lihat CLAUDE.md). Keduanya independen: yang satu mengganti
// mesin centang jadi hook bersama, yang satu menambah lookup uraian —
// tak ada alasan salah satu dikorbankan.
//
// ✅ 2026-09-22 — DIANGKAT & DIRENAME (`usePemilihBarangHapus` →
// `usePemilihBarangLengkap`) dari folder khusus Penghapusan ke sini (sibling
// `Penghapusan.tsx` & `PengeluaranInternal.tsx`): permintaan user, "search bar
// & kolom yang tertampil biar sama" antara Pengeluaran Internal dan
// Penghapusan/Pengalihan Status. Beda dari kasus Koreksi/Pengamanan di atas —
// di sana perbedaannya NYATA (filter/kolom/kotak cari berbeda), sedangkan di
// sini yang diminta memang kesamaan PERSIS, jadi ini "kemunculan ketiga" yang
// sungguh memenuhi rule of three (Penghapusan + Pengalihan Status sudah dua
// pemakai sejak awal — dua jenis kartu yang berbagi `BarangForm` yang sama di
// Penghapusan.tsx — dan Pengeluaran Internal jadi yang ketiga). Nama & isi
// TIDAK berubah selain penamaan; perilaku persis sama dgn sebelum dipindah.
// ============================================================================
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useSeleksiBarang, type SeleksiBarang } from '@/shared/ui/useSeleksiBarang'

/** Kolom yang dibutuhkan tabel pemilih — nomor kendaraan ikut karena kotak
 *  carinya menyisir ketiganya. */
const BARANG_COLS =
  'id,nibar,kode,nama_barang,uraian_barang,merek_tipe,spesifikasi_lainnya,' +
  'no_polisi,no_rangka,no_mesin,tgl_perolehan,tahun_pengadaan,jumlah,satuan,nilai_perolehan,skpd_id'

export type BarangLengkap = {
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

export type PemilihBarangLengkap = SeleksiBarang<BarangLengkap> & {
  fGolongan: string
  setFGolongan: (v: string) => void
  fKomptabel: string
  setFKomptabel: (v: string) => void
  fSearch: string
  setFSearch: (v: string) => void
  rows: BarangLengkap[]
  loaded: boolean
  loading: boolean
  tampilkan: () => Promise<void>
  /** Σ nilai perolehan yang tercentang — dihitung di sini, bukan di mesin
   *  centang bersama: hanya sebagian pemakai yang menampilkannya. */
  selTotal: number
  /** Uraian baku per kode (`admin_kodefikasi_bmd`) — cadangan atas kolom
   *  `uraian_barang` tersimpan, yang basi begitu barang direklas sesudah
   *  dibuat (kolom itu cuma disalin sekali, tak ikut kode yang berubah). */
  uraianMap: Record<string, string>
}

export function usePemilihBarangLengkap(skpdId: number | null, onErr: (msg: string) => void): PemilihBarangLengkap {
  const supabase = createClient()

  const [fGolongan, setFGolongan] = useState('')
  const [fKomptabel, setFKomptabel] = useState('')
  const [fSearch, setFSearch] = useState('')
  const [rows, setRows] = useState<BarangLengkap[]>([])
  const [loaded, setLoaded] = useState(false)
  const [loading, setLoading] = useState(false)
  const seleksi = useSeleksiBarang<BarangLengkap>(rows)
  const [uraianMap, setUraianMap] = useState<Record<string, string>>({})

  /** Uraian baku per kode (`admin_kodefikasi_bmd`) — pola sama Reklasifikasi/
   *  Daftar Barang: selalu ikut kodefikasi TERKINI, bukan `aset.uraian_barang`
   *  yang basi sesudah reklas. */
  async function fetchUraian(kodes: string[]) {
    const uniq = [...new Set(kodes)]
    const map: Record<string, string> = {}
    for (let i = 0; i < uniq.length; i += 200) {
      const { data, error } = await supabase.from('admin_kodefikasi_bmd').select('kode,uraian').in('kode', uniq.slice(i, i + 200))
      if (error) throw new Error(`gagal membaca uraian kodefikasi: ${error.message}`)
      for (const r of data || []) if (r.uraian) map[r.kode] = r.uraian
    }
    return map
  }

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
    const list = (data as unknown as BarangLengkap[]) || []
    setRows(list)
    setUraianMap(await fetchUraian(list.map(b => b.kode)))
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
    uraianMap,
  }
}
