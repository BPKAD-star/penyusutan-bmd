'use client'
// ============================================================================
// Menu Pelaporan → Pengelolaan → PENGHAPUSAN.
//
// Penyaring **ALASAN PENGHAPUSAN di ATAS tab** (permintaan user 2026-09-07),
// lalu tiga tab seperti keluarga Reklasifikasi & Koreksi:
//
//   Daftar Transaksi   — baris ledger cabang terpilih
//   Rekap per SKPD     — matriks SKPD (root) × jenis aset
//   Format Permendagri — IV.K.<n>.2 rinci + IV.K.<n>.3–.6 rekap
//
// ⚠️ **ALASAN MENYARING BARIS SUNGGUHAN di sini**, beda dari menu
// Reklasifikasi yang arahnya cuma sudut pandang atas baris yang sama. Ketiga
// cabang membaca jenis ledger yang BERBEDA:
//   Pemindahtanganan  → `penghapusan_pemindahtanganan`  (IV.K.1)
//   Pengalihan Status → `pengalihan_status`, sisi PELEPAS (IV.K.2)
//   Sebab Lain        → `penghapusan_sebab_lain`        (IV.K.6)
//
// ⚠️ Cabang **Pengalihan Status membaca ledger yang SAMA dengan menu
// Penggunaan**, cuma dari sisi berlawanan (`skpd_asal` vs `skpd_tujuan`). Itu
// wajib dikatakan di layar — dua menu yang menampilkan angka berbeda atas baris
// yang sama akan terbaca sebagai bug.
//
// ⚠️ HALAMAN INI MENGGANTIKAN `LaporanTransaksi` di menu Penghapusan. Satu hal
// yang WAJIB ikut & gampang tertinggal: versi lama memakai
// `efektifPerAsetStatus="dihapus"` — hanya barang yang statusnya SEKARANG masih
// dihapus, supaya percobaan hapus→batal→hapus tak dobel-hitung. Penggantinya
// menyaring `batal_penghapusan` lewat `fetchBatalTargets` yang TERSCOPE, yang
// menjawab pertanyaan yang sama dengan cara yang sepakat dgn seluruh modul
// pelaporan lain.
// ============================================================================
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { exportToExcel, formatRupiah } from '@/lib/export'
import { namaBerkasLaporan } from '@/lib/namaBerkas'
import { useNamaSkpd } from '@/components/useNamaSkpd'
import { GOLONGAN_REKAP, kodeLevel3 } from '@/lib/bmd'
import SkpdCombobox from '@/components/SkpdCombobox'
import RekapMatrixTable, { type MatrixRow } from '@/components/RekapMatrixTable'
import { useSkpdTree } from '@/components/useSkpdTree'
import { useTahunBukuMap } from '@/components/useTahunBuku'
import { LEMBAR_PERMENDAGRI, type IdLembar } from '@/lib/permendagriFormat'
import {
  FORMAT_PENGHAPUSAN, URUT_PENGHAPUSAN, type IdPenghapusan,
} from '@/lib/formatPenghapusan'
import { muatLaporanPenghapusan, type BarisPenghapusan } from '@/lib/laporanPenghapusan'
import PenghapusanFormatPermendagri from './PenghapusanFormatPermendagri'

/** Kunci registry lembar per cabang — dirakit, bukan diketik tiga kali. */
const kunciLembar = (id: IdPenghapusan) =>
  `penghapusan-${id.replace('_', '-')}` as IdLembar

