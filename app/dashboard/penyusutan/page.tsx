'use client'
// Penyusutan — filter ala e-SIMBADA: organisasi (SKPD/Sub OPD/Sub Sub OPD) →
// jenis aset → komptabel → semester → Tampilkan.
//
// Sumber angka = HASIL ENGINE (penyusutan_semester, per aset_id per periode),
// bukan baseline e-bmd. Jadi kapitalisasi ikut tercermin & period-aware:
//   - Induk yang di-kapitalisasi tampil dengan nilai/beban/akumulasi/masa manfaat BARU.
//   - Barang anak yang sudah diserap (atau aset dihapus) DISEMBUNYIKAN untuk periode
//     saat/kaset­elah penyerapan; kalau lihat periode SEBELUM penyerapan, tetap tampil.
// Register (daftar aset per golongan) dari tabel aset (hidup) — bukan cuma baseline
// beku saldo_awal_2026, supaya barang yang diimport/ditambah SETELAH baseline (mis.
// perolehan baru, atau backfill saldo_awal susulan) ikut kebaca di sini. Angka &
// visibilitas tetap disesuaikan engine + histori transaksi. Angka polos tanpa "Rp".
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { exportToExcel } from '@/lib/export'
import { GOLONGAN_REKAP, perlakuanKode } from '@/lib/bmd'
import { fetchHiddenIds, belumAdaPada, SEMBUNYI_PENYUSUTAN } from '@/lib/visibilitas'
import SkpdCombobox, { type SkpdSelection as OrgSelection } from '@/components/SkpdCombobox'
import { KapitalisasiDetailModal, type KapItem } from '@/components/KapitalisasiDetail'
import { fetchOwnerOverrides, partitionByPeriodOwner } from '@/lib/pengalihan'
import { bergeserDariNibar } from '@/lib/kodeRegister'
import { useTahunBukuMap } from '@/components/useTahunBuku'
import TahunTerkunciNote from '@/components/TahunTerkunciNote'
import { tahunAwal } from '@/lib/tahunKerja'
import { useKonfirmasi } from '@/shared/ui/konfirmasi'

const BASE_COLS = 'id,nibar,kode_register,kode_barang:kode,nama_barang,skpd_id,nilai_perolehan,intra_ekstra,tgl_perolehan,merek_tipe,alamat_detail'

type Base = {
  id: string; nibar: string
  // Kode register 45 digit — DIBACA dari kolom (diterbitkan & dibekukan trigger
  // trg_aset_kode_register), tampil di layar (baris ke-3 sel Nama Barang) & Export.
  kode_register: string | null
  kode_barang: string; nama_barang: string; skpd_id: number
  nilai_perolehan: number; intra_ekstra: string | null
  tgl_perolehan: string | null
  merek_tipe: string | null; alamat_detail: string | null
}

// Kolom Merek & Lokasi (2026-07-20) — kondisional per jenis aset yg difilter
// (tabel di halaman ini satu set kolom, bukan per-golongan spt Daftar Barang):
//   - Merek (merek_tipe): Peralatan & Mesin, Aset Tidak Berwujud, Aset Lain-Lain.
//   - Lokasi (alamat_detail): Tanah, Gedung&Bangunan, Jalan/Jaringan/Irigasi, KDP, Aset Lain-Lain.
// "Semua Jenis" (golongan kosong) → tidak ada kolom tambahan (data akan campur golongan).
// Urutan tampil & export: KODE BARANG A→Z (permintaan user 2026-07-30; dulu
// nilai perolehan terbesar dulu). KEMBAR dgn `bandingKode` di Daftar Barang —
// ubah satu, samakan yang lain; bedanya cuma nama kolomnya di sini di-alias
// `kode_barang`. Perbandingan string polos (segmen kode e-BMD sudah zero-padded
// → leksikografis = urutan nomor, & murah utk ratusan ribu baris); nilai turun
// + `id` sbg pemecah seri karena satu kode dipakai ribuan barang dan tanpa
// kunci UNIK urutannya bisa beda tiap render.
function bandingKode(a: Base, b: Base): number {
  if (a.kode_barang !== b.kode_barang) return a.kode_barang < b.kode_barang ? -1 : 1
  const d = (b.nilai_perolehan || 0) - (a.nilai_perolehan || 0)
  return d !== 0 ? d : (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
}

const GOL_MEREK = ['1.3.2', '1.5.3', '1.5.4']
const GOL_LOKASI = ['1.3.1', '1.3.3', '1.3.4', '1.3.6', '1.5.4']
// Hasil engine (penyusutan_semester) — angka period-aware.
type Peny = { nilai_perolehan: number; beban: number; akumulasi: number; nilai_buku_akhir: number; sisa_semester: number; masa_manfaat_tahun: number | null }
type Applied = { org: OrgSelection; golongan: string; komptabel: string; periode: string; search: string }

// ── Paginasi DI SERVER (Fase 4, migrasi 20260818_01) ───────────────────────
// Layar tak lagi menarik seluruh baris ke browser. Terukur 2026-08-18 (Dinas
// Pendidikan, 1.3.2, intra, 2026-S1 = 132.694 aset): dari ±1.466 permintaan
// PostgREST + 132.694 baris menyeberang → **1 permintaan + 100 baris, 986 ms**;
// kaki tabelnya lewat `fn_penyusutan_rekap`, 561 ms.
//
// ⚠️ `assembleRows` & kolektor di bawahnya (fetchAllBase/fetchPeny/
// fetchHiddenIds/fetchOwnerOverrides) SENGAJA DIPERTAHANKAN — kini khusus
// EXPORT (keputusan user 2026-08-18: export tetap lewat jalur mentah, pola yang
// sama dgn Export Audit di Daftar Barang). Berkas Excel harus memuat SELURUH
// hasil filter, bukan cuma halaman yang kebetulan terbuka.
const PAGE_SIZE = 100

// Satu baris hasil `fn_penyusutan`. Kolom engine di-prefix `p_` di SQL supaya
// tak bentrok dgn kolom register yang bernama sama (nilai_perolehan).
type RpcRow = {
  id: string; nibar: string; kode_register: string | null; kode_barang: string
  nama_barang: string; skpd_id: number; owner_skpd: number | null
  nilai_perolehan: number; intra_ekstra: string | null; tgl_perolehan: string | null
  merek_tipe: string | null; alamat_detail: string | null
  p_nilai_perolehan: number | null; p_beban: number | null; p_akumulasi: number | null
  p_nilai_buku_akhir: number | null; p_sisa_semester: number | null; p_masa_manfaat_tahun: number | null
}
type Rekap = {
  jumlah_baris: number; total_perolehan: number; total_beban: number
  total_akumulasi: number; total_nilai_buku: number; tanpa_hasil_engine: number
}

// ⚠️ DUA DESIMAL, bukan dibulatkan ke rupiah penuh (permintaan user
// 2026-08-27). Angka di `penyusutan_semester` memang BERDESIMAL: baseline e-BMD
// membawa akumulasi seperti 25.818.643,2 dan engine hanya membulatkan BEBAN
// (`Math.round(nilaiBuku / sisaSmt)`), bukan akumulasi & nilai bukunya. Selama
// tampilan ini memotongnya, layar menampilkan 27.970.197 sementara Laporan BMD
// menampilkan 27.970.197,2 untuk angka YANG SAMA — dan penelaah tak punya cara
// tahu mana yang benar. Yang dijumlah selalu nilai penuhnya; ini murni
// tampilan. `minimumFractionDigits` tidak dipasang supaya angka yang memang
// bulat tak jadi berekor ",00" di seluruh tabel.
const angka = (v: number | null | undefined) =>
  v == null ? '-' : new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 }).format(v)

