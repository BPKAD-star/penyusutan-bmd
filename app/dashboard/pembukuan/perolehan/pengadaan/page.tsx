'use client'
// Pengadaan: dua mode — Entry Manual (jurnal kontrak+BAST, ber-SK) atau Import
// Excel (template e-bmd, tetap dipertahankan). Default: Entry Manual.
import { useState } from 'react'
import Pengadaan from '@/components/pengelolaan/Pengadaan'
import PerolehanImport from '@/components/PerolehanImport'

export default function Page() {
  const [mode, setMode] = useState<'manual' | 'import'>('manual')
  return (
    <div>
      <div className="px-6 pt-6">
        <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-1 text-sm">
          <button
            onClick={() => setMode('manual')}
            className={`px-4 py-1.5 rounded-md transition-colors ${mode === 'manual' ? 'bg-white shadow-sm font-medium text-gray-800' : 'text-gray-500 hover:text-gray-700'}`}
          >Entry Manual</button>
          <button
            onClick={() => setMode('import')}
            className={`px-4 py-1.5 rounded-md transition-colors ${mode === 'import' ? 'bg-white shadow-sm font-medium text-gray-800' : 'text-gray-500 hover:text-gray-700'}`}
          >Import Excel</button>
        </div>
      </div>
      {mode === 'manual'
        ? <Pengadaan />
        : <PerolehanImport jenis="pengadaan" label="Pengadaan" kontrakRelevan />}
    </div>
  )
}
