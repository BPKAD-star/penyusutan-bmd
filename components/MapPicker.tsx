'use client'
// Peta pemilih titik koordinat (Leaflet + OpenStreetMap, gratis, tanpa API key).
// Klik di peta → set marker → isi latitude/longitude. Dua kotak angka manual di
// bawah tetap tersedia (isi manual, mis. copas dari Google Maps) — dua arah
// sinkron dgn marker. WAJIB di-import via next/dynamic({ ssr:false }) di
// pemanggil karena Leaflet butuh `window` (tak bisa di-render di server).
import { useState } from 'react'
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet'
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

function ClickHandler({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({ click(e) { onPick(e.latlng.lat, e.latlng.lng) } })
  return null
}

export default function MapPicker({ latitude, longitude, onChange }: {
  latitude: string; longitude: string
  onChange: (lat: string, lng: string) => void
}) {
  const lat = parseFloat(latitude), lng = parseFloat(longitude)
  const hasPoint = !isNaN(lat) && !isNaN(lng)
  const [mapKey] = useState(0) // stabilkan instance MapContainer (hindari re-init tiap render)

  return (
    <div className="space-y-2">
      <div className="rounded-lg overflow-hidden border border-gray-200" style={{ height: 220 }}>
        <MapContainer key={mapKey} center={hasPoint ? [lat, lng] : DEFAULT_CENTER} zoom={hasPoint ? 15 : 11}
          style={{ height: '100%', width: '100%' }} scrollWheelZoom={false}>
          <TileLayer attribution='&copy; OpenStreetMap contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          <ClickHandler onPick={(la, lo) => onChange(la.toFixed(6), lo.toFixed(6))} />
          {hasPoint && <Marker position={[lat, lng]} />}
        </MapContainer>
      </div>
      <p className="text-[11px] text-gray-400">Klik di peta utk naruh titik, atau isi manual di bawah (mis. copas dari Google Maps).</p>
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
    </div>
  )
}
