// @vitest-environment jsdom
// ============================================================================
// Mengunci pemilih barang form Penghapusan (./usePemilihBarang.ts).
//
// Yang dijaga hal-hal yang kalau lepas TIDAK menghasilkan error:
//   · ketiga filter benar-benar sampai ke query — komptabel `eq`, golongan
//     `like` berprefiks, kata kunci menyisir NAMA/NIBAR/kode + nomor kendaraan
//   · centang massal: "lepas semua" hanya saat SELURUH baris tampil tercentang
//   · centang di LUAR hasil filter tidak ikut terlepas — itu yang membuat
//     operator bisa mengumpulkan barang dari beberapa kata kunci
//   · `selTotal` dijumlah dari yang tercentang, bukan dari yang tampil
// ============================================================================
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, renderHook, cleanup } from '@testing-library/react'

let asetRows: unknown[] = []
let qErr: { message: string } | null = null
let q: { eq: Record<string, unknown>; like?: string; or?: string } | null = null
// Uraian baku (admin_kodefikasi_bmd) — dipanggil sesudah tiap `tampilkan()`,
// sama pola dgn koreksi/usePemilihBarang.test.tsx. Default array kosong: tak
// ada test di sini yang MENGUJI isinya, cuma memastikan panggilannya tak gagal
// (kalau gagal, `tampilkan()` MELEMPAR & `loaded` tetap false — persis kelas
// bug yang dijaga suite "Fase 1" di bawah).
let kodeErr: { message: string } | null = null
let kodefikasi: { kode: string; uraian: string | null }[] = []

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: (t: string) => {
      if (t === 'admin_kodefikasi_bmd') {
        const kq: Record<string, unknown> = {}
        Object.assign(kq, { select: () => kq, in: async () => ({ data: kodefikasi, error: kodeErr }) })
        return kq
      }
      const call = { eq: {} as Record<string, unknown> } as { eq: Record<string, unknown>; like?: string; or?: string }
      q = call
      const b: Record<string, unknown> = {}
      Object.assign(b, {
        select: () => b,
        eq: (k: string, v: unknown) => { call.eq[k] = v; return b },
        like: (_k: string, v: string) => { call.like = v; return b },
        or: (v: string) => { call.or = v; return b },
        order: () => b,
        limit: async () => ({ data: asetRows, error: qErr }),
      })
      return b
    },
  }),
}))

import { usePemilihBarangHapus, type BarangHapus } from './usePemilihBarang'

const br = (over: Partial<BarangHapus> = {}): BarangHapus => ({
  id: 'b1', nibar: null, kode: '1.3.2.01.01.01.001', nama_barang: 'Mobil', uraian_barang: null,
  merek_tipe: null, spesifikasi_lainnya: null, no_polisi: 'AG 1021 EP', no_rangka: null, no_mesin: null,
  tgl_perolehan: '2020-01-01', tahun_pengadaan: 2020, jumlah: 1, satuan: 'unit',
  nilai_perolehan: 100_000_000, skpd_id: 3, ...over,
})

let errs: string[] = []
const onErr = (m: string) => { errs.push(m) }

beforeEach(() => { asetRows = []; q = null; errs = []; qErr = null; kodefikasi = []; kodeErr = null })
afterEach(cleanup)

const isi = async (rows: BarangHapus[]) => {
  asetRows = rows
  const h = renderHook(() => usePemilihBarangHapus(3, onErr))
  await act(async () => { await h.result.current.tampilkan() })
  return h
}

