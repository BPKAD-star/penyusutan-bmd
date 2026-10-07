// Aturan pembatalan termin KDP (2026-10-07). ⚠️ KEMBAR dgn predikat SQL di
// migrasi 20261007_03 (LRA & IPA) — kasus-kasus di sini yang dipakai juga
// untuk memeriksa sisi SQL ke produksi (transaksi + ROLLBACK).
import { describe, it, expect } from 'vitest'
import { terminKdpDibatalkan, type BarisLedgerKdp } from './voidedAset'

const t = (id: number, aset = 'A'): BarisLedgerKdp => ({ id, aset_id: aset, jenis: 'akumulasi_kdp' })
const b = (id: number, payload: unknown, aset = 'A'): BarisLedgerKdp => ({ id, aset_id: aset, jenis: 'batal_akumulasi_kdp', payload })

describe('terminKdpDibatalkan', () => {
  it('pembatal ber-target membatalkan BARIS ITU SAJA', () => {
    expect([...terminKdpDibatalkan([t(1), t(2), b(3, { target_trx_id: 2 })])]).toEqual([2])
  })

  it('siklus setujui → batal → setujui lagi: termin baru tetap berlaku', () => {
    const s = terminKdpDibatalkan([t(1), b(2, { target_trx_id: 1 }), t(3)])
    expect(s.has(1)).toBe(true)
    expect(s.has(3)).toBe(false)
  })

  it('pembatal warisan `{}` membatalkan seluruh termin barang itu yang LEBIH TUA saja', () => {
    const s = terminKdpDibatalkan([t(1), t(2), b(3, {}), t(4), t(5, 'B')])
    expect([...s].sort()).toEqual([1, 2])
  })

  it('pembatal warisan tak menyentuh barang lain', () => {
    expect(terminKdpDibatalkan([t(1, 'B'), b(2, {}, 'A')]).size).toBe(0)
  })

  it('target berupa teks tetap terbaca (payload jsonb)', () => {
    expect(terminKdpDibatalkan([t(7), b(8, { target_trx_id: '7' })]).has(7)).toBe(true)
  })
})
