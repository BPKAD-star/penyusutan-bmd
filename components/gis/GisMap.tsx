'use client'
// Peta multi-marker (Leaflet + OpenStreetMap) — dipakai app/dashboard/gis.
// WAJIB di-import via next/dynamic({ssr:false}) di pemanggil (butuh `window`).
// Beda dari MapPicker (1 titik, buat pilih koordinat) — ini buat NAMPILIN
// banyak aset Tanah/Jalan sekaligus, warna marker beda-beda sesuai status data.
//
// SENGAJA TANPA clustering (keputusan user 2026-07-10): titik disebar apa
// adanya walau ribuan (~4300+ bidang termasuk jalan) — bukan pola GIS yang
// diinginkan kalau dikelompokkan jadi bubble angka.
//
// Full-bleed (ngisi 100% parent, BUKAN tinggi tetap px) — dipakai sbg layer
// dasar halaman GIS yang sekarang full-frame, panel kiri/kanan overlay di
// atasnya. Zoom control digeser ke bottomright biar gak numpuk panel kiri.
import { useEffect, useMemo } from 'react'
import { MapContainer, TileLayer, Marker, Popup, ZoomControl, useMap } from 'react-leaflet'
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
  const size = active ? 22 : 14
  return L.divIcon({
    className: '',
    html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${hex};border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,.4)"></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  })
}

// Auto-zoom/pan ke marker yang lagi aktif (register terpilih) — kalau bidangnya
// banyak, terbang ke bounding box seluruh bidang; kalau 1 titik, flyTo langsung.
function FocusActive({ markers }: { markers: GisMarker[] }) {
  const map = useMap()
  useEffect(() => {
    const active = markers.filter(m => m.active)
    if (active.length === 0) return
    if (active.length === 1) {
      map.flyTo([active[0].lat, active[0].lng], 16, { duration: 0.6 })
    } else {
      const bounds = L.latLngBounds(active.map(m => [m.lat, m.lng] as [number, number]))
      map.flyToBounds(bounds, { padding: [40, 40], maxZoom: 17, duration: 0.6 })
    }
  }, [markers, map]) // eslint-disable-line react-hooks/exhaustive-deps
  return null
}

export default function GisMap({ markers, onSelect }: { markers: GisMarker[]; onSelect: (id: string) => void }) {
  const initialCenter = useMemo<[number, number]>(() => {
    const active = markers.find(m => m.active)
    if (active) return [active.lat, active.lng]
    if (markers.length > 0) return [markers[0].lat, markers[0].lng]
    return DEFAULT_CENTER
  }, []) // eslint-disable-line react-hooks/exhaustive-deps — cuma posisi AWAL; re-center berikutnya via FocusActive

  return (
    <MapContainer center={initialCenter} zoom={markers.length > 0 ? 13 : 11} zoomControl={false} style={{ height: '100%', width: '100%' }}>
      <TileLayer attribution='&copy; OpenStreetMap contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <ZoomControl position="bottomright" />
      {markers.map((m, i) => (
        <Marker key={`${m.id}-${i}`} position={[m.lat, m.lng]} icon={dotIcon(m.color, m.active)} eventHandlers={{ click: () => onSelect(m.id) }}>
          <Popup>
            <p className="font-medium text-sm">{m.title}</p>
            <p className="text-xs text-gray-500">{m.sub}</p>
          </Popup>
        </Marker>
      ))}
      <FocusActive markers={markers} />
    </MapContainer>
  )
}
