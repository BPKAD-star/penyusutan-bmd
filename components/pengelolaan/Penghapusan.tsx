'use client'
// No.11: Penghapusan — pemindahtanganan, pengalihan status (antar SKPD), sebab lain.
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { catatTransaksi } from '@/lib/transaksi'
import { JENIS_TRANSAKSI_LABEL } from '@/lib/bmd'
import AsetPicker, { type AsetRingkas } from '@/components/AsetPicker'
import FormShell from './FormShell'

export default function Penghapusan() {
  const supabase = createClient()
  const [aset, setAset] = useState<AsetRingkas | null>(null)
  const [jenis, setJenis] = useState<'penghapusan_pemindahtanganan' | 'pengalihan_status' | 'penghapusan_sebab_lain'>('penghapusan_pemindahtanganan')
  const [subJenis, setSubJenis] = useState('hibah')
  const [skpdL1, setSkpdL1] = useState<{ id: number; nama: string }[]>([])
  const [tujuan, setTujuan] = useState<number | ''>('')
  const [ket, setKet] = useState('')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    supabase.from('skpd').select('id,nama').eq('level', 1).order('nama').then(({ data }) => setSkpdL1(data || []))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!aset) return
    if (jenis === 'pengalihan_status' && !tujuan) { setMsg('Error: pilih SKPD tujuan.'); return }
    setSaving(true)
    const { error } = await catatTransaksi(supabase, {
      asetId: aset.id, jenis, nilai: aset.nilai_perolehan, skpdAsal: aset.skpd_id,
      skpdTujuan: jenis === 'pengalihan_status' ? Number(tujuan) : null,
      payload: jenis === 'penghapusan_pemindahtanganan' ? { sub_jenis: subJenis } : {},
      keterangan: ket || undefined,
    })
    setMsg(error ? `Error: ${error}` :
      jenis === 'pengalihan_status'
        ? `Pengalihan status tercatat — barang pindah ke ${skpdL1.find(s => s.id === tujuan)?.nama} dan muncul di menu Penggunaan mereka.`
        : 'Penghapusan tercatat — barang hilang dari laporan tapi tetap tersimpan di database. Penyusutan berhenti.')
    if (!error) { setAset(null); setTujuan(''); setKet('') }
    setSaving(false)
  }

  return (
    <FormShell judul="Penghapusan" msg={msg} deskripsi="Pemindahtanganan, pengalihan status antar SKPD, atau sebab lain. Soft-delete: data tetap tersimpan.">
      <form onSubmit={submit} className="card p-6 max-w-2xl space-y-4">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Jenis Penghapusan</label>
          <select className="select-filter w-full" value={jenis} onChange={e => setJenis(e.target.value as typeof jenis)}>
            <option value="penghapusan_pemindahtanganan">Pemindahtanganan</option>
            <option value="pengalihan_status">Pengalihan Status (transfer ke SKPD lain)</option>
            <option value="penghapusan_sebab_lain">Sebab Lain (force majeure)</option>
          </select>
        </div>
        {jenis === 'penghapusan_pemindahtanganan' && (
          <div>
            <label className="block text-xs text-gray-500 mb-1">Bentuk Pemindahtanganan</label>
            <select className="select-filter w-full" value={subJenis} onChange={e => setSubJenis(e.target.value)}>
              <option value="hibah">Hibah</option>
              <option value="penjualan">Penjualan</option>
              <option value="tukar_menukar">Tukar-Menukar</option>
              <option value="penyertaan_modal">Penyertaan Modal Pemerintah</option>
            </select>
          </div>
        )}
        {jenis === 'pengalihan_status' && (
          <div>
            <label className="block text-xs text-gray-500 mb-1">SKPD Tujuan (pengguna barang)</label>
            <select className="select-filter w-full" value={tujuan} required
              onChange={e => setTujuan(e.target.value ? Number(e.target.value) : '')}>
              <option value="">— pilih SKPD —</option>
              {skpdL1.map(s => <option key={s.id} value={s.id}>{s.nama}</option>)}
            </select>
          </div>
        )}
        <div>
          <label className="block text-xs text-gray-500 mb-1">Aset</label>
          <AsetPicker selected={aset} onSelect={setAset} />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Keterangan / dasar (SK, BA, dll)</label>
          <input className="select-filter w-full" value={ket} onChange={e => setKet(e.target.value)} />
        </div>
        <p className="text-xs text-gray-400">
          {jenis === 'pengalihan_status'
            ? 'Aset pindah SKPD, penyusutan jalan terus di SKPD baru.'
            : `${JENIS_TRANSAKSI_LABEL[jenis]}: soft-delete — data & histori tetap di database, penyusutan berhenti.`}
        </p>
        <button className="btn-primary" disabled={saving || !aset}>{saving ? 'Menyimpan...' : 'Catat Penghapusan'}</button>
      </form>
    </FormShell>
  )
}
