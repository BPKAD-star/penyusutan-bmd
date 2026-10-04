import { describe, expect, it } from 'vitest'
import { bukaPakGis, pakGis, sahPakGis, VERSI_PAK_GIS, type AsetGis, type BidangGis } from './cacheGis'

const aset = (o: Partial<AsetGis> = {}): AsetGis => ({
  id: 'a1', nibar: '1201', kode: '1.3.1.01.01.01.001', nama_barang: 'Tanah Kantor', uraian_barang: 'Tanah Bangunan Kantor',
  spesifikasi_lainnya: null, jenis_hak: 'Hak Pakai', nomor_dokumen_kepemilikan: '12', nama_dokumen_kepemilikan: null,
  tanggal_dokumen_kepemilikan: '2020-01-02', tgl_perolehan: '1990-01-01', nilai_perolehan: 1427689804.36, luas: 100.5,
  alamat_detail: 'Jl. A', latitude: -7.81, longitude: 112.01, skpd_id: 26, skpd: { nama: 'Sekretariat Daerah' }, ...o,
})
const bidang = (o: Partial<BidangGis> = {}): BidangGis => ({
  aset_id: 'a1', jenis_hak: 'SHP', nomor_dokumen_kepemilikan: '7', luas: 50, latitude: null, longitude: null, ...o,
})

describe('cache GIS — pemadatan', () => {
  it('pak lalu buka kembali = data semula PERSIS (termasuk null & desimal)', () => {
    const rows = [aset(), aset({ id: 'a2', nibar: null, skpd: null, skpd_id: null, latitude: null, longitude: null, luas: null })]
    const bidangByAset = { a1: [bidang(), bidang({ nomor_dokumen_kepemilikan: null, latitude: -7.8, longitude: 112 })], a2: [bidang({ aset_id: 'a2' })] }
    const hasil = bukaPakGis(JSON.parse(JSON.stringify(pakGis(rows, bidangByAset))))
    expect(hasil.rows).toEqual(rows)
    expect(hasil.bidangByAset).toEqual(bidangByAset)
  })

  it('aset tanpa bidang tak melahirkan entri kosong', () => {
    expect(bukaPakGis(pakGis([aset()], {})).bidangByAset).toEqual({})
  })

  it('hasil pak lolos pemeriksa bentuk', () => {
    expect(sahPakGis(pakGis([aset()], { a1: [bidang()] }))).toBe(true)
  })

  it('lebih ringkas dari JSON berkunci (nama kolom tak diulang)', () => {
    const rows = Array.from({ length: 200 }, (_, i) => aset({ id: `a${i}` }))
    const by = Object.fromEntries(rows.map(r => [r.id, [bidang({ aset_id: r.id })]]))
    const pak = JSON.stringify(pakGis(rows, by)).length
    const mentah = JSON.stringify({ rows, by }).length
    expect(pak).toBeLessThan(mentah * 0.7)
  })
})

describe('cache GIS — pemeriksa bentuk menolak yang aneh', () => {
  const sah = pakGis([aset()], { a1: [bidang()] })
  it('versi berbeda → ditolak', () => {
    expect(sahPakGis({ ...sah, v: VERSI_PAK_GIS + 1 })).toBe(false)
  })
  it('nilai perolehan berupa teks → ditolak', () => {
    const a = sah.a.map(t => { const c = [...t]; c[12] = '1000'; return c })
    expect(sahPakGis({ ...sah, a })).toBe(false)
  })
  it('panjang tuple salah → ditolak', () => {
    expect(sahPakGis({ ...sah, a: [sah.a[0].slice(0, 17)] })).toBe(false)
    expect(sahPakGis({ ...sah, b: [sah.b[0].slice(0, 5)] })).toBe(false)
  })
  it('bukan objek / tanpa array → ditolak', () => {
    expect(sahPakGis(null)).toBe(false)
    expect(sahPakGis({ v: VERSI_PAK_GIS, a: {}, b: [] })).toBe(false)
  })
})
