'use client'
// Daftar Barang — alur filter-lalu-tampilkan (mirip e-SIMBADA):
// SKPD → Jenis Aset (WAJIB pilih satu) → Komptabel → Cari → klik Tampilkan.
//
// Kolom menyesuaikan jenis aset (KIB) memakai field yang tersedia di DB. Layar
// DIRINGKAS (lihat COLS): `uraian` ditumpuk di bawah `kode`, `nibar` di bawah
// `nama`. Tanah/Gedung/Jalan/KDP/Aset Lain-Lain + Spesifikasi Lainnya & Lokasi
// (alamat_detail) setelah nama. Tanah: dokumen kepemilikan TIDAK di layar (per
// bidang di GIS — badge "N bidang"), tetap ada di Export (EXPORT_COLS, utk BPK).
//   - Tanah (1.3.1): tanpa kolom Komptabel (semua intrakomptabel); + Luas & Jenis Hak
//   - Peralatan & Mesin (1.3.2): + Merek/Tipe + Spesifikasi
// Catatan: field kendaraan (nopol, no rangka/mesin) belum ada kolom terstruktur
// di DB — sementara pakai Keterangan/Spesifikasi bila terisi.
//
// Tampilan: kalau hasil filter ≤ SHOW_ALL_MAX baris → tampilkan SEMUA (tanpa
// halaman); kalau lebih → pakai halaman biar browser tetap enteng. Baris TOTAL
// selalu menjumlahkan nilai perolehan SELURUH hasil filter. Angka tanpa "Rp".
import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import SkpdCombobox from '@/components/SkpdCombobox'
import { exportToExcel } from '@/lib/export'
import { GOLONGAN_DAFTAR_BARANG, comparePeriode, periodeDariTanggal, asalUsulTampil } from '@/lib/bmd'
import { fetchPosisiOverrides, partitionByPeriodOwner, type PosisiPeriode } from '@/lib/pengalihan'
import { bergeserDariNibar } from '@/lib/kodeRegister'
import TahunTerkunciNote from '@/components/TahunTerkunciNote'
import { tahunAwal } from '@/lib/tahunKerja'

const PAGE_SIZE = 50
const SHOW_ALL_MAX = 3000 // di bawah ini → render semua baris tanpa halaman

// Event yang menyembunyikan / memunculkan kembali aset (serap/hapus vs batal) —
// sama dgn menu Penyusutan. Dipakai untuk visibilitas period-aware.
const SEMBUNYI = ['kapitalisasi_serap', 'penghapusan_pemindahtanganan', 'penghapusan_sebab_lain', 'batal_pengadaan', 'koreksi_pencatatan_ganda', 'batal_hibah_masuk', 'batal_tukar_menukar', 'batal_hasil_inventarisasi', 'batal_perolehan_lainnya', 'kdp_selesai_keluar', 'pemecahan_keluar', 'batal_pemecahan_masuk']
const MUNCUL = ['batal_kapitalisasi', 'batal_penghapusan', 'batal_pemecahan', 'batal_koreksi_pencatatan_ganda']

const SELECT_COLS = 'id,nibar,kode_register,kode,nama_barang,spesifikasi_lainnya,alamat_detail,merek_tipe,nilai_perolehan,tgl_perolehan,intra_ekstra,asal_usul,cara_perolehan,penggunaan_pengamanan,keterangan,status,skpd_id,luas,nomor_dokumen_kepemilikan,tanggal_dokumen_kepemilikan,nama_dokumen_kepemilikan,jenis_hak'

