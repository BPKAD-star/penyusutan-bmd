'use client'
// Display-only: menampilkan transaksi transfer yang menyangkut SKPD user.
// Dipakai Penggunaan (pengalihan_status) & Penerimaan Internal (mutasi_internal).
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatRupiah } from '@/lib/export'

type Row = {
  id: number; tanggal: string; periode: string; keterangan: string | null
  aset: { nibar: string | null; nama_barang: string | null; kode: string; nilai_perolehan: number } | null
  asal: { nama: string } | null; tujuan: { nama: string } | null
}

export default function DaftarTransfer({ jenis, judul, deskripsi }: {
  jenis: string; judul: string; deskripsi: string
}) {
  const supabase = createClient()
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      setLoading(true)
      const { data } = await supabase
        .from('transaksi_bmd')
        .select('id,tanggal,periode,keterangan,aset(nibar,nama_barang,kode,nilai_perolehan),asal:skpd_asal(nama),tujuan:skpd_tujuan(nama)')
        .eq('jenis', jenis)
        .order('id', { ascending: false })
        .limit(200)
      setRows((data as never) || [])
      setLoading(false)
    })()
  }, [jenis]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{judul}</h1>
        <p className="text-gray-500 text-sm mt-1">{deskripsi}</p>
      </div>
      <div className="card overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="table-th">Tanggal</th><th className="table-th">Barang</th>
              <th className="table-th">Dari</th><th className="table-th">Ke</th><th className="table-th text-right">Nilai</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {loading ? (
              <tr><td colSpan={5} className="table-td text-center py-8 text-gray-400">Memuat...</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={5} className="table-td text-center py-8 text-gray-400">Belum ada transaksi</td></tr>
            ) : rows.map(r => (
              <tr key={r.id}>
                <td className="table-td text-xs">{r.tanggal} <span className="text-gray-400">({r.periode})</span></td>
                <td className="table-td text-xs">
                  <p className="font-medium">{r.aset?.nama_barang || '-'}</p>
                  <p className="text-gray-400">{r.aset?.nibar || '-'} · {r.aset?.kode}</p>
                </td>
                <td className="table-td text-xs">{r.asal?.nama || '-'}</td>
                <td className="table-td text-xs">{r.tujuan?.nama || '-'}</td>
                <td className="table-td text-xs text-right">{formatRupiah(r.aset?.nilai_perolehan ?? 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
