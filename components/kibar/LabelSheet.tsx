'use client'
// Sheet cetak label QR — dipakai dari Pelaporan > KIBAR (banyak barang sekaligus,
// dari checklist) & dari halaman publik /kibar/[nibar] (1 barang, lihat
// PrintLabelButton.tsx). Layout tiap label: QR kiri, 4 baris kanan (SKPD,
// Spesifikasi Nama Barang, NIBAR, Tanggal Perolehan) — sesuai keputusan user.
// QR generate CLIENT-SIDE (package `qrcode` isomorphic) — nggak kirim data
// barang ke servis QR pihak ketiga mana pun.
import { useEffect, useState } from 'react'
import QRCode from 'qrcode'

export type LabelItem = {
  nibar: string
  namaBarang: string
  skpdNama: string
  tglPerolehan: string | null
}

const fmtTgl = (s: string | null) => s
  ? new Date(s).toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' })
  : '-'

export default function LabelSheet({ items, onClose }: { items: LabelItem[]; onClose: () => void }) {
  const [qrMap, setQrMap] = useState<Record<string, string>>({})

  useEffect(() => {
    (async () => {
      const origin = window.location.origin
      const entries = await Promise.all(items.map(async it => {
        const url = `${origin}/kibar/${it.nibar}`
        const dataUrl = await QRCode.toDataURL(url, { margin: 1, width: 160 })
        return [it.nibar, dataUrl] as const
      }))
      setQrMap(Object.fromEntries(entries))
    })()
  }, [items])

  return (
    <div className="fixed inset-0 z-50 bg-black/50 overflow-y-auto print:bg-white print:static print:overflow-visible">
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #kibar-label-sheet, #kibar-label-sheet * { visibility: visible; }
          #kibar-label-sheet { position: absolute; top: 0; left: 0; width: 100%; }
          .kibar-no-print { display: none !important; }
        }
      `}</style>

      <div className="kibar-no-print sticky top-0 bg-white border-b border-gray-200 px-5 py-3 flex items-center justify-between">
        <p className="text-sm font-semibold text-gray-800">Cetak Label — {items.length} barang</p>
        <div className="flex gap-2">
          <button onClick={onClose} className="btn-secondary text-sm">Tutup</button>
          <button onClick={() => window.print()} className="btn-primary text-sm">Cetak</button>
        </div>
      </div>

      <div id="kibar-label-sheet" className="p-6 max-w-4xl mx-auto">
        <div className="grid grid-cols-2 gap-3">
          {items.map(it => (
            <div key={it.nibar} className="border border-gray-300 rounded-md p-3 flex gap-3 items-center" style={{ breakInside: 'avoid' }}>
              {qrMap[it.nibar]
                ? <img src={qrMap[it.nibar]} alt="QR" width={72} height={72} className="flex-shrink-0" />
                : <div className="w-[72px] h-[72px] flex-shrink-0 bg-gray-100" />}
              <div className="text-[11px] leading-tight space-y-0.5 min-w-0">
                <p className="font-semibold text-gray-800 truncate">{it.skpdNama}</p>
                <p className="text-gray-700 truncate">{it.namaBarang}</p>
                <p className="font-mono text-gray-600 break-all">{it.nibar}</p>
                <p className="text-gray-500">{fmtTgl(it.tglPerolehan)}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
