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
let asetErr: { message: string } | null = null
let kodeErr: { message: string } | null = null
let kodefikasi: { kode: string; uraian: string | null }[] = []
let asetQ: { eq: Record<string, unknown>; like?: string; or?: string } | null = null
let kodeDiminta: string[][] = []

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: (t: string) => {
      if (t === 'admin_kodefikasi_bmd') {
        const q: Record<string, unknown> = {}
        Object.assign(q, { select: () => q, in: async (_k: string, v: string[]) => { kodeDiminta.push(v); return { data: kodefikasi, error: kodeErr } } })
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
        limit: async () => ({ data: asetRows, error: asetErr }),
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

/** Saluran error form — Fase 1: kegagalan query WAJIB sampai ke sini. */
let errs: string[] = []
const onErr = (m: string) => { errs.push(m) }

beforeEach(() => { asetRows = []; kodefikasi = []; asetQ = null; kodeDiminta = []; errs = []; asetErr = null; kodeErr = null })
afterEach(cleanup)

describe('usePemilihBarang — keadaan awal', () => {
  it('tanpa preset: kosong & belum dimuat', () => {
    const { result } = renderHook(() => usePemilihBarang(1, 'nilai_perolehan', null, onErr))
    expect(result.current.rows).toEqual([])
    expect(result.current.loaded).toBe(false)
  })

  it('dgn preset: barangnya SUDAH ada & dianggap termuat', () => {
    const pre = { barang: br({ id: 'p9' }) }
    const { result } = renderHook(() => usePemilihBarang(1, 'spesifikasi', pre, onErr))
    expect(result.current.rows.map(b => b.id)).toEqual(['p9'])
    expect(result.current.loaded).toBe(true)
  })

  it('dgn preset: uraian baku kodenya ditarik supaya kolom Kode tak tampil "-"', async () => {
    kodefikasi = [{ kode: '1.3.2.01.01.01.001', uraian: 'Personal Computer' }]
    const pre = { barang: br() }
    const { result } = renderHook(() => usePemilihBarang(1, 'spesifikasi', pre, onErr))
    await waitFor(() => expect(result.current.uraianMap['1.3.2.01.01.01.001']).toBe('Personal Computer'))
  })
})

describe('tampilkan() — filter benar-benar sampai ke query', () => {
  it('filter golongan jadi `like` berprefiks, bukan pencarian bebas', async () => {
    const { result } = renderHook(() => usePemilihBarang(7, 'nilai_perolehan', null, onErr))
    act(() => result.current.setFGolongan('1.3.2'))
    await act(async () => { await result.current.tampilkan() })

    expect(asetQ!.like).toBe('1.3.2.%')
    expect(asetQ!.eq['skpd_id']).toBe(7)
    expect(asetQ!.eq['status']).toBe('aktif')
  })

  it('kata kunci menyisir nama, NIBAR, & kode sekaligus', async () => {
    const { result } = renderHook(() => usePemilihBarang(1, 'nilai_perolehan', null, onErr))
    act(() => result.current.setFSearch('Laptop'))
    await act(async () => { await result.current.tampilkan() })

    expect(asetQ!.or).toContain('nama_barang.ilike.%Laptop%')
    expect(asetQ!.or).toContain('nibar.ilike.%Laptop%')
    expect(asetQ!.or).toContain('kode.ilike.Laptop%')
  })

  it('tanpa filter → tak ada `like` maupun `or` yang dikirim', async () => {
    const { result } = renderHook(() => usePemilihBarang(1, 'nilai_perolehan', null, onErr))
    await act(async () => { await result.current.tampilkan() })
    expect(asetQ!.like).toBeUndefined()
    expect(asetQ!.or).toBeUndefined()
  })

  it('loaded jadi true & loading kembali false', async () => {
    asetRows = [br()]
    const { result } = renderHook(() => usePemilihBarang(1, 'nilai_perolehan', null, onErr))
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
    const { result } = renderHook(() => usePemilihBarang(1, 'spesifikasi', pre, onErr))
    await act(async () => { await result.current.tampilkan() })

    expect(result.current.rows.map(b => b.id)).toEqual(['p9', 'lain'])
  })

  it('TIDAK dobel kalau hasil filter sudah memuatnya', async () => {
    asetRows = [br({ id: 'p9' }), br({ id: 'lain' })]
    const pre = { barang: br({ id: 'p9' }) }
    const { result } = renderHook(() => usePemilihBarang(1, 'spesifikasi', pre, onErr))
    await act(async () => { await result.current.tampilkan() })

    expect(result.current.rows.map(b => b.id)).toEqual(['p9', 'lain'])
  })

  it('di alasan LAIN preset tak dipaksa muncul — ia memang tak tercentang di sana', async () => {
    asetRows = [br({ id: 'lain' })]
    const pre = { barang: br({ id: 'p9' }) }
    const { result } = renderHook(() => usePemilihBarang(1, 'pemecahan', pre, onErr))
    await act(async () => { await result.current.tampilkan() })

    expect(result.current.rows.map(b => b.id)).toEqual(['lain'])
  })
})

describe('uraian baku ditarik SECUKUPNYA', () => {
  it('alasan Spesifikasi → ditarik untuk seluruh baris', async () => {
    asetRows = [br({ id: 'b1', kode: 'K1' }), br({ id: 'b2', kode: 'K2' })]
    const { result } = renderHook(() => usePemilihBarang(1, 'spesifikasi', null, onErr))
    await act(async () => { await result.current.tampilkan() })
    expect(kodeDiminta.at(-1)).toEqual(['K1', 'K2'])
  })

  it('alasan LAIN → tak ditarik sama sekali', async () => {
    asetRows = [br({ kode: 'K1' })]
    const { result } = renderHook(() => usePemilihBarang(1, 'nilai_perolehan', null, onErr))
    await act(async () => { await result.current.tampilkan() })
    expect(kodeDiminta).toEqual([])
  })

  it('kode kembar di-dedup sebelum ditanyakan', async () => {
    asetRows = [br({ id: 'b1', kode: 'K1' }), br({ id: 'b2', kode: 'K1' }), br({ id: 'b3', kode: 'K2' })]
    const { result } = renderHook(() => usePemilihBarang(1, 'spesifikasi', null, onErr))
    await act(async () => { await result.current.tampilkan() })
    expect(kodeDiminta.at(-1)).toEqual(['K1', 'K2'])
  })

  it('uraian null diabaikan, tak jadi entri kosong yang menutupi cadangannya', async () => {
    kodefikasi = [{ kode: 'K1', uraian: null }]
    const { result } = renderHook(() => usePemilihBarang(1, 'spesifikasi', null, onErr))
    const map = await result.current.fetchUraian(['K1'])
    expect(map).toEqual({})
  })
})

describe('reset', () => {
  it('mengosongkan daftar tapi MEMBIARKAN filternya', async () => {
    asetRows = [br()]
    const { result } = renderHook(() => usePemilihBarang(1, 'nilai_perolehan', null, onErr))
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

// ============================================================================
// Fase 1 — `error` tidak boleh ditelan (rules.md §2.1, INS-06).
// ============================================================================
describe('query GAGAL: dilaporkan, dan layar tak berkata "tidak ada hasil"', () => {
  it('daftar barang gagal → pesan sampai ke saluran form', async () => {
    asetErr = { message: 'canceling statement due to statement timeout' }
    const { result } = renderHook(() => usePemilihBarang(1, 'nilai_perolehan', null, onErr))
    await act(async () => { await result.current.tampilkan() })

    expect(errs).toHaveLength(1)
    expect(errs[0]).toContain('gagal memuat daftar barang')
    expect(errs[0]).toContain('statement timeout')
  })

  it('⚠️ `loaded` TETAP false saat gagal — inti perbaikannya', async () => {
    asetErr = { message: 'boom' }
    const { result } = renderHook(() => usePemilihBarang(1, 'nilai_perolehan', null, onErr))
    await act(async () => { await result.current.tampilkan() })

    // Kalau `loaded` jadi true, tabel menampilkan "tidak ada barang" untuk
    // query yang sebenarnya GAGAL — kebohongan yang paling mahal di halaman
    // daftar, dan justru itu yang ditutup Fase 1.
    expect(result.current.loaded).toBe(false)
    expect(result.current.rows).toEqual([])
  })

  it('`loading` kembali false walau gagal — tombol tak nyangkut "Memuat..."', async () => {
    asetErr = { message: 'boom' }
    const { result } = renderHook(() => usePemilihBarang(1, 'nilai_perolehan', null, onErr))
    await act(async () => { await result.current.tampilkan() })
    expect(result.current.loading).toBe(false)
  })

  it('uraian kodefikasi gagal → ikut dilaporkan, daftar TIDAK dianggap termuat', async () => {
    asetRows = [br({ kode: 'K1' })]
    kodeErr = { message: 'timeout' }
    const { result } = renderHook(() => usePemilihBarang(1, 'spesifikasi', null, onErr))
    await act(async () => { await result.current.tampilkan() })

    expect(errs[0]).toContain('gagal membaca uraian kodefikasi')
    expect(result.current.loaded).toBe(false)
  })

  it('efek preset: kegagalan uraian dilaporkan, bukan jadi unhandled rejection', async () => {
    kodeErr = { message: 'timeout' }
    const pre = { barang: br() }
    renderHook(() => usePemilihBarang(1, 'spesifikasi', pre, onErr))
    await waitFor(() => expect(errs.some(m => m.includes('uraian kodefikasi'))).toBe(true))
  })
})
