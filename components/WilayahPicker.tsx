'use client'
// Pemilih lokasi fisik berjenjang: Provinsi → Kabupaten/Kota → Kecamatan →
// Desa/Kelurahan, dari tabel `wilayah` (kode Kemendagri, lihat migrasi 14/15).
// value/onChange = kode wilayah level TERAKHIR (desa/kelurahan, level 4) —
// itu yang disimpan di `aset.wilayah_kode`. Dataset kecil (372 baris Jatim +
// Kab. Kediri) jadi cukup native <select> berjenjang, tanpa typeahead.
import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type WRow = { kode: string; nama: string; level: number; parent_kode: string | null }

export default function WilayahPicker({ value, onChange }: {
  value: string
  onChange: (kode: string) => void
}) {
  const supabase = createClient()
  const [all, setAll] = useState<WRow[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    (async () => {
      const rows: WRow[] = []
      for (let from = 0; ; from += 1000) {
        const { data } = await supabase.from('wilayah').select('kode,nama,level,parent_kode').range(from, from + 999)
        if (!data || data.length === 0) break
        rows.push(...(data as WRow[]))
        if (data.length < 1000) break
      }
      setAll(rows)
      setLoaded(true)
    })()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const byKode = useMemo(() => new Map(all.map(w => [w.kode, w])), [all])
  const childrenOf = useMemo(() => {
    const m = new Map<string, WRow[]>()
    for (const w of all) if (w.parent_kode) { const a = m.get(w.parent_kode) || []; a.push(w); m.set(w.parent_kode, a) }
    for (const arr of m.values()) arr.sort((a, b) => a.nama.localeCompare(b.nama))
    return m
  }, [all])
  const provinsiList = useMemo(() => all.filter(w => w.level === 1).sort((a, b) => a.nama.localeCompare(b.nama)), [all])

  // Turunkan rantai provinsi/kab/kec/desa dari `value` (kode desa) yang tersimpan.
  const chain = useMemo(() => {
    const out: { prov: string; kab: string; kec: string; desa: string } = { prov: '', kab: '', kec: '', desa: '' }
    if (!value) return out
    let cur = byKode.get(value)
    while (cur) {
      if (cur.level === 4) out.desa = cur.kode
      else if (cur.level === 3) out.kec = cur.kode
      else if (cur.level === 2) out.kab = cur.kode
      else if (cur.level === 1) out.prov = cur.kode
      cur = cur.parent_kode ? byKode.get(cur.parent_kode) : undefined
    }
    return out
  }, [value, byKode])

  const [prov, setProv] = useState(chain.prov)
  const [kab, setKab] = useState(chain.kab)
  const [kec, setKec] = useState(chain.kec)
  // Sinkron ulang kalau `value` berubah dari luar (mis. buka modal barang lain).
  useEffect(() => { setProv(chain.prov); setKab(chain.kab); setKec(chain.kec) }, [chain.prov, chain.kab, chain.kec])

  const kabList = prov ? (childrenOf.get(prov) || []) : []
  const kecList = kab ? (childrenOf.get(kab) || []) : []
  const desaList = kec ? (childrenOf.get(kec) || []) : []

  return (
    <div className="grid grid-cols-2 gap-2">
      <div>
        <label className="block text-[11px] text-gray-400 mb-0.5">Provinsi</label>
        <select className="select-filter w-full text-sm" value={prov}
          onChange={e => { setProv(e.target.value); setKab(''); setKec(''); onChange('') }} disabled={!loaded}>
          <option value="">— pilih —</option>
          {provinsiList.map(p => <option key={p.kode} value={p.kode}>{p.nama}</option>)}
        </select>
      </div>
      <div>
        <label className="block text-[11px] text-gray-400 mb-0.5">Kabupaten/Kota</label>
        <select className="select-filter w-full text-sm" value={kab}
          onChange={e => { setKab(e.target.value); setKec(''); onChange('') }} disabled={!prov}>
          <option value="">— pilih —</option>
          {kabList.map(k => <option key={k.kode} value={k.kode}>{k.nama}</option>)}
        </select>
      </div>
      <div>
        <label className="block text-[11px] text-gray-400 mb-0.5">Kecamatan</label>
        <select className="select-filter w-full text-sm" value={kec}
          onChange={e => { setKec(e.target.value); onChange('') }} disabled={!kab}>
          <option value="">— pilih —</option>
          {kecList.map(k => <option key={k.kode} value={k.kode}>{k.nama}</option>)}
        </select>
      </div>
      <div>
        <label className="block text-[11px] text-gray-400 mb-0.5">Desa/Kelurahan</label>
        <select className="select-filter w-full text-sm" value={value}
          onChange={e => onChange(e.target.value)} disabled={!kec}>
          <option value="">— pilih —</option>
          {desaList.map(d => <option key={d.kode} value={d.kode}>{d.nama}</option>)}
        </select>
      </div>
    </div>
  )
}
