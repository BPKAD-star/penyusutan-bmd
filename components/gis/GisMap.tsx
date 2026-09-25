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
//
// LayersControl (Jalan/Satelit) digeser ke bottomleft (permintaan user
// 2026-09-25, semula topright) — disandingkan dgn kotak ringkasan panel kiri
// lewat aturan `.gis-map-container` di app/globals.css yang menggeser
// `.leaflet-bottom.leaflet-left` ke KANAN kotak itu, bukan menimpanya.
//
// Mode "pick titik" (permintaan user 2026-09-26, fitur "Set Titik Koordinat"
// di PetaView) — dipasang di sini (BUKAN MapPicker terpisah) karena harus
// hidup di ATAS peta multi-marker yang sama: operator perlu tetap melihat
// marker lain (tanah sebelah) sbg acuan saat naruh titik. `pickMode` cuma
// mengubah kursor jadi crosshair (`cursor-crosshair` Tailwind bawaan) & marker
// lain TETAP bisa diklik (pilih tanah lain) — `PickHandler` (pola sama dgn
// `ClickHandler` di MapPicker.tsx) menangkap klik di AREA KOSONG peta lewat
// `useMapEvents`, sedangkan klik TEPAT DI ATAS marker tetap ditangkap handler
// `Marker`-nya sendiri (event Leaflet berhenti di elemen paling spesifik).
import { useEffect, useMemo } from 'react'
import { MapContainer, TileLayer, Marker, Popup, ZoomControl, LayersControl, useMap, useMapEvents } from 'react-leaflet'
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

// Marker DRAFT (titik belum disimpan) — biru & bergaris putus-putus, sengaja
// beda dari ketiga warna status (merah/amber/teal) supaya tak tertukar dengan
// tanah sungguhan mana pun. `animate-pulse` (Tailwind) menandakan ia "belum
// final", persis penanda draft di tempat lain aplikasi ini.
const DRAFT_ICON = L.divIcon({
  className: '',
  html: `<div class="animate-pulse" style="width:22px;height:22px;border-radius:50%;background:#2563eb;border:3px dashed white;box-shadow:0 1px 4px rgba(0,0,0,.5)"></div>`,
  iconSize: [22, 22],
  iconAnchor: [11, 11],
})

function PickHandler({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({ click(e) { onPick(e.latlng.lat, e.latlng.lng) } })
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

export default function GisMap({ markers, onSelect, pickMode = false, draftPoint = null, onPick }: {
  markers: GisMarker[]
  onSelect: (id: string) => void
  // Ketiganya opsional & dipakai BERSAMA utk fitur "Set Titik Koordinat" —
  // kalau `onPick` tak dioper, `pickMode`/`draftPoint` tak berefek apa-apa
  // (dipakai halaman lain yg mungkin nanti reuse GisMap tanpa fitur ini).
  pickMode?: boolean
  draftPoint?: { lat: number; lng: number } | null
  onPick?: (lat: number, lng: number) => void
}) {
  const initialCenter = useMemo<[number, number]>(() => {
    const active = markers.find(m => m.active)
    if (active) return [active.lat, active.lng]
    if (markers.length > 0) return [markers[0].lat, markers[0].lng]
    return DEFAULT_CENTER
  }, []) // eslint-disable-line react-hooks/exhaustive-deps -- cuma posisi AWAL; re-center berikutnya via FocusActive

  return (
    <MapContainer center={initialCenter} zoom={markers.length > 0 ? 13 : 11} zoomControl={false}
      className={`gis-map-container ${pickMode ? 'cursor-crosshair' : ''}`} style={{ height: '100%', width: '100%' }}>
      {pickMode && onPick && <PickHandler onPick={onPick} />}
      {draftPoint && <Marker position={[draftPoint.lat, draftPoint.lng]} icon={DRAFT_ICON} />}
      <LayersControl position="bottomleft">
        <LayersControl.BaseLayer checked name="Jalan">
          <TileLayer attribution='&copy; OpenStreetMap contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        </LayersControl.BaseLayer>
        <LayersControl.BaseLayer name="Satelit">
          <TileLayer attribution='Tiles &copy; Esri' url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" />
        </LayersControl.BaseLayer>
      </LayersControl>
      <ZoomControl position="bottomright" />
      {markers.map((m, i) => (
        // `bubblingMouseEvents={false}`: Leaflet Marker default-nya MENERUSKAN
        // klik ke peta juga (bukan cuma marker-nya) — tanpa ini, mengklik
        // tanah sebelah selagi `pickMode` aktif akan SEKALIGUS memanggil
        // `onPick` dgn koordinat marker itu (via PickHandler di map), bukan
        // cuma `onSelect`. Aman dimatikan permanen: tak ada listener klik
        // level-peta lain yang butuh bubbling dari marker.
        <Marker key={`${m.id}-${i}`} position={[m.lat, m.lng]} icon={dotIcon(m.color, m.active)}
          bubblingMouseEvents={false} eventHandlers={{ click: () => onSelect(m.id) }}>
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
