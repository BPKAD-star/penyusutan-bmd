'use client'
// Laporan BMD — gabungan dari menu "Rekapitulasi" lama (/dashboard/saldo-akhir/
// rekapitulasi, dipindahkan ke sini 2026-07-10 supaya nggak ada 2 menu yang
// isinya tumpang tindih). Harga perolehan dari tabel `aset` LIVE (baseline +
// perolehan baru, period-aware) + akumulasi/beban/nilai buku dari hasil engine
// (penyusutan_semester) pada periode terpilih. Model 1: per golongan. Model 2:
// matriks per SKPD × per jenis. Model 3: mutasi saldo awal/akhir.
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { exportToExcel } from '@/lib/export'
import { GOLONGAN_REKAP, kodeLevel3, parsePeriode, formatPeriode, previousPeriode } from '@/lib/bmd'
import SkpdCombobox, { type SkpdSelection as OrgSelection } from '@/components/SkpdCombobox'
import KomptabelRadio from '@/components/KomptabelRadio'
import RekapTable, { type RekapRow } from '@/components/RekapTable'
import RekapMatrixTable, { METRIC_LABEL, type MatrixRow, type MatrixCell, type MetricOrAll, type Metric } from '@/components/RekapMatrixTable'
import RekapMutasiTable, { type MutasiRow, type MutasiDetail, type MutasiDetailLine } from '@/components/RekapMutasiTable'
import RekapModelControls from '@/components/RekapModelControls'
import { useSkpdTree } from '@/components/useSkpdTree'
import TahunTerkunciNote from '@/components/TahunTerkunciNote'
import { tahunAwal } from '@/lib/tahunKerja'

// ── Model 3: jenis ledger per kategori Penambahan/Pengurangan (nilai
// perolehan) — diverifikasi ke kode asli tiap alur (Pengadaan/PerolehanManual/
// Penghapusan/Reklasifikasi), lihat plan. `mutasi_internal` sengaja tidak
// diikutkan (tidak diminta user, netral kalau scope "Semua" spt pengalihan_status).
// batal_pengadaan/batal_hibah_masuk/dst & koreksi_pencatatan_ganda SENGAJA
// TIDAK dihitung sebagai Pengurangan (keputusan user 2026-07-10) — itu koreksi
// "barang dianggap tidak pernah ada" (salah input/duplikat), bukan pengurangan
// riil dari register yang sebelumnya benar. Saldo Awal/Akhir tetap akurat krn
// keduanya dihitung langsung dari snapshot `aset` LIVE (status='aktif'), tidak
// bergantung pada breakdown Penambahan/Pengurangan ini.
//
// Konsekuensinya: baris Cara Perolehan (Penambahan) yang belakangan di-batal/
// koreksi HARUS ikut disaring juga dari Penambahan (bukan cuma tidak dihitung
// sbg Pengurangan) — kalau tidak, barang yang sudah "dianggap tidak pernah
// ada" tetap nongol sbg Penambahan padahal sudah hilang dari Daftar Barang.
// VOID_JENIS dipakai utk kumpulkan aset_id yang PERNAH kena event ini (across
// ALL periode — batal_* selalu dicatat mundur ke tgl asli, jadi retroaktif
// menghapus dari SEMUA periode, bukan cuma periode saat tombol diklik).
const VOID_JENIS = ['batal_pengadaan', 'batal_hibah_masuk', 'batal_tukar_menukar', 'batal_hasil_inventarisasi', 'batal_perolehan_lainnya', 'koreksi_pencatatan_ganda']
const JENIS_CARA_PEROLEHAN = ['pengadaan', 'hibah_masuk', 'tukar_menukar', 'hasil_inventarisasi', 'perolehan_lainnya']
const JENIS_PENGHAPUSAN_M3 = ['penghapusan_pemindahtanganan', 'penghapusan_sebab_lain']

const SUB_METRICS: Metric[] = ['perolehan', 'akumulasi', 'beban', 'nilaiBuku']

