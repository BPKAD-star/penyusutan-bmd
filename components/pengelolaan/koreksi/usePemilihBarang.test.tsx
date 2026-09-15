// @vitest-environment jsdom
// ============================================================================
// Mengunci pemilih barang bersama (./usePemilihBarang.ts) & mesin state
// Koreksi Nilai (./useKoreksiNilai.ts) — REFACTOR-PLAN Fase 3 langkah 4.
//
// Yang dijaga hal-hal yang kalau lepas TIDAK menghasilkan error:
//   · barang `preset` WAJIB tetap tampil walau filternya tak memuatnya — ia
//     sudah TERCENTANG, dan centang atas baris yang tak terlihat adalah persis
//     kebingungan yang dihindari `draftSeleksi` di menu lain
//   · uraian baku hanya ditarik untuk Spesifikasi (satu-satunya yang punya
//     kolomnya) — menariknya di alasan lain itu 500 kode per klik, cuma-cuma
//   · filter golongan & kata kunci benar-benar sampai ke query
//   · nilai baru diisi nilai LAMA saat dicentang, bukan dikosongkan
// ============================================================================
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, renderHook, waitFor, cleanup } from '@testing-library/react'

let asetRows: unknown[] = []
let kodefikasi: { kode: string; uraian: string | null }[] = []
let asetQ: { eq: Record<string, unknown>; like?: string; or?: string } | null = null
let kodeDiminta: string[][] = []

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: (t: string) => {
      if (t === 'admin_kodefikasi_bmd') {
        const q: Record<string, unknown> = {}
        Object.assign(q, { select: () => q, in: async (_k: string, v: string[]) => { kodeDiminta.push(v); return { data: kodefikasi, error: null } } })
        return q
      }
      const call = { eq: {} as Record<string, unknown> } as { eq: Record<string, unknown>; like?: string; or?: string }
      asetQ = call
      const q: Record<string, unknown> = {}
      Object.assign(q, {
        select: () => q,
        eq: (k: string, v: unknown) => { call.eq[k] = v; return q },
        like: (_k: string, v: string) => { call.like = v; return q },
        or: (v: string) => { call.or = v; return q },
        order: () => q,
        limit: async () => ({ data: asetRows, error: null }),
      })
      return q
    },
  }),
}))

import { usePemilihBarang } from './usePemilihBarang'
import { useKoreksiNilai } from './useKoreksiNilai'
import type { Barang } from './tipe'

// ⚠️ Objek `preset` WAJIB dibuat SEKALI per test, bukan di dalam callback
// `renderHook` — efek pemuat uraiannya ber-dependency `[preset]` (identitas),
// jadi literal baru tiap render membuatnya berputar tanpa henti & test-nya
// habis waktu, bukan gagal assert. Di aplikasi ia aman karena `presetSpek`
// adalah STATE di KoreksiTransaksi, jadi identitasnya stabil.
const br = (over: Partial<Barang> = {}): Barang => ({
  id: 'b1', nibar: null, kode: '1.3.2.01.01.01.001', nama_barang: 'Laptop',
  merek_tipe: null, jumlah: 1, satuan: 'unit', nilai_perolehan: 10_000_000, skpd_id: 1,
  tgl_perolehan: '2024-05-13', cara_perolehan: null, foto_paths: null, intra_ekstra: 'intra', ...over,
})

beforeEach(() => { asetRows = []; kodefikasi = []; asetQ = null; kodeDiminta = [] })
afterEach(cleanup)

describe('usePemilihBarang — keadaan awal', () => {
  it('tanpa preset: kosong & belum dimuat', () => {
    const { result } = renderHook(() => usePemilihBarang(1, 'nilai_perolehan', null))
    expect(result.current.rows).toEqual([])
    expect(result.current.loaded).toBe(false)
  })

  it('dgn preset: barangnya SUDAH ada & dianggap termuat', () => {
    const pre = { barang: br({ id: 'p9' }) }
    const { result } = renderHook(() => usePemilihBarang(1, 'spesifikasi', pre))
    expect(result.current.rows.map(b => b.id)).toEqual(['p9'])
    expect(result.current.loaded).toBe(true)
  })

  it('dgn preset: uraian baku kodenya ditarik supaya kolom Kode tak tampil "-"', async () => {
    kodefikasi = [{ kode: '1.3.2.01.01.01.001', uraian: 'Personal Computer' }]
    const pre = { barang: br() }
    const { result } = renderHook(() => usePemilihBarang(1, 'spesifikasi', pre))
    await waitFor(() => expect(result.current.uraianMap['1.3.2.01.01.01.001']).toBe('Personal Computer'))
  })
})

