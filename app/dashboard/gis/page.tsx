'use client'
// GIS BMD — peta Tanah (golongan 1.3.1 SAJA), gantiin link eksternal lama (yg
// nembak database aset_tanah terpisah, bikin dual-entry). WHITELIST 1.3.1: dulu
// sempat ikut narik 1.3.4 (Jalan/Jaringan/Irigasi), tapi begitu data JIJ
// diimport lengkap (migrasi 20260713_02) isinya banyak yg bukan bidang lahan
// (drainase, jaringan komputer, SIMDA online) & nyampah di peta — keputusan
// user 2026-07-15: GIS khusus TANAH. Filter whitelist (bukan blacklist) ini
// sekaligus jamin import golongan lain ke depan (1.3.2/1.3.5/1.5.4) TIDAK ikut
// nyangkut. Tanah tetap bisa punya dokumen kepemilikan + banyak bidang/
// sertifikat per register (TEMPLATE_TANAH di lib/asetFields.ts). Data langsung
// dari `aset` + tabel anak aset_bidang_tanah (1 NIBAR bisa banyak bidang). Edit
// field spesifikasi umum (nama/dll) tetap lewat menu Koreksi Spesifikasi —
// halaman ini KHUSUS kelola bidang + identitas dokumen kepemilikan per bidang +
// lihat peta, bukan duplikat alur ledger.
//
// Layout full-frame (keputusan user 2026-07-10, terinspirasi app GIS BMD lama
// yg terpisah): peta ngisi penuh `<main>`, panel kiri (filter+list+statistik)
// & kanan (detail register terpilih) OVERLAY mengambang di atas peta — bukan
// grid kolom biasa. Semua data dimuat SEKALI saat mount (paginated, tanpa
// cap), filter SKPD & pencarian selanjutnya INSTAN di client (gak nge-query
// ulang) — dataset tanah ~2700-an, masih murah buat filter di memori.
//
// SENGAJA TANPA marker clustering: titik disebar apa adanya, bukan
// dikelompokkan jadi bubble angka — lihat components/gis/GisMap.tsx.
import { useEffect, useState, useMemo } from 'react'
import dynamic from 'next/dynamic'
import { createClient } from '@/lib/supabase/client'
import { formatRupiah } from '@/lib/export'
import KelolaBidangPanel from '@/components/gis/KelolaBidangPanel'
import SkpdCombobox from '@/components/SkpdCombobox'
import type { GisMarker } from '@/components/gis/GisMap'

const GisMap = dynamic(() => import('@/components/gis/GisMap'), {
  ssr: false, loading: () => <div className="absolute inset-0 bg-gray-100 animate-pulse" />,
})

type AsetRow = {
  id: string; nibar: string | null; kode: string; nama_barang: string | null; uraian_barang: string | null
  spesifikasi_lainnya: string | null; jenis_hak: string | null; nomor_dokumen_kepemilikan: string | null
  nama_dokumen_kepemilikan: string | null; tanggal_dokumen_kepemilikan: string | null
  tgl_perolehan: string | null; nilai_perolehan: number; luas: number | null
  latitude: number | null; longitude: number | null
  skpd_id: number | null; skpd: { nama: string } | null
}
type BidangRingkas = { aset_id: string; jenis_hak: string | null; nomor_dokumen_kepemilikan: string | null; latitude: number | null; longitude: number | null }
type Status = 'sengketa' | 'proses' | 'bersertifikat'

const SELECT_COLS = 'id,nibar,kode,nama_barang,uraian_barang,spesifikasi_lainnya,jenis_hak,nomor_dokumen_kepemilikan,nama_dokumen_kepemilikan,tanggal_dokumen_kepemilikan,tgl_perolehan,nilai_perolehan,luas,latitude,longitude,skpd_id,skpd:skpd_id(nama)'
const fmtTgl = (s: string | null) => s ? new Date(s).toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '-'
const fmtLuas = (v: number | null) => v == null ? '-' : `${new Intl.NumberFormat('id-ID').format(v)} m²`

const STATUS_BADGE: Record<Status, { label: string; cls: string; dot: string }> = {
  sengketa: { label: 'Sengketa', cls: 'bg-rose-50 text-rose-700', dot: 'bg-rose-600' },
  proses: { label: 'Proses', cls: 'bg-amber-50 text-amber-700', dot: 'bg-amber-500' },
  bersertifikat: { label: 'Bersertifikat', cls: 'bg-teal/10 text-teal', dot: 'bg-teal' },
}

