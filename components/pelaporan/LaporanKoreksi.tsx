'use client'
// ============================================================================
// Menu Pelaporan → Pengelolaan → KOREKSI.
//
// Tiga tab, pola yang sama dengan keluarga Perpindahan & Reklasifikasi:
//
//   Daftar Transaksi   — kelima alasan koreksi, baris ledger apa adanya
//   Rekap per SKPD     — matriks SKPD (root) × jenis aset
//   Format Permendagri — lembar IV.G.2 + IV.G.3–G.7 (KOREKSI NILAI saja)
//
// ⚠️ TAB 1 & TAB 3 SENGAJA BEDA CAKUPAN, dan itu wajib tertulis di layar:
// Daftar Transaksi memuat KELIMA alasan (Nilai · Pencatatan Ganda · Spesifikasi
// · Pemecahan · Penggabungan), sedangkan lembar IV.G hanya tentang PERUBAHAN
// NILAI. Tanpa keterangan itu operator melihat dua angka berbeda untuk periode
// yang sama & mengira salah satunya bug. Alasan lengkapnya di kepala
// lib/formatKoreksi.ts.
//
// ⚠️ HALAMAN INI MENGGANTIKAN `LaporanTransaksi` di menu Koreksi. Dua hal yang
// WAJIB ikut pindah & gampang tertinggal:
//   1. saringan `batal_koreksi_*` (`BATAL_TARGET_JENIS.koreksi`) — tanpa itu
//      koreksi yang sudah dianulir tampil seolah berlaku;
//   2. penyaring **"Asal baris"** berbawaan `menu` (keputusan user 2026-09-07):
//      202 baris `koreksi_pencatatan_ganda` di ledger lahir dari batch SQL
//      admin, bukan dari menu, dan user memutuskan barisnya jangan ditampilkan.
//      Pembedanya `created_by IS NULL`, BUKAN `header_id` — lihat kepala
//      components/LaporanTransaksi.tsx untuk angka produksinya.
// ============================================================================
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { exportToExcel, formatRupiah } from '@/lib/export'
import { namaBerkasLaporan } from '@/lib/namaBerkas'
import { useNamaSkpd } from '@/components/useNamaSkpd'
import { GOLONGAN_REKAP, kodeLevel3, JENIS_TRANSAKSI_LABEL } from '@/lib/bmd'
import SkpdCombobox from '@/components/SkpdCombobox'
import { useProfilRole } from '@/components/useProfilRole'
import RekapMatrixTable, { type MatrixRow } from '@/components/RekapMatrixTable'
import { bangunPohonRekap, ratakanPohon, type LeafRekap } from '@/lib/rekapPohon'
import { useSkpdTree } from '@/components/useSkpdTree'
import { useTahunBukuMap } from '@/components/useTahunBuku'
import { fetchBatalTargets, BATAL_TARGET_JENIS } from '@/lib/voidedAset'
import { periodeDiminta } from '@/lib/laporanPerolehanPermendagri'
import { LEMBAR_PERMENDAGRI } from '@/lib/permendagriFormat'
import KoreksiFormatPermendagri from './KoreksiFormatPermendagri'

/**
 * Jenis yang ditampilkan tab "Daftar Transaksi".
 *
 * ⚠️ **`batal_pemecahan` & `batal_pemecahan_masuk` SENGAJA IKUT**, dan itu
 * keputusan yang sudah ada sejak versi `LaporanTransaksi` — dipertahankan apa
 * adanya waktu menu ini pindah kerangka. Keduanya ditampilkan sbg BARIS
 * TERSENDIRI, bukan sbg penganulir lewat `target_trx_id`: pembatalan pemecahan
 * adalah peristiwa yang memang perlu terlihat di rekap. Membuangnya tak
 * menghasilkan satu pun error — barisnya cuma hilang dari laporan.
 *
 * ⚠️ **`penggabungan_*` TIDAK ikut**, sama seperti sebelumnya. Bukan karena tak
 * relevan (ia alasan koreksi kelima), tapi karena predikat `idx_trx_koreksi_id`
 * belum memuatnya — menambahkannya di sini TANPA memperlebar indexnya lebih
 * dulu membuat menu ini TIMEOUT begitu dibuka tanpa filter, persis insiden
 * 2026-08-26. Kalau mau ikut: migrasi index dulu, baru daftar ini.
 *
 * ⚠️ KEMBAR dengan predikat partial index `idx_trx_koreksi_id` (migrasi
 * 20260826_01). Dikunci lib/sinkronisasiRpc.test.ts.
 */
