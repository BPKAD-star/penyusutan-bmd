'use client'
// Pemilih kode barang dari admin_kodefikasi_bmd (golongan + cari + pilih).
// Reusable: dipakai admin SSH/SBSK & RKBMD Pengadaan. Pola pencarian diambil
// dari components/pengelolaan/Pengadaan.tsx (kode aktif, like golongan.%).
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { GOLONGAN_REKAP } from '@/lib/bmd'
import { formatRupiah } from '@/lib/export'

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

export default function KodefikasiPicker({ picked, onPick, golonganTetap, detail }: {
  picked: KodefikasiHasil | null
  onPick: (r: KodefikasiHasil | null) => void
  golonganTetap?: string // kunci ke satu golongan (mis. '1.3.6' KDP) — dropdown golongan disembunyikan
  detail?: boolean       // picked → grid label lengkap (Kode/Objek/…/Masa Manfaat/Kapitalisasi)
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
    // Grid label lengkap (spt panel Pengadaan) — hanya kalau prop `detail`.
    if (detail) {
      return (
        <div className="bg-white border border-teal/30 rounded-lg p-3">
          <div className="grid grid-cols-[150px_1fr] gap-y-1 text-xs">
            <span className="text-gray-500">Kode</span><span className="font-medium text-gray-700">{picked.kode}</span>
            <span className="text-gray-500">Objek</span><span className="font-medium text-gray-700">{picked.nama_objek || '-'}</span>
            <span className="text-gray-500">Rincian Objek</span><span className="font-medium text-gray-700">{picked.nama_rincian || '-'}</span>
            <span className="text-gray-500">Sub Rincian Objek</span><span className="font-medium text-gray-700">{picked.nama_sub_rincian || '-'}</span>
            <span className="text-gray-500">Uraian Barang</span><span className="font-medium text-gray-700">{picked.uraian || '-'}</span>
            <span className="text-gray-500">Masa Manfaat</span><span className="font-medium text-gray-700">{picked.masa_manfaat_tahun != null ? `${picked.masa_manfaat_tahun} tahun` : '-'}</span>
            <span className="text-gray-500">Nilai Kapitalisasi</span><span className="font-medium text-gray-700">{formatRupiah(picked.batas_kapitalisasi)}</span>
          </div>
          <button type="button" onClick={() => onPick(null)} className="mt-2 text-xs text-gray-500 hover:text-gray-700">Ganti</button>
        </div>
      )
    }
    return (
      <div className="flex items-center justify-between gap-3 rounded-lg border border-teal/30 bg-teal/5 px-3 py-2">
        <div className="min-w-0">
          <p className="text-xs text-gray-800 font-medium truncate">{picked.kode} — {picked.uraian || '-'}</p>
          <p className="text-[11px] text-gray-500 truncate">
            {[picked.nama_objek, picked.nama_rincian, picked.nama_sub_rincian].filter(Boolean).join(' › ') || '—'}
          </p>
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
            <label className="block text-xs text-gray-500 mb-1">Jenis BMD</label>
            <select className="select-filter" value={golongan} onChange={e => setGolongan(e.target.value)}>
              <option value="">— pilih —</option>
              {GOLONGAN.map(g => <option key={g.kode} value={g.kode}>{g.kode} — {g.uraian}</option>)}
            </select>
          </div>
        )}
        <div className="flex-1 min-w-[180px]">
          <label className="block text-xs text-gray-500 mb-1">Cari kode / nama baku (opsional)</label>
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
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
