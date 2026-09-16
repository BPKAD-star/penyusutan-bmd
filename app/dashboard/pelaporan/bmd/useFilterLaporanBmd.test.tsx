// @vitest-environment jsdom
// Mengunci filter Laporan BMD — LAPIS 1. Aturan periodenya sendiri diuji di
// lib/periodeLaporanBmd.test.ts; di sini yang dijaga bahwa hook-nya
// BENAR-BENAR menyalurkannya, dan bawaan filternya tak bergeser.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { act, renderHook, cleanup } from '@testing-library/react'

vi.mock('@/lib/tahunKerja', () => ({ tahunAwal: (fallback: string) => fallback }))

import { useFilterLaporanBmd } from './useFilterLaporanBmd'

afterEach(cleanup)

describe('bawaan', () => {
  it('komptabel `intra` — angka NERACA, bukan campuran intra+ekstra', () => {
    expect(renderHook(() => useFilterLaporanBmd()).result.current.komptabel).toBe('intra')
  })
  it('semester bawaan S2 & tab bawaan posisi', () => {
    const { result } = renderHook(() => useFilterLaporanBmd())
    expect(result.current.smt).toBe('2')
    expect(result.current.tab).toBe('posisi')
    expect(result.current.metric).toBe('perolehan')
  })
})

describe('periode disalurkan dari lib/periodeLaporanBmd', () => {
  it('S2 → posisi S2, saldo awal S1', () => {
    const { result } = renderHook(() => useFilterLaporanBmd())
    act(() => result.current.setTahun('2026'))
    expect(result.current.periode).toBe('2026-S2')
    expect(result.current.periodeAwal).toBe('2026-S1')
    expect(result.current.periodeMutasi).toEqual(['2026-S2'])
  })

  it('Akhir Tahun → posisi S2 TAPI saldo awal tahun lalu & mutasi dua semester', () => {
    const { result } = renderHook(() => useFilterLaporanBmd())
    act(() => { result.current.setTahun('2026'); result.current.setSmt('TH') })
    expect(result.current.smtEfektif).toBe('2')
    expect(result.current.periode).toBe('2026-S2')
    expect(result.current.periodeAwal).toBe('2025-S2')
    expect(result.current.periodeMutasi).toEqual(['2026-S1', '2026-S2'])
    expect(result.current.labelPeriode).toBe('2026 (setahun)')
  })

  it('ikut bergerak seketika — TIDAK ada `applied` di halaman ini', () => {
    // Beda yang DISENGAJA dari Daftar Barang & Penyusutan: di sini `proses()`
    // membaca filter langsung saat tombolnya ditekan. Dicatat supaya kalau
    // kelak `applied` ditambahkan, itu keputusan sadar & bukan kelalaian.
    const { result } = renderHook(() => useFilterLaporanBmd())
    act(() => result.current.setSmt('1'))
    expect(result.current.periode).toBe('2026-S1')
  })
})