const JENIS_KOREKSI = [
  'koreksi_nilai', 'koreksi_spesifikasi', 'koreksi_pencatatan_ganda',
  'pemecahan_keluar', 'pemecahan_masuk', 'batal_pemecahan', 'batal_pemecahan_masuk',
] as const

type Trx = {
  id: number
  aset_id: string | null
  jenis: string
  periode: string
  tanggal: string
  nilai: number
  keterangan: string | null
  /** `null` = ditulis di luar aplikasi (SQL Editor/migrasi). */
  created_by: string | null
  aset: {
    nibar: string | null; nama_barang: string | null; kode: string
    intra_ekstra: string | null; skpd_id: number | null
  } | null
}

const SEL = 'id,aset_id,jenis,periode,tanggal,nilai,keterangan,created_by,'
  + 'aset:aset_id(nibar,nama_barang,kode,intra_ekstra,skpd_id)'

/**
 * Baris ini ditulis di luar aplikasi (SQL Editor / migrasi), bukan lewat menu.
 *
 * ⚠️ `created_by` ber-DEFAULT `auth.uid()`, jadi tulisan dari klien yang login
 * PASTI terisi. `header_id` TIDAK bisa dipakai — baris SAH dari menu juga
 * banyak yang tak ber-header. Lihat kepala components/LaporanTransaksi.tsx.
 */
const dariPerbaikanData = (r: Trx) => r.created_by == null

type AsalBaris = 'menu' | 'semua' | 'perbaikan'
const ASAL_LABEL: Record<AsalBaris, string> = {
  menu: 'Lewat menu aplikasi',
  semua: 'Semua asal (termasuk perbaikan data)',
  perbaikan: 'Perbaikan data (admin) saja',
}

