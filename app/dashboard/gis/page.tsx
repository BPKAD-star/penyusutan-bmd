'use client'
// GIS BMD — peta Tanah internal, gantiin link eksternal lama (yg nembak
// database aset_tanah terpisah, bikin dual-entry). Data langsung dari `aset`
// (golongan 1.3.1) + tabel anak aset_bidang_tanah (banyak bidang/sertifikat
// per 1 NIBAR). Edit field Tanah aset (nama/alamat/dll) tetap lewat menu
// Koreksi Spesifikasi yang sudah ada — halaman ini KHUSUS kelola bidang +
// lihat peta, bukan duplikat alur ledger.
import { useEffect, useState, useCallback, useMemo } from 'react'
import dynamic from 'next/dynamic'
import { createClient } from '@/lib/supabase/client'
import KelolaBidangPanel from '@/components/gis/KelolaBidangPanel'
import type { GisMarker } from '@/components/gis/GisMap'

const GisMap = dynamic(() => import('@/components/gis/GisMap'), {
  ssr: false, loading: () => <div className="h-[520px] bg-gray-50 rounded-lg animate-pulse" />,
})

type AsetTanah = {
  id: string; nibar: string | null; kode: string; nama_barang: string | null
  jenis_hak: string | null; nomor_dokumen_kepemilikan: string | null
  latitude: number | null; longitude: number | null
  skpd_id: number | null; skpd: { nama: string } | null
}
type BidangRingkas = { aset_id: string; jenis_hak: string | null; nomor_dokumen_kepemilikan: string | null; latitude: number | null; longitude: number | null }

