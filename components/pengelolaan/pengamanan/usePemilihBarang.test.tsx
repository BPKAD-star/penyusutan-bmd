// @vitest-environment jsdom
// ============================================================================
// Mengunci pemilih barang form BAST Pengamanan (./usePemilihBarang.ts).
//
// Yang dijaga hal-hal yang kalau lepas TIDAK menghasilkan satu pun error:
//   · qual kustodi tunggal `.is('pengamanan', null)` benar-benar terkirim —
//     tanpanya barang yang sedang dipegang pegawai lain ikut ditawarkan &
//     operator menyerahkan barang yang sama ke dua orang
//   · golongan KOSONG bukan "semua golongan", tapi `.or()` atas daftar
//     eligible — tanpanya menu ini menawarkan Tanah & Jalan yang diblokir keras
//   · saringan KEDUA di klien (`isPengamananEligible`) tetap jalan
//   · query GAGAL → `loaded` tetap false, pesan dilaporkan; layar tak boleh
//     berkata "tidak ada barang eligible" untuk query yang tumbang (INS-06)
//   · `loading` dilepas di `finally`, bukan di jalur sukses (INS-10)
// ============================================================================
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, renderHook, cleanup } from '@testing-library/react'

let asetRows: unknown[] = []
let qErr: { message: string } | null = null
let qThrow = false
let q: { eq: Record<string, unknown>; is: Record<string, unknown>; like?: string; or: string[] } | null = null

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => {
      const call: NonNullable<typeof q> = { eq: {}, is: {}, or: [] }
      q = call
      const b: Record<string, unknown> = {}
      Object.assign(b, {
        select: () => b,
        eq: (k: string, v: unknown) => { call.eq[k] = v; return b },
        is: (k: string, v: unknown) => { call.is[k] = v; return b },
        like: (_k: string, v: string) => { call.like = v; return b },
        or: (v: string) => { call.or.push(v); return b },
        order: () => b,
        limit: async () => {
          if (qThrow) throw new Error('jaringan putus')
          return { data: asetRows, error: qErr }
        },
      })
      return b
    },
  }),
}))

import { usePemilihBarangPengamanan, type BarangPengamanan } from './usePemilihBarang'

const br = (over: Partial<BarangPengamanan> = {}): BarangPengamanan => ({
  id: 'b1', nibar: null, kode: '1.3.2.01.01.01.001', nama_barang: 'Laptop',
  merek_tipe: null, jumlah: 1, satuan: 'unit', nilai_perolehan: 10_000_000, skpd_id: 3, ...over,
})

let errs: string[] = []
const onErr = (m: string) => { errs.push(m) }

beforeEach(() => { asetRows = []; q = null; errs = []; qErr = null; qThrow = false })
afterEach(cleanup)

const isi = async (rows: BarangPengamanan[]) => {
  asetRows = rows
  const h = renderHook(() => usePemilihBarangPengamanan(3, onErr))
  await act(async () => { await h.result.current.tampilkan() })
  return h
}

describe('query', () => {
  it('menyaring SKPD, status aktif, dan barang yang BELUM berkustodi', async () => {
    await isi([])
    expect(q?.eq).toEqual({ status: 'aktif', skpd_id: 3 })
    // Kustodi tunggal: tanpa ini barang yang sedang dipegang pegawai lain
    // ikut ditawarkan (CLAUDE.md "kustodi tunggal + serah ke orang baru").
    expect(q?.is).toEqual({ pengamanan: null })
  })

  it('golongan KOSONG → `.or()` atas golongan eligible, bukan tanpa filter', async () => {
    await isi([])
    expect(q?.like).toBeUndefined()
    expect(q?.or).toHaveLength(1)
    expect(q?.or[0]).toContain('kode.like.1.3.2.%')
    expect(q?.or[0]).toContain('kode.like.1.3.3.%')
    // Golongan yang DIBLOKIR keras tak boleh ikut terbuka.
    expect(q?.or[0]).not.toContain('1.3.1')
  })

  it('golongan dipilih → `like` berprefiks titik, tanpa `.or()` golongan', async () => {
    const h = renderHook(() => usePemilihBarangPengamanan(3, onErr))
    act(() => h.result.current.setFGolongan('1.3.3'))
    await act(async () => { await h.result.current.tampilkan() })
    expect(q?.like).toBe('1.3.3.%')
    expect(q?.or).toEqual([])
  })

  it('kata kunci menyisir nama barang, NIBAR, dan kode (prefix)', async () => {
    const h = renderHook(() => usePemilihBarangPengamanan(3, onErr))
    act(() => h.result.current.setFSearch('laptop'))
    await act(async () => { await h.result.current.tampilkan() })
    const cari = q?.or.find(o => o.includes('nama_barang'))
    expect(cari).toBe('nama_barang.ilike.%laptop%,nibar.ilike.%laptop%,kode.ilike.laptop%')
  })
})

