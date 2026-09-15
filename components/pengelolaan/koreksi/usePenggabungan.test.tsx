// @vitest-environment jsdom
// ============================================================================
// Mengunci mesin state alasan **Penggabungan Barang** (./usePenggabungan.ts).
//
// Aturan & aritmetikanya sudah dikunci lib/penggabunganNilai.test.ts. Yang
// dijaga DI SINI perilaku yang kalau lepas TIDAK menghasilkan satu pun error:
//
//   · basis dibaca dari semester SEBELUM tanggal dokumen, & ganti tanggal
//     WAJIB memuat ulang
//   · anggota yang belum punya baris engine MEMBLOKIR — akumulasi yang jatuh
//     ke 0 diam-diam menghapus angka dari neraca, padahal penggabungan justru
//     peristiwa yang totalnya HARUS tetap
//   · golongan tak-disusutkan → basis NOL yang sah, bukan error
//   · penjaga lapis kedua menolak barang yang beda kunci, walau query sudah
//     menyaring — "jangan andalkan filter tampilan saja"
//   · daftar sejenis dimuat SEKALI, saat anggota PERTAMA masuk
//   · induk pindah / jatuh ke null saat anggotanya dibuang
// ============================================================================
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, renderHook, waitFor, cleanup } from '@testing-library/react'

/** aset_id → akumulasi, per periode. */
let engine: Record<string, Record<string, number>> = {}
let periodeDiminta: string[] = []
/** Baris yang dijawab query `aset` (pencarian & sejenis). */
let asetRows: unknown[] = []
let asetErr: { message: string } | null = null
let spekErr: { message: string } | null = null
/** Query `aset` yang benar-benar dijalankan — bukti penyaringnya terpasang. */
let asetCalls: { eq: Record<string, unknown>; or?: string; isNull?: string }[] = []

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: (tabel: string) => {
      if (tabel === 'penyusutan_semester') {
        let periode = ''
        let ids: string[] = []
        const q = {
          select: () => q,
          eq: (k: string, v: string) => { if (k === 'periode') { periode = v; periodeDiminta.push(v) } return q },
          in: async (_k: string, v: string[]) => {
            ids = v
            const peta = engine[periode] || {}
            return { data: ids.filter(i => peta[i] !== undefined).map(i => ({ aset_id: i, akumulasi: peta[i] })), error: null }
          },
        }
        return q
      }
      const call: { eq: Record<string, unknown>; or?: string; isNull?: string } = { eq: {} }
      asetCalls.push(call)
      const q2: Record<string, unknown> = {}
      Object.assign(q2, {
        select: () => q2,
        eq: (k: string, v: unknown) => { call.eq[k] = v; return q2 },
        is: (k: string) => { call.isNull = k; return q2 },
        or: (v: string) => { call.or = v; return q2 },
        order: () => q2,
        limit: async () => ({ data: asetRows, error: asetErr }),
        single: async () => ({ data: asetRows[0] ?? {}, error: spekErr }),
      })
      return q2
    },
  }),
}))

import { usePenggabungan } from './usePenggabungan'
import type { KandidatGabung } from './tipe'

const k = (over: Partial<KandidatGabung> = {}): KandidatGabung => ({
  id: 'p1', nibar: null, kode: '1.3.2.05.02.06.121', nama_barang: 'Pagar Besi',
  spesifikasi_lainnya: null, nilai_perolehan: 721_500, tgl_perolehan: '2025-02-05',
  satuan: 'Meter Persegi', merek_tipe: null, ...over,
})

const pasang = (tgl = '2026-08-27') => {
  const errs: string[] = []
  const h = renderHook(() => usePenggabungan(tgl, 108, (m: string) => errs.push(m)))
  return { ...h, errs }
}

beforeEach(() => { engine = {}; periodeDiminta = []; asetRows = []; asetErr = null; spekErr = null; asetCalls = [] })
afterEach(cleanup)

