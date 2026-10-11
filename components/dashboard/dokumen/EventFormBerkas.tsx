'use client'
// Form tambah MATERI / DOKUMENTASI ke satu event (bagian 4 Dokumen Sumber).
// Materi boleh berupa berkas unggahan ATAU tautan (berkas besar cukup ditautkan
// dari Drive); dokumentasi selalu tautan. Aturannya: lib/eventBidang.ts.
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { tambahBerkas } from '@/lib/eventBidangData'
import {
  normalisasiUrl, MAKS_BERKAS_EVENT, AKSEP_BERKAS_EVENT, type JenisBerkasEvent,
} from '@/lib/eventBidang'
import { useKonfirmasi, konfirmasiGagal } from '@/shared/ui/konfirmasi'

export default function EventFormBerkas({ eventId, jenis, onSelesai, onBatal }: {
  eventId: string
  jenis: JenisBerkasEvent
  /** Dipanggil sesudah tersimpan, supaya daftar dimuat ulang. */
  onSelesai: () => void
  onBatal: () => void
}) {
  const supabase = createClient()
  const konfirmasi = useKonfirmasi()
  const materi = jenis === 'materi'
  const [judul, setJudul] = useState('')
  const [ket, setKet] = useState('')
  const [mode, setMode] = useState<'berkas' | 'tautan'>(materi ? 'berkas' : 'tautan')
  const [file, setFile] = useState<File | null>(null)
  const [tautan, setTautan] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  async function simpan() {
    if (!judul.trim()) { setErr('Judul wajib diisi.'); return }
    let url: string | undefined
    if (mode === 'berkas') {
      if (!file) { setErr('Berkas wajib dipilih.'); return }
      if (file.size > MAKS_BERKAS_EVENT) {
        setErr(`Berkas ${(file.size / 1024 / 1024).toFixed(1)} MB — melebihi batas 20 MB. Unggah ke Drive lalu pilih "Tautan".`)
        return
      }
    } else {
      const u = normalisasiUrl(tautan)
      if (!u) { setErr('Tautan tidak valid — harus diawali http:// atau https:// (mis. tautan Google Drive).'); return }
      url = u
    }
    setErr(''); setSaving(true)
    try {
      await tambahBerkas(supabase, eventId, {
        jenis, judul, keterangan: ket, url, file: mode === 'berkas' ? file ?? undefined : undefined,
      })
      onSelesai()
    } catch (e) {
      await konfirmasiGagal(konfirmasi, e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mt-3 p-3 border border-gray-100 rounded-lg space-y-3 bg-gray-50/50">
      <p className="text-xs font-semibold text-gray-700">{materi ? 'Tambah materi' : 'Tambah dokumentasi'}</p>
      <div>
        <label className="block text-xs text-gray-500 mb-1">Judul</label>
        <input className="select-filter w-full" value={judul} onChange={e => setJudul(e.target.value)}
          placeholder={materi ? 'mis. Materi Penyusutan BMD' : 'mis. Foto kegiatan hari pertama'} />
      </div>
      <div>
        <label className="block text-xs text-gray-500 mb-1">Keterangan (opsional)</label>
        <input className="select-filter w-full" value={ket} onChange={e => setKet(e.target.value)}
          placeholder={materi ? 'mis. Narasumber: …' : 'mis. Folder berisi 120 foto'} />
      </div>
      {materi && (
        <div className="flex gap-4 text-xs text-gray-600">
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input type="radio" checked={mode === 'berkas'} onChange={() => setMode('berkas')} /> Unggah berkas
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input type="radio" checked={mode === 'tautan'} onChange={() => setMode('tautan')} /> Tautan (Drive)
          </label>
        </div>
      )}
      {mode === 'berkas' ? (
        <div>
          <label className="block text-xs text-gray-500 mb-1">Berkas (PDF, PPT, DOC, XLS, gambar — maks. 20 MB)</label>
          <input type="file" accept={AKSEP_BERKAS_EVENT} onChange={e => setFile(e.target.files?.[0] || null)} className="text-xs" />
        </div>
      ) : (
        <div>
          <label className="block text-xs text-gray-500 mb-1">Tautan Google Drive</label>
          <input className="select-filter w-full" value={tautan} onChange={e => setTautan(e.target.value)}
            placeholder="https://drive.google.com/…" />
          {!materi && <p className="text-[11px] text-gray-400 mt-1">Pastikan akses folder/berkas di Drive sudah dibuka untuk yang perlu melihatnya.</p>}
        </div>
      )}
      {err && <p className="text-xs text-red-600" role="alert">{err}</p>}
      <div className="flex justify-end gap-2">
        <button className="btn-secondary text-xs" onClick={onBatal} disabled={saving}>Batal</button>
        <button className="btn-primary text-xs" onClick={simpan} disabled={saving}>{saving ? 'Menyimpan...' : 'Simpan'}</button>
      </div>
    </div>
  )
}
