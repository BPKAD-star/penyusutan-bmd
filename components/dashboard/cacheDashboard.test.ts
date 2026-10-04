import { describe, expect, it } from 'vitest'
import {
  bacaCache, tulisCache, hapusSemuaCache, kunciStorage, sahScan, sahHapus,
  UMUR_CACHE_MS, VERSI_CACHE,
} from './cacheDashboard'

// sessionStorage tiruan — Storage sungguhan tak ada di lingkungan node.
function penyimpan() {
  const m = new Map<string, string>()
  return {
    m,
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => { m.set(k, v) },
    removeItem: (k: string) => { m.delete(k) },
    key: (i: number) => [...m.keys()][i] ?? null,
    get length() { return m.size },
  }
}

const scan = { gol: { '1.3.2': { count: 10, nilai: 5000 } }, caraNilai: { pengadaan: 5000 }, caraCount: { pengadaan: 10 }, err: '' }
const nol = { n: 0, nilai: 0 }
const hapus = { data: { hibah: { n: 1, nilai: 9 }, jual: nol, tukar: nol, modal: nol, sebabLain: nol }, err: '' }
const T0 = 1_800_000_000_000

describe('cache Dashboard', () => {
  it('tulis lalu baca kembali dalam umur cache', () => {
    const s = penyimpan()
    tulisCache(s, 'u1', 'scan', scan, T0)
    expect(bacaCache(s, 'u1', 'scan', sahScan, T0 + 60_000)).toEqual({ data: scan, t: T0 })
  })

  it('LEWAT umur cache (10 menit) → dianggap tak ada', () => {
    expect(UMUR_CACHE_MS).toBe(10 * 60 * 1000)
    const s = penyimpan()
    tulisCache(s, 'u1', 'scan', scan, T0)
    expect(bacaCache(s, 'u1', 'scan', sahScan, T0 + UMUR_CACHE_MS + 1)).toBeNull()
  })

  it('PENGGUNA LAIN di tab yang sama tak bisa membaca angka pengguna sebelumnya', () => {
    const s = penyimpan()
    tulisCache(s, 'skpd-a', 'scan', scan, T0)
    expect(bacaCache(s, 'skpd-b', 'scan', sahScan, T0)).toBeNull()
  })

  it('kunci memuat versi — bentuk lama tak terbaca begitu versinya dinaikkan', () => {
    expect(kunciStorage('u1', 'scan')).toContain(`:${VERSI_CACHE}:u1:scan`)
  })

  it('isi rusak / bentuk aneh / hasil GAGAL → dianggap tak ada, tak melempar', () => {
    const s = penyimpan()
    s.setItem(kunciStorage('u1', 'scan'), '{bukan json')
    expect(bacaCache(s, 'u1', 'scan', sahScan, T0)).toBeNull()
    tulisCache(s, 'u1', 'scan', { ...scan, err: 'timeout' }, T0)
    expect(bacaCache(s, 'u1', 'scan', sahScan, T0)).toBeNull()
    tulisCache(s, 'u1', 'scan', { gol: { '1.3.2': { count: '10', nilai: 1 } }, caraNilai: {}, caraCount: {}, err: '' }, T0)
    expect(bacaCache(s, 'u1', 'scan', sahScan, T0)).toBeNull()
  })

  it('stempel waktu dari MASA DEPAN (jam perangkat diputar) → dianggap tak ada', () => {
    const s = penyimpan()
    tulisCache(s, 'u1', 'scan', scan, T0 + 3_600_000)
    expect(bacaCache(s, 'u1', 'scan', sahScan, T0)).toBeNull()
  })

  it('pemeriksa penghapusan: lengkap lolos, kategori hilang ditolak', () => {
    expect(sahHapus(hapus)).toBe(true)
    expect(sahHapus({ data: { hibah: nol }, err: '' })).toBe(false)
  })

  it('logout menghapus SELURUH cache Dashboard, data lain di storage tak tersentuh', () => {
    const s = penyimpan()
    tulisCache(s, 'u1', 'scan', scan, T0)
    tulisCache(s, 'u2', 'hapus', hapus, T0)
    s.setItem('bmd_tahun_kerja_pilihan', '2026')
    hapusSemuaCache(s)
    expect([...s.m.keys()]).toEqual(['bmd_tahun_kerja_pilihan'])
  })

  it('penyimpan yang melempar (diblokir / penuh) tidak menjatuhkan apa pun', () => {
    const rusak = { getItem: () => { throw new Error('x') }, setItem: () => { throw new Error('x') },
      removeItem: () => { throw new Error('x') }, key: () => { throw new Error('x') }, length: 1 }
    expect(() => tulisCache(rusak, 'u1', 'scan', scan)).not.toThrow()
    expect(bacaCache(rusak, 'u1', 'scan', sahScan)).toBeNull()
    expect(() => hapusSemuaCache(rusak)).not.toThrow()
  })

  it('gagal menyimpan (kuota penuh) → salinan LAMA dibuang, bukan tertinggal', () => {
    const s = penyimpan()
    tulisCache(s, 'u1', 'scan', scan, T0)
    const setAsli = s.setItem
    s.setItem = () => { throw new Error('QuotaExceededError') }
    tulisCache(s, 'u1', 'scan', { ...scan, caraNilai: { pengadaan: 1 } }, T0 + 1000)
    s.setItem = setAsli
    expect(bacaCache(s, 'u1', 'scan', sahScan, T0 + 2000)).toBeNull()
  })
})