export default function GisPage() {
  const supabase = createClient()
  const [search, setSearch] = useState('')
  const [rows, setRows] = useState<AsetTanah[]>([])
  const [bidangByAset, setBidangByAset] = useState<Record<string, BidangRingkas[]>>({})
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    let q = supabase.from('aset')
      .select('id,nibar,kode,nama_barang,jenis_hak,nomor_dokumen_kepemilikan,latitude,longitude,skpd_id,skpd:skpd_id(nama)')
      .like('kode', '1.3.1.%').eq('status', 'aktif')
      .order('nama_barang', { ascending: true }).limit(1000)
    if (search.trim()) q = q.or(`nama_barang.ilike.%${search}%,nibar.ilike.%${search}%,kode.ilike.${search}%`)
    const { data } = await q
    const asetRows = (data as unknown as AsetTanah[]) || []
    setRows(asetRows)

    const ids = asetRows.map(r => r.id)
    if (ids.length > 0) {
      const { data: bidang } = await supabase.from('aset_bidang_tanah')
        .select('aset_id,jenis_hak,nomor_dokumen_kepemilikan,latitude,longitude').in('aset_id', ids)
      const map: Record<string, BidangRingkas[]> = {}
      for (const b of (bidang as BidangRingkas[]) || []) (map[b.aset_id] ||= []).push(b)
      setBidangByAset(map)
    } else {
      setBidangByAset({})
    }
    setLoading(false)
  }, [search]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() }, [load])

  // Deep-link dari Daftar Barang (badge "🗺 N bidang"): ?cari=<nibar> → prefill
  // pencarian supaya list langsung nyaring ke tanah itu. Baca dari window (bukan
  // useSearchParams) biar gak butuh Suspense boundary. Sekali saja saat mount.
  useEffect(() => {
    const c = new URLSearchParams(window.location.search).get('cari')
    if (c) setSearch(c)
  }, [])

  const selected = rows.find(r => r.id === selectedId) || null

  // Auto-pilih kalau hasil pencarian (mis. dari deep-link) tepat 1 aset.
  useEffect(() => {
    if (!selectedId && rows.length === 1) setSelectedId(rows[0].id)
  }, [rows, selectedId])

  // Warna marker: merah (sengketa) > kuning (ada titik, belum ada sertifikat)
  // > hijau (ada titik + minimal 1 bidang/sertifikat). Tanpa titik = gak dipin.
  const markers = useMemo<GisMarker[]>(() => {
    const out: GisMarker[] = []
    for (const r of rows) {
      const bidangList = bidangByAset[r.id] || []
      const sengketa = r.jenis_hak === 'Sengketa' || bidangList.some(b => b.jenis_hak === 'Sengketa')
      const adaSertifikat = !!r.nomor_dokumen_kepemilikan || bidangList.some(b => b.nomor_dokumen_kepemilikan)
      const color: GisMarker['color'] = sengketa ? 'red' : adaSertifikat ? 'teal' : 'amber'
      if (r.latitude != null && r.longitude != null) {
        out.push({ id: r.id, lat: r.latitude, lng: r.longitude, color, title: r.nama_barang || '-', sub: r.nibar || '-', active: r.id === selectedId })
      }
      for (const b of bidangList) {
        if (b.latitude == null || b.longitude == null) continue
        const bColor: GisMarker['color'] = b.jenis_hak === 'Sengketa' ? 'red' : b.nomor_dokumen_kepemilikan ? 'teal' : 'amber'
        out.push({ id: r.id, lat: b.latitude, lng: b.longitude, color: bColor, title: r.nama_barang || '-', sub: `${r.nibar || '-'} (bidang)`, active: r.id === selectedId })
      }
    }
    return out
  }, [rows, bidangByAset, selectedId])

  const tanpaTitik = rows.filter(r => r.latitude == null && r.longitude == null)

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">GIS BMD</h1>
        <p className="text-gray-500 text-sm mt-1">
          Peta aset Tanah — data langsung dari register BMD (bukan database terpisah).
          Edit spesifikasi (nama/alamat/dll) lewat menu Koreksi Spesifikasi.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-1 space-y-4">
          <div className="card p-4">
            <label className="block text-xs text-gray-500 mb-1">Cari Tanah (nama / NIBAR / kode)</label>
            <input className="select-filter w-full" value={search} onChange={e => setSearch(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') load() }} />
          </div>

          <div className="card overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <span className="text-sm text-gray-500">{rows.length} aset Tanah</span>
              <div className="flex items-center gap-2 text-[11px] text-gray-400">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-rose-600 inline-block" />Sengketa</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />Blm sertifikat</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-teal inline-block" />Lengkap</span>
              </div>
            </div>
            <div className="max-h-[420px] overflow-y-auto divide-y divide-gray-50">
              {loading ? (
                <p className="text-xs text-gray-400 text-center py-8">Memuat...</p>
              ) : rows.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-8">Tidak ada aset Tanah ditemukan.</p>
              ) : rows.map(r => (
                <button key={r.id} onClick={() => setSelectedId(r.id)}
                  className={`w-full text-left px-4 py-2.5 hover:bg-gray-50 text-xs ${selectedId === r.id ? 'bg-teal/5' : ''}`}>
                  <p className="font-medium text-gray-800">{r.nama_barang || '-'}</p>
                  <p className="text-gray-400 mt-0.5">{r.nibar || '-'} · {r.skpd?.nama || '-'}</p>
                  {r.latitude == null && <p className="text-gray-300 mt-0.5">Belum ada titik koordinat</p>}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="lg:col-span-2 space-y-4">
          <GisMap markers={markers} onSelect={setSelectedId} />
          {selected ? (
            <KelolaBidangPanel asetId={selected.id} asetNama={selected.nama_barang || '-'} asetNibar={selected.nibar} onChanged={load} />
          ) : (
            <div className="card p-8 text-center text-gray-400 text-sm">
              Pilih aset Tanah di list atau klik marker di peta untuk kelola bidang &amp; sertifikatnya.
            </div>
          )}
          {tanpaTitik.length > 0 && (
            <p className="text-xs text-gray-400">{tanpaTitik.length} aset Tanah belum punya titik koordinat (tidak muncul di peta) — lengkapi via Koreksi Spesifikasi atau panel Kelola Bidang.</p>
          )}
        </div>
      </div>
    </div>
  )
}
