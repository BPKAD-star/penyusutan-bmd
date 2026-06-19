'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type Profile = {
  id: string
  email: string
  nama: string
  role: string
  created_at: string
}

export default function AdminPage() {
  const supabase = createClient()
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ email: '', password: '', nama: '', role: 'user' })
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  async function loadProfiles() {
    const { data } = await supabase.from('profiles').select('*').order('created_at')
    setProfiles(data || [])
    setLoading(false)
  }

  useEffect(() => { loadProfiles() }, [])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setMsg('')

    const res = await fetch('/api/admin/create-user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    const json = await res.json()

    if (json.error) {
      setMsg(`Error: ${json.error}`)
    } else {
      setMsg('User berhasil dibuat.')
      setForm({ email: '', password: '', nama: '', role: 'user' })
      setShowForm(false)
      loadProfiles()
    }
    setSaving(false)
  }

  async function handleDelete(id: string, email: string) {
    if (!confirm(`Hapus user ${email}?`)) return
    await fetch('/api/admin/delete-user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    loadProfiles()
  }

  async function handleChangeRole(id: string, role: string) {
    await supabase.from('profiles').update({ role }).eq('id', id)
    loadProfiles()
  }

  return (
    <div className="p-6 max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Manajemen User</h1>
          <p className="text-gray-500 text-sm mt-1">Kelola akses pengguna sistem</p>
        </div>
        <button onClick={() => setShowForm(v => !v)} className="btn-primary">
          {showForm ? 'Batal' : '+ Tambah User'}
        </button>
      </div>

      {msg && (
        <div className={`mb-4 p-3 rounded-lg text-sm ${msg.startsWith('Error') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
          {msg}
        </div>
      )}

      {/* Form tambah user */}
      {showForm && (
        <div className="card p-6 mb-6">
          <h2 className="text-base font-semibold text-gray-800 mb-4">Tambah User Baru</h2>
          <form onSubmit={handleCreate} className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Nama Lengkap</label>
              <input required className="select-filter w-full" value={form.nama}
                onChange={e => setForm(f => ({ ...f, nama: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Email</label>
              <input type="email" required className="select-filter w-full" value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Password</label>
              <input type="password" required minLength={6} className="select-filter w-full" value={form.password}
                onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Role</label>
              <select className="select-filter w-full" value={form.role}
                onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
                <option value="user">User</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <div className="col-span-2">
              <button type="submit" disabled={saving} className="btn-primary">
                {saving ? 'Menyimpan...' : 'Simpan User'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Table */}
      <div className="card overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="table-th">Nama</th>
              <th className="table-th">Email</th>
              <th className="table-th">Role</th>
              <th className="table-th">Dibuat</th>
              <th className="table-th">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {loading ? (
              <tr><td colSpan={5} className="table-td text-center py-8 text-gray-400">Memuat...</td></tr>
            ) : profiles.map(p => (
              <tr key={p.id}>
                <td className="table-td font-medium">{p.nama}</td>
                <td className="table-td text-gray-500">{p.email}</td>
                <td className="table-td">
                  <select
                    className="select-filter text-xs py-1"
                    value={p.role}
                    onChange={e => handleChangeRole(p.id, e.target.value)}
                  >
                    <option value="user">User</option>
                    <option value="admin">Admin</option>
                  </select>
                </td>
                <td className="table-td text-gray-400 text-xs">
                  {new Date(p.created_at).toLocaleDateString('id-ID')}
                </td>
                <td className="table-td">
                  <button
                    onClick={() => handleDelete(p.id, p.email)}
                    className="text-red-500 hover:text-red-700 text-xs font-medium"
                  >
                    Hapus
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
