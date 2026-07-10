'use client'
// Admin > Kodefikasi BMD — VIEW ONLY. Ini kebijakan akuntansi baku (Permendagri
// 108/2016), bukan data yang admin lain boleh utak-atik sembarangan — dulu ada
// form edit masa_manfaat_tahun/batas_kapitalisasi di sini, sengaja dicabut
// (keputusan user 2026-07-10) supaya nggak ada admin yang nggak sengaja
// ngerusak angka yang jadi basis engine penyusutan.
// Objek/Rincian Objek/Sub Rincian Objek ditampilkan pakai NAMA (nama_objek/
// nama_rincian/nama_sub_rincian, migrasi 20260710_16), bukan kode mentahnya —
// jadi bukan lagi font-mono spt kolom Kode (yg masih kode asli).
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import FormShell from '@/components/pengelolaan/FormShell'
import { GOLONGAN_REKAP } from '@/lib/bmd'
import { formatRupiah } from '@/lib/export'

type Kodefikasi = {
  kode: string
  uraian: string | null
  nama_objek: string | null
  nama_rincian: string | null
  nama_sub_rincian: string | null
  masa_manfaat_tahun: number | null
  batas_kapitalisasi: number | null
}

// Persediaan (1.1.7) + 8 golongan aset tetap resmi (Permendagri 108/2016).
const GOLONGAN_KODEFIKASI: { kode: string; uraian: string }[] = [
  { kode: '1.1.7', uraian: 'Persediaan' },
  ...GOLONGAN_REKAP.map(g => ({ kode: g.kode, uraian: g.uraian })),
]

const KOLOM = 'kode,uraian,nama_objek,nama_rincian,nama_sub_rincian,masa_manfaat_tahun,batas_kapitalisasi'
const MAX_HASIL = 500

export default function AdminKodefikasiPage() {
  const supabase = createClient()
  const [jenisFilter, setJenisFilter] = useState('ALL') // 'ALL' = 9 golongan resmi; atau kode_jenis spesifik
  const [search, setSearch] = useState('')
  const [rows, setRows] = useState<Kodefikasi[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')

  async function tampilkan() {
    setLoading(true); setMsg('')
    let q = supabase.from('admin_kodefikasi_bmd').select(KOLOM)
    if (jenisFilter === 'ALL') q = q.in('kode_jenis', GOLONGAN_KODEFIKASI.map(g => g.kode))
    else q = q.eq('kode_jenis', jenisFilter)
    if (search.trim()) q = q.or(`kode.ilike.%${search.trim()}%,uraian.ilike.%${search.trim()}%`)
    const { data, error } = await q.order('kode').limit(MAX_HASIL)
    if (error) { setMsg(`Error: ${error.message}`); setLoading(false); return }
    setRows((data as Kodefikasi[]) || [])
    setLoading(false)
  }

  return (
    <FormShell judul="Kodefikasi BMD" deskripsi="Kategori aset & masa manfaat baku (Permendagri 108/2016) — view only, dasar perhitungan engine penyusutan" msg={msg}>
      <div className="card p-5 mb-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Jenis Aset</label>
            <select className="select-filter" value={jenisFilter} onChange={e => setJenisFilter(e.target.value)}>
              <option value="ALL">— Semua (9 golongan resmi) —</option>
              {GOLONGAN_KODEFIKASI.map(g => <option key={g.kode} value={g.kode}>{g.kode} — {g.uraian}</option>)}
            </select>
          </div>
          <div className="flex-1 min-w-[220px]">
            <label className="block text-xs text-gray-500 mb-1">Cari kode / uraian</label>
            <input className="select-filter w-full" value={search} onChange={e => setSearch(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') tampilkan() }} />
          </div>
          <button className="btn-primary" onClick={tampilkan} disabled={loading}>{loading ? 'Memuat...' : 'Tampilkan'}</button>
        </div>
      </div>

      {rows === null ? (
        <div className="card p-12 text-center text-gray-400 text-sm">
          Atur filter lalu klik <span className="font-medium text-gray-600">Tampilkan</span>.
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="table-th">Kode</th>
                  <th className="table-th">Objek</th>
                  <th className="table-th">Rincian Objek</th>
                  <th className="table-th">Sub Rincian Objek</th>
                  <th className="table-th">Uraian Barang</th>
                  <th className="table-th">Masa Manfaat (th)</th>
                  <th className="table-th">Nilai Kapitalisasi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {rows.length === 0 ? (
                  <tr><td colSpan={7} className="table-td text-center py-8 text-gray-400">Tidak ada hasil.</td></tr>
                ) : rows.map(row => (
                  <tr key={row.kode}>
                    <td className="table-td text-xs font-mono">{row.kode}</td>
                    <td className="table-td text-xs text-gray-600">{row.nama_objek || '-'}</td>
                    <td className="table-td text-xs text-gray-600">{row.nama_rincian || '-'}</td>
                    <td className="table-td text-xs text-gray-600">{row.nama_sub_rincian || '-'}</td>
                    <td className="table-td text-xs text-gray-800 max-w-xs truncate" title={row.uraian || ''}>{row.uraian || '-'}</td>
                    <td className="table-td text-xs text-gray-600">{row.masa_manfaat_tahun ?? '-'}</td>
                    <td className="table-td text-xs text-gray-600">{formatRupiah(row.batas_kapitalisasi)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.length === MAX_HASIL && (
            <p className="text-xs text-gray-400 px-4 py-2 border-t border-gray-100">
              Dibatasi {MAX_HASIL} hasil pertama — persempit filter/pencarian buat lihat sisanya.
            </p>
          )}
        </div>
      )}
    </FormShell>
  )
}
