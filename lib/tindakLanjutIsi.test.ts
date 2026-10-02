import { describe, expect, it } from 'vitest'
import { draftDariBaru, namaPecahanDariLki, spekDariLki } from '@/lib/tindakLanjutIsi'

describe('spekDariLki — jawaban "Tidak Sesuai" jadi isian Koreksi Spesifikasi', () => {
  it('hanya field yang Tidak Sesuai & berisi; "Sesuai" tak ikut', () => {
    expect(spekDariLki({
      spesifikasi: { sesuai: false, seharusnya: ' Gedung Kantor Baru ' },
      merek_tipe: { sesuai: true },
      alamat_detail: { sesuai: false, seharusnya: '' },          // kosong → dilewati
      keterangan_barang: { sesuai: false, seharusnya: 'Pinjam pakai KPU' },
      luas: { sesuai: false, seharusnya: '120.5' },
    })).toEqual({ nama_barang: 'Gedung Kantor Baru', keterangan: 'Pinjam pakai KPU', luas: '120.5' })
  })

  it('wilayah, titik koordinat, & data teknis JIJ ikut ke kolomnya', () => {
    expect(spekDariLki({
      wilayah: { sesuai: false, wilayah_kode: '35.06.25.2006' },
      koordinat: { sesuai: false }, latitude: -7.8, longitude: 112.04,
      jenis_perkerasan: { sesuai: false, seharusnya: 'Aspal' },
    })).toEqual({ wilayah_kode: '35.06.25.2006', latitude: '-7.8', longitude: '112.04', jenis_perkerasan: 'Aspal' })
  })

  it('kondisi non-RB ikut dikoreksi; Rusak Berat TIDAK (tindak lanjutnya reklas)', () => {
    expect(spekDariLki({ kondisi: 'RR' })).toEqual({ kondisi_barang: 'Rusak Ringan' })
    expect(spekDariLki({ kondisi: 'RB' })).toEqual({})
  })
})

describe('draftDariBaru — BMD Belum Tercatat jadi draft Hasil Inventarisasi', () => {
  const baru = {
    kode_barang: '1.3.3.01.01.10.001', nama_barang: 'Bangunan Gedung Pendidikan Permanen',
    spesifikasi: 'Ruang kelas', jumlah: 2, satuan: 'Unit', harga_satuan: 15_000_000,
    tgl_perolehan: '2015-01-01', kondisi: 'B' as const, luas: 50, asal_usul: 'swadaya',
    wilayah_kode: '35.06.25.2003', alamat_detail: 'Desa Paron', latitude: -7.81, longitude: 112.05,
  }

  it('kuantitas N dipecah jadi N barang per unit dgn nilai per item', () => {
    const d = draftDariBaru({ baru }, '1.3.3')
    expect(d).toHaveLength(2)
    expect(d[0]).toMatchObject({ kode: baru.kode_barang, uraianBarang: baru.nama_barang, harga: '15000000', satuan: 'Unit', tglPerolehan: '2015-01-01' })
    expect(d[0].fields).toMatchObject({ nama_barang: 'Ruang kelas', kondisi_barang: 'Baik', luas: '50', latitude: '-7.81' })
    // tiap unit punya objek field SENDIRI — menyunting satu tak boleh menular
    expect(d[0].fields).not.toBe(d[1].fields)
  })

  it('hanya kolom yang benar-benar ditulis saat Setujui (asal_usul tidak ada di sana)', () => {
    expect(draftDariBaru({ baru }, '1.3.3')[0].fields).not.toHaveProperty('asal_usul')
  })

  it('tanpa kode barang → tak ada draft', () => {
    expect(draftDariBaru({ baru: { spesifikasi: 'x' } }, '1.3.3')).toEqual([])
    expect(draftDariBaru({}, '1.3.3')).toEqual([])
  })
})

it('namaPecahanDariLki membuang nama kosong', () => {
  expect(namaPecahanDariLki({ sebab_pecahan: ['Gedung A', ' ', 'Gedung B '] })).toEqual(['Gedung A', 'Gedung B'])
})
