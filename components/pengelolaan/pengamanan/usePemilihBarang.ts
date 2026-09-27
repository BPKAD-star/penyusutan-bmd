'use client'
// ============================================================================
// Pemilih barang di form BAST Pengamanan — filter golongan + kotak cari →
// daftar barang aktif se-SKPD yang BELUM berkustodi, dengan centang.
//
// Diangkat dari `BarangForm` (components/pengelolaan/Pengamanan.tsx) 2026-09-16
// (REFACTOR-PLAN Fase 3). Ia KEMUNCULAN KETIGA bentuk pemilih barang (koreksi ·
// penghapusan · pengamanan), jadi syarat yang ditulis di
// usePemilihBarangLengkap.ts (dulu penghapusan/usePemilihBarang.ts, dipindah &
// di-rename 2026-09-22) terpenuhi — tapi yang diangkat bersama HANYA
// mesin centangnya (`shared/ui/useSeleksiBarang.ts`), bukan pemilihnya.
// Query ketiga menu berbeda nyata, dan yang ini paling jauh menyimpang:
//   · qual tambahan `.is('pengamanan', null)` — barang yang sedang dipegang
//     pegawai lain tak boleh muncul (kustodi tunggal, CLAUDE.md)
//   · filter golongan KOSONG bukan berarti "semua": ia jadi `.or()` atas
//     PENGAMANAN_ELIGIBLE_GOLONGAN saja
//   · ada saringan KEDUA di klien (`isPengamananEligible`)
// Menyatukan ketiganya berarti satu hook ber-belasan bendera — anti-pola
// CODING-STANDARD §1.5.
//
// ✅ Fase 1: `tampilkan()` tak lagi menelan `error`. Sebelumnya ia
// `const { data } = await q…` telanjang, jadi query yang GAGAL menghasilkan
// daftar kosong yang terbaca operator sebagai "tak ada barang eligible" — lalu
// ia mengira seluruh barangnya sudah berkustodi. Kelas INS-06. Sekarang
// kegagalannya dialirkan ke saluran error form dan `loaded` SENGAJA tidak
// diset, supaya layar tak pernah berkata "tidak ada hasil" untuk query gagal.
//
// ✅ 2026-09-27 — kotak Cari & kolom tampilan DISAMAKAN dgn Penghapusan/
// Pengeluaran Internal (permintaan user), tanpa menyalin hook-nya (query tetap
// berbeda nyata — lihat daftar di atas): `BARANG_COLS` ditambah kolom standar
// (uraian_barang/spesifikasi_lainnya/no_polisi/no_rangka/no_mesin/luas/
// alamat_detail/tgl_perolehan) & kotak Cari ikut menyisir nomor kendaraan,
// pola PERSIS `usePemilihBarangLengkap.ts`. `barangDariPengamanan()` +
// `uraianMap` (lookup `admin_kodefikasi_bmd` TERKINI, cadangan atas
// `uraian_barang` tersimpan yang basi sesudah reklas) ditambahkan supaya
// pemanggil bisa memakai `<KolomBarangCells/>` standar (lib/kolomBarangTransaksi.ts).
// ============================================================================
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { PENGAMANAN_ELIGIBLE_GOLONGAN, isPengamananEligible } from '@/lib/pengamanan'
import { useSeleksiBarang, type SeleksiBarang } from '@/shared/ui/useSeleksiBarang'
import type { BarangTransaksi } from '@/lib/kolomBarangTransaksi'

const BARANG_COLS =
  'id,nibar,kode,nama_barang,uraian_barang,merek_tipe,spesifikasi_lainnya,' +
  'no_polisi,no_rangka,no_mesin,luas,alamat_detail,tgl_perolehan,jumlah,satuan,nilai_perolehan,skpd_id'

export type BarangPengamanan = {
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
  luas: number | string | null
  alamat_detail: string | null
  tgl_perolehan: string | null
  jumlah: number
  satuan: string | null
  nilai_perolehan: number
  skpd_id: number | null
}

