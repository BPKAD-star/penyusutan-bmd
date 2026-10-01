import { describe, it, expect } from 'vitest'
import { fieldBaru, kekuranganBaru, kunciBaru, type BaruData } from './inventarisasiBaru'

const HARI = '2026-10-02'

const ATL: BaruData = {
  kode_barang: '1.3.5.01.01.01.001', satuan: 'Unit', jumlah: 2, harga_satuan: 500000, tgl_perolehan: '2024-01-15',
  spesifikasi: 'Rak arsip', merek_tipe: 'Brother', spesifikasi_lainnya: 'Besi', wilayah_kode: '3506010001',
  alamat_detail: 'Jl. Mawar 1', latitude: -7.8, longitude: 111.9, kondisi: 'B',
  penggunaan: 'Kantor', keterangan: 'Temuan', asal_usul: 'Hibah',
}

describe('fieldBaru — spesifikasi mengikuti golongan', () => {
  it('Peralatan & Mesin membawa nomor kendaraan, Tanah tidak', () => {
    const pm = fieldBaru('1.3.2')
    expect(pm).toEqual(expect.arrayContaining(['no_polisi', 'no_rangka', 'no_mesin', 'no_bpkb']))
    expect(fieldBaru('1.3.1')).not.toContain('no_polisi')
  })

  it('Tanah membawa dokumen kepemilikan, jenis hak & luas; Gedung hanya luas (sama dgn Hasil Inventarisasi)', () => {
    expect(fieldBaru('1.3.1')).toEqual(expect.arrayContaining(['jenis_hak', 'luas', 'nomor_dokumen_kepemilikan', 'tanggal_dokumen_kepemilikan', 'nama_dokumen_kepemilikan']))
    const gedung = fieldBaru('1.3.3')
    expect(gedung).toContain('luas')
    expect(gedung).not.toContain('jenis_hak')
  })

  it('Asal Usul ada di SEMUA golongan & urutannya mengikuti permintaan user (nama dulu, asal usul terakhir)', () => {
    for (const g of ['1.3.1', '1.3.2', '1.3.3', '1.3.4', '1.3.5', '1.3.6', '1.5.3', '1.5.4']) {
      const f = fieldBaru(g)
      expect(f[0]).toBe('nama_barang')
      expect(f[f.length - 1]).toBe('asal_usul')
    }
  })

  it('field yang namanya beda di `baru` dipetakan', () => {
    expect(kunciBaru('nama_barang')).toBe('spesifikasi')
    expect(kunciBaru('penggunaan_pengamanan')).toBe('penggunaan')
    expect(kunciBaru('kondisi_barang')).toBe('kondisi')
    expect(kunciBaru('merek_tipe')).toBe('merek_tipe')
  })
})

describe('kekuranganBaru — semua wajib', () => {
  it('isian lengkap → tak ada kekurangan', () => {
    expect(kekuranganBaru(ATL, '1.3.5', HARI)).toEqual([])
  })

  it('lembar kosong menyebut SEMUA yang kurang sekaligus', () => {
    const k = kekuranganBaru({}, '1.3.5', HARI)
    expect(k).toEqual(expect.arrayContaining([
      'Kode Barang', 'Satuan Barang', 'Kuantitas', 'Nilai per item', 'Tanggal Perolehan',
      'Spesifikasi Nama Barang', 'Merek / Tipe', 'Spesifikasi Lainnya', 'Titik Koordinat',
      'Kondisi Barang', 'Penggunaan', 'Keterangan', 'Asal Usul',
    ]))
  })

  it('kuantitas & nilai per item harus > 0', () => {
    expect(kekuranganBaru({ ...ATL, jumlah: 0 }, '1.3.5', HARI)).toEqual(['Kuantitas'])
    expect(kekuranganBaru({ ...ATL, harga_satuan: 0 }, '1.3.5', HARI)).toEqual(['Nilai per item'])
  })

  it('tanggal perolehan tak boleh di masa depan (ledger menolaknya)', () => {
    expect(kekuranganBaru({ ...ATL, tgl_perolehan: '2026-10-03' }, '1.3.5', HARI))
      .toEqual(['Tanggal Perolehan tidak boleh di masa depan'])
    expect(kekuranganBaru({ ...ATL, tgl_perolehan: HARI }, '1.3.5', HARI)).toEqual([])
  })

  it('titik koordinat butuh KEDUA nilai (0 itu koordinat sah, null bukan)', () => {
    expect(kekuranganBaru({ ...ATL, longitude: null }, '1.3.5', HARI)).toEqual(['Titik Koordinat'])
    expect(kekuranganBaru({ ...ATL, latitude: 0, longitude: 0 }, '1.3.5', HARI)).toEqual([])
  })

  it('spasi saja tak dianggap terisi', () => {
    expect(kekuranganBaru({ ...ATL, penggunaan: '   ' }, '1.3.5', HARI)).toEqual(['Penggunaan'])
  })

  it('field yang tak berlaku utk golongannya TIDAK dituntut (Tanah tanpa nomor polisi)', () => {
    const tanah: BaruData = { ...ATL, kode_barang: '1.3.1.01.01.01.001', jenis_hak: 'Hak Pakai', luas: 100,
      nomor_dokumen_kepemilikan: '123', tanggal_dokumen_kepemilikan: '2020-01-01', nama_dokumen_kepemilikan: 'Sertifikat' }
    delete tanah.merek_tipe
    expect(kekuranganBaru(tanah, '1.3.1', HARI)).toEqual([])
    expect(kekuranganBaru({ ...tanah, luas: 0 }, '1.3.1', HARI)).toEqual(['Luas'])
  })

  it('Peralatan & Mesin menuntut nomor polisi/rangka/mesin/BPKB', () => {
    const k = kekuranganBaru(ATL, '1.3.2', HARI)
    expect(k).toEqual(expect.arrayContaining(['Nomor Polisi', 'Nomor Rangka', 'Nomor Mesin', 'Nomor BPKB']))
  })
})
