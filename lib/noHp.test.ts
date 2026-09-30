import { describe, it, expect } from 'vitest'
import { normalNoHp, tampilNoHp } from './noHp'

describe('normalNoHp — satu bentuk tersimpan 62…', () => {
  it('menerima berbagai gaya ketik', () => {
    expect(normalNoHp('081234567890')).toBe('6281234567890')
    expect(normalNoHp('0812-3456-7890')).toBe('6281234567890')
    expect(normalNoHp('+62 812 3456 7890')).toBe('6281234567890')
    expect(normalNoHp('6281234567890')).toBe('6281234567890')
    expect(normalNoHp('81234567890')).toBe('6281234567890')
  })

  it('kosong = hapus nomor', () => {
    expect(normalNoHp('')).toBeNull()
    expect(normalNoHp('   ')).toBeNull()
    expect(normalNoHp(null)).toBeNull()
  })

  it('menolak yang bukan nomor Indonesia / panjang tak wajar / berhuruf', () => {
    expect(() => normalNoHp('0812')).toThrow(/Panjang/)
    expect(() => normalNoHp('+1 555 123 4567')).toThrow(/Indonesia/)
    expect(() => normalNoHp('0812abc4567')).toThrow(/angka/)
    expect(() => normalNoHp('0812345678901234567')).toThrow(/Panjang/)
  })

  it('hasilnya selalu lolos CHECK DB ^62[0-9]{8,13}$', () => {
    for (const x of ['081234567', '08123456789012', '+62-812-1111-2222']) {
      expect(normalNoHp(x)).toMatch(/^62[0-9]{8,13}$/)
    }
  })
})

describe('tampilNoHp', () => {
  it('62… → 08xx-xxxx-xxxx', () => {
    expect(tampilNoHp('6281234567890')).toBe('0812-3456-7890')
    expect(tampilNoHp(null)).toBe('')
  })
})
