'use client'
// Laporan KIR — daftar ruangan beserta isinya, difilter SKPD (kosong =
// se-kabupaten; pilih = per-SKPD/turunannya). Sumber = kir_ruangan +
// kir_ruangan_aset (NON-LEDGER, lihat migrasi 20260727_02). Bisa cetak KIR per
// ruangan (Format III.K.2) atau export Excel seluruh baris.
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { exportToExcel, formatRupiah2 } from '@/lib/export'
import { namaBerkasLaporan } from '@/lib/namaBerkas'
import { useNamaSkpd } from '@/components/useNamaSkpd'
import SkpdCombobox from '@/components/SkpdCombobox'
import { tahunPerolehan } from '@/lib/kir'
import { muatKartuKir, type KartuKir } from '@/lib/kirData'

type Kartu = KartuKir

export default function LaporanKir() {
  const supabase = createClient()
  const [kartu, setKartu] = useState<Kartu[]>([])
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const namaSkpd = useNamaSkpd()
  const [descIds, setDescIds] = useState<number[] | null>(null)
  const [cari, setCari] = useState('')
  const [err, setErr] = useState('')
  const [buka, setBuka] = useState<Set<string>>(new Set())

  // Pemuatnya di lib/kirData.ts (dipakai bersama alat baca Asisten AI).
  const build = useCallback(
    (): Promise<Kartu[]> => muatKartuKir(supabase, descIds),
    [descIds], // eslint-disable-line react-hooks/exhaustive-deps
  )

  // try/catch/finally WAJIB: pemuatnya melempar saat query gagal, dan tanpa
  // penangkap halaman ini membeku di "Memuat..." selamanya.
  useEffect(() => {
    let batal = false
    void (async () => {
      setLoading(true); setErr('')
      try {
        const hasil = await build()
        if (!batal) setKartu(hasil)
      } catch (e) {
        if (!batal) { setErr(`Gagal memuat laporan: ${(e as Error).message}`); setKartu([]) }
      } finally {
        if (!batal) setLoading(false)
      }
    })()
    return () => { batal = true }
  }, [build])

  const q = cari.trim().toLowerCase()
  const shown = q
    ? kartu.filter(r =>
        r.nama.toLowerCase().includes(q) ||
        r.skpdNama.toLowerCase().includes(q) ||
        (r.pj_nama || '').toLowerCase().includes(q))
    : kartu
  const totalBarang = shown.reduce((n, r) => n + r.isi.length, 0)
  const totalNilai = shown.reduce((n, r) => n + r.isi.reduce((m, b) => m + b.nilai_perolehan, 0), 0)

  function toggle(id: string) {
    setBuka(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next })
  }

  async function handleExport() {
    setExporting(true)
    const baris = shown.flatMap(r => r.isi.map(b => ({
      'SKPD': r.skpdNama, 'Nama Ruangan': r.nama, 'Kode Ruangan': r.kode_ruangan || '-',
      'Penanggung Jawab': r.pj_nama || '-', 'NIP Penanggung Jawab': r.pj_nip || '-',
      'NIBAR': b.nibar || '-', 'Kode Barang': b.kode, 'Nama Barang': b.uraian_barang || '-',
      'Spesifikasi Nama Barang': b.nama_barang || '-', 'Merek/Tipe': b.merek_tipe || '-',
      'Tahun Perolehan': tahunPerolehan(b.tgl_perolehan), 'Jumlah': b.jumlah, 'Satuan': b.satuan || '-',
      'Nilai Perolehan (Rp)': b.nilai_perolehan, 'Keterangan': b.keterangan || '',
    })))
    exportToExcel(baris, namaBerkasLaporan({ laporan: 'Laporan KIR', skpd: namaSkpd.nama }), 'KIR')
    setExporting(false)
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">KIR — Kartu Inventaris Ruangan</h1>
          <p className="text-gray-500 text-sm mt-1">Daftar ruangan beserta barang di dalamnya. Kosongkan SKPD untuk se-kabupaten.</p>
        </div>
        <button onClick={handleExport} disabled={exporting || totalBarang === 0} className="btn-primary">
          {exporting ? 'Mengekspor...' : 'Export Excel'}
        </button>
      </div>

      <div className="card p-4 mb-4 flex flex-wrap gap-3 items-end">
        <div className="min-w-[280px]">
          <label className="block text-xs text-gray-500 mb-1">SKPD / Lokasi</label>
          <SkpdCombobox lockToOperator allowClear
            onChangeSelection={sel => { setDescIds(sel.descendantIds); namaSkpd.pilih(sel.skpdId) }}
            placeholder="Semua SKPD — atau ketik SKPD / Sub OPD / Lokasi..." />
        </div>
        <div className="flex-1 min-w-[200px]">
          <label className="block text-xs text-gray-500 mb-1">Cari ruangan / penanggung jawab</label>
          <input className="select-filter w-full" value={cari} onChange={e => setCari(e.target.value)}
            placeholder="mis. Ruang Multimedia..." />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="card p-4"><p className="text-xs text-gray-500">Ruangan</p><p className="text-lg font-bold text-gray-900 mt-1">{shown.length.toLocaleString('id-ID')}</p></div>
        <div className="card p-4"><p className="text-xs text-gray-500">Barang Tercatat</p><p className="text-lg font-bold text-gray-900 mt-1">{totalBarang.toLocaleString('id-ID')}</p></div>
        <div className="card p-4"><p className="text-xs text-gray-500">Nilai Perolehan</p><p className="text-lg font-bold text-gray-900 mt-1">{formatRupiah2(totalNilai)}</p></div>
      </div>

      {err && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">{err}</div>
      )}

      {loading ? (
        <div className="card p-12 text-center text-gray-400 text-sm">Memuat data...</div>
      ) : shown.length === 0 ? (
        <div className="card p-12 text-center text-gray-400 text-sm">Belum ada ruangan tercatat.</div>
      ) : (
        <div className="space-y-3">
          {shown.map(r => {
            const terbuka = buka.has(r.id)
            return (
              <div key={r.id} className="card overflow-hidden">
                <div className="px-5 py-3 flex items-center justify-between gap-4 bg-gray-50/60 border-b border-gray-100">
                  <button onClick={() => toggle(r.id)} className="flex-1 text-left">
                    <p className="text-sm font-semibold text-gray-800">
                      <span className="inline-block w-4 text-gray-400">{terbuka ? '▾' : '▸'}</span>
                      {r.nama}
                      {r.kode_ruangan && <span className="ml-2 text-xs font-normal text-gray-500">({r.kode_ruangan})</span>}
                    </p>
                    <p className="text-xs text-gray-500 ml-4">
                      {r.skpdNama} · {r.isi.length} barang · PJ: {r.pj_nama || '—'}{r.pj_nip ? ` (NIP ${r.pj_nip})` : ''}
                    </p>
                  </button>
                  <Link href={`/cetak/kir?ruangan=${r.id}`} target="_blank" className="btn-secondary text-xs flex-shrink-0">🖨 Cetak KIR</Link>
                </div>

                {terbuka && (
                  r.isi.length === 0 ? (
                    <p className="px-5 py-6 text-center text-gray-400 text-sm">Belum ada barang di ruangan ini.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead className="bg-gray-50 border-b border-gray-100">
                          <tr>
                            <th className="table-th">NIBAR / Kode Barang</th>
                            <th className="table-th">Nama Barang</th>
                            <th className="table-th">Spesifikasi Nama Barang</th>
                            <th className="table-th">Merek / Tipe</th>
                            <th className="table-th text-center">Th. Perolehan</th>
                            <th className="table-th text-center">Jumlah</th>
                            <th className="table-th text-right">Nilai Perolehan</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {r.isi.map(b => (
                            <tr key={b.id}>
                              <td className="table-td text-xs">{b.nibar || '-'}<br /><span className="text-gray-400">{b.kode}</span></td>
                              <td className="table-td text-xs text-gray-600">{b.uraian_barang || '-'}</td>
                              <td className="table-td text-xs font-medium text-gray-800">{b.nama_barang || '-'}</td>
                              <td className="table-td text-xs text-gray-600">{b.merek_tipe || '-'}</td>
                              <td className="table-td text-center text-xs">{tahunPerolehan(b.tgl_perolehan)}</td>
                              <td className="table-td text-center text-xs">{b.jumlah} {b.satuan || ''}</td>
                              <td className="table-td text-right text-xs">{formatRupiah2(b.nilai_perolehan)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
