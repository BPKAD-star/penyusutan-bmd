'use client'
// Form kartu paket Pekerjaan Konstruksi (2026-10-07): BUAT kartu & EDIT
// identitasnya. Kontrak, barang KDP & termin ditambah di kartunya.
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import ProgramPicker from '@/components/ProgramPicker'
import { useDateBounds } from '@/components/useTahunBuku'
import { backdropClose } from '@/components/backdropClose'
import { periodeDariTanggal } from '@/lib/bmd'
import { tahunKartuKdp, type KontrakKonstruksiPayload } from '@/lib/kdp'
import { useKonfirmasi, konfirmasiGagal } from '@/shared/ui/konfirmasi'
import type { Kontrak } from '../KonstruksiPengadaan'

// Tanggal kartu = awal tahun anggaran (atau batas bawah tahun buku terbuka).
// Ia cuma menandai TAHUN kartu — tanggal kontrak & BAST punya isiannya sendiri.
function tanggalKartu(tahun: string, min?: string): string {
  const awal = `${tahun}-01-01`
  return min && min > awal && min.startsWith(tahun) ? min : awal
}

// ── Form buat kartu paket (kontrak, barang & termin ditambah di kartunya) ───
export function CreateKartu({ skpdId, onSaved }: { skpdId: number; onSaved: (k: Kontrak) => void }) {
  const supabase = createClient()
  const konfirmasi = useKonfirmasi()
  const bounds = useDateBounds()
  const tahunTerbuka = (() => {
    const a = Number((bounds.min || '').slice(0, 4)), b = Number((bounds.max || '').slice(0, 4))
    return a && b ? Array.from({ length: b - a + 1 }, (_, i) => String(b - i)) : []
  })()
  const [tahun, setTahun] = useState('')
  const [f, setF] = useState({ nama: '', program: '', kegiatan: '', subKeg: '', keterangan: '' })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const th = tahun || tahunTerbuka[0]
    if (!f.nama.trim()) { setErr('Nama paket pekerjaan wajib diisi.'); return }
    if (!th) { setErr('Tahun anggaran wajib dipilih.'); return }
    setErr(''); setSaving(true)
    const payload: KontrakKonstruksiPayload = {
      nama_pekerjaan: f.nama.trim(), program: f.program || null, kegiatan: f.kegiatan || null, sub_kegiatan: f.subKeg || null,
      keterangan: f.keterangan || null, kontrak: [], barang: [],
    }
    const { data, error } = await supabase.from('jurnal_header').insert({
      skpd_id: skpdId, kategori: 'konstruksi', no_sk: f.nama.trim(), tanggal: tanggalKartu(th, bounds.min),
      keterangan: f.keterangan || null, approval_status: 'pending', payload,
    }).select('id,skpd_id,no_sk,tanggal,approval_status,payload,created_by').single()
    setSaving(false)
    if (error || !data) await konfirmasiGagal(konfirmasi, `Gagal menyimpan kartu: ${error?.message || 'data kosong'}`)
    else onSaved(data as Kontrak)
  }

  return (
    <form onSubmit={submit} className="card p-5 mb-4 space-y-4 max-w-2xl">
      <div><label className="block text-xs text-gray-500 mb-1">Nama Paket Pekerjaan</label>
        <input className="select-filter w-full" value={f.nama} onChange={e => setF(s => ({ ...s, nama: e.target.value }))} /></div>
      <div><label className="block text-xs text-gray-500 mb-1">Tahun Anggaran <span className="text-gray-400">(satu kartu = satu tahun; pekerjaan lintas tahun → kartu baru, lalu Kapitalisasi & Reklas)</span></label>
        <select className="select-filter w-full sm:w-40" value={tahun || tahunTerbuka[0] || ''} onChange={e => setTahun(e.target.value)}>
          {tahunTerbuka.map(t => <option key={t} value={t}>{t}</option>)}
        </select></div>
      <div>
        <label className="block text-xs text-gray-500 mb-1">Program / Kegiatan / Sub Kegiatan</label>
        <ProgramPicker program={f.program} kegiatan={f.kegiatan} subKeg={f.subKeg}
          onChange={sel => setF(s => ({ ...s, program: sel.program, kegiatan: sel.kegiatan, subKeg: sel.sub_kegiatan }))} />
      </div>
      <div><label className="block text-xs text-gray-500 mb-1">Keterangan</label>
        <input className="select-filter w-full" value={f.keterangan} onChange={e => setF(s => ({ ...s, keterangan: e.target.value }))} /></div>
      <p className="text-xs text-gray-500">Kontrak (perencanaan, fisik, pengawasan, biaya umum), barang KDP, & termin ditambahkan di kartunya sesudah disimpan.</p>
      {err && <p className="text-sm text-red-600">{err}</p>}
      <button type="submit" disabled={saving} className="btn-primary">{saving ? 'Menyimpan...' : 'Simpan Kartu'}</button>
    </form>
  )
}