describe('filter sampai ke query', () => {
  it('golongan jadi `like` berprefiks; SKPD & status ikut', async () => {
    const h = renderHook(() => usePemilihBarangHapus(3, onErr))
    act(() => h.result.current.setFGolongan('1.3.2'))
    await act(async () => { await h.result.current.tampilkan() })

    expect(q!.like).toBe('1.3.2.%')
    expect(q!.eq['skpd_id']).toBe(3)
    expect(q!.eq['status']).toBe('aktif')
  })

  it('komptabel jadi `eq` pada intra_ekstra', async () => {
    const h = renderHook(() => usePemilihBarangHapus(3, onErr))
    act(() => h.result.current.setFKomptabel('ekstra'))
    await act(async () => { await h.result.current.tampilkan() })
    expect(q!.eq['intra_ekstra']).toBe('ekstra')
  })

  it('kata kunci menyisir nama/NIBAR/kode DAN nomor kendaraan', async () => {
    const h = renderHook(() => usePemilihBarangHapus(3, onErr))
    act(() => h.result.current.setFSearch('AG 1021'))
    await act(async () => { await h.result.current.tampilkan() })

    for (const ruas of ['nama_barang.ilike.', 'nibar.ilike.', 'kode.ilike.', 'no_polisi.ilike.', 'no_rangka.ilike.', 'no_mesin.ilike.']) {
      expect(q!.or).toContain(ruas)
    }
  })

  it('tanpa filter → tak ada like/or yang dikirim', async () => {
    const h = renderHook(() => usePemilihBarangHapus(3, onErr))
    await act(async () => { await h.result.current.tampilkan() })
    expect(q!.like).toBeUndefined()
    expect(q!.or).toBeUndefined()
  })

  it('loaded true & loading kembali false', async () => {
    const h = await isi([br()])
    expect(h.result.current.loaded).toBe(true)
    expect(h.result.current.loading).toBe(false)
    expect(h.result.current.rows).toHaveLength(1)
  })
})

describe('centang satuan', () => {
  it('toggle mencentang lalu melepas', async () => {
    const h = await isi([br({ id: 'b1' })])
    act(() => h.result.current.toggle(br({ id: 'b1' })))
    expect(h.result.current.selList.map(b => b.id)).toEqual(['b1'])
    act(() => h.result.current.toggle(br({ id: 'b1' })))
    expect(h.result.current.selList).toEqual([])
  })

  it('selTotal menjumlah yang TERCENTANG, bukan yang tampil', async () => {
    const h = await isi([br({ id: 'b1', nilai_perolehan: 100 }), br({ id: 'b2', nilai_perolehan: 250 })])
    expect(h.result.current.selTotal).toBe(0)
    act(() => h.result.current.toggle(br({ id: 'b1', nilai_perolehan: 100 })))
    expect(h.result.current.selTotal).toBe(100)
  })
})

describe('centang massal', () => {
  it('mencentang SELURUH baris yang tampil', async () => {
    const h = await isi([br({ id: 'b1' }), br({ id: 'b2' })])
    act(() => h.result.current.toggleAll())
    expect(h.result.current.selList.map(b => b.id).sort()).toEqual(['b1', 'b2'])
  })

  it('kalau semua sudah tercentang → dilepas semua', async () => {
    const h = await isi([br({ id: 'b1' }), br({ id: 'b2' })])
    act(() => h.result.current.toggleAll())
    act(() => h.result.current.toggleAll())
    expect(h.result.current.selList).toEqual([])
  })

  it('baru SEBAGIAN tercentang → toggleAll MELENGKAPI, bukan melepas', async () => {
    const h = await isi([br({ id: 'b1' }), br({ id: 'b2' })])
    act(() => h.result.current.toggle(br({ id: 'b1' })))
    act(() => h.result.current.toggleAll())
    expect(h.result.current.selList.map(b => b.id).sort()).toEqual(['b1', 'b2'])
  })

  it('daftar KOSONG → toggleAll tak mencentang apa pun & tak melepas yang ada', async () => {
    const h = await isi([])
    act(() => h.result.current.setSel({ lama: br({ id: 'lama' }) }))
    act(() => h.result.current.toggleAll())
    expect(h.result.current.selList.map(b => b.id)).toEqual(['lama'])
  })

  it('centang di LUAR hasil filter tak ikut terlepas — kumpulkan dari beberapa kata kunci', async () => {
    const h = await isi([br({ id: 'b1' })])
    act(() => h.result.current.setSel({ luar: br({ id: 'luar' }) }))
    act(() => h.result.current.toggleAll())
    // b1 (tampil) ikut tercentang, `luar` tetap ada.
    expect(h.result.current.selList.map(b => b.id).sort()).toEqual(['b1', 'luar'])
  })
})

describe('Fase 1 — query gagal dilaporkan, bukan jadi "tak ada barang"', () => {
  it('error sampai ke saluran form & `loaded` TETAP false', async () => {
    qErr = { message: 'statement timeout' }
    const h = renderHook(() => usePemilihBarangHapus(3, onErr))
    await act(async () => { await h.result.current.tampilkan() })

    expect(errs[0]).toContain('gagal memuat daftar barang')
    expect(h.result.current.loaded).toBe(false)
    expect(h.result.current.loading).toBe(false)
  })
})
