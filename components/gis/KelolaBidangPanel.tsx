'use client'
// Panel Kelola Bidang — daftar + tambah/edit/hapus baris aset_bidang_tanah
// milik 1 aset Tanah terpilih. BUKAN ledger (data referensi/deskriptif),
// jadi CRUD langsung (insert/update/delete), TANPA jurnal_header/catatTransaksi
// — bobot & pola sama persis app/dashboard/admin/skpd/page.tsx.
import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { createClient } from '@/lib/supabase/client'
import { FIELD_OPTIONS } from '@/lib/asetFields'

const MapPicker = dynamic(() => import('@/components/MapPicker'), { ssr: false, loading: () => <div className="h-[180px] bg-gray-50 rounded-lg animate-pulse" /> })

type Bidang = {
  id: string; aset_id: string; nama_bidang: string | null; luas: number | null; jenis_hak: string | null
  nomor_dokumen_kepemilikan: string | null; tanggal_dokumen_kepemilikan: string | null; nama_dokumen_kepemilikan: string | null
  tanggal_berakhir_hak: string | null; alamat_detail: string | null; latitude: number | null; longitude: number | null
  sertifikat_path: string | null; keterangan: string | null
}

const FORM_KOSONG = {
  nama_bidang: '', luas: '', jenis_hak: '', nomor_dokumen_kepemilikan: '', tanggal_dokumen_kepemilikan: '',
  nama_dokumen_kepemilikan: '', tanggal_berakhir_hak: '', alamat_detail: '', latitude: '', longitude: '', keterangan: '',
}

const namaFile = (path: string) => path.split('/').pop() || path

