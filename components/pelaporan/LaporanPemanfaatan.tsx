'use client'
// Laporan Pemanfaatan BMD — rekap per barang yang sedang/pernah dimanfaatkan,
// difilter jenis pemanfaatan (Sewa/Pinjam Pakai/KSP/BGS-BSG/KSPI) & SKPD
// (kosong = se-kabupaten; pilih = per-SKPD/turunannya). Sumber = jurnal_header
// kategori 'pemanfaatan' + ledger (keanggotaan per header+aset, baris terakhir
// menentukan; batal_pemanfaatan dibuang). Export Excel.
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { exportToExcel, formatRupiah2 } from '@/lib/export'
import { namaBerkasLaporan } from '@/lib/namaBerkas'
import SkpdCombobox from '@/components/SkpdCombobox'
import { GayaCetakLaporan, KopCetak, TombolCetak, useKonfirmasiCetak } from '@/components/pelaporan/CetakLaporan'
import {
  JENIS_PEMANFAATAN, JENIS_PEMANFAATAN_LABEL, perluPeringatanPenarikan, WARNA_BAND_PEMANFAATAN,
  type BandPemanfaatan,
} from '@/lib/pemanfaatan'
import { muatPemanfaatan, type BarisPemanfaatan } from '@/lib/laporanPemanfaatan'

type Row = BarisPemanfaatan

const todayISO = () => new Date().toISOString().slice(0, 10)

// Visualisasi masa berlangsung pemanfaatan (permintaan user 2026-09-23) —
// warna & ambangnya SATU sumber (lib/pemanfaatan.ts `bandPemanfaatan`), jangan
// dihitung ulang di sini supaya bar & kolom Persentase tak pernah menyimpang.
function BarMasaPemanfaatan({ persen, band }: { persen: number | null; band: BandPemanfaatan | null }) {
  if (persen == null || band == null) return <span className="text-gray-300 text-xs">—</span>
  const warna = WARNA_BAND_PEMANFAATAN[band]
  const lebar = Math.min(100, Math.max(0, persen))
  return (
    <div className="w-36">
      <div className="h-2 w-full rounded-full bg-gray-100 overflow-hidden">
        <div className={`h-full ${warna.bar}`} style={{ width: `${lebar}%` }} />
      </div>
      {perluPeringatanPenarikan(band) && (
        <p className="text-[10px] text-red-600 mt-1 leading-tight">⚠ Siapkan penarikan barang / perpanjangan perjanjian</p>
      )}
    </div>
  )
}

