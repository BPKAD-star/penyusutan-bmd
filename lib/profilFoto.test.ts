import { describe, expect, it } from 'vitest'
import { alasanFotoDitolak, kotakPotongTengah, MAKS_BERKAS_ASLI } from './profilFoto'

describe('alasanFotoDitolak', () => {
  it('menerima JPG/PNG/WebP dalam batas ukuran', () => {
    for (const type of ['image/jpeg', 'image/png', 'image/webp']) {
      expect(alasanFotoDitolak({ type, size: 1000 })).toBeNull()
    }
  })
  it('menolak format lain (PDF, GIF, HEIC)', () => {
    for (const type of ['application/pdf', 'image/gif', 'image/heic', '']) {
      expect(alasanFotoDitolak({ type, size: 1000 })).toMatch(/JPG, PNG, atau WebP/)
    }
  })
  it('menolak berkas melebihi batas, tapi batasnya sendiri masih lolos', () => {
    expect(alasanFotoDitolak({ type: 'image/jpeg', size: MAKS_BERKAS_ASLI })).toBeNull()
    expect(alasanFotoDitolak({ type: 'image/jpeg', size: MAKS_BERKAS_ASLI + 1 })).toMatch(/terlalu besar/)
  })
})

describe('kotakPotongTengah', () => {
  it('foto lanskap: sisi pendek dipakai, kelebihan lebar dibuang di kedua sisi', () => {
    expect(kotakPotongTengah(1600, 1200)).toEqual({ sx: 200, sy: 0, sisi: 1200 })
  })
  it('foto potret: kelebihan tinggi dibuang di atas & bawah', () => {
    expect(kotakPotongTengah(900, 1600)).toEqual({ sx: 0, sy: 350, sisi: 900 })
  })
  it('foto persegi tak dipotong', () => {
    expect(kotakPotongTengah(500, 500)).toEqual({ sx: 0, sy: 0, sisi: 500 })
  })
})
