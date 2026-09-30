import { describe, it, expect } from 'vitest'
import { jenisHakTampil, teksJenisHak, tambahBidangHak, type RingkasHak } from './jenisHakBidang'

const ringkas = (...hak: (string | null)[]): RingkasHak => {
  const r: RingkasHak = { n: 0, hak: {} }
  for (const h of hak) tambahBidangHak(r, h)
  return r
}

describe('jenisHakTampil', () => {
  it('register tanpa bidang → jenis hak register apa adanya', () => {
    const t = jenisHakTampil(undefined, 'Hak Pakai')
    expect(t.dariRegister).toBe(true)
    expect(t.baris).toEqual([{ hak: 'Hak Pakai', n: 0 }])
    expect(teksJenisHak(t)).toBe('Hak Pakai')
  })

  it('register tanpa bidang & tanpa jenis hak → kosong, tidak menebak', () => {
    expect(jenisHakTampil(undefined, null).baris).toEqual([])
    expect(jenisHakTampil(undefined, '  ').baris).toEqual([])
    expect(teksJenisHak(jenisHakTampil(undefined, null))).toBe('')
  })

  it('bidang ada tapi tak satu pun berjenis hak → jatuh ke register (info tak dihapus)', () => {
    const t = jenisHakTampil(ringkas(null, null), 'Hak Milik')
    expect(t.dariRegister).toBe(true)
    expect(teksJenisHak(t)).toBe('Hak Milik')
  })

  it('semua bidang satu jenis → namanya saja', () => {
    const t = jenisHakTampil(ringkas('Hak Pakai', 'Hak Pakai', 'Hak Pakai'), 'Hak Milik')
    expect(t.dariRegister).toBe(false)
    expect(t.belumDiisi).toBe(0)
    expect(teksJenisHak(t)).toBe('Hak Pakai') // bidang MENANG atas register
  })

  it('beberapa jenis berbeda → tiap jenis dengan jumlah bidangnya, terbanyak dulu', () => {
    const t = jenisHakTampil(ringkas('Hak Milik', 'Hak Pakai', 'Hak Milik', 'Hak Milik'), null)
    expect(t.baris).toEqual([{ hak: 'Hak Milik', n: 3 }, { hak: 'Hak Pakai', n: 1 }])
    expect(teksJenisHak(t)).toBe('Hak Milik (3 bidang); Hak Pakai (1 bidang)')
  })

  it('urutan total: seri jumlah diurut abjad', () => {
    const t = jenisHakTampil(ringkas('Hak Pakai', 'Hak Milik'), null)
    expect(t.baris.map(x => x.hak)).toEqual(['Hak Milik', 'Hak Pakai'])
  })

  it('bidang yang belum diisi DILAPORKAN, tidak dianggap sama dgn yang lain', () => {
    const t = jenisHakTampil(ringkas('Hak Pakai', 'Hak Pakai', null, null, null), null)
    expect(t.belumDiisi).toBe(3)
    expect(t.nBidang).toBe(5)
    // Satu jenis tapi belum lengkap → TIDAK boleh terbaca "seluruhnya Hak Pakai".
    expect(teksJenisHak(t)).toBe('Hak Pakai (2 bidang); belum diisi (3 bidang)')
  })

  it('spasi & huruf sama dianggap satu jenis (trim), huruf beda tetap beda', () => {
    const t = jenisHakTampil(ringkas('Hak Pakai', ' Hak Pakai ', 'hak pakai'), null)
    expect(t.baris).toEqual([{ hak: 'Hak Pakai', n: 2 }, { hak: 'hak pakai', n: 1 }])
  })
})
