'use client'
// Peta multi-marker (Leaflet + OpenStreetMap) — dipakai app/dashboard/gis.
// WAJIB di-import via next/dynamic({ssr:false}) di pemanggil (butuh `window`).
// Beda dari MapPicker (1 titik, buat pilih koordinat) — ini buat NAMPILIN
// banyak aset Tanah sekaligus, warna marker beda-beda sesuai status data.
import { useMemo } from 'react'
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

const DEFAULT_CENTER: [number, number] = [-7.82, 111.94] // sekitar Kab. Kediri

export type GisMarker = {
  id: string
  lat: number
  lng: number
  color: 'red' | 'amber' | 'teal'
  title: string
  sub: string
  active: boolean
}

const COLOR_HEX: Record<GisMarker['color'], string> = { red: '#e11d48', amber: '#f59e0b', teal: '#0d9488' }

function dotIcon(color: GisMarker['color'], active: boolean) {
  const hex = COLOR_HEX[color]
  const size = active ? 22 : 16
  return L.divIcon({
    className: '',
    html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${hex};border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,.4)"></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  })
}

export default function GisMap({ markers, onSelect }: { markers: GisMarker[]; onSelect: (id: string) => void }) {
  const center = useMemo<[number, number]>(() => {
    const active = markers.find(m => m.active)
    if (active) return [active.lat, active.lng]
    if (markers.length > 0) return [markers[0].lat, markers[0].lng]
    return DEFAULT_CENTER
  }, [markers])

  return (
    <div className="rounded-lg overflow-hidden border border-gray-200" style={{ height: 520 }}>
      <MapContainer center={center} zoom={markers.length > 0 ? 13 : 11} style={{ height: '100%', width: '100%' }}>
        <TileLayer attribution='&copy; OpenStreetMap contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        {markers.map(m => (
          <Marker key={m.id} position={[m.lat, m.lng]} icon={dotIcon(m.color, m.active)} eventHandlers={{ click: () => onSelect(m.id) }}>
            <Popup>
              <p className="font-medium text-sm">{m.title}</p>
              <p className="text-xs text-gray-500">{m.sub}</p>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  )
}
