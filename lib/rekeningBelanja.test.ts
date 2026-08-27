// Uji peringatan kecocokan Kode Rekening ↔ Jenis Aset.
//
// Kenapa diuji: sejak 2026-08-27 aturan ini dipakai DUA pintu (Pengadaan
// non-fisik & termin Pekerjaan Konstruksi). Dulu ia konstanta lokal di satu
// berkas; begitu dipakai dua tempat, salinan yang menyimpang akan membuat dua
// pintu memperingatkan hal berbeda untuk rekening yang sama — dan yang salah
// tak akan error, cuma diam.
import { describe, it, expect } from 'vitest'
import { cekWarningRekening, objekRekening, REK_MODAL_PER_GOLONGAN } from '@/lib/rekeningBelanja'

describe('objekRekening', () => {
  it('mengambil TIGA segmen pertama', () => {
    expect(objekRekening('5.2.02.10.002.00003')).toBe('5.2.02')
    expect(objekRekening('5.1.01.01.001.00001')).toBe('5.1.01')
  })
})

describe('cekWarningRekening', () => {
  it('diam kalau rekening & golongan sinkron', () => {
    expect(cekWarningRekening('5.2.03.01.001.00001', '1.3.3')).toEqual([])
    // KDP boleh dua objek: gedung ATAU jalan/irigasi/jaringan.
    expect(cekWarningRekening('5.2.03.01.001.00001', '1.3.6')).toEqual([])
    expect(cekWarningRekening('5.2.04.01.001.00001', '1.3.6')).toEqual([])
  })

  it('memperingatkan rekening BELANJA OPERASI (5.1) — kasus yang diminta user 2026-08-27', () => {
    const w = cekWarningRekening('5.1.01.01.001.00001', '1.3.6')
    expect(w).toHaveLength(1)
    expect(w[0]).toContain('DI LUAR Belanja Modal')
    expect(w[0]).toContain('5.1.01.01.001.00001')
  })

  it('memperingatkan objek belanja modal yang tak sinkron dgn jenis asetnya', () => {
    const w = cekWarningRekening('5.2.02.10.002.00003', '1.3.3', 'Gedung dan Bangunan')
    expect(w).toHaveLength(1)
    expect(w[0]).toContain('TIDAK SINKRON')
    expect(w[0]).toContain('Gedung dan Bangunan')
    expect(w[0]).toContain('5.2.03')   // yang diharapkan
    expect(w[0]).toContain('5.2.02')   // yang dipilih
  })

  it('rekening kosong bukan kesalahan DI SINI — kewajibannya urusan form', () => {
    expect(cekWarningRekening('', '1.3.6')).toEqual([])
    expect(cekWarningRekening('   ', '1.3.6')).toEqual([])
  })

  it('golongan yang tak terdaftar tak diperiksa kecocokan objeknya', () => {
    // 1.5.4 Aset Lain-Lain isinya campuran — menebak objek belanjanya berarti
    // memperingatkan operator untuk sesuatu yang benar.
    expect(REK_MODAL_PER_GOLONGAN['1.5.4']).toBeUndefined()
    expect(cekWarningRekening('5.2.02.10.002.00003', '1.5.4')).toEqual([])
    // Tapi yang di luar 5.2 tetap ditanya, apa pun golongannya.
    expect(cekWarningRekening('5.1.01.01.001.00001', '1.5.4')).toHaveLength(1)
  })
})
