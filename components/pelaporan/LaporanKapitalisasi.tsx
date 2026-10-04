'use client'
// Laporan Kapitalisasi — format sendiri (permintaan user 2026-09-05), tidak
// ada acuan Permendagri 47 untuk ini.
//
// LATAR: sebelum ini menu dilayani `LaporanTransaksi` (generik) yang
// memanggil `fetchBatalTargets(['batal_kapitalisasi'])` TANPA scope aset_id —
// sapuan seluruh `transaksi_bmd`. `idx_trx_kapitalisasi_id` (migrasi
// 20260826_01) cuma memuat `'kapitalisasi'`, bukan `'batal_kapitalisasi'`,
// jadi query itu timeout & promise-nya REJECT tanpa `.catch()` di pemanggil →
// `loading` tak pernah `false` → halaman macet SELAMANYA di "Memuat data..."
// tanpa satu pun pesan. Diperbaiki migrasi 20260905_02 (indexnya diperluas)
// + komponen ini SATU query untuk kedua jenis, difilter di JS (lihat bawah).
//
// KENAPA KOMPONEN SENDIRI, BUKAN pakai LaporanTransaksi lagi: seluruh data
// yang diminta (induk, anak-anak yang diserap, beban/akumulasi/nilai buku
// SEBELUM & SESUDAH) sudah ada di `payload.snapshot`/`payload.anak` baris
// `kapitalisasi` itu sendiri (diisi Kapitalisasi.tsx) — tabel transaksi datar
// generik tak bisa menampilkannya tanpa mengarang kolom per-jenis lagi.
import { useEffect, useState, useCallback } from 'react'
import { urutLaporan } from '@/lib/urutSkpd'
import { createClient } from '@/lib/supabase/client'
import { exportToExcel, formatRupiah2 } from '@/lib/export'
import { namaBerkasLaporan } from '@/lib/namaBerkas'
import { muatKapitalisasi, bangunBaris, bangunRekap, type RowKap } from '@/lib/laporanKapitalisasi'
import SkpdCombobox from '@/components/SkpdCombobox'
import { GayaCetakLaporan, KopCetak, TombolCetak, useKonfirmasiCetak } from '@/components/pelaporan/CetakLaporan'