export default function GisPage() {
  const supabase = createClient()
  const [skpdSel, setSkpdSel] = useState<{ skpdId: number | null; descendantIds: number[] | null }>({ skpdId: null, descendantIds: null })
  const [search, setSearch] = useState('')
  const [rows, setRows] = useState<AsetRow[]>([])
  const [bidangByAset, setBidangByAset] = useState<Record<string, BidangRingkas[]>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  useEffect(() => {
    ;(async () => {
      setLoading(true)
      // Scope SKPD operator utk mempercepat query (bukan gerbang keamanan — RLS
      // tetap penjaga akhir). Non-admin → array skpd_id subtree; disuntik
      // .in('skpd_id', ...) supaya planner pakai idx_aset_skpd. Tanpa ini,
      // `kode LIKE '1.3.1.%'` tak bisa jadi index-cond di bawah RLS (operator
      // ~~ tak leakproof) → Seq Scan 400rb+ baris → statement timeout (500) buat
      // pengurus_barang. Admin → null → tanpa filter (lihat se-kabupaten).
      // `error` RPC ini WAJIB dibaca: kalau fn_my_skpd_scope gagal (mis. belum
      // ter-deploy di DB), `scope` cuma null → `.in('skpd_id', ...)` di bawah
      // TIDAK tersuntik → query jalan TANPA filter → Seq Scan → timeout, dan
      // penyebab aslinya tak kelihatan sama sekali. Lebih baik berhenti di sini
      // dengan pesan jelas daripada menembak query yang pasti timeout.
      const { data: scope, error: scopeErr } = await supabase.rpc('fn_my_skpd_scope')
      if (scopeErr) {
        setError(`Gagal membaca scope SKPD (fn_my_skpd_scope): ${scopeErr.message}`)
        setLoading(false)
        return
      }
      const all: AsetRow[] = []
      for (let from = 0; ; from += 1000) {
        // `error` WAJIB dibaca. Sebelumnya tidak: kalau query gagal (mis. RLS
        // `aset` berat → statement timeout → 500), `data` cuma null dan panel
        // diam² bilang "Tidak ada aset ditemukan" seolah tanahnya memang tidak
        // ada — bikin salah sangka datanya hilang, padahal query yang gagal.
        let q = supabase.from('aset')
          .select(SELECT_COLS)
          .like('kode', '1.3.1.%')
          .eq('status', 'aktif')
        if (Array.isArray(scope) && scope.length) q = q.in('skpd_id', scope)
        const { data, error } = await q.order('nama_barang', { ascending: true }).range(from, from + 999)
        if (error) { setError(error.message); break }
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

      const c = new URLSearchParams(window.location.search).get('cari')
      if (c) setSearch(c)
      setLoading(false)
    })()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function statusOf(r: AsetRow): Status {
    const bidangList = bidangByAset[r.id] || []
    if (r.jenis_hak === 'Sengketa' || bidangList.some(b => b.jenis_hak === 'Sengketa')) return 'sengketa'
    if (r.nomor_dokumen_kepemilikan || bidangList.some(b => b.nomor_dokumen_kepemilikan)) return 'bersertifikat'
    return 'proses'
  }

  // Filter INSTAN di client (SKPD + cari) — dataset sudah dimuat sekali di atas.
  const filtered = useMemo(() => {
    const scope = skpdSel.descendantIds ? new Set(skpdSel.descendantIds) : null
    const q = search.trim().toLowerCase()
    return rows.filter(r => {
      if (scope && !(r.skpd_id != null && scope.has(r.skpd_id))) return false
      if (q && !(r.nama_barang?.toLowerCase().includes(q) || r.nibar?.toLowerCase().includes(q) || r.kode.toLowerCase().includes(q))) return false
      return true
    })
  }, [rows, skpdSel, search])

  // Auto-pilih kalau hasil pencarian (mis. dari deep-link) tepat 1 aset.
  useEffect(() => {
    if (!loading && !selectedId && filtered.length === 1) setSelectedId(filtered[0].id)
  }, [loading, filtered, selectedId])

  const selected = rows.find(r => r.id === selectedId) || null

  // Titik lokasi ada di 2 sumber independen (aset.latitude/longitude — dari
  // import awal — DAN aset_bidang_tanah.latitude/longitude per bidang), yang
  // nggak saling sinkron krn KelolaBidangPanel cuma nulis ke aset_bidang_tanah
  // (aset TIDAK pernah ikut ke-update — lihat komponen itu). Begitu 1 aset
  // sudah py minimal 1 bidang berkoordinat, bidang itu JADI SATU-SATUNYA
  // sumber titik (dianggap lebih presisi/terkini) — titik umum aset di-skip,
  // supaya nggak dobel utk lokasi yg sama (keputusan user 2026-07-10).
  const markers = useMemo<GisMarker[]>(() => {
    const out: GisMarker[] = []
    for (const r of filtered) {
      const bidangList = bidangByAset[r.id] || []
      const bidangBerkoordinat = bidangList.filter(b => b.latitude != null && b.longitude != null)
      if (bidangBerkoordinat.length > 0) {
        for (const b of bidangBerkoordinat) {
          const bColor: GisMarker['color'] = b.jenis_hak === 'Sengketa' ? 'red' : b.nomor_dokumen_kepemilikan ? 'teal' : 'amber'
          out.push({ id: r.id, lat: b.latitude!, lng: b.longitude!, color: bColor, title: r.nama_barang || '-', sub: `${r.nibar || '-'} (bidang)`, active: r.id === selectedId })
        }
      } else if (r.latitude != null && r.longitude != null) {
        const st = statusOf(r)
        const color: GisMarker['color'] = st === 'sengketa' ? 'red' : st === 'bersertifikat' ? 'teal' : 'amber'
        out.push({ id: r.id, lat: r.latitude, lng: r.longitude, color, title: r.nama_barang || '-', sub: r.nibar || '-', active: r.id === selectedId })
      }
    }
    return out
  }, [filtered, bidangByAset, selectedId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Statistik ikut set yang lagi difilter — kartu keterangan pojok kiri bawah.
  const stats = useMemo(() => {
    let luas = 0, nilai = 0, bersertifikat = 0, proses = 0, sengketa = 0
    for (const r of filtered) {
      luas += r.luas || 0
      nilai += r.nilai_perolehan || 0
      const st = statusOf(r)
      if (st === 'bersertifikat') bersertifikat++
      else if (st === 'sengketa') sengketa++
      else proses++
    }
    const total = filtered.length
    const persen = total > 0 ? Math.round((bersertifikat / total) * 100) : 0
    return { total, luas, nilai, bersertifikat, proses, sengketa, persen }
  }, [filtered, bidangByAset]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="relative h-full w-full overflow-hidden">
      <div className="absolute inset-0">
        {loading ? (
          <div className="h-full w-full bg-gray-100 animate-pulse flex items-center justify-center text-sm text-gray-400">Memuat peta...</div>
        ) : (
          <GisMap markers={markers} onSelect={setSelectedId} />
        )}
      </div>

      {/* Panel kiri: filter + list register (card) + statistik — mengambang di atas peta */}
      <div className="absolute top-4 left-4 bottom-4 w-[340px] z-[1000] flex flex-col gap-3 pointer-events-none">
        <div className="card p-3 shadow-lg pointer-events-auto">
          <p className="text-sm font-semibold text-gray-800 mb-2">GIS Tanah</p>
          <input className="select-filter w-full text-sm mb-2" placeholder="Cari nama / NIBAR / kode..."
            value={search} onChange={e => setSearch(e.target.value)} />
          <SkpdCombobox lockToOperator onChangeSelection={sel => setSkpdSel({ skpdId: sel.skpdId, descendantIds: sel.descendantIds })} allowClear
            placeholder="Semua SKPD..." />
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-hide pointer-events-auto space-y-2 pr-0.5">
          {loading ? (
            <p className="text-xs text-gray-400 text-center py-8 bg-white/90 rounded-lg">Memuat...</p>
          ) : error ? (
            <div className="text-center py-6 px-3 bg-white/95 rounded-lg">
              <p className="text-xs font-medium text-rose-700">Gagal memuat data tanah.</p>
              <p className="text-[10px] text-gray-500 mt-1 break-words">{error}</p>
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-8 bg-white/90 rounded-lg">Tidak ada aset ditemukan.</p>
          ) : filtered.map(r => {
            const st = statusOf(r)
            const badge = STATUS_BADGE[st]
            return (
              <button key={r.id} onClick={() => setSelectedId(r.id)}
                className={`card w-full text-left px-3 py-2.5 text-xs shadow-sm hover:shadow-md transition-shadow ${selectedId === r.id ? 'ring-2 ring-teal' : ''}`}>
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium text-gray-800 truncate">{r.nama_barang || '-'}</p>
                  <span className={`flex-shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium ${badge.cls}`}>{badge.label}</span>
                </div>
                <p className="text-gray-400 mt-0.5 truncate">{r.skpd?.nama || '-'}</p>
                {/* Luas dihilangkan dari kartu (keputusan user 2026-08-05) —
                    lihat catatan di panel kanan. */}
                <div className="flex items-center gap-3 mt-1 text-gray-500">
                  <span>{formatRupiah(r.nilai_perolehan)}</span>
                  {r.latitude == null && <span className="text-gray-300">Blm titik</span>}
                </div>
              </button>
            )
          })}
        </div>

        <div className="card p-3 shadow-lg pointer-events-auto text-xs space-y-1">
          <div className="flex justify-between"><span className="text-gray-400">Total register</span><span className="font-semibold text-gray-800">{stats.total.toLocaleString('id-ID')}</span></div>
          <div className="flex justify-between"><span className="text-gray-400">Luas total</span><span className="font-semibold text-gray-800">{fmtLuas(stats.luas)}</span></div>
          <div className="flex justify-between"><span className="text-gray-400">Nilai total</span><span className="font-semibold text-gray-800">{formatRupiah(stats.nilai)}</span></div>
          <div className="flex justify-between"><span className="text-gray-400">Bersertifikat</span><span className="font-semibold text-teal">{stats.bersertifikat.toLocaleString('id-ID')} ({stats.persen}%)</span></div>
          <div className="flex justify-between"><span className="text-gray-400">Proses</span><span className="font-semibold text-amber-600">{stats.proses.toLocaleString('id-ID')}</span></div>
          <div className="flex justify-between"><span className="text-gray-400">Sengketa</span><span className="font-semibold text-rose-600">{stats.sengketa.toLocaleString('id-ID')}</span></div>
        </div>
      </div>

      {/* Panel kanan: identitas + kelola bidang register terpilih — mengambang di atas peta */}
      {selected && (
        <div className="absolute top-4 right-4 bottom-4 w-[380px] z-[1000] overflow-y-auto scrollbar-thin space-y-3">
          <div className="card p-4 shadow-lg">
            <div className="flex items-start justify-between mb-3">
              <div>
                <h3 className="text-sm font-semibold text-gray-800">{selected.nama_barang || '-'}</h3>
                <span className={`inline-block mt-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${STATUS_BADGE[statusOf(selected)].cls}`}>
                  {STATUS_BADGE[statusOf(selected)].label}
                </span>
              </div>
              <button onClick={() => setSelectedId(null)} className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
            </div>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between gap-3"><span className="text-gray-400">SKPD</span><span className="text-gray-700 text-right">{selected.skpd?.nama || '-'}</span></div>
              <div className="flex justify-between gap-3"><span className="text-gray-400">Kode Barang</span><span className="text-gray-700 text-right">{selected.kode}</span></div>
              <div className="flex justify-between gap-3"><span className="text-gray-400">NIBAR</span><span className="text-gray-700 text-right break-all">{selected.nibar || '-'}</span></div>
              <div className="flex justify-between gap-3"><span className="text-gray-400 flex-shrink-0">Uraian Barang</span><span className="text-gray-700 text-right">{selected.uraian_barang || '-'}</span></div>
              <div className="flex justify-between gap-3"><span className="text-gray-400 flex-shrink-0">Spesifikasi Nama Barang</span><span className="text-gray-700 text-right">{selected.spesifikasi_lainnya || '-'}</span></div>
              {/* Luas SENGAJA tidak ditampilkan di sini (keputusan user 2026-08-05).
                  `aset.luas` level register belum jelas hubungannya dengan Σ luas
                  bidang di aset_bidang_tanah — dua sumber untuk satu besaran, dan
                  yang otoritatif belum diputuskan. Luas per bidang + totalnya ada
                  di panel Dokumen Kepemilikan di bawah, yang sumbernya tunggal.
                  Rencana penyatuannya: REFACTOR-PLAN.md §5. */}
              <div className="flex justify-between gap-3"><span className="text-gray-400">Tanggal Perolehan</span><span className="text-gray-700 text-right">{fmtTgl(selected.tgl_perolehan)}</span></div>
              <div className="flex justify-between gap-3"><span className="text-gray-400">Nilai Perolehan</span><span className="text-gray-700 text-right">{formatRupiah(selected.nilai_perolehan)}</span></div>
            </div>
          </div>
          <KelolaBidangPanel asetId={selected.id}
            asetDokumen={{ jenis_hak: selected.jenis_hak, nomor_dokumen_kepemilikan: selected.nomor_dokumen_kepemilikan, nama_dokumen_kepemilikan: selected.nama_dokumen_kepemilikan, tanggal_dokumen_kepemilikan: selected.tanggal_dokumen_kepemilikan }}
            onChanged={() => {
              supabase.from('aset_bidang_tanah').select('aset_id,jenis_hak,nomor_dokumen_kepemilikan,latitude,longitude').eq('aset_id', selected.id)
                .then(({ data }) => setBidangByAset(prev => ({ ...prev, [selected.id]: (data as BidangRingkas[]) || [] })))
              // Kelola Bidang ikut sinkron sebagian kolom aset (identitas dokumen +
              // NULL-kan titik aset kalau bidang py titik sendiri) — refresh baris
              // aset ini juga biar panel kanan & peta nggak nampilin data basi.
              supabase.from('aset').select(SELECT_COLS).eq('id', selected.id).single()
                .then(({ data }) => { if (data) setRows(prev => prev.map(r => (r.id === selected.id ? (data as unknown as AsetRow) : r))) })
            }} />
        </div>
      )}
    </div>
  )
}