export default function KelolaBidangPanel({ asetId, asetNama, asetNibar, onChanged }: {
  asetId: string; asetNama: string; asetNibar: string | null; onChanged?: () => void
}) {
  const supabase = createClient()
  const [rows, setRows] = useState<Bidang[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState(FORM_KOSONG)
  const [sertifikatPath, setSertifikatPath] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('aset_bidang_tanah').select('*').eq('aset_id', asetId).order('created_at', { ascending: true })
    setRows((data as Bidang[]) || [])
    setLoading(false)
  }

  useEffect(() => { load(); setShowForm(false); setEditId(null); setMsg('') }, [asetId]) // eslint-disable-line react-hooks/exhaustive-deps

  function openCreate() {
    setEditId(null)
    setForm(FORM_KOSONG)
    setSertifikatPath(null)
    setShowForm(true)
  }
  function openEdit(b: Bidang) {
    setEditId(b.id)
    setForm({
      nama_bidang: b.nama_bidang || '', luas: b.luas != null ? String(b.luas) : '', jenis_hak: b.jenis_hak || '',
      nomor_dokumen_kepemilikan: b.nomor_dokumen_kepemilikan || '', tanggal_dokumen_kepemilikan: b.tanggal_dokumen_kepemilikan || '',
      nama_dokumen_kepemilikan: b.nama_dokumen_kepemilikan || '', tanggal_berakhir_hak: b.tanggal_berakhir_hak || '',
      alamat_detail: b.alamat_detail || '', latitude: b.latitude != null ? String(b.latitude) : '', longitude: b.longitude != null ? String(b.longitude) : '',
      keterangan: b.keterangan || '',
    })
    setSertifikatPath(b.sertifikat_path)
    setShowForm(true)
  }

  async function uploadSertifikat(files: FileList | null) {
    if (!files || files.length === 0) return
    const file = files[0]
    if (file.size > 10 * 1024 * 1024) { setMsg('Error: file lebih dari 10MB.'); return }
    setUploading(true)
    if (sertifikatPath) await supabase.storage.from('dokumen-sumber').remove([sertifikatPath])
    const path = `gis-bidang/${asetId}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
    const { error } = await supabase.storage.from('dokumen-sumber').upload(path, file)
    if (error) { setMsg(`Error: gagal upload — ${error.message}`); setUploading(false); return }
    setSertifikatPath(path)
    setUploading(false)
  }
  async function lihatSertifikat(path: string) {
    const { data } = await supabase.storage.from('dokumen-sumber').createSignedUrl(path, 3600)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
  }
  async function hapusSertifikat() {
    if (!sertifikatPath) return
    if (!confirm('Hapus file sertifikat ini?')) return
    await supabase.storage.from('dokumen-sumber').remove([sertifikatPath])
    setSertifikatPath(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setMsg('')
    const payload = {
      aset_id: asetId,
      nama_bidang: form.nama_bidang.trim() || null,
      luas: form.luas.trim() ? parseFloat(form.luas) : null,
      jenis_hak: form.jenis_hak || null,
      nomor_dokumen_kepemilikan: form.nomor_dokumen_kepemilikan.trim() || null,
      tanggal_dokumen_kepemilikan: form.tanggal_dokumen_kepemilikan || null,
      nama_dokumen_kepemilikan: form.nama_dokumen_kepemilikan.trim() || null,
      tanggal_berakhir_hak: form.tanggal_berakhir_hak || null,
      alamat_detail: form.alamat_detail.trim() || null,
      latitude: form.latitude.trim() ? parseFloat(form.latitude) : null,
      longitude: form.longitude.trim() ? parseFloat(form.longitude) : null,
      sertifikat_path: sertifikatPath,
      keterangan: form.keterangan.trim() || null,
    }
    const { error } = editId
      ? await supabase.from('aset_bidang_tanah').update(payload).eq('id', editId)
      : await supabase.from('aset_bidang_tanah').insert(payload)
    if (error) {
      setMsg(`Error: ${error.message}`)
    } else {
      setMsg(editId ? 'Bidang diperbarui.' : 'Bidang ditambahkan.')
      setShowForm(false); setEditId(null); setForm(FORM_KOSONG); setSertifikatPath(null)
      load(); onChanged?.()
    }
    setSaving(false)
  }

  async function handleDelete(b: Bidang) {
    if (!confirm(`Hapus bidang "${b.nama_bidang || b.id}"?`)) return
    if (b.sertifikat_path) await supabase.storage.from('dokumen-sumber').remove([b.sertifikat_path])
    const { error } = await supabase.from('aset_bidang_tanah').delete().eq('id', b.id)
    if (error) setMsg(`Error: ${error.message}`)
    else { load(); onChanged?.() }
  }

  return (
    <div className="card p-5">
      <div className="flex items-start justify-between mb-1">
        <div>
          <h3 className="text-sm font-semibold text-gray-800">{asetNama}</h3>
          <p className="text-xs text-gray-400">{asetNibar || '-'}</p>
        </div>
        <button className="btn-primary text-xs" onClick={() => (showForm ? setShowForm(false) : openCreate())}>
          {showForm ? 'Batal' : '+ Tambah Bidang'}
        </button>
      </div>

      {msg && (
        <div className={`mt-3 p-2 rounded-lg text-xs ${msg.startsWith('Error') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>{msg}</div>
      )}

      {showForm && (
        <form onSubmit={handleSubmit} className="mt-4 space-y-3 border-t border-gray-100 pt-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Nama Bidang</label>
              <input className="select-filter w-full" value={form.nama_bidang} placeholder="mis. Bidang 1 - sisi utara"
                onChange={e => setForm(f => ({ ...f, nama_bidang: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Luas (m²)</label>
              <input type="number" min="0" step="0.01" className="select-filter w-full" value={form.luas}
                onChange={e => setForm(f => ({ ...f, luas: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Jenis Hak</label>
              <select className="select-filter w-full" value={form.jenis_hak} onChange={e => setForm(f => ({ ...f, jenis_hak: e.target.value }))}>
                <option value="">-</option>
                {(FIELD_OPTIONS.jenis_hak || []).map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Nomor Sertifikat</label>
              <input className="select-filter w-full" value={form.nomor_dokumen_kepemilikan}
                onChange={e => setForm(f => ({ ...f, nomor_dokumen_kepemilikan: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Nama Dokumen</label>
              <input className="select-filter w-full" value={form.nama_dokumen_kepemilikan}
                onChange={e => setForm(f => ({ ...f, nama_dokumen_kepemilikan: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Tanggal Terbit</label>
              <input type="date" className="select-filter w-full" value={form.tanggal_dokumen_kepemilikan}
                onChange={e => setForm(f => ({ ...f, tanggal_dokumen_kepemilikan: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Tanggal Berakhir <span className="text-gray-400">(HGB/HGU)</span></label>
              <input type="date" className="select-filter w-full" value={form.tanggal_berakhir_hak}
                onChange={e => setForm(f => ({ ...f, tanggal_berakhir_hak: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Alamat / Detail Lokasi</label>
              <input className="select-filter w-full" value={form.alamat_detail}
                onChange={e => setForm(f => ({ ...f, alamat_detail: e.target.value }))} />
            </div>
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">Titik Koordinat</label>
            <MapPicker latitude={form.latitude} longitude={form.longitude}
              onChange={(lat, lng) => setForm(f => ({ ...f, latitude: lat, longitude: lng }))} />
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">Sertifikat (PDF/gambar, maks 10MB)</label>
            {sertifikatPath ? (
              <div className="flex items-center gap-2 text-xs">
                <button type="button" onClick={() => lihatSertifikat(sertifikatPath)} className="text-teal hover:underline truncate">{namaFile(sertifikatPath)}</button>
                <button type="button" onClick={hapusSertifikat} className="text-red-500 hover:text-red-700">×</button>
              </div>
            ) : (
              <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf"
                onChange={e => uploadSertifikat(e.target.files)} disabled={uploading} className="text-xs" />
            )}
            {uploading && <p className="text-xs text-gray-400 mt-1">Mengunggah...</p>}
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">Keterangan</label>
            <input className="select-filter w-full" value={form.keterangan} onChange={e => setForm(f => ({ ...f, keterangan: e.target.value }))} />
          </div>

          <button type="submit" disabled={saving} className="btn-primary text-sm">{saving ? 'Menyimpan...' : 'Simpan Bidang'}</button>
        </form>
      )}

      <div className="mt-4 border-t border-gray-100 pt-3">
        {loading ? (
          <p className="text-xs text-gray-400 text-center py-4">Memuat...</p>
        ) : rows.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-4">Belum ada bidang tercatat.</p>
        ) : (
          <ul className="space-y-2">
            {rows.map(b => (
              <li key={b.id} className="border border-gray-100 rounded-lg p-3 text-xs">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-gray-800">{b.nama_bidang || '(tanpa nama)'}</p>
                    <p className="text-gray-500 mt-0.5">
                      {b.nomor_dokumen_kepemilikan || 'Belum ada sertifikat'} · {b.jenis_hak || '-'} · {b.luas != null ? `${b.luas} m²` : '-'}
                    </p>
                    {b.tanggal_berakhir_hak && <p className="text-gray-400 mt-0.5">Berakhir: {b.tanggal_berakhir_hak}</p>}
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <button onClick={() => openEdit(b)} className="text-teal hover:underline">Edit</button>
                    <button onClick={() => handleDelete(b)} className="text-red-500 hover:underline">Hapus</button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