describe('basis akumulasi: semester SEBELUM tanggal dokumen', () => {
  it('dokumen 2026-S2 → yang ditanyakan 2026-S1', async () => {
    engine['2026-S1'] = { p1: 100_000, p2: 200_000 }
    const { result } = pasang()
    await act(async () => { result.current.tambah(k({ id: 'p1' })) })
    await act(async () => { result.current.tambah(k({ id: 'p2' })) })
    await waitFor(() => expect(result.current.basis).not.toBeNull())

    expect(periodeDiminta).toContain('2026-S1')
    expect(periodeDiminta).not.toContain('2026-S2')
    expect(result.current.totalAkum).toBe(300_000)
  })

  it('ganti tanggal ke semester lain → basis DIMUAT ULANG', async () => {
    engine['2026-S1'] = { p1: 100_000 }
    engine['2025-S2'] = { p1: 55_555 }
    const errs: string[] = []
    const { result, rerender } = renderHook(({ t }) => usePenggabungan(t, 108, (m: string) => errs.push(m)), { initialProps: { t: '2026-08-27' } })
    await act(async () => { result.current.tambah(k({ id: 'p1' })) })
    await waitFor(() => expect(result.current.totalAkum).toBe(100_000))

    rerender({ t: '2026-03-01' })
    await waitFor(() => expect(result.current.totalAkum).toBe(55_555))
  })

  it('daftar dikosongkan → basis ikut dibuang, tak tertinggal basi', async () => {
    engine['2026-S1'] = { p1: 100_000 }
    const { result } = pasang()
    await act(async () => { result.current.tambah(k({ id: 'p1' })) })
    await waitFor(() => expect(result.current.basis).not.toBeNull())
    act(() => result.current.hapus('p1'))
    await waitFor(() => expect(result.current.basis).toBeNull())
  })
})

describe('anggota tanpa baris engine → MEMBLOKIR, bukan nol diam-diam', () => {
  it('satu anggota kurang → basis ditahan & pesannya menyebut jumlahnya', async () => {
    engine['2026-S1'] = { p1: 100_000 } // p2 sengaja tak ada
    const { result } = pasang()
    await act(async () => { result.current.tambah(k({ id: 'p1' })) })
    await act(async () => { result.current.tambah(k({ id: 'p2' })) })
    await waitFor(() => expect(result.current.basisErr).not.toBe(''))

    expect(result.current.basis).toBeNull()
    expect(result.current.basisErr).toContain('1 dari 2')
    expect(result.current.basisErr).toContain('2026-S1')
    expect(result.current.basisLoading).toBe(false)
  })

  it('akumulasi NOL yang SAH tidak dianggap kurang', async () => {
    engine['2026-S1'] = { p1: 0, p2: 0 }
    const { result } = pasang()
    await act(async () => { result.current.tambah(k({ id: 'p1' })) })
    await act(async () => { result.current.tambah(k({ id: 'p2' })) })
    await waitFor(() => expect(result.current.basis).not.toBeNull())

    expect(result.current.basisErr).toBe('')
    expect(result.current.totalAkum).toBe(0)
  })

  it('golongan tak disusutkan (Tanah) → basis NOL tanpa menembak engine', async () => {
    const { result } = pasang()
    await act(async () => { result.current.tambah(k({ id: 'p1', kode: '1.3.1.01.01.01.001' })) })
    await waitFor(() => expect(result.current.basis).not.toBeNull())

    expect(result.current.basisErr).toBe('')
    expect(periodeDiminta).toEqual([])
  })
})

