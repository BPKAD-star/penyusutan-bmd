'use client'
// ============================================================================
// Filter Daftar Barang — nilai yang sedang DIKETIK vs yang sudah DITERAPKAN.
//
// Diangkat dari `DaftarBarangPage` 2026-09-16 (REFACTOR-PLAN Fase 3). Tujuh
// `useState` yang memang satu mesin: enam kotak filter + satu foto beku
// (`applied`) yang dipakai SELURUH query halaman ini.
//
// ⚠️ `applied` BUKAN kemewahan, ia penjaga kebenaran. Paginasi, rekap, &
// kedua Export semuanya membacanya — bukan nilai yang sedang diketik — supaya
// mengganti filter TANPA menekan Tampilkan tak diam-diam menggeser isi halaman
// yang sedang dibaca operator. Kalau nanti ada pemanggil baru yang tergoda
// membaca `fGolongan` langsung untuk query, itu bug yang tak akan menghasilkan
// satu pun error: angkanya cuma tak cocok dengan judul di layar.
//
// ⚠️ LAPIS 1 (CLAUDE.md: Daftar Barang). Yang dipindah ke sini TIDAK memuat
// satu pun aritmetika — murni nilai filter & perakitan `Applied`. Visibilitas
// period-aware, kepemilikan, urutan, & seluruh angkanya tetap di
// `fn_daftar_barang` di server; jangan pindahkan apa pun dari sana ke sini.
// ============================================================================
import { useState } from 'react'
import { periodeDariTanggal } from '@/lib/bmd'
import { tahunAwal } from '@/lib/tahunKerja'

export type Applied = {
  descIds: number[] | null
  skpdId: number | null
  golongan: string
  komptabel: string
  search: string
  periode: string
}

export type SelSkpd = { skpdId: number | null; descIds: number[] | null }

/**
 * Aturan DUA MODE (keputusan user 2026-08-14): per-SKPD (jenis aset bebas)
 * ATAU se-kabupaten (wajib satu jenis aset). "Semua jenis aset untuk semua
 * SKPD" tidak didukung — itu yang dulu membuat halaman ini timeout total.
 *
 * ⚠️ KEMBAR dengan `fn_dbar_guard` (migrasi 20260814_06), dan itu memang
 * penegak SESUNGGUHNYA — fungsi ini cuma supaya pesannya ramah & muncul
 * SEBELUM query ditembak. Melonggarkannya di sini tidak membuka apa pun;
 * yang dilanggar tetap ditolak DB dengan pesan mentah.
 *
 * @returns pesan penolakan, atau `null` kalau filternya sah.
 */
export function cekFilterDaftarBarang(golongan: string, descIds: number[] | null): string | null {
  if (!golongan && !(descIds && descIds.length > 0)) {
    return 'Pilih SKPD dulu, atau pilih jenis aset kalau ingin melihat se-kabupaten. Menampilkan semua jenis aset untuk semua SKPD sekaligus tidak didukung.'
  }
  return null
}

export type FilterDaftarBarang = {
  fSel: SelSkpd
  setFSel: (v: SelSkpd) => void
  fGolongan: string
  setFGolongan: (v: string) => void
  fKomptabel: string
  setFKomptabel: (v: string) => void
  fSearch: string
  setFSearch: (v: string) => void
  fTahun: string
  setFTahun: (v: string) => void
  fSmt: string
  setFSmt: (v: string) => void
  /** Foto filter saat Tampilkan ditekan — SATU-SATUNYA yang boleh dipakai query. */
  applied: Applied | null
  setApplied: (v: Applied | null) => void
  /** Pesan penolakan aturan dua mode, atau `null` kalau filternya sah. */
  pesanFilter: string | null
  /** Rakit `Applied` dari nilai yang sedang diketik. Periksa `pesanFilter` dulu. */
  rakit: () => Applied
}

export function useFilterDaftarBarang(): FilterDaftarBarang {
  const now = periodeDariTanggal(new Date().toISOString().slice(0, 10))

  const [fSel, setFSel] = useState<SelSkpd>({ skpdId: null, descIds: null })
  const [fGolongan, setFGolongan] = useState('')
  const [fKomptabel, setFKomptabel] = useState('')
  const [fSearch, setFSearch] = useState('')
  // Tahun kerja pilihan operator di halaman login dipakai sbg DEFAULT AWAL
  // saja — ia bukan gerbang keamanan, dan tahun mana pun tetap boleh dilihat.
  const [fTahun, setFTahun] = useState(() => tahunAwal(now.slice(0, 4)))
  const [fSmt, setFSmt] = useState(now.slice(-1))
  const [applied, setApplied] = useState<Applied | null>(null)

  function rakit(): Applied {
    return {
      descIds: fSel.descIds,
      skpdId: fSel.skpdId,
      golongan: fGolongan,
      komptabel: fKomptabel,
      // `trim()` di SINI, bukan di pemanggil: spasi di ujung kata kunci
      // membuat `ilike '%kursi %'` tak menemukan apa pun & terbaca operator
      // sebagai "barangnya tidak ada".
      search: fSearch.trim(),
      periode: `${fTahun}-S${fSmt}`,
    }
  }

  return {
    fSel, setFSel, fGolongan, setFGolongan, fKomptabel, setFKomptabel,
    fSearch, setFSearch, fTahun, setFTahun, fSmt, setFSmt,
    applied, setApplied,
    pesanFilter: cekFilterDaftarBarang(fGolongan, fSel.descIds),
    rakit,
  }
}
