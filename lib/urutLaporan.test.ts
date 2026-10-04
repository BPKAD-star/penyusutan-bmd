import { describe, it, expect } from 'vitest'
import { urutLaporan } from './urutSkpd'

type R = { id: number; tanggal: string; unit: string; induk: string }
const r = (id: number, tanggal: string, unit = 'U', induk = ''): R => ({ id, tanggal, unit, induk })
const o = { tgl: (x: R) => x.tanggal, seri: (x: R) => x.id }
const nama = { unit: (x: R) => x.unit, induk: (x: R) => x.induk }

describe('urutLaporan', () => {
  it('SKPD terpilih → terbaru di atas, yang tertua di bawah, abaikan nama SKPD', () => {
    const rows = [r(1, '2026-01-10', 'B'), r(2, '2026-06-01', 'A'), r(3, '2026-03-05', 'C')]
    expect(urutLaporan(rows, { ...o, terfilter: true, nama }).map(x => x.id)).toEqual([2, 3, 1])
  })
  it('tanggal kembar → id menurun (urutan total, tak berubah antar render)', () => {
    const rows = [r(5, '2026-05-01'), r(9, '2026-05-01'), r(7, '2026-05-01')]
    expect(urutLaporan(rows, { ...o, terfilter: true }).map(x => x.id)).toEqual([9, 7, 5])
  })
  it('se-kabupaten dengan nama → dikelompokkan per induk/unit, lalu tanggal terbaru', () => {
    const rows = [r(1, '2026-06-01', 'Z'), r(2, '2026-01-01', 'A'), r(3, '2026-03-01', 'A')]
    expect(urutLaporan(rows, { ...o, terfilter: false, nama }).map(x => x.id)).toEqual([3, 2, 1])
  })
  it('se-kabupaten tanpa nama → murni tanggal terbaru', () => {
    const rows = [r(1, '2026-06-01', 'Z'), r(2, '2026-01-01', 'A'), r(3, '2026-03-01', 'A')]
    expect(urutLaporan(rows, { ...o, terfilter: false }).map(x => x.id)).toEqual([1, 3, 2])
  })
  it('seri berupa teks dibandingkan alami, tidak melempar', () => {
    const rows = [{ k: 'a2', t: '2026-01-01' }, { k: 'a10', t: '2026-01-01' }]
    expect(urutLaporan(rows, { terfilter: true, tgl: x => x.t, seri: x => x.k }).map(x => x.k)).toEqual(['a10', 'a2'])
  })
  it('mengembalikan array baru, input tak diubah', () => {
    const rows = [r(1, '2026-01-01'), r(2, '2026-02-01')]
    urutLaporan(rows, { ...o, terfilter: true })
    expect(rows.map(x => x.id)).toEqual([1, 2])
  })
})
