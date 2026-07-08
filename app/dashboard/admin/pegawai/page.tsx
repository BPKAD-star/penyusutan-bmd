'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import FormShell from '@/components/pengelolaan/FormShell'

type Pegawai = {
  id: string
  nip: string
  nama: string
  pangkat: string | null
  golongan: string | null
  jabatan: string | null
  role_bmd: string
  skpd_id: number | null
  skpd: { nama: string } | null
}

const ROLE_BMD = [
  { value: 'pengguna_barang', label: 'Pengguna Barang' },
  { value: 'kuasa_pengguna_barang', label: 'Kuasa Pengguna Barang' },
  { value: 'pengurus_barang', label: 'Pengurus Barang' },
  { value: 'pembantu_pengurus_barang', label: 'Pembantu Pengurus Barang' },
  { value: 'penyimpan_barang', label: 'Penyimpan Barang' },
]

const FORM_KOSONG = {
  nip: '', nama: '', pangkat: '', golongan: '', jabatan: '',
  role_bmd: 'pengurus_barang', skpd_id: '' as number | '',
}

export default function AdminPegawaiPage() {
  const supabase = createClient()
  const [list, setList] = useState<Pegawai[]>([])
  const [skpdList, setSkpdList] = useState<{ id: number; nama: string; level: number }[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState(FORM_KOSONG)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  async function load() {
    const { data } = await supabase.from('admin_pegawai').select('*,skpd:admin_skpd(nama)').order('nama')
    setList((data as never as Pegawai[]) || [])
    setLoading(false)
  }

  useEffect(() => {
    load()
    supabase.from('admin_skpd').select('id,nama,level').order('nama').limit(1000)
      .then(({ data }) => setSkpdList(data || []))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function openCreate() {
    setEditId(null)
    setForm(FORM_KOSONG)
    setShowForm(true)
  }

  function openEdit(p: Pegawai) {
    setEditId(p.id)
    setForm({
      nip: p.nip, nama: p.nama, pangkat: p.pangkat || '', golongan: p.golongan || '',
      jabatan: p.jabatan || '', role_bmd: p.role_bmd, skpd_id: p.skpd_id ?? '',
    })
    setShowForm(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setMsg('')

    const payload = {
      nip: form.nip, nama: form.nama,
      pangkat: form.pangkat || null, golongan: form.golongan || null, jabatan: form.jabatan || null,
      role_bmd: form.role_bmd, skpd_id: form.skpd_id || null,
    }

    const { error } = editId
      ? await supabase.from('admin_pegawai').update(payload).eq('id', editId)
      : await supabase.from('admin_pegawai').insert(payload)

    if (error) {
      setMsg(`Error: ${error.message}`)
    } else {
      setMsg(editId ? 'Pegawai berhasil diperbarui.' : 'Pegawai berhasil ditambahkan.')
      setShowForm(false)
      setForm(FORM_KOSONG)
      setEditId(null)
      load()
    }
    setSaving(false)
  }

  async function handleDelete(id: string, nama: string) {
    if (!confirm(`Hapus data pegawai ${nama}? Akun login (kalau ada) tidak ikut terhapus.`)) return
    const { error } = await supabase.from('admin_pegawai').delete().eq('id', id)
    if (error) setMsg(`Error: ${error.message}`)
    load()
  }

  return (
    <FormShell judul="Daftar Pegawai" deskripsi="Master data pegawai — jadi sumber saat membuat akun di Daftar User" msg={msg}>
      <div className="flex justify-end mb-4">
        <button onClick={() => (showForm ? setShowForm(false) : openCreate())} className="btn-primary">
          {showForm ? 'Batal' : '+ Tambah Pegawai'}
        </button>
      </div>

      {showForm && (
        <div className="card p-6 mb-6">
          <h2 className="text-base font-semibold text-gray-800 mb-4">{editId ? 'Edit Pegawai' : 'Tambah Pegawai Baru'}</h2>
          <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">NIP</label>
              <input required className="select-filter w-full" value={form.nip}
                onChange={e => setForm(f => ({ ...f, nip: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Nama Lengkap</label>
              <input required className="select-filter w-full" value={form.nama}
                onChange={e => setForm(f => ({ ...f, nama: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Pangkat</label>
              <input className="select-filter w-full" value={form.pangkat}
                onChange={e => setForm(f => ({ ...f, pangkat: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Golongan</label>
              <input className="select-filter w-full" value={form.golongan}
                onChange={e => setForm(f => ({ ...f, golongan: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Jabatan</label>
              <input className="select-filter w-full" value={form.jabatan}
                onChange={e => setForm(f => ({ ...f, jabatan: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Role BMD</label>
              <select className="select-filter w-full" value={form.role_bmd}
                onChange={e => setForm(f => ({ ...f, role_bmd: e.target.value }))}>
                {ROLE_BMD.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-xs text-gray-500 mb-1">SKPD</label>
              <select className="select-filter w-full" value={form.skpd_id}
                onChange={e => setForm(f => ({ ...f, skpd_id: e.target.value ? Number(e.target.value) : '' }))}>
                <option value="">— tanpa SKPD —</option>
                {skpdList.map(s => <option key={s.id} value={s.id}>{'—'.repeat(s.level - 1)} {s.nama}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <button type="submit" disabled={saving} className="btn-primary">
                {saving ? 'Menyimpan...' : 'Simpan'}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="table-th">Nama / NIP</th>
                <th className="table-th">Pangkat / Golongan</th>
                <th className="table-th">Jabatan</th>
                <th className="table-th">Role BMD</th>
                <th className="table-th">SKPD</th>
                <th className="table-th">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr><td colSpan={6} className="table-td text-center py-8 text-gray-400">Memuat...</td></tr>
              ) : list.length === 0 ? (
                <tr><td colSpan={6} className="table-td text-center py-8 text-gray-400">Belum ada pegawai.</td></tr>
              ) : list.map(p => (
                <tr key={p.id}>
                  <td className="table-td">
                    <p className="font-medium text-sm">{p.nama}</p>
                    <p className="text-xs text-gray-400">{p.nip}</p>
                  </td>
                  <td className="table-td text-xs text-gray-500">{[p.pangkat, p.golongan].filter(Boolean).join(' / ') || '—'}</td>
                  <td className="table-td text-xs text-gray-500">{p.jabatan || '—'}</td>
                  <td className="table-td text-xs text-gray-500">{ROLE_BMD.find(r => r.value === p.role_bmd)?.label || p.role_bmd}</td>
                  <td className="table-td text-xs text-gray-500">{p.skpd?.nama || '—'}</td>
                  <td className="table-td">
                    <button onClick={() => openEdit(p)} className="text-teal hover:underline text-xs font-medium mr-3">Edit</button>
                    <button onClick={() => handleDelete(p.id, p.nama)} className="text-red-500 hover:text-red-700 text-xs font-medium">Hapus</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </FormShell>
  )
}
