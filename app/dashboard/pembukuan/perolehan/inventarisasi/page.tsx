'use client'
// Import Excel dicabut (keputusan user 2026-09-14) — entry lewat form manual
// saja, biar kelengkapan dokumen (scan BAST, foto) terjamin sejak awal.
import PerolehanManual from '@/components/pengelolaan/PerolehanManual'

export default function Page() {
  return <PerolehanManual kategori="hasil_inventarisasi" judul="Hasil Inventarisasi" pihakLabel={null} />
}
