'use client'
import { useEffect, useState } from 'react'
import * as XLSX from 'xlsx'
import { createClient } from '@/lib/supabase/client'
import FormShell from '@/components/pengelolaan/FormShell'
import SkpdCombobox from '@/components/SkpdCombobox'

type Pegawai = {
  id: string
  nip: string
  nama: string
  pangkat: string | null
  golongan: string | null
  jabatan: string | null
  jenis_kelamin: string | null
  role_bmd: string
  skpd_id: number | null
  skpd: { nama: string } | null
}

const ROLE_BMD = [
  { value: 'pengelola_barang', label: 'Pengelola Barang' },
  { value: 'penatausahaan_barang_pengelola', label: 'Penatausahaan Barang Pengelola' },
  { value: 'pengurus_barang_pengelola', label: 'Pengurus Barang Pengelola' },
  { value: 'pengguna_barang', label: 'Pengguna Barang' },
  { value: 'penatausahaan_barang_pengguna', label: 'Penatausahaan Barang Pengguna' },
  { value: 'pengurus_barang', label: 'Pengurus Barang' },
  { value: 'pembantu_pengurus_barang', label: 'Pembantu Pengurus Barang' },
  { value: 'kuasa_pengguna_barang', label: 'Kuasa Pengguna Barang' },
  { value: 'pengurus_barang_pembantu', label: 'Pengurus Barang Pembantu' },
]

// Pangkat & golongan/ruang PNS baku (PP 11/2017 jo. PP 99/2000). Pangkat
// otomatis mengikuti golongan yang dipilih — operator tidak isi manual lagi.
const GOLONGAN_PANGKAT: { golongan: string; pangkat: string }[] = [
  { golongan: 'I/a',   pangkat: 'Juru Muda' },
  { golongan: 'I/b',   pangkat: 'Juru Muda Tingkat I' },
  { golongan: 'I/c',   pangkat: 'Juru' },
  { golongan: 'I/d',   pangkat: 'Juru Tingkat I' },
  { golongan: 'II/a',  pangkat: 'Pengatur Muda' },
  { golongan: 'II/b',  pangkat: 'Pengatur Muda Tingkat I' },
  { golongan: 'II/c',  pangkat: 'Pengatur' },
  { golongan: 'II/d',  pangkat: 'Pengatur Tingkat I' },
  { golongan: 'III/a', pangkat: 'Penata Muda' },
  { golongan: 'III/b', pangkat: 'Penata Muda Tingkat I' },
  { golongan: 'III/c', pangkat: 'Penata' },
  { golongan: 'III/d', pangkat: 'Penata Tingkat I' },
  { golongan: 'IV/a',  pangkat: 'Pembina' },
  { golongan: 'IV/b',  pangkat: 'Pembina Tingkat I' },
  { golongan: 'IV/c',  pangkat: 'Pembina Utama Muda' },
  { golongan: 'IV/d',  pangkat: 'Pembina Utama Madya' },
  { golongan: 'IV/e',  pangkat: 'Pembina Utama' },
]
const pangkatDariGolongan = (g: string) => GOLONGAN_PANGKAT.find(x => x.golongan === g)?.pangkat || ''

// Golongan PPPK (angka Romawi, tanpa pangkat gaya PNS). Disimpan apa adanya di
// kolom `golongan`; `pangkat` dikosongkan untuk PPPK. Tidak bentrok dgn golongan
// PNS karena PNS selalu ber-format "X/y" (ada garis miring).
const GOLONGAN_PPPK = ['I', 'IV', 'V', 'VI', 'VII', 'IX', 'X', 'XI']
const isGolonganPppk = (g: string) => GOLONGAN_PPPK.includes(g.trim())

// Data lama boleh tersimpan format bebas (mis. "III-b", "iv/e") — normalisasi
// supaya tetap kepilih di dropdown saat Edit.
function normalisasiGolongan(g: string): string {
  const m = g.trim().match(/^(I|II|III|IV)[\s/-]?([a-eA-E])$/)
  return m ? `${m[1]}/${m[2].toLowerCase()}` : g
}