describe('tampilkan() — filter benar-benar sampai ke query', () => {
  it('filter golongan jadi `like` berprefiks, bukan pencarian bebas', async () => {
    const { result } = renderHook(() => usePemilihBarang(7, 'nilai_perolehan', null))
    act(() => result.current.setFGolongan('1.3.2'))
    await act(async () => { await result.current.tampilkan() })

    expect(asetQ!.like).toBe('1.3.2.%')
    expect(asetQ!.eq['skpd_id']).toBe(7)
    expect(asetQ!.eq['status']).toBe('aktif')
  })

  it('kata kunci menyisir nama, NIBAR, & kode sekaligus', async () => {
    const { result } = renderHook(() => usePemilihBarang(1, 'nilai_perolehan', null))
    act(() => result.current.setFSearch('Laptop'))
    await act(async () => { await result.current.tampilkan() })

    expect(asetQ!.or).toContain('nama_barang.ilike.%Laptop%')
    expect(asetQ!.or).toContain('nibar.ilike.%Laptop%')
    expect(asetQ!.or).toContain('kode.ilike.Laptop%')
  })

  it('tanpa filter → tak ada `like` maupun `or` yang dikirim', async () => {
    const { result } = renderHook(() => usePemilihBarang(1, 'nilai_perolehan', null))
    await act(async () => { await result.current.tampilkan() })
    expect(asetQ!.like).toBeUndefined()
    expect(asetQ!.or).toBeUndefined()
  })

  it('loaded jadi true & loading kembali false', async () => {
    asetRows = [br()]
    const { result } = renderHook(() => usePemilihBarang(1, 'nilai_perolehan', null))
    await act(async () => { await result.current.tampilkan() })
    expect(result.current.loaded).toBe(true)
    expect(result.current.loading).toBe(false)
    expect(result.current.rows).toHaveLength(1)
  })
})

describe('preset WAJIB tetap terlihat — centang atas baris tersembunyi itu jebakan', () => {
  it('preset disisipkan PALING ATAS kalau hasil filter tak memuatnya', async () => {
    asetRows = [br({ id: 'lain' })]
    const pre = { barang: br({ id: 'p9' }) }
    const { result } = renderHook(() => usePemilihBarang(1, 'spesifikasi', pre))
    await act(async () => { await result.current.tampilkan() })

    expect(result.current.rows.map(b => b.id)).toEqual(['p9', 'lain'])
  })

  it('TIDAK dobel kalau hasil filter sudah memuatnya', async () => {
    asetRows = [br({ id: 'p9' }), br({ id: 'lain' })]
    const pre = { barang: br({ id: 'p9' }) }
    const { result } = renderHook(() => usePemilihBarang(1, 'spesifikasi', pre))
    await act(async () => { await result.current.tampilkan() })

    expect(result.current.rows.map(b => b.id)).toEqual(['p9', 'lain'])
  })

  it('di alasan LAIN preset tak dipaksa muncul — ia memang tak tercentang di sana', async () => {
    asetRows = [br({ id: 'lain' })]
    const pre = { barang: br({ id: 'p9' }) }
    const { result } = renderHook(() => usePemilihBarang(1, 'pemecahan', pre))
    await act(async () => { await result.current.tampilkan() })

    expect(result.current.rows.map(b => b.id)).toEqual(['lain'])
  })
})

