'use client'
// Admin > Standar Barang & Standar Kebutuhan (SBSK) — Permendagri 19/2016
// Pasal 20(2)a & b. Standar barang = spesifikasi acuan; standar kebutuhan =
// satuan jumlah barang yang dibutuhkan per satuan pengukur. Dipakai RKBMD
// Pengadaan utk menghitung gap (kebutuhan = kuantitas_standar − eksisting).
// Satu kopi sekabupaten per tahun; tulis hanya admin.
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import FormShell from '@/components/pengelolaan/FormShell'
import KodefikasiPicker, { type KodefikasiHasil } from '@/components/KodefikasiPicker'

type SBSK = {
  id: number; tahun: number; kode: string; spesifikasi: string | null
  satuan_pengukur: string; kuantitas_standar: number; satuan: string | null; keterangan: string | null
  admin_kodefikasi_bmd?: { uraian: string | null } | null
}

const TAHUN_DEFAULT = new Date().getFullYear() + 1
const SATUAN_PENGUKUR = ['per_skpd', 'per_pegawai', 'per_ruangan', 'per_unit_kerja', 'per_kegiatan']

export default function AdminRkbmdSbskPage() {
  const supabase = createClient()
  const [tahun, setTahun] = useState(TAHUN_DEFAULT)
  const [list, setList] = useState<SBSK[]>([])
  const [satuanList, setSatuanList] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState('')

  // form
  const [editId, setEditId] = useState<number | null>(null)
  const [picked, setPicked] = useState<KodefikasiHasil | null>(null)
  const [spesifikasi, setSpesifikasi] = useState('')
  const [satuanPengukur, setSatuanPengukur] = useState('per_skpd')
  const [kuantitas, setKuantitas] = useState('')
  const [satuan, setSatuan] = useState('')
  const [keterangan, setKeterangan] = useState('')
  const [saving, setSaving] = useState(false)

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('rkbmd_sbsk')
      .select('*, admin_kodefikasi_bmd(uraian)')
      .eq('tahun', tahun)
      .order('kode')
    setList((data || []) as SBSK[])
    setLoading(false)
  }

  useEffect(() => { load() }, [tahun]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    supabase.from('admin_satuan_bmd').select('nama').order('nama')
      .then(({ data }) => setSatuanList((data || []).map((s: { nama: string }) => s.nama)))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function resetForm() {
    setEditId(null); setPicked(null); setSpesifikasi(''); setSatuanPengukur('per_skpd'); setKuantitas(''); setSatuan(''); setKeterangan('')
  }

  function openEdit(s: SBSK) {
    setEditId(s.id)
    setPicked({ kode: s.kode, uraian: s.admin_kodefikasi_bmd?.uraian ?? null, nama_objek: null, nama_rincian: null, nama_sub_rincian: null, masa_manfaat_tahun: null, batas_kapitalisasi: null })
    setSpesifikasi(s.spesifikasi || ''); setSatuanPengukur(s.satuan_pengukur); setKuantitas(String(s.kuantitas_standar))
    setSatuan(s.satuan || ''); setKeterangan(s.keterangan || '')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!picked) { setMsg('Error: pilih kode barang dulu.'); return }
    setSaving(true); setMsg('')
    const payload = {
      tahun, kode: picked.kode, spesifikasi: spesifikasi || null,
      satuan_pengukur: satuanPengukur, kuantitas_standar: Number(kuantitas) || 0,
      satuan: satuan || null, keterangan: keterangan || null,
    }
    const { error } = editId
      ? await supabase.from('rkbmd_sbsk').update(payload).eq('id', editId)
      : await supabase.from('rkbmd_sbsk').insert(payload)
    if (error) setMsg(`Error: ${error.message}`)
    else { setMsg(editId ? 'SBSK diperbarui.' : 'SBSK ditambahkan.'); resetForm(); load() }
    setSaving(false)
  }

  async function handleDelete(s: SBSK) {
    if (!confirm(`Hapus SBSK ${s.kode} (${tahun})?`)) return
    const { error } = await supabase.from('rkbmd_sbsk').delete().eq('id', s.id)
    if (error) setMsg(`Error: ${error.message}`)
    load()
  }

  return (
    <FormShell
      judul="Standar Barang & Standar Kebutuhan (SBSK)"
      deskripsi="Acuan jumlah kebutuhan barang per tahun anggaran (Permendagri 19/2016 Pasal 20). Dipakai RKBMD Pengadaan untuk menghitung gap terhadap barang eksisting."
      msg={msg}
      headerRight={
        <div>
          <label className="block text-xs text-gray-500 mb-1">Tahun Anggaran</label>
          <input type="number" className="select-filter w-32" value={tahun}
            onChange={e => setTahun(Number(e.target.value) || TAHUN_DEFAULT)} />
        </div>
      }
    >
      <div className="card p-6 mb-6 max-w-2xl">
        <h2 className="text-base font-semibold text-gray-800 mb-4">{editId ? 'Edit SBSK' : 'Tambah SBSK'} — TA {tahun}</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Kode Barang</label>
            <KodefikasiPicker picked={picked} onPick={setPicked} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-xs text-gray-500 mb-1">Standar Barang / Spesifikasi acuan (opsional)</label>
              <input className="select-filter w-full" value={spesifikasi} onChange={e => setSpesifikasi(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Satuan Pengukur</label>
              <select className="select-filter w-full" value={satuanPengukur} onChange={e => setSatuanPengukur(e.target.value)}>
                {SATUAN_PENGUKUR.map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Kuantitas Standar</label>
              <input type="number" required min={0} step="any" className="select-filter w-full" value={kuantitas} onChange={e => setKuantitas(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Satuan Barang</label>
              <input list="sbsk-satuan" className="select-filter w-full" value={satuan} onChange={e => setSatuan(e.target.value)} />
              <datalist id="sbsk-satuan">{satuanList.map(s => <option key={s} value={s} />)}</datalist>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Keterangan</label>
              <input className="select-filter w-full" value={keterangan} onChange={e => setKeterangan(e.target.value)} />
            </div>
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? 'Menyimpan...' : editId ? 'Simpan Perubahan' : 'Tambah'}
            </button>
            {editId && <button type="button" onClick={resetForm} className="text-sm text-gray-500 hover:text-gray-700">Batal edit</button>}
          </div>
        </form>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="table-th">Kode</th>
              <th className="table-th">Uraian</th>
              <th className="table-th">Satuan Pengukur</th>
              <th className="table-th text-right">Kuantitas Standar</th>
              <th className="table-th">Satuan</th>
              <th className="table-th">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {loading ? (
              <tr><td colSpan={6} className="table-td text-center py-8 text-gray-400">Memuat...</td></tr>
            ) : list.length === 0 ? (
              <tr><td colSpan={6} className="table-td text-center py-8 text-gray-400">Belum ada SBSK untuk TA {tahun}.</td></tr>
            ) : list.map(s => (
              <tr key={s.id}>
                <td className="table-td text-xs">{s.kode}</td>
                <td className="table-td text-xs text-gray-600 max-w-xs truncate" title={s.admin_kodefikasi_bmd?.uraian || ''}>{s.admin_kodefikasi_bmd?.uraian || '-'}</td>
                <td className="table-td text-xs text-gray-500">{s.satuan_pengukur.replace(/_/g, ' ')}</td>
                <td className="table-td text-xs text-right">{s.kuantitas_standar}</td>
                <td className="table-td text-xs text-gray-500">{s.satuan || '—'}</td>
                <td className="table-td whitespace-nowrap">
                  <button onClick={() => openEdit(s)} className="text-teal hover:underline text-xs font-medium mr-3">Edit</button>
                  <button onClick={() => handleDelete(s)} className="text-red-500 hover:text-red-700 text-xs font-medium">Hapus</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </FormShell>
  )
}
