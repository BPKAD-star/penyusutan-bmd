// ============================================================================
// Mengunci aturan Koreksi Pencatatan Ganda (lib/pencatatanGanda.ts).
//
// Yang dijaga: `kode` itu PEMBLOKIR (barangnya bukan duplikat), sedangkan
// nama/nilai/tahun cuma PERINGATAN. Menyamakan keempatnya tak menghasilkan
// satu pun error — cuma koreksi sah yang jadi mustahil, atau dua barang
// berbeda yang diam-diam dilebur.
// ============================================================================
import { describe, it, expect } from 'vitest'
import { bedaKandidat, tahunDari, type KandidatGanda } from './pencatatanGanda'

const k = (over: Partial<KandidatGanda> = {}): KandidatGanda =>
  ({ id: 'a', kode: '1.3.2.01.01.01.001', nama_barang: 'Laptop', nilai_perolehan: 10_000_000, tgl_perolehan: '2024-05-13', ...over })

describe('tahunDari', () => {
  it('mengambil empat digit tahun', () => expect(tahunDari('2024-05-13')).toBe('2024'))
  it('tanggal kosong → "-", bukan string kosong yang tak terbaca', () => expect(tahunDari(null)).toBe('-'))
})

describe('bedaKandidat — satu vs nol kandidat', () => {
  it('daftar kosong → tak ada yang berbeda', () => {
    expect(bedaKandidat([])).toEqual({ kode: false, nilai: false, tahun: false, nama: false })
  })
  it('SATU kandidat → tak ada yang berbeda (belum ada pembandingnya)', () => {
    expect(bedaKandidat([k()])).toEqual({ kode: false, nilai: false, tahun: false, nama: false })
  })
})

describe('bedaKandidat — tiap ruas terdeteksi SENDIRI-SENDIRI', () => {
  it('duplikat sempurna → semuanya false', () => {
    expect(bedaKandidat([k({ id: 'a' }), k({ id: 'b' })])).toEqual({ kode: false, nilai: false, tahun: false, nama: false })
  })

  it('beda KODE saja', () => {
    const r = bedaKandidat([k({ id: 'a' }), k({ id: 'b', kode: '1.3.2.99.99.99.999' })])
    expect(r).toEqual({ kode: true, nilai: false, tahun: false, nama: false })
  })

  it('beda NILAI saja — peringatan, bukan pemblokir', () => {
    const r = bedaKandidat([k({ id: 'a' }), k({ id: 'b', nilai_perolehan: 9_999_999 })])
    expect(r).toEqual({ kode: false, nilai: true, tahun: false, nama: false })
  })

  it('beda TAHUN saja — bulan/tanggal berbeda TIDAK dihitung beda', () => {
    const r = bedaKandidat([k({ id: 'a', tgl_perolehan: '2024-05-13' }), k({ id: 'b', tgl_perolehan: '2024-11-30' })])
    expect(r.tahun).toBe(false)
    const r2 = bedaKandidat([k({ id: 'a', tgl_perolehan: '2024-05-13' }), k({ id: 'b', tgl_perolehan: '2025-05-13' })])
    expect(r2).toEqual({ kode: false, nilai: false, tahun: true, nama: false })
  })

  it('beda NAMA saja', () => {
    const r = bedaKandidat([k({ id: 'a' }), k({ id: 'b', nama_barang: 'Laptop Asus' })])
    expect(r).toEqual({ kode: false, nilai: false, tahun: false, nama: true })
  })

  it('nama null vs string kosong dianggap SAMA — bukan beda palsu', () => {
    const r = bedaKandidat([k({ id: 'a', nama_barang: null }), k({ id: 'b', nama_barang: '' })])
    expect(r.nama).toBe(false)
  })

  it('tanggal null vs null dianggap sama', () => {
    const r = bedaKandidat([k({ id: 'a', tgl_perolehan: null }), k({ id: 'b', tgl_perolehan: null })])
    expect(r.tahun).toBe(false)
  })

  it('tanggal null vs bertanggal → beda tahun', () => {
    const r = bedaKandidat([k({ id: 'a', tgl_perolehan: null }), k({ id: 'b' })])
    expect(r.tahun).toBe(true)
  })
})

describe('bedaKandidat — dibandingkan ke kandidat PERTAMA, seluruh daftar disisir', () => {
  it('penyimpangan di TENGAH daftar tetap tertangkap', () => {
    const r = bedaKandidat([k({ id: 'a' }), k({ id: 'b', kode: 'X' }), k({ id: 'c' })])
    expect(r.kode).toBe(true)
  })

  it('penyimpangan di UJUNG daftar tetap tertangkap', () => {
    const r = bedaKandidat([k({ id: 'a' }), k({ id: 'b' }), k({ id: 'c', nilai_perolehan: 1 })])
    expect(r.nilai).toBe(true)
  })

  it('beberapa ruas berbeda sekaligus dilaporkan sekaligus', () => {
    const r = bedaKandidat([k({ id: 'a' }), k({ id: 'b', kode: 'X', nama_barang: 'Lain', nilai_perolehan: 1, tgl_perolehan: '2020-01-01' })])
    expect(r).toEqual({ kode: true, nilai: true, tahun: true, nama: true })
  })
})
