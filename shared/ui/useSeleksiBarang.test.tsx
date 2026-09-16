// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { toggleSel, toggleAllSel, semuaTercentang, useSeleksiBarang } from './useSeleksiBarang'

type B = { id: string; nama?: string }
const b = (id: string, nama = id): B => ({ id, nama })
const A = b('a'), C = b('c'), D = b('d')
const peta = (...xs: B[]) => Object.fromEntries(xs.map(x => [x.id, x]))

describe('toggleSel', () => {
  it('menambahkan baris yang belum tercentang', () => {
    expect(toggleSel({}, A)).toEqual({ a: A })
  })

  it('membuang baris yang sudah tercentang', () => {
    expect(toggleSel(peta(A, C), A)).toEqual({ c: C })
  })

  it('tidak mengubah centang lain', () => {
    expect(toggleSel(peta(A), C)).toEqual({ a: A, c: C })
  })

  it('TIDAK memutasi objek masukan', () => {
    const prev = peta(A)
    toggleSel(prev, C)
    expect(prev).toEqual({ a: A })
  })

  it('menolak menambah baris yang tak boleh dipilih', () => {
    const prev = peta(A)
    const hasil = toggleSel(prev, C, x => x.id !== 'c')
    expect(hasil).toEqual({ a: A })
    expect(hasil).toBe(prev)   // benar-benar no-op, bukan salinan baru
  })

  it('MEMBUANG centang tetap boleh walau barangnya sudah tak layak', () => {
    // Barang bisa jadi tak layak SESUDAH tercentang (golongan tujuan diganti
    // di menu Reklasifikasi); centang yang tak bisa dilepas mengunci operator.
    expect(toggleSel(peta(A, C), C, () => false)).toEqual({ a: A })
  })
})

describe('toggleAllSel', () => {
  it('mencentang semua baris tampil', () => {
    expect(toggleAllSel({}, [A, C])).toEqual({ a: A, c: C })
  })

  it('melepas semua kalau seluruh baris tampil sudah tercentang', () => {
    expect(toggleAllSel(peta(A, C), [A, C])).toEqual({})
  })

  it('menambah (bukan melepas) kalau baru sebagian tercentang', () => {
    expect(toggleAllSel(peta(A), [A, C])).toEqual({ a: A, c: C })
  })

  it('daftar KOSONG tidak dianggap "semua tercentang" — centang lama selamat', () => {
    // Tanpa penjaga `valid.length > 0`, `[].every()` true → menekan kotak
    // kepala di tabel kosong MEMBUANG seluruh centang yang sudah dikumpulkan.
    expect(toggleAllSel(peta(A, C), [])).toEqual({ a: A, c: C })
  })

  it('MENAMBAH tidak pernah membuang centang di luar hasil filter', () => {
    // A di luar daftar tampil; menekan centang-semua atas [C] wajib
    // mempertahankannya (mengumpulkan barang dari beberapa kata kunci).
    expect(toggleAllSel(peta(A), [C])).toEqual({ a: A, c: C })
  })

  it('MELEPAS memang membuang centang di luar filter — konsekuensi disengaja', () => {
    expect(toggleAllSel(peta(A, C), [C])).toEqual({})
  })

  it('hanya baris yang boleh dipilih yang ikut tercentang', () => {
    expect(toggleAllSel({}, [A, C, D], x => x.id !== 'c')).toEqual({ a: A, d: D })
  })

  it('"semua tercentang" dihitung dari baris yang BOLEH saja', () => {
    // C tak boleh dipilih, jadi ia tak boleh membuat keadaan ini terbaca
    // "baru sebagian" dan menggagalkan pelepasan.
    expect(toggleAllSel(peta(A, D), [A, C, D], x => x.id !== 'c')).toEqual({})
  })

  it('semua baris tak boleh dipilih → tak ada yang berubah', () => {
    expect(toggleAllSel(peta(A), [C, D], () => false)).toEqual({ a: A })
  })

  it('TIDAK memutasi objek masukan', () => {
    const prev = peta(A)
    toggleAllSel(prev, [C])
    expect(prev).toEqual({ a: A })
  })
})

describe('semuaTercentang', () => {
  it('false untuk daftar kosong', () => {
    expect(semuaTercentang(peta(A), [])).toBe(false)
  })
  it('false kalau baru sebagian', () => {
    expect(semuaTercentang(peta(A), [A, C])).toBe(false)
  })
  it('true kalau seluruh baris tampil tercentang', () => {
    expect(semuaTercentang(peta(A, C), [A, C])).toBe(true)
  })
  it('mengabaikan baris yang tak boleh dipilih', () => {
    expect(semuaTercentang(peta(A), [A, C], x => x.id !== 'c')).toBe(true)
  })
})

describe('useSeleksiBarang', () => {
  it('mulai kosong', () => {
    const { result } = renderHook(() => useSeleksiBarang([A, C]))
    expect(result.current.selList).toEqual([])
    expect(result.current.allSelected).toBe(false)
  })

  it('toggle → selList & allSelected ikut bergerak', () => {
    const { result } = renderHook(() => useSeleksiBarang([A, C]))
    act(() => result.current.toggle(A))
    expect(result.current.selList).toEqual([A])
    expect(result.current.allSelected).toBe(false)
    act(() => result.current.toggle(C))
    expect(result.current.allSelected).toBe(true)
  })

  it('toggleAll mencentang lalu melepas', () => {
    const { result } = renderHook(() => useSeleksiBarang([A, C]))
    act(() => result.current.toggleAll())
    expect(result.current.selList).toHaveLength(2)
    act(() => result.current.toggleAll())
    expect(result.current.selList).toEqual([])
  })

  it('reset mengosongkan centang', () => {
    const { result } = renderHook(() => useSeleksiBarang([A, C]))
    act(() => result.current.toggle(A))
    act(() => result.current.reset())
    expect(result.current.selList).toEqual([])
  })

  it('setSel boleh dipakai langsung (pemulihan centang dari luar)', () => {
    const { result } = renderHook(() => useSeleksiBarang([A, C]))
    act(() => result.current.setSel(peta(C)))
    expect(result.current.selList).toEqual([C])
  })

  it('predikat dibaca SAAT ditekan, jadi ikut nilai terbaru', () => {
    let boleh = false
    const { result } = renderHook(() => useSeleksiBarang([A], () => boleh))
    act(() => result.current.toggle(A))
    expect(result.current.selList).toEqual([])   // ditolak
    boleh = true
    act(() => result.current.toggle(A))
    expect(result.current.selList).toEqual([A])  // diterima, tanpa remount
  })

  it('centang bertahan saat daftar tampil berganti (ganti kata kunci)', () => {
    const { result, rerender } = renderHook(({ r }) => useSeleksiBarang(r), {
      initialProps: { r: [A, C] as B[] },
    })
    act(() => result.current.toggle(A))
    rerender({ r: [D] })
    expect(result.current.selList).toEqual([A])
    expect(result.current.allSelected).toBe(false)
  })
})
