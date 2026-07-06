'use client'
// Daftar Barang — alur filter-lalu-tampilkan (mirip e-SIMBADA):
// SKPD → Jenis Aset (WAJIB pilih satu) → Komptabel → Cari → klik Tampilkan.
//
// Kolom menyesuaikan jenis aset (KIB) memakai field yang tersedia di DB:
//   - Tanah (1.3.1): tanpa kolom Komptabel (semua intrakomptabel); + Luas,
//     No/Tgl Sertifikat, Atas Nama Sertifikat, Hak Kepemilikan (diedit lewat
//     menu Koreksi → Spesifikasi, muncul otomatis untuk kode 1.3.1)
//   - Peralatan & Mesin (1.3.2): + Merek/Tipe + Spesifikasi
//   - Gedung / Jalan / ATB: + Spesifikasi
// Catatan: field kendaraan (nopol, no rangka/mesin) belum ada kolom terstruktur
// di DB — sementara pakai Keterangan/Spesifikasi bila terisi.
//
// Tampilan: kalau hasil filter ≤ SHOW_ALL_MAX baris → tampilkan SEMUA (tanpa
// halaman); kalau lebih → pakai halaman biar browser tetap enteng. Baris TOTAL
// selalu menjumlahkan nilai perolehan SELURUH hasil filter. Angka tanpa "Rp".
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import SkpdCombobox from '@/components/SkpdCombobox'
import { exportToExcel } from '@/lib/export'
import { GOLONGAN_DAFTAR_BARANG, comparePeriode, periodeDariTanggal } from '@/lib/bmd'
import { fetchOwnerOverrides, partitionByPeriodOwner } from '@/lib/pengalihan'
import TahunTerkunciNote from '@/components/TahunTerkunciNote'

const PAGE_SIZE = 50
const SHOW_ALL_MAX = 3000 // di bawah ini → render semua baris tanpa halaman

// Event yang menyembunyikan / memunculkan kembali aset (serap/hapus vs batal) —
// sama dgn menu Penyusutan. Dipakai untuk visibilitas period-aware.
const SEMBUNYI = ['kapitalisasi_serap', 'penghapusan_pemindahtanganan', 'penghapusan_sebab_lain', 'batal_pengadaan']
const MUNCUL = ['batal_kapitalisasi', 'batal_penghapusan']

const SELECT_COLS = 'id,nibar,kode,nama_barang,spesifikasi_lainnya,merek_tipe,nilai_perolehan,tgl_perolehan,intra_ekstra,keterangan,status,skpd_id,luas,nomor_dokumen_kepemilikan,tanggal_dokumen_kepemilikan,nama_dokumen_kepemilikan,jenis_hak'

type Row = {
  id: string          // = aset.id → dipakai cocokkan event sembunyi di transaksi_bmd
  nibar: string | null
  kode: string
  nama_barang: string | null
  spesifikasi_lainnya: string | null
  merek_tipe: string | null
  nilai_perolehan: number
  tgl_perolehan: string | null
  intra_ekstra: string | null
  keterangan: string | null
  status: string
  skpd_id: number | null
  luas: number | null
  nomor_dokumen_kepemilikan: string | null
  tanggal_dokumen_kepemilikan: string | null
  nama_dokumen_kepemilikan: string | null
  jenis_hak: string | null
}
// Jejak penghapusan (dari ledger + jurnal_header) — dipakai mode export Audit.
type HapusInfo = { tgl: string | null; no_sk: string | null; jenis: string | null; ket: string | null }

type Applied = { descIds: number[] | null; skpdId: number | null; golongan: string; komptabel: string; search: string; periode: string }

// Angka polos bergaya id-ID tanpa "Rp" (enak di-copas ke Excel).
const angka = (v: number | null | undefined) =>
  v == null ? '-' : new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(v)

