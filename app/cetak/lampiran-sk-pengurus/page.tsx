'use client'
// Cetak LAMPIRAN SK Pengurus Barang (admin). Standalone (tanpa sidebar).
// Semua usulan status 'disetujui', dikelompokkan/diurutkan per SKPD.
// Format generik — nomor SK & pejabat penanda tangan tinggal disesuaikan.
import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { pangkatDariGolongan, type UsulanRow } from '@/lib/usulanPengurus'

type Skpd = { id: number; nama: string; kode_skpd: string | null }
const tglID = () => new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })

export default function CetakLampiranPage() {
  const supabase = createClient()
  const [rows, setRows] = useState<UsulanRow[]>([])
  const [skpds, setSkpds] = useState<Skpd[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      const [{ data: r }, { data: s }] = await Promise.all([
        supabase.from('admin_usulan_pengurus').select('*').eq('status', 'disetujui'),
        supabase.from('admin_skpd').select('id,nama,kode_skpd').limit(5000),
      ])
      setRows((r || []) as UsulanRow[])
      setSkpds((s || []) as Skpd[])
      setLoading(false)
    })()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const skpdMap = useMemo(() => { const m: Record<number, Skpd> = {}; for (const s of skpds) m[s.id] = s; return m }, [skpds])
  const sorted = useMemo(() => [...rows].sort((a, b) => {
    const ka = skpdMap[a.skpd_id]?.kode_skpd || '￿', kb = skpdMap[b.skpd_id]?.kode_skpd || '￿'
    return ka.localeCompare(kb) || a.nama.localeCompare(b.nama)
  }), [rows, skpdMap])

  if (loading) return <div className="p-8 text-sm text-gray-400">Memuat…</div>
  if (rows.length === 0) return <div className="p-8 text-sm text-gray-500">Belum ada usulan yang disetujui untuk dijadikan lampiran.</div>

  return (
    <div className="min-h-screen bg-gray-100 py-6 print:bg-white print:py-0">
      <style>{`@media print { .no-print { display: none !important; } @page { size: A4 landscape; margin: 1.5cm; } body { background: white; } }`}</style>

      <div className="max-w-5xl mx-auto mb-3 flex justify-end no-print">
        <button onClick={() => window.print()} className="btn-primary text-sm">🖨 Cetak / Simpan PDF</button>
      </div>

      <div className="max-w-5xl mx-auto bg-white p-10 shadow print:shadow-none text-sm text-gray-900">
        <div className="text-center mb-1">
          <p className="font-semibold">LAMPIRAN KEPUTUSAN BUPATI ....................</p>
          <p>NOMOR : .................... TAHUN ..........</p>
          <p>TENTANG PENETAPAN PENGURUS BARANG</p>
        </div>
        <p className="text-center font-bold uppercase my-4">Daftar Pengurus Barang</p>

        <table className="w-full border border-gray-800 border-collapse">
          <thead><tr className="bg-gray-100">
            {['No', 'Nama', 'NIP', 'Gol/Pangkat', 'Jabatan', 'SKPD', 'Sebagai'].map(h =>
              <th key={h} className="border border-gray-800 px-2 py-1 text-left text-xs">{h}</th>)}
          </tr></thead>
          <tbody>
            {sorted.map((r, i) => (
              <tr key={r.id}>
                <td className="border border-gray-800 px-2 py-1 text-center">{i + 1}</td>
                <td className="border border-gray-800 px-2 py-1">{r.nama}</td>
                <td className="border border-gray-800 px-2 py-1">{r.nip}</td>
                <td className="border border-gray-800 px-2 py-1">{r.golongan || '-'}{(r.pangkat || (r.golongan && pangkatDariGolongan(r.golongan))) ? ` · ${r.pangkat || pangkatDariGolongan(r.golongan || '')}` : ''}</td>
                <td className="border border-gray-800 px-2 py-1">{r.jabatan || '-'}</td>
                <td className="border border-gray-800 px-2 py-1">{skpdMap[r.skpd_id]?.nama || `SKPD #${r.skpd_id}`}</td>
                <td className="border border-gray-800 px-2 py-1">Pengurus Barang</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="flex justify-end mt-10">
          <div className="text-center">
            <p>Ditetapkan di ....................</p>
            <p>pada tanggal {tglID()}</p>
            <p className="mt-2">BUPATI ....................</p>
            <div className="h-20" />
            <p className="font-semibold underline">....................</p>
          </div>
        </div>
      </div>
    </div>
  )
}
