'use client'
// ============================================================================
// Filter Penyusutan — nilai yang sedang DIKETIK vs yang sudah DITERAPKAN.
//
// Diangkat dari `PenyusutanPage` 2026-09-16 (REFACTOR-PLAN Fase 3).
//
// ⚠️ LAPIS 1 (CLAUDE.md: Penyusutan + engine-nya). Yang dipindah ke sini TIDAK
// memuat satu pun aritmetika — murni nilai filter & perakitan `Applied`.
// Visibilitas period-aware, kepemilikan, rekap, & seluruh angkanya tetap di
// `fn_penyusutan`/`fn_penyusutan_rekap` di server dan di `lib/visibilitas.ts`.
//
// ⚠️ `applied` menjaga kebenaran, bukan kerapian: paginasi, rekap, Export, &
// "muat ulang sesudah engine selesai" semuanya membacanya — bukan nilai yang
// sedang diketik — supaya mengganti filter TANPA menekan Tampilkan tak
// diam-diam menggeser isi halaman yang sedang dibaca operator.
//
// ⚠️ KEMUNCULAN KEDUA bentuk "filter + applied"; yang pertama
// `app/dashboard/daftar-barang/useFilterDaftarBarang.ts`. SENGAJA TIDAK
// disatukan (CODING-STANDARD §1.2 "rule of three": kedua dicatat, ketiga baru
// diekstrak). Bedanya nyata, bukan cuma nama:
//   · di sana cakupan SKPD `{skpdId, descIds}`, di sini `OrgSelection`
//     (`descendantIds`) milik `SkpdCombobox`
//   · di sini ada filter KOMPTABEL ber-bawaan 'intra'; di sana 'semua'
//   · di sana ada aturan DUA MODE (`fn_dbar_guard`); di sini tidak ada
//     penjaga setara sama sekali
//   · `Applied` di sini membawa `org` utuh, di sana dipecah dua ruas
// Menyatukannya sekarang melahirkan hook ber-bendera — anti-pola §1.5.
// ============================================================================
import { useState } from 'react'
import type { SkpdSelection as OrgSelection } from '@/components/SkpdCombobox'
import { tahunAwal } from '@/lib/tahunKerja'
import { idsKonsolidasi } from '@/lib/konsolidasiSkpd'

export type Applied = {
  org: OrgSelection
  golongan: string
  komptabel: string
  periode: string
  search: string
}

export type FilterPenyusutan = {
  org: OrgSelection
  setOrg: (v: OrgSelection) => void
  /** true = SKPD + seluruh turunannya (bawaan, spt Daftar Barang); false =
   *  SKPD yang dipilih saja. Permintaan user 2026-09-22 — lihat
   *  lib/konsolidasiSkpd.ts. */
  fKonsolidasi: boolean
  setFKonsolidasi: (v: boolean) => void
  golongan: string
  setGolongan: (v: string) => void
  komptabel: string
  setKomptabel: (v: string) => void
  tahun: string
  setTahun: (v: string) => void
  smt: string
  setSmt: (v: string) => void
  search: string
  setSearch: (v: string) => void
  /** Foto filter saat Tampilkan ditekan — SATU-SATUNYA yang boleh dipakai query. */
  applied: Applied | null
  setApplied: (v: Applied | null) => void
  /** Periode yang sedang DIKETIK — dipakai tombol Jalankan Engine & badge tahun. */
  periode: string
  rakit: () => Applied
}

export function useFilterPenyusutan(): FilterPenyusutan {
  const [org, setOrg] = useState<OrgSelection>({ skpdId: null, descendantIds: null })
  const [fKonsolidasi, setFKonsolidasi] = useState(true)
  const [golongan, setGolongan] = useState('')
  // Bawaan 'intra' (angka neraca) — sejak ekstra ikut disusutkan (2026-07-13),
  // "Semua" = campuran intra+ekstra, bukan lagi tampilan bawaan yang aman.
  const [komptabel, setKomptabel] = useState('intra')
  const [tahun, setTahun] = useState(() => tahunAwal('2026'))
  const [smt, setSmt] = useState('1')
  const [search, setSearch] = useState('')
  const [applied, setApplied] = useState<Applied | null>(null)

  // ⚠️ Periode yang DIKETIK, bukan yang diterapkan — dan bedanya penting:
  // tombol "Jalankan Engine" menjalankan periode yang sedang dipilih operator,
  // bukan periode yang kebetulan sedang tampil di tabel.
  const periode = `${tahun}-S${smt}`

  // `org.descendantIds` dipersempit ke `[org.skpdId]` saat "SKPD ini saja"
  // dipilih — `org` sendiri TAK disentuh, jadi kembali ke Konsolidasi memberi
  // hasil yang sama seperti semula. Lihat lib/konsolidasiSkpd.ts.
  const rakit = (): Applied => ({
    org: { skpdId: org.skpdId, descendantIds: idsKonsolidasi(org.skpdId, org.descendantIds, fKonsolidasi) },
    golongan, komptabel, periode, search,
  })

  return {
    org, setOrg, fKonsolidasi, setFKonsolidasi, golongan, setGolongan, komptabel, setKomptabel,
    tahun, setTahun, smt, setSmt, search, setSearch,
    applied, setApplied, periode, rakit,
  }
}
