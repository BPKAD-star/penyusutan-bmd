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
import { GOLONGAN_REKAP, perlakuanKode, comparePeriode, periodeDariTanggal } from '@/lib/bmd'
import SkpdCombobox, { type SkpdSelection as OrgSelection } from '@/components/SkpdCombobox'
import { KapitalisasiDetailModal, type KapItem } from '@/components/KapitalisasiDetail'
import { fetchOwnerOverrides, partitionByPeriodOwner } from '@/lib/pengalihan'
import { bergeserDariNibar } from '@/lib/kodeRegister'
import { useTahunBukuMap } from '@/components/useTahunBuku'
import TahunTerkunciNote from '@/components/TahunTerkunciNote'
import { tahunAwal } from '@/lib/tahunKerja'

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
const GOL_MEREK = ['1.3.2', '1.5.3', '1.5.4']
const GOL_LOKASI = ['1.3.1', '1.3.3', '1.3.4', '1.3.6', '1.5.4']
// Hasil engine (penyusutan_semester) — angka period-aware.
type Peny = { nilai_perolehan: number; beban: number; akumulasi: number; nilai_buku_akhir: number; sisa_semester: number; masa_manfaat_tahun: number | null }
type Applied = { org: OrgSelection; golongan: string; komptabel: string; periode: string; search: string }

const angka = (v: number | null | undefined) =>
  v == null ? '-' : new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(v)

// Event yang menyembunyikan / memunculkan kembali aset (serap/hapus vs batal).
const SEMBUNYI = ['kapitalisasi_serap', 'penghapusan_pemindahtanganan', 'penghapusan_sebab_lain', 'batal_pengadaan', 'koreksi_pencatatan_ganda', 'batal_hibah_masuk', 'batal_tukar_menukar', 'batal_hasil_inventarisasi', 'batal_perolehan_lainnya', 'pemecahan_keluar', 'batal_pemecahan_masuk']
const MUNCUL = ['batal_kapitalisasi', 'batal_penghapusan', 'batal_pemecahan', 'batal_koreksi_pencatatan_ganda']

export default function PenyusutanPage() {
  const supabase = createClient()
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
    return q.order('nilai_perolehan', { ascending: false })
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

  // aset_id yang tersembunyi PER periode (serap/hapus dgn periode <= viewed, dikurangi batal).
  async function fetchHiddenIds(ids: string[], periode: string) {
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
    const [pmap, hidden] = await Promise.all([fetchPeny(ids, f.periode), fetchHiddenIds(ids, f.periode)])
    const belumAda = (b: Base) => !!b.tgl_perolehan && comparePeriode(periodeDariTanggal(b.tgl_perolehan), f.periode) > 0
    return combined
      .filter(b => !hidden.has(b.id) && !belumAda(b))
      .map(b => ({ ...b, p: pmap.get(b.id), ownerSkpd: owners.get(b.id) ?? b.skpd_id }))
  }

  // ⚠️ try/finally WAJIB — assembleRows memanggil kolektor fail-closed
  // (fetchOwnerOverrides MELEMPAR sejak 2026-07-28). Tanpa penangkap, satu
  // query gagal bikin `setLoading(false)` tak pernah tercapai → halaman beku
  // di "Memuat..." tanpa keterangan apa pun. Lihat CLAUDE.md.
  async function load(f: Applied) {
    setLoading(true); setErr('')
    try {
      const r = await assembleRows(f)
      setRows(r)
      setKapMap(await fetchKap(f))
      setUraianMap(await fetchUraian(r.map(b => b.kode_barang)))
    } catch (e) {
      // Fail-closed: daftar penyusutan yang kurang sebagian lebih berbahaya
      // daripada halaman yang menolak tampil.
      setErr(`${(e as Error).message} — daftar tidak ditampilkan supaya tidak ada yang terbaca sebagai lengkap padahal sebagian gagal dimuat. Coba Tampilkan lagi; kalau berulang, kabari admin.`)
      setRows([])
    } finally {
      setLoading(false)
    }
  }

  function tampilkan() {
    const f: Applied = { org, golongan, komptabel, periode: `${tahun}-S${smt}`, search }
    setApplied(f); load(f)
  }

  async function runEngine() {
    const periode = `${tahun}-S${smt}`
    if (!confirm(`Jalankan engine penyusutan untuk periode ${periode}?\nMenghitung ulang SEMUA aset (bisa beberapa menit). Aman diulang.`)) return
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
        'Komptabel': b.intra_ekstra || '',
        'Tgl Perolehan': b.tgl_perolehan || '',
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

  // Total kolom (pakai angka engine).
  const tot = rows.reduce((a, r) => {
    const susut = perlakuanKode(r.kode_barang) !== 'tidak'
    const p = r.p
    a.perolehan += p ? p.nilai_perolehan : (r.nilai_perolehan || 0)
    if (susut && p) { a.beban += p.beban; a.akum += p.akumulasi }
    a.nba += (susut && p) ? p.nilai_buku_akhir : (r.nilai_perolehan || 0)
    return a
  }, { perolehan: 0, beban: 0, akum: 0, nba: 0 })

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
              {rows.length.toLocaleString('id-ID')} aset · periode {applied.periode}
              {applied.org.skpdId && skpdNama[applied.org.skpdId] ? ` · ${skpdNama[applied.org.skpdId]}` : ''}
            </span>
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
                    <td className="table-td text-xs" colSpan={6 + (showMerek ? 1 : 0) + (showLokasi ? 1 : 0)}>TOTAL ({rows.length.toLocaleString('id-ID')} aset)</td>
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
        </div>
      )}

      {detail && <KapitalisasiDetailModal title={`Rincian Kapitalisasi — ${detail.nama}`} items={detail.items} onClose={() => setDetail(null)} />}
    </div>
  )
}
