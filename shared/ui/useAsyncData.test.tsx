// @vitest-environment jsdom
// Test useAsyncData — REFACTOR-PLAN Fase 1.
//
// Yang dikunci di sini adalah janji INS-10: apa pun yang terjadi pada loader,
// `loading` WAJIB kembali false dan pesan errornya WAJIB tersedia. Daftar
// Barang pernah membeku di "Memuat…" selamanya karena `setLoading(false)`
// ditulis di jalur sukses, bukan di `finally`.
import { describe, it, expect } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { useAsyncData } from './useAsyncData'

describe('useAsyncData — jalur sukses', () => {
  it('mulai kosong: tak ada data, tak loading, tak error', () => {
    const { result } = renderHook(() => useAsyncData<number[]>())

    expect(result.current.data).toBeNull()
    expect(result.current.loading).toBe(false)
    expect(result.current.error).toBe('')
  })

  it('mengisi data & mematikan loading sesudah loader selesai', async () => {
    const { result } = renderHook(() => useAsyncData<number[]>())

    await act(async () => { await result.current.run(async () => [1, 2, 3]) })

    expect(result.current.data).toEqual([1, 2, 3])
    expect(result.current.loading).toBe(false)
    expect(result.current.error).toBe('')
  })

  it('menyalakan loading SELAMA loader berjalan', async () => {
    let lepas!: (v: number[]) => void
    const tertunda = new Promise<number[]>(res => { lepas = res })
    const { result } = renderHook(() => useAsyncData<number[]>())

    act(() => { void result.current.run(() => tertunda) })
    await waitFor(() => expect(result.current.loading).toBe(true))

    await act(async () => { lepas([9]); await tertunda })
    expect(result.current.loading).toBe(false)
  })
})

describe('useAsyncData — WAJIB tidak nyangkut (regresi INS-10)', () => {
  it('loader yang MELEMPAR tetap mematikan loading (finally, bukan jalur sukses)', async () => {
    const { result } = renderHook(() => useAsyncData<number[]>())

    await act(async () => {
      await result.current.run(async () => { throw new Error('gagal membaca event visibilitas barang') })
    })

    expect(result.current.loading).toBe(false)
    expect(result.current.error).toBe('gagal membaca event visibilitas barang')
  })

  it('MEMBUANG data lama saat gagal — angka basi yang terlihat sah lebih mahal daripada layar kosong', async () => {
    const { result } = renderHook(() => useAsyncData<number[]>())

    await act(async () => { await result.current.run(async () => [1, 2, 3]) })
    await act(async () => { await result.current.run(async () => { throw new Error('timeout') }) })

    expect(result.current.data).toBeNull()
    expect(result.current.error).toBe('timeout')
  })

  it('membersihkan error lama saat percobaan berikutnya berhasil', async () => {
    const { result } = renderHook(() => useAsyncData<number[]>())

    await act(async () => { await result.current.run(async () => { throw new Error('timeout') }) })
    await act(async () => { await result.current.run(async () => [7]) })

    expect(result.current.error).toBe('')
    expect(result.current.data).toEqual([7])
  })

  it('lemparan non-Error tetap jadi pesan yang bisa ditampilkan', async () => {
    const { result } = renderHook(() => useAsyncData<number[]>())

    await act(async () => { await result.current.run(async () => { throw 'putus jaringan' }) })

    expect(result.current.error).toBe('putus jaringan')
    expect(result.current.loading).toBe(false)
  })
})

describe('useAsyncData — balapan', () => {
  it('hasil panggilan LAMA yang selesai belakangan tidak menimpa yang baru', async () => {
    // Pengguna menekan "Tampilkan" untuk 2026-S1 lalu cepat ganti ke 2026-S2.
    // Tanpa penjaga ini, layar bisa menampilkan angka periode yang BUKAN yang
    // sedang dipilih — dan tidak ada satu pun tanda bahwa itu salah periode.
    let lepasLama!: (v: string) => void
    const lama = new Promise<string>(res => { lepasLama = res })
    const { result } = renderHook(() => useAsyncData<string>())

    act(() => { void result.current.run(() => lama) })
    await act(async () => { await result.current.run(async () => 'BARU') })
    await act(async () => { lepasLama('LAMA'); await lama })

    expect(result.current.data).toBe('BARU')
  })

  it('error dari panggilan lama tidak memerahkan hasil baru yang sukses', async () => {
    let tolakLama!: (e: Error) => void
    const lama = new Promise<string>((_, rej) => { tolakLama = rej })
    const { result } = renderHook(() => useAsyncData<string>())

    act(() => { void result.current.run(() => lama) })
    await act(async () => { await result.current.run(async () => 'BARU') })
    await act(async () => { tolakLama(new Error('timeout')); await lama.catch(() => {}) })

    expect(result.current.error).toBe('')
    expect(result.current.data).toBe('BARU')
  })
})

describe('useAsyncData — reset', () => {
  it('mengosongkan data & error', async () => {
    const { result } = renderHook(() => useAsyncData<number[]>())

    await act(async () => { await result.current.run(async () => [1]) })
    act(() => { result.current.reset() })

    expect(result.current.data).toBeNull()
    expect(result.current.error).toBe('')
    expect(result.current.loading).toBe(false)
  })
})
