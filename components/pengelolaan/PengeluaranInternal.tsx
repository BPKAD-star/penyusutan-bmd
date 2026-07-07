'use client'
// No.6: Pengeluaran internal — pindah BMD ke sub-SKPD lain dalam induk yang sama.
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { catatTransaksi } from '@/lib/transaksi'
import AsetPicker, { type AsetRingkas } from '@/components/AsetPicker'
import FormShell from './FormShell'

type Skpd = { id: number; nama: string; level: number; parent_id: number | null }

export default function PengeluaranInternal() {
  const supabase = createClient()
  const [aset, setAset] = useState<AsetRingkas | null>(null)
  const [tujuanList, setTujuanList] = useState<Skpd[]>([])
  const [tujuan, setTujuan] = useState<number | ''>('')
  const [ket, setKet] = useState('')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    setTujuan(''); setTujuanList([])
    if (!aset?.skpd_id) return
    (async () => {
      let { data: node } = await supabase.from('skpd').select('id,nama,level,parent_id').eq('id', aset.skpd_id!).single()
      while (node && node.level > 1 && node.parent_id) {
        const { data: parent } = await supabase.from('skpd').select('id,nama,level,parent_id').eq('id', node.parent_id).single()
        if (!parent) break
        node = parent
      }
      if (!node) return
      const { data: anak } = await supabase.from('skpd').select('id,nama,level,parent_id').eq('parent_id', node.id)
      const anakIds = (anak || []).map(a => a.id)
      const { data: cucu } = anakIds.length
        ? await supabase.from('skpd').select('id,nama,level,parent_id').in('parent_id', anakIds)
        : { data: [] }
      setTujuanList([node, ...(anak || []), ...(cucu || [])].filter(s => s.id !== aset.skpd_id))
    })()
  }, [aset]) // eslint-disable-line react-hooks/exhaustive-deps

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!aset || !tujuan) return
    setSaving(true)
    const { error } = await catatTransaksi(supabase, {
      asetId: aset.id, jenis: 'mutasi_internal',
      skpdAsal: aset.skpd_id, skpdTujuan: Number(tujuan), keterangan: ket || undefined,
    })
    setMsg(error ? `Error: ${error}` : `Mutasi internal tercatat: ${aset.nama_barang} → ${tujuanList.find(s => s.id === tujuan)?.nama}.`)
    if (!error) { setAset(null); setTujuan(''); setKet('') }
    setSaving(false)
  }

  return (
    <FormShell judul="Pengeluaran Internal" msg={msg}
      deskripsi="Pindahkan BMD ke sub-SKPD lain dalam SKPD induk yang sama. Sisi penerima otomatis muncul di menu Penerimaan Internal.">
      <form onSubmit={submit} className="card p-6 max-w-2xl space-y-4">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Aset</label>
          <AsetPicker selected={aset} onSelect={setAset} />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Sub-SKPD Tujuan (satu induk)</label>
          <select className="select-filter w-full" value={tujuan} required disabled={!aset}
            onChange={e => setTujuan(e.target.value ? Number(e.target.value) : '')}>
            <option value="">— pilih tujuan —</option>
            {tujuanList.map(s => <option key={s.id} value={s.id}>{' '.repeat((s.level - 1) * 3)}{s.nama}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Keterangan / No. Berita Acara</label>
          <input className="select-filter w-full" value={ket} onChange={e => setKet(e.target.value)} />
        </div>
        <button className="btn-primary" disabled={saving || !aset || !tujuan}>{saving ? 'Menyimpan...' : 'Catat Mutasi Internal'}</button>
      </form>
    </FormShell>
  )
}
