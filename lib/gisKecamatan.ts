// Batas 26 kecamatan Kab. Kediri untuk GIS Tanah (permintaan user 2026-10-06):
// klik kecamatan → kecamatan itu terang, sisanya digelapkan, & titik tanah
// terfilter ke kecamatan itu. Berkas poligonnya public/gis/kecamatan-kediri.geojson
// (Batas Administrasi Kemendagri/BIG 2023, KODE_KK 35.06, disederhanakan 0,0002°
// ≈ 20 m & dibulatkan 5 desimal; 133 KB dari ±2,2 MB).
//
// ⚠️ TITIK TANAH DIKELOMPOKKAN LEWAT POLIGON, BUKAN dari kolom wilayah register.
// `aset.wilayah_kode` banyak yang kosong & sering tak sejalan dgn titiknya; yang
// ditanyakan user "tanah ini di kecamatan mana MENURUT PETA" — satu-satunya
// jawaban yang pasti cocok dgn yang dilihat di layar. Titik yang jatuh di luar
// semua poligon (koordinat ngawur / di laut) sengaja diberi kode `null`, bukan
// ditebak ke kecamatan terdekat — itu justru gunanya pilihan "di luar batas".
export type Cincin = number[][] // [lng, lat][]
export type GeometriKecamatan =
  | { type: 'Polygon'; coordinates: Cincin[] }
  | { type: 'MultiPolygon'; coordinates: Cincin[][] }
export type FiturKecamatan = {
  type: 'Feature'
  properties: { kode: string; nama: string }
  geometry: GeometriKecamatan
}
export type KoleksiKecamatan = { type: 'FeatureCollection'; features: FiturKecamatan[] }

/** Kode yang dipakai pemilih untuk "titik ada, tapi di luar semua kecamatan". */
export const KODE_LUAR_BATAS = '__luar'

/** Ray casting satu cincin. [lng, lat] — x = lng, y = lat. */
function dalamCincin(lng: number, lat: number, ring: Cincin): boolean {
  let masuk = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) masuk = !masuk
  }
  return masuk
}

/** Satu poligon = cincin luar + lubang-lubangnya (cincin berikutnya). */
function dalamPoligon(lng: number, lat: number, poligon: Cincin[]): boolean {
  if (poligon.length === 0 || !dalamCincin(lng, lat, poligon[0])) return false
  for (let k = 1; k < poligon.length; k++) if (dalamCincin(lng, lat, poligon[k])) return false
  return true
}

export function titikDalamKecamatan(lat: number, lng: number, f: FiturKecamatan): boolean {
  const g = f.geometry
  return g.type === 'Polygon'
    ? dalamPoligon(lng, lat, g.coordinates)
    : g.coordinates.some(p => dalamPoligon(lng, lat, p))
}

type Kotak = { minLat: number; maxLat: number; minLng: number; maxLng: number }

function kotakDari(f: FiturKecamatan): Kotak {
  const k: Kotak = { minLat: 90, maxLat: -90, minLng: 180, maxLng: -180 }
  const poligon = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates
  for (const p of poligon) for (const [lng, lat] of p[0]) {
    if (lat < k.minLat) k.minLat = lat
    if (lat > k.maxLat) k.maxLat = lat
    if (lng < k.minLng) k.minLng = lng
    if (lng > k.maxLng) k.maxLng = lng
  }
  return k
}

/**
 * Penentu kecamatan, dibangun SEKALI per koleksi (kotak pembatas dihitung di
 * muka) — dipanggil ribuan kali (≈2.800 register + bidang) tiap data berubah,
 * jadi sebagian besar poligon cukup ditolak lewat kotaknya.
 */
export function buatPenentuKecamatan(fc: KoleksiKecamatan): (lat: number, lng: number) => string | null {
  const daftar = fc.features.map(f => ({ f, k: kotakDari(f) }))
  return (lat, lng) => {
    for (const { f, k } of daftar) {
      if (lat < k.minLat || lat > k.maxLat || lng < k.minLng || lng > k.maxLng) continue
      if (titikDalamKecamatan(lat, lng, f)) return f.properties.kode
    }
    return null
  }
}

/** Cincin luar tiap poligon fitur itu, dalam urutan Leaflet [lat, lng]. */
export function cincinLuarLatLng(f: FiturKecamatan): [number, number][][] {
  const poligon = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates
  return poligon.map(p => p[0].map(([lng, lat]) => [lat, lng] as [number, number]))
}

const DUNIA: [number, number][] = [[-85, -180], [-85, 180], [85, 180], [85, -180]]

/**
 * Topeng penggelap: dunia dikurangi kecamatan terpilih — satu poligon ber-lubang
 * (Leaflet mengisi evenodd, jadi cincin kedua dst. menjadi lubang). Pulau/enklaf
 * di dalam kecamatan (cincin dalam) tak dilubangi: tertutup topeng, dampaknya
 * satu petak kecil yang tak punya arti administratif.
 */
export function topengKecamatan(f: FiturKecamatan): [number, number][][] {
  return [DUNIA, ...cincinLuarLatLng(f)]
}
