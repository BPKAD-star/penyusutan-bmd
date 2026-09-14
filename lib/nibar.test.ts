import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { batasAtasPrefix } from './nibar'

describe('batasAtasPrefix', () => {
  it('menaikkan digit terakhir', () => {
    expect(batasAtasPrefix('12013506050000000000002021134010103002')).toBe('12013506050000000000002021134010103003')
  })
  it('membawa sisa melewati deretan 9', () => {
    expect(batasAtasPrefix('1299')).toBe('1300')
  })
  it('rentang [prefix, batas) memuat NIBAR berprefiks & menolak tetangganya (urutan string)', () => {
    const p = '1201350605'
    const up = batasAtasPrefix(p)
    const dalam = (s: string) => s >= p && s < up
    expect(dalam(p + '9999999')).toBe(true)
    expect(dalam(p + '0000000')).toBe(true)
    expect(dalam('1201350606' + '0000000')).toBe(false)
    expect(dalam('1201350604' + '9999999')).toBe(false)
  })
  it('menolak prefiks non-digit & deretan 9 penuh', () => {
    expect(() => batasAtasPrefix('12a')).toThrow()
    expect(() => batasAtasPrefix('999')).toThrow()
  })
})

// Insiden 2026-09-14: `.like('nibar', 'prefix%')` di bawah RLS = seq scan
// 473rb baris → timeout saat Pemecahan Barang. Jangan dikembalikan.
describe('generateNibars tak memakai LIKE', () => {
  it('lib/nibar.ts tidak memanggil .like() pada nibar', () => {
    const src = readFileSync(join(__dirname, 'nibar.ts'), 'utf8')
      .split('\n').filter(l => !/^\s*(\/\/|\*)/.test(l)).join('\n')
    expect(src).not.toMatch(/\.like\(\s*'nibar'/)
    expect(src).toMatch(/\.gte\('nibar'/)
    // insiden 2026-09-14: NIBAR baru tak boleh menabrak kode register barang lain
    expect(src).toMatch(/\.gte\('kode_register'/)
  })
})
