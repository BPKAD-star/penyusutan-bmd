'use client'
// Pengadaan: dua mode — Entry Manual atau Import Excel. Entry Manual = satu
// tampilan gabungan (PengadaanEntry): pilih SKPD → daftar campur Non-fisik +
// Konstruksi + satu total; jenis dipilih SETELAH klik "+ Tambah Pengadaan".
import { useState } from 'react'
import PerolehanImport from '@/components/PerolehanImport'
import PengadaanEntry from '@/components/pengelolaan/PengadaanEntry'

export default function Page() {
  const [mode, setMode] = useState<'manual' | 'import'>('manual')
  const tab = (v: typeof mode, label: string) => (
    <button
      onClick={() => setMode(v)}
      className={`px-4 py-1.5 rounded-md transition-colors ${mode === v ? 'bg-white shadow-sm font-medium text-gray-800' : 'text-gray-500 hover:text-gray-700'}`}
    >{label}</button>
  )
  return (
    <div>
      <div className="px-6 pt-6">
        <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-1 text-sm">
          {tab('manual', 'Entry Manual')}
          {tab('import', 'Import Excel')}
        </div>
      </div>
      {mode === 'manual' && <PengadaanEntry />}
      {mode === 'import' && <PerolehanImport jenis="pengadaan" label="Pengadaan" kontrakRelevan />}
    </div>
  )
}
