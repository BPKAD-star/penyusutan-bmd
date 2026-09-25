'use client'
// GIS Tanah — SATU menu sidebar, DUA tampilan (Peta · Daftar Bidang) dipilih
// lewat tab kecil (keputusan user 2026-09-26, MEMBATALKAN sub-menu sidebar
// 2026-09-11). Alasannya murni tata letak sidebar: dua entri top-level (Peta,
// Daftar Bidang) dianggap terlalu banyak sub-menu untuk satu fitur — user
// minta sidebar kembali SATU baris "GIS Tanah", dan pemilihan tampilan pindah
// KE DALAM halaman itu sendiri: tab kecil di pojok kiri-atas, tepat di atas
// kotak "GIS Tanah" (tab Peta) / di atas judul (tab Daftar Bidang).
//
// Pembagian tugas TIDAK berubah sama sekali: Peta (`components/gis/
// PetaView.tsx`) tetap satu-satunya penulis `aset_bidang_tanah`
// (KelolaBidangPanel); Daftar Bidang (`components/gis/DaftarBidangTanah.tsx`)
// tetap murni lihat+Export — cuma letaknya yang menyatu jadi satu rute.
//
// Ganti tab TIDAK lewat navigasi Next.js (bukan dua route berbeda lagi) —
// murni state lokal, jadi tak ada remount router & tak ada flicker "Memuat...".
// PetaView & DaftarBidangTanah sendiri TETAP remount penuh tiap tab berganti
// (React membongkar cabang yang tak dirender) — itu ongkos yang sama dgn
// dulu (waktu keduanya route terpisah, pindah tab = full page nav = remount
// juga), jadi bukan regresi.
import { useState } from 'react'
import PetaView from '@/components/gis/PetaView'
import DaftarBidangTanah from '@/components/gis/DaftarBidangTanah'

type GisView = 'peta' | 'daftar-bidang'

// Dukung DUA deep-link lama, dibaca sekali saat mount:
// - `?view=daftar-bidang` — dipakai rute lama `/dashboard/gis/daftar-bidang`
//   yang kini `redirect()` ke sini (pola SSH/HSPK: rute lama dibiarkan hidup).
// - `?cari=<kata>` — dipakai Daftar Barang & lembar lain yang menautkan
//   langsung ke satu bidang tanah di peta (lib/gisTanah.ts,
//   app/dashboard/daftar-barang/page.tsx).
function bacaViewAwal(): GisView {
  if (typeof window === 'undefined') return 'peta'
  return new URLSearchParams(window.location.search).get('view') === 'daftar-bidang' ? 'daftar-bidang' : 'peta'
}
function bacaCariAwal(): string {
  if (typeof window === 'undefined') return ''
  return new URLSearchParams(window.location.search).get('cari') || ''
}

function TabBar({ view, onChange, className = '' }: { view: GisView; onChange: (v: GisView) => void; className?: string }) {
  return (
    <div className={`card p-1 shadow-lg pointer-events-auto flex gap-1 text-xs font-medium ${className}`}>
      <button onClick={() => onChange('peta')}
        className={`flex-1 px-3 py-1.5 rounded-lg transition-colors ${view === 'peta' ? 'bg-teal text-white' : 'text-gray-500 hover:bg-gray-50'}`}>
        🗺️ Peta
      </button>
      <button onClick={() => onChange('daftar-bidang')}
        className={`flex-1 px-3 py-1.5 rounded-lg transition-colors ${view === 'daftar-bidang' ? 'bg-teal text-white' : 'text-gray-500 hover:bg-gray-50'}`}>
        📋 Daftar Bidang
      </button>
    </div>
  )
}

export default function GisPage() {
  const [view, setView] = useState<GisView>(bacaViewAwal)
  // Dipakai HANYA saat tombol "Buka →" di tab Daftar Bidang menyalakan tab
  // Peta — bukan dibaca ulang dari URL tiap render (yang sudah dipindah, cuma
  // state React biasa).
  const [cariUntukPeta, setCariUntukPeta] = useState(bacaCariAwal)

  if (view === 'daftar-bidang') {
    return (
      <div className="h-full overflow-y-auto">
        <DaftarBidangTanah
          tabs={<TabBar view={view} onChange={setView} className="mb-4 max-w-[280px]" />}
          onBukaPeta={cari => { setCariUntukPeta(cari || ''); setView('peta') }}
        />
      </div>
    )
  }
  return <PetaView tabBar={<TabBar view={view} onChange={setView} />} cariAwal={cariUntukPeta} />
}
