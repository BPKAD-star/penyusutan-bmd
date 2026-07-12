'use client'
// Pengadaan: dua mode — Entry Manual (jurnal kontrak+BAST, ber-SK) atau Import
// Excel (template e-bmd). Di dalam Entry Manual ada sub-toggle Non-fisik
// (barang biasa) vs Pekerjaan Fisik Konstruksi (KDP → 1 kontrak = 1 KDP).
import { useState } from 'react'
import Pengadaan from '@/components/pengelolaan/Pengadaan'
import PerolehanImport from '@/components/PerolehanImport'
import KonstruksiPengadaan from '@/components/pengelolaan/KonstruksiPengadaan'

export default function Page() {
  const [mode, setMode] = useState<'manual' | 'import'>('manual')
  const [jenis, setJenis] = useState<'nonfisik' | 'fisik'>('nonfisik')
  const tab = (v: typeof mode, label: string) => (
    <button
      onClick={() => setMode(v)}
      className={`px-4 py-1.5 rounded-md transition-colors ${mode === v ? 'bg-white shadow-sm font-medium text-gray-800' : 'text-gray-500 hover:text-gray-700'}`}
    >{label}</button>
  )
  const subTab = (v: typeof jenis, label: string) => (
    <button
      onClick={() => setJenis(v)}
      className={`px-4 py-1.5 rounded-md transition-colors ${jenis === v ? 'bg-white shadow-sm font-medium text-gray-800' : 'text-gray-500 hover:text-gray-700'}`}
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
      {mode === 'manual' && (
        <>
          <div className="px-6 pt-4">
            <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-1 text-sm">
              {subTab('nonfisik', 'Non-fisik')}
              {subTab('fisik', 'Pekerjaan Fisik Konstruksi')}
            </div>
          </div>
          {jenis === 'nonfisik' ? <Pengadaan /> : <KonstruksiPengadaan />}
        </>
      )}
      {mode === 'import' && <PerolehanImport jenis="pengadaan" label="Pengadaan" kontrakRelevan />}
    </div>
  )
}
