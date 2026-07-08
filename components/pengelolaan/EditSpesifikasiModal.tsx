'use client'
// Popup Edit Spesifikasi (golongan-aware) + Foto — dipakai Pengadaan &
// PerolehanManual (Hibah/Tukar Menukar/Hasil Inventarisasi/Perolehan Lainnya)
// lewat checklist (1 atau banyak barang dicentang) di kartu draft/disetujui.
// fieldKeys = union field yang relevan (kalau beda golongan, semua field
// relevan tetap muncul).
//   single=true  → 1 barang: field & foto REPLACE penuh (bisa hapus/kosongkan).
//   single=false → banyak barang: field yang diisi diterapkan ke semua (yg kosong
//                  tak menimpa); foto yang diupload di-APPEND ("split") ke semua
//                  barang yang dicentang, tanpa menghapus foto lama masing-masing.
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { FIELD_LABEL, FIELD_TYPE, FIELD_OPTIONS, type FieldKey } from '@/lib/asetFields'
import dynamic from 'next/dynamic'
import WilayahPicker from '@/components/WilayahPicker'
const MapPicker = dynamic(() => import('@/components/MapPicker'), { ssr: false, loading: () => <div className="h-[220px] bg-gray-50 rounded-lg animate-pulse" /> })

export default function EditSpesifikasiModal({ title, fieldKeys, storagePrefix, initialFields, initialFoto, single, onSave, onClose }: {
  title: string; fieldKeys: FieldKey[]; storagePrefix: string
  initialFields: Record<string, string>; initialFoto: string[]; single: boolean
  onSave: (fields: Record<string, string>, foto: { replace?: string[]; append?: string[] }) => Promise<void> | void
  onClose: () => void
}) {
  const supabase = createClient()
  const keys = fieldKeys
  const [values, setValues] = useState<Record<string, string>>(initialFields)
  // single: fotoPaths = daftar penuh (di-replace). bulk: fotoPaths = foto BARU
  // yang bakal di-append ke semua barang dicentang (mulai kosong).
  const [fotoPaths, setFotoPaths] = useState<string[]>(single ? initialFoto : [])
  const [fotoUrls, setFotoUrls] = useState<Record<string, string>>({})
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    (async () => {
      if (!single || initialFoto.length === 0) return
      const { data } = await supabase.storage.from('aset-foto').createSignedUrls(initialFoto, 3600)
      const map: Record<string, string> = {}
      for (const d of data || []) if (d.signedUrl && d.path) map[d.path] = d.signedUrl
      setFotoUrls(map)
    })()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function uploadFoto(files: FileList | null) {
    if (!files || files.length === 0) return
    setErr(''); setUploading(true)
    for (const file of Array.from(files)) {
      if (file.size > 10 * 1024 * 1024) { setErr(`"${file.name}" lebih dari 10MB, dilewati.`); continue }
      if (!file.type.startsWith('image/')) { setErr(`"${file.name}" bukan file gambar, dilewati.`); continue }
      const path = `${storagePrefix}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
      const { error } = await supabase.storage.from('aset-foto').upload(path, file)
      if (error) { setErr(`Gagal upload "${file.name}": ${error.message}`); continue }
      const { data: signed } = await supabase.storage.from('aset-foto').createSignedUrl(path, 3600)
      setFotoPaths(prev => [...prev, path])
      if (signed?.signedUrl) setFotoUrls(prev => ({ ...prev, [path]: signed.signedUrl }))
    }
    setUploading(false)
  }

  async function hapusFoto(path: string) {
    if (!confirm('Hapus foto ini?')) return
    if (single) await supabase.storage.from('aset-foto').remove([path]) // bulk: file dipakai bersama, jangan hapus fisiknya
    setFotoPaths(prev => prev.filter(p => p !== path))
  }

  async function simpan() {
    setSaving(true)
    await onSave(values, single ? { replace: fotoPaths } : { append: fotoPaths })
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="card w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white">
          <h3 className="font-semibold text-gray-800">Edit Spesifikasi — {title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl leading-none">×</button>
        </div>
        <div className="p-5 space-y-4">
          {!single && (
            <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
              Diterapkan ke SEMUA barang yang dicentang. Field yang dikosongkan tidak menimpa nilai per barang; foto yang diupload ditambahkan ke tiap barang.
            </p>
          )}
          {keys.map(k => {
            const type = FIELD_TYPE[k as FieldKey]
            if (k === 'longitude') return null // digabung ke widget 'latitude' (MapPicker), jangan dirender sendiri
            if (type === 'latlong') {
              return (
                <div key={k}>
                  <label className="block text-xs text-gray-500 mb-1">{FIELD_LABEL[k as FieldKey]}</label>
                  <MapPicker latitude={values.latitude || ''} longitude={values.longitude || ''}
                    onChange={(lat, lng) => setValues({ ...values, latitude: lat, longitude: lng })} />
                </div>
              )
            }
            if (type === 'wilayah') {
              return (
                <div key={k}>
                  <label className="block text-xs text-gray-500 mb-1">{FIELD_LABEL[k as FieldKey]}</label>
                  <WilayahPicker value={values[k] || ''} onChange={v => setValues({ ...values, [k]: v })} />
                </div>
              )
            }
            if (type === 'select') {
              return (
                <div key={k}>
                  <label className="block text-xs text-gray-500 mb-1">{FIELD_LABEL[k as FieldKey]}</label>
                  <select className="select-filter w-full" value={values[k] || ''} onChange={e => setValues({ ...values, [k]: e.target.value })}>
                    <option value="">-</option>
                    {(FIELD_OPTIONS[k as FieldKey] || []).map(opt => <option key={opt} value={opt}>{opt}</option>)}
                  </select>
                </div>
              )
            }
            return (
              <div key={k}>
                <label className="block text-xs text-gray-500 mb-1">{FIELD_LABEL[k as FieldKey]}</label>
                {type === 'textarea' ? (
                  <textarea className="select-filter w-full" rows={2} value={values[k] || ''} onChange={e => setValues({ ...values, [k]: e.target.value })} />
                ) : (
                  <input type={type === 'date' ? 'date' : type === 'number' ? 'number' : 'text'}
                    className="select-filter w-full" value={values[k] || ''} onChange={e => setValues({ ...values, [k]: e.target.value })} />
                )}
              </div>
            )
          })}
          <div className="pt-2 border-t border-gray-100">
            <label className="block text-xs text-gray-500 mb-2">
              Foto Barang (maks 10MB/foto){!single && <span className="text-gray-400"> — foto baru ditambahkan ke semua barang dicentang</span>}
            </label>
            {fotoPaths.length > 0 && (
              <div className="grid grid-cols-3 gap-2 mb-2">
                {fotoPaths.map(p => (
                  <div key={p} className="relative group">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {fotoUrls[p] ? <img src={fotoUrls[p]} alt="Foto barang" className="w-full h-20 object-cover rounded border border-gray-200" /> : <div className="w-full h-20 bg-gray-100 rounded animate-pulse" />}
                    <button onClick={() => hapusFoto(p)} title="Hapus foto" className="absolute top-1 right-1 w-5 h-5 rounded-full bg-red-500 text-white text-xs leading-none">×</button>
                  </div>
                ))}
              </div>
            )}
            <input type="file" accept="image/*" multiple onChange={e => uploadFoto(e.target.files)} disabled={uploading} className="text-xs" />
            {uploading && <p className="text-xs text-gray-400 mt-1">Mengunggah...</p>}
          </div>
          {err && <p className="text-xs text-red-600">{err}</p>}
        </div>
        <div className="px-5 py-4 border-t border-gray-100 flex justify-end gap-2 sticky bottom-0 bg-white">
          <button className="btn-secondary" onClick={onClose}>Batal</button>
          <button className="btn-primary" onClick={simpan} disabled={saving}>{saving ? 'Menyimpan...' : 'Simpan'}</button>
        </div>
      </div>
    </div>
  )
}