describe('uraian baku ditarik SECUKUPNYA', () => {
  it('alasan Spesifikasi → ditarik untuk seluruh baris', async () => {
    asetRows = [br({ id: 'b1', kode: 'K1' }), br({ id: 'b2', kode: 'K2' })]
    const { result } = renderHook(() => usePemilihBarang(1, 'spesifikasi', null))
    await act(async () => { await result.current.tampilkan() })
    expect(kodeDiminta.at(-1)).toEqual(['K1', 'K2'])
  })

  it('alasan LAIN → tak ditarik sama sekali', async () => {
    asetRows = [br({ kode: 'K1' })]
    const { result } = renderHook(() => usePemilihBarang(1, 'nilai_perolehan', null))
    await act(async () => { await result.current.tampilkan() })
    expect(kodeDiminta).toEqual([])
  })

  it('kode kembar di-dedup sebelum ditanyakan', async () => {
    asetRows = [br({ id: 'b1', kode: 'K1' }), br({ id: 'b2', kode: 'K1' }), br({ id: 'b3', kode: 'K2' })]
    const { result } = renderHook(() => usePemilihBarang(1, 'spesifikasi', null))
    await act(async () => { await result.current.tampilkan() })
    expect(kodeDiminta.at(-1)).toEqual(['K1', 'K2'])
  })

  it('uraian null diabaikan, tak jadi entri kosong yang menutupi cadangannya', async () => {
    kodefikasi = [{ kode: 'K1', uraian: null }]
    const { result } = renderHook(() => usePemilihBarang(1, 'spesifikasi', null))
    const map = await result.current.fetchUraian(['K1'])
    expect(map).toEqual({})
  })
})

describe('reset', () => {
  it('mengosongkan daftar tapi MEMBIARKAN filternya', async () => {
    asetRows = [br()]
    const { result } = renderHook(() => usePemilihBarang(1, 'nilai_perolehan', null))
    act(() => { result.current.setFGolongan('1.3.2'); result.current.setFSearch('Laptop') })
    await act(async () => { await result.current.tampilkan() })
    act(() => result.current.reset())

    expect(result.current.rows).toEqual([])
    expect(result.current.loaded).toBe(false)
    expect(result.current.fGolongan).toBe('1.3.2')
    expect(result.current.fSearch).toBe('Laptop')
  })
})

describe('useKoreksiNilai', () => {
  it('mencentang mengisi nilai baru dgn nilai LAMA, bukan kosong', () => {
    const { result } = renderHook(() => useKoreksiNilai())
    act(() => result.current.toggle(br({ id: 'b1', nilai_perolehan: 10_000_000 })))
    expect(result.current.sel['b1'].nilaiBaru).toBe('10000000')
    expect(result.current.jumlah).toBe(1)
  })

  it('mencentang ulang membatalkan centang', () => {
    const { result } = renderHook(() => useKoreksiNilai())
    act(() => result.current.toggle(br({ id: 'b1' })))
    act(() => result.current.toggle(br({ id: 'b1' })))
    expect(result.current.jumlah).toBe(0)
  })

  it('ubahNilaiBaru menyunting HANYA barang itu', () => {
    const { result } = renderHook(() => useKoreksiNilai())
    act(() => { result.current.toggle(br({ id: 'b1' })); })
    act(() => { result.current.toggle(br({ id: 'b2', nilai_perolehan: 5_000_000 })) })
    act(() => result.current.ubahNilaiBaru('b1', '123'))

    expect(result.current.sel['b1'].nilaiBaru).toBe('123')
    expect(result.current.sel['b2'].nilaiBaru).toBe('5000000')
  })

  it('ubahNilaiBaru atas barang yang TIDAK tercentang diabaikan, tak menyisipkan entri hantu', () => {
    const { result } = renderHook(() => useKoreksiNilai())
    act(() => result.current.ubahNilaiBaru('bx', '999'))
    expect(result.current.sel['bx']).toBeUndefined()
    expect(result.current.jumlah).toBe(0)
  })

  it('list & jumlah ikut isi centang', () => {
    const { result } = renderHook(() => useKoreksiNilai())
    act(() => result.current.toggle(br({ id: 'b1' })))
    expect(result.current.list.map(i => i.barang.id)).toEqual(['b1'])
    act(() => result.current.reset())
    expect(result.current.list).toEqual([])
    expect(result.current.jumlah).toBe(0)
  })
})
