'use client'
// GIS BMD — peta Tanah + Jalan/Jaringan/Irigasi internal, gantiin link
// eksternal lama (yg nembak database aset_tanah terpisah, bikin dual-entry).
// Golongan 1.3.1 (Tanah) DAN 1.3.4 (Jalan) diikutkan — keduanya bisa punya
// dokumen kepemilikan lahan + banyak bidang/sertifikat per register (lihat
// TEMPLATE_TANAH di lib/asetFields.ts, dipakai kedua golongan itu). Data
// langsung dari `aset` + tabel anak aset_bidang_tanah (1 NIBAR bisa banyak
// bidang). Edit field spesifikasi umum (nama/dll) tetap lewat menu Koreksi
// Spesifikasi — halaman ini KHUSUS kelola bidang + identitas dokumen
// kepemilikan per bidang + lihat peta, bukan duplikat alur ledger.
//
// Filter-first (SKPD + cari, pola sama Daftar Barang): dulu halaman ini load
// semua otomatis begitu dibuka, kena limit(1000) diam-diam. Sekarang gak ada
// apa-apa yang dimuat sampai klik Tampilkan, fetch-nya paginated (tanpa cap).
//
// SENGAJA TANPA marker clustering (keputusan user 2026-07-10): estimasi
// ~4300+ bidang (termasuk jalan) tetap ditampilkan sebagai titik sebar apa
// adanya, bukan dikelompokkan jadi bubble angka — lihat components/gis/GisMap.tsx.
import { useEffect, useState, useCallback, useMemo } from 'react'
import dynamic from 'next/dynamic'
import { createClient } from '@/lib/supabase/client'
import { formatRupiah } from '@/lib/export'
import KelolaBidangPanel from '@/components/gis/KelolaBidangPanel'
import SkpdCombobox from '@/components/SkpdCombobox'
import type { GisMarker } from '@/components/gis/GisMap'

const GisMap = dynamic(() => import('@/components/gis/GisMap'), {
  ssr: false, loading: () => <div className="h-[520px] bg-gray-50 rounded-lg animate-pulse" />,
})

type AsetRow = {
  id: string; nibar: string | null; kode: string; nama_barang: string | null
  spesifikasi_lainnya: string | null; jenis_hak: string | null; nomor_dokumen_kepemilikan: string | null
  tgl_perolehan: string | null; nilai_perolehan: number
  latitude: number | null; longitude: number | null
  skpd_id: number | null; skpd: { nama: string } | null
}
type BidangRingkas = { aset_id: string; jenis_hak: string | null; nomor_dokumen_kepemilikan: string | null; latitude: number | null; longitude: number | null }

const SELECT_COLS = 'id,nibar,kode,nama_barang,spesifikasi_lainnya,jenis_hak,nomor_dokumen_kepemilikan,tgl_perolehan,nilai_perolehan,latitude,longitude,skpd_id,skpd:skpd_id(nama)'
const fmtTgl = (s: string | null) => s ? new Date(s).toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '-'

