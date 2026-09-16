// @vitest-environment jsdom
// ============================================================================
// Mengunci pengemudi "Jalankan Engine" (./useEngineRun.ts) — LAPIS 1.
//
// Yang dijaga hal-hal yang kalau lepas TIDAK menghasilkan satu pun error, dan
// dua di antaranya bisa melaporkan "selesai" atas hasil yang BOLONG:
//   · loop batch mengikuti kursor `last_id` sampai `done` — berhenti lebih
//     awal berarti sebagian aset tak pernah dihitung, sementara pesannya
//     tetap berbunyi "✓ Engine selesai"
//   · batch yang GAGAL menghentikan seluruhnya (`null`), tidak dilewati
//   · statistik DIJUMLAH lintas batch, bukan diambil dari batch terakhir
//   · `running` dilepas di SEMUA jalur keluar (INS-10) — kalau nyangkut,
//     tombolnya mati "Memproses…" selamanya tanpa keterangan
//   · baris "dilindungi tahun terkunci" hanya disebut kalau memang ada
// ============================================================================
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, renderHook, cleanup } from '@testing-library/react'

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
    from: () => ({ select: () => ({ eq: () => ({ single: async () => profilRes }) }) }),
  }),
}))

let profilRes: { data: { role: string } | null } = { data: { role: 'admin' } }
let batches: { ok: boolean; status?: number; body: Record<string, unknown> }[] = []
let fetchCalls: { periode: string; after_id: string }[] = []
let fetchThrow = false

const fetchMock = vi.fn(async (_url: string, init: { body: string }) => {
  fetchCalls.push(JSON.parse(init.body))
  if (fetchThrow) throw new Error('jaringan putus')
  const b = batches.shift()
  if (!b) throw new Error('batch habis — loop berputar lebih banyak dari yang disiapkan')
  return { ok: b.ok, status: b.status ?? (b.ok ? 200 : 500), json: async () => b.body }
})
vi.stubGlobal('fetch', fetchMock)

import { useEngineRun } from './useEngineRun'

const angka = (n: number) => `Rp${n}`

beforeEach(() => {
  fetchCalls = []; fetchThrow = false
  profilRes = { data: { role: 'admin' } }
  batches = []
})
afterEach(cleanup)

const pasang = () => renderHook(() => useEngineRun(angka))

describe('isAdmin', () => {
  it('true untuk admin pemda', async () => {
    const h = pasang()
    await act(async () => { await Promise.resolve() })
    expect(h.result.current.isAdmin).toBe(true)
  })

  it('false untuk peran lain — tombolnya disembunyikan (server yang menjaga)', async () => {
    profilRes = { data: { role: 'pengurus_barang' } }
    const h = pasang()
    await act(async () => { await Promise.resolve() })
    expect(h.result.current.isAdmin).toBe(false)
  })

  it('profil tak terbaca → false, tidak meledak', async () => {
    profilRes = { data: null }
    const h = pasang()
    await act(async () => { await Promise.resolve() })
    expect(h.result.current.isAdmin).toBe(false)
  })
})

