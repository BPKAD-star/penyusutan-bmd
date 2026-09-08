import { describe, it, expect } from 'vitest'
import { kekuranganBarangPengadaan, LABEL_ISIAN_PENGADAAN } from './draftPengadaan'

const lengkap = {
  rekening: '5.2.02.01.001.00001', kode: '1.3.2.10.01.02.002',
  satuan: 'Unit', kuantitas: 1, harga: 15_000_000,
}

describe('kekuranganBarangPengadaan', () => {
  it('isian lengkap → tak ada kekurangan', () => {
    expect(kekuranganBarangPengadaan(lengkap)).toEqual([])
  })

  // ⚠️ Dua inilah yang dulu LOLOS. Kalau salah satu uji ini merah, barang tanpa
  // kode rekening / tanpa satuan bisa masuk register lagi tanpa suara.
  it('KODE REKENING kosong ditolak — `cekWarningRekening` sengaja melewatinya', () => {
    expect(kekuranganBarangPengadaan({ ...lengkap, rekening: '   ' }))
      .toEqual([LABEL_ISIAN_PENGADAAN.rekening])
  })
  it('SATUAN kosong ditolak — kalau lolos, `aset.satuan` NULL saat approve', () => {
    expect(kekuranganBarangPengadaan({ ...lengkap, satuan: '' }))
      .toEqual([LABEL_ISIAN_PENGADAAN.satuan])
  })

  it('kode barang belum dipilih ditolak', () => {
    expect(kekuranganBarangPengadaan({ ...lengkap, kode: '' }))
      .toEqual([LABEL_ISIAN_PENGADAAN.kode])
  })
  it('kuantitas 0 / negatif / bukan angka ditolak', () => {
    for (const q of [0, -3, NaN]) {
      expect(kekuranganBarangPengadaan({ ...lengkap, kuantitas: q }))
        .toEqual([LABEL_ISIAN_PENGADAAN.kuantitas])
    }
  })
  it('harga 0 ditolak — barang berharga nol sama saja belum diisi', () => {
    expect(kekuranganBarangPengadaan({ ...lengkap, harga: 0 }))
      .toEqual([LABEL_ISIAN_PENGADAAN.harga])
  })

  // Penolakan satu-per-satu memaksa operator menekan tombol lima kali untuk
  // tahu lima hal yang kurang; tiap penolakan terbaca sbg kesalahan baru.
  it('SELURUH kekurangan dilaporkan sekaligus, urut seperti di layar', () => {
    expect(kekuranganBarangPengadaan({ rekening: '', kode: '', satuan: '', kuantitas: 0, harga: 0 }))
      .toEqual([
        LABEL_ISIAN_PENGADAAN.rekening, LABEL_ISIAN_PENGADAAN.kode,
        LABEL_ISIAN_PENGADAAN.satuan, LABEL_ISIAN_PENGADAAN.kuantitas,
        LABEL_ISIAN_PENGADAAN.harga,
      ])
  })
})
