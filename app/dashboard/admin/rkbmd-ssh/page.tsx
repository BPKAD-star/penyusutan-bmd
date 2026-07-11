'use client'
// Admin > Standar Satuan Harga (SSH) — Permendagri 19/2016 Pasal 20(2)c.
// Acuan harga pengadaan per tahun anggaran; dipakai RKBMD Pengadaan utk
// menghitung nilai (jumlah_kebutuhan × harga). Satu kopi sekabupaten (bukan
// per-SKPD). Tulis hanya admin (RLS rkbmd_ssh_write = fn_is_admin()).
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import FormShell from '@/components/pengelolaan/FormShell'
import KodefikasiPicker, { type KodefikasiHasil } from '@/components/KodefikasiPicker'
import { formatRupiah } from '@/lib/export'

type SSH = {
  id: number; tahun: number; kode: string; spesifikasi: string | null
  satuan: string | null; harga: number; keterangan: string | null
  admin_kodefikasi_bmd?: { uraian: string | null } | null
}

const TAHUN_DEFAULT = new Date().getFullYear() + 1

export default function AdminRkbmdSshPage() {
  const supabase = createClient()
  const [tahun, setTahun] = useState(TAHUN_DEFAULT)
  const [list, setList] = useState<SSH[]>([])
  const [satuanList, setSatuanList] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState('')

  // form
  const [editId, setEditId] = useState<number | null>(null)
  const [picked, setPicked] = useState<KodefikasiHasil | null>(null)
  const [spesifikasi, setSpesifikasi] = useState('')
  const [satuan, setSatuan] = useState('')
  const [harga, setHarga] = useState('')
  const [keterangan, setKeterangan] = useState('')
  const [saving, setSaving] = useState(false)

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('rkbmd_ssh')
      .select('*, admin_kodefikasi_bmd(uraian)')
      .eq('tahun', tahun)
      .order('kode')
    setList((data || []) as SSH[])
    setLoading(false)
  }

  useEffect(() => { load() }, [tahun]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    supabase.from('admin_satuan_bmd').select('nama').order('nama')
      .then(({ data }) => setSatuanList((data || []).map((s: { nama: string }) => s.nama)))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function resetForm() {
    setEditId(null); setPicked(null); setSpesifikasi(''); setSatuan(''); setHarga(''); setKeterangan('')
  }

  function openEdit(s: SSH) {
    setEditId(s.id)
    setPicked({ kode: s.kode, uraian: s.admin_kodefikasi_bmd?.uraian ?? null, nama_objek: null, nama_rincian: null, nama_sub_rincian: null, masa_manfaat_tahun: null, batas_kapitalisasi: null })
    setSpesifikasi(s.spesifikasi || ''); setSatuan(s.satuan || ''); setHarga(String(s.harga)); setKeterangan(s.keterangan || '')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!picked) { setMsg('Error: pilih kode barang dulu.'); return }
    setSaving(true); setMsg('')
    const payload = {
      tahun, kode: picked.kode,
      spesifikasi: spesifikasi || null, satuan: satuan || null,
      harga: Number(harga) || 0, keterangan: keterangan || null,
    }
    const { error } = editId
      ? await supabase.from('rkbmd_ssh').update(payload).eq('id', editId)
      : await supabase.from('rkbmd_ssh').insert(payload)
    if (error) setMsg(`Error: ${error.message}`)
    else { setMsg(editId ? 'SSH diperbarui.' : 'SSH ditambahkan.'); resetForm(); load() }
    setSaving(false)
  }

  async function handleDelete(s: SSH) {
    if (!confirm(`Hapus SSH ${s.kode} (${tahun})?`)) return
    const { error } = await supabase.from('rkbmd_ssh').delete().eq('id', s.id)
    if (error) setMsg(`Error: ${error.message}`)
    load()
  }

  return (
    <FormShell
      judul="Standar Satuan Harga (SSH)"
      deskripsi="Acuan harga pengadaan per tahun anggaran (Permendagri 19/2016 Pasal 20). Dipakai RKBMD Pengadaan untuk menghitung nilai kebutuhan."
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
        <h2 className="text-base font-semibold text-gray-800 mb-4">{editId ? 'Edit SSH' : 'Tambah SSH'} — TA {tahun}</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Kode Barang</label>
            <KodefikasiPicker picked={picked} onPick={setPicked} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Spesifikasi (opsional)</label>
              <input className="select-filter w-full" value={spesifikasi} onChange={e => setSpesifikasi(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Satuan</label>
              <input list="ssh-satuan" className="select-filter w-full" value={satuan} onChange={e => setSatuan(e.target.value)} />
              <datalist id="ssh-satuan">{satuanList.map(s => <option key={s} value={s} />)}</datalist>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Harga Satuan (Rp)</label>
              <input type="number" required min={0} className="select-filter w-full" value={harga} onChange={e => setHarga(e.target.value)} />
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
              <th className="table-th">Spesifikasi</th>
              <th className="table-th">Satuan</th>
              <th className="table-th text-right">Harga (Rp)</th>
              <th className="table-th">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {loading ? (
              <tr><td colSpan={6} className="table-td text-center py-8 text-gray-400">Memuat...</td></tr>
            ) : list.length === 0 ? (
              <tr><td colSpan={6} className="table-td text-center py-8 text-gray-400">Belum ada SSH untuk TA {tahun}.</td></tr>
            ) : list.map(s => (
              <tr key={s.id}>
                <td className="table-td text-xs">{s.kode}</td>
                <td className="table-td text-xs text-gray-600 max-w-xs truncate" title={s.admin_kodefikasi_bmd?.uraian || ''}>{s.admin_kodefikasi_bmd?.uraian || '-'}</td>
                <td className="table-td text-xs text-gray-500">{s.spesifikasi || '—'}</td>
                <td className="table-td text-xs text-gray-500">{s.satuan || '—'}</td>
                <td className="table-td text-xs text-right">{formatRupiah(s.harga)}</td>
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
