'use client'
// Peta pemilih titik koordinat (Leaflet + OpenStreetMap, gratis, tanpa API key).
// Klik di peta → set marker → isi latitude/longitude. Dua kotak angka manual di
// bawah tetap tersedia (isi manual, mis. copas dari Google Maps) — dua arah
// sinkron dgn marker. WAJIB di-import via next/dynamic({ ssr:false }) di
// pemanggil karena Leaflet butuh `window` (tak bisa di-render di server).
//
// + Toggle Jalan/Satelit (LayersControl bawaan Leaflet).
// + Search bar: terima 2 bentuk input —
//   (a) koordinat langsung (mis. tempel dari Google Maps "-7.821, 111.94")
//       di-parse LANGSUNG, tanpa panggil API;
//   (b) nama lokasi bebas (nama jalan/kelurahan/nama barang) → geocoding lewat
//       Nominatim (OSM, gratis tanpa API key) — hasilnya beberapa opsi buat
//       dipilih (nama tempat bisa ambigu, jangan langsung tebak yang pertama).
import { useEffect, useState } from 'react'
import { MapContainer, TileLayer, Marker, LayersControl, useMapEvents, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

// Fix ikon default Leaflet yang path relatifnya rusak kalau dibundel Webpack —
// pakai CDN sesuai versi leaflet di package.json.
delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

const DEFAULT_CENTER: [number, number] = [-7.82, 111.94] // sekitar Kab. Kediri

type NominatimResult = { display_name: string; lat: string; lon: string }

function ClickHandler({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({ click(e) { onPick(e.latlng.lat, e.latlng.lng) } })
  return null
}

// Terbang ke titik tiap kali `flyTo` berubah (dipicu pas pilih hasil pencarian).
function FlyTo({ flyTo }: { flyTo: [number, number] | null }) {
  const map = useMap()
  useEffect(() => {
    if (flyTo) map.flyTo(flyTo, 16, { duration: 0.6 })
  }, [flyTo, map])
  return null
}

// Coba parse "lat, lng" / "lat lng" langsung dari teks (mis. tempel dari
// Google Maps) — null kalau bukan format koordinat.
function parseCoordText(s: string): [number, number] | null {
  const m = s.trim().match(/^(-?\d{1,3}(?:\.\d+)?)\s*[,\s]\s*(-?\d{1,3}(?:\.\d+)?)$/)
  if (!m) return null
  const lat = parseFloat(m[1]), lng = parseFloat(m[2])
  if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) return null
  return [lat, lng]
}

export default function MapPicker({ latitude, longitude, onChange }: {
  latitude: string; longitude: string
  onChange: (lat: string, lng: string) => void
}) {
  const lat = parseFloat(latitude), lng = parseFloat(longitude)
  const hasPoint = !isNaN(lat) && !isNaN(lng)
  const [mapKey] = useState(0) // stabilkan instance MapContainer (hindari re-init tiap render)
  const [flyTo, setFlyTo] = useState<[number, number] | null>(null)
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [results, setResults] = useState<NominatimResult[] | null>(null)
  const [searchErr, setSearchErr] = useState('')

  // fly=true cuma buat hasil pencarian (lokasi bisa jauh dari view sekarang) —
  // klik langsung di peta gak perlu terbang, area itu udah kelihatan.
  function pick(la: number, lo: number, fly = false) {
    onChange(la.toFixed(6), lo.toFixed(6))
    if (fly) setFlyTo([la, lo])
  }

  async function handleSearch() {
    setSearchErr(''); setResults(null)
    const asCoord = parseCoordText(query)
    if (asCoord) { pick(asCoord[0], asCoord[1], true); setQuery(''); return }
    if (!query.trim()) return
    setSearching(true)
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&limit=5&countrycodes=id&q=${encodeURIComponent(query)}`
      const res = await fetch(url, { headers: { Accept: 'application/json' } })
      const data = (await res.json()) as NominatimResult[]
      if (!data || data.length === 0) setSearchErr('Lokasi tidak ditemukan.')
      else setResults(data)
    } catch {
      setSearchErr('Gagal mencari lokasi (cek koneksi).')
    }
    setSearching(false)
  }

  return (
    <div className="space-y-2">
      <div className="rounded-lg overflow-hidden border border-gray-200" style={{ height: 260 }}>
        <MapContainer key={mapKey} center={hasPoint ? [lat, lng] : DEFAULT_CENTER} zoom={hasPoint ? 15 : 11}
          style={{ height: '100%', width: '100%' }} scrollWheelZoom>
          <LayersControl position="topright">
            <LayersControl.BaseLayer checked name="Jalan">
              <TileLayer attribution='&copy; OpenStreetMap contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            </LayersControl.BaseLayer>
            <LayersControl.BaseLayer name="Satelit">
              <TileLayer attribution='Tiles &copy; Esri' url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" />
            </LayersControl.BaseLayer>
          </LayersControl>
          <ClickHandler onPick={(la, lo) => pick(la, lo)} />
          {hasPoint && <Marker position={[lat, lng]} />}
          <FlyTo flyTo={flyTo} />
        </MapContainer>
      </div>
      <p className="text-[11px] text-gray-400">Klik di peta utk naruh titik, scroll utk zoom, atau isi manual di bawah (mis. copas dari Google Maps).</p>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-[11px] text-gray-400 mb-0.5">Latitude</label>
          <input type="text" inputMode="decimal" className="select-filter w-full text-sm" value={latitude}
            onChange={e => onChange(e.target.value, longitude)} placeholder="-7.821..." />
        </div>
        <div>
          <label className="block text-[11px] text-gray-400 mb-0.5">Longitude</label>
          <input type="text" inputMode="decimal" className="select-filter w-full text-sm" value={longitude}
            onChange={e => onChange(latitude, e.target.value)} placeholder="111.94..." />
        </div>
      </div>

      <div>
        <label className="block text-[11px] text-gray-400 mb-0.5">Cari lokasi (nama tempat, atau tempel koordinat dari Maps)</label>
        <div className="flex gap-2">
          <input type="text" className="select-filter w-full text-sm" value={query}
            onChange={e => setQuery(e.target.value)} placeholder="mis. Jalan Dhoho Kediri / -7.821, 111.94"
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleSearch() } }} />
          <button type="button" onClick={handleSearch} disabled={searching} className="btn-secondary text-xs whitespace-nowrap">
            {searching ? '...' : 'Cari'}
          </button>
        </div>
        {searchErr && <p className="text-[11px] text-red-500 mt-1">{searchErr}</p>}
        {results && results.length > 0 && (
          <ul className="mt-1 border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-40 overflow-y-auto">
            {results.map((r, i) => (
              <li key={i}>
                <button type="button"
                  onClick={() => { pick(parseFloat(r.lat), parseFloat(r.lon), true); setResults(null); setQuery('') }}
                  className="w-full text-left px-2 py-1.5 text-[11px] text-gray-600 hover:bg-gray-50 truncate">
                  {r.display_name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