export default function LaporanPenghapusan() {
  const supabase = createClient()
  const { rootOf, loaded: skpdLoaded } = useSkpdTree()
  const tahunBuku = useTahunBukuMap()
  const namaSkpd = useNamaSkpd()

  const [id, setId] = useState<IdPenghapusan>('pemindahtanganan')
  const [periode, setPeriode] = useState('')
  const [skpdId, setSkpdId] = useState<number | null>(null)
  const [view, setView] = useState<'list' | 'matrix' | 'permendagri'>('list')

  const [rows, setRows] = useState<BarisPenghapusan[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')

  const f = FORMAT_PENGHAPUSAN[id]
  // ⚠️ Dibaca dari REGISTRY, bukan dari `FORMAT_PENGHAPUSAN`. Registry-lah
  // satu-satunya daftar yang menjawab "lembar ini sudah ada atau belum";
  // `FORMAT_PENGHAPUSAN` menjawab pertanyaan lain — bentuk tabelnya. Dua daftar
  // yang sama-sama boleh bilang "ada" pasti menyimpang.
  const adaLembar = !!LEMBAR_PERMENDAGRI[kunciLembar(id)]

  const tahunTerbuka = Object.entries(tahunBuku)
    .filter(([, st]) => st === 'terbuka').map(([t]) => Number(t))
  const tahunKerja = tahunTerbuka.length > 0 ? Math.max(...tahunTerbuka) : new Date().getFullYear()
  const tahunList = [String(tahunKerja)]

  const muat = useCallback(async () => {
    // Satu pemuat untuk ketiga tab — dua jalur angka untuk data yang sama
    // selalu berakhir menyimpang diam-diam.
    return muatLaporanPenghapusan(supabase, { f, skpdId, periode })
  }, [f, skpdId, periode]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let batal = false
    void (async () => {
      setLoading(true); setErr('')
      try {
        const h = await muat()
        if (!batal) setRows(h.rows)
      } catch (e) {
        // Fail-closed (CLAUDE.md, modul pelaporan): lebih baik menolak tampil
        // daripada menyajikan angka kurang-sebagian yang kelihatan sah.
        if (!batal) {
          setErr(`Gagal memuat laporan: ${(e as Error).message}. Angka di halaman ini TIDAK `
            + 'ditampilkan — muat ulang halaman dulu.')
          setRows([])
        }
      } finally {
        // Di `finally`, BUKAN di akhir jalur sukses.
        if (!batal) setLoading(false)
      }
    })()
    return () => { batal = true }
  }, [muat])

  // Rekap per SKPD diturunkan dari baris yang SUDAH dimuat — tak ada query
  // kedua, jadi mustahil beda dari tab sebelah.
  const matrix: MatrixRow[] = (() => {
    if (!skpdLoaded) return []
    const mtx: Record<number, MatrixRow> = {}
    for (const r of rows) {
      // Cabang `asal` diatribusikan ke SKPD PELEPAS (yang menghapus dari
      // daftarnya); cabang lain ke pemilik barangnya.
      const sid = f.scope === 'asal' ? r.skpd_asal : r.aset?.skpd_id
      if (!sid) continue
      const root = rootOf(sid)
      const rid = root?.id ?? sid
      mtx[rid] ??= { skpdId: rid, skpdNama: root?.nama ?? `SKPD #${sid}`, cells: {} }
      const c = (mtx[rid].cells[kodeLevel3(r.aset!.kode)] ??= { perolehan: 0, akumulasi: 0, beban: 0, nilaiBuku: 0 })
      c.perolehan += r.nilai || 0
      c.akumulasi += r.akumulasi || 0
      c.nilaiBuku += r.nilaiBuku || 0
    }
    return Object.values(mtx).sort((a, b) => a.skpdNama.localeCompare(b.skpdNama))
  })()

  const namaBerkas = (akhiran?: string[]) => namaBerkasLaporan({
    laporan: `Laporan Penghapusan ${f.label}`, periode, skpd: namaSkpd.nama, akhiran,
  })

  function handleExport() {
    // Tak ada paginasi & tak ada `await`: barisnya sudah lengkap di memori
    // (pemuatnya menyapu penuh dgn keyset), jadi export tak bisa berbeda dari
    // yang di layar.
    exportToExcel(rows.map(r => ({
      'SKPD': r.skpdNama || '',
      'NIBAR': r.aset?.nibar || '',
      'Kode Barang': r.aset?.kode || '',
      'Nama Barang': r.aset?.uraian_barang || '',
      'Spesifikasi Nama Barang': r.aset?.nama_barang || '',
      'Jumlah': r.aset?.jumlah ?? 1,
      'Satuan': r.aset?.satuan || '',
      'Komptabel': (r.aset?.intra_ekstra || '').toUpperCase(),
      'Jumlah Total (Rp)': r.nilai,
      'Akumulasi (Rp)': r.akumulasi ?? 0,
      'Nilai Buku (Rp)': r.nilaiBuku ?? 0,
      'Cara Pemindahtanganan': r.caraPemindahtanganan,
      'Penerima Penyerahan': r.penerima || '',
      'No. SK Penghapusan': r.header?.no_sk || '',
      'Tgl SK Penghapusan': r.header?.tanggal || r.tanggal,
      'Periode': r.periode,
      'Keterangan': r.keterangan || r.aset?.keterangan || '',
    })), namaBerkas(), 'Laporan')
  }

  function handleExportMatrix() {
    exportToExcel(matrix.map(r => {
      const row: Record<string, unknown> = { SKPD: r.skpdNama }
      let total = 0
      for (const g of GOLONGAN_REKAP) { const v = r.cells[g.kode]?.perolehan || 0; row[g.uraian] = v; total += v }
      row['Total'] = total
      return row
    }), namaBerkas(['per SKPD']), 'Rekap per SKPD')
  }

  const totalNilai = rows.reduce((s, r) => s + (r.nilai || 0), 0)

  return (
    <div className="p-6">
      {err && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 mb-4">{err}</div>
      )}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Laporan Penghapusan</h1>
          <p className="text-gray-500 text-sm mt-1">
            Barang yang keluar dari daftar SKPD — Format Permendagri{' '}
            <b>IV.K.1</b> (pemindahtanganan), <b>IV.K.2</b> (pengalihan status), &amp;{' '}
            <b>IV.K.6</b> (sebab lain). Yang sudah dibatalkan tidak ditampilkan.
          </p>
        </div>
        {view !== 'permendagri' && (
          <button onClick={view === 'list' ? handleExport : handleExportMatrix}
            disabled={view === 'list' ? rows.length === 0 : matrix.length === 0}
            className="btn-primary">Export Excel</button>
        )}
      </div>

      {/* ── Penyaring ALASAN — pertanyaan PERTAMA, di atas tab ──────────────
          Permintaan user 2026-09-07. Sengaja bukan dropdown kecil di baris
          filter: ia yang menentukan jenis ledger yang dibaca DAN lembar
          Permendagri mana yang terbit. */}
      <div className="card p-4 mb-4">
        <p className="text-xs text-gray-500 mb-2">Alasan penghapusan</p>
        <div className="flex flex-wrap gap-2">
          {URUT_PENGHAPUSAN.map(x => (
            <button key={x} onClick={() => setId(x)}
              className={`px-4 py-2 rounded-lg border text-sm transition-colors ${
                id === x ? 'bg-teal text-white border-teal font-medium'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'}`}>
              {FORMAT_PENGHAPUSAN[x].label}
              <span className={`ml-2 text-[11px] ${id === x ? 'text-white/70' : 'text-gray-400'}`}>
                {FORMAT_PENGHAPUSAN[x].kode.replace(/\.2$/, '')}
              </span>
            </button>
          ))}
        </div>
        {id === 'pemindahtanganan' && (
          <p className="text-xs text-gray-500 mt-3 border-l-2 border-teal pl-2">
            Hibah, penjualan, tukar-menukar, &amp; penyertaan modal semuanya masuk lembar{' '}
            <b>{f.kode}</b> yang sama — yang membedakan kolom <b>Cara Pemindahtanganan</b>.
          </p>
        )}
        {id === 'pengalihan' && (
          <p className="text-xs text-gray-500 mt-3 border-l-2 border-teal pl-2">
            Dilihat dari sisi SKPD yang <b>MELEPAS</b>. Baris ledgernya sama dengan yang
            dilaporkan <i>Laporan Penggunaan</i> (IV.B.1.2) dari sisi penerima, jadi angkanya
            memang berbeda dari menu itu.
          </p>
        )}
      </div>

      <div className="mb-4 inline-flex rounded-lg border border-gray-200 bg-gray-50 p-1 text-sm">
        {([['list', 'Daftar Transaksi'], ['matrix', 'Rekap per SKPD'],
          ...(adaLembar ? [['permendagri', 'Format Permendagri'] as const] : [])] as const).map(([v, label]) => (
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
            onChangeSelection={sel => { setSkpdId(sel.skpdId); void namaSkpd.pilih(sel.skpdId) }} />
        </div>
      </div>

      {view === 'permendagri' ? (
        <PenghapusanFormatPermendagri id={id} skpdId={skpdId} periode={periode} />
      ) : view === 'matrix' ? (
        <>
          <p className="text-xs text-gray-500 mb-2">
            Diatribusikan ke <b>{f.scope === 'asal' ? 'SKPD pelepas' : 'SKPD pemilik barang'}</b>,
            per jenis aset — sejalan dgn lembar {f.kode}.
          </p>
          <RekapMatrixTable rows={matrix} golongan={GOLONGAN_REKAP} metric="perolehan" loading={loading} />
        </>
      ) : (
        <>
          <div className="card p-4 mb-4 max-w-xs">
            <p className="text-xs text-gray-500">Penghapusan — {f.label}</p>
            <p className="text-lg font-bold text-gray-900 mt-1">
              {rows.length.toLocaleString('id-ID')}{' '}
              <span className="text-xs font-normal text-gray-400">barang</span>
            </p>
            <p className="text-xs text-teal font-medium">{formatRupiah(totalNilai)}</p>
          </div>

          <div className="card overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100">
              <span className="text-sm text-gray-500">{rows.length} barang</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="table-th">SKPD</th>
                    <th className="table-th">Barang</th>
                    <th className="table-th">Kode Barang</th>
                    <th className="table-th">Komptabel</th>
                    <th className="table-th">
                      {f.scope === 'asal' ? 'Penerima Penyerahan' : 'Cara Pemindahtanganan'}
                    </th>
                    <th className="table-th">SK Penghapusan</th>
                    <th className="table-th text-right">Nilai</th>
                    <th className="table-th text-right">Nilai Buku</th>
                    <th className="table-th">Keterangan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {loading ? (
                    <tr><td colSpan={9} className="table-td text-center py-12 text-gray-400">Memuat data...</td></tr>
                  ) : rows.length === 0 ? (
                    <tr><td colSpan={9} className="table-td text-center py-12 text-gray-400">Tidak ada transaksi</td></tr>
                  ) : rows.slice(0, 500).map(r => (
                    <tr key={r.id}>
                      <td className="table-td text-xs">{r.skpdNama || '-'}</td>
                      <td className="table-td text-xs">
                        <p className="font-medium">{r.aset?.nama_barang || '-'}</p>
                        <p className="text-gray-400">{r.aset?.nibar || '-'}</p>
                      </td>
                      <td className="table-td text-xs">{r.aset?.kode || '-'}</td>
                      <td className="table-td text-xs">{(r.aset?.intra_ekstra || '-').toUpperCase()}</td>
                      <td className="table-td text-xs">
                        {(f.scope === 'asal' ? r.penerima : r.caraPemindahtanganan) || '-'}
                      </td>
                      <td className="table-td text-xs">
                        {r.header?.no_sk || '-'}
                        <br /><span className="text-gray-400">{r.header?.tanggal || r.tanggal}</span>
                      </td>
                      <td className="table-td text-xs text-right">{formatRupiah(r.nilai)}</td>
                      <td className="table-td text-xs text-right">
                        {r.tanpaPenyusutan ? <span className="text-gray-400">…</span> : formatRupiah(r.nilaiBuku ?? 0)}
                      </td>
                      <td className="table-td text-xs text-gray-500 max-w-[200px] truncate">
                        {r.keterangan || r.aset?.keterangan || '-'}
                      </td>
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
