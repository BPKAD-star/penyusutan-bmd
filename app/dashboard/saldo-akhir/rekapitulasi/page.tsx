'use client'
// Saldo Akhir → Rekapitulasi. Harga perolehan dari tabel `aset` LIVE (baseline +
// perolehan baru, period-aware) + akumulasi/beban/nilai buku dari hasil engine
// (penyusutan_semester) pada periode terpilih. Model 1: per golongan. Model 2:
// matriks per SKPD × per jenis.
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { exportToExcel } from '@/lib/export'
import { GOLONGAN_REKAP, kodeLevel3, comparePeriode, periodeDariTanggal, parsePeriode, formatPeriode, previousPeriode } from '@/lib/bmd'
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
const JENIS_CARA_PEROLEHAN = ['pengadaan', 'hibah_masuk', 'tukar_menukar', 'hasil_inventarisasi', 'perolehan_lainnya']
const JENIS_PENGHAPUSAN_M3 = ['penghapusan_pemindahtanganan', 'penghapusan_sebab_lain']
const JENIS_PEMBATALAN_INPUT = ['batal_pengadaan', 'batal_hibah_masuk', 'batal_tukar_menukar', 'batal_hasil_inventarisasi', 'batal_perolehan_lainnya', 'koreksi_pencatatan_ganda']

const SUB_METRICS: Metric[] = ['perolehan', 'akumulasi', 'beban', 'nilaiBuku']

