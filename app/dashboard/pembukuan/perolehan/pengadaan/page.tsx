'use client'
// Pengadaan: dua mode — Entry Manual atau Import Excel. Di Entry Manual, SKPD
// dipilih SEKALI di atas, lalu pilih jenis transaksi: Non-fisik (barang biasa)
// atau Pekerjaan Fisik Konstruksi (KDP). Keduanya di bawah satu tampilan
// Pengadaan yang sama (enak buat rekon dengan keuangan).
import { useState } from 'react'
import Pengadaan from '@/components/pengelolaan/Pengadaan'
import PerolehanImport from '@/components/PerolehanImport'
import KonstruksiPengadaan from '@/components/pengelolaan/KonstruksiPengadaan'
import FormShell from '@/components/pengelolaan/FormShell'
import SkpdCombobox from '@/components/SkpdCombobox'

function EntryManual() {
  const [skpd, setSkpd] = useState('')
  const [jenis, setJenis] = useState<'nonfisik' | 'fisik'>('nonfisik')
  const subTab = (v: typeof jenis, label: string) => (
    <button
      onClick={() => setJenis(v)}
      className={`px-4 py-1.5 rounded-md transition-colors ${jenis === v ? 'bg-white shadow-sm font-medium text-gray-800' : 'text-gray-500 hover:text-gray-700'}`}
    >{label}</button>
  )
  return (
    <FormShell judul="Pengadaan" msg=""
      deskripsi="Pilih SKPD, pilih jenis transaksi (Non-fisik / Pekerjaan Fisik Konstruksi), lalu entry — semua dalam satu tampilan Pengadaan.">
      <div className="card p-5 mb-4">
        <div className="flex items-center gap-3">
          <label className="w-32 text-sm text-gray-600 text-right flex-shrink-0">Lokasi / SKPD :</label>
          <SkpdCombobox lockToOperator value={skpd} onChange={setSkpd}
            placeholder="Ketik nama SKPD / Sub OPD / Lokasi..." />
        </div>
      </div>

      {!skpd ? (
        <div className="card p-12 text-center text-gray-400 text-sm">
          Pilih SKPD di atas untuk melihat & membuat pengadaan.
        </div>
      ) : (
        <>
          <div className="mb-4 inline-flex rounded-lg border border-gray-200 bg-gray-50 p-1 text-sm">
            {subTab('nonfisik', 'Non-fisik')}
            {subTab('fisik', 'Pekerjaan Fisik Konstruksi')}
          </div>
          {jenis === 'nonfisik'
            ? <Pengadaan skpdProp={skpd} embedded />
            : <KonstruksiPengadaan skpdProp={skpd} embedded />}
        </>
      )}
    </FormShell>
  )
}

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
      {mode === 'manual' && <EntryManual />}
      {mode === 'import' && <PerolehanImport jenis="pengadaan" label="Pengadaan" kontrakRelevan />}
    </div>
  )
}
