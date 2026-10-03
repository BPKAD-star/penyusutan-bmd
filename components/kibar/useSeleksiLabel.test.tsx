// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useSeleksiLabel, MAKS_LABEL, type KandidatLabel } from './useSeleksiLabel'

const k = (id: string): KandidatLabel => ({
  id, item: { nibar: `N${id}`, namaBarang: `Barang ${id}`, merekTipe: null, skpdNama: 'BKAD', tglPerolehan: null },
})

describe('useSeleksiLabel', () => {
  it('toggle menambah lalu melepas', () => {
    const { result } = renderHook(() => useSeleksiLabel())
    act(() => result.current.toggle(k('a')))
    expect(result.current.jumlah).toBe(1)
    act(() => result.current.toggle(k('a')))
    expect(result.current.jumlah).toBe(0)
  })

  it('seleksi BERTAHAN lintas halaman (yang disimpan LabelItem jadi, bukan id saja)', () => {
    const { result } = renderHook(() => useSeleksiLabel())
    act(() => result.current.toggleHalaman([k('a'), k('b')]))   // halaman 1
    act(() => result.current.toggleHalaman([k('c')]))           // halaman 2
    expect(result.current.jumlah).toBe(3)
    expect(result.current.dipilih.get('a')?.nibar).toBe('Na')
  })

  it('centang-semua halaman: semua sudah terpilih → dilepas; sebagian → dilengkapi', () => {
    const { result } = renderHook(() => useSeleksiLabel())
    act(() => result.current.toggle(k('a')))
    act(() => result.current.toggleHalaman([k('a'), k('b')]))
    expect(result.current.jumlah).toBe(2)
    act(() => result.current.toggleHalaman([k('a'), k('b')]))
    expect(result.current.jumlah).toBe(0)
  })

  it('tak pernah melewati MAKS_LABEL, dan `penuh` mengatakannya', () => {
    const { result } = renderHook(() => useSeleksiLabel())
    const banyak = Array.from({ length: MAKS_LABEL + 50 }, (_, i) => k(String(i)))
    act(() => result.current.toggleHalaman(banyak))
    expect(result.current.jumlah).toBe(MAKS_LABEL)
    expect(result.current.penuh).toBe(true)
    act(() => result.current.toggle(k('lagi')))
    expect(result.current.dipilih.has('lagi')).toBe(false)
  })

  it('reset mengosongkan', () => {
    const { result } = renderHook(() => useSeleksiLabel())
    act(() => result.current.toggleHalaman([k('a'), k('b')]))
    act(() => result.current.reset())
    expect(result.current.jumlah).toBe(0)
  })
})
