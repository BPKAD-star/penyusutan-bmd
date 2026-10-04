import { describe, it, expect } from 'vitest'
import { kekuranganNamaKdp, namaBarangKdp } from './kdp'

const b = (kode: string, nama: string, nb?: string) => ({ kode, nama, spec: nb === undefined ? undefined : { nama_barang: nb } })

describe('nama barang KDP', () => {
  it('Spesifikasi Nama Barang menang atas nama bawaan; kosong → nama bawaan → kode', () => {
    expect(namaBarangKdp(b('1.3.6.1', 'Uraian', 'Rehab Ruas A'))).toBe('Rehab Ruas A')
    expect(namaBarangKdp(b('1.3.6.1', 'Uraian', '  '))).toBe('Uraian')
    expect(namaBarangKdp(b('1.3.6.1', ''))).toBe('1.3.6.1')
  })
  it('wajib diisi', () => {
    expect(kekuranganNamaKdp([b('1.3.6.1', 'U', 'A'), b('1.3.6.1', 'U')])).toMatch(/belum punya Spesifikasi Nama Barang/)
    expect(kekuranganNamaKdp([b('1.3.6.1', 'U', '   ')])).toMatch(/belum punya/)
  })
  it('tidak boleh kembar (abaikan huruf besar/kecil & spasi ganda)', () => {
    expect(kekuranganNamaKdp([b('1.3.6.1', 'U', 'Rehab  Ruas A'), b('1.3.6.2', 'V', ' rehab ruas a ')])).toMatch(/kembar/)
  })
  it('nama berbeda lolos; kontrak kosong lolos', () => {
    expect(kekuranganNamaKdp([b('1.3.6.1', 'U', 'Ruas A'), b('1.3.6.1', 'U', 'Ruas B')])).toBeNull()
    expect(kekuranganNamaKdp([])).toBeNull()
  })
})