export default function LaporanPemanfaatan() {
  const supabase = createClient()
  const konfirmasiCetak = useKonfirmasiCetak()
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [jenis, setJenis] = useState('')
  const [descIds, setDescIds] = useState<number[] | null>(null)
  const [skpdNama, setSkpdNama] = useState('')
  const [err, setErr] = useState('')

  // Pemuatnya di lib/laporanPemanfaatan.ts (dipakai bersama alat baca Asisten AI).
  const build = useCallback(
    (): Promise<Row[]> => muatPemanfaatan(supabase, { descIds, jenis, hariIni: todayISO() }),
    [descIds, jenis], // eslint-disable-line react-hooks/exhaustive-deps
  )

  // try/catch/finally WAJIB: pemuatnya kini melempar saat query gagal, dan tanpa
  // penangkap halaman ini akan membeku di "Memuat..." selamanya.
  useEffect(() => {
    let batal = false
    void (async () => {
      setLoading(true); setErr('')
      try {
        const hasil = await build()
        if (!batal) setRows(hasil)
      } catch (e) {
        if (!batal) { setErr(`Gagal memuat laporan: ${(e as Error).message}`); setRows([]) }
      } finally {
        if (!batal) setLoading(false)
      }
    })()
    return () => { batal = true }
  }, [build])

  const rekap = new Map<string, number>()
  for (const r of rows) rekap.set(r.jenis, (rekap.get(r.jenis) || 0) + 1)

  async function handleExport() {
    setExporting(true)
    // Susunan kolom disamakan dgn layar (2026-09-27, standarisasi Daftar
    // Transaksi lintas menu Pelaporan) — sel tumpuk di layar jadi kolom
    // TERPISAH di sini.
    exportToExcel(rows.map(r => ({
      'SKPD': r.skpd, 'Jenis Pemanfaatan': r.jenis, 'Mitra': r.mitra,
      'Kode Barang': r.kode, 'Uraian Barang': r.uraianBarang,
      'Spesifikasi Nama Barang': r.nama, 'NIBAR': r.nibar,
      'Merk/Tipe': r.merekTipe, 'Spesifikasi Lainnya': r.spesifikasiLainnya,
      'No. Polisi': r.noPolisi, 'No. Rangka': r.noRangka, 'No. Mesin': r.noMesin,
      'Luas': r.luas ?? '',
      'No. Dokumen Pemanfaatan': r.noDok, 'Tanggal Dokumen': r.tglDok,
      'Lingkup': r.lingkup, 'Mulai': r.mulai, 'Berakhir': r.berakhir,
      'Persentase Masa Berlangsung': r.persen == null ? '-' : `${Math.round(r.persen)}%`,
      'Status': r.status,
      'Nilai Pemanfaatan (Rp)': r.nilai == null ? '-' : r.nilai,
    })), namaBerkasLaporan({
      laporan: 'Laporan Pemanfaatan', skpd: skpdNama, akhiran: [jenis],
    }), 'Pemanfaatan')
    setExporting(false)
  }

  // Tabel di sini sudah memuat SELURUH baris (bukan dibatasi seperti
  // LaporanTransaksi), jadi cetak = langsung print, tanpa tarikan ulang.
  async function handleCetak() {
    if (rows.length === 0) return
    if (!(await konfirmasiCetak(rows.length))) return
    window.print()
  }

  return (
    <div className="p-6" id="cetak-laporan">
      <GayaCetakLaporan />
      <KopCetak judul="Laporan Pemanfaatan BMD" baris={[
        `SKPD: ${skpdNama || 'Seluruh SKPD'}`,
        `Jenis Pemanfaatan: ${jenis ? (JENIS_PEMANFAATAN_LABEL[jenis] || jenis) : 'Semua Jenis'}`,
        `${rows.length.toLocaleString('id-ID')} barang`,
      ]} />

      <div className="flex items-center justify-between mb-6 no-print">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Laporan Pemanfaatan</h1>
          <p className="text-gray-500 text-sm mt-1">Rekap barang yang dimanfaatkan (sewa/pinjam pakai/KSP/BGS-BSG/KSPI). Kosongkan SKPD untuk se-kabupaten.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleExport} disabled={exporting || rows.length === 0} className="btn-primary">{exporting ? 'Mengekspor...' : 'Export Excel'}</button>
          <TombolCetak onClick={handleCetak} disabled={loading || rows.length === 0} />
        </div>
      </div>

      <div className="card p-4 mb-4 flex flex-wrap gap-3 items-end no-print">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Jenis Pemanfaatan</label>
          <select className="select-filter" value={jenis} onChange={e => setJenis(e.target.value)}>
            <option value="">Semua Jenis</option>
            {JENIS_PEMANFAATAN.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div className="min-w-[280px]">
          <label className="block text-xs text-gray-500 mb-1">SKPD / Lokasi</label>
          <SkpdCombobox lockToOperator allowClear
            placeholder="Semua SKPD — atau ketik SKPD / Sub OPD / Lokasi..."
            onChangeSelection={async sel => {
              setDescIds(sel.descendantIds)
              if (sel.skpdId == null) { setSkpdNama(''); return }
              const { data } = await supabase.from('admin_skpd').select('nama').eq('id', sel.skpdId).maybeSingle()
              setSkpdNama((data as { nama: string } | null)?.nama || '')
            }} />
        </div>
      </div>

      {err && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 no-print" role="alert">{err}</div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4 no-print">
        <div className="card p-4">
          <p className="text-xs text-gray-500">Total Barang</p>
          <p className="text-lg font-bold text-gray-900 mt-1">{rows.length.toLocaleString('id-ID')}</p>
        </div>
        {[...rekap.entries()].map(([j, n]) => (
          <div key={j} className="card p-4">
            <p className="text-xs text-gray-500 truncate" title={j}>{j}</p>
            <p className="text-lg font-bold text-gray-900 mt-1">{n.toLocaleString('id-ID')}</p>
          </div>
        ))}
      </div>

      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 no-print"><span className="text-sm text-gray-500">{rows.length} barang</span></div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="table-th">SKPD</th><th className="table-th">Jenis</th><th className="table-th">Mitra</th>
                <th className="table-th">Kode Barang / Uraian Barang</th>
                <th className="table-th">Nama Barang / NIBAR</th>
                <th className="table-th">Merk/Tipe</th>
                <th className="table-th">Spesifikasi Lainnya</th>
                <th className="table-th">No. Polisi</th>
                <th className="table-th">No. Rangka</th>
                <th className="table-th">No. Mesin</th>
                <th className="table-th text-right">Luas</th>
                <th className="table-th">No. Dokumen / Tanggal</th>
                <th className="table-th">Lingkup</th>
                {/* ⚠️ JAGA — permintaan user 2026-09-27: visualisasi bar ini
                    sudah bagus, jangan diubah, cuma kolom sekitarnya yang
                    disesuaikan. */}
                <th className="table-th">Mulai s.d. Berakhir</th>
                <th className="table-th text-center">Persentase</th>
                <th className="table-th text-center">Status</th><th className="table-th text-right">Nilai</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr><td colSpan={16} className="table-td text-center py-12 text-gray-400">Memuat data...</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={16} className="table-td text-center py-12 text-gray-400">Tidak ada data pemanfaatan</td></tr>
              ) : rows.map(r => (
                <tr key={r.key}>
                  <td className="table-td text-xs align-top">{r.skpd}</td>
                  <td className="table-td text-xs align-top">{r.jenis}</td>
                  <td className="table-td text-xs align-top">{r.mitra}</td>
                  <td className="table-td text-xs align-top">
                    <p className="font-medium">{r.kode}</p>
                    <p className="text-gray-400 mt-0.5">{r.uraianBarang}</p>
                  </td>
                  <td className="table-td text-xs align-top"><p className="font-medium">{r.nama}</p><p className="text-gray-400">{r.nibar}</p></td>
                  <td className="table-td text-xs align-top">{r.merekTipe}</td>
                  <td className="table-td text-xs align-top">{r.spesifikasiLainnya}</td>
                  <td className="table-td text-xs align-top whitespace-nowrap">{r.noPolisi}</td>
                  <td className="table-td text-xs align-top whitespace-nowrap">{r.noRangka}</td>
                  <td className="table-td text-xs align-top whitespace-nowrap">{r.noMesin}</td>
                  <td className="table-td text-xs text-right align-top">{r.luas ?? '-'}</td>
                  <td className="table-td text-xs align-top">
                    <p className="font-medium">{r.noDok}</p>
                    <p className="text-gray-400">{r.tglDok || '-'}</p>
                  </td>
                  <td className="table-td text-xs align-top">{r.lingkup}</td>
                  <td className="table-td text-xs align-top">
                    <p>{r.mulai || '-'} s.d. {r.berakhir || '-'}</p>
                    <div className="mt-1"><BarMasaPemanfaatan persen={r.persen} band={r.band} /></div>
                  </td>
                  <td className="table-td text-center text-xs align-top">{r.persen == null ? '-' : `${Math.round(r.persen)}%`}</td>
                  <td className="table-td text-center text-xs align-top">{r.status}</td>
                  <td className="table-td text-right text-xs align-top">{r.nilai == null ? '-' : formatRupiah2(r.nilai)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
