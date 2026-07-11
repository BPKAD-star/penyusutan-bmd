'use client'
// Form tambah/edit item RKBMD Pengadaan (Stage 4). Logika gap:
//   eksisting  = Σ jumlah aset aktif SKPD ini untuk kode tsb (BEKU saat disusun)
//   standar    = SBSK (rkbmd_sbsk) TA ini untuk kode tsb
//   kebutuhan  = max(standar − eksisting, 0), boleh di-override operator
//   harga      = SSH (rkbmd_ssh) TA ini untuk kode tsb, boleh di-override
//   total      = kebutuhan × harga
// jumlah_eksisting disimpan sbg snapshot supaya angka telaah tidak berubah saat
// aset bergerak. Referensi memuat: Permendagri 19/2016 Pasal 20 & 28 ayat (4).
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import KodefikasiPicker, { type KodefikasiHasil } from '@/components/KodefikasiPicker'
import { formatRupiah } from '@/lib/export'
import type { RkbmdItem } from '@/lib/rkbmd'

export default function RkbmdPengadaanForm({ rkbmdId, skpdId, tahun, editItem, onSaved, onCancel }: {
  rkbmdId: string
  skpdId: number
  tahun: number
  editItem: RkbmdItem | null
  onSaved: () => void
  onCancel: () => void
}) {
  const supabase = createClient()
  const editing = !!editItem

  const [picked, setPicked] = useState<KodefikasiHasil | null>(
    editItem?.kode ? { kode: editItem.kode, uraian: editItem.nama_barang, nama_objek: null, nama_rincian: null, nama_sub_rincian: null, masa_manfaat_tahun: null, batas_kapitalisasi: null } : null,
  )
  const [namaBarang, setNamaBarang] = useState(editItem?.nama_barang || '')
  const [spesifikasi, setSpesifikasi] = useState(editItem?.spesifikasi || '')
  const [satuan, setSatuan] = useState(editItem?.satuan || '')
  const [standar, setStandar] = useState<string>(editItem?.jumlah_standar != null ? String(editItem.jumlah_standar) : '')
  const [eksisting, setEksisting] = useState<number>(editItem?.jumlah_eksisting ?? 0)
  const [kebutuhan, setKebutuhan] = useState<string>(editItem?.jumlah_kebutuhan != null ? String(editItem.jumlah_kebutuhan) : '')
  const [harga, setHarga] = useState<string>(editItem?.harga_satuan != null ? String(editItem.harga_satuan) : '')
  const [satuanPengukur, setSatuanPengukur] = useState<string>('')
  const [keterangan, setKeterangan] = useState(editItem?.keterangan || '')
  const [loadingStd, setLoadingStd] = useState(false)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const total = (Number(kebutuhan) || 0) * (Number(harga) || 0)

  // Saat kode dipilih: tarik eksisting (aset) + SBSK + SSH utk TA ini.
  async function onPick(r: KodefikasiHasil | null) {
    setPicked(r)
    if (!r) return
    setLoadingStd(true); setErr('')
    setNamaBarang(prev => prev || r.uraian || '')

    const [asetRes, sbskRes, sshRes] = await Promise.all([
      supabase.from('aset').select('jumlah').eq('status', 'aktif').eq('skpd_id', skpdId).eq('kode', r.kode),
      supabase.from('rkbmd_sbsk').select('kuantitas_standar,satuan,satuan_pengukur,spesifikasi').eq('tahun', tahun).eq('kode', r.kode).maybeSingle(),
      supabase.from('rkbmd_ssh').select('harga,satuan').eq('tahun', tahun).eq('kode', r.kode).maybeSingle(),
    ])

    const eks = (asetRes.data || []).reduce((s: number, x: { jumlah: number | null }) => s + (x.jumlah || 0), 0)
    setEksisting(eks)

    const sbsk = sbskRes.data as { kuantitas_standar: number; satuan: string | null; satuan_pengukur: string; spesifikasi: string | null } | null
    const std = sbsk?.kuantitas_standar ?? null
    setStandar(std != null ? String(std) : '')
    setSatuanPengukur(sbsk?.satuan_pengukur || '')
    if (sbsk?.spesifikasi) setSpesifikasi(prev => prev || sbsk.spesifikasi || '')
    // kebutuhan awal = max(standar − eksisting, 0)
    if (std != null) setKebutuhan(String(Math.max(std - eks, 0)))

    const ssh = sshRes.data as { harga: number; satuan: string | null } | null
    if (ssh?.harga != null) setHarga(String(ssh.harga))
    if (ssh?.satuan || sbsk?.satuan) setSatuan(prev => prev || ssh?.satuan || sbsk?.satuan || '')

    setLoadingStd(false)
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!picked) { setErr('Pilih kode barang dulu.'); return }
    setSaving(true); setErr('')
    const payload = {
      rkbmd_id: rkbmdId,
      kode: picked.kode,
      nama_barang: namaBarang || picked.uraian || null,
      spesifikasi: spesifikasi || null,
      satuan: satuan || null,
      jumlah_standar: standar === '' ? null : Number(standar),
      jumlah_eksisting: eksisting,
      jumlah_kebutuhan: kebutuhan === '' ? 0 : Number(kebutuhan),
      harga_satuan: harga === '' ? null : Number(harga),
      total_anggaran: total,
      keterangan: keterangan || null,
    }
    let error
    if (editing) {
      ({ error } = await supabase.from('rkbmd_item').update(payload).eq('id', editItem!.id))
    } else {
      // no_urut = maks + 1 dalam dokumen
      const { data: last } = await supabase.from('rkbmd_item').select('no_urut').eq('rkbmd_id', rkbmdId).order('no_urut', { ascending: false }).limit(1).maybeSingle()
      const next = ((last as { no_urut: number | null } | null)?.no_urut || 0) + 1;
      ({ error } = await supabase.from('rkbmd_item').insert({ ...payload, no_urut: next }))
    }
    if (error) { setErr(`Error: ${error.message}`); setSaving(false); return }
    setSaving(false)
    onSaved()
  }

  return (
    <form onSubmit={submit} className="card p-5 mb-4 space-y-4 border-teal/30">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-800">{editing ? 'Edit Item Pengadaan' : 'Tambah Item Pengadaan'}</h3>
        <button type="button" onClick={onCancel} className="text-xs text-gray-500 hover:text-gray-700">Tutup</button>
      </div>

      <div>
        <label className="block text-xs text-gray-500 mb-1">Kode Barang</label>
        <KodefikasiPicker picked={picked} onPick={onPick} />
        {loadingStd && <p className="text-xs text-gray-400 mt-1">Menarik data eksisting & standar...</p>}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <label className="block text-xs text-gray-500 mb-1">Nama / Spesifikasi Barang</label>
          <input className="select-filter w-full" value={namaBarang} onChange={e => setNamaBarang(e.target.value)} placeholder="Nama barang" />
          <input className="select-filter w-full mt-2" value={spesifikasi} onChange={e => setSpesifikasi(e.target.value)} placeholder="Spesifikasi (opsional)" />
        </div>
      </div>

      {/* Perhitungan gap */}
      <div className="rounded-lg bg-gray-50 p-4 grid grid-cols-2 md:grid-cols-4 gap-4">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Standar (SBSK)</label>
          <input type="number" step="any" className="select-filter w-full" value={standar} onChange={e => setStandar(e.target.value)} />
          {satuanPengukur && <p className="text-[11px] text-gray-400 mt-1">{satuanPengukur.replace(/_/g, ' ')}</p>}
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Eksisting (aset)</label>
          <input type="number" className="select-filter w-full bg-gray-100 text-gray-500" value={eksisting} readOnly />
          <p className="text-[11px] text-gray-400 mt-1">otomatis, dibekukan</p>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Kebutuhan</label>
          <input type="number" step="any" required className="select-filter w-full" value={kebutuhan} onChange={e => setKebutuhan(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Satuan</label>
          <input className="select-filter w-full" value={satuan} onChange={e => setSatuan(e.target.value)} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Harga Satuan (SSH, Rp)</label>
          <input type="number" step="any" className="select-filter w-full" value={harga} onChange={e => setHarga(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Total Anggaran</label>
          <div className="select-filter w-full bg-gray-100 text-gray-700 font-medium">{formatRupiah(total)}</div>
        </div>
        <div className="col-span-2">
          <label className="block text-xs text-gray-500 mb-1">Keterangan</label>
          <input className="select-filter w-full" value={keterangan} onChange={e => setKeterangan(e.target.value)} />
        </div>
      </div>

      {err && <p className="text-xs text-red-600">{err}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={saving} className="btn-primary">{saving ? 'Menyimpan...' : editing ? 'Simpan Perubahan' : 'Tambah Item'}</button>
        <button type="button" onClick={onCancel} className="text-sm text-gray-500 hover:text-gray-700">Batal</button>
      </div>
    </form>
  )
}
