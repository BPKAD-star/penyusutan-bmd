import { describe, it, expect } from 'vitest'
import { penggunaanTampil, type PenggunaanSumber } from './penggunaanTampil'

const r = (over: Partial<PenggunaanSumber> = {}): PenggunaanSumber => ({
  pemanfaatan: null, pengamanan: null, penggunaan_pengamanan: null, ...over,
})

describe('penggunaanTampil — cache aktif MENDUDUKI teks baseline', () => {
  it('tak ada cache sama sekali → jatuh ke teks baseline', () => {
    expect(penggunaanTampil(r({ penggunaan_pengamanan: 'Kantor Camat' })))
      .toEqual({ baris: ['Kantor Camat'], aktif: false })
  })

  it('tak ada apa-apa sama sekali → kosong, bukan array ber-string kosong', () => {
    expect(penggunaanTampil(r())).toEqual({ baris: [], aktif: false })
  })

  it('pemanfaatan aktif → menang atas baseline, bukan menambahkannya', () => {
    expect(penggunaanTampil(r({ pemanfaatan: 'Sewa — Bank Jatim (s.d. 12 Agu 2027)', penggunaan_pengamanan: 'Kantor Camat' })))
      .toEqual({ baris: ['Sewa — Bank Jatim (s.d. 12 Agu 2027)'], aktif: true })
  })

  it('pengamanan aktif → tampil sbg NAMA SAJA (identitas dibuang), menang atas baseline', () => {
    expect(penggunaanTampil(r({ pengamanan: 'Budi Santoso (NIP 123)', penggunaan_pengamanan: 'Kantor Camat' })))
      .toEqual({ baris: ['Budi Santoso'], aktif: true })
  })

  it('⚠️ Gedung & Bangunan bisa punya KEDUANYA sekaligus → ditumpuk, tak satu pun dibuang', () => {
    expect(penggunaanTampil(r({
      pengamanan: 'Budi Santoso (NIP 123)',
      pemanfaatan: 'Sewa — Bank Jatim (s.d. 12 Agu 2027)',
      penggunaan_pengamanan: 'Kantor Camat',
    }))).toEqual({
      baris: ['Budi Santoso', 'Sewa — Bank Jatim (s.d. 12 Agu 2027)'],
      aktif: true,
    })
  })
})
