'use client'
// Saldo Awal → Daftar Barang Awal. Gabungan Daftar Barang + Penyusutan pada posisi
// saldo awal 2026 (= saldo akhir 2025), sumber aset_awal_2026 (angka penyusutan
// baseline: masa manfaat, beban/smt, akumulasi 2025, nilai buku awal, sisa).
//
// KOLOM MENGIKUTI DAFTAR BARANG per jenis aset (BASE_COLS = salinan persis COLS
// di app/dashboard/daftar-barang/page.tsx), lalu DISISIPI kolom penyusutan
// baseline di sekitar Nilai Perolehan: Masa Manfaat sebelum, Beban/Smt ·
// Akumulasi 2025 · Nilai Buku Awal · Sisa sesudah. Jenis aset yang MEMANG TIDAK
// DISUSUTKAN (Tanah 1.3.1, Aset Tetap Lainnya 1.3.5, KDP 1.3.6 — flag
// `disusutkan` di GOLONGAN_REKAP) TIDAK dapat kolom-kolom itu sama sekali:
// isinya cuma nol/duplikat nilai perolehan, cuma bikin tabel melar.
// "Lokasi" di sini = `alamat_detail` + rantai wilayah (`wilayah_kode` → Desa,
// Kec., Kabupaten), sementara Daftar Barang baru menampilkan alamat_detail saja.
//
// TANAH — luas & lokasi punya DUA kemungkinan sumber, dan bidang yang menang:
// kalau asetnya punya baris di `aset_bidang_tanah` (menu GIS Tanah), Luas = Σ
// bidang & Lokasi diringkas dari bidang-bidangnya; kalau belum punya bidang
// sama sekali, jatuh ke kolom snapshot yang BOLEH diisi manual lewat Edit
// Spesifikasi (TANAH_TANPA_BIDANG_FIELDS di lib/asetFields.ts). Σ-nya dihitung
// SAAT TAMPIL, sengaja TIDAK disimpan balik ke kolom mana pun: angka tersimpan
// bakal basi tiap bidang ditambah/diedit/dihapus (tak ada trigger/cron yang
// menjaganya), dan snapshot 2025 tak boleh ikut bergerak mengikuti data hidup.
// Aturan yang sama dipakai Daftar Barang, bedanya cadangannya `aset.luas`.
//
// TAMPILAN mengikuti pola Daftar Barang juga: hasil ≤ SHOW_ALL_MAX baris →
// tampilkan SEMUA sekaligus (tanpa halaman); lebih dari itu → paginasi SERVER
// (range PostgREST, 50/hal). Sengaja TIDAK menarik semua baris golongan ke
// browser seperti Daftar Barang: di sini tak ada visibilitas period-aware yang
// harus dihitung di client, jadi paginasi server tetap yang benar (CLAUDE.md
// "PERFORMA Daftar Barang & Penyusutan"). ⚠️ Halaman ini baca TABEL LANGSUNG
// (bukan RPC spt Rekapitulasi) — RLS-nya WAJIB InitPlan (migrasi 20260728_02),
// kalau tidak query tanpa filter SKPD tembus statement timeout.
//
// Koreksi SPESIFIKASI (bukan angka) bisa dilakukan langsung di sini — centang
// barang → "Edit Spesifikasi". Angkanya beku & dikunci di DB (migrasi
// 20260728_01: GRANT per-kolom + trigger). Simpan menulis ke DUA tabel
// sekaligus: snapshot `aset_awal_2026` + kolom yang sama di register `aset`
// (dicocokkan NIBAR), keduanya UPDATE biasa TANPA event ledger — spesifikasi
// itu data deskriptif, bukan peristiwa akuntansi (pola sama dgn KIR). Yang
// butuh jejak audit + tombol Batal tetap lewat Pembukuan → Koreksi.
//
// HANYA untuk barang yang BELUM BERGERAK: aset yang pernah kena koreksi
// spesifikasi, reklas kode/golongan, atau pindah SKPD ditandai 🔒 dan centangnya
// mati — koreksinya wajib lewat menu Koreksi. Penegaknya trigger DB (migrasi
// 20260728_01 bagian 3); 🔒 di sini cuma biar operator tak klik lalu kena error.
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { exportToExcel } from '@/lib/export'
import { GOLONGAN_REKAP, kodeLevel3 } from '@/lib/bmd'
import { koreksiFieldKeys, allSameGolongan, ASET_NUM_COLS, type FieldKey } from '@/lib/asetFields'
import SkpdCombobox, { type SkpdSelection as OrgSelection } from '@/components/SkpdCombobox'
import KomptabelRadio from '@/components/KomptabelRadio'
import EditSpesifikasiModal from '@/components/pengelolaan/EditSpesifikasiModal'
import { useIsViewer } from '@/components/useIsViewer'

const PAGE_SIZE = 50
const SHOW_ALL_MAX = 3000 // di bawah ini → render semua baris tanpa halaman

type Row = {
  nibar: string; kode: string; nama_barang: string; skpd_id: number
  intra_ekstra: string | null; tgl_perolehan: string | null; nilai_perolehan: number
  akumulasi_2025: number; nilai_buku_awal: number; sisa_masa_manfaat_smt: number
  masa_manfaat_smt: number | null; beban_penyusutan_per_smt: number | null
  foto_paths: string[] | null
  // Kolom spesifikasi — dipakai kolom per jenis aset (sama spt Daftar Barang)
  merek_tipe: string | null; spesifikasi_lainnya: string | null
  alamat_detail: string | null; wilayah_kode: string | null
  luas: number | null; jenis_hak: string | null
  asal_usul: string | null; penggunaan_pengamanan: string | null
}
type Applied = { org: OrgSelection; golongan: string; komptabel: string; search: string }
// Rekap bidang tanah per aset (dari aset_bidang_tanah, menu GIS Tanah).
// luas = Σ bidang; wilayah/alamat = daftar UNIK (satu register bisa banyak bidang).
type BidangAgg = { n: number; luas: number | null; wilayah: string[]; alamat: string[] }

