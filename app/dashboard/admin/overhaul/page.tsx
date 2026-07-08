'use client'
import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import FormShell from '@/components/pengelolaan/FormShell'

type Band = {
  id: number
  kode_prefix: string
  uraian: string | null
  band_no: number
  label: string | null
  pct_min: number
  pct_max: number | null
  tambahan_tahun: number
}

const FORM_KOSONG = {
  kode_prefix: '', uraian: '', band_no: '', label: '', pct_min: '', pct_max: '', tambahan_tahun: '',
}

export default function AdminOverhaulPage() {
  const supabase = createClient()
  const [rows, setRows] = useState<Band[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [savingId, setSavingId] = useState<number | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(FORM_KOSONG)
  const [msg, setMsg] = useState('')

  async function load() {
    const rowsAll: Band[] = []
    for (let from = 0; ; from += 1000) {
      const { data } = await supabase.from('admin_overhaul_band').select('*')
        .order('kode_prefix').order('band_no').range(from, from + 999)
      if (!data || data.length === 0) break
      rowsAll.push(...(data as Band[]))
      if (data.length < 1000) break
    }
    setRows(rowsAll)
    setLoading(false)
  }

  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(r => r.kode_prefix.toLowerCase().includes(q) || (r.uraian || '').toLowerCase().includes(q))
  }, [rows, search])

  function updateRow(id: number, patch: Partial<Band>) {
    setRows(rs => rs.map(r => (r.id === id ? { ...r, ...patch } : r)))
  }

  async function handleSave(row: Band) {
    setSavingId(row.id)
    setMsg('')
    const { error } = await supabase.from('admin_overhaul_band').update({
      uraian: row.uraian, label: row.label,
      pct_min: row.pct_min, pct_max: row.pct_max, tambahan_tahun: row.tambahan_tahun,
    }).eq('id', row.id)
    if (error) setMsg(`Error: ${error.message}`)
    else setMsg(`Band ${row.kode_prefix} #${row.band_no} disimpan.`)
    setSavingId(null)
  }

  async function handleDelete(row: Band) {
    if (!confirm(`Hapus band ${row.kode_prefix} #${row.band_no}?`)) return
    const { error } = await supabase.from('admin_overhaul_band').delete().eq('id', row.id)
    if (error) { setMsg(`Error: ${error.message}`); return }
    load()
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setMsg('')
    const { error } = await supabase.from('admin_overhaul_band').insert({
      kode_prefix: form.kode_prefix,
      uraian: form.uraian || null,
      band_no: Number(form.band_no),
      label: form.label || null,
      pct_min: Number(form.pct_min),
      pct_max: form.pct_max === '' ? null : Number(form.pct_max),
      tambahan_tahun: Number(form.tambahan_tahun),
    })
    if (error) { setMsg(`Error: ${error.message}`); return }
    setMsg('Band baru ditambahkan.')
    setForm(FORM_KOSONG)
    setShowForm(false)
    load()
  }

  return (
    <FormShell judul="Overhaul Band" deskripsi="Ambang persentase overhaul/kapitalisasi per kode aset — dipakai engine penyusutan" msg={msg}>
      <div className="flex items-center justify-between mb-4 gap-3">
        <input placeholder="Cari kode prefix / uraian..." className="select-filter flex-1 max-w-sm"
          value={search} onChange={e => setSearch(e.target.value)} />
        <button onClick={() => setShowForm(v => !v)} className="btn-primary flex-shrink-0">
          {showForm ? 'Batal' : '+ Tambah Band'}
        </button>
      </div>

      {showForm && (
        <div className="card p-6 mb-6">
          <h2 className="text-base font-semibold text-gray-800 mb-4">Tambah Band Baru</h2>
          <form onSubmit={handleCreate} className="grid grid-cols-4 gap-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Kode Prefix</label>
              <input required className="select-filter w-full" value={form.kode_prefix}
                onChange={e => setForm(f => ({ ...f, kode_prefix: e.target.value }))} />
            </div>
            <div className="col-span-2">
              <label className="block text-xs text-gray-500 mb-1">Uraian</label>
              <input className="select-filter w-full" value={form.uraian}
                onChange={e => setForm(f => ({ ...f, uraian: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Band No.</label>
              <input required type="number" className="select-filter w-full" value={form.band_no}
                onChange={e => setForm(f => ({ ...f, band_no: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Label</label>
              <input placeholder="mis. >30% - 45%" className="select-filter w-full" value={form.label}
                onChange={e => setForm(f => ({ ...f, label: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Pct Min (eksklusif)</label>
              <input required type="number" step="0.01" className="select-filter w-full" value={form.pct_min}
                onChange={e => setForm(f => ({ ...f, pct_min: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Pct Max (inklusif, kosong = tak terbatas)</label>
              <input type="number" step="0.01" className="select-filter w-full" value={form.pct_max}
                onChange={e => setForm(f => ({ ...f, pct_max: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Tambahan Tahun</label>
              <input required type="number" className="select-filter w-full" value={form.tambahan_tahun}
                onChange={e => setForm(f => ({ ...f, tambahan_tahun: e.target.value }))} />
            </div>
            <div className="col-span-4">
              <button type="submit" className="btn-primary">Simpan</button>
            </div>
          </form>
        </div>
      )}

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="table-th">Kode Prefix</th>
                <th className="table-th">Uraian</th>
                <th className="table-th">#</th>
                <th className="table-th">Label</th>
                <th className="table-th">Pct Min</th>
                <th className="table-th">Pct Max</th>
                <th className="table-th">+Tahun</th>
                <th className="table-th">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr><td colSpan={8} className="table-td text-center py-8 text-gray-400">Memuat...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={8} className="table-td text-center py-8 text-gray-400">Tidak ada hasil.</td></tr>
              ) : filtered.map(row => (
                <tr key={row.id}>
                  <td className="table-td text-xs font-mono">{row.kode_prefix}</td>
                  <td className="table-td">
                    <input className="select-filter text-xs py-1 w-full" value={row.uraian || ''}
                      onChange={e => updateRow(row.id, { uraian: e.target.value })} />
                  </td>
                  <td className="table-td text-xs text-gray-400">{row.band_no}</td>
                  <td className="table-td">
                    <input className="select-filter text-xs py-1 w-32" value={row.label || ''}
                      onChange={e => updateRow(row.id, { label: e.target.value })} />
                  </td>
                  <td className="table-td">
                    <input type="number" step="0.01" className="select-filter text-xs py-1 w-20" value={row.pct_min}
                      onChange={e => updateRow(row.id, { pct_min: Number(e.target.value) })} />
                  </td>
                  <td className="table-td">
                    <input type="number" step="0.01" className="select-filter text-xs py-1 w-20" value={row.pct_max ?? ''}
                      onChange={e => updateRow(row.id, { pct_max: e.target.value === '' ? null : Number(e.target.value) })} />
                  </td>
                  <td className="table-td">
                    <input type="number" className="select-filter text-xs py-1 w-16" value={row.tambahan_tahun}
                      onChange={e => updateRow(row.id, { tambahan_tahun: Number(e.target.value) })} />
                  </td>
                  <td className="table-td whitespace-nowrap">
                    <button disabled={savingId === row.id} onClick={() => handleSave(row)}
                      className="text-teal hover:underline text-xs font-medium mr-3">
                      {savingId === row.id ? 'Menyimpan...' : 'Simpan'}
                    </button>
                    <button onClick={() => handleDelete(row)} className="text-red-500 hover:text-red-700 text-xs font-medium">Hapus</button>
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
