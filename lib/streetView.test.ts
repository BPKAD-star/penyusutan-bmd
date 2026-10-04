import { describe, it, expect, vi } from 'vitest'
import { cariTitikStreetView, jarakDanArah, queryJalan, titikJalanTerdekat, urlStreetView } from './streetView'

const T = { lat: -7.8, lng: 112.0 }
// 1° lintang ≈ 111.195 km → 0,001° ≈ 111 m
const jalanUtara = { geometry: [{ lat: -7.799, lon: 111.999 }, { lat: -7.799, lon: 112.001 }] } // ±111 m di utara T

describe('jarakDanArah', () => {
  it('utara ≈ 0°, timur ≈ 90°, selatan ≈ 180°, barat ≈ 270°', () => {
    expect(jarakDanArah(T, { lat: -7.799, lng: 112.0 }).arah).toBeCloseTo(0, 0)
    expect(jarakDanArah(T, { lat: -7.8, lng: 112.001 }).arah).toBeCloseTo(90, 0)
    expect(jarakDanArah(T, { lat: -7.801, lng: 112.0 }).arah).toBeCloseTo(180, 0)
    expect(jarakDanArah(T, { lat: -7.8, lng: 111.999 }).arah).toBeCloseTo(270, 0)
  })
  it('jaraknya masuk akal (0,001° ≈ 111 m)', () => {
    expect(jarakDanArah(T, { lat: -7.799, lng: 112.0 }).jarak).toBeGreaterThan(110)
    expect(jarakDanArah(T, { lat: -7.799, lng: 112.0 }).jarak).toBeLessThan(112)
  })
})

describe('titikJalanTerdekat', () => {
  it('memilih titik tegak lurus pada ruas, kamera menghadap ke tanah', () => {
    const r = titikJalanTerdekat(T, [jalanUtara])!
    expect(r.jarak).toBeGreaterThan(110); expect(r.jarak).toBeLessThan(112)
    expect(r.lng).toBeCloseTo(112.0, 5)               // tegak lurus tepat di utara
    expect(r.heading).toBeCloseTo(180, 0)             // dari jalan (utara) menghadap selatan
  })
  it('titik tegak lurus dijepit ke ujung ruas', () => {
    const pendek = { geometry: [{ lat: -7.799, lon: 112.001 }, { lat: -7.799, lon: 112.002 }] }
    const r = titikJalanTerdekat(T, [pendek])!
    expect(r.lng).toBeCloseTo(112.001, 5)
  })
  it('memilih jalan yang LEBIH DEKAT di antara beberapa', () => {
    const jauh = { geometry: [{ lat: -7.795, lon: 111.999 }, { lat: -7.795, lon: 112.001 }] }
    const dekat = { geometry: [{ lat: -7.8005, lon: 111.999 }, { lat: -7.8005, lon: 112.001 }] }
    expect(titikJalanTerdekat(T, [jauh, dekat])!.jarak).toBeLessThan(60)
  })
  it('tanpa jalan / geometri kosong → null', () => {
    expect(titikJalanTerdekat(T, [])).toBeNull()
    expect(titikJalanTerdekat(T, [{ geometry: [] }, {}])).toBeNull()
  })
})

describe('urlStreetView & queryJalan', () => {
  it('heading dibulatkan; tanpa heading tak menambah parameter', () => {
    expect(urlStreetView(T)).toBe('https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=-7.8,112')
    expect(urlStreetView(T, 179.6)).toContain('&heading=180')
  })
  it('query membuang jalur pejalan kaki & memakai radius', () => {
    const q = queryJalan(T, 400)
    expect(q).toContain('around:400')
    expect(q).toContain('footway')
  })
})

describe('cariTitikStreetView', () => {
  const ok = (elements: unknown) => vi.fn(async () => ({ ok: true, json: async () => ({ elements }) })) as unknown as typeof fetch
  it('mengembalikan titik jalan dari jawaban layanan', async () => {
    const r = await cariTitikStreetView(T, { fetcher: ok([jalanUtara]), tanpaSimpanan: true })
    expect(r?.jarak).toBeGreaterThan(100)
  })
  it('layanan gagal / respons tidak ok / jaringan putus → null, TIDAK melempar', async () => {
    expect(await cariTitikStreetView(T, { fetcher: vi.fn(async () => ({ ok: false })) as unknown as typeof fetch, tanpaSimpanan: true })).toBeNull()
    expect(await cariTitikStreetView(T, { fetcher: vi.fn(async () => { throw new Error('offline') }) as unknown as typeof fetch, tanpaSimpanan: true })).toBeNull()
  })
  it('satu layanan gagal, yang lain menjawab → hasil tetap didapat (ditanya serentak)', async () => {
    const f = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ elements: [jalanUtara] }) })
    const r = await cariTitikStreetView(T, { fetcher: f as unknown as typeof fetch, layanan: ['a', 'b'], tanpaSimpanan: true })
    expect(r?.jarak).toBeGreaterThan(100)
    expect(f).toHaveBeenCalledTimes(2)
  })
  it('jawaban sah "tak ada jalan" dihormati sebagai null', async () => {
    const f = vi.fn(async () => ({ ok: true, json: async () => ({ elements: [] }) }))
    expect(await cariTitikStreetView(T, { fetcher: f as unknown as typeof fetch, layanan: ['a', 'b'], tanpaSimpanan: true })).toBeNull()
  })
  it('hasil disimpan per titik: pemanggilan kedua tidak menembak layanan lagi', async () => {
    const f = ok([jalanUtara])
    const titik = { lat: -7.8123, lng: 112.0456 }
    const a1 = await cariTitikStreetView(titik, { fetcher: f, layanan: ['a'] })
    const a2 = await cariTitikStreetView(titik, { fetcher: f, layanan: ['a'] })
    expect(a2).toEqual(a1)
    expect(f).toHaveBeenCalledTimes(1)
  })
  it('semua layanan gagal TIDAK disimpan (klik berikutnya boleh mencoba lagi)', async () => {
    const titik = { lat: -7.8999, lng: 112.0999 }
    const gagal = vi.fn(async () => { throw new Error('offline') })
    expect(await cariTitikStreetView(titik, { fetcher: gagal as unknown as typeof fetch, layanan: ['a'] })).toBeNull()
    const f = ok([jalanUtara])
    expect(await cariTitikStreetView(titik, { fetcher: f, layanan: ['a'] })).not.toBeNull()
  })
  it('tak ada jalan dalam radius → null', async () => {
    expect(await cariTitikStreetView(T, { fetcher: ok([]), tanpaSimpanan: true })).toBeNull()
  })
})