type Row = {
  id: string          // = aset.id → dipakai cocokkan event sembunyi di transaksi_bmd
  nibar: string | null
  // Kode register 45 digit — DIBACA dari kolom, bukan dihitung di layar. Nomor
  // urutnya diterbitkan & dibekukan di DB (trigger trg_aset_kode_register);
  // menghitungnya di sini akan menggeser nomor tiap kali ada barang hilang.
  kode_register: string | null
  kode: string
  nama_barang: string | null
  spesifikasi_lainnya: string | null
  alamat_detail: string | null
  merek_tipe: string | null
  nilai_perolehan: number
  tgl_perolehan: string | null
  intra_ekstra: string | null
  asal_usul: string | null
  // Diisi menu Cara Perolehan saat approve — dipakai HANYA sbg cadangan
  // tampilan kalau `asal_usul` kosong. Lihat `asalUsulTampil` di lib/bmd.ts.
  cara_perolehan: string | null
  penggunaan_pengamanan: string | null   // kolom label "Penggunaan" (lihat lib/asetFields.ts)
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
  uraian: { header: 'Uraian Barang' }, merek: { header: 'Merek / Tipe' }, spesifikasi: { header: 'Spesifikasi Lainnya' },
  lokasi: { header: 'Lokasi' }, komptabel: { header: 'Komptabel', align: 'center' }, tgl: { header: 'Tgl Perolehan' },
  nilai: { header: 'Nilai Perolehan', align: 'right' }, keterangan: { header: 'Keterangan' },
  asal_usul: { header: 'Asal Usul' }, penggunaan: { header: 'Penggunaan' },
  luas: { header: 'Luas (m²)', align: 'right' }, no_sertifikat: { header: 'Nomor Dokumen Kepemilikan' },
  tgl_sertifikat: { header: 'Tanggal Dokumen Kepemilikan' }, atas_nama: { header: 'Nama Dokumen Kepemilikan' },
  hak: { header: 'Jenis Hak' },
  // Dua kolom identitas — EXPORT-ONLY (tak pernah masuk COLS layar; di layar
  // NIBAR & kode register ditumpuk di sel Nama Barang). Ada di COL_META supaya
  // ikut satu sistem urutan yang sama dgn kolom lain (EXPORT_ORDER).
  nibar: { header: 'NIBAR' }, kode_register: { header: 'Kode Register' },
}
// ── Kolom TAMPILAN LAYAR (diringkas 2026-07-19) ─────────────────────────────
// - `uraian` TIDAK jadi kolom sendiri lagi → ditumpuk di bawah `kode` (spt nibar
//   di bawah nama). Lihat cellContent('kode').
// - `spesifikasi` (Spesifikasi Lainnya) HANYA utk Peralatan & Mesin di layar.
//   Golongan lain (Tanah/Gedung/Jalan/KDP/ATB/Aset Lain-Lain) TIDAK menampilkan
//   Spesifikasi Lainnya di layar (2026-07-20) — masih ada di Export (EXPORT_COLS).
// - `lokasi` (alamat_detail) tetap setelah nama utk golongan berlokasi.
// - `asal_usul` (Asal Usul) & `penggunaan` (Penggunaan → kolom penggunaan_pengamanan)
//   ditampilkan sebelum Keterangan di SEMUA jenis aset (2026-07-20).
// - Tanah: kolom Dokumen Kepemilikan (no/tgl/atas nama) SENGAJA tidak di layar —
//   satu register bisa banyak bidang & dokumennya dikelola per-bidang di GIS
//   (badge "🗺 N bidang" di sel nama link ke sana). TETAP ada di Export (BPK).
const COLS: Record<string, string[]> = {
  '1.3.1': ['skpd', 'kode', 'nama', 'lokasi', 'tgl', 'luas', 'hak', 'nilai', 'asal_usul', 'penggunaan', 'keterangan'], // Tanah — tanpa komptabel; dokumen kepemilikan → GIS/Export
  '1.3.2': ['skpd', 'kode', 'nama', 'merek', 'spesifikasi', 'tgl', 'komptabel', 'nilai', 'asal_usul', 'penggunaan', 'keterangan'],    // Peralatan & Mesin
  '1.3.3': ['skpd', 'kode', 'nama', 'lokasi', 'tgl', 'komptabel', 'nilai', 'asal_usul', 'penggunaan', 'keterangan'],   // Gedung & Bangunan
  '1.3.4': ['skpd', 'kode', 'nama', 'lokasi', 'tgl', 'komptabel', 'nilai', 'asal_usul', 'penggunaan', 'keterangan'],   // Jalan, Jaringan, Irigasi
  '1.3.5': ['skpd', 'kode', 'nama', 'merek', 'tgl', 'komptabel', 'nilai', 'asal_usul', 'penggunaan', 'keterangan'],                   // Aset Tetap Lainnya
  '1.3.6': ['skpd', 'kode', 'nama', 'lokasi', 'tgl', 'komptabel', 'nilai', 'asal_usul', 'penggunaan', 'keterangan'],   // KDP
  '1.5.3': ['skpd', 'kode', 'nama', 'tgl', 'komptabel', 'nilai', 'asal_usul', 'penggunaan', 'keterangan'],             // Aset Tidak Berwujud
  '1.5.4': ['skpd', 'kode', 'nama', 'merek', 'lokasi', 'tgl', 'komptabel', 'nilai', 'asal_usul', 'penggunaan', 'keterangan'],   // Aset Lain-Lain — campuran (ada yg mirip P&M, ada yg mirip Tanah), tampilkan keduanya
}
const DEFAULT_COLS = ['skpd', 'kode', 'nama', 'tgl', 'komptabel', 'nilai', 'asal_usul', 'penggunaan', 'keterangan']
const colsFor = (golongan: string) => COLS[golongan] || DEFAULT_COLS

