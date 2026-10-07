import { describe, it, expect } from 'vitest'
import { cekTanggalTermin, minTglTermin, terminPengikatTerawal, type KontrakKonstruksiPayload } from '@/lib/kdp'

describe('cekTanggalTermin — BAST vs tgl kontrak', () => {
  it('termin fisik tak boleh lebih tua dari kontrak', () => {
    expect(cekTanggalTermin('fisik', '2026-05-30', '2026-06-10')).toMatch(/tidak boleh lebih tua/)
    expect(cekTanggalTermin('pengawasan', '2026-05-30', '2026-06-10')).toMatch(/tidak boleh lebih tua/)
    expect(cekTanggalTermin('biaya_umum', '2026-05-30', '2026-06-10')).toMatch(/tidak boleh lebih tua/)
  })
  it('termin sama / lebih baru dari kontrak selalu sah', () => {
    expect(cekTanggalTermin('fisik', '2026-06-10', '2026-06-10')).toBeNull()
    expect(cekTanggalTermin('fisik', '2026-08-01', '2026-06-10')).toBeNull()
  })
  it('perencanaan boleh lebih tua dari kontrak di TAHUN yang sama', () => {
    expect(cekTanggalTermin('perencanaan', '2026-03-15', '2026-06-10')).toBeNull()
    expect(cekTanggalTermin('perencanaan', '2026-01-01', '2026-12-31')).toBeNull()
  })
  it('perencanaan dari TAHUN sebelumnya ditolak & diarahkan ke Kapitalisasi', () => {
    const p = cekTanggalTermin('perencanaan', '2025-11-20', '2026-03-01')
    expect(p).toMatch(/tahun yang sama/)
    expect(p).toMatch(/Kapitalisasi/)
  })
  it('tanpa tgl kontrak tak menolak apa pun', () => {
    expect(cekTanggalTermin('fisik', '2026-01-01', null)).toBeNull()
  })
})

describe('minTglTermin', () => {
  it('perencanaan mundur sampai awal tahun kontrak, lainnya = tgl kontrak', () => {
    expect(minTglTermin('perencanaan', '2026-06-10')).toBe('2026-01-01')
    expect(minTglTermin('fisik', '2026-06-10')).toBe('2026-06-10')
  })
})

describe('terminPengikatTerawal — perencanaan tak mengikat tgl kontrak', () => {
  it('mengabaikan termin perencanaan', () => {
    const p = { barang: [{ key: 'a', kode: '1.3.6', nama: 'x', pembayaran: [
      { komponen: 'perencanaan', tgl_bast: '2026-03-15', nominal: 1 },
      { komponen: 'fisik', tgl_bast: '2026-07-01', nominal: 1 },
      { komponen: 'pengawasan', tgl_bast: '2026-06-20', nominal: 1 },
    ] }] } as unknown as KontrakKonstruksiPayload
    expect(terminPengikatTerawal(p)).toBe('2026-06-20')
  })
  it('kartu yang cuma berisi perencanaan → tak ada pengikat', () => {
    const p = { barang: [{ key: 'a', kode: '1.3.6', nama: 'x', pembayaran: [
      { komponen: 'perencanaan', tgl_bast: '2026-03-15', nominal: 1 },
    ] }] } as unknown as KontrakKonstruksiPayload
    expect(terminPengikatTerawal(p)).toBeUndefined()
  })
})
