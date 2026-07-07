'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import FormShell from '@/components/pengelolaan/FormShell'

type Satuan = { id: number; nama: string; keterangan: string | null }

export default function AdminSatuanPage() {
  const supabase = createClient()
  const [list, setList] = useState<Satuan[]>([])
  const [loading, setLoading] = useState(true)
  const [nama, setNama] = useState('')
  const [keterangan, setKeterangan] = useState('')
  const [editId, setEditId] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  async function load() {
    const { data } = await supabase.from('satuan_bmd').select('*').order('nama')
    setList(data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function openEdit(s: Satuan) {
    setEditId(s.id)
    setNama(s.nama)
    setKeterangan(s.keterangan || '')
  }

  function resetForm() {
    setEditId(null)
    setNama('')
    setKeterangan('')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setMsg('')

    const payload = { nama, keterangan: keterangan || null }
    const { error } = editId
      ? await supabase.from('satuan_bmd').update(payload).eq('id', editId)
      : await supabase.from('satuan_bmd').insert(payload)

    if (error) {
      setMsg(`Error: ${error.message}`)
    } else {
      setMsg(editId ? 'Satuan berhasil diperbarui.' : 'Satuan berhasil ditambahkan.')
      resetForm()
      load()
    }
    setSaving(false)
  }

  async function handleDelete(id: number, nm: string) {
    if (!confirm(`Hapus satuan "${nm}"?`)) return
    const { error } = await supabase.from('satuan_bmd').delete().eq('id', id)
    if (error) setMsg(`Error: ${error.message}`)
    load()
  }

  return (
    <FormShell judul="Daftar Satuan" deskripsi="Master satuan aset (Buah, Unit, Meter, dll.)" msg={msg}>
      <div className="card p-6 mb-6 max-w-xl">
        <h2 className="text-base font-semibold text-gray-800 mb-4">{editId ? 'Edit Satuan' : 'Tambah Satuan'}</h2>
        <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Nama Satuan</label>
            <input required className="select-filter w-full" value={nama} onChange={e => setNama(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Keterangan</label>
            <input className="select-filter w-full" value={keterangan} onChange={e => setKeterangan(e.target.value)} />
          </div>
          <div className="col-span-2 flex gap-2">
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? 'Menyimpan...' : editId ? 'Simpan Perubahan' : 'Tambah'}
            </button>
            {editId && <button type="button" onClick={resetForm} className="text-sm text-gray-500 hover:text-gray-700">Batal edit</button>}
          </div>
        </form>
      </div>

      <div className="card overflow-hidden max-w-xl">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="table-th">Nama</th>
              <th className="table-th">Keterangan</th>
              <th className="table-th">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {loading ? (
              <tr><td colSpan={3} className="table-td text-center py-8 text-gray-400">Memuat...</td></tr>
            ) : list.length === 0 ? (
              <tr><td colSpan={3} className="table-td text-center py-8 text-gray-400">Belum ada satuan.</td></tr>
            ) : list.map(s => (
              <tr key={s.id}>
                <td className="table-td font-medium text-sm">{s.nama}</td>
                <td className="table-td text-xs text-gray-500">{s.keterangan || '—'}</td>
                <td className="table-td">
                  <button onClick={() => openEdit(s)} className="text-teal hover:underline text-xs font-medium mr-3">Edit</button>
                  <button onClick={() => handleDelete(s.id, s.nama)} className="text-red-500 hover:text-red-700 text-xs font-medium">Hapus</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </FormShell>
  )
}
