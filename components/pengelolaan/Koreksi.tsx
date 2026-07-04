'use client'
// No.9: Koreksi nilai & spesifikasi. (No.9c koreksi kuantitas split/merge = DEFERRED.)
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { catatTransaksi } from '@/lib/transaksi'
import { formatRupiah } from '@/lib/export'
import AsetPicker, { type AsetRingkas } from '@/components/AsetPicker'
import FormShell from './FormShell'

const SPEK_KOSONG = { nama_barang: '', spesifikasi_lainnya: '', merek_tipe: '', satuan: '' }
const TANAH_KOSONG = { luas: '', nomor_dokumen_kepemilikan: '', tanggal_dokumen_kepemilikan: '', nama_dokumen_kepemilikan: '', jenis_hak: '' }
const HAK_OPT = ['HM (Hak Milik)', 'HGB (Hak Guna Bangunan)', 'HP (Hak Pakai)', 'HGU (Hak Guna Usaha)', 'HPL (Hak Pengelolaan)']

export default function Koreksi() {
  const supabase = createClient()
  const [aset, setAset] = useState<AsetRingkas | null>(null)
  const [mode, setMode] = useState<'nilai' | 'spesifikasi'>('nilai')
  const [nilaiBaru, setNilaiBaru] = useState('')
  const [spek, setSpek] = useState(SPEK_KOSONG)
  const [tanah, setTanah] = useState(TANAH_KOSONG)
  const [ket, setKet] = useState('')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  const isTanah = aset?.kode.startsWith('1.3.1') ?? false

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!aset) return
    setSaving(true)
    let error: string | undefined
    if (mode === 'nilai') {
      const baru = parseFloat(nilaiBaru)
      if (isNaN(baru) || baru < 0) { setMsg('Error: nilai baru tidak valid.'); setSaving(false); return }
      const delta = baru - aset.nilai_perolehan
      ;({ error } = await catatTransaksi(supabase, {
        asetId: aset.id, jenis: 'koreksi_nilai', nilai: delta,
        payload: { nilai_lama: aset.nilai_perolehan, nilai_perolehan_baru: baru, delta },
        keterangan: ket || undefined,
      }))
    } else {
      const isiTeks = Object.fromEntries(Object.entries(spek).filter(([, v]) => v.trim() !== ''))
      const isiTanah: Record<string, unknown> = {}
      if (isTanah) {
        if (tanah.nomor_dokumen_kepemilikan.trim()) isiTanah.nomor_dokumen_kepemilikan = tanah.nomor_dokumen_kepemilikan.trim()
        if (tanah.tanggal_dokumen_kepemilikan) isiTanah.tanggal_dokumen_kepemilikan = tanah.tanggal_dokumen_kepemilikan
        if (tanah.nama_dokumen_kepemilikan.trim()) isiTanah.nama_dokumen_kepemilikan = tanah.nama_dokumen_kepemilikan.trim()
        if (tanah.jenis_hak.trim()) isiTanah.jenis_hak = tanah.jenis_hak.trim()
        const luas = parseFloat(tanah.luas)
        if (!isNaN(luas) && luas > 0) isiTanah.luas = luas
      }
      const isi = { ...isiTeks, ...isiTanah }
      if (Object.keys(isi).length === 0) { setMsg('Error: tidak ada field yang diubah.'); setSaving(false); return }
      ;({ error } = await catatTransaksi(supabase, {
        asetId: aset.id, jenis: 'koreksi_spesifikasi', payload: isi, keterangan: ket || undefined,
      }))
    }
    setMsg(error ? `Error: ${error}` : 'Koreksi tercatat di ledger.')
    if (!error) { setAset(null); setNilaiBaru(''); setSpek(SPEK_KOSONG); setTanah(TANAH_KOSONG); setKet('') }
    setSaving(false)
  }

  return (
    <FormShell judul="Koreksi" msg={msg} deskripsi="Koreksi nilai perolehan atau spesifikasi aset. Koreksi = transaksi baru, tidak mengubah histori.">
      <div className="space-y-4 max-w-2xl">
        <form onSubmit={submit} className="card p-6 space-y-4">
          <div className="flex gap-2">
            {(['nilai', 'spesifikasi'] as const).map(m => (
              <button key={m} type="button" onClick={() => setMode(m)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium ${mode === m ? 'bg-teal text-white' : 'bg-gray-100 text-gray-600'}`}>
                Koreksi {m === 'nilai' ? 'Nilai' : 'Spesifikasi'}
              </button>
            ))}
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Aset</label>
            <AsetPicker selected={aset} onSelect={setAset} />
          </div>
          {mode === 'nilai' ? (
            <div>
              <label className="block text-xs text-gray-500 mb-1">
                Nilai Perolehan Baru (Rp) {aset && <span className="text-gray-400">— sekarang {formatRupiah(aset.nilai_perolehan)}</span>}
              </label>
              <input type="number" min="0" step="1" className="select-filter w-full" value={nilaiBaru}
                onChange={e => setNilaiBaru(e.target.value)} required />
              <p className="text-xs text-gray-400 mt-1">Selisih (delta) dicatat di ledger; beban penyusutan disebar ulang ke sisa umur oleh engine.</p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                {(Object.keys(spek) as (keyof typeof spek)[]).map(k => (
                  <div key={k}>
                    <label className="block text-xs text-gray-500 mb-1 capitalize">{k.replace('_', ' ')}</label>
                    <input className="select-filter w-full" value={spek[k]} placeholder="(kosongkan jika tidak berubah)"
                      onChange={e => setSpek(s => ({ ...s, [k]: e.target.value }))} />
                  </div>
                ))}
              </div>
              {isTanah && (
                <div className="pt-3 border-t border-gray-100">
                  <p className="text-xs font-medium text-gray-600 mb-2">Data Tanah (kode 1.3.1)</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Luas (m²)</label>
                      <input type="number" min="0" step="0.01" className="select-filter w-full" value={tanah.luas}
                        placeholder="(kosongkan jika tidak berubah)"
                        onChange={e => setTanah(s => ({ ...s, luas: e.target.value }))} />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Nomor Dokumen Kepemilikan</label>
                      <input className="select-filter w-full" value={tanah.nomor_dokumen_kepemilikan} placeholder="(kosongkan jika tidak berubah)"
                        onChange={e => setTanah(s => ({ ...s, nomor_dokumen_kepemilikan: e.target.value }))} />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Tanggal Dokumen Kepemilikan</label>
                      <input type="date" className="select-filter w-full" value={tanah.tanggal_dokumen_kepemilikan}
                        onChange={e => setTanah(s => ({ ...s, tanggal_dokumen_kepemilikan: e.target.value }))} />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Nama Dokumen Kepemilikan</label>
                      <input className="select-filter w-full" value={tanah.nama_dokumen_kepemilikan} placeholder="(kosongkan jika tidak berubah)"
                        onChange={e => setTanah(s => ({ ...s, nama_dokumen_kepemilikan: e.target.value }))} />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-xs text-gray-500 mb-1">Jenis Hak</label>
                      <select className="select-filter w-full" value={tanah.jenis_hak}
                        onChange={e => setTanah(s => ({ ...s, jenis_hak: e.target.value }))}>
                        <option value="">(kosongkan jika tidak berubah)</option>
                        {HAK_OPT.map(h => <option key={h} value={h}>{h}</option>)}
                      </select>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
          <div>
            <label className="block text-xs text-gray-500 mb-1">Keterangan / dasar koreksi</label>
            <input className="select-filter w-full" value={ket} onChange={e => setKet(e.target.value)} />
          </div>
          <button className="btn-primary" disabled={saving || !aset}>{saving ? 'Menyimpan...' : 'Catat Koreksi'}</button>
        </form>
        <div className="card p-4 text-sm text-gray-400 border-dashed">
          <span className="font-medium text-gray-500">Koreksi Kuantitas (split/merge)</span> — ditunda:
          rumus alokasi akumulasi penyusutan belum ditetapkan. Struktur ledger sudah siap.
        </div>
      </div>
    </FormShell>
  )
}
