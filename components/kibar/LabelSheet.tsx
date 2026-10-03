'use client'
// Pop-up cetak label QR — dipakai dari Daftar Barang (banyak barang sekaligus,
// dari centang kolom KIBAR) & dari halaman publik /kibar/[nibar] (1 barang, lihat
// PrintLabelButton.tsx). Layout tiap label: QR kiri, teks kanan (SKPD, Spesifikasi
// Nama Barang, Merek/Tipe, NIBAR, Tanggal Perolehan) — sesuai keputusan user.
// QR dibangkitkan CLIENT-SIDE (package `qrcode`) — tak ada data barang yang
// dikirim ke layanan QR pihak ketiga.
//
// BENTUKNYA = KERTAS A4 SUNGGUHAN (permintaan user 2026-10-03). Label dibagi ke
// halaman-halaman 210×297 mm (2 kolom × 8 baris = 16 label per halaman) & yang
// tampil di pop-up PERSIS yang tercetak — satu-satunya sumber tata letak, jadi
// pratinjau tak bisa berbeda dari kertasnya. "Cetak" memanggil dialog cetak
// peramban: dari situ operator memilih printer ATAU "Simpan sebagai PDF".
//
// ⚠️ Dirender lewat PORTAL ke `document.body` & latarnya INLINE STYLE, bukan
// kelas Tailwind di dalam pohon halaman: versi lama (`fixed … bg-black/50` di
// dalam halaman) tampil TRANSPARAN di Daftar Barang — kartu label menumpuk di
// atas tabel. Portal melepasnya dari stacking context/overflow halaman mana pun,
// dan juga yang membuat CSS cetak sederhana: semua anak `body` selain pop-up ini
// cukup `display:none` (BUKAN `visibility:hidden`, yang tetap memakan tata letak
// & menyisakan halaman kosong di belakang).
import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import QRCode from 'qrcode'
import { namaBerkasKibar } from '@/lib/kibarJenis'

export type LabelItem = {
  nibar: string
  namaBarang: string
  merekTipe?: string | null
  skpdNama: string
  tglPerolehan: string | null
}

/** 2 kolom × 8 baris per halaman A4 — dikunci CSS di bawah (`gridAutoRows`). */
export const LABEL_PER_HALAMAN = 16

export function bagiHalaman<T>(items: T[], per = LABEL_PER_HALAMAN): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += per) out.push(items.slice(i, i + per))
  return out
}

const fmtTgl = (s: string | null) => s
  ? new Date(s).toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' })
  : '-'

const ID_ROOT = 'kibar-label-root'

// Satu sumber ukuran kertas: halaman 210×297 mm, tepi 10 mm → area 190×277 mm.
// 2 kolom (jarak 4 mm) = 93 mm per label; 8 baris (jarak 4 mm) = 31 mm per label.
const CSS = `
  .kibar-label-page { width: 210mm; height: 296mm; box-sizing: border-box; padding: 10mm; background: #fff; overflow: hidden;
    display: grid; grid-template-columns: repeat(2, 93mm); grid-auto-rows: 31mm; gap: 4mm; align-content: start; }
  .kibar-label-card { box-sizing: border-box; border: 0.3mm solid #9ca3af; border-radius: 1.5mm; padding: 2mm;
    display: flex; gap: 2.5mm; align-items: center; overflow: hidden; break-inside: avoid; }
  .kibar-label-card img, .kibar-label-qr { width: 24mm; height: 24mm; flex-shrink: 0; }
  .kibar-label-qr { background: #f3f4f6; }
  .kibar-label-teks { min-width: 0; font-size: 8.5pt; line-height: 1.25; color: #374151; }
  .kibar-label-teks p { margin: 0 0 0.6mm; }
  .kibar-label-skpd { font-weight: 700; color: #111827; }
  .kibar-label-nama { color: #111827; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .kibar-label-nibar { font-size: 6pt; line-height: 1.2; word-break: break-all; color: #4b5563; }
  @page { size: A4 portrait; margin: 0; }
  @media print {
    body > *:not(#${ID_ROOT}) { display: none !important; }
    #${ID_ROOT}, #${ID_ROOT} * { visibility: visible !important; }
    #${ID_ROOT} { position: static !important; inset: auto !important; background: none !important; overflow: visible !important; }
    #${ID_ROOT} .kibar-label-bar { display: none !important; }
    #${ID_ROOT} .kibar-label-scroll { padding: 0 !important; background: none !important; overflow: visible !important; display: block !important; }
    #${ID_ROOT} .kibar-label-page { box-shadow: none !important; margin: 0 !important; break-after: page; }
    #${ID_ROOT} .kibar-label-page:last-child { break-after: auto; }
  }
`

