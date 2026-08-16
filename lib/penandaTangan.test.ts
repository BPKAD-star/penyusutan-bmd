// Uji bagian MURNI pemilih penanda tangan lembar per-SKPD.
//
// Kenapa diuji: yang salah di sini tercetak di kertas lalu ditandatangani. Blok
// yang berbunyi "Kepala X" untuk pejabat yang sebenarnya cuma Plt. adalah cacat
// dokumen resmi, dan tak ada satu pun proses di aplikasi yang akan menangkapnya.
import { describe, it, expect } from 'vitest'
import { rantaiKeAtas, calonTtdAwal, labelAsalTtd, type CalonTtd, type SkpdNode } from '@/lib/penandaTangan'

const POHON = new Map<number, SkpdNode>([
  [1, { id: 1, nama: 'Dinas Pendidikan', parent_id: null }],
  [2, { id: 2, nama: 'Korwil Kecamatan Mojo', parent_id: 1 }],
  [3, { id: 3, nama: 'SDN Mojo 1', parent_id: 2 }],
  [9, { id: 9, nama: 'Dinas Perumahan', parent_id: null }],
])

const calon = (o: Partial<CalonTtd> & { id: string; sumber: CalonTtd['sumber'] }): CalonTtd => ({
  nama: o.id, nip: null, jabatan: null, skpd_id: null, asal: null, pltDisarankan: false, ...o,
})

describe('rantaiKeAtas', () => {
  it('naik dari daun sampai akar', () => {
    expect(rantaiKeAtas(3, POHON)).toEqual([3, 2, 1])
  })

  it('akar hanya berisi dirinya', () => {
    expect(rantaiKeAtas(1, POHON)).toEqual([1])
  })

  it('SKPD yang tak dikenal tetap mengembalikan dirinya, bukan array kosong', () => {
    // Daftar SKPD bisa belum termuat. Rantai kosong akan membuat query
    // `.in('skpd_id', [])` mengembalikan NOL calon — layarnya lalu berkata
    // "tak ada pejabat" padahal cuma datanya yang belum sampai.
    expect(rantaiKeAtas(404, POHON)).toEqual([404])
  })

  it('parent_id yang melingkar tidak menggantung', () => {
    const siklus = new Map<number, SkpdNode>([
      [1, { id: 1, nama: 'A', parent_id: 2 }],
      [2, { id: 2, nama: 'B', parent_id: 1 }],
    ])
    expect(rantaiKeAtas(1, siklus)).toEqual([1, 2])
  })
})

describe('calonTtdAwal — urutan saran', () => {
  it('Kepala SKPD itu sendiri menang atas pemegang rangkap', () => {
    const d = [
      calon({ id: 'kepala', sumber: 'sendiri', jabatan: 'Kepala Dinas Perumahan' }),
      calon({ id: 'rangkap', sumber: 'rangkap', pltDisarankan: true }),
    ]
    expect(calonTtdAwal(d)?.id).toBe('kepala')
  })

  it('SKPD tanpa Kepala sendiri → jatuh ke pemegang rangkap, dgn saran Plt.', () => {
    // Kasus nyata Dinas Perumahan (2026-08-16): dua pegawai terdaftar, keduanya
    // staf, dan kepalanya orang Dinas PU yang merangkap.
    const d = [
      calon({ id: 'staf1', sumber: 'sendiri', jabatan: 'Penata Layanan Operasional' }),
      calon({ id: 'irwan', sumber: 'rangkap', jabatan: 'Kepala Dinas Pekerjaan Umum', pltDisarankan: true }),
    ]
    const awal = calonTtdAwal(d)
    expect(awal?.id).toBe('irwan')
    expect(awal?.pltDisarankan).toBe(true)
  })

  it('staf SKPD itu TIDAK dijadikan saran hanya karena ia "sendiri"', () => {
    const d = [
      calon({ id: 'staf', sumber: 'sendiri', jabatan: 'Pengadministrasi Perkantoran' }),
      calon({ id: 'kepalaInduk', sumber: 'induk', jabatan: 'Kepala Dinas Pendidikan' }),
    ]
    expect(calonTtdAwal(d)?.id).toBe('kepalaInduk')
  })

  it('daftar kosong → null, bukan lemparan', () => {
    expect(calonTtdAwal([])).toBeNull()
  })
})

describe('labelAsalTtd', () => {
  it('pegawai sendiri tanpa keterangan tambahan', () => {
    expect(labelAsalTtd(calon({ id: 'a', sumber: 'sendiri' }))).toBe('')
  })

  it('rangkap menyebut SKPD asal & menandai Plt.', () => {
    const s = labelAsalTtd(calon({ id: 'a', sumber: 'rangkap', asal: 'Dinas PU', pltDisarankan: true }))
    expect(s).toContain('Dinas PU')
    expect(s).toContain('Plt.')
  })

  it('induk menyebut SKPD induknya', () => {
    expect(labelAsalTtd(calon({ id: 'a', sumber: 'induk', asal: 'Dinas Pendidikan' })))
      .toContain('Dinas Pendidikan')
  })
})
