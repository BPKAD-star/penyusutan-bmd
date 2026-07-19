'use client'
// Pemilih kode barang dari admin_kodefikasi_bmd (golongan + cari + pilih).
// Reusable: dipakai admin SSH/SBSK & RKBMD Pengadaan. Pola pencarian diambil
// dari components/pengelolaan/Pengadaan.tsx (kode aktif, like golongan.%).
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { GOLONGAN_REKAP } from '@/lib/bmd'
import { formatRupiah } from '@/lib/export'

// Baris info Masa Manfaat + Batas Kapitalisasi (ditampilkan di kandidat & hasil).
function MetaMM({ mm, kap }: { mm: number | null; kap: number | null }) {
  return (
    <p className="text-[11px] text-gray-400">
      Masa manfaat: {mm != null ? `${mm} th` : '-'} · Batas kapitalisasi: {kap != null ? formatRupiah(kap) : '-'}
    </p>
  )
}

export type KodefikasiHasil = {
  kode: string
  uraian: string | null
  nama_objek: string | null
  nama_rincian: string | null
  nama_sub_rincian: string | null
  masa_manfaat_tahun: number | null
  batas_kapitalisasi: number | null
}

const KOLOM = 'kode,uraian,nama_objek,nama_rincian,nama_sub_rincian,masa_manfaat_tahun,batas_kapitalisasi'

// Persediaan + 8 golongan aset tetap resmi (sama dgn admin Kodefikasi).
const GOLONGAN: { kode: string; uraian: string }[] = [
  { kode: '1.1.7', uraian: 'Persediaan' },
  ...GOLONGAN_REKAP.map(g => ({ kode: g.kode, uraian: g.uraian })),
]

export default function KodefikasiPicker({ picked, onPick, golonganTetap }: {
  picked: KodefikasiHasil | null
  onPick: (r: KodefikasiHasil | null) => void
  golonganTetap?: string // kunci ke satu golongan (mis. '1.3.6' KDP) — dropdown golongan disembunyikan
}) {
  const supabase = createClient()
  const [golongan, setGolongan] = useState(golonganTetap || '')
  const [search, setSearch] = useState('')
  const [results, setResults] = useState<KodefikasiHasil[]>([])
  const [searching, setSearching] = useState(false)
  const [err, setErr] = useState('')

  async function cari() {
    if (!golongan) { setErr('Pilih golongan dulu.'); return }
    setErr(''); setSearching(true)
    let q = supabase.from('admin_kodefikasi_bmd').select(KOLOM).eq('aktif', true).like('kode', `${golongan}.%`)
    if (search.trim()) q = q.or(`kode.ilike.${search.trim()}%,uraian.ilike.%${search.trim()}%`)
    const { data, error } = await q.limit(30)
    if (error) setErr(`Error: ${error.message}`)
    setResults((data || []) as KodefikasiHasil[])
    setSearching(false)
  }

  if (picked) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-lg border border-teal/30 bg-teal/5 px-3 py-2">
        <div className="min-w-0">
          <p className="text-xs text-gray-800 font-medium truncate">{picked.kode} — {picked.uraian || '-'}</p>
          <p className="text-[11px] text-gray-500 truncate">
            {[picked.nama_objek, picked.nama_rincian, picked.nama_sub_rincian].filter(Boolean).join(' › ') || '—'}
          </p>
          <MetaMM mm={picked.masa_manfaat_tahun} kap={picked.batas_kapitalisasi} />
        </div>
        <button type="button" onClick={() => onPick(null)} className="text-xs text-gray-500 hover:text-gray-700 flex-shrink-0">Ganti</button>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-end gap-2">
        {!golonganTetap && (
          <div>
            <label className="block text-xs text-gray-500 mb-1">Golongan</label>
            <select className="select-filter" value={golongan} onChange={e => setGolongan(e.target.value)}>
              <option value="">— pilih —</option>
              {GOLONGAN.map(g => <option key={g.kode} value={g.kode}>{g.kode} — {g.uraian}</option>)}
            </select>
          </div>
        )}
        <div className="flex-1 min-w-[180px]">
          <label className="block text-xs text-gray-500 mb-1">Cari kode / uraian</label>
          <input className="select-filter w-full" value={search} onChange={e => setSearch(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); cari() } }} />
        </div>
        <button type="button" className="btn-primary" onClick={cari} disabled={searching}>
          {searching ? 'Mencari...' : 'Cari'}
        </button>
      </div>
      {err && <p className="text-xs text-red-600">{err}</p>}
      {results.length > 0 && (
        <div className="max-h-56 overflow-y-auto rounded-lg border border-gray-100 divide-y divide-gray-50">
          {results.map(r => (
            <button type="button" key={r.kode} onClick={() => { onPick(r); setResults([]) }}
              className="w-full text-left px-3 py-2 hover:bg-gray-50">
              <p className="text-xs text-gray-800 font-medium">{r.kode} — {r.uraian || '-'}</p>
              <p className="text-[11px] text-gray-500">
                {[r.nama_objek, r.nama_rincian, r.nama_sub_rincian].filter(Boolean).join(' › ') || '—'}
              </p>
              <MetaMM mm={r.masa_manfaat_tahun} kap={r.batas_kapitalisasi} />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
