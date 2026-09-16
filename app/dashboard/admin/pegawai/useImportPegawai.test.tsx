// @vitest-environment jsdom
// ============================================================================
// Mengunci mesin Import Excel Daftar Pegawai (./useImportPegawai.ts).
//
// Aturan PEMBACAANNYA diuji di lib/importPegawai.test.ts. Di sini yang dijaga
// perilaku I/O-nya, yang kalau lepas TIDAK menghasilkan error:
//   · query SKPD gagal → MELEMPAR, tak ditelan. Kalau ditelan, SELURUH baris
//     ditandai "SKPD tidak ditemukan" dan operator memperbaiki berkas yang
//     sebenarnya sudah benar
//   · pop-up ditutup HANYA kalau ada baris yang masuk — menutupnya saat
//     seluruhnya gagal membuang pesan kegagalan sebelum sempat dibaca
//   · batch yang gagal dicatat lalu DILANJUTKAN (upsert by NIP idempoten)
//   · `parsing`/`committing` dilepas di `finally` (INS-10)
// ============================================================================
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, renderHook, cleanup } from '@testing-library/react'

let gridMock: unknown[][] = []
vi.mock('xlsx', () => ({
  read: () => ({ SheetNames: ['S'], Sheets: { S: {} } }),
  utils: { sheet_to_json: () => gridMock },
}))

let skpdRes: { data: { id: number }[] | null; error: { message: string } | null } = { data: [], error: null }
let upsertErrs: ({ message: string } | null)[] = []
let upsertChunks: number[] = []
let upsertLempar = false
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({ in: async () => skpdRes }),
      upsert: async (chunk: unknown[]) => {
        if (upsertLempar) throw new Error('jaringan putus')
        upsertChunks.push(chunk.length)
        return { error: upsertErrs.shift() ?? null }
      },
    }),
  }),
}))

import { useImportPegawai } from './useImportPegawai'

const PERAN = [{ value: 'pengurus_barang', label: 'Pengurus Barang' }]
const alat = { normalisasiGolongan: (g: string) => g, pangkatDariGolongan: () => '' }
const berkas = { name: 'bkd.xlsx', arrayBuffer: async () => new ArrayBuffer(0) } as unknown as File

let sukses = 0
const pasang = () => renderHook(() => useImportPegawai(PERAN, () => { sukses++ }, alat))

beforeEach(() => {
  gridMock = [['NIP', 'Nama', 'SKPD ID'], ['1973', 'Budi', '7']]
  skpdRes = { data: [{ id: 7 }], error: null }
  upsertErrs = []; upsertChunks = []; sukses = 0; upsertLempar = false
})
afterEach(cleanup)

describe('bacaBerkas', () => {
  it('menyusun baris & mencatat nama berkasnya', async () => {
    const h = pasang()
    await act(async () => { await h.result.current.bacaBerkas(berkas) })
    expect(h.result.current.namaBerkas).toBe('bkd.xlsx')
    expect(h.result.current.rows).toHaveLength(1)
    expect(h.result.current.rows[0]).toMatchObject({ nip: '1973', valid: true })
    expect(h.result.current.msg).toBe('')
  })

  it('SKPD tak ada di master → baris ditandai, bukan diterima', async () => {
    skpdRes = { data: [], error: null }
    const h = pasang()
    await act(async () => { await h.result.current.bacaBerkas(berkas) })
    expect(h.result.current.rows[0].valid).toBe(false)
  })

  it('query SKPD GAGAL → dilaporkan, baris TIDAK ditampilkan', async () => {
    // Kalau errornya ditelan, `skpdValid` kosong → seluruh baris ditandai
    // "SKPD tidak ditemukan" & operator memperbaiki berkas yang sudah benar.
    skpdRes = { data: null, error: { message: 'statement timeout' } }
    const h = pasang()
    await act(async () => { await h.result.current.bacaBerkas(berkas) })
    expect(h.result.current.msg).toContain('gagal memeriksa SKPD')
    expect(h.result.current.msg).toContain('statement timeout')
    expect(h.result.current.rows).toEqual([])
  })

  it('header NIP tak ketemu → pesannya sampai ke layar', async () => {
    gridMock = [['Nama', 'Jabatan'], ['Budi', 'Staf']]
    const h = pasang()
    await act(async () => { await h.result.current.bacaBerkas(berkas) })
    expect(h.result.current.msg).toContain('NIP')
  })

  it('`parsing` dilepas walau pembacaan gagal (INS-10)', async () => {
    skpdRes = { data: null, error: { message: 'boom' } }
    const h = pasang()
    await act(async () => { await h.result.current.bacaBerkas(berkas) })
    expect(h.result.current.parsing).toBe(false)
  })
})

describe('commit', () => {
  const siap = async () => {
    const h = pasang()
    await act(async () => { await h.result.current.bacaBerkas(berkas) })
    act(() => h.result.current.setTerbuka(true))
    return h
  }

  it('mengirim baris yang valid, menutup pop-up, & menyegarkan daftar', async () => {
    const h = await siap()
    await act(async () => { await h.result.current.commit() })
    expect(upsertChunks).toEqual([1])
    expect(h.result.current.terbuka).toBe(false)
    expect(h.result.current.rows).toEqual([])
    expect(sukses).toBe(1)
    expect(h.result.current.msg).toContain('1 pegawai berhasil diimpor')
  })

  it('baris TIDAK valid tak ikut terkirim', async () => {
    skpdRes = { data: [], error: null }   // SKPD 7 tak ada → baris invalid
    const h = await siap()
    await act(async () => { await h.result.current.commit() })
    expect(upsertChunks).toEqual([])
    expect(sukses).toBe(0)
  })

  it('seluruhnya GAGAL → pop-up TETAP terbuka supaya pesannya terbaca', async () => {
    upsertErrs = [{ message: 'RLS menolak' }]
    const h = await siap()
    await act(async () => { await h.result.current.commit() })
    expect(h.result.current.terbuka).toBe(true)
    expect(h.result.current.msg).toContain('RLS menolak')
    expect(h.result.current.msg).toContain('0 baris berhasil')
    expect(sukses).toBe(0)
    // Barisnya tak dibuang — operator bisa mencoba lagi tanpa memilih berkas.
    expect(h.result.current.rows).toHaveLength(1)
  })

  it('upsert MELEMPAR (jaringan) → dilaporkan & tombolnya dilepas', async () => {
    // `upsert` melaporkan galat DB lewat `error`, tapi kegagalan jaringan ia
    // LEMPAR. Tanpa penangkap: unhandled rejection + tombol nyangkut
    // "Mengimpor…" selamanya tanpa keterangan.
    upsertLempar = true
    const h = await siap()
    await act(async () => { await h.result.current.commit() })
    expect(h.result.current.msg).toContain('jaringan putus')
    expect(h.result.current.committing).toBe(false)
    expect(h.result.current.terbuka).toBe(true)
  })

  it('`committing` dilepas sesudah selesai', async () => {
    const h = await siap()
    await act(async () => { await h.result.current.commit() })
    expect(h.result.current.committing).toBe(false)
  })
})

describe('reset', () => {
  it('mengosongkan pilihan berkas TANPA menutup pop-up', async () => {
    const h = pasang()
    await act(async () => { await h.result.current.bacaBerkas(berkas) })
    act(() => h.result.current.setTerbuka(true))
    act(() => h.result.current.reset())
    expect(h.result.current.rows).toEqual([])
    expect(h.result.current.namaBerkas).toBe('')
    expect(h.result.current.terbuka).toBe(true)
  })
})