// ── Edit identitas kartu (nama paket, program, keterangan) ───────────────────
// Tahun kartu TIDAK bisa diubah: termin wajib di tahun kartu, dan periode header
// beku (fn_jurnal_header_guard). Salah tahun → hapus kartu & buat baru.
export function EditKartuModal({ kontrak, onClose, onSaved }: { kontrak: Kontrak; onClose: () => void; onSaved: () => void }) {
  const supabase = createClient()
  const konfirmasi = useKonfirmasi()
  const p = kontrak.payload || ({} as KontrakKonstruksiPayload)
  const [nama, setNama] = useState(p.nama_pekerjaan || kontrak.no_sk)
  const [program, setProgram] = useState(p.program || '')
  const [kegiatan, setKegiatan] = useState(p.kegiatan || '')
  const [subKeg, setSubKeg] = useState(p.sub_kegiatan || '')
  const [keterangan, setKeterangan] = useState(p.keterangan || '')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  async function simpan() {
    if (!nama.trim()) { setErr('Nama paket wajib diisi.'); return }
    setErr(''); setSaving(true)
    const payload: KontrakKonstruksiPayload = {
      ...p, nama_pekerjaan: nama.trim(), program: program || null, kegiatan: kegiatan || null,
      sub_kegiatan: subKeg || null, keterangan: keterangan.trim() || null,
    }
    const { error } = await supabase.from('jurnal_header')
      .update({ no_sk: nama.trim(), keterangan: keterangan.trim() || null, payload }).eq('id', kontrak.id)
    setSaving(false)
    if (error) { await konfirmasiGagal(konfirmasi, `Gagal menyimpan: ${error.message}`); return }
    onSaved()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" {...backdropClose(onClose)}>
      <div className="card w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white">
          <h3 className="font-semibold text-gray-800">Edit Kartu Paket</h3>
          <button className="text-gray-400 hover:text-gray-700 text-xl leading-none" onClick={onClose}>×</button>
        </div>
        <div className="p-5 space-y-4">
          <div><label className="block text-xs text-gray-500 mb-1">Nama Paket Pekerjaan</label>
            <input className="select-filter w-full" value={nama} onChange={e => setNama(e.target.value)} /></div>
          <p className="text-xs text-gray-500">Tahun anggaran: <b>{tahunKartuKdp(kontrak.tanggal)}</b> ({periodeDariTanggal(kontrak.tanggal)}) — tidak bisa diubah.</p>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Program / Kegiatan / Sub Kegiatan</label>
            <ProgramPicker program={program} kegiatan={kegiatan} subKeg={subKeg}
              onChange={sel => { setProgram(sel.program); setKegiatan(sel.kegiatan); setSubKeg(sel.sub_kegiatan) }} />
          </div>
          <div><label className="block text-xs text-gray-500 mb-1">Keterangan</label>
            <input className="select-filter w-full" value={keterangan} onChange={e => setKeterangan(e.target.value)} /></div>
          {err && <p className="text-sm text-red-600">{err}</p>}
        </div>
        <div className="px-5 py-4 border-t border-gray-100 flex justify-end gap-2 sticky bottom-0 bg-white">
          <button className="btn-secondary" onClick={onClose}>Batal</button>
          <button className="btn-primary" onClick={() => void simpan()} disabled={saving}>{saving ? 'Menyimpan...' : 'Simpan'}</button>
        </div>
      </div>
    </div>
  )
}

