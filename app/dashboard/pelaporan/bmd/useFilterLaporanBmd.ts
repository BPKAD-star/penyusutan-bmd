'use client'
// ============================================================================
// Filter Laporan BMD + periode-periode turunannya.
//
// Diangkat dari `LaporanBmdPage` 2026-09-16 (REFACTOR-PLAN Fase 3). LAPIS 1.
//
// ⚠️ Aturan periodenya SENDIRI ada di `lib/periodeLaporanBmd.ts` — fungsi
// MURNI yang bertest & ber-mutasi. Yang di sini cuma state-nya. Pemisahan itu
// disengaja: aturan "saldo awal mengikuti JENIS laporan" (keputusan user
// 2026-08-10) menentukan rentang yang dibaca `fn_rekap_bmd` &
// `computeMutasiLines`, dan aturan semacam itu tak boleh cuma hidup sebagai
// baris turunan di dalam komponen yang mustahil diuji.
//
// ⚠️ TIDAK ada `applied` di halaman ini, dan itu BUKAN kelalaian — beda nyata
// dari Daftar Barang & Penyusutan. Di sini `proses()`/`prosesMutasi()`
// membaca nilai filter LANGSUNG saat tombolnya ditekan, lalu hasilnya duduk di
// `rows`/`mutasiRows`. Konsekuensi yang sudah berlaku sejak dulu &
// dipertahankan apa adanya: mengganti filter tanpa menekan Proses membuat
// JUDUL di layar bergeser sementara angkanya masih milik filter lama.
// Membetulkannya = menambah `applied` + menyisir seluruh pembacanya; itu
// perubahan perilaku, bukan pemindahan, jadi bukan pekerjaan Fase 3.
// ============================================================================
import { useState } from 'react'
import type { SkpdSelection as OrgSelection } from '@/components/SkpdCombobox'
import type { MetricOrAll } from '@/components/RekapMatrixTable'
import { tahunAwal } from '@/lib/tahunKerja'
import { periodeLaporanBmd, type SemesterBmd, type PeriodeLaporanBmd } from '@/lib/periodeLaporanBmd'

export type TabBmd = 'mutasi' | 'posisi' | 'skpd' | 'admin'

export type FilterLaporanBmd = PeriodeLaporanBmd & {
  org: OrgSelection
  setOrg: (v: OrgSelection) => void
  komptabel: string
  setKomptabel: (v: string) => void
  tahun: string
  setTahun: (v: string) => void
  smt: SemesterBmd
  setSmt: (v: SemesterBmd) => void
  tab: TabBmd
  setTab: (v: TabBmd) => void
  metric: MetricOrAll
  setMetric: (v: MetricOrAll) => void
}

export function useFilterLaporanBmd(): FilterLaporanBmd {
  const [org, setOrg] = useState<OrgSelection>({ skpdId: null, descendantIds: null })
  // Bawaan 'intra' (angka neraca) — sejak ekstra ikut disusutkan (2026-07-13),
  // "Semua" = campuran intra+ekstra, bukan lagi tampilan bawaan yang aman.
  const [komptabel, setKomptabel] = useState('intra')
  const [tahun, setTahun] = useState(() => tahunAwal('2026'))
  const [smt, setSmt] = useState<SemesterBmd>('2')
  const [tab, setTab] = useState<TabBmd>('posisi')
  const [metric, setMetric] = useState<MetricOrAll>('perolehan')

  return {
    org, setOrg, komptabel, setKomptabel, tahun, setTahun, smt, setSmt,
    tab, setTab, metric, setMetric,
    ...periodeLaporanBmd(tahun, smt),
  }
}
