'use client'
// Pemilih jenis aset di atas Lembar Kerja & Validasi Inventarisasi — pengganti
// 16 sub-menu Sidebar (keputusan user 2026-10-01). Halaman dibuka POLOS: daftar
// baru dimuat setelah jenis dipilih, termasuk pilihan "Semua jenis".
//
// Pilihan terakhir diingat PER MENU di perangkat ini (`localStorage`) supaya
// petugas yang seharian mengerjakan satu jenis tak perlu memilih ulang tiap
// membuka menu. URL `?jenis=<kode|semua>` menang atas ingatan itu — dipakai
// pengalih rute lama (/inventarisasi/jenis/<kode>) & tautan antar-menu.
import { useCallback, useEffect, useState } from 'react'
import { JENIS_INVENTARISASI, JENIS_SEMUA } from '@/lib/inventarisasi'

const sah = (v: string | null): string | null =>
  v && (v === JENIS_SEMUA || JENIS_INVENTARISASI.some(j => j.kode === v)) ? v : null

/**
 * `[jenis, setJenis, siap]` — `jenis` null = belum dipilih. `siap` false selama
 * URL/ingatan belum dibaca (sekali, sesudah mount — `window` tak ada saat SSR),
 * supaya halaman tak sempat berkedip "pilih jenis dulu" lalu melompat.
 */
export function useJenisTerpilih(kunci: string): [string | null, (v: string) => void, boolean] {
  const [jenis, setJenisState] = useState<string | null>(null)
  const [siap, setSiap] = useState(false)

  useEffect(() => {
    let awal: string | null = null
    try { awal = sah(new URLSearchParams(window.location.search).get('jenis')) } catch { /* abaikan */ }
    if (!awal) {
      try { awal = sah(window.localStorage.getItem(kunci)) } catch { /* private window dsb. */ }
    }
    setJenisState(awal)
    setSiap(true)
  }, [kunci])

  const setJenis = useCallback((v: string) => {
    setJenisState(v)
    try { window.localStorage.setItem(kunci, v) } catch { /* abaikan */ }
    try {
      const url = new URL(window.location.href)
      url.searchParams.set('jenis', v)
      window.history.replaceState(window.history.state, '', url.toString())
    } catch { /* abaikan */ }
  }, [kunci])

  return [jenis, setJenis, siap]
}

export default function PemilihJenis({ value, onChange, hitung, labelHitung }: {
  value: string | null
  onChange: (v: string) => void
  /** Angka per jenis (+ `semua`). Tak ada kuncinya = belum/tak terhitung → tak ditampilkan. */
  hitung?: Record<string, number | null>
  /** Arti angkanya, utk `title` ("belum diinventarisasi", "menunggu validasi"). */
  labelHitung: string
}) {
  const opsi = [{ kode: JENIS_SEMUA, label: 'Semua jenis' }, ...JENIS_INVENTARISASI]
  return (
    <div className="card p-3 mb-4">
      <p className="text-xs text-gray-500 mb-2">Jenis aset</p>
      <div className="flex flex-wrap gap-2">
        {opsi.map(o => {
          const aktif = value === o.kode
          const n = hitung?.[o.kode]
          return (
            <button key={o.kode} type="button" onClick={() => onChange(o.kode)}
              title={n != null ? `${n.toLocaleString('id-ID')} ${labelHitung}` : undefined}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                aktif ? 'bg-teal text-white border-teal' : 'bg-white text-gray-700 border-gray-200 hover:border-teal hover:text-teal'
              }`}>
              {o.kode !== JENIS_SEMUA && <span className={aktif ? 'text-white/70' : 'text-gray-400'}>{o.kode} </span>}
              {o.label}
              {n != null && n > 0 && (
                <span className={`ml-1.5 inline-block min-w-[1.25rem] px-1 rounded-full text-[10px] ${
                  aktif ? 'bg-white/25 text-white' : 'bg-amber-50 text-amber-700'
                }`}>{n.toLocaleString('id-ID')}</span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