describe('saringan eligibilitas di klien', () => {
  it('membuang barang di luar golongan yang boleh, walau ikut terbawa query', async () => {
    const h = await isi([
      br({ id: 'ok', kode: '1.3.2.01.01.01.001' }),
      br({ id: 'tanah', kode: '1.3.1.11.01.01.001' }),
      br({ id: 'gedung', kode: '1.3.3.01.01.01.001' }),
    ])
    expect(h.result.current.rows.map(r => r.id)).toEqual(['ok', 'gedung'])
  })
})

describe('kegagalan query (INS-06 / INS-10)', () => {
  it('`error` dari PostgREST dilaporkan & `loaded` TETAP false', async () => {
    qErr = { message: 'canceling statement due to statement timeout' }
    const h = await isi([br()])
    expect(errs).toHaveLength(1)
    expect(errs[0]).toContain('gagal memuat daftar barang')
    expect(errs[0]).toContain('statement timeout')
    // Kalau `loaded` ikut true, layar berkata "tidak ada barang eligible"
    // untuk query yang sebenarnya tumbang.
    expect(h.result.current.loaded).toBe(false)
    expect(h.result.current.rows).toEqual([])
  })

  it('lemparan (jaringan putus) juga ditangkap, tak menjatuhkan form', async () => {
    qThrow = true
    const h = await isi([])
    expect(errs[0]).toContain('jaringan putus')
    expect(h.result.current.loaded).toBe(false)
  })

  it('`loading` dilepas walau query gagal', async () => {
    qErr = { message: 'boom' }
    const h = await isi([])
    expect(h.result.current.loading).toBe(false)
  })

  it('sukses → loaded true, tak ada error dilaporkan', async () => {
    const h = await isi([br()])
    expect(h.result.current.loaded).toBe(true)
    expect(h.result.current.loading).toBe(false)
    expect(errs).toEqual([])
  })
})

describe('centang', () => {
  it('mesin centangnya dipakai dari shared — toggle & toggleAll bekerja atas rows', async () => {
    const h = await isi([br({ id: 'a' }), br({ id: 'b' })])
    act(() => h.result.current.toggleAll())
    expect(h.result.current.selList.map(b => b.id)).toEqual(['a', 'b'])
    expect(h.result.current.allSelected).toBe(true)
    act(() => h.result.current.toggle(h.result.current.rows[0]))
    expect(h.result.current.selList.map(b => b.id)).toEqual(['b'])
    expect(h.result.current.allSelected).toBe(false)
  })

  it('centang bertahan saat daftar dimuat ulang dengan kata kunci lain', async () => {
    const h = await isi([br({ id: 'a' })])
    act(() => h.result.current.toggle(h.result.current.rows[0]))
    asetRows = [br({ id: 'b' })]
    await act(async () => { await h.result.current.tampilkan() })
    expect(h.result.current.selList.map(b => b.id)).toEqual(['a'])
    expect(h.result.current.rows.map(b => b.id)).toEqual(['b'])
  })
})
