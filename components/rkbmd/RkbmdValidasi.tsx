'use client'
// RKBMD > Validasi — antrean telaah bagi Pengelola Barang (admin pemda).
// Semua dokumen berstatus 'diajukan' dari SELURUH SKPD dikumpulkan di satu
// layar, supaya penelaah tidak perlu membuka SKPD satu per satu di menu Usulan
// (yang memang dibuat per-SKPD untuk penyusunnya).
//
// Aksinya sama persis dengan tombol Setujui/Tolak di menu Usulan — hanya UPDATE
// `rkbmd.status`. NON-LEDGER: menyetujui RKBMD tidak membuat aset atau baris
// `transaksi_bmd` apa pun; ia cuma membekukan dokumen perencanaan.
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import FormShell from '@/components/pengelolaan/FormShell'
import { formatRupiah } from '@/lib/export'
import { RKBMD_JENIS, STATUS_META, type RkbmdStatus } from '@/lib/rkbmd'

const TAHUN_DEFAULT = new Date().getFullYear() + 1
const JENIS_LABEL: Record<string, string> = Object.fromEntries(RKBMD_JENIS.map(j => [j.key, j.label]))

type Antrean = {
  id: string
  skpd_id: number
  tahun_anggaran: number
  jenis: string
  versi: string
  status: RkbmdStatus
  program: string | null
  kegiatan: string | null
  sub_kegiatan: string | null
  diajukan_at: string | null
  admin_skpd: { nama: string } | null
  jumlah_item: number
  total: number
}