// Standar kolom barang (lib/kolomBarangTransaksi.ts) — `uraian` dioper
// terpisah (bukan dibaca dari `b.uraian_barang`) krn pemanggil sudah py lookup
// kodefikasi TERKINI (`uraianMap`) yang wajib menang.
export function barangDariPengamanan(b: BarangPengamanan, uraian: string | null): BarangTransaksi {
  return {
    kode: b.kode, uraianBarang: uraian || b.uraian_barang, nibar: b.nibar,
    namaBarang: b.nama_barang, merekTipe: b.merek_tipe, spesifikasiLainnya: b.spesifikasi_lainnya,
    noPolisi: b.no_polisi, noMesin: b.no_mesin, noRangka: b.no_rangka,
    luas: b.luas, alamatDetail: b.alamat_detail, tglPerolehan: b.tgl_perolehan,
    jumlah: b.jumlah, satuan: b.satuan, nilai: b.nilai_perolehan,
  }
}

export type PemilihBarangPengamanan = SeleksiBarang<BarangPengamanan> & {
  fGolongan: string
  setFGolongan: (v: string) => void
  fSearch: string
  setFSearch: (v: string) => void
  rows: BarangPengamanan[]
  loaded: boolean
  loading: boolean
  tampilkan: () => Promise<void>
  /** Uraian baku per kode (`admin_kodefikasi_bmd`) — pola sama
   *  usePemilihBarangLengkap.ts. */
  uraianMap: Record<string, string>
}

export function usePemilihBarangPengamanan(
  skpdId: number,
  onErr: (msg: string) => void,
): PemilihBarangPengamanan {
  const supabase = createClient()

  const [fGolongan, setFGolongan] = useState('')
  const [fSearch, setFSearch] = useState('')
  const [rows, setRows] = useState<BarangPengamanan[]>([])
  const [loaded, setLoaded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [uraianMap, setUraianMap] = useState<Record<string, string>>({})
  const seleksi = useSeleksiBarang<BarangPengamanan>(rows)

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
        // ⚠️ `.is('pengamanan', null)` = kustodi TUNGGAL: barang yang sedang
        // dipegang pegawai lain wajib dikembalikan dulu sebelum bisa
        // diserahkan ke orang baru.
        .eq('status', 'aktif').eq('skpd_id', skpdId).is('pengamanan', null)
      // Golongan kosong BUKAN "semua golongan": menu ini hanya melayani
      // Peralatan & Mesin dan Gedung & Bangunan.
      if (fGolongan) q = q.like('kode', `${fGolongan}.%`)
      else q = q.or(PENGAMANAN_ELIGIBLE_GOLONGAN.map(g => `kode.like.${g}.%`).join(','))
      // Cari: nama barang / NIBAR / kode (prefix) + nomor kendaraan (polisi /
      // rangka / mesin) — disamakan dgn Penghapusan/Pengeluaran Internal
      // (permintaan user 2026-09-27, pola dari usePemilihBarangLengkap.ts).
      if (fSearch) q = q.or(
        `nama_barang.ilike.%${fSearch}%,nibar.ilike.%${fSearch}%,kode.ilike.${fSearch}%,` +
        `no_polisi.ilike.%${fSearch}%,no_rangka.ilike.%${fSearch}%,no_mesin.ilike.%${fSearch}%`)
      const { data, error } = await q.order('nilai_perolehan', { ascending: false }).limit(500)
      if (error) throw new Error(`gagal memuat daftar barang: ${error.message}`)
      // Saringan KEDUA di klien: `kode.like.'1.3.2.%'` di PostgREST tak
      // menjamin kodenya benar-benar salah satu golongan eligible kalau
      // datanya menyimpang, dan menu ini memblokir golongan secara KERAS
      // (keputusan user 2026-07-22).
      const list = ((data as unknown as BarangPengamanan[]) || []).filter(b => isPengamananEligible(b.kode))
      setRows(list)
      setUraianMap(await fetchUraian(list.map(b => b.kode)))
      setLoaded(true)
    } catch (e) {
      onErr(e instanceof Error ? e.message : String(e))   // `loaded` tetap false
    } finally {
      setLoading(false)   // di `finally`, bukan jalur sukses (INS-10)
    }
  }

  return { ...seleksi, fGolongan, setFGolongan, fSearch, setFSearch, rows, loaded, loading, tampilkan, uraianMap }
}
