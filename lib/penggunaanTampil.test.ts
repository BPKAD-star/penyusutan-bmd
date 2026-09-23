import { describe, it, expect } from 'vitest'
import { penggunaanTampil, type PenggunaanSumber } from './penggunaanTampil'

const r = (over: Partial<PenggunaanSumber> = {}): PenggunaanSumber => ({
  pemanfaatan: null, pengamanan: null, penggunaan_pengamanan: null, ...over,
})

describe('penggunaanTampil — cache aktif MENDUDUKI teks baseline', () => {
  it('tak ada cache sama sekali → jatuh ke teks baseline', () => {
    expect(penggunaanTampil(r({ penggunaan_pengamanan: 'Kantor Camat' })))
      .toEqual({ pengamanan: null, pemanfaatan: null, dasar: 'Kantor Camat' })
  })

  it('tak ada apa-apa sama sekali → ketiganya null', () => {
    expect(penggunaanTampil(r())).toEqual({ pengamanan: null, pemanfaatan: null, dasar: null })
  })

  it('pemanfaatan aktif → menang atas baseline (dasar jadi null), bukan menambahkannya', () => {
    expect(penggunaanTampil(r({ pemanfaatan: 'Sewa — Bank Jatim (s.d. 12 Agu 2027)', penggunaan_pengamanan: 'Kantor Camat' })))
      .toEqual({ pengamanan: null, pemanfaatan: 'Sewa — Bank Jatim (s.d. 12 Agu 2027)', dasar: null })
  })

  it('pengamanan aktif → NAMA SAJA (identitas dibuang), menang atas baseline', () => {
    expect(penggunaanTampil(r({ pengamanan: 'Budi Santoso (NIP 123)', penggunaan_pengamanan: 'Kantor Camat' })))
      .toEqual({ pengamanan: 'Budi Santoso', pemanfaatan: null, dasar: null })
  })

  it('⚠️ Gedung & Bangunan bisa punya KEDUANYA sekaligus → dua ruas terisi bersamaan', () => {
    expect(penggunaanTampil(r({
      pengamanan: 'Budi Santoso (NIP 123)',
      pemanfaatan: 'Sewa — Bank Jatim (s.d. 12 Agu 2027)',
      penggunaan_pengamanan: 'Kantor Camat',
    }))).toEqual({
      pengamanan: 'Budi Santoso',
      pemanfaatan: 'Sewa — Bank Jatim (s.d. 12 Agu 2027)',
      dasar: null,
    })
  })
})