export default function GisPage() {
  const supabase = createClient()
  const [skpdSel, setSkpdSel] = useState<{ skpdId: number | null; descendantIds: number[] | null }>({ skpdId: null, descendantIds: null })
  const [search, setSearch] = useState('')
  const [applied, setApplied] = useState(false)
  const [rows, setRows] = useState<AsetRow[]>([])
  const [bidangByAset, setBidangByAset] = useState<Record<string, BidangRingkas[]>>({})
  const [loading, setLoading] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const load = useCallback(async (opts?: { search?: string; descendantIds?: number[] | null }) => {
    const searchVal = opts?.search ?? search
    const descIds = opts?.descendantIds ?? skpdSel.descendantIds
    setLoading(true)

    const all: AsetRow[] = []
    for (let from = 0; ; from += 1000) {
      let q = supabase.from('aset')
        .select(SELECT_COLS)
        .or('kode.like.1.3.1.%,kode.like.1.3.4.%')
        .eq('status', 'aktif')
        .order('nama_barang', { ascending: true }).range(from, from + 999)
      if (descIds && descIds.length > 0) q = q.in('skpd_id', descIds)
      if (searchVal.trim()) q = q.or(`nama_barang.ilike.%${searchVal}%,nibar.ilike.%${searchVal}%,kode.ilike.${searchVal}%`)
      const { data } = await q
      if (!data || data.length === 0) break
      all.push(...(data as unknown as AsetRow[]))
      if (data.length < 1000) break
    }
    setRows(all)

    const ids = all.map(r => r.id)
    const bidangMap: Record<string, BidangRingkas[]> = {}
    for (let i = 0; i < ids.length; i += 200) {
      const { data: bidang } = await supabase.from('aset_bidang_tanah')
        .select('aset_id,jenis_hak,nomor_dokumen_kepemilikan,latitude,longitude').in('aset_id', ids.slice(i, i + 200))
      for (const b of (bidang as BidangRingkas[]) || []) (bidangMap[b.aset_id] ||= []).push(b)
    }
    setBidangByAset(bidangMap)
    setLoading(false)
  }, [search, skpdSel]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleTampilkan() {
    setApplied(true)
    setSelectedId(null)
    await load()
  }

  // Deep-link dari Daftar Barang (badge "🗺 N bidang"): ?cari=<nibar> → auto
  // filter + langsung tampilkan (gak nunggu klik). Sekali saja saat mount.
  useEffect(() => {
    const c = new URLSearchParams(window.location.search).get('cari')
    if (c) { setSearch(c); setApplied(true); load({ search: c }) }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

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
          Peta aset Tanah &amp; Jalan — data langsung dari register BMD (bukan database terpisah).
          Edit spesifikasi umum (nama/dll) lewat menu Koreksi Spesifikasi.
        </p>
      </div>

      <div className="card p-4 mb-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[220px]">
            <label className="block text-xs text-gray-500 mb-1">SKPD / Lokasi</label>
            <SkpdCombobox onChangeSelection={sel => setSkpdSel({ skpdId: sel.skpdId, descendantIds: sel.descendantIds })} allowClear
              placeholder="Semua SKPD — atau ketik SKPD / Sub OPD / Lokasi..." />
          </div>
          <div className="flex-1 min-w-[220px]">
            <label className="block text-xs text-gray-500 mb-1">Cari (nama / NIBAR / kode)</label>
            <input className="select-filter w-full" value={search} onChange={e => setSearch(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleTampilkan() }} />
          </div>
          <button className="btn-primary text-sm" onClick={handleTampilkan} disabled={loading}>
            {loading ? 'Memuat...' : 'Tampilkan'}
          </button>
        </div>
      </div>

      {!applied ? (
        <div className="card p-12 text-center text-gray-400 text-sm">
          Atur filter (opsional) lalu klik <span className="font-medium text-gray-600">Tampilkan</span>.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-1 space-y-4">
            <div className="card overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                <span className="text-sm text-gray-500">{rows.length} register</span>
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
                  <p className="text-xs text-gray-400 text-center py-8">Tidak ada aset ditemukan.</p>
                ) : rows.map(r => {
                  const nBidang = bidangByAset[r.id]?.length || 0
                  return (
                    <button key={r.id} onClick={() => setSelectedId(r.id)}
                      className={`w-full text-left px-4 py-2.5 hover:bg-gray-50 text-xs ${selectedId === r.id ? 'bg-teal/5' : ''}`}>
                      <p className="font-medium text-gray-800">{r.nama_barang || '-'}</p>
                      <p className="text-gray-400 mt-0.5">{r.nibar || '-'} · {r.skpd?.nama || '-'}</p>
                      <div className="flex items-center gap-2 mt-1">
                        {r.latitude == null && <span className="text-gray-300">Belum ada titik koordinat</span>}
                        {nBidang > 0 && <span className="text-teal">🗺 {nBidang} bidang</span>}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          <div className="lg:col-span-2 space-y-4">
            <GisMap markers={markers} onSelect={setSelectedId} />
            {selected ? (
              <>
                {/* Identitas register — SKPD, kode, NIBAR, nama/spesifikasi, tgl & nilai
                    perolehan. Dokumen kepemilikan per bidang (jenis hak/nomor/tanggal/
                    nama/sertifikat PDF) dikelola di KelolaBidangPanel di bawah. */}
                <div className="card p-4">
                  <h3 className="text-sm font-semibold text-gray-800 mb-3">{selected.nama_barang || '-'}</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                    <div><p className="text-gray-400">SKPD</p><p className="text-gray-700 mt-0.5">{selected.skpd?.nama || '-'}</p></div>
                    <div><p className="text-gray-400">Kode Barang</p><p className="text-gray-700 mt-0.5 font-mono">{selected.kode}</p></div>
                    <div><p className="text-gray-400">NIBAR</p><p className="text-gray-700 mt-0.5 font-mono">{selected.nibar || '-'}</p></div>
                    <div><p className="text-gray-400">Spesifikasi</p><p className="text-gray-700 mt-0.5">{selected.spesifikasi_lainnya || '-'}</p></div>
                    <div><p className="text-gray-400">Tgl Perolehan</p><p className="text-gray-700 mt-0.5">{fmtTgl(selected.tgl_perolehan)}</p></div>
                    <div><p className="text-gray-400">Nilai Perolehan</p><p className="text-gray-700 mt-0.5">{formatRupiah(selected.nilai_perolehan)}</p></div>
                  </div>
                </div>
                <KelolaBidangPanel asetId={selected.id} asetNama={selected.nama_barang || '-'} asetNibar={selected.nibar} onChanged={() => load()} />
              </>
            ) : (
              <div className="card p-8 text-center text-gray-400 text-sm">
                Pilih aset di list atau klik marker di peta untuk lihat identitas & kelola bidang/sertifikatnya.
              </div>
            )}
            {tanpaTitik.length > 0 && (
              <p className="text-xs text-gray-400">{tanpaTitik.length} register belum punya titik koordinat (tidak muncul di peta) — lengkapi via Koreksi Spesifikasi atau panel Kelola Bidang.</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