const FORM_KOSONG = {
  nip: '', nama: '', golongan: '', jabatan: '', jenis_kelamin: '',
  role_bmd: 'pengurus_barang', skpd_id: '',
}

// ── Import Excel (upsert by NIP) ────────────────────────────────────────────
// Master data murni (bukan ledger) — commit LANGSUNG upsert ke admin_pegawai,
// tanpa draft/approval spt PerolehanImport (itu perlu krn nyentuh ledger; ini
// tidak). NIP yg sudah ada di-UPDATE (keputusan user 2026-07-14) — pas utk
// file "data terbaru dari BKD" yg dikirim berkala.
type ImportRow = {
  nip: string; nama: string; pangkat: string; golongan: string; jabatan: string
  jenis_kelamin: string; role_bmd: string; skpd_id: number | null
  valid: boolean; masalah: string[]
}

function normHeader(s: unknown): string {
  return String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

// Kolom Role BMD di Excel boleh berisi slug ('pengurus_barang') atau label
// tampilan ('Pengurus Barang') — kosong → default sama dgn FORM_KOSONG/DB.
function mapRoleBmd(raw: string): string | null {
  const s = raw.trim()
  if (!s) return 'pengurus_barang'
  const byValue = ROLE_BMD.find(r => r.value === s)
  if (byValue) return byValue.value
  const byLabel = ROLE_BMD.find(r => r.label.toLowerCase() === s.toLowerCase())
  return byLabel ? byLabel.value : null
}

export default function AdminPegawaiPage() {
  const supabase = createClient()
  const [list, setList] = useState<Pegawai[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState(FORM_KOSONG)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  const [showImport, setShowImport] = useState(false)
  const [importRows, setImportRows] = useState<ImportRow[]>([])
  const [importFileName, setImportFileName] = useState('')
  const [parsingImport, setParsingImport] = useState(false)
  const [committingImport, setCommittingImport] = useState(false)
  const [importMsg, setImportMsg] = useState('')

  async function load() {
    const { data } = await supabase.from('admin_pegawai').select('*,skpd:admin_skpd(nama)').order('nama')
    setList((data as never as Pegawai[]) || [])
    setLoading(false)
  }

  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function openCreate() {
    setEditId(null)
    setForm(FORM_KOSONG)
    setShowForm(true)
  }

  function openEdit(p: Pegawai) {
    setEditId(p.id)
    const golonganNormal = p.golongan ? normalisasiGolongan(p.golongan) : ''
    setForm({
      nip: p.nip, nama: p.nama,
      golongan: GOLONGAN_PANGKAT.some(g => g.golongan === golonganNormal) ? golonganNormal
        : isGolonganPppk(p.golongan || '') ? (p.golongan || '').trim() : '',
      jabatan: p.jabatan || '', jenis_kelamin: p.jenis_kelamin || '',
      role_bmd: p.role_bmd, skpd_id: p.skpd_id != null ? String(p.skpd_id) : '',
    })
    setShowForm(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setMsg('')

    const payload = {
      nip: form.nip, nama: form.nama,
      pangkat: pangkatDariGolongan(form.golongan) || null, golongan: form.golongan || null,
      jabatan: form.jabatan || null, jenis_kelamin: form.jenis_kelamin || null,
      role_bmd: form.role_bmd, skpd_id: form.skpd_id ? Number(form.skpd_id) : null,
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

  async function handleImportFile(f: File) {
    setParsingImport(true); setImportMsg(''); setImportFileName(f.name); setImportRows([])
    try {
      const buf = await f.arrayBuffer()
      const wb = XLSX.read(buf, { cellDates: true })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const grid: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })

      const headerIdx = grid.findIndex(r => r.some(c => normHeader(c).includes('nip')))
      if (headerIdx < 0) throw new Error("Header 'NIP' tidak ditemukan di file.")
      const header = grid[headerIdx].map(normHeader)
      const col = (...names: string[]) => {
        for (const n of names) { const i = header.findIndex(h => h.includes(n)); if (i >= 0) return i }
        return -1
      }
      const cNip = col('nip'), cNama = col('nama', 'namalengkap')
      const cGolongan = col('golongan'), cJabatan = col('jabatan')
      const cGender = col('jeniskelamin', 'gender'), cRole = col('rolebmd', 'role')
      const cSkpd = col('skpdid', 'idskpd', 'skpd')
      const str = (r: unknown[], i: number) => (i >= 0 ? String(r[i] ?? '').trim() : '')

      const parsed: ImportRow[] = []
      for (const r of grid.slice(headerIdx + 1)) {
        const nip = str(r, cNip)
        if (!nip) continue
        const golonganRaw = str(r, cGolongan)
        const golongan = golonganRaw ? normalisasiGolongan(golonganRaw) : ''
        const skpdRaw = str(r, cSkpd)
        const skpdNum = skpdRaw ? Number(skpdRaw) : NaN
        parsed.push({
          nip, nama: str(r, cNama),
          pangkat: pangkatDariGolongan(golongan) || '',
          golongan, jabatan: str(r, cJabatan),
          jenis_kelamin: str(r, cGender).toUpperCase(),
          role_bmd: str(r, cRole),
          skpd_id: skpdRaw && !isNaN(skpdNum) ? skpdNum : null,
          valid: true, masalah: [],
        })
      }
      if (parsed.length === 0) throw new Error('Tidak ada baris data terbaca.')

      // NIP dobel DALAM file yang sama (bukan yg sudah ada di DB — itu sengaja
      // di-upsert/update, lihat komentar di atas FORM_KOSONG).
      const nipCount = new Map<string, number>()
      for (const p of parsed) nipCount.set(p.nip, (nipCount.get(p.nip) || 0) + 1)

      // Validasi skpd_id ke admin_skpd (format kolom = ID numerik, bukan nama).
      const skpdIds = [...new Set(parsed.map(p => p.skpd_id).filter((x): x is number => x != null))]
      const skpdValid = new Set<number>()
      for (let i = 0; i < skpdIds.length; i += 200) {
        const { data } = await supabase.from('admin_skpd').select('id').in('id', skpdIds.slice(i, i + 200))
        for (const s of (data || []) as { id: number }[]) skpdValid.add(s.id)
      }

      for (const p of parsed) {
        if ((nipCount.get(p.nip) || 0) > 1) p.masalah.push('NIP dobel dalam file ini')
        if (!p.nama) p.masalah.push('nama kosong')
        const roleResolved = mapRoleBmd(p.role_bmd)
        if (roleResolved === null) p.masalah.push(`role_bmd tidak dikenali: "${p.role_bmd}"`)
        else p.role_bmd = roleResolved
        if (p.jenis_kelamin && !['L', 'P'].includes(p.jenis_kelamin)) p.masalah.push(`jenis kelamin harus L/P: "${p.jenis_kelamin}"`)
        if (p.skpd_id != null && !skpdValid.has(p.skpd_id)) p.masalah.push(`SKPD id ${p.skpd_id} tidak ditemukan`)
        p.valid = p.masalah.length === 0
      }
      setImportRows(parsed)
    } catch (e) {
      setImportMsg(`Error: ${e instanceof Error ? e.message : String(e)}`)
    }
    setParsingImport(false)
  }

  async function handleImportCommit() {
    const valid = importRows.filter(r => r.valid)
    if (valid.length === 0) return
    setCommittingImport(true); setImportMsg('')

    const payload = valid.map(r => ({
      nip: r.nip, nama: r.nama, pangkat: r.pangkat || null, golongan: r.golongan || null,
      jabatan: r.jabatan || null, jenis_kelamin: r.jenis_kelamin || null,
      role_bmd: r.role_bmd, skpd_id: r.skpd_id,
    }))

    let sukses = 0
    const gagal: string[] = []
    for (let i = 0; i < payload.length; i += 200) {
      const chunk = payload.slice(i, i + 200)
      const { error } = await supabase.from('admin_pegawai').upsert(chunk, { onConflict: 'nip' })
      if (error) gagal.push(error.message)
      else sukses += chunk.length
    }

    setImportMsg(gagal.length
      ? `Error: ${sukses} baris berhasil, gagal: ${gagal.join(' | ')}`
      : `${sukses} pegawai berhasil diimpor (dibuat baru atau diperbarui berdasarkan NIP).`)
    if (sukses > 0) { setImportRows([]); setImportFileName(''); setShowImport(false); load() }
    setCommittingImport(false)
  }

  return (
    <FormShell judul="Daftar Pegawai" deskripsi="Master data pegawai — jadi sumber saat membuat akun di Daftar User" msg={msg}>
      <div className="flex justify-end gap-2 mb-4">
        <button
          onClick={() => { setShowImport(v => !v); setShowForm(false) }}
          className="px-4 py-2 rounded-lg text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50"
        >
          {showImport ? 'Batal Import' : 'Import Excel'}
        </button>
        <button
          onClick={() => { setShowImport(false); if (showForm) setShowForm(false); else openCreate() }}
          className="btn-primary"
        >
          {showForm ? 'Batal' : '+ Tambah Pegawai'}
        </button>
      </div>

      {showImport && (
        <div className="card p-6 mb-6">
          <h2 className="text-base font-semibold text-gray-800 mb-1">Import Excel</h2>
          <p className="text-xs text-gray-500 mb-4">
            Kolom yang dibaca: <b>NIP</b> (wajib), Nama, Golongan, Jabatan, Jenis Kelamin (L/P),
            Role BMD (slug atau label), SKPD ID (angka — id SKPD, bukan nama). NIP yang sudah ada
            di database akan <b>diperbarui</b>; NIP baru akan dibuat.
          </p>
          <input type="file" accept=".xlsx,.xls" className="text-sm mb-4"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleImportFile(f) }} />
          {parsingImport && <p className="text-sm text-gray-400">Membaca file...</p>}
          {importMsg && (
            <div className={`mb-4 p-3 rounded-lg text-sm ${importMsg.startsWith('Error') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>{importMsg}</div>
          )}
          {importRows.length > 0 && (
            <>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-600">
                  {importRows.length} baris terbaca dari {importFileName} —{' '}
                  <span className="text-green-600 font-medium">{importRows.filter(r => r.valid).length} valid</span>
                  {importRows.some(r => !r.valid) && (
                    <span className="text-red-500"> · {importRows.filter(r => !r.valid).length} bermasalah</span>
                  )}
                </span>
                <button className="btn-primary" disabled={committingImport || importRows.filter(r => r.valid).length === 0}
                  onClick={handleImportCommit}>
                  {committingImport ? 'Memproses...' : `Import ${importRows.filter(r => r.valid).length} Baris`}
                </button>
              </div>
              <div className="overflow-x-auto max-h-96 overflow-y-auto border border-gray-100 rounded-lg">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-100 sticky top-0">
                    <tr>
                      <th className="table-th">Status</th><th className="table-th">NIP</th><th className="table-th">Nama</th>
                      <th className="table-th">Golongan</th><th className="table-th">Role BMD</th><th className="table-th">SKPD ID</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {importRows.map((r, i) => (
                      <tr key={i} className={r.valid ? '' : 'bg-red-50/50'}>
                        <td className="table-td text-xs">{r.valid ? <span className="text-green-600">OK</span> : <span className="text-red-500">{r.masalah.join(', ')}</span>}</td>
                        <td className="table-td text-xs">{r.nip}</td>
                        <td className="table-td text-xs">{r.nama}</td>
                        <td className="table-td text-xs">{r.golongan || '-'}</td>
                        <td className="table-td text-xs">{ROLE_BMD.find(x => x.value === r.role_bmd)?.label || r.role_bmd}</td>
                        <td className="table-td text-xs">{r.skpd_id ?? '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

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
              <label className="block text-xs text-gray-500 mb-1">Golongan</label>
              <select className="select-filter w-full" value={form.golongan}
                onChange={e => setForm(f => ({ ...f, golongan: e.target.value }))}>
                <option value="">— pilih golongan —</option>
                <optgroup label="PNS">
                  {GOLONGAN_PANGKAT.map(g => <option key={g.golongan} value={g.golongan}>{g.golongan} — {g.pangkat}</option>)}
                </optgroup>
                <optgroup label="PPPK">
                  {GOLONGAN_PPPK.map(g => <option key={`pppk-${g}`} value={g}>Golongan {g} (PPPK)</option>)}
                </optgroup>
              </select>
              {pangkatDariGolongan(form.golongan)
                ? <p className="text-xs text-gray-400 mt-1">Pangkat: {pangkatDariGolongan(form.golongan)}</p>
                : isGolonganPppk(form.golongan) && <p className="text-xs text-gray-400 mt-1">PPPK — Golongan {form.golongan}</p>}
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Jabatan</label>
              <input className="select-filter w-full" value={form.jabatan}
                onChange={e => setForm(f => ({ ...f, jabatan: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Jenis Kelamin</label>
              <select className="select-filter w-full" value={form.jenis_kelamin}
                onChange={e => setForm(f => ({ ...f, jenis_kelamin: e.target.value }))}>
                <option value="">— pilih —</option>
                <option value="L">Laki-laki</option>
                <option value="P">Perempuan</option>
              </select>
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
              <SkpdCombobox value={form.skpd_id} onChange={id => setForm(f => ({ ...f, skpd_id: id }))}
                placeholder="Ketik nama SKPD... (kosongkan jika tanpa SKPD)" allowClear />
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
                <th className="table-th whitespace-nowrap">SKPD</th>
                <th className="table-th whitespace-nowrap">Nama</th>
                <th className="table-th whitespace-nowrap">NIP</th>
                <th className="table-th whitespace-nowrap">Golongan</th>
                <th className="table-th whitespace-nowrap">Pangkat</th>
                <th className="table-th whitespace-nowrap">Jabatan</th>
                <th className="table-th whitespace-nowrap">Role BMD</th>
                <th className="table-th whitespace-nowrap">Edit</th>
                <th className="table-th whitespace-nowrap">Hapus</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr><td colSpan={9} className="table-td text-center py-8 text-gray-400">Memuat...</td></tr>
              ) : list.length === 0 ? (
                <tr><td colSpan={9} className="table-td text-center py-8 text-gray-400">Belum ada pegawai.</td></tr>
              ) : list.map(p => (
                <tr key={p.id}>
                  <td className="table-td whitespace-nowrap text-xs text-gray-500">{p.skpd?.nama || '—'}</td>
                  <td className="table-td whitespace-nowrap text-sm font-medium">{p.nama}</td>
                  <td className="table-td whitespace-nowrap text-xs text-gray-400">{p.nip}</td>
                  <td className="table-td whitespace-nowrap text-xs text-gray-500">
                    {p.golongan ? (isGolonganPppk(p.golongan) ? `${p.golongan} (PPPK)` : p.golongan) : '—'}
                  </td>
                  <td className="table-td whitespace-nowrap text-xs text-gray-500">{p.pangkat || '—'}</td>
                  <td className="table-td whitespace-nowrap text-xs text-gray-500">{p.jabatan || '—'}</td>
                  <td className="table-td whitespace-nowrap text-xs text-gray-500">{ROLE_BMD.find(r => r.value === p.role_bmd)?.label || p.role_bmd}</td>
                  <td className="table-td whitespace-nowrap">
                    <button onClick={() => openEdit(p)} className="text-teal hover:underline text-xs font-medium">Edit</button>
                  </td>
                  <td className="table-td whitespace-nowrap">
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
