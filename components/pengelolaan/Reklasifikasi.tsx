'use client'
// No.8a: Reklas kode barang. (No.8b reklas komptabel = DEFERRED.)
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { catatTransaksi } from '@/lib/transaksi'
import AsetPicker, { type AsetRingkas } from '@/components/AsetPicker'
import FormShell from './FormShell'

export default function Reklasifikasi() {
  const supabase = createClient()
  const [aset, setAset] = useState<AsetRingkas | null>(null)
  const [q, setQ] = useState('')
  const [kandidat, setKandidat] = useState<{ kode: string; uraian: string; masa_manfaat_tahun: number }[]>([])
  const [kodeBaru, setKodeBaru] = useState<{ kode: string; uraian: string } | null>(null)
  const [ket, setKet] = useState('')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  async function cariKode() {
    const { data } = await supabase.from('kodefikasi_bmd')
      .select('kode,uraian,masa_manfaat_tahun')
      .or(`kode.ilike.${q}%,uraian.ilike.%${q}%`).limit(20)
    setKandidat(data || [])
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!aset || !kodeBaru) return
    setSaving(true)
    const { error } = await catatTransaksi(supabase, {
      asetId: aset.id, jenis: 'reklas_kode',
      payload: { kode_lama: aset.kode, kode_baru: kodeBaru.kode, uraian_baru: kodeBaru.uraian },
      keterangan: ket || undefined,
    })
    setMsg(error ? `Error: ${error}` : `Reklas kode tercatat: ${aset.kode} → ${kodeBaru.kode}.`)
    if (!error) { setAset(null); setKodeBaru(null); setKet('') }
    setSaving(false)
  }

  return (
    <FormShell judul="Reklasifikasi" msg={msg} deskripsi="Ganti kode barang aset ke kode lain di kodefikasi BMD.">
      <div className="space-y-4 max-w-2xl">
        <form onSubmit={submit} className="card p-6 space-y-4">
          <h2 className="text-base font-semibold text-gray-800">Reklas Kode Barang</h2>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Aset</label>
            <AsetPicker selected={aset} onSelect={setAset} />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Kode Baru (dari kodefikasi BMD)</label>
            {kodeBaru ? (
              <div className="flex items-center justify-between p-3 bg-teal/5 border border-teal/30 rounded-lg text-sm">
                <span className="font-mono text-xs">{kodeBaru.kode} — {kodeBaru.uraian}</span>
                <button type="button" className="btn-secondary text-xs" onClick={() => setKodeBaru(null)}>Ganti</button>
              </div>
            ) : (
              <>
                <div className="flex gap-2">
                  <input className="select-filter flex-1" placeholder="Cari kode / uraian..." value={q}
                    onChange={e => setQ(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); cariKode() } }} />
                  <button type="button" className="btn-secondary" onClick={cariKode}>Cari</button>
                </div>
                {kandidat.length > 0 && (
                  <div className="mt-2 border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-56 overflow-y-auto">
                    {kandidat.map(k => (
                      <button key={k.kode} type="button" onClick={() => { setKodeBaru(k); setKandidat([]) }}
                        className="w-full text-left px-3 py-2 hover:bg-gray-50 text-xs">
                        <span className="font-mono">{k.kode}</span> — {k.uraian}
                        <span className="text-gray-400"> (MM {k.masa_manfaat_tahun} th)</span>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Keterangan / dasar reklas</label>
            <input className="select-filter w-full" value={ket} onChange={e => setKet(e.target.value)} />
          </div>
          <p className="text-xs text-amber-700 bg-amber-50 rounded-lg p-2">
            Reklas ke golongan Aset Lain-Lain (1.5.4) otomatis menghentikan penyusutan sejak periode ini.
          </p>
          <button className="btn-primary" disabled={saving || !aset || !kodeBaru}>{saving ? 'Menyimpan...' : 'Catat Reklasifikasi'}</button>
        </form>
        <div className="card p-4 text-sm text-gray-400 border-dashed">
          <span className="font-medium text-gray-500">Reklas Komptabel</span> — ditunda (menunggu rules).
          Struktur data sudah disiapkan; form diaktifkan setelah aturan ditetapkan.
        </div>
      </div>
    </FormShell>
  )
}