// Visibilitas period-aware (event sembunyi/muncul/lahir) dari lib/visibilitas.ts
// — dipakai bersama Daftar Barang & Rekonsiliasi supaya tak menyimpang lagi.

export default function PenyusutanPage() {
  const supabase = createClient()
  const konfirmasi = useKonfirmasi()
  const tahunBukuMap = useTahunBukuMap()

  const [org, setOrg] = useState<OrgSelection>({ skpdId: null, descendantIds: null })
  const [golongan, setGolongan] = useState('')
  // Default 'intra' (angka neraca) — sejak ekstra ikut disusutkan (2026-07-13),
  // "Semua" = campuran intra+ekstra, bukan lagi tampilan default yang aman.
  const [komptabel, setKomptabel] = useState('intra')
  const [tahun, setTahun] = useState(() => tahunAwal('2026'))
  const [smt, setSmt] = useState('1')
  const [search, setSearch] = useState('')

  const [applied, setApplied] = useState<Applied | null>(null)
  const [rows, setRows] = useState<(Base & { p?: Peny; ownerSkpd?: number | null })[]>([])
  // Halaman aktif (0-based) & rekap seluruh hasil filter. `rekap` null =
  // hitungannya gagal/belum ada — DIBEDAKAN dari 0, supaya "0 aset" tak pernah
  // dipakai untuk sesuatu yang sebenarnya tak terhitung.
  const [hal, setHal] = useState(0)
  const [rekap, setRekap] = useState<Rekap | null>(null)
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [skpdNama, setSkpdNama] = useState<Record<number, string>>({})
  const [kapMap, setKapMap] = useState<Record<string, KapItem[]>>({})
  // kode barang → uraian baku kodefikasi (ditumpuk di bawah Kode Barang, pola
  // Daftar Barang). `aset.uraian_barang` TIDAK dipakai supaya uraiannya selalu
  // ikut kodefikasi terkini, sama seperti halaman itu.
  const [uraianMap, setUraianMap] = useState<Record<string, string>>({})
  const [detail, setDetail] = useState<{ nama: string; items: KapItem[] } | null>(null)
  const [engineRunning, setEngineRunning] = useState(false)
  const [engineMsg, setEngineMsg] = useState('')
  // Pesan kegagalan query (bukan pesan engine) — lihat catatan di `load`.
  const [err, setErr] = useState('')
  const [isAdmin, setIsAdmin] = useState(false)

  // "Jalankan Engine" khusus admin pemda (Pengelola Barang) — server (/api/engine/run)
  // sudah menolak non-admin (403), ini cuma menyembunyikan tombolnya di UI supaya
  // pengurus_barang/pengurus_pembantu tidak klik lalu dapat error.
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: profile } = await supabase.from('admin_profiles').select('role').eq('id', user.id).single()
      setIsAdmin(profile?.role === 'admin')
    })()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

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
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Sumber register = tabel aset (hidup, includeDeleted implisit — visibilitas
  // period-aware diserahkan ke fetchHiddenIds di bawah, sama seperti Daftar Barang).
  function baseQuery(f: Applied) {
    let q = supabase.from('aset').select(BASE_COLS)
    if (f.org.descendantIds) q = q.in('skpd_id', f.org.descendantIds)
    if (f.golongan) q = q.like('kode', `${f.golongan}.%`)
    if (f.komptabel) q = q.eq('intra_ekstra', f.komptabel)
    if (f.search) q = q.or(`nama_barang.ilike.%${f.search}%,nibar.ilike.%${f.search}%,kode.ilike.${f.search}%`)
    // ⚠️ `.order('id')` itu PEMECAH SERI, jangan dicopot. Baris ditarik
    // halaman-demi-halaman pakai `.range()` dan `nilai_perolehan` banyak
    // kembarnya — dgn urutan yang tak total, baris kembar tak dijamin jatuh di
    // halaman yang sama tiap query, jadi ada yang terlewat & ada yang dobel
    // TANPA SUARA. Urutan TAMPIL ditentukan `bandingKode` di assembleRows;
    // yang di sini murni supaya pengambilannya utuh.
    return q.order('nilai_perolehan', { ascending: false }).order('id')
  }

  async function fetchAllBase(f: Applied) {
    const base: Base[] = []
    for (let from = 0; ; from += 1000) {
      const { data } = await baseQuery(f).range(from, from + 999)
      if (!data || data.length === 0) break
      base.push(...(data as unknown as Base[]))
      if (data.length < 1000) break
    }
    return base
  }

  // Ambil aset per daftar id (period-aware: barang yg pada periode terpilih milik
  // SKPD terpilih tapi kini sudah pindah keluar). Filter golongan/komptabel/search
  // tetap; filter SKPD tidak.
  async function fetchBaseByIds(ids: string[], f: Applied): Promise<Base[]> {
    const out: Base[] = []
    for (let i = 0; i < ids.length; i += 200) {
      let q = supabase.from('aset').select(BASE_COLS).in('id', ids.slice(i, i + 200))
      if (f.golongan) q = q.like('kode', `${f.golongan}.%`)
      if (f.komptabel) q = q.eq('intra_ekstra', f.komptabel)
      if (f.search) q = q.or(`nama_barang.ilike.%${f.search}%,nibar.ilike.%${f.search}%,kode.ilike.${f.search}%`)
      const { data } = await q
      out.push(...((data as unknown as Base[]) || []))
    }
    return out
  }

  // Hasil engine per aset_id untuk periode terpilih.
  async function fetchPeny(ids: string[], periode: string) {
    const map = new Map<string, Peny>()
    for (let i = 0; i < ids.length; i += 200) {
      const { data } = await supabase.from('penyusutan_semester')
        .select('aset_id,nilai_perolehan,beban,akumulasi,nilai_buku_akhir,sisa_semester,masa_manfaat_tahun')
        .eq('periode', periode).in('aset_id', ids.slice(i, i + 200))
      for (const r of (data || []) as (Peny & { aset_id: string })[]) map.set(r.aset_id, r)
    }
    return map
  }

  // Kapitalisasi per NIBAR induk (buang yang dibatalkan), urut tertua→termuda.
  async function fetchKap(f: Applied) {
    let kq = supabase.from('transaksi_bmd').select('id,tanggal,keterangan,payload,aset:aset_id(nibar)').eq('jenis', 'kapitalisasi')
    let bq = supabase.from('transaksi_bmd').select('payload').eq('jenis', 'batal_kapitalisasi')
    if (f.org.descendantIds) { kq = kq.in('skpd_asal', f.org.descendantIds); bq = bq.in('skpd_asal', f.org.descendantIds) }
    const [{ data: kap }, { data: batal }] = await Promise.all([kq.order('id', { ascending: true }), bq])
    const cancelled = new Set<number>()
    for (const b of (batal || []) as { payload: { target_trx_id?: number } }[]) { const t = Number(b.payload?.target_trx_id); if (Number.isFinite(t)) cancelled.add(t) }
    const map: Record<string, KapItem[]> = {}
    for (const r of (kap || []) as unknown as {
      id: number; tanggal: string; keterangan: string | null
      payload: { no_dokumen?: string; anak?: KapItem['anak']; snapshot?: KapItem['snapshot'] }; aset: { nibar: string | null } | null
    }[]) {
      if (cancelled.has(r.id) || !r.aset?.nibar) continue
      ;(map[r.aset.nibar] ||= []).push({ no_dokumen: r.payload?.no_dokumen || '(tanpa no. dok)', tanggal: r.tanggal, keterangan: r.keterangan, snapshot: r.payload?.snapshot || null, anak: r.payload?.anak || [] })
    }
    return map
  }

  // Uraian baku per kode barang (dibagi rata: satu kode dipakai banyak aset,
  // jadi di-dedup dulu). MELEMPAR kalau gagal — uraian ikut ke Excel, dan kolom
  // kosong di berkas untuk BPK tak punya tanda bahwa penyebabnya query gagal.
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

  // ── Jalur TAMPIL: satu panggilan RPC per halaman ──────────────────────────
  // Seluruh penyaringan (visibilitas period-aware, pemilik-pada-periode, scope
  // SKPD, golongan/komptabel/cari) + pengurutan + paginasi terjadi DI SERVER.
  // Bentuk barisnya sengaja dipetakan kembali ke `Base & { p?: Peny }` yang
  // sudah dipakai tabel — supaya JSX-nya tak perlu disentuh sama sekali, dan
  // `handleExport` (jalur mentah) tetap menghasilkan bentuk yang identik.
  async function fetchHalaman(f: Applied, halaman: number) {
    const arg = {
      p_periode: f.periode,
      p_skpd_ids: f.org.descendantIds ?? null,
      p_golongan: f.golongan || null,
      p_komptabel: f.komptabel || null,
      p_search: f.search || null,
    }
    const { data, error } = await supabase.rpc('fn_penyusutan', {
      ...arg, p_limit: PAGE_SIZE, p_offset: halaman * PAGE_SIZE,
    })
    if (error) throw new Error(`gagal membaca daftar penyusutan: ${error.message}`)

    const baris = ((data || []) as RpcRow[]).map(r => ({
      id: r.id, nibar: r.nibar, kode_register: r.kode_register,
      kode_barang: r.kode_barang, nama_barang: r.nama_barang, skpd_id: r.skpd_id,
      nilai_perolehan: Number(r.nilai_perolehan), intra_ekstra: r.intra_ekstra,
      tgl_perolehan: r.tgl_perolehan, merek_tipe: r.merek_tipe, alamat_detail: r.alamat_detail,
      ownerSkpd: r.owner_skpd ?? r.skpd_id,
      // NULL di kolom engine = aset belum dihitung engine periode ini. Sengaja
      // jadi `undefined`, BUKAN objek berisi nol: tabel & export membedakan
      // "belum dihitung" (tampil "-") dari "sudah habis disusutkan" (0).
      p: r.p_nilai_perolehan == null ? undefined : {
        nilai_perolehan: Number(r.p_nilai_perolehan),
        beban: Number(r.p_beban), akumulasi: Number(r.p_akumulasi),
        nilai_buku_akhir: Number(r.p_nilai_buku_akhir),
        sisa_semester: Number(r.p_sisa_semester),
        masa_manfaat_tahun: r.p_masa_manfaat_tahun == null ? null : Number(r.p_masa_manfaat_tahun),
      },
    }))
    return { baris, arg }
  }

  // Susun baris tampil: register − yang tersembunyi − yang belum diperoleh di
  // periode ini (tgl perolehan > periode), disesuaikan kepemilikan PERIOD-AWARE
  // (transfer antar SKPD: barang yg pindah di semester depan tetap di SKPD asal
  // saat lihat semester lampau), digabung angka engine. `ownerSkpd` = pemilik
  // pada periode terpilih (utk tampilan/atribusi SKPD).
  async function assembleRows(f: Applied): Promise<(Base & { p?: Peny; ownerSkpd?: number | null })[]> {
    const base = await fetchAllBase(f)
    const owners = await fetchOwnerOverrides(supabase, f.periode)

    let combined = base
    if (f.org.descendantIds && f.org.descendantIds.length > 0) {
      const scope = new Set(f.org.descendantIds)
      const curSkpd = new Map<string, number | null>(base.map(b => [b.id, b.skpd_id]))
      const { keepIds, addIds } = partitionByPeriodOwner(base.map(b => b.id), owners, curSkpd, scope)
      const kept = base.filter(b => keepIds.has(b.id))
      const added = addIds.length > 0 ? await fetchBaseByIds(addIds, f) : []
      combined = [...kept, ...added]
    }

    const ids = combined.map(b => b.id)
    const [pmap, hidden] = await Promise.all([
      fetchPeny(ids, f.periode),
      fetchHiddenIds(supabase, ids, f.periode, SEMBUNYI_PENYUSUTAN),
    ])
    // Sortir di SINI, bukan andalkan urutan dari DB: `combined` gabungan dua
    // fetch (`kept` + `added` period-aware) yang ditempel di belakang, jadi
    // urutan aslinya sudah pasti patah.
    return combined
      .filter(b => !hidden.has(b.id) && !belumAdaPada(b.tgl_perolehan, f.periode))
      .sort(bandingKode)
      .map(b => ({ ...b, p: pmap.get(b.id), ownerSkpd: owners.get(b.id) ?? b.skpd_id }))
  }

  // ⚠️ try/catch/finally WAJIB & `setLoading(false)` di FINALLY — bukan di akhir
  // jalur sukses. Sejak paginasi pindah ke server yang melempar bukan lagi
  // kolektor klien melainkan RPC-nya sendiri (`fn_penyusutan` bisa gagal karena
  // timeout / guard), tapi akibatnya sama persis: tanpa penangkap, halaman beku
  // di "Memuat..." selamanya tanpa sepatah pun keterangan. Lihat CLAUDE.md.
  async function load(f: Applied, halaman = 0) {
    setLoading(true); setErr('')
    try {
      const { baris, arg } = await fetchHalaman(f, halaman)
      setRows(baris)
      setHal(halaman)

      // Rekap ditarik SEKALI per perubahan filter, bukan tiap ganti halaman —
      // ia menghitung seluruh hasil filter (561 ms utk 132rb baris) dan tak
      // berubah saat berpindah halaman.
      if (halaman === 0) {
        const { data: rk, error: eRk } = await supabase.rpc('fn_penyusutan_rekap', arg)
        if (eRk) throw new Error(`gagal menghitung rekap penyusutan: ${eRk.message}`)
        const row = ((rk || []) as Rekap[])[0]
        setRekap(row ? {
          jumlah_baris: Number(row.jumlah_baris),
          total_perolehan: Number(row.total_perolehan), total_beban: Number(row.total_beban),
          total_akumulasi: Number(row.total_akumulasi), total_nilai_buku: Number(row.total_nilai_buku),
          tanpa_hasil_engine: Number(row.tanpa_hasil_engine),
        } : null)
      }

      setKapMap(await fetchKap(f))
      setUraianMap(await fetchUraian(baris.map(b => b.kode_barang)))
    } catch (e) {
      // Fail-closed: daftar penyusutan yang kurang sebagian lebih berbahaya
      // daripada halaman yang menolak tampil.
      setErr(`${(e as Error).message} — daftar tidak ditampilkan supaya tidak ada yang terbaca sebagai lengkap padahal sebagian gagal dimuat. Coba Tampilkan lagi; kalau berulang, kabari admin.`)
      setRows([]); setRekap(null)
    } finally {
      setLoading(false)
    }
  }

  function tampilkan() {
    const f: Applied = { org, golongan, komptabel, periode: `${tahun}-S${smt}`, search }
    // Ganti filter → WAJIB balik ke halaman 1. Tanpa ini operator yang sedang di
    // halaman 40 lalu mempersempit filternya mendarat di halaman kosong dan
    // membacanya sebagai "tidak ada data".
    setApplied(f); setRekap(null); load(f, 0)
  }

  async function runEngine() {
    const periode = `${tahun}-S${smt}`
    // TIDAK memakai `kerjakan`: engine dijalankan bertahap (batch per-aset) dan
    // kemajuannya sudah dilaporkan sendiri lewat `engineMsg` — "Memproses… N
    // aset". Menahan pop-up di depan layar justru menutupi angka itu.
    if (!(await konfirmasi({
      nada: 'teal', ikon: '⚙', judul: 'Jalankan engine penyusutan?',
      subjudul: `Periode ${periode}`,
      isi: <>Seluruh aset dihitung <b>ulang dari awal</b> untuk periode ini. Bisa memakan beberapa
        menit, dan <b>aman diulang</b> — hasilnya sama berapa kali pun dijalankan.</>,
      peringatan: <>Periode di tahun yang sudah <b>terkunci</b> ditolak, dan baris tahun terkunci
        yang terlewati saat replay tidak ditimpa.</>,
      labelYa: 'Ya, jalankan',
    })).ya) return
    setEngineRunning(true); setEngineMsg('Memproses… 0 aset')
    // Engine di-BATCH per-aset di server (keyset by id). Client loop tiap batch
    // sampai `done`, akumulasi statistik + tampilkan progress. Mencegah timeout
    // serverless yang dulu bikin respons kosong ("Unexpected end of JSON input").
    try {
      let afterId = ''
      let totalProses = 0, totalDisusutkan = 0, totalBeban = 0, totalDilindungi = 0
      // batas iterasi jaga-jaga (218rb / 3000 ≈ 73; 1000 lebih dari cukup)
      for (let guard = 0; guard < 1000; guard++) {
        const res = await fetch('/api/engine/run', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ periode, after_id: afterId }),
        })
        const j = await res.json()
        if (!res.ok) { setEngineMsg(`Error: ${j.error || `HTTP ${res.status}`}`); setEngineRunning(false); return }
        totalProses += Number(j.processed || 0)
        totalDisusutkan += Number(j.disusutkan || 0)
        totalBeban += Number(j.total_beban || 0)
        totalDilindungi += Number(j.rows_dilindungi_tahun_terkunci || 0)
        setEngineMsg(`Memproses… ${totalProses.toLocaleString('id-ID')} aset`)
        if (j.done) break
        afterId = j.last_id
        if (!afterId) break // jaga-jaga: tak ada kursor → hentikan
      }
      const proteksi = totalDilindungi > 0
        ? ` (${totalDilindungi.toLocaleString('id-ID')} baris di tahun terkunci dilindungi, tidak ditimpa.)`
        : ''
      setEngineMsg(`✓ Engine selesai untuk ${periode} — ${totalProses.toLocaleString('id-ID')} aset diproses, ${totalDisusutkan.toLocaleString('id-ID')} disusutkan, total beban ${angka(totalBeban)}.${proteksi}`)
      if (applied && applied.periode === periode) load(applied)
    } catch (e) {
      setEngineMsg(`Error: ${e instanceof Error ? e.message : String(e)}`)
    }
    setEngineRunning(false)
  }

  // ⚠️ try/catch/finally WAJIB, alasan sama dgn `load`: assembleRows memanggil
  // kolektor fail-closed (fetchOwnerOverrides MELEMPAR). Tanpa penangkap,
  // sekali query itu gagal tombolnya nyangkut "Mengekspor..." selamanya tanpa
  // sepatah pun keterangan. Dan berkas Excel yang isinya kurang sebagian TIDAK
  // BOLEH terlanjur terunduh — sekali tersimpan tak ada lagi tanda bahwa
  // datanya tak lengkap, padahal angkanya ikut dilaporkan.
  async function handleExport() {
    if (!applied) return
    setExporting(true); setErr('')
    try {
    const data = await assembleRows(applied)
    const uraian = await fetchUraian(data.map(b => b.kode_barang))
    // Urutan kolom kiri→kanan DITENTUKAN USER (2026-07-30): identitas dulu
    // (SKPD → kode & uraian → NIBAR → kode register → nama), lalu atribut,
    // baru angka penyusutan. Urutan properti objek di sini = urutan kolom di
    // Excel (json_to_sheet ikut key pertama), jadi jangan diacak-acak.
    // Satuan "(Smt)" DIPERTAHANKAN di judul Masa Manfaat & Sisa: angkanya
    // semester (masa_manfaat_tahun × 2), tanpa label itu "100" terbaca 100 tahun.
    exportToExcel(data.map(b => {
      const p = b.p
      const susut = perlakuanKode(b.kode_barang) !== 'tidak'
      return {
        'SKPD': skpdNama[b.ownerSkpd ?? b.skpd_id] || '',
        'Kode Barang': b.kode_barang,
        'Uraian Barang': uraian[b.kode_barang] || '',
        'NIBAR': b.nibar,
        'Kode Register': b.kode_register || '',
        'Nama Barang': b.nama_barang,
        // Lokasi SELALU ikut di Excel walau di layar cuma tampil utk golongan
        // ber-lokasi (GOL_LOKASI) — berkas export memang sengaja flat & tetap
        // kolomnya, biar tak berubah-ubah set kolom tiap ganti filter jenis
        // aset. Golongan tanpa lokasi cukup kosong. (Pola sama: EXPORT_COLS di
        // Daftar Barang juga lebih lengkap dari tampilan layarnya.)
        'Lokasi': b.alamat_detail || '',
        'Tgl Perolehan': b.tgl_perolehan || '',
        'Komptabel': b.intra_ekstra || '',
        'Masa Manfaat (Smt)': susut && p?.masa_manfaat_tahun != null ? Math.round(p.masa_manfaat_tahun * 2) : '',
        'Nilai Perolehan': p ? p.nilai_perolehan : b.nilai_perolehan,
        'Beban': susut && p ? p.beban : '',
        'Akumulasi': susut && p ? p.akumulasi : '',
        'Nilai Buku Akhir': susut && p ? p.nilai_buku_akhir : b.nilai_perolehan,
        'Sisa (Smt)': susut && p ? p.sisa_semester : '',
        'Periode': applied.periode,
      }
    }), `Penyusutan_${applied.periode}`, 'Penyusutan')
    } catch (e) {
      setErr(`gagal menyiapkan export: ${(e as Error).message} — berkas tidak dibuat supaya tidak ada Excel setengah jadi yang beredar.`)
    } finally {
      setExporting(false)
    }
  }

  const dash = (v: React.ReactNode, ok: boolean) => (ok ? v : <span className="text-gray-300">-</span>)

  const showMerek = !!applied && GOL_MEREK.includes(applied.golongan)
  const showLokasi = !!applied && GOL_LOKASI.includes(applied.golongan)
  const colCount = 12 + (showMerek ? 1 : 0) + (showLokasi ? 1 : 0)

  // Total kolom — dari REKAP SERVER (seluruh hasil filter), bukan dari `rows`.
  // ⚠️ Sejak paginasi pindah ke server, `rows` cuma 100 baris halaman berjalan;
  // menjumlahkannya akan menghasilkan kaki tabel yang berubah-ubah tiap ganti
  // halaman dan terbaca sebagai total seluruh SKPD. Aturan per-golongannya
  // (tak disusutkan → nilai buku = nilai perolehan) hidup di
  // `fn_penyusutan_rekap`, kembar dengan `perlakuanKode()`.
  const tot = {
    perolehan: rekap?.total_perolehan ?? 0,
    beban: rekap?.total_beban ?? 0,
    akum: rekap?.total_akumulasi ?? 0,
    nba: rekap?.total_nilai_buku ?? 0,
  }

  const totalBaris = rekap?.jumlah_baris ?? null
  const halTerakhir = totalBaris == null ? hal : Math.max(0, Math.ceil(totalBaris / PAGE_SIZE) - 1)

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Penyusutan BMD</h1>
        <p className="text-gray-500 text-sm mt-1">Detail penyusutan & amortisasi per aset per semester (hasil engine)</p>
      </div>

      <div className="card p-5 mb-4">
        <h2 className="text-base font-semibold text-gray-800 mb-4">Filter data</h2>
        <div className="space-y-3 max-w-3xl">
          <div className="flex items-center gap-3">
            <label className="w-40 text-sm text-gray-600 text-right flex-shrink-0">SKPD / Lokasi :</label>
            <SkpdCombobox lockToOperator onChangeSelection={setOrg} allowClear
              placeholder="Semua — atau ketik SKPD / Sub OPD / Lokasi..." />
          </div>

          <div className="flex items-center gap-3">
            <label className="w-40 text-sm text-gray-600 text-right flex-shrink-0">Jenis Aset :</label>
            <select className="select-filter flex-1" value={golongan} onChange={e => setGolongan(e.target.value)}>
              <option value="">Semua Jenis (KIB Tanah s.d. Aset Lain-Lain)</option>
              {GOLONGAN_REKAP.map(g => <option key={g.kode} value={g.kode}>{g.kode} — {g.uraian}</option>)}
            </select>
          </div>

          <div className="flex items-center gap-3">
            <label className="w-40 text-sm text-gray-600 text-right flex-shrink-0">Komptabel :</label>
            <div className="flex gap-4">
              {[['', 'Semua'], ['intra', 'Intrakomptabel'], ['ekstra', 'Ekstrakomptabel']].map(([v, l]) => (
                <label key={v} className="flex items-center gap-1.5 text-sm cursor-pointer">
                  <input type="radio" name="komptabel" checked={komptabel === v} onChange={() => setKomptabel(v)} />{l}
                </label>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <label className="w-40 text-sm text-gray-600 text-right flex-shrink-0">Semester :</label>
            <select className="select-filter w-28" value={tahun} onChange={e => setTahun(e.target.value)}>
              {['2025', '2026', '2027'].map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <div className="flex gap-4">
              {[['1', 'Semester I'], ['2', 'Semester II']].map(([v, l]) => (
                <label key={v} className="flex items-center gap-1.5 text-sm cursor-pointer">
                  <input type="radio" name="smt" checked={smt === v} onChange={() => setSmt(v)} />{l}
                </label>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <label className="w-40 text-sm text-gray-600 text-right flex-shrink-0">Cari :</label>
            <input className="select-filter flex-1" placeholder="Nama barang / NIBAR / kode..."
              value={search} onChange={e => setSearch(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') tampilkan() }} />
          </div>

          <div className="flex items-center gap-3">
            <span className="w-40 flex-shrink-0" />
            <button className="btn-primary" onClick={tampilkan} disabled={loading}>{loading ? 'Memuat...' : 'Tampilkan'}</button>
            {isAdmin && (
              <button className="btn-secondary" onClick={runEngine} disabled={engineRunning} title="Hitung ulang penyusutan semua aset untuk periode terpilih (admin)">
                {engineRunning ? 'Menghitung…' : `⚙ Jalankan Engine (${tahun}-S${smt})`}
              </button>
            )}
          </div>
          {tahunBukuMap[Number(tahun)] === 'terkunci' && (
            <div className="flex items-start gap-3">
              <span className="w-40 flex-shrink-0" />
              <TahunTerkunciNote tahun={Number(tahun)} />
            </div>
          )}
          {engineMsg && (
            <div className="flex items-start gap-3">
              <span className="w-40 flex-shrink-0" />
              <p className={`text-xs ${engineMsg.startsWith('Error') ? 'text-red-600' : 'text-green-700'}`}>{engineMsg}</p>
            </div>
          )}
        </div>
      </div>

      {err && (
        <div className="card border-red-200 bg-red-50 p-4 text-sm text-red-700">{err}</div>
      )}

      {applied === null ? (
        <div className="card p-12 text-center text-gray-400 text-sm">
          Atur filter lalu klik <span className="font-medium text-gray-600">Tampilkan</span>.
        </div>
      ) : (
        <div className="card overflow-hidden">
          {tahunBukuMap[Number(applied.periode.slice(0, 4))] === 'terkunci' && (
            <div className="px-4 pt-3">
              <TahunTerkunciNote tahun={Number(applied.periode.slice(0, 4))} />
            </div>
          )}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <span className="text-sm text-gray-500">
              {/* Jumlah SELURUH hasil filter (dari rekap server), bukan jumlah
                  baris di halaman ini. `null` = rekapnya gagal dihitung —
                  dikatakan apa adanya, jangan diganti angka 0. */}
              {totalBaris == null ? 'jumlah tak terhitung' : `${totalBaris.toLocaleString('id-ID')} aset`}
              {' · '}periode {applied.periode}
              {applied.org.skpdId && skpdNama[applied.org.skpdId] ? ` · ${skpdNama[applied.org.skpdId]}` : ''}
              {rekap && rekap.tanpa_hasil_engine > 0 && (
                <span className="text-amber-600">
                  {' · '}{rekap.tanpa_hasil_engine.toLocaleString('id-ID')} belum dihitung engine
                </span>
              )}
            </span>
            {/* Export tetap lewat JALUR MENTAH (assembleRows) — keputusan user
                2026-08-18. Berkasnya wajib memuat SELURUH hasil filter, bukan
                cuma halaman yang kebetulan terbuka. */}
            <button onClick={handleExport} disabled={exporting || rows.length === 0} className="btn-secondary text-xs">
              {exporting ? 'Mengekspor...' : 'Export Excel'}
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="table-th">SKPD</th>
                  <th className="table-th">Kode Barang</th>
                  <th className="table-th">Nama Barang</th>
                  {showMerek && <th className="table-th">Merek</th>}
                  {showLokasi && <th className="table-th">Lokasi</th>}
                  <th className="table-th">Tgl Perolehan</th>
                  <th className="table-th text-center">Komptabel</th>
                  <th className="table-th text-center">Masa Manfaat (Smt)</th>
                  <th className="table-th text-right">Nilai Perolehan</th>
                  <th className="table-th text-right">Beban</th>
                  <th className="table-th text-right">Akumulasi</th>
                  <th className="table-th text-right">Nilai Buku Akhir</th>
                  <th className="table-th text-center">Sisa (Smt)</th>
                  <th className="table-th text-center w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {loading ? (
                  <tr><td colSpan={colCount} className="table-td text-center py-12 text-gray-400">Memuat data...</td></tr>
                ) : rows.length === 0 ? (
                  <tr><td colSpan={colCount} className="table-td text-center py-12 text-gray-400">Tidak ada data untuk filter ini</td></tr>
                ) : rows.map((r, i) => {
                  const susut = perlakuanKode(r.kode_barang) !== 'tidak'
                  const p = r.p
                  const kap = kapMap[r.nibar]
                  const bergeser = bergeserDariNibar(r.nibar, r.kode_register)
                  const masaSmt = p?.masa_manfaat_tahun != null ? Math.round(p.masa_manfaat_tahun * 2) : null
                  return (
                    <tr key={r.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                      <td className="table-td text-xs text-gray-600">{skpdNama[r.ownerSkpd ?? r.skpd_id] || '-'}</td>
                      <td className="table-td text-xs text-gray-600 align-top">
                        <p className="font-medium text-gray-700">{r.kode_barang}</p>
                        <p className="text-gray-400 mt-0.5">{uraianMap[r.kode_barang] || '-'}</p>
                      </td>
                      <td className="table-td align-top">
                        <p className={`text-xs ${kap ? 'font-bold text-gray-900' : 'font-medium text-gray-800'}`}>{r.nama_barang || '-'}</p>
                        <p className="text-gray-400 text-xs mt-0.5">{r.nibar}</p>
                        {/* Kode register DIBACA dari kolom (diterbitkan & dibekukan
                            trigger di DB), tidak dihitung di layar. Ditandai HANYA
                            kalau bergeser dari NIBAR; `bergeser === null` (NIBAR
                            warisan e-BMD yang susunannya beda) sengaja tak ditandai
                            apa-apa — pola & alasan sama dgn Daftar Barang. */}
                        <p className={`text-[11px] mt-0.5 ${bergeser ? 'text-amber-600 font-medium' : 'text-gray-300'}`}
                          title={bergeser
                            ? 'Kode register: posisi barang ini sudah bergeser dari NIBAR-nya (pernah pindah unit / reklas)'
                            : 'Kode register (posisi terakhir barang)'}>
                          {r.kode_register ? `REG ${r.kode_register}${bergeser ? ' ⚠' : ''}` : 'REG —'}
                        </p>
                      </td>
                      {showMerek && <td className="table-td text-xs text-gray-600">{r.merek_tipe || '-'}</td>}
                      {showLokasi && <td className="table-td text-xs text-gray-600">{r.alamat_detail || '-'}</td>}
                      <td className="table-td text-xs text-gray-600">{r.tgl_perolehan || '-'}</td>
                      <td className="table-td text-center text-xs capitalize">{r.intra_ekstra || '-'}</td>
                      <td className="table-td text-center text-xs">{susut ? (masaSmt ?? <span className="text-gray-300">-</span>) : <span className="text-gray-300">-</span>}</td>
                      <td className="table-td text-right text-xs">{angka(p ? p.nilai_perolehan : r.nilai_perolehan)}</td>
                      <td className="table-td text-right text-xs font-medium text-teal">{dash(angka(p?.beban), susut && !!p)}</td>
                      <td className="table-td text-right text-xs">{dash(angka(p?.akumulasi), susut && !!p)}</td>
                      <td className="table-td text-right text-xs">{susut && p ? angka(p.nilai_buku_akhir) : angka(r.nilai_perolehan)}</td>
                      <td className="table-td text-center text-xs">{dash(p?.sisa_semester, susut && !!p)}</td>
                      <td className="table-td text-center">
                        {kap && (
                          <button title="Lihat rincian kapitalisasi/rehab" onClick={() => setDetail({ nama: r.nama_barang || r.nibar, items: kap })}
                            className="inline-flex items-center justify-center w-7 h-7 rounded bg-gray-100 hover:bg-gray-200 text-gray-700">👁</button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              {!loading && rows.length > 0 && (
                <tfoot>
                  <tr className="bg-gray-50 border-t-2 border-gray-200 font-semibold text-gray-800">
                    {/* TOTAL = seluruh hasil filter, bukan halaman ini. Jumlah
                        asetnya ikut dari rekap supaya angka & label tak pernah
                        bercerita beda. */}
                    <td className="table-td text-xs" colSpan={6 + (showMerek ? 1 : 0) + (showLokasi ? 1 : 0)}>
                      TOTAL ({totalBaris == null ? '—' : totalBaris.toLocaleString('id-ID')} aset, seluruh hasil filter)
                    </td>
                    <td className="table-td text-right text-xs">{angka(tot.perolehan)}</td>
                    <td className="table-td text-right text-xs text-teal">{angka(tot.beban)}</td>
                    <td className="table-td text-right text-xs">{angka(tot.akum)}</td>
                    <td className="table-td text-right text-xs">{angka(tot.nba)}</td>
                    <td className="table-td" />
                    <td className="table-td" />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          {/* Kendali halaman. Tombol Berikutnya dipandu `halTerakhir` kalau
              rekapnya ada; kalau rekapnya gagal dihitung, ia dipandu "halaman
              ini penuh" — kalau tidak, sekali gagal menghitung operator
              terkurung di halaman 1. Pola & alasan sama dgn Daftar Barang Awal. */}
          {!loading && rows.length > 0 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 text-xs text-gray-500">
              <span>
                Halaman {hal + 1}
                {totalBaris != null && ` dari ${(halTerakhir + 1).toLocaleString('id-ID')}`}
                {' · '}menampilkan {rows.length.toLocaleString('id-ID')} baris
              </span>
              <div className="flex gap-2">
                <button className="btn-secondary text-xs" disabled={hal === 0 || loading}
                  onClick={() => applied && load(applied, hal - 1)}>← Sebelumnya</button>
                <button className="btn-secondary text-xs"
                  disabled={loading || (totalBaris != null ? hal >= halTerakhir : rows.length < PAGE_SIZE)}
                  onClick={() => applied && load(applied, hal + 1)}>Berikutnya →</button>
              </div>
            </div>
          )}
        </div>
      )}

      {detail && <KapitalisasiDetailModal title={`Rincian Kapitalisasi — ${detail.nama}`} items={detail.items} onClose={() => setDetail(null)} />}
    </div>
  )
}
