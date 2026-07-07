'use client'
// Tombol "Cetak Label" di halaman publik /kibar/[nibar] — cetak 1 label utk
// barang ini saja. Reuse LabelSheet yg sama dipakai Pelaporan > KIBAR (cetak
// massal), cuma isinya array 1 item.
import { useState } from 'react'
import LabelSheet, { LabelItem } from './LabelSheet'

export default function PrintLabelButton({ item }: { item: LabelItem }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button onClick={() => setOpen(true)} className="btn-secondary text-sm">Cetak Label</button>
      {open && <LabelSheet items={[item]} onClose={() => setOpen(false)} />}
    </>
  )
}
