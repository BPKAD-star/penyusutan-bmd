'use client'
// Pengadaan: satu tampilan gabungan (PengadaanEntry): pilih SKPD → daftar
// campur Non-fisik + Konstruksi + satu total; jenis dipilih SETELAH klik
// "+ Tambah Pengadaan". Import Excel dicabut (keputusan user 2026-09-14) —
// entry lewat form manual saja, biar kelengkapan dokumen (scan BAST, foto)
// terjamin sejak awal.
import PengadaanEntry from '@/components/pengelolaan/PengadaanEntry'

export default function Page() {
  return <PengadaanEntry />
}