describe('loop batch', () => {
  it('mengikuti kursor `last_id` sampai `done`', async () => {
    batches = [
      { ok: true, body: { processed: 3000, disusutkan: 2000, total_beban: 10, last_id: 'a' } },
      { ok: true, body: { processed: 1500, disusutkan: 1000, total_beban: 5, last_id: 'b' } },
      { ok: true, body: { processed: 500, disusutkan: 400, total_beban: 2, done: true } },
    ]
    const h = pasang()
    let hasil
    await act(async () => { hasil = await h.result.current.jalankan('2026-S2') })
    // Kursor dioper apa adanya; batch pertama mulai dari string kosong.
    expect(fetchCalls.map(c => c.after_id)).toEqual(['', 'a', 'b'])
    expect(fetchCalls.every(c => c.periode === '2026-S2')).toBe(true)
    // DIJUMLAH lintas batch, bukan diambil dari yang terakhir.
    expect(hasil).toEqual({ proses: 5000, disusutkan: 3400, beban: 17, dilindungi: 0 })
  })

  it('kursor KOSONG menghentikan loop walau `done` belum datang', async () => {
    batches = [
      { ok: true, body: { processed: 10, last_id: '' } },
      { ok: true, body: { processed: 99, done: true } },
    ]
    const h = pasang()
    let hasil
    await act(async () => { hasil = await h.result.current.jalankan('2026-S1') })
    expect(fetchCalls).toHaveLength(1)
    expect(hasil?.proses).toBe(10)
  })

  it('batch GAGAL menghentikan seluruhnya & mengembalikan null', async () => {
    // Melanjutkan ke kursor berikutnya akan melewati aset yang belum terhitung
    // lalu melaporkan "✓ selesai" atas hasil yang bolong.
    batches = [
      { ok: true, body: { processed: 100, last_id: 'a' } },
      { ok: false, status: 403, body: { error: 'hanya admin' } },
      { ok: true, body: { processed: 9999, done: true } },
    ]
    const h = pasang()
    let hasil
    await act(async () => { hasil = await h.result.current.jalankan('2026-S2') })
    expect(hasil).toBeNull()
    expect(fetchCalls).toHaveLength(2)
    expect(h.result.current.msg).toContain('hanya admin')
    expect(h.result.current.msg).not.toContain('selesai')
  })

  it('gagal tanpa pesan → kode HTTP yang disebut, bukan "undefined"', async () => {
    batches = [{ ok: false, status: 504, body: {} }]
    const h = pasang()
    await act(async () => { await h.result.current.jalankan('2026-S2') })
    expect(h.result.current.msg).toContain('504')
  })

  it('lemparan jaringan ditangkap & dilaporkan', async () => {
    fetchThrow = true
    const h = pasang()
    let hasil
    await act(async () => { hasil = await h.result.current.jalankan('2026-S2') })
    expect(hasil).toBeNull()
    expect(h.result.current.msg).toContain('jaringan putus')
  })
})

describe('pesan akhir', () => {
  it('menyebut periode, jumlah aset, & total beban', async () => {
    batches = [{ ok: true, body: { processed: 1234, disusutkan: 1000, total_beban: 777, done: true } }]
    const h = pasang()
    await act(async () => { await h.result.current.jalankan('2026-S2') })
    expect(h.result.current.msg).toContain('2026-S2')
    expect(h.result.current.msg).toContain('1.234')
    expect(h.result.current.msg).toContain('Rp777')
  })

  it('baris "dilindungi" disebut HANYA kalau ada', async () => {
    batches = [{ ok: true, body: { processed: 5, done: true } }]
    const h = pasang()
    await act(async () => { await h.result.current.jalankan('2026-S1') })
    expect(h.result.current.msg).not.toContain('dilindungi')
  })

  it('baris "dilindungi" muncul & dijumlah lintas batch', async () => {
    batches = [
      { ok: true, body: { processed: 5, rows_dilindungi_tahun_terkunci: 2, last_id: 'a' } },
      { ok: true, body: { processed: 5, rows_dilindungi_tahun_terkunci: 3, done: true } },
    ]
    const h = pasang()
    let hasil
    await act(async () => { hasil = await h.result.current.jalankan('2026-S1') })
    expect(hasil?.dilindungi).toBe(5)
    expect(h.result.current.msg).toContain('5 baris di tahun terkunci dilindungi')
  })
})

describe('running (INS-10)', () => {
  it('dilepas sesudah sukses', async () => {
    batches = [{ ok: true, body: { processed: 1, done: true } }]
    const h = pasang()
    await act(async () => { await h.result.current.jalankan('2026-S1') })
    expect(h.result.current.running).toBe(false)
  })

  it('dilepas sesudah batch gagal', async () => {
    batches = [{ ok: false, status: 500, body: { error: 'x' } }]
    const h = pasang()
    await act(async () => { await h.result.current.jalankan('2026-S1') })
    expect(h.result.current.running).toBe(false)
  })

  it('dilepas sesudah lemparan', async () => {
    fetchThrow = true
    const h = pasang()
    await act(async () => { await h.result.current.jalankan('2026-S1') })
    expect(h.result.current.running).toBe(false)
  })
})
