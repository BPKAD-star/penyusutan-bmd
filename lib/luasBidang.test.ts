// ============================================================================
// Mengunci aturan Σ luas bidang tanah (lib/luasBidang.ts) — LAPIS 1.
//
// Pelanggarannya SENYAP: Σ yang dipakai saat bidangnya baru sebagian berluas
// menghasilkan angka yang lebih KECIL dari luas sebenarnya, dan di layar itu
// terbaca sebagai penyusutan luas yang tak pernah terjadi. Tak ada error, tak
// ada baris yang hilang — cuma angka yang salah dan kelihatan wajar.
// ============================================================================
import { describe, it, expect } from 'vitest'
import { luasBidangSah, luasEfektif, ringkasDaftarBidang, type RingkasBidang } from './luasBidang'

const b = (over: Partial<RingkasBidang> = {}): RingkasBidang => ({ n: 3, nLuas: 3, luas: 1500, ...over })

describe('luasBidangSah — ketiga syarat wajib', () => {
  it('semua bidang berluas → sah', () => {
    expect(luasBidangSah(b())).toBe(true)
  })

  it('⚠️ BARU SEBAGIAN berluas → TIDAK sah (inti aturannya)', () => {
    expect(luasBidangSah(b({ n: 3, nLuas: 2 }))).toBe(false)
    expect(luasBidangSah(b({ n: 529, nLuas: 4 }))).toBe(false)  // keadaan nyata 2026-07-28
  })

  it('belum punya bidang sama sekali → tidak sah', () => {
    expect(luasBidangSah(b({ n: 0, nLuas: 0, luas: 0 }))).toBe(false)
  })

  it('agregat luas null → tidak sah walau cacahnya cocok', () => {
    expect(luasBidangSah(b({ n: 2, nLuas: 2, luas: null }))).toBe(false)
  })

  it('undefined / null → tidak sah, bukan melempar', () => {
    expect(luasBidangSah(undefined)).toBe(false)
    expect(luasBidangSah(null)).toBe(false)
  })

  it('Σ NOL yang sah tetap sah — 0 m² beda dari "belum diisi"', () => {
    expect(luasBidangSah(b({ n: 1, nLuas: 1, luas: 0 }))).toBe(true)
  })
})

describe('luasEfektif — Σ bidang menang, register jadi cadangan', () => {
  it('bidang lengkap → Σ bidang yang dipakai, BUKAN kolom register', () => {
    expect(luasEfektif(b({ luas: 1500 }), 999)).toBe(1500)
  })

  it('bidang belum lengkap → jatuh ke kolom register', () => {
    expect(luasEfektif(b({ n: 3, nLuas: 1, luas: 500 }), 2000)).toBe(2000)
  })

  it('belum punya bidang → kolom register', () => {
    expect(luasEfektif(undefined, 2000)).toBe(2000)
  })

  it('⚠️ register null tetap null — "tak diketahui" BUKAN nol meter', () => {
    expect(luasEfektif(undefined, null)).toBeNull()
    expect(luasEfektif(b({ n: 2, nLuas: 1 }), null)).toBeNull()
  })

  it('Σ bidang 0 yang sah menang atas register — bukan jatuh ke cadangan', () => {
    expect(luasEfektif(b({ n: 1, nLuas: 1, luas: 0 }), 777)).toBe(0)
  })
})

describe('ringkasDaftarBidang — jawabannya WAJIB sama dgn luasBidangSah', () => {
  it('semua berluas → ringkasannya sah & Σ-nya benar', () => {
    const r = ringkasDaftarBidang([{ luas: 100 }, { luas: 250 }])
    expect(r).toEqual({ n: 2, nLuas: 2, luas: 350 })
    expect(luasBidangSah(r)).toBe(true)
  })

  it('ada yang kosong → TIDAK sah, dan Σ-nya memang lebih kecil', () => {
    const r = ringkasDaftarBidang([{ luas: 100 }, { luas: null }])
    expect(r).toEqual({ n: 2, nLuas: 1, luas: 100 })
    expect(luasBidangSah(r)).toBe(false)
  })

  it('daftar kosong → n 0 & luas null, tidak sah', () => {
    const r = ringkasDaftarBidang([])
    expect(r).toEqual({ n: 0, nLuas: 0, luas: null })
    expect(luasBidangSah(r)).toBe(false)
  })

  it('luas 0 dihitung sebagai TERISI, bukan kosong', () => {
    const r = ringkasDaftarBidang([{ luas: 0 }, { luas: 0 }])
    expect(r.nLuas).toBe(2)
    expect(luasBidangSah(r)).toBe(true)
  })

  it('kasus nyata 2026-07-28: 529 bidang, 4 berluas → tidak sah', () => {
    const rows = Array.from({ length: 529 }, (_, i) => ({ luas: i < 4 ? 100 : null }))
    const r = ringkasDaftarBidang(rows)
    expect(r.n).toBe(529)
    expect(r.nLuas).toBe(4)
    expect(luasBidangSah(r)).toBe(false)
  })
})