// ── Kolom EKSPOR (Excel/BPK) — TETAP flat & lengkap: `uraian` jadi kolom
// sendiri, dan Tanah tetap membawa Dokumen Kepemilikan (no/tgl/atas nama).
// Sengaja beda dari tampilan layar yang diringkas.
// ⚠️ Kode Register yang diekspor = kode TERKINI (kolom `aset.kode_register`),
// BELUM period-aware — sama seperti tampilan layar. Kalau nanti tampilan dibuat
// period-aware lewat `aset_kode_register`, export WAJIB ikut, kalau tidak berkas
// periode lampau menyebut kode yang saat itu belum terbit.
//
// URUTAN kolom kiri→kanan DITENTUKAN USER (2026-07-30) & dipegang SATU tempat:
// EXPORT_ORDER di bawah. `EXPORT_COLS` cuma menentukan kolom mana yang IKUT per
// golongan (himpunan, bukan urutan) — urutannya selalu dari EXPORT_ORDER. Ini
// disengaja: dulu urutannya tersebar di 9 daftar, jadi nambah satu kolom berarti
// menyisipkannya di 9 tempat dengan benar & satu kelupaan bikin berkas golongan
// itu beda susunan tanpa ada yang sadar.
// Susunannya: identitas (SKPD → kode & uraian → NIBAR → kode register → nama) →
// deskriptif per golongan (merek, spesifikasi, lokasi, luas, hak, dokumen
// kepemilikan) → atribut (tgl, komptabel) → angka → asal usul/penggunaan/ket.
// Blok deskriptif itu yang bikin tiap golongan beda panjang, sesuai kolom yang
// memang ditampilkan Daftar Barang untuk jenis aset itu.
const EXPORT_ORDER = [
  'skpd', 'kode', 'uraian', 'nibar', 'kode_register', 'nama',
  'merek', 'spesifikasi', 'lokasi', 'luas', 'hak', 'no_sertifikat', 'tgl_sertifikat', 'atas_nama',
  'tgl', 'komptabel', 'nilai', 'asal_usul', 'penggunaan', 'keterangan',
]
// Dua kolom identitas ini SELALU ikut, apa pun golongannya — sengaja di luar
// daftar per-golongan supaya tak bisa kelupaan di salah satu entri.
const EXPORT_ALWAYS = ['nibar', 'kode_register']
const EXPORT_COLS: Record<string, string[]> = {
  '1.3.1': ['skpd', 'kode', 'uraian', 'nama', 'spesifikasi', 'lokasi', 'luas', 'hak', 'no_sertifikat', 'tgl_sertifikat', 'atas_nama', 'tgl', 'nilai', 'asal_usul', 'penggunaan', 'keterangan'], // Tanah — tanpa komptabel (spt layar)
  '1.3.2': ['skpd', 'kode', 'uraian', 'nama', 'merek', 'spesifikasi', 'tgl', 'komptabel', 'nilai', 'asal_usul', 'penggunaan', 'keterangan'],
  '1.3.3': ['skpd', 'kode', 'uraian', 'nama', 'spesifikasi', 'lokasi', 'tgl', 'komptabel', 'nilai', 'asal_usul', 'penggunaan', 'keterangan'],
  '1.3.4': ['skpd', 'kode', 'uraian', 'nama', 'spesifikasi', 'lokasi', 'tgl', 'komptabel', 'nilai', 'asal_usul', 'penggunaan', 'keterangan'],
  '1.3.5': ['skpd', 'kode', 'uraian', 'nama', 'merek', 'tgl', 'komptabel', 'nilai', 'asal_usul', 'penggunaan', 'keterangan'],
  '1.3.6': ['skpd', 'kode', 'uraian', 'nama', 'spesifikasi', 'lokasi', 'tgl', 'komptabel', 'nilai', 'asal_usul', 'penggunaan', 'keterangan'],
  '1.5.3': ['skpd', 'kode', 'uraian', 'nama', 'spesifikasi', 'tgl', 'komptabel', 'nilai', 'asal_usul', 'penggunaan', 'keterangan'],
  '1.5.4': ['skpd', 'kode', 'uraian', 'nama', 'merek', 'spesifikasi', 'lokasi', 'tgl', 'komptabel', 'nilai', 'asal_usul', 'penggunaan', 'keterangan'],
}
const EXPORT_DEFAULT = ['skpd', 'kode', 'uraian', 'nama', 'tgl', 'komptabel', 'nilai', 'asal_usul', 'penggunaan', 'keterangan']
// Himpunan kolom golongan + yang selalu ikut, DIURUTKAN oleh EXPORT_ORDER.
const exportColsFor = (golongan: string) => {
  const pilih = new Set([...(EXPORT_COLS[golongan] || EXPORT_DEFAULT), ...EXPORT_ALWAYS])
  return EXPORT_ORDER.filter(k => pilih.has(k))
}

