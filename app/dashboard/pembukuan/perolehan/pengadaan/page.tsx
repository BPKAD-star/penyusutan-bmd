'use client'
// Pengadaan: dua mode — Entry Manual (jurnal kontrak+BAST, ber-SK) atau Import
// Excel (template e-bmd, tetap dipertahankan). Default: Entry Manual.
import { useState } from 'react'
import Pengadaan from '@/components/pengelolaan/Pengadaan'
import PerolehanImport from '@/components/PerolehanImport'
import Konstruksi from '@/components/pengelolaan/Konstruksi'

export default function Page() {
  const [mode, setMode] = useState<'manual' | 'import' | 'konstruksi'>('manual')
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
          {tab('konstruksi', 'Pekerjaan Konstruksi')}
        </div>
      </div>
      {mode === 'manual' && <Pengadaan />}
      {mode === 'import' && <PerolehanImport jenis="pengadaan" label="Pengadaan" kontrakRelevan />}
      {mode === 'konstruksi' && <Konstruksi />}
    </div>
  )
}
