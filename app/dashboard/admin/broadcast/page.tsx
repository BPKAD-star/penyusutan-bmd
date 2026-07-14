'use client'
// Kelola broadcast/pengumuman (admin/Pengelola Barang). Tulis ditegakkan RLS
// fn_is_admin() — non-admin yg buka URL ini langsung akan gagal saat simpan.
// Toggle `aktif` per baris = tombol ON/OFF; popup di BroadcastPopup menampilkan
// yang aktif ke pengurus_barang & pengurus_pembantu.
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import FormShell from '@/components/pengelolaan/FormShell'

type Broadcast = {
  id: string
  judul: string
  isi: string
  aktif: boolean
  updated_at: string
}

const FORM_KOSONG = { judul: '', isi: '' }

const fmtTgl = (s: string) =>
  new Date(s).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

export default function AdminBroadcastPage() {
  const supabase = createClient()
  const [list, setList] = useState<Broadcast[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState(FORM_KOSONG)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  async function load() {
    const { data } = await supabase
      .from('admin_broadcast')
      .select('id,judul,isi,aktif,updated_at')
      .order('updated_at', { ascending: false })
    setList((data as Broadcast[]) || [])
    setLoading(false)
  }

  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function openCreate() {
    setEditId(null)
    setForm(FORM_KOSONG)
    setShowForm(true)
  }

  function openEdit(b: Broadcast) {
    setEditId(b.id)
    setForm({ judul: b.judul, isi: b.isi })
    setShowForm(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setMsg('')

    const payload = { judul: form.judul.trim(), isi: form.isi.trim() }
    const { data: { user } } = await supabase.auth.getUser()

    const { error } = editId
      ? await supabase.from('admin_broadcast').update(payload).eq('id', editId)
      : await supabase.from('admin_broadcast').insert({ ...payload, aktif: false, dibuat_oleh: user?.id ?? null })

    if (error) {
      setMsg(`Error: ${error.message}`)
    } else {
      setMsg(editId
        ? 'Pengumuman diperbarui. Jika aktif, popup akan muncul lagi ke pengguna (isi berubah).'
        : 'Pengumuman dibuat sebagai draft (OFF). Nyalakan tombol untuk mulai broadcast.')
      setShowForm(false)
      setForm(FORM_KOSONG)
      setEditId(null)
      load()
    }
    setSaving(false)
  }

  async function toggleAktif(b: Broadcast) {
    setMsg('')
    const { error } = await supabase.from('admin_broadcast').update({ aktif: !b.aktif }).eq('id', b.id)
    if (error) setMsg(`Error: ${error.message}`)
    else setMsg(!b.aktif ? `Broadcast "${b.judul}" DINYALAKAN — popup tampil ke pengurus barang.` : `Broadcast "${b.judul}" dimatikan.`)
    load()
  }

  async function handleDelete(id: string, judul: string) {
    if (!confirm(`Hapus pengumuman "${judul}"? Tidak bisa dikembalikan.`)) return
    const { error } = await supabase.from('admin_broadcast').delete().eq('id', id)
    if (error) setMsg(`Error: ${error.message}`)
    load()
  }

  return (
    <FormShell
      judul="Broadcast Pengumuman"
      deskripsi="Kirim pengumuman pop-up ke Pengurus Barang & Pengurus Barang Pembantu saat mereka masuk platform"
      msg={msg}
    >
      <div className="flex justify-end mb-4">
        <button onClick={() => (showForm ? setShowForm(false) : openCreate())} className="btn-primary">
          {showForm ? 'Batal' : '+ Pengumuman Baru'}
        </button>
      </div>

      {showForm && (
        <div className="card p-6 mb-6">
          <h2 className="text-base font-semibold text-gray-800 mb-4">{editId ? 'Edit Pengumuman' : 'Pengumuman Baru'}</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Judul</label>
              <input required className="select-filter w-full" value={form.judul}
                onChange={e => setForm(f => ({ ...f, judul: e.target.value }))}
                placeholder="mis. Batas Waktu Input Pengadaan Semester I" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Isi Pengumuman</label>
              <textarea required rows={5} className="select-filter w-full" value={form.isi}
                onChange={e => setForm(f => ({ ...f, isi: e.target.value }))}
                placeholder="Tulis informasi yang ingin disampaikan..." />
              <p className="text-xs text-gray-400 mt-1">Baris baru dipertahankan apa adanya di popup.</p>
            </div>
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? 'Menyimpan...' : 'Simpan'}
            </button>
          </form>
        </div>
      )}

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="table-th">Status</th>
                <th className="table-th">Judul / Isi</th>
                <th className="table-th">Terakhir Diubah</th>
                <th className="table-th">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr><td colSpan={4} className="table-td text-center py-8 text-gray-400">Memuat...</td></tr>
              ) : list.length === 0 ? (
                <tr><td colSpan={4} className="table-td text-center py-8 text-gray-400">Belum ada pengumuman.</td></tr>
              ) : list.map(b => (
                <tr key={b.id} className={b.aktif ? 'bg-teal/5' : ''}>
                  <td className="table-td">
                    <button
                      onClick={() => toggleAktif(b)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${b.aktif ? 'bg-teal' : 'bg-gray-300'}`}
                      title={b.aktif ? 'Broadcast aktif — klik untuk matikan' : 'Broadcast mati — klik untuk nyalakan'}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${b.aktif ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                    <p className={`text-[10px] font-semibold mt-1 ${b.aktif ? 'text-teal' : 'text-gray-400'}`}>{b.aktif ? 'ON' : 'OFF'}</p>
                  </td>
                  <td className="table-td max-w-md">
                    <p className="font-medium text-sm">{b.judul}</p>
                    <p className="text-xs text-gray-400 line-clamp-2 whitespace-pre-wrap">{b.isi}</p>
                  </td>
                  <td className="table-td text-xs text-gray-500">{fmtTgl(b.updated_at)}</td>
                  <td className="table-td">
                    <button onClick={() => openEdit(b)} className="text-teal hover:underline text-xs font-medium mr-3">Edit</button>
                    <button onClick={() => handleDelete(b.id, b.judul)} className="text-red-500 hover:text-red-700 text-xs font-medium">Hapus</button>
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