export default function LaporanKoreksi() {
  const { role, skpdId: myScopeId } = useProfilRole()
  const isAdmin = role === 'admin'
  const supabase = createClient()
  const { byId: skpdById, childrenOf, rootOf, loaded: skpdLoaded } = useSkpdTree()
  // Rekap per SKPD = admin ATAU siapa pun yang punya anak SKPD di bawahnya
  // (keputusan user 2026-09-10) — lihat catatan sama di LaporanPerolehan.tsx.
  const bolehRekap = isAdmin || (myScopeId != null && (childrenOf.get(myScopeId)?.length ?? 0) > 0)
  const tahunBuku = useTahunBukuMap()
  const namaSkpd = useNamaSkpd()
  const lembar = LEMBAR_PERMENDAGRI['koreksi-nilai']

  const [periode, setPeriode] = useState('')
  const [skpdId, setSkpdId] = useState<number | null>(null)
  const [descIds, setDescIds] = useState<number[] | null>(null)
  const [asal, setAsal] = useState<AsalBaris>('menu')
  const [view, setView] = useState<'list' | 'matrix' | 'permendagri'>('list')

  const [rows, setRows] = useState<Trx[]>([])
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [err, setErr] = useState('')

  const tahunTerbuka = Object.entries(tahunBuku)
    .filter(([, st]) => st === 'terbuka').map(([t]) => Number(t))
  const tahunKerja = tahunTerbuka.length > 0 ? Math.max(...tahunTerbuka) : new Date().getFullYear()
  const tahunList = [String(tahunKerja)]

  const buildQuery = useCallback(() => {
    // ⚠️ `.order('id')`, BUKAN `.order('periode')`/`('tanggal')`: `jenis`
    // bertipe ENUM tak bisa jadi index-cond di bawah RLS, jadi urutan yang
    // dipakai menentukan index mana yang sanggup melayani. Bentuk ini dilayani
    // partial index `idx_trx_koreksi_id` (migrasi 20260826_01).
    let q = supabase.from('transaksi_bmd').select(SEL)
      .in('jenis', JENIS_KOREKSI as never)
      .order('id', { ascending: false })
    const per = periodeDiminta(periode)
    if (per.length === 1) q = q.eq('periode', per[0])
    else if (per.length > 1) q = q.in('periode', per)
    return q
  }, [periode]) // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Buang koreksi yang sudah DIBATALKAN & yang di luar scope SKPD.
   *
   * ⚠️ SKPD disaring DI MEMORI: baris koreksi tak punya `skpd_asal`/
   * `skpd_tujuan` (barangnya tak berpindah SKPD), jadi satu-satunya penunjuknya
   * `aset.skpd_id`. Menyaringnya di server butuh `aset!inner` +
   * `.in('aset.skpd_id', <694 id>)` — bentuk yang sudah berkali-kali jadi sebab
   * timeout di repo ini. Sama persis dengan lib/laporanReklas.ts.
   *   ⚠️ Ini juga MEMPERBAIKI cacat lama: versi `LaporanTransaksi` menyaring
   *   `skpd_asal`/`skpd_tujuan` yang di ledger koreksi SELALU NULL, jadi memilih
   *   SKPD di sana menghasilkan 0 transaksi yang kelihatan sah.
   *
   * ⚠️ MELEMPAR kalau query pembatalan gagal — fail-closed. Set kosong berarti
   * "tak ada yang dibatalkan" & koreksi yang sudah dianulir tampil seolah
   * berlaku, beda dgn engine, Laporan BMD, & Rekonsiliasi.
   */
  const saring = useCallback(async (baris: Trx[]): Promise<Trx[]> => {
    const punyaAset = baris.filter(r => r.aset)
    const scoped = descIds && descIds.length > 0
      ? punyaAset.filter(r => r.aset!.skpd_id != null && descIds.includes(r.aset!.skpd_id))
      : punyaAset
    const target = await fetchBatalTargets(
      supabase, BATAL_TARGET_JENIS.koreksi,
      scoped.map(r => r.aset_id).filter((id): id is string => !!id))
    return scoped.filter(r => !target.has(r.id))
  }, [descIds]) // eslint-disable-line react-hooks/exhaustive-deps

  const pesanGagal = (e: Error) =>
    `Gagal memuat laporan: ${e.message}. Angka di halaman ini TIDAK ditampilkan — `
    + 'muat ulang halaman dulu.'

  useEffect(() => {
    let batal = false
    void (async () => {
      setLoading(true); setErr('')
      try {
        const all: Trx[] = []
        for (let from = 0; ; from += 1000) {
          // `error` WAJIB dibaca: `const { data } = await` bikin query yang
          // gagal terbaca sebagai "datanya memang kosong".
          const { data, error } = await buildQuery().range(from, from + 999)
          if (error) throw new Error(error.message)
          if (!data || data.length === 0) break
          all.push(...(data as never as Trx[]))
          if (data.length < 1000) break
        }
        const hasil = await saring(all)
        if (!batal) setRows(hasil)
      } catch (e) {
        if (!batal) { setErr(pesanGagal(e as Error)); setRows([]) }
      } finally {
        // Di `finally`, BUKAN di akhir jalur sukses.
        if (!batal) setLoading(false)
      }
    })()
    return () => { batal = true }
  }, [buildQuery, saring])

  // ⚠️ Penyaring asal dipasang SESUDAH tarikan supaya jumlah yang tersaring
  // tetap bisa disebut di layar — kalau disaring di server, keterangannya ikut
  // hilang & operator kehilangan justru penjelasan yang ia cari.
  const rowsTampil = asal === 'semua' ? rows
    : rows.filter(r => dariPerbaikanData(r) === (asal === 'perbaikan'))
  const nPerbaikan = rows.filter(dariPerbaikanData).length
  const nTersaring = rows.length - rowsTampil.length

  // ── Identitas SKPD baris ────────────────────────────────────────────────
  // ⚠️ UNIT-nya, bukan cuma induknya. Insiden 2026-09-08: satu pemecahan tanah
  // dicatat di "Bagian Kesejahteraan Rakyat" lalu dicari di "Bagian Perekonomian
  // dan Sumber Daya Alam" — dua Bagian bertetangga di bawah Sekretariat Daerah
  // yang sama. Kalau yang ditampilkan cuma induknya, keduanya sama-sama tertulis
  // "Sekretariat Daerah" & laporan ini tak menolong sama sekali. Nama induk
  // tetap ikut sbg baris kedua, karena nama Bagian/UPTD sendiri sering tak
  // menyebut induknya.
  const unitNama = (r: Trx) => {
    const sid = r.aset?.skpd_id
    if (sid == null) return '(tanpa SKPD)'
    return skpdById.get(sid)?.nama ?? `SKPD #${sid}`
  }
  const indukNama = (r: Trx) => {
    const sid = r.aset?.skpd_id
    if (sid == null) return ''
    const root = rootOf(sid)
    return root && root.id !== sid ? root.nama : ''
  }

  // Urut: induk → unit → tanggal terbaru dulu → id (pemecah seri).
  // ⚠️ Pemecah seri `id` WAJIB ada: satu SKPD bisa punya puluhan baris
  // bertanggal sama, dan tanpa urutan TOTAL isinya bisa bergeser tiap render
  // (Array.prototype.sort tak dijamin stabil di semua mesin) — daftar yang
  // berpindah-pindah sendiri bikin operator mengira datanya berubah.
  const rowsUrut = [...rowsTampil].sort((a, b) => {
    const ia = indukNama(a) || unitNama(a), ib = indukNama(b) || unitNama(b)
    if (ia !== ib) return ia.localeCompare(ib, 'id')
    const ua = unitNama(a), ub = unitNama(b)
    if (ua !== ub) return ua.localeCompare(ub, 'id')
    if (a.tanggal !== b.tanggal) return a.tanggal < b.tanggal ? 1 : -1
    return b.id - a.id
  })

  const rekap = new Map<string, { n: number; nilai: number }>()
  for (const r of rowsTampil) {
    const cur = rekap.get(r.jenis) || { n: 0, nilai: 0 }
    cur.n += 1; cur.nilai += r.nilai || 0
    rekap.set(r.jenis, cur)
  }

  const matrix: MatrixRow[] = (() => {
    if (!skpdLoaded) return []
    const leaf = new Map<number, LeafRekap>()
    for (const r of rowsTampil) {
      const sid = r.aset?.skpd_id
      if (!sid) continue
      const nama = skpdById.get(sid)?.nama ?? `SKPD #${sid}`
      const l = leaf.get(sid) ?? { nama, cells: {} }
      const c = (l.cells[kodeLevel3(r.aset!.kode)] ??= { perolehan: 0, akumulasi: 0, beban: 0, nilaiBuku: 0 })
      c.perolehan += r.nilai || 0
      leaf.set(sid, l)
    }
    const akarIds = isAdmin
      ? [...new Set([...leaf.keys()].map(id => rootOf(id)?.id ?? id))]
      : (myScopeId != null ? [myScopeId] : [])
    return bangunPohonRekap(leaf, skpdById, akarIds)
  })()

  function handleExport() {
    setExporting(true)
    exportToExcel(rowsUrut.map(r => ({
      // SKPD paling kiri: berkasnya memang dibaca per SKPD, dan kolom pertama
      // itu yang dipakai orang menyortir/mem-pivot di Excel.
      'SKPD': unitNama(r),
      'SKPD Induk': indukNama(r),
      'Tanggal': r.tanggal,
      'Periode': r.periode,
      'Jenis': JENIS_TRANSAKSI_LABEL[r.jenis] || r.jenis,
      'NIBAR': r.aset?.nibar || '',
      'Nama Barang': r.aset?.nama_barang || '',
      'Kode': r.aset?.kode || '',
      'Komptabel': (r.aset?.intra_ekstra || '').toUpperCase(),
      'Nilai (Rp)': r.nilai,
      'Asal Baris': dariPerbaikanData(r) ? 'Perbaikan data (admin)' : 'Lewat menu aplikasi',
      'Keterangan': r.keterangan || '',
    })), namaBerkasLaporan({ laporan: 'Laporan Koreksi', periode, skpd: namaSkpd.nama }), 'Laporan')
    setExporting(false)
  }

  function handleExportMatrix() {
    exportToExcel(ratakanPohon(matrix).map(({ row: r, namaBerindentasi }) => {
      const row: Record<string, unknown> = { SKPD: namaBerindentasi }
      let total = 0
      for (const g of GOLONGAN_REKAP) { const v = r.cells[g.kode]?.perolehan || 0; row[g.uraian] = v; total += v }
      row['Total'] = total
      return row
    }), namaBerkasLaporan({ laporan: 'Laporan Koreksi', periode, skpd: namaSkpd.nama, akhiran: ['per SKPD'] }), 'Rekap per SKPD')
  }

  return (
    <div className="p-6">
      {err && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 mb-4">{err}</div>
      )}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Laporan Koreksi</h1>
          <p className="text-gray-500 text-sm mt-1">
            Rekap koreksi nilai, spesifikasi, pencatatan ganda, &amp; pemecahan barang — Format
            Permendagri <b>IV.G.2–G.7</b> tersedia untuk <b>koreksi nilai</b>. Koreksi yang
            sudah dibatalkan tidak ditampilkan.
          </p>
        </div>
        {view !== 'permendagri' && (
          <button onClick={view === 'list' ? handleExport : handleExportMatrix}
            disabled={view === 'list' ? exporting || rowsTampil.length === 0 : matrix.length === 0}
            className="btn-primary">{exporting ? 'Mengekspor...' : 'Export Excel'}</button>
        )}
      </div>

      <div className="mb-4 inline-flex rounded-lg border border-gray-200 bg-gray-50 p-1 text-sm">
        {/* Rekap per SKPD = admin ATAU siapa pun yang punya anak SKPD di
            bawahnya (keputusan user 2026-09-10) — lihat `bolehRekap`. */}
        {([['list', 'Daftar Transaksi'] as const,
          ...(bolehRekap ? [['matrix', 'Rekap per SKPD'] as const] : []),
          ...(lembar ? [['permendagri', 'Format Permendagri'] as const] : [])] as const).map(([v, label]) => (
          <button key={v} onClick={() => setView(v as typeof view)}
            className={`px-4 py-1.5 rounded-md transition-colors ${view === v ? 'bg-white shadow-sm font-medium text-gray-800' : 'text-gray-500 hover:text-gray-700'}`}>
            {label}
          </button>
        ))}
      </div>

      <div className="card p-4 mb-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Periode</label>
          <select className="select-filter" value={periode} onChange={e => setPeriode(e.target.value)}>
            <option value="">Semua Periode</option>
            {tahunList.flatMap(t => [
              <option key={`${t}-S1`} value={`${t}-S1`}>{t} — Semester I</option>,
              <option key={`${t}-S2`} value={`${t}-S2`}>{t} — Semester II</option>,
              <option key={t} value={t}>{t} — Akhir Tahun</option>,
            ])}
          </select>
        </div>
        <div className="min-w-[280px]">
          <label className="block text-xs text-gray-500 mb-1">SKPD / Lokasi</label>
          <SkpdCombobox lockToOperator allowClear
            placeholder="Semua SKPD — atau ketik SKPD / Sub OPD / Lokasi..."
            onChangeSelection={sel => {
              setSkpdId(sel.skpdId); setDescIds(sel.descendantIds); void namaSkpd.pilih(sel.skpdId)
            }} />
        </div>
        {/* Cuma muncul kalau memang ADA baris perbaikan data — kendali yang tak
            menyaring apa pun hanya jadi kotak mati. */}
        {nPerbaikan > 0 && view !== 'permendagri' && (
          <div>
            <label className="block text-xs text-gray-500 mb-1">Asal baris</label>
            <select className="select-filter" value={asal} onChange={e => setAsal(e.target.value as AsalBaris)}>
              {(Object.keys(ASAL_LABEL) as AsalBaris[]).map(a => (
                <option key={a} value={a}>{ASAL_LABEL[a]}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {view === 'permendagri' ? (
        <KoreksiFormatPermendagri skpdId={skpdId} periode={periode} />
      ) : view === 'matrix' ? (
        <>
          <p className="text-xs text-gray-500 mb-2">Diatribusikan ke jenis aset barangnya.</p>
          <RekapMatrixTable rows={matrix} golongan={GOLONGAN_REKAP} metric="perolehan" loading={loading} />
        </>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            {[...rekap.entries()].map(([j, v]) => (
              <div key={j} className="card p-4">
                <p className="text-xs text-gray-500">{JENIS_TRANSAKSI_LABEL[j] || j}</p>
                <p className="text-lg font-bold text-gray-900 mt-1">
                  {v.n.toLocaleString('id-ID')} <span className="text-xs font-normal text-gray-400">transaksi</span>
                </p>
                <p className="text-xs text-teal font-medium">{formatRupiah(v.nilai)}</p>
              </div>
            ))}
          </div>

          <div className="card overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100">
              <span className="text-sm text-gray-500">
                {rowsTampil.length.toLocaleString('id-ID')} transaksi
                {/* ⚠️ Batas minimum keterbukaan, JANGAN dicabut: tanpa kalimat
                    ini laporan diam-diam kehilangan 200 baris & tak ada yang
                    bisa tahu. */}
                {nTersaring > 0 && (
                  <> · <span className="text-amber-700">{nTersaring.toLocaleString('id-ID')} baris
                    perbaikan data admin disembunyikan</span> — pilih <i>{ASAL_LABEL.semua}</i> untuk melihatnya.</>
                )}
                {/* ⚠️ Tabel memang cuma merender 500 baris pertama, dan sejak
                    urutannya PER SKPD (2026-09-08) pemotongan itu tak lagi
                    "yang terbaru saja" melainkan membuang SKPD yang urutannya
                    di belakang — SELURUH barisnya, tanpa satu pun tanda. Excel
                    tetap memuat semuanya. Jangan hapus keterangan ini. */}
                {rowsUrut.length > 500 && (
                  <> · <span className="text-amber-700">tabel menampilkan 500 baris pertama</span> —
                    SKPD di urutan berikutnya belum tampil; pakai Export Excel untuk seluruhnya.</>
                )}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="table-th">SKPD</th>
                    <th className="table-th">Tanggal</th>
                    <th className="table-th">Jenis</th>
                    <th className="table-th">Barang</th>
                    <th className="table-th">Komptabel</th>
                    <th className="table-th text-right">Nilai</th>
                    <th className="table-th">Keterangan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {loading ? (
                    <tr><td colSpan={7} className="table-td text-center py-12 text-gray-400">Memuat data...</td></tr>
                  ) : rowsTampil.length === 0 ? (
                    <tr><td colSpan={7} className="table-td text-center py-12 text-gray-400">Tidak ada transaksi</td></tr>
                  ) : rowsUrut.slice(0, 500).map(r => (
                    <tr key={r.id}>
                      <td className="table-td text-xs">
                        <p className="font-medium">{unitNama(r)}</p>
                        {indukNama(r) && <p className="text-gray-400">{indukNama(r)}</p>}
                      </td>
                      <td className="table-td text-xs">{r.tanggal}<br /><span className="text-gray-400">{r.periode}</span></td>
                      <td className="table-td text-xs">
                        {JENIS_TRANSAKSI_LABEL[r.jenis] || r.jenis}
                        {dariPerbaikanData(r) && (
                          <span className="ml-1 inline-block rounded bg-amber-50 px-1 text-[10px] text-amber-700 border border-amber-200"
                            title="Ditulis admin langsung ke basis data (perbaikan/impor massal), bukan lewat menu.">
                            perbaikan data
                          </span>
                        )}
                      </td>
                      <td className="table-td text-xs">
                        <p className="font-medium">{r.aset?.nama_barang || '-'}</p>
                        <p className="text-gray-400">{r.aset?.nibar || '-'}</p>
                      </td>
                      <td className="table-td text-xs">{(r.aset?.intra_ekstra || '-').toUpperCase()}</td>
                      <td className="table-td text-xs text-right">{formatRupiah(r.nilai)}</td>
                      <td className="table-td text-xs text-gray-500 max-w-[200px] truncate">{r.keterangan || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
