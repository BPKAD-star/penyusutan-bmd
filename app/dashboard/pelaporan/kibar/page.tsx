'use client'
// Pelaporan > KIBAR — cari barang (SKPD → Jenis BMD → Tampilkan, pola sama
// Rekapitulasi), buka KIBAR (riwayat lengkap 1 barang, halaman publik
// /kibar/[nibar]), atau centang beberapa lalu cetak label QR sekaligus
// (LabelSheet: QR kiri, 4 baris kanan — SKPD, Spesifikasi Nama Barang, NIBAR,
// Tanggal Perolehan).
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { GOLONGAN_DAFTAR_BARANG, kodeLevel3 } from '@/lib/bmd'
import { formatRupiah } from '@/lib/export'
import SkpdCombobox from '@/components/SkpdCombobox'
import LabelSheet, { LabelItem } from '@/components/kibar/LabelSheet'

const PAGE_SIZE = 100

type Row = {
  id: string
  nibar: string | null
  kode: string
  nama_barang: string | null
  uraian_barang: string | null
  merek_tipe: string | null
  tgl_perolehan: string | null
  nilai_perolehan: number
  skpd_id: number | null
}

const fmtTgl = (s: string | null) => s
  ? new Date(s).toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' })
  : '-'

export default function KibarSearchPage() {
  const supabase = createClient()
  const [skpdSel, setSkpdSel] = useState<{ skpdId: number | null; descendantIds: number[] | null }>({ skpdId: null, descendantIds: null })
  const [golongan, setGolongan] = useState('')
  const [golonganLabels, setGolonganLabels] = useState<Record<string, string>>({})
  const [search, setSearch] = useState('')
  const [skpdMap, setSkpdMap] = useState<Record<number, string>>({})
  const [rows, setRows] = useState<Row[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [printOpen, setPrintOpen] = useState(false)

  useEffect(() => {
    (async () => {
      const map: Record<number, string> = {}
      for (let from = 0; ; from += 1000) {
        const { data } = await supabase.from('admin_skpd').select('id,nama').range(from, from + 999)
        if (!data || data.length === 0) break
        for (const s of data as { id: number; nama: string }[]) map[s.id] = s.nama
        if (data.length < 1000) break
      }
      setSkpdMap(map)
    })()
    ;(async () => {
      const { data: jenis } = await supabase.from('admin_jenis_aset').select('id,nama')
      const namaById = new Map((jenis || []).map(j => [j.id, j.nama]))
      const labels: Record<string, string> = {}
      await Promise.all(GOLONGAN_DAFTAR_BARANG.map(async prefix => {
        const { data } = await supabase.from('admin_kodefikasi_bmd')
          .select('jenis_aset_id').eq('kode_jenis', prefix).not('jenis_aset_id', 'is', null).limit(1)
        const id = data?.[0]?.jenis_aset_id
        labels[prefix] = (id != null && namaById.get(id)) || prefix
      }))
      setGolonganLabels(labels)
    })()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function tampilkan() {
    setLoading(true)
    setSelected(new Set())
    let q = supabase.from('aset')
      .select('id,nibar,kode,nama_barang,uraian_barang,merek_tipe,tgl_perolehan,nilai_perolehan,skpd_id')
      .eq('status', 'aktif')
      .order('nama_barang', { ascending: true })
      .limit(PAGE_SIZE)
    if (skpdSel.descendantIds && skpdSel.descendantIds.length > 0) q = q.in('skpd_id', skpdSel.descendantIds)
    if (golongan) q = q.like('kode', `${golongan}.%`)
    if (search.trim()) q = q.or(`nama_barang.ilike.%${search}%,nibar.ilike.%${search}%,kode.ilike.${search}%`)
    const { data } = await q
    setRows((data as Row[]) || [])
    setLoading(false)
  }

  function toggle(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }
  function toggleAll() {
    setSelected(prev => prev.size === (rows?.length || 0) ? new Set() : new Set((rows || []).map(r => r.id)))
  }

  const labelItems: LabelItem[] = (rows || [])
    .filter(r => selected.has(r.id))
    .map(r => ({
      nibar: r.nibar || '-',
      namaBarang: r.nama_barang || r.uraian_barang || '-',
      skpdNama: skpdMap[r.skpd_id ?? -1] || '-',
      tglPerolehan: r.tgl_perolehan,
    }))

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">KIBAR</h1>
        <p className="text-gray-500 text-sm mt-1">Cari barang, buka Kartu Inventaris Barang (riwayat lengkap), atau cetak label QR sekaligus.</p>
      </div>

      <div className="card p-5 mb-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[220px]">
            <label className="block text-xs text-gray-500 mb-1">SKPD / Lokasi</label>
            <SkpdCombobox onChangeSelection={sel => setSkpdSel({ skpdId: sel.skpdId, descendantIds: sel.descendantIds })} allowClear
              placeholder="Semua SKPD — atau ketik SKPD / Sub OPD / Lokasi..." />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Jenis BMD</label>
            <select className="select-filter" value={golongan} onChange={e => setGolongan(e.target.value)}>
              <option value="">Semua Jenis Aset</option>
              {GOLONGAN_DAFTAR_BARANG.map(g => <option key={g} value={g}>{g} — {golonganLabels[g] || '...'}</option>)}
            </select>
          </div>
          <div className="flex-1 min-w-[180px]">
            <label className="block text-xs text-gray-500 mb-1">Cari (opsional)</label>
            <input className="select-filter w-full" placeholder="Nama barang / NIBAR / kode..."
              value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && tampilkan()} />
          </div>
          <button className="btn-primary text-sm" onClick={tampilkan} disabled={loading}>{loading ? 'Memuat...' : 'Tampilkan'}</button>
        </div>
      </div>

      {rows === null ? (
        <div className="card p-12 text-center text-gray-400 text-sm">
          Atur filter lalu klik <span className="font-medium text-gray-600">Tampilkan</span>.
        </div>
      ) : (
        <div className="card">
          <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
            <p className="text-sm text-gray-600">{rows.length} barang{rows.length === PAGE_SIZE ? ' (dibatasi 100, persempit pencarian utk lihat sisanya)' : ''}</p>
            <button className="btn-primary text-sm" disabled={selected.size === 0} onClick={() => setPrintOpen(true)}>
              Cetak Label ({selected.size} dipilih)
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="table-th w-8"><input type="checkbox" checked={rows.length > 0 && selected.size === rows.length} onChange={toggleAll} /></th>
                  <th className="table-th">NIBAR</th>
                  <th className="table-th">Jenis Aset</th>
                  <th className="table-th">Uraian Barang</th>
                  <th className="table-th">Nama Barang</th>
                  <th className="table-th">Merek/Tipe</th>
                  <th className="table-th">Tgl Perolehan</th>
                  <th className="table-th text-right">Nilai Perolehan</th>
                  <th className="table-th text-center">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {rows.map(r => (
                  <tr key={r.id}>
                    <td className="table-td"><input type="checkbox" checked={selected.has(r.id)} onChange={() => toggle(r.id)} /></td>
                    <td className="table-td text-xs font-mono">{r.nibar || '-'}</td>
                    <td className="table-td text-xs">{golonganLabels[kodeLevel3(r.kode)] || kodeLevel3(r.kode)}</td>
                    <td className="table-td text-xs">{r.uraian_barang || '-'}</td>
                    <td className="table-td text-xs">{r.nama_barang || '-'}</td>
                    <td className="table-td text-xs">{r.merek_tipe || '-'}</td>
                    <td className="table-td text-xs">{fmtTgl(r.tgl_perolehan)}</td>
                    <td className="table-td text-xs text-right">{formatRupiah(r.nilai_perolehan)}</td>
                    <td className="table-td text-center">
                      {r.nibar && (
                        <a href={`/kibar/${r.nibar}`} target="_blank" rel="noopener noreferrer" className="text-teal text-xs hover:underline">
                          Lihat KIBAR
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr><td colSpan={9} className="table-td text-center text-gray-400 py-8">Tidak ada barang ditemukan.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {printOpen && <LabelSheet items={labelItems} onClose={() => setPrintOpen(false)} />}
    </div>
  )
}
