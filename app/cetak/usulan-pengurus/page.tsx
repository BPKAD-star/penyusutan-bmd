'use client'
// Cetak SURAT USULAN Pengurus Barang (dari SKPD). Standalone (tanpa sidebar).
// Ambil ?skpd=<id> → daftar usulan status diajukan/disetujui utk SKPD itu.
// Format generik — kop & pejabat penanda tangan tinggal disesuaikan.
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { pangkatDariGolongan, peranLabel, type UsulanRow } from '@/lib/usulanPengurus'

const tglID = (s: string | null) => {
  const d = s ? new Date(s) : new Date()
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
}

export default function CetakUsulanPage() {
  const supabase = createClient()
  const [skpd, setSkpd] = useState<{ nama: string } | null>(null)
  const [rows, setRows] = useState<UsulanRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      const id = new URLSearchParams(window.location.search).get('skpd')
      if (!id) { setLoading(false); return }
      const [{ data: s }, { data: r }] = await Promise.all([
        supabase.from('admin_skpd').select('nama').eq('id', Number(id)).maybeSingle(),
        supabase.from('admin_usulan_pengurus').select('*').eq('skpd_id', Number(id))
          .in('status', ['diajukan', 'disetujui']).order('nama'),
      ])
      setSkpd(s as { nama: string } | null)
      setRows((r || []) as UsulanRow[])
      setLoading(false)
    })()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <div className="p-8 text-sm text-gray-400">Memuat…</div>
  if (rows.length === 0) return <div className="p-8 text-sm text-gray-500">Tidak ada usulan yang diajukan untuk dicetak.</div>

  const noSurat = rows.find(r => r.no_usulan)?.no_usulan || '............................'
  const tgl = tglID(rows.find(r => r.tgl_usulan)?.tgl_usulan || null)

  return (
    <div className="min-h-screen bg-gray-100 py-6 print:bg-white print:py-0">
      <style>{`@media print { .no-print { display: none !important; } @page { size: A4; margin: 2cm; } body { background: white; } }`}</style>

      <div className="max-w-3xl mx-auto mb-3 flex justify-end no-print">
        <button onClick={() => window.print()} className="btn-primary text-sm">🖨 Cetak / Simpan PDF</button>
      </div>

      <div className="max-w-3xl mx-auto bg-white p-10 shadow print:shadow-none text-sm text-gray-900 leading-relaxed">
        {/* KOP — sesuaikan */}
        <div className="text-center border-b-2 border-gray-800 pb-3 mb-6">
          <p className="font-bold text-base uppercase">Pemerintah Kabupaten ....................</p>
          <p className="font-semibold uppercase">{skpd?.nama || 'PERANGKAT DAERAH'}</p>
          <p className="text-xs text-gray-500">Alamat .................... · Telp. .................... · Kode Pos ..........</p>
        </div>

        <div className="flex justify-end mb-4">.................., {tgl}</div>
        <table className="mb-4"><tbody>
          <tr><td className="pr-3 align-top">Nomor</td><td className="pr-2 align-top">:</td><td>{noSurat}</td></tr>
          <tr><td className="pr-3 align-top">Lampiran</td><td className="pr-2 align-top">:</td><td>1 (satu) berkas</td></tr>
          <tr><td className="pr-3 align-top">Perihal</td><td className="pr-2 align-top">:</td><td className="font-semibold">Usulan Pengurus Barang</td></tr>
        </tbody></table>

        <div className="mb-4">
          <p>Kepada Yth.</p>
          <p>Bupati .................... </p>
          <p>c.q. Kepala Badan Pengelola Keuangan dan Aset Daerah</p>
          <p>di -</p>
          <p className="ml-8">Tempat</p>
        </div>

        <p className="mb-3 text-justify">
          Dalam rangka tertib administrasi pengelolaan Barang Milik Daerah, bersama ini kami mengusulkan
          nama-nama pegawai di lingkungan <b>{skpd?.nama || '....................'}</b> untuk ditetapkan dalam
          pengelolaan Barang Milik Daerah dengan peran sebagaimana tercantum berikut:
        </p>

        <table className="w-full border border-gray-800 border-collapse mb-4">
          <thead><tr className="bg-gray-100">
            {['No', 'Nama', 'NIP', 'Gol/Pangkat', 'Jabatan', 'Diusulkan Sebagai'].map(h => <th key={h} className="border border-gray-800 px-2 py-1 text-left text-xs">{h}</th>)}
          </tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id}>
                <td className="border border-gray-800 px-2 py-1 text-center">{i + 1}</td>
                <td className="border border-gray-800 px-2 py-1">{r.nama}</td>
                <td className="border border-gray-800 px-2 py-1">{r.nip}</td>
                <td className="border border-gray-800 px-2 py-1">{r.golongan || '-'}{(r.pangkat || (r.golongan && pangkatDariGolongan(r.golongan))) ? ` · ${r.pangkat || pangkatDariGolongan(r.golongan || '')}` : ''}</td>
                <td className="border border-gray-800 px-2 py-1">{r.jabatan || '-'}</td>
                <td className="border border-gray-800 px-2 py-1">{peranLabel(r.role_bmd)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <p className="mb-10 text-justify">Demikian usulan ini kami sampaikan, atas perhatian dan perkenannya kami ucapkan terima kasih.</p>

        <div className="flex justify-end">
          <div className="text-center">
            <p>Kepala {skpd?.nama || '....................'}</p>
            <div className="h-20" />
            <p className="font-semibold underline">....................</p>
            <p>NIP. ....................</p>
          </div>
        </div>
      </div>
    </div>
  )
}
