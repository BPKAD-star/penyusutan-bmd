'use client'
// Isian lembar "BMD Belum Tercatat" (Format III.A.7) — dipisah dari LkiForm yang
// sudah terlalu panjang. Urutan & daftar isian ditetapkan user 2026-10-02:
// Kode Barang → Satuan → Kuantitas → Nilai per item → Tanggal Perolehan →
// spesifikasi lengkap (sesuai golongan). Catatan Inventarisasi & Foto ada di
// LkiForm (dipakai bersama lembar biasa). SEMUA WAJIB — aturannya satu sumber di
// lib/inventarisasiBaru.ts (`kekuranganBaru`), form ini hanya menandai.
import dynamic from 'next/dynamic'
import KodefikasiPicker, { type KodefikasiHasil } from '@/components/KodefikasiPicker'
import WilayahPicker from '@/components/WilayahPicker'
import NominalInput from '@/shared/ui/NominalInput'
import { FIELD_LABEL, FIELD_TYPE, opsiDenganKosong, type FieldKey } from '@/lib/asetFields'
import { fieldBaru, kunciBaru, type BaruData } from '@/lib/inventarisasiBaru'
import type { KondisiFisik } from '@/lib/inventarisasi'

// MapPicker butuh `window` (Leaflet) → WAJIB dynamic tanpa SSR (aturan CLAUDE.md).
const MapPicker = dynamic(() => import('@/components/MapPicker'), { ssr: false })

const KONDISI: { v: KondisiFisik; l: string }[] = [
  { v: 'B', l: 'Baik' }, { v: 'RR', l: 'Rusak Ringan' }, { v: 'RB', l: 'Rusak Berat' },
]

function Label({ children }: { children: React.ReactNode }) {
  return <label className="block text-xs text-gray-500 mb-1">{children} <span className="text-red-500">*</span></label>
}