export default function LaporanKapitalisasi() {
  const supabase = createClient()
  const konfirmasiCetak = useKonfirmasiCetak()
  const [periodeList, setPeriodeList] = useState<string[]>([])
  const [periode, setPeriode] = useState('')
  const [descIds, setDescIds] = useState<number[] | null>(null)
  const [skpdNama, setSkpdNama] = useState('')
  const [valid, setValid] = useState<RowKap[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [exporting, setExporting] = useState(false)
  const [mencetak, setMencetak] = useState(false)

  useEffect(() => {
    supabase.from('transaksi_bmd').select('periode').eq('jenis', 'kapitalisasi')
      .order('id', { ascending: false }).limit(1000)
      .then(({ data }) => setPeriodeList([...new Set((data || []).map(r => r.periode))].sort().reverse()))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Pemuatnya di lib/laporanKapitalisasi.ts (dipakai bersama alat baca Asisten
  // AI) — termasuk saringan kapitalisasi yang sudah dibatalkan.
  const muat = useCallback(async () => {
    setLoading(true); setErr('')
    try {
      setValid(await muatKapitalisasi(supabase, { periode, descIds }))
    } catch (e) {
      setErr(`Gagal memuat data kapitalisasi: ${(e as Error).message}`)
      setValid([])
    } finally {
      setLoading(false)
    }
  }, [periode, descIds]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { void muat() }, [muat])

  // Terbaru di atas menurut tanggal dokumen (sama dgn menu entry, keputusan user
  // 2026-10-04); barang anak satu dokumen tetap berkelompok krn diurut per DOKUMEN.
  const baris = bangunBaris(urutLaporan(valid, {
    terfilter: !!(descIds && descIds.length > 0), tgl: r => r.tanggal, seri: r => r.id,
  }))
  const rekap = bangunRekap(valid)
  const totalRehab = rekap.reduce((s, r) => s + r.rehab, 0)
  const totalAnak = rekap.reduce((s, r) => s + r.anak, 0)

  function namaFileDasar() {
    return namaBerkasLaporan({ laporan: 'Laporan Kapitalisasi', periode, skpd: skpdNama })
  }

  function handleExport() {
    setExporting(true)
    exportToExcel(baris.map(b => ({
      'Tanggal': b.tanggal, 'Periode': b.periode, 'No. Dokumen': b.noDok, 'SKPD': b.skpdNama,
      'NIBAR Induk': b.indukNibar, 'Nama Barang Induk': b.indukNama, 'Kode Induk': b.indukKode,
      'NIBAR Anak (Diserap)': b.anakNibar, 'Nama Barang Anak (Diserap)': b.anakNama,
      'Nilai Anak Diserap (Rp)': b.anakNilai, 'Akumulasi Anak Diserap (Rp)': b.anakAkum,
      'Nilai Perolehan Awal (Rp)': b.npAwal, 'Beban/Smt Awal (Rp)': b.bebanAwal,
      'Akumulasi Awal (Rp)': b.akumAwal, 'Nilai Buku Awal (Rp)': b.nbAwal,
      'Nilai Perolehan Akhir (Rp)': b.npAkhir, 'Beban/Smt Akhir (Rp)': b.bebanAkhir,
      'Akumulasi Akhir (Rp)': b.akumAkhir, 'Nilai Buku Akhir (Rp)': b.nbAkhir,
    })), namaFileDasar(), 'Kapitalisasi')
    setExporting(false)
  }

  async function handleCetak() {
    if (!(await konfirmasiCetak(baris.length))) return
    setMencetak(true)
    setTimeout(() => { window.print(); setMencetak(false) }, 100)
  }

  return (
    <div className="p-6" id="cetak-laporan">
      <GayaCetakLaporan />
      <KopCetak judul="Laporan Kapitalisasi" baris={[
        `Periode: ${periode || 'Semua Periode'}`,
        `SKPD: ${skpdNama || 'Seluruh SKPD'}`,
        `${rekap.length.toLocaleString('id-ID')} SKPD · ${valid.length.toLocaleString('id-ID')} dokumen kapitalisasi · ${totalAnak.toLocaleString('id-ID')} barang diserap`,
      ]} />

      <div className="flex items-center justify-between mb-6 no-print">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Laporan Kapitalisasi</h1>
          <p className="text-gray-500 text-sm mt-1">
            SKPD mana yang ada kapitalisasi, barang induk & anak yang diserap, serta beban/akumulasi/nilai buku
            sebelum dan sesudah. Yang sudah dibatalkan tidak ditampilkan.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleExport} disabled={exporting || loading} className="btn-primary">
            {exporting ? 'Mengekspor...' : 'Export Excel'}
          </button>
          <TombolCetak onClick={handleCetak} disabled={mencetak || loading} label={mencetak ? 'Menyiapkan...' : 'Export PDF'} />
        </div>
      </div>

      <div className="card p-4 mb-4 flex flex-wrap gap-3 items-end no-print">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Periode</label>
          <select className="select-filter" value={periode} onChange={e => setPeriode(e.target.value)}>
            <option value="">Semua Periode</option>
            {periodeList.map(p => <option key={p} value={p}>{p}</option>)}
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

      {err && <div role="alert" className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm no-print">{err}</div>}

      {/* Rekap per SKPD — menjawab "SKPD mana aja yang ada kapitalisasi". */}
      <div className="card overflow-hidden mb-4">
        <div className="px-4 py-3 border-b border-gray-100">
          <span className="text-sm font-medium text-gray-700">Rekap per SKPD</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="table-th">SKPD</th>
                <th className="table-th text-right">Dokumen Kapitalisasi</th>
                <th className="table-th text-right">Barang Anak Diserap</th>
                <th className="table-th text-right">Total Rehab (Rp)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr><td colSpan={4} className="table-td text-center py-8 text-gray-400">Memuat data...</td></tr>
              ) : rekap.length === 0 ? (
                <tr><td colSpan={4} className="table-td text-center py-8 text-gray-400">Tidak ada kapitalisasi untuk filter ini.</td></tr>
              ) : (
                <>
                  {rekap.map(r => (
                    <tr key={r.skpd}>
                      <td className="table-td text-xs font-medium">{r.skpd}</td>
                      <td className="table-td text-xs text-right">{r.dokumen}</td>
                      <td className="table-td text-xs text-right">{r.anak}</td>
                      <td className="table-td text-xs text-right">{formatRupiah2(r.rehab)}</td>
                    </tr>
                  ))}
                  <tr className="bg-gray-50 font-semibold">
                    <td className="table-td text-xs">JUMLAH ({rekap.length} SKPD)</td>
                    <td className="table-td text-xs text-right">{valid.length}</td>
                    <td className="table-td text-xs text-right">{totalAnak}</td>
                    <td className="table-td text-xs text-right">{formatRupiah2(totalRehab)}</td>
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Rincian — satu baris per barang anak yang diserap. */}
      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 no-print">
          <span className="text-sm text-gray-500">{baris.length} baris (1 baris = 1 barang anak yang diserap)</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="table-th" rowSpan={2}>Tanggal</th>
                <th className="table-th" rowSpan={2}>No. Dokumen</th>
                <th className="table-th" rowSpan={2}>SKPD</th>
                <th className="table-th" rowSpan={2}>Barang Induk (Dikapitalisasi)</th>
                <th className="table-th" rowSpan={2}>Barang Anak (Diserap)</th>
                <th className="table-th text-right" colSpan={4}>Kondisi Sebelum Kapitalisasi</th>
                <th className="table-th text-right" colSpan={4}>Kondisi Sesudah Kapitalisasi</th>
              </tr>
              <tr>
                <th className="table-th text-right">Nilai Perolehan</th>
                <th className="table-th text-right">Beban/Smt</th>
                <th className="table-th text-right">Akumulasi</th>
                <th className="table-th text-right">Nilai Buku</th>
                <th className="table-th text-right">Nilai Perolehan</th>
                <th className="table-th text-right">Beban/Smt</th>
                <th className="table-th text-right">Akumulasi</th>
                <th className="table-th text-right">Nilai Buku</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr><td colSpan={13} className="table-td text-center py-12 text-gray-400">Memuat data...</td></tr>
              ) : baris.length === 0 ? (
                <tr><td colSpan={13} className="table-td text-center py-12 text-gray-400">Tidak ada kapitalisasi untuk filter ini.</td></tr>
              ) : baris.map((b, i) => (
                <tr key={i}>
                  <td className="table-td text-xs">{b.tanggal}<br /><span className="text-gray-400">{b.periode}</span></td>
                  <td className="table-td text-xs">{b.noDok}</td>
                  <td className="table-td text-xs">{b.skpdNama}</td>
                  <td className="table-td text-xs">
                    <p className="font-medium">{b.indukNama}</p>
                    <p className="text-gray-400">{b.indukNibar} · {b.indukKode}</p>
                  </td>
                  <td className="table-td text-xs">
                    <p className="font-medium">{b.anakNama}</p>
                    <p className="text-gray-400">{b.anakNibar}</p>
                    {b.anakNilai > 0 && <p className="text-gray-400">Nilai {formatRupiah2(b.anakNilai)} · Akum {formatRupiah2(b.anakAkum)}</p>}
                  </td>
                  <td className="table-td text-xs text-right">{formatRupiah2(b.npAwal)}</td>
                  <td className="table-td text-xs text-right">{formatRupiah2(b.bebanAwal)}</td>
                  <td className="table-td text-xs text-right">{formatRupiah2(b.akumAwal)}</td>
                  <td className="table-td text-xs text-right">{formatRupiah2(b.nbAwal)}</td>
                  <td className="table-td text-xs text-right font-medium">{formatRupiah2(b.npAkhir)}</td>
                  <td className="table-td text-xs text-right font-medium">{formatRupiah2(b.bebanAkhir)}</td>
                  <td className="table-td text-xs text-right font-medium">{formatRupiah2(b.akumAkhir)}</td>
                  <td className="table-td text-xs text-right font-medium">{formatRupiah2(b.nbAkhir)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