export default function LabelSheet({ items, onClose }: { items: LabelItem[]; onClose: () => void }) {
  const [qrMap, setQrMap] = useState<Record<string, string>>({})
  const [siap, setSiap] = useState(false)   // portal butuh `document` → hanya sesudah mount

  useEffect(() => setSiap(true), [])

  // Kunci efek = DAFTAR NIBAR, bukan identitas array: pemanggil boleh merakit
  // `items` baru tiap render, dan QR 500 label tak boleh dibangkitkan ulang
  // setiap kali induknya digambar ulang.
  const kunci = useMemo(() => items.map(i => i.nibar).join('|'), [items])
  useEffect(() => {
    let batal = false
    void (async () => {
      const origin = window.location.origin
      const entries = await Promise.all(items.map(async it => {
        // 240 px: label dicetak 24 mm, 160 px tampak kasar di printer 300 dpi.
        const dataUrl = await QRCode.toDataURL(`${origin}/kibar/${it.nibar}`, { margin: 1, width: 240 })
        return [it.nibar, dataUrl] as const
      }))
      if (!batal) setQrMap(Object.fromEntries(entries))
    })()
    return () => { batal = true }
  }, [kunci]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const halaman = useMemo(() => bagiHalaman(items), [items])

  function cetak() {
    // `document.title` = nama bawaan berkas saat "Simpan sebagai PDF" — satu-satunya
    // cara menyetelnya dari halaman; dipulihkan sesudah cetak (pola PrintPageButton).
    const judulAsli = document.title
    document.title = namaBerkasKibar('Label', `${items.length} barang`)
    window.addEventListener('afterprint', () => { document.title = judulAsli }, { once: true })
    window.print()
  }

  if (!siap) return null

  return createPortal(
    <div id={ID_ROOT} role="dialog" aria-modal="true" aria-label="Cetak label"
      style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', flexDirection: 'column', background: 'rgba(17, 24, 39, 0.72)' }}>
      <style>{CSS}</style>

      <div className="kibar-label-bar" style={{ background: '#fff', borderBottom: '1px solid #e5e7eb', padding: '12px 20px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <p className="text-sm font-semibold text-gray-800">Cetak Label — {items.length} barang</p>
          <p className="text-xs text-gray-500">
            {halaman.length} halaman A4 · {LABEL_PER_HALAMAN} label per halaman. Di dialog cetak pilih printer, atau
            &ldquo;Simpan sebagai PDF&rdquo;; skala 100%.
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={onClose} className="btn-secondary text-sm">Tutup</button>
          <button onClick={cetak} className="btn-primary text-sm">Cetak / Simpan PDF</button>
        </div>
      </div>

      <div className="kibar-label-scroll" style={{ flex: 1, overflow: 'auto', padding: '20px 16px',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
        {halaman.map((h, i) => (
          <div key={i} className="kibar-label-page" style={{ boxShadow: '0 4px 18px rgba(0,0,0,0.35)', flexShrink: 0 }}>
            {h.map(it => (
              <div key={it.nibar} className="kibar-label-card">
                {qrMap[it.nibar]
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={qrMap[it.nibar]} alt="QR" />
                  : <div className="kibar-label-qr" />}
                <div className="kibar-label-teks">
                  <p className="kibar-label-skpd">{it.skpdNama}</p>
                  <p className="kibar-label-nama">{it.namaBarang}</p>
                  {it.merekTipe && <p style={{ color: '#6b7280' }}>{it.merekTipe}</p>}
                  <p className="kibar-label-nibar">{it.nibar}</p>
                  <p style={{ color: '#6b7280' }}>{fmtTgl(it.tglPerolehan)}</p>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>,
    document.body,
  )
}
