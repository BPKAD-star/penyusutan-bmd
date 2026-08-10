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
import { createClient } from '@/lib/supabase/client'
import FormShell from '@/components/pengelolaan/FormShell'
import { backdropClose } from '@/components/backdropClose'
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
  const [detail, setDetail] = useState<Antrean | null>(null)
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
                  {/* Dulu menautkan ke menu Usulan, yang justru memaksa penelaah
                      keluar dari antrean lalu memilih SKPD lagi dari awal.
                      Sekarang pop-up di tempat (keputusan user 2026-08-10). */}
                  <button onClick={() => setDetail(h)}
                    className="text-gray-500 hover:text-gray-700 text-xs mr-3">Lihat</button>
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

      {detail && <DetailModal h={detail} onClose={() => setDetail(null)} />}
    </FormShell>
  )
}

// ── Pop-up rincian satu dokumen RKBMD ───────────────────────────────────────
// TKDN TIDAK disimpan di `rkbmd_item` — ia atribut barang di SSH, jadi ditarik
// lewat `standar_id`. Sengaja begitu: TKDN melekat pada barang standarnya, dan
// menyalinnya ke tiap item berarti dua sumber kebenaran yang bisa berbeda.
function DetailModal({ h, onClose }: { h: Antrean; onClose: () => void }) {
  const supabase = createClient()
  type Baris = {
    id: string; no_urut: number | null; kode: string | null; nama_barang: string | null
    satuan: string | null; jumlah_kebutuhan: number | null; harga_satuan: number | null
    total_anggaran: number | null; kode_rekening: string | null; keterangan: string | null
    standar_id: number | null; tkdn: number | null
  }
  const [rows, setRows] = useState<Baris[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')

  useEffect(() => {
    let alive = true
    ;(async () => {
      const { data, error } = await supabase.from('rkbmd_item')
        .select('id,no_urut,kode,nama_barang,satuan,jumlah_kebutuhan,harga_satuan,total_anggaran,kode_rekening,keterangan,standar_id')
        .eq('rkbmd_id', h.id).order('no_urut')
      if (!alive) return
      if (error) { setErr(`gagal membaca item: ${error.message}`); setRows([]); setLoading(false); return }

      const its = ((data || []) as Omit<Baris, 'tkdn'>[]).map(r => ({ ...r, tkdn: null as number | null }))
      const ids = [...new Set(its.map(r => r.standar_id).filter((x): x is number => x != null))]
      if (ids.length > 0) {
        const { data: std, error: e2 } = await supabase.from('rkbmd_standar').select('id,tkdn').in('id', ids)
        if (!alive) return
        if (e2) { setErr(`gagal membaca TKDN dari SSH: ${e2.message}`); setRows([]); setLoading(false); return }
        const tkdnById = new Map(((std || []) as { id: number; tkdn: number | null }[]).map(s => [s.id, s.tkdn]))
        for (const r of its) if (r.standar_id != null) r.tkdn = tkdnById.get(r.standar_id) ?? null
      }
      setRows(its)
      setLoading(false)
    })()
    return () => { alive = false }
  }, [h.id]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" {...backdropClose(onClose)}>
      <div className="card w-full max-w-6xl max-h-[88vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-100 flex items-start justify-between sticky top-0 bg-white z-10">
          <div className="min-w-0">
            <h3 className="font-semibold text-gray-800">
              RKBMD {JENIS_LABEL[h.jenis] || h.jenis} — {h.admin_skpd?.nama || `SKPD #${h.skpd_id}`}
            </h3>
            <p className="text-xs text-gray-500">
              TA {h.tahun_anggaran} · {h.versi === 'perubahan' ? 'Perubahan' : 'Murni'} ·
              diajukan {h.diajukan_at?.slice(0, 10) || '—'}
            </p>
          </div>
          <button className="text-gray-400 hover:text-gray-700 text-xl leading-none flex-shrink-0" onClick={onClose}>×</button>
        </div>

        <div className="p-5 space-y-4">
          <div className="rounded-lg border border-gray-100 bg-gray-50/60 p-4 space-y-1 text-xs">
            <p><span className="text-gray-400 inline-block w-28">Program</span>: <span className="text-gray-800">{h.program || '—'}</span></p>
            <p><span className="text-gray-400 inline-block w-28">Kegiatan</span>: <span className="text-gray-800">{h.kegiatan || '—'}</span></p>
            <p><span className="text-gray-400 inline-block w-28">Sub Kegiatan</span>: <span className="text-gray-800">{h.sub_kegiatan || '—'}</span></p>
          </div>

          {err && <div className="p-3 rounded-lg bg-red-50 text-red-700 text-sm">{err}</div>}

          {loading ? (
            <p className="text-sm text-gray-400 py-6 text-center">Memuat rincian...</p>
          ) : err ? null : rows.length === 0 ? (
            <p className="text-sm text-gray-400 py-6 text-center">Dokumen ini belum berisi item.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="table-th w-10">No</th>
                    <th className="table-th">Kode Barang</th>
                    <th className="table-th">Nama Barang</th>
                    <th className="table-th">Kode Rekening</th>
                    <th className="table-th text-right">TKDN</th>
                    <th className="table-th text-right">Kuantitas</th>
                    <th className="table-th text-right">Harga Satuan</th>
                    <th className="table-th text-right">Total</th>
                    <th className="table-th">Keterangan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {rows.map((r, i) => (
                    <tr key={r.id}>
                      <td className="table-td text-xs">{r.no_urut ?? i + 1}</td>
                      <td className="table-td text-xs whitespace-nowrap">{r.kode || '—'}</td>
                      <td className="table-td text-xs text-gray-800">{r.nama_barang || '—'}</td>
                      <td className="table-td text-xs text-gray-500 whitespace-nowrap">{r.kode_rekening || '—'}</td>
                      <td className="table-td text-xs text-right">{r.tkdn != null ? `${r.tkdn}%` : '—'}</td>
                      <td className="table-td text-xs text-right whitespace-nowrap">
                        {r.jumlah_kebutuhan ?? 0} {r.satuan || ''}
                      </td>
                      <td className="table-td text-xs text-right whitespace-nowrap">{formatRupiah(r.harga_satuan)}</td>
                      <td className="table-td text-xs text-right whitespace-nowrap font-medium">{formatRupiah(r.total_anggaran)}</td>
                      <td className="table-td text-xs text-gray-500">{r.keterangan || '—'}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-50 border-t border-gray-100">
                  <tr>
                    <td className="table-td text-xs font-semibold" colSpan={7}>Total Rencana Anggaran</td>
                    <td className="table-td text-xs text-right font-bold whitespace-nowrap">
                      {formatRupiah(rows.reduce((s, r) => s + (r.total_anggaran || 0), 0))}
                    </td>
                    <td className="table-td" />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