// Urutan tampil & export: KODE BARANG A→Z (permintaan user 2026-07-30; dulu
// nilai perolehan terbesar dulu). Perbandingan string POLOS, bukan
// `localeCompare`: kode e-BMD itu angka ber-titik yang tiap segmennya sudah
// zero-padded ('1.3.2.02.01.02.003'), jadi urutan leksikografis = urutan
// nomornya, dan sorting 200rb baris jadi jauh lebih murah.
// Dua kunci sesudahnya WAJIB ada, bukan hiasan: satu kode dipakai ribuan barang,
// dan tanpa pemecah seri yang UNIK urutannya bisa berbeda tiap render (Array
// .sort() tak stabil utk semua mesin) — nomor halaman jadi berpindah-pindah
// isinya. Nilai perolehan turun dipertahankan sbg kunci kedua supaya kebiasaan
// lama (barang mahal di atas) masih terasa di dalam satu kode.
function bandingKode(a: Row, b: Row): number {
  if (a.kode !== b.kode) return a.kode < b.kode ? -1 : 1
  const d = (b.nilai_perolehan || 0) - (a.nilai_perolehan || 0)
  return d !== 0 ? d : (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
}

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
  if (key === 'nama' || key === 'kode') return 'table-td align-top'
  if (key === 'nilai' || key === 'luas') return 'table-td text-right text-xs'
  if (key === 'komptabel') return 'table-td text-center text-xs capitalize'
  return 'table-td text-xs text-gray-600 align-top'
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
  const [fTahun, setFTahun] = useState(() => tahunAwal(now.slice(0, 4)))
  const [fSmt, setFSmt] = useState(now.slice(-1))

  // ── Filter yang sudah diterapkan (dipakai query) ──
  const [applied, setApplied] = useState<Applied | null>(null)

  const [data, setData] = useState<Row[]>([])          // baris yang tampil (halaman aktif / semua)
  const [allVisible, setAllVisible] = useState<Row[]>([]) // seluruh baris visible di periode (utk paginasi & export)
  const [uraianMap, setUraianMap] = useState<Record<string, string>>({})
  const [bidangCount, setBidangCount] = useState<Record<string, { n: number; nLuas: number; luas: number | null }>>({}) // aset_id → jumlah bidang & Σ luas (Tanah, dari aset_bidang_tanah)
  const [posisiOverride, setPosisiOverride] = useState<Map<string, PosisiPeriode>>(new Map()) // aset_id → SKPD pemilik + tahun masuk, period-aware
  const [total, setTotal] = useState(0)
  const [grandTotal, setGrandTotal] = useState(0)
  const [showAll, setShowAll] = useState(false)
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(false)
  // Pesan kegagalan query. WAJIB ada di halaman daftar (CLAUDE.md): tanpa ini,
  // query yang gagal cuma bikin tombol nyangkut "Memuat..." selamanya (kalau
  // melempar) atau terbaca operator sbg "0 barang / datanya memang kosong"
  // (kalau errornya ditelan) — dua-duanya bisa berbulan-bulan tak ketahuan.
  const [err, setErr] = useState('')
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    ;(async () => {
      const map: Record<number, string> = {}
      for (let from = 0; ; from += 1000) {
        const { data } = await supabase.from('admin_skpd').select('id,nama').range(from, from + 999)
        if (!data || data.length === 0) break
        for (const s of data) map[s.id] = s.nama
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

  // Filter dipisah agar dipakai bareng query utama & export. Sumber = tabel utama
  // `aset` (bukan view) supaya `id` = aset.id, sehingga filter sembunyi period-aware
  // (transaksi_bmd.aset_id) cocok. golongan diturunkan dari `kode`, nama SKPD dari skpdMap.
  //   includeDeleted=false → hanya barang aktif (posisi terkini, default & untuk layar).
  //   includeDeleted=true  → termasuk yang dihapus (mode export Audit/Mutasi buat BPK).
  const applyFilters = useCallback(<T,>(q: T, f: Applied, includeDeleted = false): T => {
    // @ts-expect-error — chain PostgREST builder
    // 'draft' = barang belum resmi (mis. KDP sebelum termin disetujui) → JANGAN
    // pernah tampil, bahkan di mode Audit (includeDeleted). Hanya aktif/dihapus.
    let b = includeDeleted ? q.neq('status', 'draft') : q.eq('status', 'aktif')
    if (f.descIds && f.descIds.length > 0) b = b.in('skpd_id', f.descIds)
    if (f.golongan) b = b.like('kode', `${f.golongan}.%`)
    if (f.komptabel) b = b.eq('intra_ekstra', f.komptabel)
    if (f.search) b = b.or(`nama_barang.ilike.%${f.search}%,nibar.ilike.%${f.search}%,kode.ilike.${f.search}%`)
    return b
  }, [])

  const buildQuery = useCallback((f: Applied, withCount: boolean, includeDeleted = false) => {
    const q = supabase.from('aset')
      .select(SELECT_COLS, withCount ? { count: 'exact' } : undefined)
    // ⚠️ `.order('id')` itu PEMECAH SERI, jangan dicopot. Baris ditarik
    // halaman-demi-halaman pakai `.range()`, dan `nilai_perolehan` punya
    // BANYAK kembar (ribuan barang senilai sama) — dgn urutan yang tak total,
    // Postgres tak menjamin baris kembar jatuh di halaman yang sama tiap query,
    // jadi ada baris yang bisa terlewat & baris lain dobel TANPA SUARA. Urutan
    // tampilnya sendiri ditentukan `bandingKode` di client; ini murni supaya
    // pengambilannya utuh. Tak butuh index baru: sort node-nya toh sudah ada
    // utk `nilai_perolehan` (tak ada index yang melayaninya), jadi nambah kunci
    // kedua di sort yang sama ~gratis.
    return applyFilters(q, f, includeDeleted)
      .order('nilai_perolehan', { ascending: false })
      .order('id')
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
      const { data, error } = await q
      if (error) throw new Error(`gagal membaca barang yang sudah pindah SKPD: ${error.message}`)
      out.push(...((data as unknown as Row[]) || []))
    }
    return out
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Bidang tanah per aset (aset_bidang_tanah) — utk badge "N bidang" DAN kolom
  // Luas. Identitas + luas per bidang dikelola di menu GIS BMD; `aset.luas` cuma
  // dipakai kalau asetnya belum punya bidang sama sekali. Σ-nya dihitung SAAT
  // TAMPIL, sengaja tidak disimpan ke `aset.luas` — angka tersimpan bakal basi
  // tiap bidang ditambah/diedit/dihapus (aturan yang sama dipakai Saldo Awal →
  // Daftar Barang Awal, bedanya cadangannya kolom snapshot).
  // Σ HANYA sah kalau SEMUA bidang punya luas (nLuas === n) — kalau baru
  // sebagian yang diisi, jumlahnya lebih kecil dari luas sebenarnya. Per
  // 2026-07-28 itu justru keadaan normal: dari 529 bidang, baru 4 yang berluas.
  const fetchBidangCount = useCallback(async (ids: string[]) => {
    const cnt: Record<string, { n: number; nLuas: number; luas: number | null }> = {}
    for (let i = 0; i < ids.length; i += 200) {
      const { data, error } = await supabase.from('aset_bidang_tanah').select('aset_id,luas').in('aset_id', ids.slice(i, i + 200))
      if (error) throw new Error(`gagal membaca bidang tanah: ${error.message}`)
      for (const b of (data || []) as { aset_id: string; luas: number | null }[]) {
        const a = cnt[b.aset_id] || (cnt[b.aset_id] = { n: 0, nLuas: 0, luas: null })
        a.n++
        if (b.luas != null) { a.nLuas++; a.luas = (a.luas ?? 0) + Number(b.luas) }
      }
    }
    return cnt
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Uraian (nama baku) per kode dari kodefikasi_bmd.
  async function fetchUraian(kodes: string[]) {
    const uniq = [...new Set(kodes)]
    const map: Record<string, string> = {}
    for (let i = 0; i < uniq.length; i += 200) {
      const { data, error } = await supabase.from('admin_kodefikasi_bmd').select('kode,uraian').in('kode', uniq.slice(i, i + 200))
      if (error) throw new Error(`gagal membaca uraian kodefikasi: ${error.message}`)
      for (const r of data || []) if (r.uraian) map[r.kode] = r.uraian
    }
    return map
  }

  async function fetchAllRows(f: Applied, includeDeleted = false) {
    const all: Row[] = []
    for (let from = 0; ; from += 1000) {
      const { data, error } = await buildQuery(f, false, includeDeleted).range(from, from + 999)
      if (error) throw new Error(`gagal membaca daftar barang: ${error.message}`)
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
      const { data, error } = await supabase.from('transaksi_bmd')
        .select('id,aset_id,jenis,periode').in('jenis', [...SEMBUNYI, ...MUNCUL] as never).in('aset_id', ids.slice(i, i + 200))
      // Gagal di sini TIDAK BOLEH ditelan: set kosong = "tak ada yang
      // disembunyikan", jadi barang yang sudah dihapus/diserap muncul lagi
      // seolah masih ada — persis jebakan filter void (CLAUDE.md).
      if (error) throw new Error(`gagal membaca event visibilitas barang: ${error.message}`)
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
      const { data, error } = await supabase.from('transaksi_bmd')
        .select('aset_id,tanggal,jenis,header:header_id(no_sk,keterangan)')
        .in('jenis', ['penghapusan_pemindahtanganan', 'penghapusan_sebab_lain'] as never)
        .in('aset_id', ids.slice(i, i + 200))
        .order('id', { ascending: false })
      if (error) throw new Error(`gagal membaca jejak penghapusan: ${error.message}`)
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
    setLoading(true); setErr('')

    // ⚠️ SELURUH isi fungsi ini WAJIB di dalam try/finally. Sebelumnya tidak:
    // begitu satu query melempar (fetchOwnerOverrides sudah melempar sejak
    // 2026-07-28), promise-nya ditolak tanpa penangkap, `setLoading(false)` di
    // baris terakhir TAK PERNAH tercapai → tombol nyangkut "Memuat..." dan
    // tabel "Memuat data..." SELAMANYA, tanpa sepatah pun keterangan. Itu yang
    // terlihat operator sbg "Daftar Barang ndak muncul-muncul" padahal
    // penyebabnya statement timeout yang sama dgn Rekonsiliasi — bedanya
    // Rekonsiliasi punya try/catch jadi pesannya kelihatan, halaman ini tidak.
    try {

    // Ambil SEMUA baris (aktif + dihapus) yg kini di scope SKPD, lalu:
    //   (0) sesuaikan kepemilikan PERIOD-AWARE (transfer antar SKPD): buang yg
    //       pada periode ini milik SKPD lain, tambah yg pada periode ini milik
    //       scope tapi kini sudah pindah keluar. Lihat lib/pengalihan.ts.
    //   (a) buang yang tersembunyi krn dihapus/diserap di periode, DAN
    //   (b) buang yang BELUM diperoleh pada periode ini (tgl perolehan > periode) —
    //       supaya barang yang dibeli di semester DEPAN tak muncul di posisi lampau.
    const base = await fetchAllRows(f, true)
    // SATU query untuk dua kebutuhan: atribusi SKPD period-aware (lama) + tahun
    // masuk SKPD (segmen tahun kode register). Jangan panggil fetchOwnerOverrides
    // lagi di sini — querynya persis sama, cuma nambah beban.
    const posisi = await fetchPosisiOverrides(supabase, f.periode)
    setPosisiOverride(posisi)
    const owners = new Map<string, number | null>([...posisi].map(([id, p]) => [id, p.skpd]))

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
    const visible = combined.filter(r => !hidden.has(r.id) && !belumAda(r)).sort(bandingKode)

    setAllVisible(visible)
    setTotal(visible.length)
    setGrandTotal(visible.reduce((s, r) => s + (r.nilai_perolehan || 0), 0))
    setShowAll(visible.length <= SHOW_ALL_MAX)
    showPage(visible, 0)
    setUraianMap(await fetchUraian(visible.map(r => r.kode)))
    setBidangCount(f.golongan === '1.3.1' ? await fetchBidangCount(visible.map(r => r.id)) : {})

    } catch (e) {
      // Fail-closed spt modul pelaporan: daftar yang kurang sebagian JAUH lebih
      // berbahaya daripada daftar yang menolak tampil — operator tak punya cara
      // tahu barangnya kurang, dan angkanya ikut diekspor ke Excel.
      setErr(`${(e as Error).message} — daftar tidak ditampilkan supaya tidak ada yang terbaca sebagai lengkap padahal sebagian gagal dimuat. Coba klik Tampilkan lagi; kalau berulang, kabari admin.`)
      setAllVisible([]); setData([]); setTotal(0); setGrandTotal(0)
    } finally {
      // Di `finally`, BUKAN di akhir jalur sukses — kalau tidak, satu query
      // gagal bikin tombolnya nyangkut "Memuat..." selamanya.
      setLoading(false)
    }
  }

  function goPage(pg: number) {
    setPage(pg)
    showPage(allVisible, pg)
  }

  // Luas Tanah: Σ bidang kalau asetnya punya bidang, kalau tidak `aset.luas`.
  // (Di Export Audit, barang yang sudah dihapus tak ikut di-fetch bidangnya —
  // otomatis jatuh ke aset.luas, dan memang itu nilai terakhir yang tercatat.)
  function luasOf(r: Row): number | null {
    const b = bidangCount[r.id]
    return b && b.n > 0 && b.nLuas === b.n && b.luas != null ? b.luas : r.luas
  }

  async function handleExport() {
    if (!applied) return
    setExporting(true); setErr('')
    try {
    const all = allVisible // posisi sesuai periode terpilih (period-aware)
    const uraian = await fetchUraian(all.map(r => r.kode))
    const keys = exportColsFor(applied.golongan)
    exportToExcel(all.map(r => {
      const cell = (key: string): string | number => {
        switch (key) {
          case 'skpd': return skpdMap[ownerSkpd(r) ?? -1] || ''
          case 'nama': return r.nama_barang || ''
          case 'kode': return r.kode
          case 'uraian': return uraian[r.kode] || ''
          case 'nibar': return r.nibar || ''
          // String, BUKAN angka — 45 digit sbg numerik jadi notasi ilmiah di
          // Excel & digit belakangnya hilang tanpa suara.
          case 'kode_register': return r.kode_register || ''
          case 'merek': return r.merek_tipe || ''
          case 'spesifikasi': return r.spesifikasi_lainnya || ''
          case 'lokasi': return r.alamat_detail || ''
          case 'komptabel': return r.intra_ekstra || ''
          case 'tgl': return r.tgl_perolehan || ''
          case 'nilai': return r.nilai_perolehan
          // Kosong → jatuh ke label cara perolehan (menu yang mencatat barang
          // ini). Di Excel tak ditandai apa-apa: bagi pembaca berkas keduanya
          // sama-sama "asal usul barang", dan penandaan cuma bikin bingung.
          case 'asal_usul': return asalUsulTampil(r.asal_usul, r.cara_perolehan).teks
          case 'penggunaan': return r.penggunaan_pengamanan || ''
          case 'keterangan': return r.keterangan || ''
          case 'luas': return luasOf(r) ?? ''
          case 'no_sertifikat': return r.nomor_dokumen_kepemilikan || ''
          case 'tgl_sertifikat': return r.tanggal_dokumen_kepemilikan || ''
          case 'atas_nama': return r.nama_dokumen_kepemilikan || ''
          case 'hak': return r.jenis_hak || ''
          default: return ''
        }
      }
      const obj: Record<string, string | number> = {}
      for (const k of keys) obj[COL_META[k].header] = cell(k)
      return obj
    }), `Daftar_Barang_${applied.golongan}`, 'Daftar Barang')
    } catch (e) {
      // Berkas Excel yang isinya kurang sebagian TIDAK BOLEH terlanjur terunduh —
      // sekali tersimpan, tak ada lagi tanda bahwa datanya tak lengkap.
      setErr(`gagal menyiapkan export: ${(e as Error).message} — berkas tidak dibuat supaya tidak ada Excel setengah jadi yang beredar.`)
    } finally {
      setExporting(false)
    }
  }

  // Export Audit/Mutasi (BPK): SEMUA barang termasuk yang dihapus, + kolom jejak
  // penghapusan (status, no. SK, tanggal, alasan). Barang aktif → kolom hapus kosong.
  async function handleExportAudit() {
    if (!applied) return
    setExporting(true); setErr('')
    try {
    // Diurutkan sendiri: berkas ini TIDAK lewat `allVisible` (dia menarik ulang
    // termasuk barang yang sudah dihapus), jadi tanpa baris ini susunannya ikut
    // urutan ambil dari DB dan beda sendiri dari Export Excel & layar.
    const all = (await fetchAllRows(applied, true)).sort(bandingKode)
    const uraian = await fetchUraian(all.map(r => r.kode))
    const hapus = await fetchHapusInfo(all.filter(r => r.status !== 'aktif').map(r => r.id))
    const keys = exportColsFor(applied.golongan)
    exportToExcel(all.map(r => {
      const cell = (key: string): string | number => {
        switch (key) {
          case 'skpd': return skpdMap[r.skpd_id ?? -1] || ''
          case 'nama': return r.nama_barang || ''
          case 'kode': return r.kode
          case 'uraian': return uraian[r.kode] || ''
          case 'nibar': return r.nibar || ''
          // String, BUKAN angka — 45 digit sbg numerik jadi notasi ilmiah di
          // Excel & digit belakangnya hilang tanpa suara.
          case 'kode_register': return r.kode_register || ''
          case 'merek': return r.merek_tipe || ''
          case 'spesifikasi': return r.spesifikasi_lainnya || ''
          case 'lokasi': return r.alamat_detail || ''
          case 'komptabel': return r.intra_ekstra || ''
          case 'tgl': return r.tgl_perolehan || ''
          case 'nilai': return r.nilai_perolehan
          // Kosong → jatuh ke label cara perolehan (menu yang mencatat barang
          // ini). Di Excel tak ditandai apa-apa: bagi pembaca berkas keduanya
          // sama-sama "asal usul barang", dan penandaan cuma bikin bingung.
          case 'asal_usul': return asalUsulTampil(r.asal_usul, r.cara_perolehan).teks
          case 'penggunaan': return r.penggunaan_pengamanan || ''
          case 'keterangan': return r.keterangan || ''
          case 'luas': return luasOf(r) ?? ''
          case 'no_sertifikat': return r.nomor_dokumen_kepemilikan || ''
          case 'tgl_sertifikat': return r.tanggal_dokumen_kepemilikan || ''
          case 'atas_nama': return r.nama_dokumen_kepemilikan || ''
          case 'hak': return r.jenis_hak || ''
          default: return ''
        }
      }
      const obj: Record<string, string | number> = {}
      for (const k of keys) obj[COL_META[k].header] = cell(k)
      const hi = hapus.get(r.id)
      obj['Status'] = r.status === 'aktif' ? 'Aktif' : 'Dihapus'
      obj['Tgl Penghapusan'] = hi?.tgl || ''
      obj['No. SK Penghapusan'] = hi?.no_sk || ''
      obj['Jenis Penghapusan'] = HAPUS_LABEL[hi?.jenis || ''] || ''
      obj['Alasan Penghapusan'] = hi?.ket || ''
      return obj
    }), `Daftar_Barang_${applied.golongan}_AUDIT`, 'Daftar Barang (Audit)')
    } catch (e) {
      // Ini berkas untuk BPK/inspektorat — justru yang PALING tak boleh
      // terunduh dalam keadaan kurang sebagian.
      setErr(`gagal menyiapkan Export Audit: ${(e as Error).message} — berkas tidak dibuat supaya tidak ada Excel setengah jadi yang beredar.`)
    } finally {
      setExporting(false)
    }
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)
  const skpdNama = applied?.skpdId ? skpdMap[applied.skpdId] : undefined
  const cols = applied ? colsFor(applied.golongan) : DEFAULT_COLS
  const nilaiIdx = cols.indexOf('nilai')

  // SKPD pemilik pada periode terpilih (period-aware): override kalau barang
  // pernah dialihkan; kalau tidak, pakai skpd_id terkini.
  const ownerSkpd = (r: Row): number | null => posisiOverride.get(r.id)?.skpd ?? r.skpd_id

  function cellContent(key: string, r: Row): React.ReactNode {
    switch (key) {
      case 'skpd': return skpdMap[ownerSkpd(r) ?? -1] || '-'
      case 'nama': {
        // Kode register DIBACA dari kolom, tidak dihitung di sini — nomor urutnya
        // diterbitkan sekali lalu dibekukan oleh trigger di DB. Menghitungnya di
        // layar akan menggeser nomor semua barang di bawahnya tiap kali ada satu
        // yang hilang, padahal kode ini tercetak di label barang, KIR, dan BAST.
        const bergeser = bergeserDariNibar(r.nibar, r.kode_register)
        return (
        <>
          <p className="font-medium text-gray-800 text-xs">{r.nama_barang || '-'}</p>
          <p className="text-gray-400 text-xs mt-0.5">{r.nibar || '-'}</p>
          {/* Baris ketiga = kode register. Ditandai HANYA kalau bergeser dari
              NIBAR. `bergeser === null` (NIBAR kosong / warisan e-BMD yang
              layoutnya beda) sengaja tidak ditandai apa-apa: menandai 150rb
              barang warisan bikin 148 yang benar-benar bergeser tenggelam. */}
          <p className={`text-[11px] mt-0.5 ${bergeser ? 'text-amber-600 font-medium' : 'text-gray-300'}`}
            title={bergeser
              ? 'Kode register: posisi barang ini sudah bergeser dari NIBAR-nya (pernah pindah unit / reklas)'
              : 'Kode register (posisi terakhir barang)'}>
            {r.kode_register ? `REG ${r.kode_register}${bergeser ? ' ⚠' : ''}` : 'REG —'}
          </p>
          {(bidangCount[r.id]?.n || 0) > 0 && (
            <Link href={`/dashboard/gis?cari=${encodeURIComponent(r.nibar || '')}`}
              className="inline-flex items-center gap-1 mt-1 text-[11px] text-teal hover:underline"
              title="Tanah ini terbagi beberapa bidang/sertifikat — kelola & lihat di GIS Tanah">
              🗺 {bidangCount[r.id].n} bidang
            </Link>
          )}
        </>
        )
      }
      case 'kode': return (
        <>
          <p className="font-medium text-gray-700 text-xs">{r.kode}</p>
          <p className="text-gray-400 text-xs mt-0.5">{uraianMap[r.kode] || '-'}</p>
        </>
      )
      case 'uraian': return uraianMap[r.kode] || '-'
      case 'merek': return r.merek_tipe || '-'
      case 'spesifikasi': return r.spesifikasi_lainnya || '-'
      case 'lokasi': return r.alamat_detail || '-'
      case 'komptabel': return r.intra_ekstra || '-'
      case 'tgl': return r.tgl_perolehan || '-'
      case 'nilai': return angka(r.nilai_perolehan)
      case 'asal_usul': {
        // Isian operator menang; kalau kosong pakai label cara perolehan.
        // Yang turunan dibuat lebih redup + ber-tooltip supaya operator tahu
        // itu bukan hasil ketikan siapa pun & masih bisa diperinci lewat
        // Koreksi → Spesifikasi (mis. jadi "Pengadaan APBD").
        const { teks, turunan } = asalUsulTampil(r.asal_usul, r.cara_perolehan)
        if (!teks) return '-'
        if (!turunan) return teks
        return (
          <span className="text-gray-400 italic" title="Belum diisi — ditampilkan dari cara perolehan barang ini. Isi lebih rinci lewat Pembukuan → Koreksi → Spesifikasi Barang.">
            {teks}
          </span>
        )
      }
      case 'penggunaan': return r.penggunaan_pengamanan || '-'
      case 'keterangan': return r.keterangan || '-'
      case 'luas': { const v = luasOf(r); return v != null ? angka(v) : '-' }
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
            <SkpdCombobox lockToOperator onChangeSelection={sel => setFSel({ skpdId: sel.skpdId, descIds: sel.descendantIds })} allowClear
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

      {err && (
        <div className="card border-red-200 bg-red-50 p-4 text-sm text-red-700">{err}</div>
      )}

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
