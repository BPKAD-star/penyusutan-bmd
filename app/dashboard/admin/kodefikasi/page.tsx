'use client'
import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import FormShell from '@/components/pengelolaan/FormShell'

type Kodefikasi = {
  kode: string
  uraian: string | null
  kode_jenis: string | null
  jenis_aset_id: number | null
  masa_manfaat_tahun: number | null
}

type JenisAset = { id: number; uraian: string }

export default function AdminKodefikasiPage() {
  const supabase = createClient()
  const [rows, setRows] = useState<Kodefikasi[]>([])
  const [jenisList, setJenisList] = useState<JenisAset[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [savingKode, setSavingKode] = useState<string | null>(null)
  const [msg, setMsg] = useState('')

  async function load() {
    const rowsAll: Kodefikasi[] = []
    for (let from = 0; ; from += 1000) {
      const { data } = await supabase.from('kodefikasi_bmd').select('*').order('kode').range(from, from + 999)
      if (!data || data.length === 0) break
      rowsAll.push(...(data as Kodefikasi[]))
      if (data.length < 1000) break
    }
    setRows(rowsAll)
    setLoading(false)
  }

  useEffect(() => {
    load()
    supabase.from('jenis_aset').select('id,uraian').order('uraian').then(({ data }) => setJenisList(data || []))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows.slice(0, 300)
    return rows.filter(r => r.kode.toLowerCase().includes(q) || (r.uraian || '').toLowerCase().includes(q)).slice(0, 300)
  }, [rows, search])

  function updateRow(kode: string, patch: Partial<Kodefikasi>) {
    setRows(rs => rs.map(r => (r.kode === kode ? { ...r, ...patch } : r)))
  }

  async function handleSave(row: Kodefikasi) {
    setSavingKode(row.kode)
    setMsg('')
    const { error } = await supabase.from('kodefikasi_bmd').update({
      jenis_aset_id: row.jenis_aset_id,
      masa_manfaat_tahun: row.masa_manfaat_tahun,
    }).eq('kode', row.kode)
    if (error) setMsg(`Error: ${error.message}`)
    else setMsg(`Kode ${row.kode} disimpan.`)
    setSavingKode(null)
  }

  return (
    <FormShell judul="Kodefikasi BMD" deskripsi="Kategori aset & masa manfaat — dipakai engine penyusutan, hati-hati mengubah jenis_aset" msg={msg}>
      <div className="mb-4">
        <input placeholder="Cari kode / uraian... (menampilkan maks. 300 hasil)" className="select-filter w-full max-w-md"
          value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="table-th">Kode</th>
                <th className="table-th">Uraian</th>
                <th className="table-th">Jenis Aset</th>
                <th className="table-th">Masa Manfaat (th)</th>
                <th className="table-th">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr><td colSpan={5} className="table-td text-center py-8 text-gray-400">Memuat...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={5} className="table-td text-center py-8 text-gray-400">Tidak ada hasil.</td></tr>
              ) : filtered.map(row => (
                <tr key={row.kode}>
                  <td className="table-td text-xs font-mono">{row.kode}</td>
                  <td className="table-td text-xs text-gray-600 max-w-xs truncate" title={row.uraian || ''}>{row.uraian}</td>
                  <td className="table-td">
                    <select className="select-filter text-xs py-1" value={row.jenis_aset_id ?? ''}
                      onChange={e => updateRow(row.kode, { jenis_aset_id: e.target.value ? Number(e.target.value) : null })}>
                      <option value="">— tanpa jenis —</option>
                      {jenisList.map(j => <option key={j.id} value={j.id}>{j.uraian}</option>)}
                    </select>
                  </td>
                  <td className="table-td">
                    <input type="number" className="select-filter text-xs py-1 w-20" value={row.masa_manfaat_tahun ?? ''}
                      onChange={e => updateRow(row.kode, { masa_manfaat_tahun: e.target.value === '' ? null : Number(e.target.value) })} />
                  </td>
                  <td className="table-td">
                    <button disabled={savingKode === row.kode} onClick={() => handleSave(row)}
                      className="text-teal hover:underline text-xs font-medium">
                      {savingKode === row.kode ? 'Menyimpan...' : 'Simpan'}
                    </button>
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
