// Titik Street View untuk tanah yang JAUH dari jalan (GIS Tanah, 2026-10-04).
//
// Link Google Maps `map_action=pano&viewpoint=` TIDAK punya parameter radius —
// dokumentasinya hanya berjanji "panorama terdekat dari viewpoint"; batas jarak
// snap-nya tak dipublikasikan, dan untuk tanah di tengah sawah/GOR di belakang
// kampung Google sering menjawab "tidak ada Street View" walau jalannya 100 m
// dari situ. Obatnya: cari sendiri titik di JALAN terdekat (data OpenStreetMap,
// via Overpass — gratis, tanpa kunci), buka Street View DI SANA, dan hadapkan
// kameranya ke arah tanah (`heading`).
//
// Ini BANTUAN TAMPILAN, bukan data: gagal/tak ketemu → pemanggil jatuh ke link
// lama (titik tanah apa adanya). Tak ada yang ditulis ke database.

export type Titik = { lat: number; lng: number }
export type TitikJalan = Titik & {
  /** Jarak dari tanah ke titik jalan (meter). */
  jarak: number
  /** Arah (derajat 0–360, utara = 0) dari titik jalan MENUJU tanah. */
  heading: number
}
type Way = { geometry?: { lat: number; lon: number }[] }

const R_BUMI = 6371008.8
const rad = (d: number) => (d * Math.PI) / 180

/** Jarak (m) & arah (derajat) dari a ke b — hampiran datar, cukup utk < 1 km. */
export function jarakDanArah(a: Titik, b: Titik): { jarak: number; arah: number } {
  const dx = rad(b.lng - a.lng) * Math.cos(rad((a.lat + b.lat) / 2)) * R_BUMI
  const dy = rad(b.lat - a.lat) * R_BUMI
  const arah = (Math.atan2(dx, dy) * 180) / Math.PI
  return { jarak: Math.hypot(dx, dy), arah: (arah + 360) % 360 }
}

/**
 * Titik terdekat pada kumpulan garis jalan. Setiap ruas diproyeksikan ke bidang
 * datar berpusat di tanah (meter), titik tegak lurus dijepit ke ruasnya.
 */
export function titikJalanTerdekat(tanah: Titik, ways: Way[]): TitikJalan | null {
  const kx = Math.cos(rad(tanah.lat)) * R_BUMI * (Math.PI / 180)
  const ky = R_BUMI * (Math.PI / 180)
  let terbaik: { x: number; y: number; d: number } | null = null
  for (const w of ways) {
    const g = (w.geometry || []).map(p => ({ x: (p.lon - tanah.lng) * kx, y: (p.lat - tanah.lat) * ky }))
    for (let i = 0; i + 1 < g.length; i++) {
      const a = g[i], b = g[i + 1]
      const vx = b.x - a.x, vy = b.y - a.y
      const pj = vx * vx + vy * vy
      const t = pj === 0 ? 0 : Math.max(0, Math.min(1, -(a.x * vx + a.y * vy) / pj))
      const x = a.x + t * vx, y = a.y + t * vy
      const d = Math.hypot(x, y)
      if (!terbaik || d < terbaik.d) terbaik = { x, y, d }
    }
  }
  if (!terbaik) return null
  const lat = tanah.lat + terbaik.y / ky
  const lng = tanah.lng + terbaik.x / kx
  return { lat, lng, jarak: terbaik.d, heading: jarakDanArah({ lat, lng }, tanah).arah }
}

/** Link resmi Google Maps ke Street View (tanpa kunci API). */
export function urlStreetView(titik: Titik, heading?: number): string {
  const h = heading == null ? '' : `&heading=${Math.round(heading)}`
  return `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${titik.lat},${titik.lng}${h}`
}

/** Jalan yang lazim punya liputan Street View — pejalan kaki/jalur sepeda/rencana dibuang. */
export const BUKAN_JALAN = 'footway|path|steps|cycleway|pedestrian|bridleway|corridor|proposed|construction|elevator|platform|raceway|bus_guideway'

export const RADIUS_CARI_JALAN = 500
const TUNGGU_MS = 7000
/** Layanan Overpass publik; dicoba berurutan — satu mati/lambat tak mematikan fitur. */
export const LAYANAN_OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter']

export function queryJalan(t: Titik, radius = RADIUS_CARI_JALAN): string {
  return `[out:json][timeout:8];way(around:${radius},${t.lat},${t.lng})[highway][highway!~"^(${BUKAN_JALAN})$"];out geom;`
}

/**
 * Cari titik jalan terdekat dalam `radius` meter. MENGEMBALIKAN null (bukan
 * melempar) kalau layanan gagal/lambat/tak ada jalan — pemanggil punya
 * cadangan, dan bantuan tampilan tak boleh membuat tombol macet.
 */
export async function cariTitikStreetView(
  tanah: Titik,
  opsi: { fetcher?: typeof fetch; radius?: number; tunggu?: number; layanan?: string[] } = {},
): Promise<TitikJalan | null> {
  const f = opsi.fetcher ?? fetch
  const data = encodeURIComponent(queryJalan(tanah, opsi.radius))
  for (const url of opsi.layanan ?? LAYANAN_OVERPASS) {
    const ctl = new AbortController()
    const timer = setTimeout(() => ctl.abort(), opsi.tunggu ?? TUNGGU_MS)
    try {
      const res = await f(`${url}?data=${data}`, { signal: ctl.signal })
      if (!res.ok) continue
      const json = (await res.json()) as { elements?: Way[] }
      // Layanan menjawab tapi tak ada jalan = jawaban sah; jangan lanjut ke layanan lain.
      return titikJalanTerdekat(tanah, json.elements || [])
    } catch {
      continue
    } finally {
      clearTimeout(timer)
    }
  }
  return null
}
