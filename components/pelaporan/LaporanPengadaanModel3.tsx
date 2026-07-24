'use client'
// Tab "Model 3" di Laporan Pengadaan — format Permendagri 47/2021 (Format IV.A).
// Toolbar (Export Excel flat + Cetak/PDF ke halaman cetak khusus) + tabel plek-
// ketiplek (LaporanPengadaanTabel). Filter periode & SKPD diteruskan dari
// LaporanPerolehan (komponen induk).
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { exportToExcel } from '@/lib/export'
import { fetchLaporanPengadaan, groupByGolongan, grandTotal } from '@/lib/laporanPengadaan'
import LaporanPengadaanTabel from './LaporanPengadaanTabel'

export default function LaporanPengadaanModel3({ periode, skpdId, descIds }: {
  periode: string; skpdId: number | null; descIds: number[] | null
}) {
  const supabase = createClient()
  const [exporting, setExporting] = useState(false)

  async function handleExport() {
    setExporting(true)
    const rows = await fetchLaporanPengadaan(supabase, { periode, descIds })
    const groups = groupByGolongan(rows)
    const flat: Record<string, unknown>[] = []
    const cols = (r: (typeof rows)[number]) => ({
      'Kode Barang': r.kode, 'Nama Barang': r.namaBarang, 'Spesifikasi Nama Barang': r.spesifikasi,
      'Merek/Tipe': r.merekTipe, 'Jumlah Barang': r.jumlah, 'Satuan Barang': r.satuan,
      'Harga Satuan (Rp)': r.hargaSatuan, 'Total Nilai Barang (Rp)': r.totalNilai,
      'Total Biaya Atribusi (Rp)': 0, 'Nilai Perolehan Barang (Rp)': r.totalNilai,
      'Harga Satuan Perolehan (Rp)': r.hargaSatuan,
      'Kode Sub Kegiatan': r.kodeSubKegiatan, 'Nama Sub Kegiatan': r.namaSubKegiatan,
      'Kode Rekening': r.kodeRekening, 'Uraian Belanja': r.uraianBelanja,
      'Tanggal Perolehan': r.tanggal, 'Bentuk Kontrak': r.bentukKontrak,
      'Nama Penyedia': r.namaPenyedia, 'Nomor': r.nomor, 'Keterangan': r.keterangan,
    })
    for (const g of groups) {
      for (const r of g.rows) flat.push(cols(r))
      flat.push({
        'Kode Barang': '', 'Nama Barang': `Jumlah ${g.uraian}`, 'Total Nilai Barang (Rp)': g.subtotal,
        'Total Biaya Atribusi (Rp)': 0, 'Nilai Perolehan Barang (Rp)': g.subtotal,
      })
    }
    flat.push({ 'Nama Barang': 'TOTAL', 'Total Nilai Barang (Rp)': grandTotal(rows),
      'Total Biaya Atribusi (Rp)': 0, 'Nilai Perolehan Barang (Rp)': grandTotal(rows) })
    exportToExcel(flat, `Laporan_Pengadaan_Permendagri${periode ? '_' + periode : ''}`, 'Laporan Pengadaan')
    setExporting(false)
  }

  const cetakUrl = `/cetak/laporan-pengadaan?periode=${encodeURIComponent(periode)}${skpdId ? `&skpd=${skpdId}` : ''}`

  return (
    <div>
      <div className="flex items-center justify-end gap-2 mb-3">
        <a href={cetakUrl} target="_blank" rel="noopener noreferrer"
          className="px-4 py-2 rounded-lg text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50">
          🖨 Cetak / PDF
        </a>
        <button onClick={handleExport} disabled={exporting} className="btn-primary">
          {exporting ? 'Mengekspor...' : 'Export Excel'}
        </button>
      </div>
      <div className="card p-4 overflow-x-auto">
        <LaporanPengadaanTabel periode={periode} skpdId={skpdId} descIds={descIds} />
      </div>
    </div>
  )
}
