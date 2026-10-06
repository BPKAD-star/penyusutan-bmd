'use client'
// Lapisan batas 26 kecamatan Kab. Kediri di atas peta GIS Tanah (permintaan
// user 2026-10-06). Klik satu kecamatan → ia terang, wilayah lain digelapkan
// (topeng: dunia dikurangi kecamatan itu), klik lagi → kembali semua. Filter
// titik tanahnya sendiri ada di PetaView (lewat useKecamatan); layer ini murni
// gambar + klik. Dipasang di DALAM GisMap (react-leaflet), jadi ikut `ssr:false`.
//
// Tak memakai fill penggelap per poligon, tapi SATU poligon topeng ber-lubang:
// kecamatan lain tetap bisa diklik (topengnya `interactive:false`, klik
// menembus ke poligon di bawahnya) & garis batasnya tetap terbaca.
import { useEffect, useRef } from 'react'
import { GeoJSON, Polygon, useMap } from 'react-leaflet'
import L from 'leaflet'
import { cincinLuarLatLng, topengKecamatan, type KoleksiKecamatan } from '@/lib/gisKecamatan'

export default function KecamatanLayer({ fc, terpilih, onPilih, interaktif }: {
  fc: KoleksiKecamatan
  terpilih: string | null
  onPilih: (kode: string | null) => void
  // Mati selama mode "Set Titik Koordinat" — klik peta saat itu artinya menaruh
  // titik, bukan memilih kecamatan.
  interaktif: boolean
}) {
  const map = useMap()
  // onEachFeature dibuat sekali per remount layer; ref menjaga ia selalu
  // memanggil handler terbaru tanpa memaksa layer dibangun ulang tiap render.
  const pilihRef = useRef(onPilih)
  useEffect(() => { pilihRef.current = onPilih }, [onPilih])

  const aktif = fc.features.find(f => f.properties.kode === terpilih) || null

  // Terbang ke kecamatan yang baru dipilih (bukan saat dibatalkan — peta
  // dibiarkan di tempatnya, operator mungkin sedang membandingkan).
  useEffect(() => {
    if (!aktif) return
    const titik = cincinLuarLatLng(aktif).flat()
    map.flyToBounds(L.latLngBounds(titik), { padding: [30, 30], duration: 0.6 })
  }, [aktif]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      {aktif && (
        <Polygon positions={topengKecamatan(aktif)}
          pathOptions={{ stroke: false, fillColor: '#0f172a', fillOpacity: 0.45, interactive: false }} />
      )}
      <GeoJSON
        // Remount saat pilihan/mode berganti: gaya & label diikat di onEachFeature.
        key={`${terpilih ?? 'semua'}-${interaktif ? 'i' : 'x'}`}
        data={fc as unknown as GeoJSON.GeoJsonObject}
        style={feature => {
          const sel = feature?.properties?.kode === terpilih
          return { color: sel ? '#0f766e' : '#475569', weight: sel ? 3 : 1.5, fillColor: '#0f172a', fillOpacity: 0, interactive: interaktif }
        }}
        onEachFeature={(feature, layer) => {
          const { kode, nama } = feature.properties as { kode: string; nama: string }
          const sel = kode === terpilih
          layer.bindTooltip(nama, {
            permanent: true, direction: 'center', interactive: false,
            className: sel ? 'gis-kec-label gis-kec-label-aktif' : 'gis-kec-label',
          })
          if (!interaktif) return
          layer.on({
            click: () => pilihRef.current(sel ? null : kode),
            mouseover: () => { if (!sel) (layer as L.Path).setStyle({ weight: 3, color: '#0d9488' }) },
            mouseout: () => { if (!sel) (layer as L.Path).setStyle({ weight: 1.5, color: '#475569' }) },
          })
        }}
      />
    </>
  )
}