describe('penjaga lapis kedua saat menambah anggota', () => {
  it('barang beda NILAI ditolak, walau query sudah menyaring', async () => {
    const { result, errs } = pasang()
    await act(async () => { result.current.tambah(k({ id: 'p1' })) })
    await act(async () => { result.current.tambah(k({ id: 'p2', nilai_perolehan: 999_999 })) })

    expect(result.current.list.map(x => x.id)).toEqual(['p1'])
    expect(errs.some(m => m.includes('tidak bisa digabung'))).toBe(true)
  })

  it('barang beda TANGGAL ditolak', async () => {
    const { result } = pasang()
    await act(async () => { result.current.tambah(k({ id: 'p1' })) })
    await act(async () => { result.current.tambah(k({ id: 'p2', tgl_perolehan: '2025-02-06' })) })
    expect(result.current.list).toHaveLength(1)
  })

  it('barang yang SAMA tak masuk dua kali', async () => {
    const { result } = pasang()
    await act(async () => { result.current.tambah(k({ id: 'p1' })) })
    await act(async () => { result.current.tambah(k({ id: 'p1' })) })
    expect(result.current.list).toHaveLength(1)
  })

  it('anggota pertama jadi induk; yang kedua TIDAK menggesernya', async () => {
    const { result } = pasang()
    await act(async () => { result.current.tambah(k({ id: 'p1' })) })
    await act(async () => { result.current.tambah(k({ id: 'p2' })) })
    expect(result.current.indukId).toBe('p1')
    expect(result.current.induk?.id).toBe('p1')
  })
})

describe('daftar barang sejenis', () => {
  it('dimuat saat anggota PERTAMA masuk, dgn penyaring kode+nilai+tanggal', async () => {
    asetRows = [k({ id: 'p1' }), k({ id: 'p2' }), k({ id: 'p3' })]
    const { result } = pasang()
    await act(async () => { result.current.tambah(k({ id: 'p1' })) })
    await waitFor(() => expect(result.current.sejenis).toHaveLength(3))

    const c = asetCalls[0]
    expect(c.eq['kode']).toBe('1.3.2.05.02.06.121')
    expect(c.eq['nilai_perolehan']).toBe(721_500)
    expect(c.eq['tgl_perolehan']).toBe('2025-02-05')
    expect(c.eq['skpd_id']).toBe(108)
    expect(c.eq['status']).toBe('aktif')
  })

  it('tgl_perolehan null → disaring `is null`, BUKAN `eq null`', async () => {
    const { result } = pasang()
    await act(async () => { result.current.tambah(k({ id: 'p1', tgl_perolehan: null })) })
    await waitFor(() => expect(asetCalls.length).toBeGreaterThan(0))

    expect(asetCalls[0].isNull).toBe('tgl_perolehan')
    expect(asetCalls[0].eq['tgl_perolehan']).toBeUndefined()
  })

  it('TIDAK dimuat ulang saat anggota kedua masuk', async () => {
    asetRows = [k({ id: 'p1' })]
    const { result } = pasang()
    await act(async () => { result.current.tambah(k({ id: 'p1' })) })
    await waitFor(() => expect(asetCalls).toHaveLength(1))
    await act(async () => { result.current.tambah(k({ id: 'p2' })) })
    expect(asetCalls).toHaveLength(1)
  })

  it('sejenisTersisa membuang yang sudah jadi anggota', async () => {
    asetRows = [k({ id: 'p1' }), k({ id: 'p2' })]
    const { result } = pasang()
    await act(async () => { result.current.tambah(k({ id: 'p1' })) })
    await waitFor(() => expect(result.current.sejenis).toHaveLength(2))
    expect(result.current.sejenisTersisa.map(x => x.id)).toEqual(['p2'])
  })

  it('tambahSejenisTerpilih memasukkan yang dicentang saja', async () => {
    asetRows = [k({ id: 'p1' }), k({ id: 'p2' }), k({ id: 'p3' })]
    const { result } = pasang()
    await act(async () => { result.current.tambah(k({ id: 'p1' })) })
    await waitFor(() => expect(result.current.sejenis).toHaveLength(3))
    act(() => result.current.setSelSejenis({ p2: true }))
    act(() => result.current.tambahSejenisTerpilih())
    expect(result.current.list.map(x => x.id)).toEqual(['p1', 'p2'])
  })

  it('gagal memuat sejenis dilaporkan lewat saluran error form', async () => {
    asetErr = { message: 'statement timeout' }
    const { result, errs } = pasang()
    await act(async () => { result.current.tambah(k({ id: 'p1' })) })
    await waitFor(() => expect(errs.some(m => m.includes('barang sejenis'))).toBe(true))
    expect(result.current.sejenisLoading).toBe(false)
  })
})

