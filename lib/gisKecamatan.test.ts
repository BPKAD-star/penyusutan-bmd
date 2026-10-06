import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  buatPenentuKecamatan, titikDalamKecamatan, topengKecamatan, cincinLuarLatLng,
  type FiturKecamatan, type KoleksiKecamatan,
} from './gisKecamatan'

const DAFTAR_USER = [
  'Badas', 'Banyakan', 'Gampengrejo', 'Grogol', 'Gurah', 'Kandangan', 'Kandat', 'Kayen Kidul', 'Kepung',
  'Kras', 'Kunjang', 'Mojo', 'Ngadiluwih', 'Ngancar', 'Ngasem', 'Pagu', 'Papar', 'Pare', 'Plemahan',
  'Plosoklaten', 'Puncu', 'Purwoasri', 'Ringinrejo', 'Semen', 'Tarokan', 'Wates',
]

const nyata: KoleksiKecamatan = JSON.parse(
  readFileSync(join(__dirname, '..', 'public', 'gis', 'kecamatan-kediri.geojson'), 'utf-8'),
)

const kotak = (nama: string, x0: number, y0: number, x1: number, y1: number, lubang?: number[][]): FiturKecamatan => ({
  type: 'Feature', properties: { kode: nama, nama },
  geometry: { type: 'Polygon', coordinates: [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]], ...(lubang ? [lubang] : [])] },
})

describe('titikDalamKecamatan', () => {
  it('lubang di dalam poligon tidak dihitung masuk', () => {
    const f = kotak('A', 0, 0, 10, 10, [[4, 4], [6, 4], [6, 6], [4, 6], [4, 4]])
    expect(titikDalamKecamatan(2, 2, f)).toBe(true)   // lat 2, lng 2
    expect(titikDalamKecamatan(5, 5, f)).toBe(false)  // di lubang
    expect(titikDalamKecamatan(20, 20, f)).toBe(false)
  })
  it('MultiPolygon: masuk di salah satu bagian', () => {
    const f: FiturKecamatan = {
      type: 'Feature', properties: { kode: 'M', nama: 'M' },
      geometry: { type: 'MultiPolygon', coordinates: [
        [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]],
        [[[5, 5], [6, 5], [6, 6], [5, 6], [5, 5]]],
      ] },
    }
    expect(titikDalamKecamatan(0.5, 0.5, f)).toBe(true)
    expect(titikDalamKecamatan(5.5, 5.5, f)).toBe(true)
    expect(titikDalamKecamatan(3, 3, f)).toBe(false)
  })
  it('x = lng, y = lat (bukan tertukar)', () => {
    const f = kotak('A', 100, -10, 110, -5) // lng 100..110, lat -10..-5
    expect(titikDalamKecamatan(-7, 105, f)).toBe(true)
    expect(titikDalamKecamatan(105, -7, f)).toBe(false)
  })
})

describe('berkas poligon kecamatan Kab. Kediri', () => {
  it('memuat TEPAT 26 kecamatan, sama dgn daftar user, kode 35.06.01–26', () => {
    const nama = nyata.features.map(f => f.properties.nama).sort()
    expect(nama).toEqual([...DAFTAR_USER].sort())
    const kode = nyata.features.map(f => f.properties.kode).sort()
    expect(kode).toEqual(Array.from({ length: 26 }, (_, i) => `35.06.${String(i + 1).padStart(2, '0')}`))
  })
  const penentu = buatPenentuKecamatan(nyata)
  const namaDari = (kode: string | null) => nyata.features.find(f => f.properties.kode === kode)?.properties.nama ?? null
  it('titik yang pasti di dalam tiap kecamatan dijawab kecamatan itu (poligon tak saling tumpang)', () => {
    for (const f of nyata.features) {
      const ring = cincinLuarLatLng(f).flat()
      const lats = ring.map(p => p[0]), lngs = ring.map(p => p[1])
      const [a, b, c, d] = [Math.min(...lats), Math.max(...lats), Math.min(...lngs), Math.max(...lngs)]
      let titik: [number, number] | null = null
      // pindai kotak pembatas dgn kisi 25×25 sampai ketemu satu titik di dalam (bentuk cekung)
      for (let i = 1; i < 25 && !titik; i++) for (let j = 1; j < 25 && !titik; j++) {
        const lat = a + ((b - a) * i) / 25, lng = c + ((d - c) * j) / 25
        if (titikDalamKecamatan(lat, lng, f)) titik = [lat, lng]
      }
      expect(titik, f.properties.nama).not.toBeNull()
      expect(namaDari(penentu(titik![0], titik![1]))).toBe(f.properties.nama)
    }
  })
  it('titik dikenal: pusat Kota Pare ∈ Pare; Kota Kediri & laut ∉ kecamatan mana pun', () => {
    expect(namaDari(penentu(-7.7516, 112.1856))).toBe('Pare')
    expect(namaDari(penentu(-7.848, 112.0178))).toBeNull() // Kota Kediri bukan Kab. Kediri
    expect(penentu(0.2, 6.6)).toBeNull() // lepas pantai Afrika (insiden pin 2026-09-27)
  })
})

describe('topengKecamatan', () => {
  it('cincin pertama = dunia, sisanya = cincin luar kecamatan [lat, lng]', () => {
    const f = kotak('A', 111, -8, 112, -7)
    const t = topengKecamatan(f)
    expect(t).toHaveLength(2)
    expect(t[0]).toHaveLength(4)
    expect(t[1][0]).toEqual([-8, 111])
  })
})