export default function RkbmdValidasi() {
  const supabase = createClient()
  const [tahun, setTahun] = useState(TAHUN_DEFAULT)
  const [isAdmin, setIsAdmin] = useState(false)
  const [rows, setRows] = useState<Antrean[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState('')
  const [msg, setMsg] = useState('')

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase.from('admin_profiles').select('role').eq('id', user.id).single()
      setIsAdmin((data as { role?: string } | null)?.role === 'admin')
    })()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const load = useCallback(async () => {
    setLoading(true); setErr('')
    const { data, error } = await supabase.from('rkbmd')
      .select('id,skpd_id,tahun_anggaran,jenis,versi,status,program,kegiatan,sub_kegiatan,diajukan_at,admin_skpd(nama)')
      .eq('tahun_anggaran', tahun).eq('status', 'diajukan')
      .order('diajukan_at', { ascending: true })
    if (error) { setErr(`gagal membaca antrean telaah: ${error.message}`); setRows([]); setLoading(false); return }

    const base = ((data || []) as unknown as Omit<Antrean, 'jumlah_item' | 'total'>[])
      .map(h => ({ ...h, jumlah_item: 0, total: 0 }))

    // Rekap item per dokumen. Sekali query untuk semua dokumen di antrean —
    // bukan N query, dan tetap kecil karena yang 'diajukan' selalu sedikit.
    if (base.length > 0) {
      const byId = new Map(base.map(h => [h.id, h]))
      const { data: its, error: e2 } = await supabase.from('rkbmd_item')
        .select('rkbmd_id,total_anggaran').in('rkbmd_id', base.map(h => h.id))
      if (e2) { setErr(`gagal membaca item RKBMD: ${e2.message}`); setRows([]); setLoading(false); return }
      for (const it of (its || []) as { rkbmd_id: string; total_anggaran: number | null }[]) {
        const h = byId.get(it.rkbmd_id)
        if (h) { h.jumlah_item += 1; h.total += it.total_anggaran || 0 }
      }
    }
    setRows(base)
    setLoading(false)
  }, [tahun]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() }, [load])

  async function setujui(h: Antrean) {
    if (!confirm(`Setujui RKBMD ${JENIS_LABEL[h.jenis] || h.jenis} ${h.admin_skpd?.nama || ''} TA ${h.tahun_anggaran}?\n${h.jumlah_item} item · ${formatRupiah(h.total)}`)) return
    setBusy(h.id); setErr(''); setMsg('')
    const { data: { user } } = await supabase.auth.getUser()
    const { error } = await supabase.from('rkbmd').update({
      status: 'disetujui', approved_by: user?.id || null, approved_at: new Date().toISOString(),
    }).eq('id', h.id)
    if (error) setErr(error.message)
    else { setMsg('RKBMD disetujui & ditetapkan.'); load() }
    setBusy(null)
  }

  async function tolak(h: Antrean) {
    const alasan = prompt('Catatan telaah (akan dikirim ke SKPD):')
    if (alasan === null) return
    setBusy(h.id); setErr(''); setMsg('')
    const { error } = await supabase.from('rkbmd')
      .update({ status: 'ditolak', catatan_telaah: alasan || null }).eq('id', h.id)
    if (error) setErr(error.message)
    else { setMsg('RKBMD dikembalikan ke SKPD.'); load() }
    setBusy(null)
  }

  return (
    <FormShell
      judul="Validasi RKBMD"
      deskripsi="Antrean telaah Pengelola Barang: seluruh dokumen RKBMD yang sudah diajukan SKPD, dari semua SKPD sekaligus."
      msg={msg}
      headerRight={
        <div>
          <label className="block text-xs text-gray-500 mb-1">Tahun Anggaran</label>
          <input type="number" className="select-filter w-28" value={tahun}
            onChange={e => setTahun(Number(e.target.value) || TAHUN_DEFAULT)} />
        </div>
      }
    >
      {err && <div className="mb-4 p-3 rounded-lg bg-red-50 text-red-700 text-sm">{err}</div>}

      {!isAdmin && (
        <div className="mb-4 p-3 rounded-lg bg-amber-50 text-amber-800 text-sm">
          Menelaah RKBMD adalah wewenang Pengelola Barang (admin pemda). Anda tetap bisa melihat antreannya,
          tapi tombol Setujui/Tolak tidak tersedia.
        </div>
      )}

      <div className="card overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="table-th">SKPD</th>
              <th className="table-th">Jenis</th>
              <th className="table-th">Versi</th>
              <th className="table-th">Program / Sub Kegiatan</th>
              <th className="table-th text-right">Item</th>
              <th className="table-th text-right">Total Anggaran</th>
              <th className="table-th">Diajukan</th>
              <th className="table-th w-44">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {loading ? (
              <tr><td colSpan={8} className="table-td text-center py-8 text-gray-400">Memuat...</td></tr>
            ) : err ? (
              <tr><td colSpan={8} className="table-td text-center py-8 text-red-500">Data tidak ditampilkan karena terjadi kesalahan di atas.</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={8} className="table-td text-center py-8 text-gray-400">
                Tidak ada RKBMD yang menunggu telaah untuk TA {tahun}.
              </td></tr>
            ) : rows.map(h => (
              <tr key={h.id}>
                <td className="table-td text-xs text-gray-800">{h.admin_skpd?.nama || `SKPD #${h.skpd_id}`}</td>
                <td className="table-td text-xs">
                  {JENIS_LABEL[h.jenis] || h.jenis}
                  <span className={`ml-2 text-[10px] px-1.5 py-0.5 rounded-full align-middle ${STATUS_META[h.status].cls}`}>
                    {STATUS_META[h.status].label}
                  </span>
                </td>
                <td className="table-td text-xs text-gray-500">{h.versi === 'perubahan' ? 'Perubahan' : 'Murni'}</td>
                <td className="table-td text-xs text-gray-500">
                  <div>{h.program || '—'}</div>
                  {h.sub_kegiatan && <div className="text-[11px] text-gray-400">{h.sub_kegiatan}</div>}
                </td>
                <td className="table-td text-xs text-right">{h.jumlah_item}</td>
                <td className="table-td text-xs text-right whitespace-nowrap">{formatRupiah(h.total)}</td>
                <td className="table-td text-xs text-gray-400 whitespace-nowrap">{h.diajukan_at?.slice(0, 10) || '—'}</td>
                <td className="table-td whitespace-nowrap">
                  <Link href="/dashboard/rkbmd/usulan" className="text-gray-500 hover:text-gray-700 text-xs mr-3">Lihat</Link>
                  {isAdmin && (
                    <>
                      <button onClick={() => setujui(h)} disabled={busy === h.id}
                        className="text-teal hover:underline text-xs font-medium mr-3">Setujui</button>
                      <button onClick={() => tolak(h)} disabled={busy === h.id}
                        className="text-red-500 hover:text-red-700 text-xs font-medium">Tolak</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </FormShell>
  )
}
