// @vitest-environment jsdom
// ============================================================================
// Mengunci peta rujukan Daftar Barang (./useReferensiDaftarBarang.ts).
//
// Yang dijaga hal-hal yang kalau lepas TIDAK menghasilkan satu pun error:
//   · `admin_skpd` disapu KEYSET sampai habis — berhenti di halaman pertama
//     membuat SKPD ke-1.001 dst tampil "-" di kolom SKPD tiap baris
//   · kegagalan query DIKATAKAN, tak ditelan (INS-06)
//   · …tapi TIDAK fail-closed: peta yang gagal tak boleh menjatuhkan peta
//     satunya maupun daftar barangnya — keduanya cuma LABEL
//   · golongan tanpa jenis aset terdaftar jatuh ke KODE-nya, bukan string
//     kosong (option kosong tak bisa dipilih operator sama sekali)
// ============================================================================
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, cleanup, waitFor } from '@testing-library/react'

type Res = { data: unknown; error: { message: string } | null }
let skpdPages: Res[] = []
let jenisRes: Res = { data: [], error: null }
let kodefikasiRes: Res = { data: [], error: null }
let skpdCalls = 0

vi.mock('@/lib/bmd', () => ({ GOLONGAN_DAFTAR_BARANG: ['1.3.1', '1.3.2'] }))

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: (tabel: string) => {
      const b: Record<string, unknown> = {}
      Object.assign(b, {
        select: () => (tabel === 'admin_jenis_aset' ? Promise.resolve(jenisRes) : b),
        // ⚠️ Bentuk KEYSET (`gt` → `order` → `limit`), bukan `range()`:
        // sejak 2026-09-16 pemuat SKPD lewat `fetchDaftarSkpd` (lib/namaSkpd.ts)
        // yang dibangun di atas `paginate`.
        gt: () => ({ order: () => ({ limit: async () => skpdPages[skpdCalls++] ?? { data: [], error: null } }) }),
        eq: () => b,
        not: () => b,
        limit: async () => kodefikasiRes,
      })
      return b
    },
  }),
}))

import { useReferensiDaftarBarang } from './useReferensiDaftarBarang'

const skpd = (n: number, dari = 0) =>
  Array.from({ length: n }, (_, i) => ({ id: dari + i + 1, nama: `SKPD ${dari + i + 1}` }))

beforeEach(() => {
  skpdCalls = 0
  skpdPages = [{ data: skpd(2), error: null }]
  jenisRes = { data: [{ id: 9, nama: 'Peralatan dan Mesin' }], error: null }
  kodefikasiRes = { data: [{ jenis_aset_id: 9 }], error: null }
})
afterEach(cleanup)

describe('skpdMap', () => {
  it('memetakan id → nama', async () => {
    const { result } = renderHook(() => useReferensiDaftarBarang())
    await waitFor(() => expect(result.current.skpdMap[1]).toBe('SKPD 1'))
    expect(result.current.skpdMap[2]).toBe('SKPD 2')
    expect(result.current.err).toBe('')
  })

  // ⚠️ Sapuan keyset-nya sendiri (halaman berlanjut, urutan, kursor maju,
  // `error` melempar) diuji di lib/namaSkpd.test.ts — di sini yang dijaga
  // cuma bahwa hook ini MEMAKAINYA & menurunkan kegagalannya jadi peringatan.

  it('query gagal → DIKATAKAN, tak ditelan (INS-06)', async () => {
    skpdPages = [{ data: null, error: { message: 'statement timeout' } }]
    const { result } = renderHook(() => useReferensiDaftarBarang())
    await waitFor(() => expect(result.current.err).toContain('statement timeout'))
    expect(result.current.err).toContain('Nama SKPD')
    // Label dari `paginate` ikut terbawa — buktinya ia benar-benar lewat sana.
    expect(result.current.err).toContain('daftar SKPD')
  })

  it('gagal TIDAK menjatuhkan peta jenis aset (bukan fail-closed)', async () => {
    skpdPages = [{ data: null, error: { message: 'boom' } }]
    const { result } = renderHook(() => useReferensiDaftarBarang())
    await waitFor(() => expect(result.current.err).toBeTruthy())
    // Label jenis aset tetap termuat — keduanya hiasan yang berdiri sendiri.
    await waitFor(() => expect(result.current.golonganLabels['1.3.2']).toBe('Peralatan dan Mesin'))
  })
})

describe('golonganLabels', () => {
  it('memetakan prefix golongan → nama jenis aset', async () => {
    const { result } = renderHook(() => useReferensiDaftarBarang())
    await waitFor(() => expect(result.current.golonganLabels['1.3.1']).toBe('Peralatan dan Mesin'))
    expect(Object.keys(result.current.golonganLabels)).toEqual(['1.3.1', '1.3.2'])
  })

  it('jenis aset tak terdaftar → jatuh ke KODE, bukan string kosong', async () => {
    kodefikasiRes = { data: [], error: null }
    const { result } = renderHook(() => useReferensiDaftarBarang())
    await waitFor(() => expect(result.current.golonganLabels['1.3.2']).toBe('1.3.2'))
  })

  it('`admin_jenis_aset` gagal → dilaporkan', async () => {
    jenisRes = { data: null, error: { message: 'tak terbaca' } }
    const { result } = renderHook(() => useReferensiDaftarBarang())
    await waitFor(() => expect(result.current.err).toContain('Nama jenis aset'))
    expect(result.current.err).toContain('tak terbaca')
  })

  it('`admin_kodefikasi_bmd` gagal → dilaporkan, skpdMap tetap termuat', async () => {
    kodefikasiRes = { data: null, error: { message: 'timeout' } }
    const { result } = renderHook(() => useReferensiDaftarBarang())
    await waitFor(() => expect(result.current.err).toContain('Nama jenis aset'))
    await waitFor(() => expect(result.current.skpdMap[1]).toBe('SKPD 1'))
  })
})

describe('dua-duanya gagal', () => {
  it('kedua pesan disebut, tak saling menimpa', async () => {
    skpdPages = [{ data: null, error: { message: 'err-skpd' } }]
    jenisRes = { data: null, error: { message: 'err-jenis' } }
    const { result } = renderHook(() => useReferensiDaftarBarang())
    await waitFor(() => expect(result.current.err).toContain('err-skpd'))
    await waitFor(() => expect(result.current.err).toContain('err-jenis'))
  })
})