export default function BelumTercatatForm({
  baru, golongan, kodefikasi, satuanOpsi, readOnly, setBaru, setJumlahHarga, onPickKode,
}: {
  baru: BaruData
  golongan: string
  kodefikasi: KodefikasiHasil | null
  satuanOpsi: string[]
  readOnly?: boolean
  setBaru: (k: string, v: unknown) => void
  setJumlahHarga: (k: 'jumlah' | 'harga_satuan', raw: string) => void
  onPickKode: (r: KodefikasiHasil | null) => void
}) {
  const nilaiTotal = Number(baru.jumlah) > 0 && Number(baru.harga_satuan) > 0
    ? Number(baru.jumlah) * Number(baru.harga_satuan) : null

  function isian(k: FieldKey) {
    const type = FIELD_TYPE[k]
    const nilai = baru[kunciBaru(k)]
    if (type === 'latlong') {
      return (
        <div key={k} className="col-span-2">
          <Label>Titik Koordinat</Label>
          <MapPicker
            latitude={baru.latitude != null ? String(baru.latitude) : ''}
            longitude={baru.longitude != null ? String(baru.longitude) : ''}
            onChange={(lat, lng) => {
              setBaru('latitude', lat === '' ? null : Number(lat))
              setBaru('longitude', lng === '' ? null : Number(lng))
            }}
          />
        </div>
      )
    }
    if (type === 'wilayah') {
      return (
        <div key={k} className="col-span-2">
          <Label>{FIELD_LABEL[k]}</Label>
          <WilayahPicker value={baru.wilayah_kode || ''} onChange={v => setBaru('wilayah_kode', v)} />
        </div>
      )
    }
    if (k === 'kondisi_barang') {
      return (
        <div key={k} className="col-span-2">
          <Label>Kondisi Barang</Label>
          <div className="flex gap-4 text-xs">
            {KONDISI.map(o => (
              <label key={o.v} className="flex items-center gap-1.5 cursor-pointer">
                <input type="radio" checked={baru.kondisi === o.v} disabled={readOnly}
                  onChange={() => setBaru('kondisi', o.v)} />{o.l}
              </label>
            ))}
          </div>
        </div>
      )
    }
    if (type === 'select') {
      return (
        <div key={k}>
          <Label>{FIELD_LABEL[k]}</Label>
          <select className="select-filter w-full" disabled={readOnly}
            value={String(nilai ?? '')} onChange={e => setBaru(kunciBaru(k), e.target.value)}>
            {opsiDenganKosong(k).map(o => <option key={o.value} value={o.value}>{o.value === '' ? '— pilih —' : o.label}</option>)}
          </select>
        </div>
      )
    }
    if (type === 'textarea') {
      return (
        <div key={k} className="col-span-2">
          <Label>{FIELD_LABEL[k]}</Label>
          <textarea className="select-filter w-full" rows={2} disabled={readOnly}
            value={String(nilai ?? '')} onChange={e => setBaru(kunciBaru(k), e.target.value)} />
        </div>
      )
    }
    if (type === 'number') {
      return (
        <div key={k}>
          <Label>{FIELD_LABEL[k]}</Label>
          <input type="number" min="0" step="any" className="select-filter w-full" disabled={readOnly}
            value={nilai == null ? '' : String(nilai)}
            onChange={e => setBaru(kunciBaru(k), e.target.value === '' ? undefined : Number(e.target.value))} />
        </div>
      )
    }
    return (
      <div key={k} className={k === 'nama_barang' || k === 'alamat_detail' ? 'col-span-2' : undefined}>
        <Label>{FIELD_LABEL[k]}</Label>
        <input type={type === 'date' ? 'date' : 'text'} className="select-filter w-full" disabled={readOnly}
          value={String(nilai ?? '')} onChange={e => setBaru(kunciBaru(k), e.target.value)} />
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="col-span-2">
        <Label>Kode Barang</Label>
        <KodefikasiPicker picked={kodefikasi} golonganTetap={golongan} onPick={onPickKode} />
        <p className="text-[11px] text-gray-400 mt-1">
          {baru.nama_barang ? <>Uraian: <b>{baru.nama_barang}</b>. </> : null}
          Pilihan dibatasi golongan <b>{golongan}</b>.
        </p>
      </div>
      <div>
        <Label>Satuan Barang</Label>
        <select className="select-filter w-full" disabled={readOnly}
          value={baru.satuan || ''} onChange={e => setBaru('satuan', e.target.value)}>
          <option value="">— pilih satuan —</option>
          {satuanOpsi.map(n => <option key={n} value={n}>{n}</option>)}
        </select>
        <p className="text-[11px] text-gray-400 mt-1">Daftar dari menu Admin → Daftar Satuan.</p>
      </div>
      <div>
        <Label>Kuantitas</Label>
        <input type="number" min="1" className="select-filter w-full" disabled={readOnly}
          value={baru.jumlah ?? ''} onChange={e => setJumlahHarga('jumlah', e.target.value)} />
      </div>
      <div>
        <Label>Nilai per item (Rp)</Label>
        <NominalInput className="select-filter w-full" disabled={readOnly}
          value={String(baru.harga_satuan ?? '')} onChange={v => setJumlahHarga('harga_satuan', v)} />
        {nilaiTotal != null && (
          <p className="text-[11px] text-gray-400 mt-1">
            Nilai perolehan total: <b>Rp{nilaiTotal.toLocaleString('id-ID')}</b>
          </p>
        )}
      </div>
      <div>
        <Label>Tanggal Perolehan</Label>
        <input type="date" className="select-filter w-full" disabled={readOnly}
          value={baru.tgl_perolehan || ''} onChange={e => setBaru('tgl_perolehan', e.target.value)} />
        <p className="text-[11px] text-gray-400 mt-1">Tanggal barang diperoleh/dibuat — dasar penyusutan.</p>
      </div>

      <div className="col-span-2 border-t border-gray-100 pt-3 -mb-1">
        <p className="text-xs font-semibold text-gray-700">Spesifikasi barang</p>
      </div>
      {fieldBaru(golongan).map(isian)}
    </div>
  )
}
