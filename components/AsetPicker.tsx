'use client'
// Pemilih aset dengan pencarian (NIBAR / nama / kode) — dipakai semua modul Pengelolaan.
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatRupiah } from '@/lib/export'

export type AsetRingkas = {
  id: string
  nibar: string | null
  kode: string
  nama_barang: string | null
  nilai_perolehan: number
  skpd_id: number | null
  status: string
  skpd: { nama: string } | null
}

export default function AsetPicker({ selected, onSelect }: {
  selected: AsetRingkas | null
  onSelect: (a: AsetRingkas | null) => void
}) {
  const supabase = createClient()
  const [q, setQ] = useState('')
  const [results, setResults] = useState<AsetRingkas[]>([])
  const [searching, setSearching] = useState(false)

  async function cari() {
    if (!q.trim()) return
    setSearching(true)
    const { data } = await supabase
      .from('aset')
      .select('id,nibar,kode,nama_barang,nilai_perolehan,skpd_id,status,skpd:admin_skpd(nama)')
      .eq('status', 'aktif')
      .or(`nibar.ilike.%${q}%,nama_barang.ilike.%${q}%,kode.ilike.%${q}%`)
      .limit(20)
    setResults((data as unknown as AsetRingkas[]) || [])
    setSearching(false)
  }

  if (selected) {
    return (
      <div className="flex items-start justify-between gap-3 p-3 bg-teal/5 border border-teal/30 rounded-lg">
        <div className="text-sm">
          <p className="font-medium text-gray-800">{selected.nama_barang || '-'}</p>
          <p className="text-xs text-gray-500 mt-0.5">
            NIBAR {selected.nibar || '-'} · {selected.kode} · {selected.skpd?.nama || '-'}
          </p>
          <p className="text-xs text-gray-600 mt-0.5">Nilai perolehan: {formatRupiah(selected.nilai_perolehan)}</p>
        </div>
        <button type="button" className="btn-secondary text-xs" onClick={() => onSelect(null)}>Ganti</button>
      </div>
    )
  }

  return (
    <div>
      <div className="flex gap-2">
        <input
          className="select-filter flex-1"
          placeholder="Cari NIBAR / nama barang / kode..."
          value={q}
          onChange={e => setQ(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); cari() } }}
        />
        <button type="button" className="btn-secondary" onClick={cari} disabled={searching}>
          {searching ? '...' : 'Cari'}
        </button>
      </div>
      {results.length > 0 && (
        <div className="mt-2 border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-64 overflow-y-auto">
          {results.map(a => (
            <button
              key={a.id}
              type="button"
              onClick={() => { onSelect(a); setResults([]); setQ('') }}
              className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm"
            >
              <p className="font-medium text-gray-800 text-xs">{a.nama_barang || '-'}</p>
              <p className="text-gray-400 text-xs">{a.nibar || '-'} · {a.kode} · {a.skpd?.nama || '-'} · {formatRupiah(a.nilai_perolehan)}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