export default function LaporanBmdPage() {
  const supabase = createClient()
  const { rootOf } = useSkpdTree()
  const [org, setOrg] = useState<OrgSelection>({ skpdId: null, descendantIds: null })
  // Default 'intra' (angka neraca) — sejak ekstra ikut disusutkan (2026-07-13),
  // "Semua" = campuran intra+ekstra, bukan lagi tampilan default yang aman.
  const [komptabel, setKomptabel] = useState('intra')
  const [tahun, setTahun] = useState(() => tahunAwal('2026'))
  const [smt, setSmt] = useState('2')
  const [model, setModel] = useState<1 | 2 | 3>(1)
  const [metric, setMetric] = useState<MetricOrAll>('perolehan')
  const [rows, setRows] = useState<RekapRow[] | null>(null)
  const [matrix, setMatrix] = useState<MatrixRow[]>([])
  const [mutasiRows, setMutasiRows] = useState<MutasiRow[] | null>(null)
  const [mutasiDetail, setMutasiDetail] = useState<MutasiDetail>({})
  const [loading, setLoading] = useState(false)
  const periode = `${tahun}-S${smt}`
  const periodeSebelumnya = formatPeriode(previousPeriode(parsePeriode(periode)))

  const rootId = (skpdId: number) => rootOf(skpdId)?.id ?? skpdId
  const mtxKey = (skpdId: number, g: string) => `${rootId(skpdId)}|${g}`

  // Ambil/siapkan sel matriks (skpd root × golongan) sekali.
  function ensureCell(mtx: Record<number, MatrixRow>, skpdId: number, g: string): MatrixCell {
    const root = rootOf(skpdId)
    const rid = root?.id ?? skpdId
    const rnama = root?.nama ?? `SKPD #${skpdId}`
    mtx[rid] ??= { skpdId: rid, skpdNama: rnama, cells: {} }
    return (mtx[rid].cells[g] ??= { perolehan: 0, akumulasi: 0, beban: 0, nilaiBuku: 0 })
  }

  async function proses() {
    setLoading(true); setRows([])
    const mtx: Record<number, MatrixRow> = {}
    const disusutkanKode = new Set(GOLONGAN_REKAP.filter(g => g.disusutkan).map(g => g.kode))
    const hasPeny = new Set<string>() // `${rid}|${golongan}` yg punya hasil engine
    const perolehan: Record<string, number> = {}
    const kuantitas: Record<string, number> = {}
    const peny: Record<string, { akumulasi: number; beban: number; nilaiBuku: number }> = {}

    // Agregasi (perolehan + penyusutan engine) per (skpd_id, golongan) dilakukan
    // di DB via RPC fn_rekap_bmd (satu query: aset LIVE ⋈ penyusutan_semester,
    // period-aware & komptabel di SQL) — BUKAN lagi paging seluruh aset +
    // penyusutan_semester ke browser (ratusan request se-kabupaten sejak import
    // 218rb baris P&M). count_peny > 0 = sel punya hasil engine (hasPeny). Semua
    // rollup SKPD induk + rekonsiliasi nilai buku di bawah TETAP di client.
    const { data } = await supabase.rpc('fn_rekap_bmd', {
      p_periode: periode,
      p_skpd_ids: org.descendantIds ?? null,
      p_komptabel: komptabel || null,
    })
    for (const r of (data || []) as { skpd_id: number; golongan: string; kuantitas: number; perolehan: number; akumulasi: number; beban: number; nilai_buku_akhir: number; count_peny: number }[]) {
      const g = r.golongan
      const v = Number(r.perolehan)
      perolehan[g] = (perolehan[g] || 0) + v
      kuantitas[g] = (kuantitas[g] || 0) + Number(r.kuantitas)
      const c = ensureCell(mtx, r.skpd_id, g)
      c.perolehan += v
      // akumulasi/beban/nilai_buku_akhir sudah 0 utk sel tanpa hasil engine
      // (LEFT JOIN) — akumulasi tanpa syarat aman. hasPeny dari count_peny.
      c.akumulasi += Number(r.akumulasi)
      c.beban += Number(r.beban)
      c.nilaiBuku += Number(r.nilai_buku_akhir)
      if (Number(r.count_peny) > 0) {
        peny[g] ??= { akumulasi: 0, beban: 0, nilaiBuku: 0 }
        peny[g].akumulasi += Number(r.akumulasi)
        peny[g].beban += Number(r.beban)
        peny[g].nilaiBuku += Number(r.nilai_buku_akhir)
        hasPeny.add(mtxKey(r.skpd_id, g))
      }
    }

    // Rekonsiliasi nilai buku sel: golongan disusutkan dgn hasil engine → pakai
    // akumulasi engine; selain itu (non-disusutkan / belum ada engine) → = perolehan.
    for (const row of Object.values(mtx)) {
      for (const g of GOLONGAN_REKAP) {
        const c = row.cells[g.kode]
        if (!c) continue
        if (!(disusutkanKode.has(g.kode) && hasPeny.has(mtxKey(row.skpdId, g.kode)))) {
          c.nilaiBuku = c.perolehan
        }
      }
    }

    setRows(GOLONGAN_REKAP.map(g => {
      const hp = perolehan[g.kode] || 0
      const kt = kuantitas[g.kode] || 0
      const p = peny[g.kode]
      if (g.disusutkan && p) {
        return { kode: g.kode, uraian: g.uraian, disusutkan: true, kuantitas: kt, perolehan: hp, akumulasi: p.akumulasi, beban: p.beban, nilaiBuku: p.nilaiBuku }
      }
      return { kode: g.kode, uraian: g.uraian, disusutkan: g.disusutkan, kuantitas: kt, perolehan: hp, akumulasi: 0, beban: 0, nilaiBuku: hp }
    }))
    setMatrix(Object.values(mtx).sort((a, b) => a.skpdNama.localeCompare(b.skpdNama)))
    setLoading(false)
  }

  // ── Model 3: mutasi (Saldo Awal + Penambahan − Pengurangan = Saldo Akhir) ──

  // Snapshot nilai perolehan per golongan pada suatu periode (barang aktif,
  // sudah diperoleh s.d. periode itu) — versi ringkas dari step 1 `proses()`
  // di atas, tanpa join penyusutan (Model 3 cuma butuh nilai perolehan).
  async function snapshotPerolehan(pPeriode: string): Promise<Record<string, number>> {
    const out: Record<string, number> = {}
    // Reuse fn_rekap_bmd (period-aware perolehan per golongan sudah dihitung di
    // SQL); Model 3 cuma butuh kolom perolehan-nya, penyusutan diabaikan.
    const { data } = await supabase.rpc('fn_rekap_bmd', {
      p_periode: pPeriode,
      p_skpd_ids: org.descendantIds ?? null,
      p_komptabel: komptabel || null,
    })
    for (const r of (data || []) as { golongan: string; perolehan: number }[]) {
      out[r.golongan] = (out[r.golongan] || 0) + Number(r.perolehan)
    }
    return out
  }

  async function fetchSkpdMapM3(): Promise<Record<number, string>> {
    const map: Record<number, string> = {}
    for (let from = 0; ; from += 1000) {
      const { data } = await supabase.from('admin_skpd').select('id,nama').range(from, from + 999)
      if (!data || data.length === 0) break
      for (const s of data as { id: number; nama: string }[]) map[s.id] = s.nama
      if (data.length < 1000) break
    }
    return map
  }

  // Baris ledger + join aset relevan (kode/nama/nibar/skpd/komptabel) utk satu
  // grup jenis, dalam periode terpilih.
  async function fetchLedgerM3(jenisList: string[]) {
    type Row = {
      id: number; aset_id: string; nilai: number; tanggal: string; skpd_asal: number | null; skpd_tujuan: number | null
      payload: Record<string, unknown> | null
      aset: { kode: string; nama_barang: string | null; nibar: string | null; skpd_id: number; intra_ekstra: string | null } | null
    }
    const out: Row[] = []
    for (let from = 0; ; from += 1000) {
      const { data } = await supabase.from('transaksi_bmd')
        .select('id,aset_id,nilai,tanggal,skpd_asal,skpd_tujuan,payload,aset:aset_id(kode,nama_barang,nibar,skpd_id,intra_ekstra)')
        .eq('periode', periode).in('jenis', jenisList as never)
        .range(from, from + 999)
      if (!data || data.length === 0) break
      out.push(...(data as unknown as Row[]))
      if (data.length < 1000) break
    }
    return out
  }

  // aset_id yang PERNAH kena batal_*/koreksi_pencatatan_ganda (semua periode —
  // event ini retroaktif, jadi harus disaring dari Penambahan di periode
  // manapun acquisition aslinya dicatat, bukan cuma periode saat dibatalkan).
  async function fetchVoidedAsetIds(): Promise<Set<string>> {
    const out = new Set<string>()
    for (let from = 0; ; from += 1000) {
      const { data } = await supabase.from('transaksi_bmd')
        .select('aset_id').in('jenis', VOID_JENIS as never).range(from, from + 999)
      if (!data || data.length === 0) break
      for (const r of data as { aset_id: string }[]) out.add(r.aset_id)
      if (data.length < 1000) break
    }
    // Un-void: koreksi_pencatatan_ganda yang DIBATALKAN (barang duplikat aktif
    // lagi) harus muncul kembali sbg Penambahan. Guard batal (tak boleh ada trx
    // lebih baru) menjamin batal = keadaan TERAKHIR, jadi cukup buang dari set.
    for (let from = 0; ; from += 1000) {
      const { data } = await supabase.from('transaksi_bmd')
        .select('aset_id').eq('jenis', 'batal_koreksi_pencatatan_ganda' as never).range(from, from + 999)
      if (!data || data.length === 0) break
      for (const r of data as { aset_id: string }[]) out.delete(r.aset_id)
      if (data.length < 1000) break
    }
    return out
  }

  // trx_id reklas yang DIBATALKAN (batal_reklas.payload.target_trx_id) — supaya
  // reklas_golongan yg sudah dibatalkan TIDAK ikut kehitung sbg mutasi hantu.
  async function fetchReklasDibatalkan(): Promise<Set<number>> {
    const out = new Set<number>()
    for (let from = 0; ; from += 1000) {
      const { data } = await supabase.from('transaksi_bmd')
        .select('payload').eq('jenis', 'batal_reklas' as never).range(from, from + 999)
      if (!data || data.length === 0) break
      for (const r of data as { payload: { target_trx_id?: number } | null }[]) {
        const t = Number(r.payload?.target_trx_id); if (Number.isFinite(t)) out.add(t)
      }
      if (data.length < 1000) break
    }
    return out
  }

  // aset_id yang NET-terhapus (penghapusan_* belum dibatalkan). batal_penghapusan
  // dicatat per-aset (bukan target_trx_id) & di-backdate ke periode penghapusan
  // asal, jadi tak bisa dipetakan per-trx spt reklas — pakai replay "event
  // TERAKHIR menang" (periode DESC, id DESC) yg sama dgn model visibilitas app:
  // kalau event terakhir penghapusan → net-terhapus (masuk Pengurangan); kalau
  // batal_penghapusan → net-aktif kembali (JANGAN dihitung sbg Pengurangan,
  // supaya hapus→batal netto nol & Model 3 rekonsiliasi). Tanpa ini, penghapusan
  // yg sudah dibatalkan tetap nyantol sbg Pengurangan hantu (SaldoAwal=SaldoAkhir
  // tapi Pengurangan≠0).
  async function fetchPenghapusanNetRemoved(): Promise<Set<string>> {
    const latest = new Map<string, { periode: string; id: number; removed: boolean }>()
    for (let from = 0; ; from += 1000) {
      const { data } = await supabase.from('transaksi_bmd')
        .select('id,aset_id,periode,jenis')
        .in('jenis', [...JENIS_PENGHAPUSAN_M3, 'batal_penghapusan'] as never)
        .range(from, from + 999)
      if (!data || data.length === 0) break
      for (const r of data as { id: number; aset_id: string; periode: string; jenis: string }[]) {
        // periode 'YYYY-SN' urut secara leksikal (S1<S2, 2026<2027).
        const cur = latest.get(r.aset_id)
        const menang = !cur || r.periode > cur.periode || (r.periode === cur.periode && r.id > cur.id)
        if (menang) latest.set(r.aset_id, { periode: r.periode, id: r.id, removed: r.jenis !== 'batal_penghapusan' })
      }
      if (data.length < 1000) break
    }
    const out = new Set<string>()
    for (const [asetId, s] of latest) if (s.removed) out.add(asetId)
    return out
  }

  async function prosesMutasi() {
    setLoading(true); setMutasiRows(null)

    const inScope = (skpdId: number | null) => skpdId != null && (org.descendantIds === null || org.descendantIds.includes(skpdId))
    const lolosKomptabel = (ie: string | null) => !komptabel || ie === komptabel

    const [saldoAwal, saldoAkhir, skpdMap, voided, reklasDibatalkan, penghapusanNetRemoved] = await Promise.all([
      snapshotPerolehan(periodeSebelumnya),
      snapshotPerolehan(periode),
      fetchSkpdMapM3(),
      fetchVoidedAsetIds(),
      fetchReklasDibatalkan(),
      fetchPenghapusanNetRemoved(),
    ])

    const tambah: Record<string, number> = {}
    const kurang: Record<string, number> = {}
    const detail: MutasiDetail = {}
    function addLine(map: Record<string, number>, arah: 'tambah' | 'kurang', g: string, line: MutasiDetailLine) {
      map[g] = (map[g] || 0) + line.nilai
      const d = (detail[g] ??= { tambah: [], kurang: [] })
      d[arah].push(line)
    }

    // Cara Perolehan → Penambahan (kecuali yang belakangan di-batal/koreksi —
    // itu dianggap tidak pernah ada, lihat VOID_JENIS di atas)
    for (const r of await fetchLedgerM3(JENIS_CARA_PEROLEHAN)) {
      if (!r.aset || voided.has(r.aset_id) || !inScope(r.aset.skpd_id) || !lolosKomptabel(r.aset.intra_ekstra)) continue
      addLine(tambah, 'tambah', kodeLevel3(r.aset.kode), {
        kategori: 'Cara Perolehan', tanggal: r.tanggal, skpdNama: skpdMap[r.aset.skpd_id] || '-',
        namaBarang: r.aset.nama_barang, nibar: r.aset.nibar, nilai: r.nilai,
      })
    }

    // Penghapusan → Pengurangan. Hanya yg NET-terhapus (belum dibatalkan) yg
    // dihitung; dedup per aset supaya siklus hapus→batal→hapus (>1 event
    // penghapusan seperiode) tak dobel-hitung nilainya.
    const hapusSeen = new Set<string>()
    for (const r of await fetchLedgerM3(JENIS_PENGHAPUSAN_M3)) {
      if (!r.aset || !inScope(r.aset.skpd_id) || !lolosKomptabel(r.aset.intra_ekstra)) continue
      if (!penghapusanNetRemoved.has(r.aset_id) || hapusSeen.has(r.aset_id)) continue
      hapusSeen.add(r.aset_id)
      addLine(kurang, 'kurang', kodeLevel3(r.aset.kode), {
        kategori: 'Penghapusan', tanggal: r.tanggal, skpdNama: skpdMap[r.aset.skpd_id] || '-',
        namaBarang: r.aset.nama_barang, nibar: r.aset.nibar, nilai: r.nilai,
      })
    }

    // Pengalihan Status: masuk ke Penambahan (tujuan in-scope, asal tidak) /
    // Pengurangan (asal in-scope, tujuan tidak) — netral kalau scope "Semua".
    for (const r of await fetchLedgerM3(['pengalihan_status'])) {
      if (!r.aset || !lolosKomptabel(r.aset.intra_ekstra)) continue
      const asalIn = inScope(r.skpd_asal)
      const tujuanIn = inScope(r.skpd_tujuan)
      const g = kodeLevel3(r.aset.kode)
      const line = (skpdId: number | null): MutasiDetailLine => ({
        kategori: tujuanIn && !asalIn ? 'Pengalihan Masuk' : 'Pengalihan Keluar', tanggal: r.tanggal,
        skpdNama: skpdMap[skpdId || 0] || '-', namaBarang: r.aset!.nama_barang, nibar: r.aset!.nibar, nilai: r.nilai,
      })
      if (tujuanIn && !asalIn) addLine(tambah, 'tambah', g, line(r.skpd_asal))
      else if (asalIn && !tujuanIn) addLine(kurang, 'kurang', g, line(r.skpd_tujuan))
    }

    // Reklasifikasi Perubahan Fungsi BMD: golongan ASAL (payload.kode_lama)
    // → Pengurangan, golongan TUJUAN (payload.kode_baru) → Penambahan.
    for (const r of await fetchLedgerM3(['reklas_golongan'])) {
      if (!r.aset || reklasDibatalkan.has(r.id) || !inScope(r.aset.skpd_id) || !lolosKomptabel(r.aset.intra_ekstra)) continue
      const kodeLama = typeof r.payload?.kode_lama === 'string' ? r.payload.kode_lama : null
      const kodeBaru = typeof r.payload?.kode_baru === 'string' ? r.payload.kode_baru : null
      if (!kodeLama || !kodeBaru) continue
      const skpdNama = skpdMap[r.aset.skpd_id] || '-'
      addLine(kurang, 'kurang', kodeLevel3(kodeLama), {
        kategori: 'Reklasifikasi Keluar', tanggal: r.tanggal, skpdNama, namaBarang: r.aset.nama_barang, nibar: r.aset.nibar, nilai: r.nilai,
      })
      addLine(tambah, 'tambah', kodeLevel3(kodeBaru), {
        kategori: 'Reklasifikasi Masuk', tanggal: r.tanggal, skpdNama, namaBarang: r.aset.nama_barang, nibar: r.aset.nibar, nilai: r.nilai,
      })
    }

    setMutasiDetail(detail)
    setMutasiRows(GOLONGAN_REKAP.map(g => {
      const sa = saldoAwal[g.kode] || 0
      const sk = saldoAkhir[g.kode] || 0
      return { kode: g.kode, uraian: g.uraian, saldoAwal: sa, penambahan: tambah[g.kode] || 0, pengurangan: kurang[g.kode] || 0, saldoAkhir: sk }
    }))
    setLoading(false)
  }

  function handleExport() {
    if (model === 1) {
      if (!rows) return
      exportToExcel(rows.map(r => ({
        'Kode Jenis': r.kode, 'Uraian': r.uraian, 'Kuantitas': r.kuantitas, 'Harga Perolehan': r.perolehan,
        [`Akumulasi Penyusutan s.d. ${periode}`]: r.disusutkan ? r.akumulasi : '',
        [`Beban Penyusutan ${periode}`]: r.disusutkan ? r.beban : '',
        'Nilai Buku': r.nilaiBuku,
      })), `Laporan_BMD_${periode}`, 'Laporan BMD')
      return
    }
    if (model === 3) {
      if (!mutasiRows) return
      exportToExcel(mutasiRows.map(r => ({
        'Kode Jenis': r.kode, 'Uraian': r.uraian,
        [`Saldo Awal (${periodeSebelumnya})`]: r.saldoAwal,
        'Penambahan': r.penambahan, 'Pengurangan': r.pengurangan,
        [`Saldo Akhir (${periode})`]: r.saldoAkhir,
      })), `Laporan_BMD_Mutasi_${periode}`, 'Laporan BMD Mutasi')
      return
    }
    const metrics: Metric[] = metric === 'semua' ? SUB_METRICS : [metric]
    exportToExcel(matrix.map(r => {
      const row: Record<string, unknown> = { SKPD: r.skpdNama }
      for (const g of GOLONGAN_REKAP) {
        const c = r.cells[g.kode]
        for (const m of metrics) {
          const applicable = (m !== 'akumulasi' && m !== 'beban') || g.disusutkan
          const key = metric === 'semua' ? `${g.uraian} — ${METRIC_LABEL[m]}` : g.uraian
          row[key] = applicable ? (c?.[m] || 0) : ''
        }
      }
      return row
    }), `Laporan_BMD_${periode}_per_SKPD`, 'Laporan BMD per SKPD')
  }

  const hasData = model === 1 ? (rows && rows.length > 0) : model === 3 ? (mutasiRows && mutasiRows.length > 0) : matrix.length > 0

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Laporan BMD</h1>
        <p className="text-gray-500 text-sm mt-1">Rekapitulasi & penyusutan s.d. periode {periode}, per golongan BMD.</p>
      </div>

      <div className="card p-5 mb-4">
        <h2 className="text-base font-semibold text-gray-800 mb-4">Filter data</h2>
        <div className="space-y-3 max-w-3xl">
          <RekapModelControls model={model} onModel={setModel} metric={metric} onMetric={setMetric} models={[1, 2, 3]} />
          <div className="flex items-center gap-3">
            <label className="w-40 text-sm text-gray-600 text-right flex-shrink-0">SKPD / Lokasi :</label>
            <SkpdCombobox lockToOperator onChangeSelection={setOrg} allowClear placeholder="Semua — atau ketik SKPD / Sub OPD / Lokasi..." />
          </div>
          <KomptabelRadio value={komptabel} onChange={setKomptabel} />
          <div className="flex items-center gap-3">
            <label className="w-40 text-sm text-gray-600 text-right flex-shrink-0">Sampai Semester :</label>
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
            <span className="w-40 flex-shrink-0" />
            <button className="btn-primary" onClick={model === 3 ? prosesMutasi : proses} disabled={loading}>{loading ? 'Memproses...' : 'Proses'}</button>
            {hasData && <button className="btn-secondary" onClick={handleExport}>Export Excel</button>}
          </div>
        </div>
      </div>

      <TahunTerkunciNote tahun={Number(tahun)} />

      {(model !== 3 && rows === null) || (model === 3 && mutasiRows === null) ? (
        <div className="card p-12 text-center text-gray-400 text-sm">
          Atur filter lalu klik <span className="font-medium text-gray-600">Proses</span>.
        </div>
      ) : model === 1 ? (
        <RekapTable rows={rows!} loading={loading}
          labelAkumulasi={`Akumulasi s.d. ${periode}`} labelBeban={`Beban ${periode}`} />
      ) : model === 3 ? (
        <RekapMutasiTable rows={mutasiRows!} detail={mutasiDetail} loading={loading} />
      ) : (
        <RekapMatrixTable rows={matrix} golongan={GOLONGAN_REKAP} metric={metric} loading={loading} />
      )}
    </div>
  )
}