// ── Kolom per jenis aset (pakai field yang tersedia) ────────────────────────
const COL_META: Record<string, { header: string; align?: 'right' | 'center' }> = {
  skpd: { header: 'SKPD' }, nama: { header: 'Nama Barang' }, kode: { header: 'Kode Barang' },
  uraian: { header: 'Uraian' }, merek: { header: 'Merek / Tipe' }, spesifikasi: { header: 'Spesifikasi Lainnya' },
  komptabel: { header: 'Komptabel', align: 'center' }, tgl: { header: 'Tgl Perolehan' },
  nilai: { header: 'Nilai Perolehan', align: 'right' }, keterangan: { header: 'Keterangan' },
  luas: { header: 'Luas (m²)', align: 'right' }, no_sertifikat: { header: 'Nomor Dokumen Kepemilikan' },
  tgl_sertifikat: { header: 'Tanggal Dokumen Kepemilikan' }, atas_nama: { header: 'Nama Dokumen Kepemilikan' },
  hak: { header: 'Jenis Hak' },
}
// Urutan: SKPD · Kode · Uraian · Nama · [spesifikasi lainnya] · Tgl · Komptabel · Nilai · Keterangan
const COLS: Record<string, string[]> = {
  '1.3.1': ['skpd', 'kode', 'uraian', 'nama', 'tgl', 'luas', 'hak', 'no_sertifikat', 'tgl_sertifikat', 'atas_nama', 'nilai', 'keterangan'], // Tanah — tanpa komptabel
  '1.3.2': ['skpd', 'kode', 'uraian', 'nama', 'merek', 'spesifikasi', 'tgl', 'komptabel', 'nilai', 'keterangan'],// Peralatan & Mesin
  '1.3.3': ['skpd', 'kode', 'uraian', 'nama', 'spesifikasi', 'tgl', 'komptabel', 'nilai', 'keterangan'],         // Gedung & Bangunan
  '1.3.4': ['skpd', 'kode', 'uraian', 'nama', 'spesifikasi', 'tgl', 'komptabel', 'nilai', 'keterangan'],         // Jalan, Jaringan, Irigasi
  '1.3.5': ['skpd', 'kode', 'uraian', 'nama', 'merek', 'tgl', 'komptabel', 'nilai', 'keterangan'],               // Aset Tetap Lainnya
  '1.3.6': ['skpd', 'kode', 'uraian', 'nama', 'tgl', 'komptabel', 'nilai', 'keterangan'],                        // KDP
  '1.5.3': ['skpd', 'kode', 'uraian', 'nama', 'spesifikasi', 'tgl', 'komptabel', 'nilai', 'keterangan'],         // Aset Tidak Berwujud
  '1.5.4': ['skpd', 'kode', 'uraian', 'nama', 'tgl', 'komptabel', 'nilai', 'keterangan'],                        // Aset Lain-Lain
}
const DEFAULT_COLS = ['skpd', 'kode', 'uraian', 'nama', 'tgl', 'komptabel', 'nilai', 'keterangan']
const colsFor = (golongan: string) => COLS[golongan] || DEFAULT_COLS

// Label jenis penghapusan untuk export Audit.
const HAPUS_LABEL: Record<string, string> = {
  penghapusan_pemindahtanganan: 'Pemindahtanganan',
  penghapusan_sebab_lain: 'Sebab Lain',
}

function thClass(key: string) {
  const a = COL_META[key]?.align
  return `table-th${a === 'right' ? ' text-right' : a === 'center' ? ' text-center' : ''}`
}
function tdClass(key: string) {
  if (key === 'nama') return 'table-td'
  if (key === 'nilai' || key === 'luas') return 'table-td text-right text-xs'
  if (key === 'komptabel') return 'table-td text-center text-xs capitalize'
  return 'table-td text-xs text-gray-600'
}

