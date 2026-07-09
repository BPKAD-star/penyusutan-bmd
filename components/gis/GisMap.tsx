'use client'
// Peta multi-marker (Leaflet + OpenStreetMap) — dipakai app/dashboard/gis.
// WAJIB di-import via next/dynamic({ssr:false}) di pemanggil (butuh `window`).
// Beda dari MapPicker (1 titik, buat pilih koordinat) — ini buat NAMPILIN
// banyak aset Tanah sekaligus, warna marker beda-beda sesuai status data.
//
// Clustering pakai `leaflet.markercluster` MURNI (bukan react-leaflet-cluster —
// itu butuh peer React 19, app ini masih React 18) — dikontrol imperatif lewat
// useMap() + L.markerClusterGroup(), bukan komponen <Marker> react-leaflet biasa.
import { useEffect, useMemo, useRef } from 'react'
import { MapContainer, TileLayer, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import 'leaflet.markercluster/dist/MarkerCluster.Default.css'
import 'leaflet.markercluster'

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
  const size = active ? 26 : 16
  return L.divIcon({
    className: '',
    html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${hex};border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,.4)"></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  })
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>)[c])
}

// Layer cluster — dibangun ulang tiap `markers` berubah (dataset per filter
// SKPD biasanya kecil setelah filter-first, jadi murah). Klik marker → onSelect.
function ClusterLayer({ markers, onSelect }: { markers: GisMarker[]; onSelect: (id: string) => void }) {
  const map = useMap()

  useEffect(() => {
    const group = L.markerClusterGroup({ maxClusterRadius: 50, spiderfyOnMaxZoom: true, showCoverageOnHover: false })
    for (const m of markers) {
      const marker = L.marker([m.lat, m.lng], { icon: dotIcon(m.color, m.active) })
      marker.bindPopup(
        `<p style="font-weight:600;font-size:13px;margin:0">${escapeHtml(m.title)}</p>` +
        `<p style="font-size:11px;color:#6b7280;margin:2px 0 0">${escapeHtml(m.sub)}</p>`
      )
      marker.on('click', () => onSelect(m.id))
      group.addLayer(marker)
    }
    map.addLayer(group)
    return () => { map.removeLayer(group) }
  }, [markers, map, onSelect])

  return null
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

  const mapRef = useRef<L.Map | null>(null)

  return (
    <div className="rounded-lg overflow-hidden border border-gray-200" style={{ height: 520 }}>
      <MapContainer ref={mapRef} center={initialCenter} zoom={markers.length > 0 ? 13 : 11} style={{ height: '100%', width: '100%' }}>
        <TileLayer attribution='&copy; OpenStreetMap contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <ClusterLayer markers={markers} onSelect={onSelect} />
        <FocusActive markers={markers} />
      </MapContainer>
    </div>
  )
}
