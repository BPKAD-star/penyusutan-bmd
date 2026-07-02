'use client'
// No.9: Koreksi nilai & spesifikasi. (No.9c koreksi kuantitas split/merge = DEFERRED.)
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { catatTransaksi } from '@/lib/transaksi'
import { formatRupiah } from '@/lib/export'
import AsetPicker, { type AsetRingkas } from '@/components/AsetPicker'
import FormShell from './FormShell'

export default function Koreksi() {
  const supabase = createClient()
  const [aset, setAset] = useState<AsetRingkas | null>(null)
  const [mode, setMode] = useState<'nilai' | 'spesifikasi'>('nilai')
  const [nilaiBaru, setNilaiBaru] = useState('')
  const [spek, setSpek] = useState({ nama_barang: '', spesifikasi: '', merek_tipe: '', satuan: '' })
  const [ket, setKet] = useState('')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

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
      const isi = Object.fromEntries(Object.entries(spek).filter(([, v]) => v.trim() !== ''))
      if (Object.keys(isi).length === 0) { setMsg('Error: tidak ada field yang diubah.'); setSaving(false); return }
      ;({ error } = await catatTransaksi(supabase, {
        asetId: aset.id, jenis: 'koreksi_spesifikasi', payload: isi, keterangan: ket || undefined,
      }))
    }
    setMsg(error ? `Error: ${error}` : 'Koreksi tercatat di ledger.')
    if (!error) { setAset(null); setNilaiBaru(''); setSpek({ nama_barang: '', spesifikasi: '', merek_tipe: '', satuan: '' }); setKet('') }
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
            <div className="grid grid-cols-2 gap-3">
              {(Object.keys(spek) as (keyof typeof spek)[]).map(k => (
                <div key={k}>
                  <label className="block text-xs text-gray-500 mb-1 capitalize">{k.replace('_', ' ')}</label>
                  <input className="select-filter w-full" value={spek[k]} placeholder="(kosongkan jika tidak berubah)"
                    onChange={e => setSpek(s => ({ ...s, [k]: e.target.value }))} />
                </div>
              ))}
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