export default function DaftarBarangPage() {
  const supabase = createClient()

  // ── Nilai filter (belum diterapkan) ──
  const [skpdMap, setSkpdMap] = useState<Record<number, string>>({}) // id→nama semua level (resolve nama SKPD baris)
  const [golonganLabels, setGolonganLabels] = useState<Record<string, string>>({})
  const [fSel, setFSel] = useState<{ skpdId: number | null; descIds: number[] | null }>({ skpdId: null, descIds: null })
  const [fGolongan, setFGolongan] = useState('')
  const [fKomptabel, setFKomptabel] = useState('')
  const [fSearch, setFSearch] = useState('')
  const now = periodeDariTanggal(new Date().toISOString().slice(0, 10))
  const [fTahun, setFTahun] = useState(now.slice(0, 4))
  const [fSmt, setFSmt] = useState(now.slice(-1))

  // ── Filter yang sudah diterapkan (dipakai query) ──
  const [applied, setApplied] = useState<Applied | null>(null)

  const [data, setData] = useState<Row[]>([])          // baris yang tampil (halaman aktif / semua)
  const [allVisible, setAllVisible] = useState<Row[]>([]) // seluruh baris visible di periode (utk paginasi & export)
  const [uraianMap, setUraianMap] = useState<Record<string, string>>({})
  const [ownerOverride, setOwnerOverride] = useState<Map<string, number | null>>(new Map()) // aset_id → SKPD pemilik period-aware
  const [total, setTotal] = useState(0)
  const [grandTotal, setGrandTotal] = useState(0)
  const [showAll, setShowAll] = useState(false)
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    ;(async () => {
      const map: Record<number, string> = {}
      for (let from = 0; ; from += 1000) {
        const { data } = await supabase.from('skpd').select('id,nama').range(from, from + 999)
        if (!data || data.length === 0) break
        for (const s of data) map[s.id] = s.nama
        if (data.length < 1000) break
      }
      setSkpdMap(map)
    })()
    ;(async () => {
      const { data: jenis } = await supabase.from('jenis_aset').select('id,nama')
      const namaById = new Map((jenis || []).map(j => [j.id, j.nama]))
      const labels: Record<string, string> = {}
      await Promise.all(GOLONGAN_DAFTAR_BARANG.map(async prefix => {
        const { data } = await supabase.from('kodefikasi_bmd')
          .select('jenis_aset_id').eq('kode_jenis', prefix).not('jenis_aset_id', 'is', null).limit(1)
        const id = data?.[0]?.jenis_aset_id
        labels[prefix] = (id != null && namaById.get(id)) || prefix
      }))
      setGolonganLabels(labels)
    })()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Filter dipisah agar dipakai bareng query utama & export. Sumber = tabel utama
  // `aset` (bukan view) supaya `id` = aset.id, sehingga filter sembunyi period-aware
  // (transaksi_bmd.aset_id) cocok. golongan diturunkan dari `kode`, nama SKPD dari skpdMap.
  //   includeDeleted=false → hanya barang aktif (posisi terkini, default & untuk layar).
  //   includeDeleted=true  → termasuk yang dihapus (mode export Audit/Mutasi buat BPK).
  const applyFilters = useCallback(<T,>(q: T, f: Applied, includeDeleted = false): T => {
    // @ts-expect-error — chain PostgREST builder
    let b = includeDeleted ? q : q.eq('status', 'aktif')
    if (f.descIds && f.descIds.length > 0) b = b.in('skpd_id', f.descIds)
    if (f.golongan) b = b.like('kode', `${f.golongan}.%`)
    if (f.komptabel) b = b.eq('intra_ekstra', f.komptabel)
    if (f.search) b = b.or(`nama_barang.ilike.%${f.search}%,nibar.ilike.%${f.search}%,kode.ilike.${f.search}%`)
    return b
  }, [])

  const buildQuery = useCallback((f: Applied, withCount: boolean, includeDeleted = false) => {
    const q = supabase.from('aset')
      .select(SELECT_COLS, withCount ? { count: 'exact' } : undefined)
    return applyFilters(q, f, includeDeleted).order('nilai_perolehan', { ascending: false })
  }, [applyFilters]) // eslint-disable-line react-hooks/exhaustive-deps

  // Ambil baris aset berdasar daftar id (utk barang yang PADA periode terpilih
  // milik SKPD terpilih tapi kini sudah pindah keluar — period-aware). Filter
  // golongan/komptabel/search tetap diterapkan; filter SKPD TIDAK (justru id-id
  // ini di luar scope skpd terkini). includeDeleted=true.
  const fetchRowsByIds = useCallback(async (ids: string[], f: Applied): Promise<Row[]> => {
    const out: Row[] = []
    for (let i = 0; i < ids.length; i += 200) {
      let q = supabase.from('aset').select(SELECT_COLS).in('id', ids.slice(i, i + 200))
      if (f.golongan) q = q.like('kode', `${f.golongan}.%`)
      if (f.komptabel) q = q.eq('intra_ekstra', f.komptabel)
      if (f.search) q = q.or(`nama_barang.ilike.%${f.search}%,nibar.ilike.%${f.search}%,kode.ilike.${f.search}%`)
      const { data } = await q
      out.push(...((data as unknown as Row[]) || []))
    }
    return out
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Uraian (nama baku) per kode dari kodefikasi_bmd.
  async function fetchUraian(kodes: string[]) {
    const uniq = [...new Set(kodes)]
    const map: Record<string, string> = {}
    for (let i = 0; i < uniq.length; i += 200) {
      const { data } = await supabase.from('kodefikasi_bmd').select('kode,uraian').in('kode', uniq.slice(i, i + 200))
      for (const r of data || []) if (r.uraian) map[r.kode] = r.uraian
    }
    return map
  }

  async function fetchAllRows(f: Applied, includeDeleted = false) {
    const all: Row[] = []
    for (let from = 0; ; from += 1000) {
      const { data } = await buildQuery(f, false, includeDeleted).range(from, from + 999)
      if (!data || data.length === 0) break
      all.push(...(data as unknown as Row[]))
      if (data.length < 1000) break
    }
    return all
  }

  // aset_id yang tersembunyi PADA periode terpilih (serap/hapus dgn periode <=
  // periode, dikurangi batal). Sama persis dgn logika menu Penyusutan, supaya
  // Daftar Barang menampilkan posisi barang sesuai semester yang dipilih:
  //   - barang yang dihapus di semester DEPAN tetap muncul saat lihat semester lalu;
  //   - barang anak yang diserap kapitalisasi disembunyikan sejak periode serap.
  const fetchHiddenIds = useCallback(async (ids: string[], periode: string) => {
    const evByAset = new Map<string, { id: number; periode: string; jenis: string }[]>()
    for (let i = 0; i < ids.length; i += 200) {
      const { data } = await supabase.from('transaksi_bmd')
        .select('id,aset_id,jenis,periode').in('jenis', [...SEMBUNYI, ...MUNCUL] as never).in('aset_id', ids.slice(i, i + 200))
      for (const e of (data || []) as { id: number; aset_id: string; jenis: string; periode: string }[]) {
        const arr = evByAset.get(e.aset_id) || []; arr.push({ id: e.id, periode: e.periode, jenis: e.jenis }); evByAset.set(e.aset_id, arr)
      }
    }
    const hidden = new Set<string>()
    for (const [id, evs] of evByAset) {
      let h = false
      // Urut kronologis SUNGGUHAN (periode lalu id ledger — append-only jadi id = urutan
      // insert asli), BUKAN dikelompokkan SEMBUNYI-dulu-baru-MUNCUL. Pengelompokan lama
      // salah kalau dalam satu periode ada siklus hapus→batal→hapus lagi (mis. dari testing
      // di hari yang sama): hasil akhir harus ikut aksi TERAKHIR, bukan selalu "batal menang".
      for (const e of evs.filter(e => comparePeriode(e.periode, periode) <= 0).sort((a, b) => comparePeriode(a.periode, b.periode) || a.id - b.id)) {
        if (SEMBUNYI.includes(e.jenis)) h = true
        else if (MUNCUL.includes(e.jenis)) h = false
      }
      if (h) hidden.add(id)
    }
    return hidden
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Jejak penghapusan per aset (untuk export Audit): No SK, tanggal, jenis, alasan —
  // dari ledger + jurnal_header. Penghapusan TERBARU per aset (id desc) yang menang.
  const fetchHapusInfo = useCallback(async (ids: string[]) => {
    const info = new Map<string, HapusInfo>()
    for (let i = 0; i < ids.length; i += 200) {
      const { data } = await supabase.from('transaksi_bmd')
        .select('aset_id,tanggal,jenis,header:header_id(no_sk,keterangan)')
        .in('jenis', ['penghapusan_pemindahtanganan', 'penghapusan_sebab_lain'] as never)
        .in('aset_id', ids.slice(i, i + 200))
        .order('id', { ascending: false })
      for (const r of (data || []) as unknown as { aset_id: string; tanggal: string; jenis: string; header: { no_sk: string | null; keterangan: string | null } | null }[]) {
        if (info.has(r.aset_id)) continue
        info.set(r.aset_id, { tgl: r.tanggal, no_sk: r.header?.no_sk ?? null, jenis: r.jenis, ket: r.header?.keterangan ?? null })
      }
    }
    return info
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Render halaman (client-side) dari kumpulan baris visible.
  function showPage(all: Row[], pg: number) {
    setData(all.length <= SHOW_ALL_MAX ? all : all.slice(pg * PAGE_SIZE, (pg + 1) * PAGE_SIZE))
  }

  async function handleTampilkan() {
    if (!fGolongan) return // wajib pilih jenis aset dulu
    const f: Applied = { descIds: fSel.descIds, skpdId: fSel.skpdId, golongan: fGolongan, komptabel: fKomptabel, search: fSearch, periode: `${fTahun}-S${fSmt}` }
    setApplied(f); setPage(0); setGrandTotal(0)
    setLoading(true)

    // Ambil SEMUA baris (aktif + dihapus) yg kini di scope SKPD, lalu:
    //   (0) sesuaikan kepemilikan PERIOD-AWARE (transfer antar SKPD): buang yg
    //       pada periode ini milik SKPD lain, tambah yg pada periode ini milik
    //       scope tapi kini sudah pindah keluar. Lihat lib/pengalihan.ts.
    //   (a) buang yang tersembunyi krn dihapus/diserap di periode, DAN
    //   (b) buang yang BELUM diperoleh pada periode ini (tgl perolehan > periode) —
    //       supaya barang yang dibeli di semester DEPAN tak muncul di posisi lampau.
    const base = await fetchAllRows(f, true)
    const owners = await fetchOwnerOverrides(supabase, f.periode)
    setOwnerOverride(owners)

    let combined = base
    if (f.descIds && f.descIds.length > 0) {
      const scope = new Set(f.descIds)
      const curSkpd = new Map<string, number | null>(base.map(r => [r.id, r.skpd_id]))
      const { keepIds, addIds } = partitionByPeriodOwner(base.map(r => r.id), owners, curSkpd, scope)
      const kept = base.filter(r => keepIds.has(r.id))
      const added = addIds.length > 0 ? await fetchRowsByIds(addIds, f) : []
      combined = [...kept, ...added]
    }

    const hidden = await fetchHiddenIds(combined.map(r => r.id), f.periode)
    const belumAda = (r: Row) => !!r.tgl_perolehan && comparePeriode(periodeDariTanggal(r.tgl_perolehan), f.periode) > 0
    const visible = combined.filter(r => !hidden.has(r.id) && !belumAda(r))
      .sort((a, b) => (b.nilai_perolehan || 0) - (a.nilai_perolehan || 0))

    setAllVisible(visible)
    setTotal(visible.length)
    setGrandTotal(visible.reduce((s, r) => s + (r.nilai_perolehan || 0), 0))
    setShowAll(visible.length <= SHOW_ALL_MAX)
    showPage(visible, 0)
    setUraianMap(await fetchUraian(visible.map(r => r.kode)))
    setLoading(false)
  }

  function goPage(pg: number) {
    setPage(pg)
    showPage(allVisible, pg)
  }

  async function handleExport() {
    if (!applied) return
    setExporting(true)
    const all = allVisible // posisi sesuai periode terpilih (period-aware)
    const uraian = await fetchUraian(all.map(r => r.kode))
    const keys = colsFor(applied.golongan)
    exportToExcel(all.map(r => {
      const cell = (key: string): string | number => {
        switch (key) {
          case 'skpd': return skpdMap[ownerSkpd(r) ?? -1] || ''
          case 'nama': return r.nama_barang || ''
          case 'kode': return r.kode
          case 'uraian': return uraian[r.kode] || ''
          case 'merek': return r.merek_tipe || ''
          case 'spesifikasi': return r.spesifikasi_lainnya || ''
          case 'komptabel': return r.intra_ekstra || ''
          case 'tgl': return r.tgl_perolehan || ''
          case 'nilai': return r.nilai_perolehan
          case 'keterangan': return r.keterangan || ''
          case 'luas': return r.luas ?? ''
          case 'no_sertifikat': return r.nomor_dokumen_kepemilikan || ''
          case 'tgl_sertifikat': return r.tanggal_dokumen_kepemilikan || ''
          case 'atas_nama': return r.nama_dokumen_kepemilikan || ''
          case 'hak': return r.jenis_hak || ''
          default: return ''
        }
      }
      const obj: Record<string, string | number> = { NIBAR: r.nibar || '' }
      for (const k of keys) obj[COL_META[k].header] = cell(k)
      return obj
    }), `Daftar_Barang_${applied.golongan}`, 'Daftar Barang')
    setExporting(false)
  }

  // Export Audit/Mutasi (BPK): SEMUA barang termasuk yang dihapus, + kolom jejak
  // penghapusan (status, no. SK, tanggal, alasan). Barang aktif → kolom hapus kosong.
  async function handleExportAudit() {
    if (!applied) return
    setExporting(true)
    const all = await fetchAllRows(applied, true)
    const uraian = await fetchUraian(all.map(r => r.kode))
    const hapus = await fetchHapusInfo(all.filter(r => r.status !== 'aktif').map(r => r.id))
    const keys = colsFor(applied.golongan)
    exportToExcel(all.map(r => {
      const cell = (key: string): string | number => {
        switch (key) {
          case 'skpd': return skpdMap[r.skpd_id ?? -1] || ''
          case 'nama': return r.nama_barang || ''
          case 'kode': return r.kode
          case 'uraian': return uraian[r.kode] || ''
          case 'merek': return r.merek_tipe || ''
          case 'spesifikasi': return r.spesifikasi_lainnya || ''
          case 'komptabel': return r.intra_ekstra || ''
          case 'tgl': return r.tgl_perolehan || ''
          case 'nilai': return r.nilai_perolehan
          case 'keterangan': return r.keterangan || ''
          case 'luas': return r.luas ?? ''
          case 'no_sertifikat': return r.nomor_dokumen_kepemilikan || ''
          case 'tgl_sertifikat': return r.tanggal_dokumen_kepemilikan || ''
          case 'atas_nama': return r.nama_dokumen_kepemilikan || ''
          case 'hak': return r.jenis_hak || ''
          default: return ''
        }
      }
      const obj: Record<string, string | number> = { NIBAR: r.nibar || '' }
      for (const k of keys) obj[COL_META[k].header] = cell(k)
      const hi = hapus.get(r.id)
      obj['Status'] = r.status === 'aktif' ? 'Aktif' : 'Dihapus'
      obj['Tgl Penghapusan'] = hi?.tgl || ''
      obj['No. SK Penghapusan'] = hi?.no_sk || ''
      obj['Jenis Penghapusan'] = HAPUS_LABEL[hi?.jenis || ''] || ''
      obj['Alasan Penghapusan'] = hi?.ket || ''
      return obj
    }), `Daftar_Barang_${applied.golongan}_AUDIT`, 'Daftar Barang (Audit)')
    setExporting(false)
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)
  const skpdNama = applied?.skpdId ? skpdMap[applied.skpdId] : undefined
  const cols = applied ? colsFor(applied.golongan) : DEFAULT_COLS
  const nilaiIdx = cols.indexOf('nilai')

  // SKPD pemilik pada periode terpilih (period-aware): override kalau barang
  // pernah dialihkan; kalau tidak, pakai skpd_id terkini.
  const ownerSkpd = (r: Row): number | null => ownerOverride.get(r.id) ?? r.skpd_id

  function cellContent(key: string, r: Row): React.ReactNode {
    switch (key) {
      case 'skpd': return skpdMap[ownerSkpd(r) ?? -1] || '-'
      case 'nama': return (
        <>
          <p className="font-medium text-gray-800 text-xs">{r.nama_barang || '-'}</p>
          <p className="text-gray-400 text-xs mt-0.5">{r.nibar || '-'}</p>
        </>
      )
      case 'kode': return r.kode
      case 'uraian': return uraianMap[r.kode] || '-'
      case 'merek': return r.merek_tipe || '-'
      case 'spesifikasi': return r.spesifikasi_lainnya || '-'
      case 'komptabel': return r.intra_ekstra || '-'
      case 'tgl': return r.tgl_perolehan || '-'
      case 'nilai': return angka(r.nilai_perolehan)
      case 'keterangan': return r.keterangan || '-'
      case 'luas': return r.luas != null ? angka(r.luas) : '-'
      case 'no_sertifikat': return r.nomor_dokumen_kepemilikan || '-'
      case 'tgl_sertifikat': return r.tanggal_dokumen_kepemilikan || '-'
      case 'atas_nama': return r.nama_dokumen_kepemilikan || '-'
      case 'hak': return r.jenis_hak || '-'
      default: return '-'
    }
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Daftar Barang</h1>
        <p className="text-gray-500 text-sm mt-1">Register BMD per jenis aset — pilih jenis aset lalu klik Tampilkan.</p>
      </div>

      {/* Filter data */}
      <div className="card p-5 mb-4">
        <h2 className="text-base font-semibold text-gray-800 mb-4">Filter data</h2>
        <div className="space-y-3 max-w-3xl">
          <div className="flex items-center gap-3">
            <label className="w-40 text-sm text-gray-600 text-right flex-shrink-0">Lokasi / SKPD :</label>
            <SkpdCombobox onChangeSelection={sel => setFSel({ skpdId: sel.skpdId, descIds: sel.descendantIds })} allowClear
              placeholder="Semua SKPD — atau ketik SKPD / Sub OPD / Lokasi..." />
          </div>
          <div className="flex items-center gap-3">
            <label className="w-40 text-sm text-gray-600 text-right flex-shrink-0">Jenis Aset :</label>
            <select className="select-filter flex-1" value={fGolongan} onChange={e => setFGolongan(e.target.value)}>
              <option value="">— pilih jenis aset (wajib) —</option>
              {GOLONGAN_DAFTAR_BARANG.map(g => (
                <option key={g} value={g}>{g} — {golonganLabels[g] || '...'}</option>
              ))}
            </select>
          </div>
          {fGolongan !== '1.3.1' && (
            <div className="flex items-center gap-3">
              <label className="w-40 text-sm text-gray-600 text-right flex-shrink-0">Komptabel :</label>
              <select className="select-filter flex-1" value={fKomptabel} onChange={e => setFKomptabel(e.target.value)}>
                <option value="">Semua</option>
                <option value="intra">Intrakomptabel</option>
                <option value="ekstra">Ekstrakomptabel</option>
              </select>
            </div>
          )}
          <div className="flex items-center gap-3">
            <label className="w-40 text-sm text-gray-600 text-right flex-shrink-0">Posisi Semester :</label>
            <select className="select-filter w-28" value={fTahun} onChange={e => setFTahun(e.target.value)}>
              {['2025', '2026', '2027'].map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <div className="flex gap-4">
              {[['1', 'Semester I'], ['2', 'Semester II']].map(([v, l]) => (
                <label key={v} className="flex items-center gap-1.5 text-sm cursor-pointer">
                  <input type="radio" name="db_smt" checked={fSmt === v} onChange={() => setFSmt(v)} />{l}
                </label>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <label className="w-40 text-sm text-gray-600 text-right flex-shrink-0">Cari :</label>
            <input className="select-filter flex-1" placeholder="Nama barang / NIBAR / kode..."
              value={fSearch} onChange={e => setFSearch(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleTampilkan() }} />
          </div>
          <div className="flex items-center gap-3">
            <span className="w-40 flex-shrink-0" />
            <button className="btn-primary" onClick={handleTampilkan} disabled={loading || !fGolongan}>
              {loading ? 'Memuat...' : 'Tampilkan'}
            </button>
            {!fGolongan && <span className="text-xs text-gray-400">Pilih jenis aset dulu.</span>}
          </div>
        </div>
      </div>

      {/* Hasil */}
      {applied === null ? (
        <div className="card p-12 text-center text-gray-400 text-sm">
          Pilih <span className="font-medium text-gray-600">jenis aset</span> di atas lalu klik <span className="font-medium text-gray-600">Tampilkan</span>.
        </div>
      ) : (
        <>
        <TahunTerkunciNote tahun={Number(applied.periode.slice(0, 4))} />
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <span className="text-sm text-gray-500">
              {total.toLocaleString('id-ID')} barang{skpdNama ? ` — ${skpdNama}` : ''}
              {applied.golongan ? ` · ${applied.golongan} ${golonganLabels[applied.golongan] || ''}` : ''}
              {` · posisi ${applied.periode}`}
            </span>
            <div className="flex items-center gap-3">
              {!showAll && <span className="text-sm text-gray-500">Hal. {page + 1} / {totalPages || 1}</span>}
              <button onClick={handleExport} disabled={exporting || total === 0} className="btn-secondary text-xs"
                title={`Posisi barang pada ${applied.periode} (sesuai filter semester)`}>
                {exporting ? 'Mengekspor...' : 'Export Excel'}
              </button>
              <button onClick={handleExportAudit} disabled={exporting} className="btn-secondary text-xs"
                title="Audit/Mutasi — SEMUA barang termasuk yang dihapus + jejak SK penghapusan (untuk BPK, lintas periode)">
                {exporting ? '...' : 'Export Audit'}
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>{cols.map(k => <th key={k} className={thClass(k)}>{COL_META[k].header}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {loading ? (
                  <tr><td colSpan={cols.length} className="table-td text-center py-12 text-gray-400">Memuat data...</td></tr>
                ) : data.length === 0 ? (
                  <tr><td colSpan={cols.length} className="table-td text-center py-12 text-gray-400">Tidak ada data untuk filter ini</td></tr>
                ) : data.map((row, i) => (
                  <tr key={row.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                    {cols.map(k => <td key={k} className={tdClass(k)}>{cellContent(k, row)}</td>)}
                  </tr>
                ))}
              </tbody>
              {!loading && data.length > 0 && (
                <tfoot>
                  <tr className="bg-gray-50 border-t-2 border-gray-200 font-semibold text-gray-800">
                    <td className="table-td text-xs" colSpan={nilaiIdx}>TOTAL ({total.toLocaleString('id-ID')} barang)</td>
                    <td className="table-td text-right text-xs">{grandTotal ? angka(grandTotal) : '…'}</td>
                    {cols.length - nilaiIdx - 1 > 0 && <td className="table-td" colSpan={cols.length - nilaiIdx - 1} />}
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          {!showAll && totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
              <button className="btn-secondary" disabled={page === 0 || loading} onClick={() => goPage(page - 1)}>← Sebelumnya</button>
              <button className="btn-secondary" disabled={page >= totalPages - 1 || loading} onClick={() => goPage(page + 1)}>Berikutnya →</button>
            </div>
          )}
        </div>
        </>
      )}
    </div>
  )
}
