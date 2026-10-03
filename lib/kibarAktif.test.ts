import { describe, expect, it } from 'vitest'
import { petaDianulir, trxBerlaku, type TrxStatus } from './kibarAktif'

const t = (
  id: number, jenis: string, extra: Partial<TrxStatus> = {},
): TrxStatus => ({ id, jenis, periode: '2026-S2', header_id: null, payload: null, ...extra })

describe('petaDianulir — mekanik 1: payload.target_trx_id(s)', () => {
  it('kapitalisasi yang dibatalkan dianulir (kasus nyata KIBAR 2026-10-03)', () => {
    const trx = [
      t(1, 'saldo_awal', { periode: '2025-S2' }),
      t(10, 'kapitalisasi'),
      t(11, 'batal_kapitalisasi', { payload: { target_trx_id: 10 } }),
    ]
    expect(petaDianulir(trx).get(10)).toBe(11)
    expect(trxBerlaku(trx).map(x => x.id)).toEqual([1, 11])
  })

  it('kapitalisasi yang BELUM dibatalkan tetap berlaku', () => {
    const trx = [t(10, 'kapitalisasi')]
    expect(petaDianulir(trx).size).toBe(0)
    expect(trxBerlaku(trx)).toHaveLength(1)
  })

  it('batal_pengalihan menganulir BEBERAPA baris sekaligus (target_trx_ids)', () => {
    const trx = [
      t(20, 'pengalihan_status'),
      t(21, 'pengalihan_status', { payload: { reversal: true } }),
      t(22, 'batal_pengalihan', { payload: { target_trx_ids: [20, 21] } }),
    ]
    const m = petaDianulir(trx)
    expect(m.get(20)).toBe(22)
    expect(m.get(21)).toBe(22)
  })

  it('koreksi nilai & reklas yang dibatalkan dianulir, yang lain tidak', () => {
    const trx = [
      t(30, 'koreksi_nilai'), t(31, 'koreksi_nilai'),
      t(32, 'batal_koreksi_nilai', { payload: { target_trx_id: 31 } }),
      t(33, 'reklas_kode'), t(34, 'batal_reklas', { payload: { target_trx_id: 33 } }),
    ]
    const hidup = trxBerlaku(trx).map(x => x.id)
    expect(hidup).not.toContain(31)
    expect(hidup).not.toContain(33)
    expect(hidup).toContain(30)
  })

  it('batal_kapitalisasi sisi ANAK (tanpa target) tidak menganulir apa pun', () => {
    // Sisi anak hanya membawa {induk_id, no_dokumen}; KIBAR tak membacanya.
    const trx = [
      t(40, 'kapitalisasi_serap'),
      t(41, 'batal_kapitalisasi', { payload: { induk_id: 'x', no_dokumen: '01' } }),
    ]
    expect(petaDianulir(trx).size).toBe(0)
  })

  it('payload batal yang aneh tidak melempar & tidak menganulir', () => {
    const trx = [t(50, 'kapitalisasi'), t(51, 'batal_kapitalisasi', { payload: { target_trx_id: 'bukan-angka' } })]
    expect(petaDianulir(trx).size).toBe(0)
  })
})

describe('petaDianulir — mekanik 2: penghapusan (tanpa target, replay)', () => {
  it('hapus lalu batal → penghapusan dianulir', () => {
    const trx = [t(60, 'penghapusan_sebab_lain'), t(61, 'batal_penghapusan', { payload: {} })]
    expect(petaDianulir(trx).get(60)).toBe(61)
  })

  it('hapus → batal → hapus LAGI: hanya yang terakhir hidup', () => {
    const trx = [
      t(60, 'penghapusan_pemindahtanganan'), t(61, 'batal_penghapusan', { payload: {} }),
      t(62, 'penghapusan_pemindahtanganan'),
    ]
    const hidup = trxBerlaku(trx).map(x => x.id)
    expect(hidup).toEqual([61, 62])
  })

  it('penghapusan tanpa pembatalan tetap berlaku', () => {
    expect(petaDianulir([t(60, 'penghapusan_sebab_lain')]).size).toBe(0)
  })

  it('urutan (periode, id): batal di periode LEBIH LAMA tak menganulir penghapusan yang lebih baru', () => {
    const trx = [
      t(70, 'batal_penghapusan', { periode: '2026-S1', payload: {} }),
      t(71, 'penghapusan_sebab_lain', { periode: '2026-S2' }),
    ]
    expect(petaDianulir(trx).size).toBe(0)
  })
})

describe('petaDianulir — mekanik 3: pemanfaatan per header', () => {
  it('batal_pemanfaatan menganulir pemanfaatan & selesai milik header yang sama saja', () => {
    const trx = [
      t(80, 'pemanfaatan', { header_id: 'A' }),
      t(81, 'pemanfaatan', { header_id: 'B' }),
      t(82, 'pemanfaatan_selesai', { header_id: 'A' }),
      t(83, 'batal_pemanfaatan', { header_id: 'A' }),
    ]
    const m = petaDianulir(trx)
    expect(m.get(80)).toBe(83)
    expect(m.get(82)).toBe(83)
    expect(m.has(81)).toBe(false)
  })

  it('pemanfaatan BARU di header yang sama sesudah batal tetap berlaku', () => {
    const trx = [
      t(80, 'pemanfaatan', { header_id: 'A' }),
      t(83, 'batal_pemanfaatan', { header_id: 'A' }),
      t(84, 'pemanfaatan', { header_id: 'A' }),
    ]
    expect(petaDianulir(trx).has(84)).toBe(false)
  })
})

it('rantai KIBAR nyata (8 baris) — hanya yang dibatalkan yang dianulir', () => {
  const trx = [
    t(1, 'saldo_awal', { periode: '2025-S2' }),
    t(2, 'pengalihan_status'),
    t(3, 'pengalihan_status', { payload: { reversal: true } }),
    t(4, 'batal_pengalihan', { payload: { target_trx_ids: [2, 3] } }),
    t(5, 'kapitalisasi'),
    t(6, 'batal_kapitalisasi', { payload: { target_trx_id: 5 } }),
    t(7, 'pemanfaatan', { header_id: 'H' }),
    t(8, 'batal_pemanfaatan', { header_id: 'H' }),
  ]
  const dianulir = [...petaDianulir(trx).keys()].sort((a, b) => a - b)
  expect(dianulir).toEqual([2, 3, 5, 7])
})
