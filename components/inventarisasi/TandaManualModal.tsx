'use client'
// Pop-up "Tandai selesai manual" — Tindak Lanjut Inventarisasi, Fase 3.
// Hanya untuk temuan yang tak bisa dilacak otomatis (`BOLEH_TANDAI_MANUAL`).
// Catatan WAJIB (apa yang sudah dilakukan), dokumen opsional (berita acara,
// surat koordinasi, dst.) ke bucket `dokumen-sumber`, prefix `tindak-lanjut/`.
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { backdropClose } from '@/components/backdropClose'
import { DokumenBastField } from '@/components/pengelolaan/DokumenBastField'
import { LHI_LABEL } from '@/lib/inventarisasi'
import { tandaiSelesaiManual, type TemuanTLMuat } from '@/lib/tindakLanjutData'

export default function TandaManualModal({ temuan, onClose, onSaved }: {
  temuan: TemuanTLMuat; onClose: () => void; onSaved: () => void
}) {
  const supabase = createClient()
  const [catatan, setCatatan] = useState('')
  const [dok, setDok] = useState<string[]>([])
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  async function upload(files: FileList | null) {
    if (!files || files.length === 0) return
    setUploading(true)
    try {
      for (const f of Array.from(files)) {
        const path = `tindak-lanjut/${crypto.randomUUID()}/${f.name}`
        const { error } = await supabase.storage.from('dokumen-sumber').upload(path, f)
        if (error) { setErr(`Gagal upload "${f.name}": ${error.message}`); continue }
        setDok(p => [...p, path])
      }
    } finally { setUploading(false) }
  }
  async function hapus(path: string) {
    const { error } = await supabase.storage.from('dokumen-sumber').remove([path])
    if (error) setErr(`Gagal menghapus berkas: ${error.message}`)
    setDok(p => p.filter(x => x !== path))
  }

  async function simpan() {
    // Tombol TIDAK dimatikan: penolakan menyebut alasannya (CODING-STANDARD §4.5).
    if (!catatan.trim()) { setErr('Tulis catatan apa yang sudah dilakukan.'); return }
    setSaving(true); setErr('')
    try {
      await tandaiSelesaiManual(supabase, temuan.isianId, temuan.lhi, catatan, dok)
      onSaved()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" {...backdropClose(onClose)}>
      <div className="card w-full max-w-lg p-5 space-y-4" onClick={e => e.stopPropagation()}>
        <div>
          <h3 className="font-semibold text-gray-800">Tandai selesai</h3>
          <p className="text-xs text-gray-500 mt-1">
            {temuan.snapshot?.nama_barang || '-'} · {temuan.lhi} — {LHI_LABEL[temuan.lhi]}
          </p>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Catatan tindak lanjut <span className="text-red-500">*</span></label>
          <textarea className="select-filter w-full min-h-[90px]" value={catatan} onChange={e => setCatatan(e.target.value)}
            placeholder="Mis. sudah berkoordinasi dgn pemilik lahan; BA nomor …; induk ditelusuri tapi tidak ditemukan, diputuskan …" />
        </div>
        <DokumenBastField paths={dok} uploading={uploading} onUpload={upload} onHapus={hapus}
          judul="Dokumen pendukung (opsional)" labelTombol="Upload dokumen"
          hint="berita acara, surat, foto — PDF / gambar"
          kosongText="Belum ada dokumen — boleh dikosongkan." />
        {err && <p className="text-sm text-red-600">{err}</p>}
        <p className="text-[11px] text-gray-400">Tanda ini bisa dibatalkan kembali dari menu Tindak Lanjut.</p>
        <div className="flex justify-end gap-2">
          <button className="btn-secondary" onClick={onClose}>Batal</button>
          <button className="btn-primary" onClick={simpan} disabled={saving || uploading}>{saving ? 'Menyimpan...' : 'Tandai selesai'}</button>
        </div>
      </div>
    </div>
  )
}
