'use client'
import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import FormShell from '@/components/pengelolaan/FormShell'
import { useKonfirmasi } from '@/shared/ui/konfirmasi'

type Skpd = { id: number; nama: string; level: number; parent_id: number | null; kode_skpd: string | null; alamat: string | null }

const FORM_KOSONG = { nama: '', kode_skpd: '', parent_id: '' as number | '', alamat: '' }

// Urutan sibling: by Kode SKPD (bukan alfabetis nama) — kode sudah zero-padded
// per segmen (mis. "02.00.00.0003.0000") jadi localeCompare string = urutan
// numerik yg benar. SKPD tanpa kode (belum diisi) ditaruh paling akhir, urut nama.
function compareSkpd(a: Skpd, b: Skpd): number {
  if (a.kode_skpd == null && b.kode_skpd == null) return a.nama.localeCompare(b.nama)
  if (a.kode_skpd == null) return 1
  if (b.kode_skpd == null) return -1
  return a.kode_skpd.localeCompare(b.kode_skpd) || a.nama.localeCompare(b.nama)
}

export default function AdminSkpdPage() {
  const supabase = createClient()
  const konfirmasi = useKonfirmasi()
  const [all, setAll] = useState<Skpd[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [form, setForm] = useState(FORM_KOSONG)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  async function load() {
    const rows: Skpd[] = []
    for (let from = 0; ; from += 1000) {
      const { data } = await supabase.from('admin_skpd').select('id,nama,level,parent_id,kode_skpd,alamat').range(from, from + 999)
      if (!data || data.length === 0) break
      rows.push(...(data as Skpd[]))
      if (data.length < 1000) break
    }
    setAll(rows)
    setLoading(false)
  }

  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const childrenOf = useMemo(() => {
    const m = new Map<number, Skpd[]>()
    for (const s of all) {
      if (s.parent_id == null) continue
      const arr = m.get(s.parent_id) || []
      arr.push(s)
      m.set(s.parent_id, arr)
    }
    for (const arr of m.values()) arr.sort(compareSkpd)
    return m
  }, [all])

  const flatTree = useMemo(() => {
    const out: (Skpd & { depth: number })[] = []
    const roots = all.filter(s => s.parent_id == null).sort(compareSkpd)
    function walk(node: Skpd, depth: number) {
      out.push({ ...node, depth })
      for (const c of childrenOf.get(node.id) || []) walk(c, depth + 1)
    }
    for (const r of roots) walk(r, 0)
    return out
  }, [all, childrenOf])

  function isDescendantOrSelf(candidateParentId: number, nodeId: number): boolean {
    if (candidateParentId === nodeId) return true
    for (const c of childrenOf.get(nodeId) || []) {
      if (isDescendantOrSelf(candidateParentId, c.id)) return true
    }
    return false
  }

  function openCreate(parentId: number | null) {
    setEditId(null)
    setForm({ nama: '', kode_skpd: '', parent_id: parentId ?? '', alamat: '' })
    setShowForm(true)
  }

  function openEdit(s: Skpd) {
    setEditId(s.id)
    setForm({ nama: s.nama, kode_skpd: s.kode_skpd || '', parent_id: s.parent_id ?? '', alamat: s.alamat || '' })
    setShowForm(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setMsg('')

    if (editId && form.parent_id !== '' && isDescendantOrSelf(Number(form.parent_id), editId)) {
      setMsg('Error: SKPD tidak boleh dipindah jadi anak dari dirinya sendiri / turunannya.')
      setSaving(false)
      return
    }

    const parentId = form.parent_id === '' ? null : Number(form.parent_id)
    const alamat = form.alamat.trim() || null
    // Kode SKPD TIDAK ikut payload UPDATE (permintaan user 2026-09-10) —
    // dipakai generate NIBAR barang baru, jadi kolom paling berisiko diedit
    // asal. Form-nya sendiri sudah mengunci inputnya (disabled saat editId),
    // ini lapis kedua: sekalipun state form kebawa nilai lama, INSERT baru
    // yang boleh menuliskannya, bukan UPDATE. Dua pemanggilan terpisah
    // (bukan satu `payload` bersama) supaya TypeScript tak menyatukannya jadi
    // union — union bikin overload `.update()`/`.insert()` supabase-js gagal
    // disimpulkan.
    const { error } = editId
      ? await supabase.from('admin_skpd').update({ nama: form.nama, parent_id: parentId, alamat }).eq('id', editId)
      : await supabase.from('admin_skpd').insert({ nama: form.nama, kode_skpd: form.kode_skpd.trim() || null, parent_id: parentId, alamat })

    if (error) {
      setMsg(`Error: ${error.message}`)
    } else {
      setMsg(editId ? 'SKPD berhasil diperbarui.' : 'SKPD berhasil ditambahkan.')
      setShowForm(false)
      setForm(FORM_KOSONG)
      setEditId(null)
      load()
    }
    setSaving(false)
  }

  async function handleDelete(s: Skpd) {
    if ((childrenOf.get(s.id) || []).length > 0) {
      setMsg(`Error: ${s.nama} masih punya sub-unit, pindahkan/hapus dulu sub-unitnya.`)
      return
    }
    if (!(await konfirmasi({
      nada: 'merah', ikon: '🗑', judul: 'Hapus SKPD ini?',
      subjudul: s.nama,
      isi: <>Unit ini hilang dari seluruh pemilih SKPD di aplikasi.</>,
      peringatan: <>Kalau masih ada <b>aset, pegawai, atau user</b> yang terkait, database akan
        MENOLAK penghapusan ini — pindahkan dulu semuanya.</>,
      labelYa: 'Hapus SKPD',
    })).ya) return
    const { error } = await supabase.from('admin_skpd').delete().eq('id', s.id)
    if (error) setMsg(`Error: ${error.message}`)
    else load()
  }

  return (
    <FormShell judul="SKPD" deskripsi="Struktur organisasi SKPD / Sub OPD — dipakai untuk akses data per unit" msg={msg}>
      <div className="flex justify-end mb-4">
        <button onClick={() => (showForm ? setShowForm(false) : openCreate(null))} className="btn-primary">
          {showForm ? 'Batal' : '+ Tambah SKPD'}
        </button>
      </div>

      {showForm && (
        <div className="card p-6 mb-6 max-w-lg">
          <h2 className="text-base font-semibold text-gray-800 mb-4">{editId ? 'Edit SKPD' : 'Tambah SKPD Baru'}</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Nama</label>
              <input required className="select-filter w-full" value={form.nama}
                onChange={e => setForm(f => ({ ...f, nama: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Kode SKPD</label>
              <input className="select-filter w-full disabled:bg-gray-100 disabled:text-gray-400"
                placeholder="mis. 01.02.03.4567.8901" value={form.kode_skpd} disabled={!!editId}
                onChange={e => setForm(f => ({ ...f, kode_skpd: e.target.value }))} />
              {editId ? (
                <p className="text-xs text-gray-400 mt-1">
                  Terkunci — dipakai generate NIBAR barang baru, jadi tak bisa diubah dari sini
                  supaya barang lama tak ikut tak sinkron.
                </p>
              ) : (
                <p className="text-xs text-amber-600 mt-1">Hati-hati: dipakai buat generate NIBAR barang baru (Pengadaan/PerolehanManual).</p>
              )}
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Induk (Parent)</label>
              <select className="select-filter w-full" value={form.parent_id}
                onChange={e => setForm(f => ({ ...f, parent_id: e.target.value ? Number(e.target.value) : '' }))}>
                <option value="">— tanpa induk (root / SKPD utama) —</option>
                {flatTree.filter(s => s.id !== editId).map(s => (
                  <option key={s.id} value={s.id}>{'—'.repeat(s.depth)} {s.nama}</option>
                ))}
              </select>
              <p className="text-xs text-gray-400 mt-1">Level & path dihitung otomatis dari induk yang dipilih.</p>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Alamat</label>
              <textarea className="select-filter w-full" rows={2} value={form.alamat}
                onChange={e => setForm(f => ({ ...f, alamat: e.target.value }))} />
              <p className="text-xs text-gray-400 mt-1">
                Dipakai KIBAR (I.4 Alamat). Kosongkan kalau belum tahu — kartu akan
                memakai alamat induk terdekat yang sudah diisi, bukan menampilkan kosong.
              </p>
            </div>
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? 'Menyimpan...' : 'Simpan'}
            </button>
          </form>
        </div>
      )}

      <div className="card overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="table-th">Kode SKPD</th>
              <th className="table-th">Nama</th>
              <th className="table-th">Level</th>
              <th className="table-th">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {loading ? (
              <tr><td colSpan={4} className="table-td text-center py-8 text-gray-400">Memuat...</td></tr>
            ) : flatTree.length === 0 ? (
              <tr><td colSpan={4} className="table-td text-center py-8 text-gray-400">Belum ada SKPD.</td></tr>
            ) : flatTree.map(s => (
              <tr key={s.id}>
                <td className="table-td text-xs text-gray-500">{s.kode_skpd || '-'}</td>
                <td className="table-td text-sm" style={{ paddingLeft: `${1 + s.depth * 1.25}rem` }}>{s.nama}</td>
                <td className="table-td text-xs text-gray-400">{s.level}</td>
                <td className="table-td whitespace-nowrap">
                  <button onClick={() => openCreate(s.id)} className="text-teal hover:underline text-xs font-medium mr-3">+ Sub-unit</button>
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
