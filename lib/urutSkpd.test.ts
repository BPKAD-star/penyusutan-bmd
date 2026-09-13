import { describe, it, expect } from 'vitest'
import { urutPerSkpd, type NamaSkpdBaris } from './urutSkpd'

type Baris = { id: number; tanggal: string; unit: string; induk: string }
const nama: NamaSkpdBaris<Baris> = { unit: r => r.unit, induk: r => r.induk }
const urut = (rows: Baris[]) => urutPerSkpd(rows, nama).map(r => r.id)

describe('urutPerSkpd', () => {
  it('mengelompokkan per INDUK lebih dulu, bukan per unit', () => {
    // Dua Bagian di bawah Sekretariat Daerah harus berdampingan walau nama
    // unitnya berjauhan secara abjad — itu seluruh gunanya kolom SKPD ini.
    const rows: Baris[] = [
      { id: 1, tanggal: '2026-07-01', unit: 'Bagian Perekonomian', induk: 'Sekretariat Daerah' },
      { id: 2, tanggal: '2026-07-01', unit: 'Dinas Perhubungan', induk: '' },
      { id: 3, tanggal: '2026-07-01', unit: 'Bagian Kesejahteraan Rakyat', induk: 'Sekretariat Daerah' },
    ]
    expect(urut(rows)).toEqual([2, 3, 1])
  })

  it('baris tanpa induk diurut memakai nama UNITNYA, bukan menumpuk di pucuk', () => {
    const rows: Baris[] = [
      { id: 1, tanggal: '2026-07-01', unit: 'Zeta', induk: '' },
      { id: 2, tanggal: '2026-07-01', unit: 'Bagian X', induk: 'Sekretariat Daerah' },
      { id: 3, tanggal: '2026-07-01', unit: 'Alfa', induk: '' },
    ]
    expect(urut(rows)).toEqual([3, 2, 1])
  })

  it('di dalam satu unit: tanggal TERBARU dulu', () => {
    const rows: Baris[] = [
      { id: 1, tanggal: '2026-07-01', unit: 'A', induk: '' },
      { id: 2, tanggal: '2026-08-01', unit: 'A', induk: '' },
    ]
    expect(urut(rows)).toEqual([2, 1])
  })

  it('PEMECAH SERI: tanggal & SKPD sama → id menurun, urutannya TOTAL', () => {
    // ⚠️ Ini yang paling penting. Tanpa kunci `id`, urutan baris kembar tak
    // dijamin & isinya bisa bergeser tiap render tanpa satu pun error —
    // operator membacanya sbg "datanya berubah".
    const rows: Baris[] = [
      { id: 5, tanggal: '2026-07-01', unit: 'A', induk: '' },
      { id: 9, tanggal: '2026-07-01', unit: 'A', induk: '' },
      { id: 7, tanggal: '2026-07-01', unit: 'A', induk: '' },
    ]
    expect(urut(rows)).toEqual([9, 7, 5])
  })

  it('URUTAN TOTAL: input diacak apa pun, hasilnya SAMA PERSIS', () => {
    // ⚠️ Penjaga sesungguhnya atas pemecah seri, dan sengaja TIDAK menghitung
    // ulang komparatornya sendiri — uji yang menyalin logika yang diujinya
    // tetap hijau walau fungsinya rusak. Yang dibuktikan di sini: `sort` yang
    // tak stabil pun tak bisa menggeser hasilnya, karena tak ada dua baris
    // yang setara.
    const rows: Baris[] = [
      { id: 5, tanggal: '2026-07-01', unit: 'A', induk: '' },
      { id: 9, tanggal: '2026-07-01', unit: 'A', induk: '' },
      { id: 7, tanggal: '2026-07-01', unit: 'A', induk: '' },
      { id: 3, tanggal: '2026-07-01', unit: 'B', induk: 'Induk' },
      { id: 4, tanggal: '2026-08-01', unit: 'B', induk: 'Induk' },
    ]
    const acuan = urut(rows)
    // seluruh 120 permutasi — kecil, dan menutup seluruh ruang urutan masuk.
    const permutasi = (xs: Baris[]): Baris[][] =>
      xs.length <= 1 ? [xs]
        : xs.flatMap((x, i) => permutasi([...xs.slice(0, i), ...xs.slice(i + 1)]).map(p => [x, ...p]))
    const semua = permutasi(rows)
    expect(semua).toHaveLength(120)
    for (const p of semua) expect(urut(p)).toEqual(acuan)
  })

  it('TIDAK mengubah array asalnya', () => {
    const rows: Baris[] = [
      { id: 1, tanggal: '2026-07-01', unit: 'Z', induk: '' },
      { id: 2, tanggal: '2026-07-01', unit: 'A', induk: '' },
    ]
    urutPerSkpd(rows, nama)
    expect(rows.map(r => r.id)).toEqual([1, 2])
  })
})
