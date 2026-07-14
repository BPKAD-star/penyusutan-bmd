'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ROLE_LABEL, ROLE_VALUES } from '@/lib/roles'

type Profile = {
  id: string
  email: string
  username: string | null
  role: string
  skpd_id: number | null
  ipa_role: string | null
  created_at: string
  skpd: { nama: string } | null
  pegawai: { nama: string; nip: string; jabatan: string | null } | null
}

const LABEL_IPA_ROLE: Record<string, string> = {
  pb_admin: 'Pengurus Barang', bkad_verifier: 'Verifikator BKAD', bkad_admin: 'Admin BKAD',
}

type Pegawai = { id: string; nip: string; nama: string; jabatan: string | null }

const FORM_KOSONG = {
  email: '', password: '', username: '', role: 'pengurus_pembantu', pegawai_id: '',
}

export default function AdminUserPage() {
  const supabase = createClient()
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [skpdList, setSkpdList] = useState<{ id: number; nama: string; level: number }[]>([])
  const [pegawaiList, setPegawaiList] = useState<Pegawai[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(FORM_KOSONG)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  async function loadProfiles() {
    const { data } = await supabase.from('admin_profiles').select('*,skpd:admin_skpd(nama),pegawai:admin_pegawai(nama,nip,jabatan)').order('created_at')
    setProfiles((data as never as Profile[]) || [])
    setLoading(false)
  }

  useEffect(() => {
    loadProfiles()
    supabase.from('admin_skpd').select('id,nama,level').order('nama').limit(1000)
      .then(({ data }) => setSkpdList(data || []))
    supabase.from('admin_pegawai').select('id,nip,nama,jabatan').order('nama').limit(1000)
      .then(({ data }) => setPegawaiList(data || []))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

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
      setForm(FORM_KOSONG)
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
    await supabase.from('admin_profiles').update({ role }).eq('id', id)
    loadProfiles()
  }

  async function handleChangeSkpd(id: string, skpdId: string) {
    await supabase.from('admin_profiles').update({ skpd_id: skpdId ? Number(skpdId) : null }).eq('id', id)
    loadProfiles()
  }

  async function handleChangeIpaRole(id: string, ipaRole: string) {
    await supabase.from('admin_profiles').update({ ipa_role: ipaRole || null }).eq('id', id)
    loadProfiles()
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Daftar User</h1>
          <p className="text-gray-500 text-sm mt-1">Akun login dibuat dari data pegawai yang sudah ada di Daftar Pegawai</p>
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

      {showForm && (
        <div className="card p-6 mb-6">
          <h2 className="text-base font-semibold text-gray-800 mb-4">Tambah User Baru</h2>
          <form onSubmit={handleCreate} className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-xs text-gray-500 mb-1">Pegawai (NIP — Nama — Jabatan)</label>
              <select required className="select-filter w-full" value={form.pegawai_id}
                onChange={e => setForm(f => ({ ...f, pegawai_id: e.target.value }))}>
                <option value="">— pilih pegawai —</option>
                {pegawaiList.map(p => (
                  <option key={p.id} value={p.id}>{p.nip} — {p.nama}{p.jabatan ? ` — ${p.jabatan}` : ''}</option>
                ))}
              </select>
              <p className="text-xs text-gray-400 mt-1">Belum ada di daftar? Tambahkan dulu di menu Daftar Pegawai.</p>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Username</label>
              <input required className="select-filter w-full" value={form.username}
                onChange={e => setForm(f => ({ ...f, username: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Username / Email (untuk login)</label>
              <input required className="select-filter w-full" value={form.email}
                placeholder="mis. pengurusadimas atau nama@email.com"
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
              <p className="text-xs text-gray-400 mt-1">Boleh username bebas (tanpa @) atau email asli.</p>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Password</label>
              <div className="relative">
                <input type={showPassword ? 'text' : 'password'} required minLength={6}
                  className="select-filter w-full pr-9" value={form.password}
                  onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />
                <button type="button" onClick={() => setShowPassword(v => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  title={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}>
                  {showPassword ? (
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a21.8 21.8 0 0 1 5.06-6.06M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a21.8 21.8 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Role</label>
              <select className="select-filter w-full" value={form.role}
                onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
                {ROLE_VALUES.map(r => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
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

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="table-th">Nama / NIP</th>
                <th className="table-th">Email</th>
                <th className="table-th">SKPD</th>
                <th className="table-th">Role</th>
                <th className="table-th">Role IPA</th>
                <th className="table-th">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr><td colSpan={6} className="table-td text-center py-8 text-gray-400">Memuat...</td></tr>
              ) : profiles.map(p => (
                <tr key={p.id}>
                  <td className="table-td">
                    <p className="font-medium text-sm">{p.pegawai?.nama || '—'}</p>
                    <p className="text-xs text-gray-400">
                      {p.pegawai?.nip || 'NIP -'}{p.pegawai?.jabatan ? ` · ${p.pegawai.jabatan}` : ''}
                    </p>
                  </td>
                  <td className="table-td text-gray-500 text-xs">{p.email}<br />
                    <span className="text-gray-400">{p.username || ''}</span>
                  </td>
                  <td className="table-td">
                    <select className="select-filter text-xs py-1 max-w-[220px]"
                      value={p.skpd_id ?? ''}
                      onChange={e => handleChangeSkpd(p.id, e.target.value)}>
                      <option value="">— tanpa SKPD —</option>
                      {skpdList.map(s => <option key={s.id} value={s.id}>{s.nama}</option>)}
                    </select>
                  </td>
                  <td className="table-td">
                    <select className="select-filter text-xs py-1" value={p.role}
                      onChange={e => handleChangeRole(p.id, e.target.value)}>
                      {ROLE_VALUES.map(r => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                    </select>
                  </td>
                  <td className="table-td">
                    <select className="select-filter text-xs py-1" value={p.ipa_role ?? ''}
                      onChange={e => handleChangeIpaRole(p.id, e.target.value)}>
                      <option value="">— tidak ikut —</option>
                      {Object.entries(LABEL_IPA_ROLE).map(([v, label]) => <option key={v} value={v}>{label}</option>)}
                    </select>
                  </td>
                  <td className="table-td">
                    <button onClick={() => handleDelete(p.id, p.email)}
                      className="text-red-500 hover:text-red-700 text-xs font-medium">
                      Hapus
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
