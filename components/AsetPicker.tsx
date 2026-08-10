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
  // Ditambah 2026-08-10 untuk RKBMD (pencarian & snapshot ke rkbmd_item).
  // OPSIONAL supaya pemanggil lama yang merakit objek ini sendiri tidak perlu
  // ikut diubah — picker-nya sendiri selalu mengisi ketiganya.
  uraian_barang?: string | null
  merek_tipe?: string | null
  tgl_perolehan?: string | null
}

export default function AsetPicker({ selected, onSelect, skpdId, kodePrefix }: {
  selected: AsetRingkas | null
  onSelect: (a: AsetRingkas | null) => void
  skpdId?: number // opsional: batasi pencarian ke SKPD ini (dipakai RKBMD)
  kodePrefix?: string // opsional: batasi ke golongan tertentu, mis. '1.3.3' (dipakai Konstruksi)
}) {
  const supabase = createClient()
  const [q, setQ] = useState('')
  const [results, setResults] = useState<AsetRingkas[]>([])
  const [searching, setSearching] = useState(false)

  // Query kosong = tampilkan semua barang yg cocok skpdId/kodePrefix (browse-all),
  // bukan cuma pencarian teks — supaya bisa "lihat semua barang di SKPD ini".
  async function cari() {
    setSearching(true)
    let query = supabase
      .from('aset')
      .select('id,nibar,kode,nama_barang,uraian_barang,merek_tipe,tgl_perolehan,nilai_perolehan,skpd_id,status,skpd:admin_skpd(nama)')
      .eq('status', 'aktif')
    if (skpdId != null) query = query.eq('skpd_id', skpdId)
    if (kodePrefix) query = query.like('kode', `${kodePrefix}%`)
    // Koma & tanda kurung dibuang: satu koma yang diketik operator memecah
    // sintaks `or=` di tengah jalan → PostgREST menolak seluruh filter
    // ("failed to parse logic tree"), dan nama barang e-BMD banyak yang berkoma.
    // Jebakan yang sama sudah pernah ditutup di kotak Cari Daftar Barang Awal.
    const term = q.trim().replace(/[,()]/g, '')
    if (term) query = query.or([
      `nibar.ilike.%${term}%`,
      `nama_barang.ilike.%${term}%`,
      `uraian_barang.ilike.%${term}%`,
      `merek_tipe.ilike.%${term}%`,
      `kode.ilike.%${term}%`,
    ].join(','))
    const { data } = await query.order('nama_barang').limit(50)
    setResults((data as unknown as AsetRingkas[]) || [])
    setSearching(false)
  }

  if (selected) {
    return (
      <div className="flex items-start justify-between gap-3 p-3 bg-teal/5 border border-teal/30 rounded-lg">
        <div className="text-sm min-w-0">
          <p className="font-medium text-gray-800">{selected.nama_barang || '-'}</p>
          {selected.uraian_barang && <p className="text-xs text-gray-500">{selected.uraian_barang}</p>}
          <p className="text-xs text-gray-500 mt-0.5">
            NIBAR {selected.nibar || '-'} · {selected.kode} · {selected.skpd?.nama || '-'}
          </p>
          <p className="text-xs text-gray-600 mt-0.5">
            {selected.merek_tipe ? `${selected.merek_tipe} · ` : ''}
            {selected.tgl_perolehan ? `${selected.tgl_perolehan} · ` : ''}
            Nilai perolehan: {formatRupiah(selected.nilai_perolehan)}
          </p>
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
          placeholder="Cari NIBAR / uraian barang / nama barang / merek / kode..."
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
              <p className="font-medium text-gray-800 text-xs">{a.nama_barang || a.uraian_barang || '-'}</p>
              <p className="text-gray-400 text-xs">
                {a.nibar || '-'} · {a.kode}{a.merek_tipe ? ` · ${a.merek_tipe}` : ''} · {a.skpd?.nama || '-'} · {formatRupiah(a.nilai_perolehan)}
              </p>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