describe('membuang anggota', () => {
  it('membuang INDUK → indukId jatuh ke null, tak menunjuk barang hantu', async () => {
    const { result } = pasang()
    await act(async () => { result.current.tambah(k({ id: 'p1' })) })
    await act(async () => { result.current.tambah(k({ id: 'p2' })) })
    act(() => result.current.hapus('p1'))

    expect(result.current.indukId).toBeNull()
    expect(result.current.induk).toBeNull()
    expect(result.current.list.map(x => x.id)).toEqual(['p2'])
  })

  it('membuang BUKAN induk → induk tetap', async () => {
    const { result } = pasang()
    await act(async () => { result.current.tambah(k({ id: 'p1' })) })
    await act(async () => { result.current.tambah(k({ id: 'p2' })) })
    act(() => result.current.hapus('p2'))
    expect(result.current.indukId).toBe('p1')
  })

  it('anggota terakhir dibuang → daftar sejenis ikut dibersihkan', async () => {
    asetRows = [k({ id: 'p1' }), k({ id: 'p2' })]
    const { result } = pasang()
    await act(async () => { result.current.tambah(k({ id: 'p1' })) })
    await waitFor(() => expect(result.current.sejenis).toHaveLength(2))
    act(() => result.current.hapus('p1'))
    expect(result.current.sejenis).toEqual([])
  })

  it('membuang anggota membatalkan edit spesifikasi yang tersusun', async () => {
    const { result } = pasang()
    await act(async () => { result.current.tambah(k({ id: 'p1' })) })
    act(() => result.current.setSpek({ fields: { satuan: 'Unit' }, foto: {} }))
    act(() => result.current.hapus('p1'))
    expect(result.current.spek).toBeNull()
  })
})

describe('turunan angka & reset', () => {
  it('syaratOk butuh minimal DUA anggota', async () => {
    const { result } = pasang()
    await act(async () => { result.current.tambah(k({ id: 'p1' })) })
    expect(result.current.syaratOk).toBe(false)
    await act(async () => { result.current.tambah(k({ id: 'p2' })) })
    expect(result.current.syaratOk).toBe(true)
  })

  it('totalNP menjumlah nilai seluruh anggota', async () => {
    const { result } = pasang()
    await act(async () => { result.current.tambah(k({ id: 'p1' })) })
    await act(async () => { result.current.tambah(k({ id: 'p2' })) })
    expect(result.current.totalNP).toBe(1_443_000)
  })

  it('reset() membuang SELURUH jejak', async () => {
    asetRows = [k({ id: 'p1' })]
    const { result } = pasang()
    await act(async () => { result.current.tambah(k({ id: 'p1' })) })
    await waitFor(() => expect(result.current.sejenis).toHaveLength(1))
    act(() => result.current.setSpek({ fields: {}, foto: {} }))
    act(() => result.current.reset())

    expect(result.current.list).toEqual([])
    expect(result.current.indukId).toBeNull()
    expect(result.current.sejenis).toEqual([])
    expect(result.current.spek).toBeNull()
    expect(result.current.q).toBe('')
  })
})

describe('Fase 1 — prefill spesifikasi induk gagal', () => {
  it('popup TIDAK dibuka & errornya dilaporkan', async () => {
    const { result, errs } = pasang()
    await act(async () => { result.current.tambah(k({ id: 'p1' })) })
    spekErr = { message: 'timeout' }
    await act(async () => { await result.current.openSpek() })

    expect(result.current.spekOpen).toBe(false)
    expect(errs.some(m => m.includes('gagal memuat spesifikasi induk'))).toBe(true)
  })
})
