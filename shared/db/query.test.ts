// Test assertOk & kerabatnya — REFACTOR-PLAN Fase 1.
import { describe, it, expect } from 'vitest'
import { assertOk, assertOkOpsional, assertTulisOk } from './query'

describe('assertOk', () => {
  it('mengembalikan data saat sukses', () => {
    expect(assertOk({ data: [{ id: 1 }], error: null }, 'daftar SKPD')).toEqual([{ id: 1 }])
  })

  it('MELEMPAR saat error, memuat label supaya operator tahu apa yang gagal', () => {
    expect(() => assertOk({ data: null, error: { message: 'statement timeout' } }, 'daftar SKPD'))
      .toThrow(/gagal membaca daftar SKPD: statement timeout/)
  })

  it('MELEMPAR saat data null walau error null — "kosong" tak boleh lolos jadi nol', () => {
    expect(() => assertOk({ data: null, error: null }, 'daftar SKPD'))
      .toThrow(/gagal membaca daftar SKPD: data kosong/)
  })

  it('array kosong itu SAH — nol baris beda dari query gagal', () => {
    expect(assertOk({ data: [], error: null }, 'daftar SKPD')).toEqual([])
  })

  it('nilai falsy yang sah (0, string kosong) tetap lolos', () => {
    expect(assertOk({ data: 0, error: null }, 'jumlah')).toBe(0)
    expect(assertOk({ data: '', error: null }, 'catatan')).toBe('')
  })
})

describe('assertOkOpsional', () => {
  it('null itu SAH — "tidak ketemu" bukan kegagalan', () => {
    expect(assertOkOpsional({ data: null, error: null }, 'preferensi tahun')).toBeNull()
  })

  it('TETAP MELEMPAR kalau query-nya benar-benar gagal', () => {
    // Bedanya dengan `const { data } = await …` yang dilarang: di sana kegagalan
    // dan ketiadaan data tak bisa dibedakan sama sekali.
    expect(() => assertOkOpsional({ data: null, error: { message: 'timeout' } }, 'preferensi tahun'))
      .toThrow(/gagal membaca preferensi tahun: timeout/)
  })
})

describe('assertTulisOk', () => {
  it('diam saat sukses', () => {
    expect(() => assertTulisOk({ error: null }, 'kartu pengadaan')).not.toThrow()
  })

  it('MELEMPAR saat gagal — RLS yang menolak jangan lewat tanpa suara', () => {
    // Tanpa policy UPDATE, tombol Simpan gagal SENYAP: 0 baris ter-update dan
    // tak ada pesan apa pun (pola yang sudah didokumentasikan di CLAUDE.md).
    expect(() => assertTulisOk({ error: { message: 'new row violates row-level security policy' } }, 'kartu pengadaan'))
      .toThrow(/gagal menyimpan kartu pengadaan: new row violates/)
  })
})