const COLS = [
  'nibar', 'kode', 'nama_barang', 'skpd_id', 'intra_ekstra', 'tgl_perolehan', 'nilai_perolehan',
  'akumulasi_2025', 'sisa_masa_manfaat_smt', 'nilai_buku_awal', 'masa_manfaat_smt',
  'beban_penyusutan_per_smt', 'foto_paths',
  'merek_tipe', 'spesifikasi_lainnya', 'alamat_detail', 'wilayah_kode', 'luas', 'jenis_hak',
  'asal_usul', 'penggunaan_pengamanan',
].join(',')

const angka = (v: number | null | undefined) =>
  v == null ? '-' : new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(v)
const golLabel = (kode: string) => GOLONGAN_REKAP.find(g => g.kode === kodeLevel3(kode))?.uraian || kodeLevel3(kode)
const newKey = () => Math.random().toString(36).slice(2)

// ── Kolom per jenis aset ────────────────────────────────────────────────────
const COL_META: Record<string, { header: string; align?: 'right' | 'center' }> = {
  skpd: { header: 'SKPD' }, kode: { header: 'Kode Barang' }, nama: { header: 'Nama Barang' },
  merek: { header: 'Merek / Tipe' }, spesifikasi: { header: 'Spesifikasi Lainnya' },
  lokasi: { header: 'Lokasi' }, luas: { header: 'Luas (m²)', align: 'right' }, hak: { header: 'Jenis Hak' },
  komptabel: { header: 'Komptabel', align: 'center' }, tgl: { header: 'Tgl Perolehan' },
  mm: { header: 'Masa Manfaat (Smt)', align: 'center' },
  nilai: { header: 'Nilai Perolehan', align: 'right' },
  beban: { header: 'Beban / Smt', align: 'right' },
  akum: { header: 'Akumulasi 2025', align: 'right' },
  buku: { header: 'Nilai Buku Awal', align: 'right' },
  sisa: { header: 'Sisa (Smt)', align: 'center' },
  asal_usul: { header: 'Asal Usul' }, penggunaan: { header: 'Penggunaan' },
  keterangan: { header: 'Keterangan' },
}

// SALINAN PERSIS kolom layar Daftar Barang (app/dashboard/daftar-barang/page.tsx
// → COLS). Kalau di sana berubah, samakan di sini — dua menu ini memang sengaja
// menampilkan barang yang sama dgn kolom yang sama, bedanya cuma posisi waktu.
const BASE_COLS: Record<string, string[]> = {
  '1.3.1': ['skpd', 'kode', 'nama', 'lokasi', 'tgl', 'luas', 'hak', 'nilai', 'asal_usul', 'penggunaan', 'keterangan'], // Tanah — tanpa komptabel
  '1.3.2': ['skpd', 'kode', 'nama', 'merek', 'spesifikasi', 'tgl', 'komptabel', 'nilai', 'asal_usul', 'penggunaan', 'keterangan'],
  '1.3.3': ['skpd', 'kode', 'nama', 'lokasi', 'tgl', 'komptabel', 'nilai', 'asal_usul', 'penggunaan', 'keterangan'],
  '1.3.4': ['skpd', 'kode', 'nama', 'lokasi', 'tgl', 'komptabel', 'nilai', 'asal_usul', 'penggunaan', 'keterangan'],
  '1.3.5': ['skpd', 'kode', 'nama', 'merek', 'tgl', 'komptabel', 'nilai', 'asal_usul', 'penggunaan', 'keterangan'],
  '1.3.6': ['skpd', 'kode', 'nama', 'lokasi', 'tgl', 'komptabel', 'nilai', 'asal_usul', 'penggunaan', 'keterangan'],
  '1.5.3': ['skpd', 'kode', 'nama', 'tgl', 'komptabel', 'nilai', 'asal_usul', 'penggunaan', 'keterangan'],
  '1.5.4': ['skpd', 'kode', 'nama', 'merek', 'lokasi', 'tgl', 'komptabel', 'nilai', 'asal_usul', 'penggunaan', 'keterangan'],
}
const BASE_DEFAULT = ['skpd', 'kode', 'nama', 'tgl', 'komptabel', 'nilai', 'asal_usul', 'penggunaan', 'keterangan']

// Kolom penyusutan baseline — disisipkan mengapit Nilai Perolehan.
const SUSUT_SEBELUM = ['mm']
const SUSUT_SESUDAH = ['beban', 'akum', 'buku', 'sisa']
const SUSUT_KEYS = new Set([...SUSUT_SEBELUM, ...SUSUT_SESUDAH])
// Jenis aset yang tidak pernah disusutkan → tak usah dibuatkan kolomnya.
// "Semua Jenis Aset" (golongan kosong) = campuran → kolomnya tetap ditampilkan.
const disusutkan = (golongan: string) =>
  golongan === '' || (GOLONGAN_REKAP.find(g => g.kode === golongan)?.disusutkan ?? true)

function colsFor(golongan: string): string[] {
  const base = BASE_COLS[golongan] || BASE_DEFAULT
  if (!disusutkan(golongan)) return base
  const out: string[] = []
  for (const k of base) {
    if (k === 'nilai') out.push(...SUSUT_SEBELUM, 'nilai', ...SUSUT_SESUDAH)
    else out.push(k)
  }
  return out
}

// Kolom yang dijumlahkan di baris TOTAL (rupiah saja — masa manfaat & sisa tidak).
const TOTAL_KEYS = new Set(['nilai', 'beban', 'akum', 'buku'])

function thClass(key: string) {
  const a = COL_META[key]?.align
  return `table-th${a === 'right' ? ' text-right' : a === 'center' ? ' text-center' : ''}`
}
function tdClass(key: string) {
  if (key === 'nama' || key === 'kode') return 'table-td align-top'
  const a = COL_META[key]?.align
  if (a === 'right') return 'table-td text-right text-xs'
  if (a === 'center') return 'table-td text-center text-xs' + (key === 'komptabel' ? ' capitalize' : '')
  return 'table-td text-xs text-gray-600 align-top'
}