export default function Page() {
  const supabase = createClient()
  const { rootOf } = useSkpdTree()
  const [org, setOrg] = useState<OrgSelection>({ skpdId: null, descendantIds: null })
  const [komptabel, setKomptabel] = useState('')
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

    // 1. Harga perolehan dari tabel `aset` LIVE (baseline + perolehan baru),
    //    period-aware: hanya barang yang SUDAH diperoleh s.d. periode & masih aktif.
    //    Simpan aset_id → {golongan, skpd_id} utk join hasil engine di step 2.
    const asetInfo = new Map<string, { g: string; skpd_id: number }>()
    const perolehan: Record<string, number> = {}
    const kuantitas: Record<string, number> = {}
    for (let from = 0; ; from += 1000) {
      let q = supabase.from('aset').select('id,kode,nilai_perolehan,skpd_id,tgl_perolehan,intra_ekstra,status')
      if (org.descendantIds) q = q.in('skpd_id', org.descendantIds)
      if (komptabel) q = q.eq('intra_ekstra', komptabel)
      const { data } = await q.range(from, from + 999)
      if (!data || data.length === 0) break
      for (const r of data as { id: string; kode: string; nilai_perolehan: number; skpd_id: number; tgl_perolehan: string | null; status: string }[]) {
        if (r.status !== 'aktif') continue
        if (r.tgl_perolehan && comparePeriode(periodeDariTanggal(r.tgl_perolehan), periode) > 0) continue
        const g = kodeLevel3(r.kode)
        const v = r.nilai_perolehan || 0
        perolehan[g] = (perolehan[g] || 0) + v
        kuantitas[g] = (kuantitas[g] || 0) + 1
        ensureCell(mtx, r.skpd_id, g).perolehan += v
        asetInfo.set(r.id, { g, skpd_id: r.skpd_id })
      }
      if (data.length < 1000) break
    }

    // 2. Penyusutan kumulatif dari engine (penyusutan_semester) pada periode,
    //    di-join ke golongan/SKPD lewat asetInfo. Nilai buku dari nilai_buku_akhir.
    const peny: Record<string, { akumulasi: number; beban: number; nilaiBuku: number }> = {}
    for (let from = 0; ; from += 1000) {
      const { data } = await supabase.from('penyusutan_semester')
        .select('aset_id,beban,akumulasi,nilai_buku_akhir').eq('periode', periode).range(from, from + 999)
      if (!data || data.length === 0) break
      for (const r of data as { aset_id: string; beban: number; akumulasi: number; nilai_buku_akhir: number }[]) {
        const info = asetInfo.get(r.aset_id)
        if (!info) continue // aset di luar filter (skpd/komptabel/periode) — abaikan
        const g = info.g
        peny[g] ??= { akumulasi: 0, beban: 0, nilaiBuku: 0 }
        peny[g].akumulasi += r.akumulasi || 0
        peny[g].beban += r.beban || 0
        peny[g].nilaiBuku += r.nilai_buku_akhir || 0
        const c = ensureCell(mtx, info.skpd_id, g)
        c.akumulasi += r.akumulasi || 0
        c.beban += r.beban || 0
        c.nilaiBuku += r.nilai_buku_akhir || 0
        hasPeny.add(mtxKey(info.skpd_id, g))
      }
      if (data.length < 1000) break
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
    for (let from = 0; ; from += 1000) {
      let q = supabase.from('aset').select('kode,nilai_perolehan,skpd_id,tgl_perolehan,intra_ekstra,status')
      if (org.descendantIds) q = q.in('skpd_id', org.descendantIds)
      if (komptabel) q = q.eq('intra_ekstra', komptabel)
      const { data } = await q.range(from, from + 999)
      if (!data || data.length === 0) break
      for (const r of data as { kode: string; nilai_perolehan: number; tgl_perolehan: string | null; status: string }[]) {
        if (r.status !== 'aktif') continue
        if (r.tgl_perolehan && comparePeriode(periodeDariTanggal(r.tgl_perolehan), pPeriode) > 0) continue
        const g = kodeLevel3(r.kode)
        out[g] = (out[g] || 0) + (r.nilai_perolehan || 0)
      }
      if (data.length < 1000) break
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
      nilai: number; tanggal: string; skpd_asal: number | null; skpd_tujuan: number | null
      payload: Record<string, unknown> | null
      aset: { kode: string; nama_barang: string | null; nibar: string | null; skpd_id: number; intra_ekstra: string | null } | null
    }
    const out: Row[] = []
    for (let from = 0; ; from += 1000) {
      const { data } = await supabase.from('transaksi_bmd')
        .select('nilai,tanggal,skpd_asal,skpd_tujuan,payload,aset:aset_id(kode,nama_barang,nibar,skpd_id,intra_ekstra)')
        .eq('periode', periode).in('jenis', jenisList as never)
        .range(from, from + 999)
      if (!data || data.length === 0) break
      out.push(...(data as unknown as Row[]))
      if (data.length < 1000) break
    }
    return out
  }

  async function prosesMutasi() {
    setLoading(true); setMutasiRows(null)

    const inScope = (skpdId: number | null) => skpdId != null && (org.descendantIds === null || org.descendantIds.includes(skpdId))
    const lolosKomptabel = (ie: string | null) => !komptabel || ie === komptabel

    const [saldoAwal, saldoAkhir, skpdMap] = await Promise.all([
      snapshotPerolehan(periodeSebelumnya),
      snapshotPerolehan(periode),
      fetchSkpdMapM3(),
    ])

    const tambah: Record<string, number> = {}
    const kurang: Record<string, number> = {}
    const detail: MutasiDetail = {}
    function addLine(map: Record<string, number>, arah: 'tambah' | 'kurang', g: string, line: MutasiDetailLine) {
      map[g] = (map[g] || 0) + line.nilai
      const d = (detail[g] ??= { tambah: [], kurang: [] })
      d[arah].push(line)
    }

    // Cara Perolehan → Penambahan
    for (const r of await fetchLedgerM3(JENIS_CARA_PEROLEHAN)) {
      if (!r.aset || !inScope(r.aset.skpd_id) || !lolosKomptabel(r.aset.intra_ekstra)) continue
      addLine(tambah, 'tambah', kodeLevel3(r.aset.kode), {
        kategori: 'Cara Perolehan', tanggal: r.tanggal, skpdNama: skpdMap[r.aset.skpd_id] || '-',
        namaBarang: r.aset.nama_barang, nibar: r.aset.nibar, nilai: r.nilai,
      })
    }

    // Penghapusan → Pengurangan
    for (const r of await fetchLedgerM3(JENIS_PENGHAPUSAN_M3)) {
      if (!r.aset || !inScope(r.aset.skpd_id) || !lolosKomptabel(r.aset.intra_ekstra)) continue
      addLine(kurang, 'kurang', kodeLevel3(r.aset.kode), {
        kategori: 'Penghapusan', tanggal: r.tanggal, skpdNama: skpdMap[r.aset.skpd_id] || '-',
        namaBarang: r.aset.nama_barang, nibar: r.aset.nibar, nilai: r.nilai,
      })
    }

    // Pembatalan Input (koreksi retroaktif, disetujui masuk Pengurangan)
    for (const r of await fetchLedgerM3(JENIS_PEMBATALAN_INPUT)) {
      if (!r.aset || !inScope(r.aset.skpd_id) || !lolosKomptabel(r.aset.intra_ekstra)) continue
      addLine(kurang, 'kurang', kodeLevel3(r.aset.kode), {
        kategori: 'Pembatalan Input / Duplikat', tanggal: r.tanggal, skpdNama: skpdMap[r.aset.skpd_id] || '-',
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
      if (!r.aset || !inScope(r.aset.skpd_id) || !lolosKomptabel(r.aset.intra_ekstra)) continue
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
      })), `Rekap_Saldo_Akhir_${periode}`, 'Rekap Saldo Akhir')
      return
    }
    if (model === 3) {
      if (!mutasiRows) return
      exportToExcel(mutasiRows.map(r => ({
        'Kode Jenis': r.kode, 'Uraian': r.uraian,
        [`Saldo Awal (${periodeSebelumnya})`]: r.saldoAwal,
        'Penambahan': r.penambahan, 'Pengurangan': r.pengurangan,
        [`Saldo Akhir (${periode})`]: r.saldoAkhir,
      })), `Rekap_Mutasi_${periode}`, 'Rekap Mutasi')
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
    }), `Rekap_Saldo_Akhir_${periode}_per_SKPD`, 'Rekap per SKPD')
  }

  const hasData = model === 1 ? (rows && rows.length > 0) : model === 3 ? (mutasiRows && mutasiRows.length > 0) : matrix.length > 0

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Saldo Akhir — Rekapitulasi</h1>
        <p className="text-gray-500 text-sm mt-1">Total rekapitulasi & penyusutan s.d. periode {periode}, per golongan BMD.</p>
      </div>

      <div className="card p-5 mb-4">
        <h2 className="text-base font-semibold text-gray-800 mb-4">Filter data</h2>
        <div className="space-y-3 max-w-3xl">
          <RekapModelControls model={model} onModel={setModel} metric={metric} onMetric={setMetric} models={[1, 2, 3]} />
          <div className="flex items-center gap-3">
            <label className="w-40 text-sm text-gray-600 text-right flex-shrink-0">SKPD / Lokasi :</label>
            <SkpdCombobox onChangeSelection={setOrg} allowClear placeholder="Semua — atau ketik SKPD / Sub OPD / Lokasi..." />
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
