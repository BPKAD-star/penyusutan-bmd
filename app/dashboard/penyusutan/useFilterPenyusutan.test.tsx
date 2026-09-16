// @vitest-environment jsdom
// ============================================================================
// Mengunci filter Penyusutan (./useFilterPenyusutan.ts) — LAPIS 1.
//
// Yang dijaga hal-hal yang kalau lepas TIDAK menghasilkan satu pun error:
//   · bawaan komptabel 'intra' — sejak ekstra ikut disusutkan (2026-07-13),
//     "Semua" berarti campuran intra+ekstra, jadi bawaan yang salah membuat
//     layar menampilkan angka yang BUKAN angka neraca tanpa ada yang janggal
//   · periode dirakit `YYYY-S<n>` & `periode` yang diekspor adalah yang sedang
//     DIKETIK — itu yang dijalankan tombol Engine, bukan yang sedang tampil
//   · `applied` tak ikut bergerak saat filter diketik
// ============================================================================
import { describe, it, expect, vi, afterEach } from 'vitest'
import { act, renderHook, cleanup } from '@testing-library/react'

vi.mock('@/lib/tahunKerja', () => ({ tahunAwal: (fallback: string) => fallback }))

import { useFilterPenyusutan } from './useFilterPenyusutan'

afterEach(cleanup)

describe('nilai awal', () => {
  it('komptabel bawaan `intra` — angka NERACA, bukan campuran', () => {
    const { result } = renderHook(() => useFilterPenyusutan())
    expect(result.current.komptabel).toBe('intra')
  })

  it('cakupan SKPD & golongan mulai kosong, `applied` belum ada', () => {
    const { result } = renderHook(() => useFilterPenyusutan())
    expect(result.current.org).toEqual({ skpdId: null, descendantIds: null })
    expect(result.current.golongan).toBe('')
    expect(result.current.applied).toBeNull()
  })

  it('semester bawaan S1', () => {
    expect(renderHook(() => useFilterPenyusutan()).result.current.smt).toBe('1')
  })
})

describe('periode', () => {
  it('dirakit `YYYY-S<n>`', () => {
    const { result } = renderHook(() => useFilterPenyusutan())
    act(() => { result.current.setTahun('2025'); result.current.setSmt('2') })
    expect(result.current.periode).toBe('2025-S2')
  })

  it('ikut nilai yang DIKETIK, bukan yang diterapkan', () => {
    // Inti bedanya: tombol Jalankan Engine memakai `periode`, jadi kalau ia
    // ikut `applied`, operator yang mengganti periode lalu menekan Engine
    // akan menghitung ulang periode yang SALAH — tanpa satu pun peringatan.
    const { result } = renderHook(() => useFilterPenyusutan())
    act(() => result.current.setApplied(result.current.rakit()))
    act(() => result.current.setTahun('2027'))
    expect(result.current.periode).toBe('2027-S1')
    expect(result.current.applied?.periode).toBe('2026-S1')
  })
})

describe('rakit()', () => {
  it('membawa seluruh filter apa adanya', () => {
    const { result } = renderHook(() => useFilterPenyusutan())
    act(() => {
      result.current.setOrg({ skpdId: 7, descendantIds: [7, 8] })
      result.current.setGolongan('1.3.2')
      result.current.setKomptabel('ekstra')
      result.current.setTahun('2026')
      result.current.setSmt('2')
      result.current.setSearch('kursi')
    })
    expect(result.current.rakit()).toEqual({
      org: { skpdId: 7, descendantIds: [7, 8] },
      golongan: '1.3.2', komptabel: 'ekstra', periode: '2026-S2', search: 'kursi',
    })
  })

  it('kata kunci TIDAK di-trim di sini', () => {
    // Beda yang disengaja dari Daftar Barang: di sana `rakit()` men-trim,
    // di sini `search` dioper apa adanya ke `fn_penyusutan`. Dicatat supaya
    // kalau kelak disamakan, itu keputusan sadar & bukan kelalaian.
    const { result } = renderHook(() => useFilterPenyusutan())
    act(() => result.current.setSearch('  kursi  '))
    expect(result.current.rakit().search).toBe('  kursi  ')
  })
})

describe('applied', () => {
  it('mengetik filter TIDAK menggesernya', () => {
    const { result } = renderHook(() => useFilterPenyusutan())
    act(() => result.current.setGolongan('1.3.2'))
    act(() => result.current.setApplied(result.current.rakit()))
    const sebelum = result.current.applied
    act(() => { result.current.setGolongan('1.3.3'); result.current.setKomptabel('ekstra') })
    expect(result.current.applied).toBe(sebelum)
    expect(result.current.applied?.golongan).toBe('1.3.2')
    expect(result.current.applied?.komptabel).toBe('intra')
  })
})