export default function Page() {
  const supabase = createClient()
  const isViewer = useIsViewer()
  const [org, setOrg] = useState<OrgSelection>({ skpdId: null, descendantIds: null })
  const [golongan, setGolongan] = useState('')
  const [komptabel, setKomptabel] = useState('')
  const [search, setSearch] = useState('')
  const [applied, setApplied] = useState<Applied | null>(null)
  const [rows, setRows] = useState<Row[]>([])
  const [ketMap, setKetMap] = useState<Record<string, string>>({})
  const [uraianMap, setUraianMap] = useState<Record<string, string>>({})
  const [total, setTotal] = useState(0)
  const [showAll, setShowAll] = useState(false) // hasil ≤ SHOW_ALL_MAX → semua baris tampil
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(false)
  const [loadErr, setLoadErr] = useState('')
  const [exporting, setExporting] = useState(false)
  const [skpdNama, setSkpdNama] = useState<Record<number, string>>({})
  // wilayah_kode → "Desa, Kec. X, Kabupaten Y" (rantai induk sudah dirangkai)
  const [wilayahNama, setWilayahNama] = useState<Record<string, string>>({})
  // NIBAR → rekap bidang tanah (hanya golongan 1.3.1 yang punya isi)
  const [bidang, setBidang] = useState<Record<string, BidangAgg>>({})
  // ── Koreksi spesifikasi: centang barang (multi) → popup EditSpesifikasiModal ──
  const [sel, setSel] = useState<Record<string, Row>>({}) // key = NIBAR
  const [spekOpen, setSpekOpen] = useState(false)
  const [spekPrefix, setSpekPrefix] = useState('')
  // Field yang ditawarkan popup — dihitung saat dibuka (bukan saat render),
  // karena untuk Tanah isinya bergantung ada/tidaknya bidang.
  const [spekKeys, setSpekKeys] = useState<FieldKey[]>([])
  const [spekInitFields, setSpekInitFields] = useState<Record<string, string>>({})
  const [spekInitFoto, setSpekInitFoto] = useState<string[]>([])
  const [spekMsg, setSpekMsg] = useState('')
  const [spekErr, setSpekErr] = useState('')
  const [spekSaving, setSpekSaving] = useState(false)
  // NIBAR yang TERKUNCI dari pintu ini: asetnya pernah kena transaksi yang
  // menyentuh spesifikasi/golongan/SKPD → koreksinya wajib lewat menu Koreksi
  // (lihat migrasi 20260728_01 bagian 3). Dihitung server-side per halaman.
  const [terkunci, setTerkunci] = useState<Set<string>>(new Set())

  useEffect(() => {
    (async () => {
      const map: Record<number, string> = {}
      for (let from = 0; ; from += 1000) {
        const { data } = await supabase.from('admin_skpd').select('id,nama').range(from, from + 999)
        if (!data || data.length === 0) break
        for (const s of data) map[s.id] = s.nama
        if (data.length < 1000) break
      }
      setSkpdNama(map)
    })()
    // Wilayah: dataset kecil (Jatim + Kab./Kota Kediri, ~400 baris) → tarik
    // sekali, rangkai rantai induknya di sini. Provinsi sengaja dibuang (semua
    // aset di Jatim, cuma bikin panjang); level 3 diberi awalan "Kec." karena
    // seed-nya nama polos, sedangkan level 2 sudah "Kabupaten/Kota ...".
    ;(async () => {
      type W = { kode: string; nama: string; level: number; parent_kode: string | null }
      const all: W[] = []
      for (let from = 0; ; from += 1000) {
        const { data } = await supabase.from('admin_wilayah').select('kode,nama,level,parent_kode').range(from, from + 999)
        if (!data || data.length === 0) break
        all.push(...(data as W[]))
        if (data.length < 1000) break
      }
      const byKode = new Map(all.map(w => [w.kode, w]))
      const label: Record<string, string> = {}
      for (const w of all) {
        const parts: string[] = []
        let cur: W | undefined = w
        while (cur) {
          if (cur.level >= 2) parts.push(cur.level === 3 ? `Kec. ${cur.nama}` : cur.nama)
          cur = cur.parent_kode ? byKode.get(cur.parent_kode) : undefined
        }
        label[w.kode] = parts.join(', ')
      }
      setWilayahNama(label)
    })()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Tanah semuanya intrakomptabel — filternya disembunyikan (pola Daftar Barang)
  // DAN nilainya dikosongkan, biar sisa pilihan lama tak diam-diam ikut menyaring.
  useEffect(() => { if (golongan === '1.3.1' && komptabel) setKomptabel('') }, [golongan]) // eslint-disable-line react-hooks/exhaustive-deps

  function buildQuery(f: Applied, opts: { count?: boolean; head?: boolean } = {}) {
    let q = supabase.from('aset_awal_2026')
      .select(COLS, opts.count ? { count: 'exact', head: opts.head } : undefined)
    if (f.org.descendantIds) q = q.in('skpd_id', f.org.descendantIds)
    if (f.golongan) q = q.like('kode', `${f.golongan}.%`)
    if (f.komptabel) q = q.eq('intra_ekstra', f.komptabel)
    if (f.search) q = q.or(`nama_barang.ilike.%${f.search}%,nibar.ilike.%${f.search}%,kode.ilike.${f.search}%`)
    // NIBAR sbg pemecah seri: tanpa itu urutan baris bernilai sama tak stabil
    // antar-request → baris bisa dobel/hilang saat pindah halaman.
    return q.order('nilai_perolehan', { ascending: false }).order('nibar', { ascending: true })
  }

  // Register `aset` per NIBAR: keterangan (sengaja versi TERKINI, bukan kolom
  // keterangan di snapshot — sama dgn yang tampil di Daftar Barang) + `id`, yang
  // dibutuhkan untuk menengok bidang tanah (aset_bidang_tanah pakai aset_id,
  // sementara halaman ini berkunci NIBAR).
  async function fetchAsetInfo(nibars: string[]) {
    const map: Record<string, { id: string; keterangan: string | null }> = {}
    for (let i = 0; i < nibars.length; i += 500) {
      const { data } = await supabase.from('aset').select('id,nibar,keterangan').in('nibar', nibars.slice(i, i + 500))
      for (const a of (data || []) as { id: string; nibar: string | null; keterangan: string | null }[]) {
        if (a.nibar) map[a.nibar] = { id: a.id, keterangan: a.keterangan }
      }
    }
    return map
  }

  // Bidang tanah per aset (kalau ada) — luas & lokasi Tanah yang sebenarnya
  // dikelola PER BIDANG di menu GIS Tanah, bukan di kolom `luas`/`alamat_detail`
  // level register. Yang punya bidang: luas = Σ bidang (dihitung SAAT TAMPIL,
  // sengaja TIDAK disimpan ke kolom mana pun — angka tersimpan bakal basi tiap
  // bidang ditambah/diedit/dihapus, dan snapshot 2025 tak boleh ikut bergerak
  // mengikuti data hidup). Yang belum punya bidang: jatuh ke kolom snapshot,
  // yang boleh diisi manual lewat Edit Spesifikasi (lihat TANAH_TANPA_BIDANG_FIELDS).
  async function fetchBidang(info: Record<string, { id: string }>, rs: Row[]) {
    const tanah = rs.filter(r => kodeLevel3(r.kode) === '1.3.1' && info[r.nibar])
    if (tanah.length === 0) return {}
    const nibarByAset = new Map(tanah.map(r => [info[r.nibar].id, r.nibar]))
    const ids = [...nibarByAset.keys()]
    const agg: Record<string, BidangAgg> = {}
    for (let i = 0; i < ids.length; i += 500) {
      const { data } = await supabase.from('aset_bidang_tanah')
        .select('aset_id,luas,wilayah_kode,alamat_detail').in('aset_id', ids.slice(i, i + 500))
      for (const b of (data || []) as { aset_id: string; luas: number | null; wilayah_kode: string | null; alamat_detail: string | null }[]) {
        const nibar = nibarByAset.get(b.aset_id)
        if (!nibar) continue
        const a = agg[nibar] || (agg[nibar] = { n: 0, luas: null, wilayah: [], alamat: [] })
        a.n++
        if (b.luas != null) a.luas = (a.luas ?? 0) + Number(b.luas)
        if (b.wilayah_kode && !a.wilayah.includes(b.wilayah_kode)) a.wilayah.push(b.wilayah_kode)
        if (b.alamat_detail && !a.alamat.includes(b.alamat_detail)) a.alamat.push(b.alamat_detail)
      }
    }
    return agg
  }

  // Uraian (nama baku kodefikasi) per kode — ditumpuk di bawah Kode Barang,
  // sama persis dgn Daftar Barang.
  async function fetchUraian(kodes: string[]) {
    const uniq = [...new Set(kodes)]
    const map: Record<string, string> = {}
    for (let i = 0; i < uniq.length; i += 200) {
      const { data } = await supabase.from('admin_kodefikasi_bmd').select('kode,uraian').in('kode', uniq.slice(i, i + 200))
      for (const r of (data || []) as { kode: string; uraian: string | null }[]) if (r.uraian) map[r.kode] = r.uraian
    }
    return map
  }

  async function load(f: Applied, pg: number) {
    setLoading(true)
    setLoadErr('')
    // Hitung dulu (head → tanpa bawa baris): dari jumlahnya baru diputuskan
    // tampil semua atau per halaman.
    const { count, error: cErr } = await buildQuery(f, { count: true, head: true })
    if (cErr) { gagalMuat(cErr.message); return }
    const tot = count || 0
    const semua = tot > 0 && tot <= SHOW_ALL_MAX

    let rs: Row[] = []
    if (semua) {
      for (let from = 0; from < tot; from += 1000) {
        const { data, error } = await buildQuery(f).range(from, from + 999)
        if (error) { gagalMuat(error.message); return }
        if (!data || data.length === 0) break
        rs.push(...(data as unknown as Row[]))
        if (data.length < 1000) break
      }
    } else {
      const { data, error } = await buildQuery(f).range(pg * PAGE_SIZE, (pg + 1) * PAGE_SIZE - 1)
      if (error) { gagalMuat(error.message); return }
      rs = (data as unknown as Row[]) || []
    }

    setRows(rs)
    setTotal(tot)
    setShowAll(semua)
    const info = await fetchAsetInfo(rs.map(r => r.nibar))
    const ket: Record<string, string> = {}
    for (const [nibar, a] of Object.entries(info)) if (a.keterangan) ket[nibar] = a.keterangan
    setKetMap(ket)
    setBidang(await fetchBidang(info, rs))
    setUraianMap(await fetchUraian(rs.map(r => r.kode)))
    setTerkunci(await fetchTerkunci(rs.map(r => r.nibar)))
    setSel({}) // seleksi lama tak lagi nyambung dgn baris yang tampil
    setLoading(false)
  }

  // Kegagalan query TIDAK BOLEH tampil sebagai "0 barang" — dulu `error`
  // diabaikan, jadi statement timeout (RLS aset_awal_2026 belum InitPlan,
  // lihat migrasi 20260728_02) terbaca operator sebagai "datanya memang kosong".
  function gagalMuat(pesan: string) {
    setRows([]); setTotal(0); setShowAll(false); setKetMap({}); setUraianMap({}); setTerkunci(new Set())
    setLoadErr(/timeout|57014/i.test(pesan)
      ? `Database kehabisan waktu memuat data ini (${pesan}). Kalau ini muncul terus, migrasi 20260728_02 kemungkinan belum dijalankan — sementara persempit dulu filternya (pilih SKPD).`
      : `Gagal memuat data: ${pesan}`)
    setLoading(false)
  }

  // Penegak sesungguhnya tetap trigger DB — ini cuma supaya operator tak klik
  // lalu kena error. Gagal RPC (mis. migrasi belum dijalankan) → set kosong,
  // tombolnya tetap hidup dan DB yang menolak.
  async function fetchTerkunci(nibars: string[]) {
    const out = new Set<string>()
    for (let i = 0; i < nibars.length; i += 500) {
      const { data } = await supabase.rpc('fn_aset_awal_2026_terkunci_batch', { p_nibars: nibars.slice(i, i + 500) })
      for (const d of (data || []) as { nibar: string }[]) out.add(d.nibar)
    }
    return out
  }

  function tampilkan() {
    const f: Applied = { org, golongan, komptabel, search }
    setApplied(f); setPage(0); load(f, 0)
  }
  function goPage(pg: number) { if (applied) { setPage(pg); load(applied, pg) } }

  // ── Koreksi spesifikasi ───────────────────────────────────────────────────
  const selList = Object.values(sel)
  const selSameGol = allSameGolongan(selList.map(r => r.kode))

  function toggleSel(r: Row) {
    if (terkunci.has(r.nibar)) return
    setSel(prev => {
      const next = { ...prev }
      if (next[r.nibar]) delete next[r.nibar]; else next[r.nibar] = r
      return next
    })
    setSpekMsg(''); setSpekErr('')
  }

  // Tanah: luas & lokasi cuma boleh dikoreksi dari sini kalau SEMUA yang
  // dicentang belum punya bidang. Yang sudah punya → GIS Tanah yang berwenang
  // (kalau tidak, angka manual di sini bakal ketutup Σ bidang & bikin bingung).
  const spekTanpaBidang = selList.every(r => !(bidang[r.nibar]?.n))

  // Buka popup: 1 barang → prefill nilai sekarang (dari snapshot, itu yang
  // ditampilkan halaman ini); banyak barang → kosong (isi = diterapkan ke semua).
  async function openSpek() {
    if (selList.length === 0 || !selSameGol) return
    setSpekMsg(''); setSpekErr('')
    const single = selList.length === 1
    setSpekPrefix(`draft/saldo-awal-spek/${single ? selList[0].nibar : newKey()}`)
    const keys = koreksiFieldKeys(selList[0].kode, { tanahTanpaBidang: spekTanpaBidang })
    setSpekKeys(keys)
    if (single) {
      const { data } = await supabase.from('aset_awal_2026')
        .select([...keys, 'foto_paths'].join(',')).eq('nibar', selList[0].nibar).single()
      const row = (data || {}) as Record<string, unknown>
      const f: Record<string, string> = {}
      for (const k of keys) { const v = row[k]; if (v != null) f[k] = String(v) }
      setSpekInitFields(f)
      setSpekInitFoto(Array.isArray(row.foto_paths) ? (row.foto_paths as string[]) : [])
    } else {
      setSpekInitFields({}); setSpekInitFoto([])
    }
    setSpekOpen(true)
  }

  // Commit langsung (halaman ini tak punya kartu jurnal — tak ada tombol Simpan
  // terpisah spt menu Koreksi). Menulis ke snapshot + register `aset` by NIBAR.
  async function simpanSpek(fields: Record<string, string>, foto: { replace?: string[]; append?: string[] }) {
    const list = selList
    const single = list.length === 1
    // Modal ditutup DULU: pesan hasil/error tampil di strip halaman, yang bakal
    // ketutup overlay modal (z-50) kalau modalnya dibiarkan terbuka.
    setSpekOpen(false); setSpekMsg(''); setSpekErr('')
    // Single: modal prefill nilai sekarang → simpan HANYA yang berubah.
    // Bulk: initial kosong → semua yang diisi = perubahan, diterapkan ke semua.
    const initial = single ? spekInitFields : {}
    const base: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(fields)) {
      const val = (v ?? '').toString().trim()
      if (val === '' || val === (initial[k] ?? '').toString().trim()) continue
      if (ASET_NUM_COLS.has(k) || k === 'tahun_pengadaan') { const n = Number(val); if (Number.isFinite(n)) base[k] = n }
      else base[k] = val
    }
    const fotoReplace = single ? (foto.replace || []) : null
    const fotoAppend = !single ? (foto.append || []) : null
    const fotoBerubah = single ? JSON.stringify(fotoReplace) !== JSON.stringify(spekInitFoto) : (fotoAppend?.length ?? 0) > 0
    if (Object.keys(base).length === 0 && !fotoBerubah) { setSpekErr('Tidak ada field yang diubah — centangannya masih utuh, klik "Edit Spesifikasi" lagi.'); return }
    setSpekSaving(true)

    // Foto di `aset` bisa beda dari snapshot (mis. ditambah lewat menu Koreksi
    // setelah baseline dibekukan) → append relatif ke daftar masing-masing tabel.
    const nibars = list.map(r => r.nibar)
    const fotoAset = new Map<string, string[]>()
    for (let i = 0; i < nibars.length; i += 300) {
      const { data } = await supabase.from('aset').select('nibar,foto_paths').in('nibar', nibars.slice(i, i + 300))
      for (const a of (data || []) as { nibar: string | null; foto_paths: string[] | null }[]) {
        if (a.nibar) fotoAset.set(a.nibar, a.foto_paths || [])
      }
    }

    let okSnapshot = 0, okAset = 0
    for (const r of list) {
      const patchSnapshot: Record<string, unknown> = { ...base }
      const patchAset: Record<string, unknown> = { ...base }
      if (fotoBerubah) {
        if (single) { patchSnapshot.foto_paths = fotoReplace; patchAset.foto_paths = fotoReplace }
        else {
          patchSnapshot.foto_paths = [...(r.foto_paths || []), ...(fotoAppend || [])]
          patchAset.foto_paths = [...(fotoAset.get(r.nibar) || []), ...(fotoAppend || [])]
        }
      }
      const nama = r.nama_barang || r.nibar
      const sudah = okSnapshot ? ` (${okSnapshot} barang sebelumnya sudah tersimpan)` : ''
      const gagal = (pesan: string) => { setSpekSaving(false); setSpekErr(pesan); if (applied) load(applied, page) }
      // `.select()` WAJIB: UPDATE yang ditolak RLS tidak melempar error, cuma
      // mengembalikan 0 baris — tanpa ini kegagalan (mis. migrasi 20260728_01
      // belum dijalankan, policy sa_update belum ada) dilaporkan sbg "berhasil".
      const { data: d1, error: e1 } = await supabase.from('aset_awal_2026').update(patchSnapshot).eq('nibar', r.nibar).select('nibar')
      if (e1) { gagal(`Gagal menyimpan "${nama}": ${e1.message}${sudah}`); return }
      if (!d1 || d1.length === 0) { gagal(`Perubahan "${nama}" ditolak database — barang di luar wewenang SKPD-mu, atau migrasi 20260728_01 belum dijalankan.${sudah}`); return }
      okSnapshot++
      // Register `aset`: barang baseline yang sudah dihapus/tak pernah termigrasi
      // bisa saja tak punya baris pasangan — bukan error, cuma dilaporkan.
      if (fotoAset.has(r.nibar)) {
        const { data: d2, error: e2 } = await supabase.from('aset').update(patchAset).eq('nibar', r.nibar).select('nibar')
        if (e2) { gagal(`Saldo awal "${nama}" tersimpan, tapi register aset gagal: ${e2.message}`); return }
        if (d2 && d2.length > 0) okAset++
      }
    }

    setSpekSaving(false); setSel({})
    setSpekMsg(okAset === okSnapshot
      ? `${okSnapshot} barang diperbarui (saldo awal + register aset).`
      : `${okSnapshot} barang diperbarui di saldo awal; ${okAset} di antaranya punya pasangan di register aset (sisanya tidak ada / di luar wewenangmu).`)
    if (applied) load(applied, page)
  }

  // ── Luas & Lokasi: bidang tanah menang, kolom snapshot jadi cadangan ───────
  // Aturannya sama persis dipakai Daftar Barang (bedanya cadangannya `aset.luas`),
  // supaya angka di dua menu tak pernah beda tanpa sebab.
  // Parameter `bd` bisa diisi peta bidang lain (dipakai Export, yang cakupan
  // barisnya lebih luas dari layar); default = milik halaman.
  const luasOf = (r: Row, bd: Record<string, BidangAgg> = bidang): number | null => {
    const b = bd[r.nibar]
    return b && b.luas != null ? b.luas : r.luas
  }
  // Satu register bisa punya banyak bidang di lokasi berbeda — kalau tak bisa
  // diringkas jadi satu baris, jangan dipaksakan: tunjuk saja ke GIS Tanah.
  function lokasiOf(r: Row, bd: Record<string, BidangAgg> = bidang): { alamat: string; wilayah: string } {
    const b = bd[r.nibar]
    if (b && b.n > 0) {
      const wil = [...new Set(b.wilayah.map(k => wilayahNama[k]).filter(Boolean))]
      const wilayah = wil.length === 0 ? '' : wil.length <= 2 ? wil.join(' · ') : `${wil.length} wilayah — lihat GIS Tanah`
      const alamat = b.alamat.length === 0 ? '' : b.alamat.length === 1 ? b.alamat[0] : `${b.n} bidang`
      if (wilayah || alamat) return { alamat, wilayah }
      // Bidangnya ada tapi lokasinya belum diisi → jangan tampilkan kosong,
      // pakai apa yang ada di snapshot.
    }
    return { alamat: r.alamat_detail || '', wilayah: r.wilayah_kode ? (wilayahNama[r.wilayah_kode] || '') : '' }
  }

  // Nilai polos per kolom — dipakai Export (layar pakai cellContent yang boleh JSX).
  function cellValue(key: string, r: Row, bd: Record<string, BidangAgg> = bidang): string | number {
    switch (key) {
      case 'skpd': return skpdNama[r.skpd_id] || ''
      case 'kode': return r.kode
      case 'uraian': return uraianMap[r.kode] || ''
      case 'nama': return r.nama_barang || ''
      case 'merek': return r.merek_tipe || ''
      case 'spesifikasi': return r.spesifikasi_lainnya || ''
      // Lokasi = alamat jalan + wilayah administratif (dua kolom DB yang beda,
      // digabung; di layar ditumpuk, di Excel jadi satu sel).
      case 'lokasi': { const l = lokasiOf(r, bd); return [l.alamat, l.wilayah].filter(Boolean).join(' — ') }
      case 'luas': return luasOf(r, bd) ?? ''
      case 'hak': return r.jenis_hak || ''
      case 'komptabel': return r.intra_ekstra || ''
      case 'tgl': return r.tgl_perolehan || ''
      case 'mm': return r.masa_manfaat_smt ?? ''
      case 'nilai': return r.nilai_perolehan
      case 'beban': return r.beban_penyusutan_per_smt ?? ''
      case 'akum': return r.akumulasi_2025
      case 'buku': return r.nilai_buku_awal
      case 'sisa': return r.sisa_masa_manfaat_smt
      case 'asal_usul': return r.asal_usul || ''
      case 'penggunaan': return r.penggunaan_pengamanan || ''
      case 'keterangan': return ketMap[r.nibar] || ''
      default: return ''
    }
  }

  function cellContent(key: string, r: Row): React.ReactNode {
    // Kode & Nama bertumpuk (uraian baku di bawah kode, NIBAR di bawah nama) —
    // pola yang sama dgn Daftar Barang.
    if (key === 'kode') return (
      <>
        <p className="font-medium text-gray-700 text-xs">{r.kode}</p>
        <p className="text-gray-400 text-xs mt-0.5">{uraianMap[r.kode] || '-'}</p>
      </>
    )
    if (key === 'nama') return (
      <>
        <p className="font-medium text-gray-800 text-xs">{r.nama_barang || '-'}</p>
        <p className="text-gray-400 text-xs mt-0.5">{r.nibar}</p>
      </>
    )
    if (key === 'lokasi') {
      const { alamat, wilayah } = lokasiOf(r)
      if (!alamat && !wilayah) return <span className="text-gray-300">-</span>
      return (
        <>
          <p className="text-xs text-gray-600">{alamat || '-'}</p>
          {wilayah && <p className="text-gray-400 text-xs mt-0.5">{wilayah}</p>}
        </>
      )
    }
    if (key === 'luas') {
      const b = bidang[r.nibar]
      const v = luasOf(r)
      return (
        <>
          <p className="text-xs text-gray-600">{v != null ? angka(v) : <span className="text-gray-300">-</span>}</p>
          {b && b.n > 0 && (
            <Link href={`/dashboard/gis?cari=${encodeURIComponent(r.nibar)}`}
              className="text-[11px] text-teal hover:underline"
              title="Luas ini penjumlahan bidang di GIS Tanah — koreksinya di sana, per bidang">
              Σ {b.n} bidang
            </Link>
          )}
        </>
      )
    }
    const v = cellValue(key, r)
    if (v === '' || v == null) return <span className="text-gray-300">-</span>
    if (typeof v === 'number' && (TOTAL_KEYS.has(key) || key === 'luas')) return angka(v)
    return v
  }

  async function handleExport() {
    if (!applied) return
    setExporting(true)
    // Layar boleh terpaginasi, ekspornya TIDAK — selalu seluruh hasil filter.
    const all: Row[] = []
    for (let from = 0; ; from += 1000) {
      const { data, error } = await buildQuery(applied).range(from, from + 999)
      if (error) { setExporting(false); setLoadErr(`Gagal mengekspor: ${error.message}`); return }
      if (!data || data.length === 0) break
      all.push(...(data as unknown as Row[]))
      if (data.length < 1000) break
    }
    // Ekspor bisa memuat baris di luar halaman yang tampil → keterangan & bidang
    // tanahnya diambil ulang untuk SELURUH hasil, jangan pakai state halaman
    // (kalau tidak, kolom Luas/Lokasi di Excel beda dari yang di layar).
    const info = await fetchAsetInfo(all.map(r => r.nibar))
    const ket: Record<string, string> = {}
    for (const [nibar, a] of Object.entries(info)) if (a.keterangan) ket[nibar] = a.keterangan
    const bd = await fetchBidang(info, all)
    const uraian = await fetchUraian(all.map(r => r.kode))
    // Ekspor pakai kolom yang sama dgn layar, + Uraian & NIBAR jadi kolom sendiri
    // (di layar keduanya ditumpuk; di Excel harus rata biar bisa disortir/pivot).
    const keys = colsFor(applied.golongan).flatMap(k => (k === 'kode' ? ['kode', 'uraian'] : k === 'nama' ? ['nama', 'nibar'] : [k]))
    exportToExcel(all.map(r => {
      const obj: Record<string, string | number> = {}
      for (const k of keys) {
        if (k === 'nibar') { obj['NIBAR'] = r.nibar; continue }
        if (k === 'uraian') { obj['Uraian'] = uraian[r.kode] || ''; continue }
        obj[COL_META[k].header] = k === 'keterangan' ? (ket[r.nibar] || '') : cellValue(k, r, bd)
      }
      return obj
    }), `Daftar_Barang_Awal_2026${applied.golongan ? `_${applied.golongan}` : ''}`, 'Daftar Barang Awal')
    setExporting(false)
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)
  const cols = colsFor(applied?.golongan ?? '')
  const kolom = cols.length + (isViewer ? 0 : 1)
  const nilaiIdx = cols.indexOf('nilai')
  const subtotal = (key: string) => rows.reduce((s, r) => s + (Number(cellValue(key, r)) || 0), 0)

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Daftar Barang Awal</h1>
        <p className="text-gray-500 text-sm mt-1">Daftar aset + penyusutan pada posisi saldo awal 2026 (= saldo akhir 2025).</p>
      </div>

      <div className="card p-5 mb-4">
        <h2 className="text-base font-semibold text-gray-800 mb-4">Filter data</h2>
        <div className="space-y-3 max-w-3xl">
          <div className="flex items-center gap-3">
            <label className="w-40 text-sm text-gray-600 text-right flex-shrink-0">SKPD / Lokasi :</label>
            <SkpdCombobox lockToOperator onChangeSelection={setOrg} allowClear placeholder="Semua — atau ketik SKPD / Sub OPD / Lokasi..." />
          </div>
          <div className="flex items-center gap-3">
            <label className="w-40 text-sm text-gray-600 text-right flex-shrink-0">Jenis Aset :</label>
            <select className="select-filter flex-1" value={golongan} onChange={e => setGolongan(e.target.value)}>
              <option value="">Semua Jenis Aset</option>
              {GOLONGAN_REKAP.map(g => <option key={g.kode} value={g.kode}>{g.kode} — {g.uraian}</option>)}
            </select>
          </div>
          {/* Tanah: semua intrakomptabel — filternya tak relevan (pola Daftar Barang) */}
          {golongan !== '1.3.1' && <KomptabelRadio value={komptabel} onChange={setKomptabel} />}
          <div className="flex items-center gap-3">
            <label className="w-40 text-sm text-gray-600 text-right flex-shrink-0">Cari :</label>
            <input className="select-filter flex-1" placeholder="Nama barang / NIBAR / kode..."
              value={search} onChange={e => setSearch(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') tampilkan() }} />
          </div>
          <div className="flex items-center gap-3">
            <span className="w-40 flex-shrink-0" />
            <button className="btn-primary" onClick={tampilkan} disabled={loading}>{loading ? 'Memuat...' : 'Tampilkan'}</button>
          </div>
        </div>
      </div>

      {applied === null ? (
        <div className="card p-12 text-center text-gray-400 text-sm">
          Atur filter lalu klik <span className="font-medium text-gray-600">Tampilkan</span>.
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <span className="text-sm text-gray-500">
              {total.toLocaleString('id-ID')} barang
              {applied.golongan ? ` · ${applied.golongan} ${GOLONGAN_REKAP.find(g => g.kode === applied.golongan)?.uraian || ''}` : ''}
              {selList.length > 0 && <span className="text-teal font-medium"> · {selList.length} dicentang</span>}
            </span>
            <div className="flex items-center gap-3">
              {!isViewer && (
                <button onClick={openSpek} disabled={selList.length === 0 || !selSameGol || spekSaving} className="btn-secondary text-xs">
                  {spekSaving ? 'Menyimpan...' : '✎ Edit Spesifikasi...'}
                </button>
              )}
              {!showAll && <span className="text-sm text-gray-500">Hal. {page + 1} / {totalPages || 1}</span>}
              <button onClick={handleExport} disabled={exporting || total === 0} className="btn-secondary text-xs">
                {exporting ? 'Mengekspor...' : 'Export Excel'}
              </button>
            </div>
          </div>
          {loadErr && <div className="px-4 py-2 border-b border-gray-100"><p className="text-xs text-red-600">{loadErr}</p></div>}
          {!isViewer && (selList.length > 0 || spekMsg || spekErr || spekSaving || terkunci.size > 0) && (
            <div className="px-4 py-2 border-b border-gray-100 space-y-1">
              {spekSaving && <p className="text-xs text-gray-500">Menyimpan koreksi spesifikasi...</p>}
              {terkunci.size > 0 && (
                <p className="text-xs text-gray-500">
                  🔒 {terkunci.size} barang di tampilan ini terkunci — sudah punya transaksi yang mengubah spesifikasi,
                  golongan, atau SKPD-nya. Koreksinya lewat Pembukuan → Koreksi → Spesifikasi Barang, biar ada jejak
                  ledger & bisa dibatalkan.
                </p>
              )}
              {selList.length > 0 && !selSameGol && (
                <p className="text-xs text-amber-600">Barang beda jenis aset — pisahkan per jenis, field spesifikasinya beda.</p>
              )}
              {selList.length > 0 && selSameGol && !spekTanpaBidang && kodeLevel3(selList[0].kode) === '1.3.1' && (
                <p className="text-xs text-amber-600">
                  Ada tanah yang sudah punya bidang di GIS Tanah — luas & lokasinya tidak ditawarkan di popup ini.
                  Yang punya bidang, koreksinya per bidang di menu GIS Tanah (luas di tabel = Σ bidang).
                </p>
              )}
              {selList.length > 0 && selSameGol && (
                <p className="text-xs text-gray-500">
                  Koreksi spesifikasi ditulis ke saldo awal <span className="font-medium">dan</span> register aset (dicocokkan NIBAR).
                  Angka penyusutan tidak ikut berubah. Tanpa jejak ledger — kalau butuh bisa dibatalkan, pakai Pembukuan → Koreksi.
                </p>
              )}
              {spekMsg && <p className="text-xs text-emerald-600">{spekMsg}</p>}
              {spekErr && <p className="text-xs text-red-600">{spekErr}</p>}
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  {!isViewer && <th className="table-th w-8" />}
                  {cols.map(k => <th key={k} className={thClass(k)}>{COL_META[k].header}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {loading ? (
                  <tr><td colSpan={kolom} className="table-td text-center py-12 text-gray-400">Memuat data...</td></tr>
                ) : rows.length === 0 ? (
                  <tr><td colSpan={kolom} className="table-td text-center py-12 text-gray-400">
                    {loadErr ? 'Data gagal dimuat — lihat pesan di atas.' : 'Tidak ada data untuk filter ini'}
                  </td></tr>
                ) : rows.map((r, i) => (
                  <tr key={r.nibar} className={sel[r.nibar] ? 'bg-teal/5' : i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                    {!isViewer && (
                      <td className="table-td">
                        {terkunci.has(r.nibar) ? (
                          <span title="Barang ini sudah punya transaksi yang mengubah spesifikasi, golongan, atau SKPD-nya. Koreksi spesifikasinya lewat Pembukuan → Koreksi → Spesifikasi Barang."
                            className="text-gray-400 cursor-help">🔒</span>
                        ) : (
                          <input type="checkbox" checked={!!sel[r.nibar]} onChange={() => toggleSel(r)} />
                        )}
                      </td>
                    )}
                    {cols.map(k => <td key={k} className={tdClass(k)}>{cellContent(k, r)}</td>)}
                  </tr>
                ))}
              </tbody>
              {!loading && rows.length > 0 && nilaiIdx >= 0 && (
                <tfoot>
                  {/* showAll → total seluruh hasil filter; kalau terpaginasi, yang
                      dijumlahkan cuma baris di layar — labelnya bilang begitu. */}
                  <tr className="bg-gray-50 border-t-2 border-gray-200 font-semibold text-gray-800">
                    <td className="table-td text-xs" colSpan={Math.max(1, nilaiIdx + (isViewer ? 0 : 1))}>
                      {showAll
                        ? `TOTAL (${total.toLocaleString('id-ID')} barang)`
                        : `TOTAL halaman ini (${rows.length} dari ${total.toLocaleString('id-ID')} barang)`}
                    </td>
                    {cols.slice(nilaiIdx).map(k => (
                      <td key={k} className={tdClass(k)}>{TOTAL_KEYS.has(k) ? angka(subtotal(k)) : ''}</td>
                    ))}
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
      )}

      {spekOpen && selList.length > 0 && (
        <EditSpesifikasiModal
          title={selList.length === 1
            ? (selList[0].nama_barang || selList[0].nibar)
            : `${selList.length} barang — ${golLabel(selList[0].kode)}`}
          fieldKeys={spekKeys}
          storagePrefix={spekPrefix}
          initialFields={spekInitFields}
          initialFoto={spekInitFoto}
          single={selList.length === 1}
          onSave={simpanSpek}
          onClose={() => setSpekOpen(false)}
        />
      )}
    </div>
  )
}
