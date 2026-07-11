'use client'
// Form tambah/edit item RKBMD berbasis aset eksisting (Stage 5) untuk 4 jenis:
// Pemeliharaan, Pemanfaatan, Pemindahtanganan, Penghapusan. Kolom mengikuti
// lampiran format Permendagri 7/2024. Pilih aset dari Daftar Barang (scope SKPD
// dokumen), snapshot identitasnya, lalu isi atribut per jenis.
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import AsetPicker, { type AsetRingkas } from '@/components/AsetPicker'
import { BENTUK_PEMANFAATAN, BENTUK_PEMINDAHTANGANAN, type RkbmdItem, type RkbmdJenis } from '@/lib/rkbmd'

const JUDUL: Record<Exclude<RkbmdJenis, 'pengadaan'>, string> = {
  pemeliharaan: 'Pemeliharaan', pemanfaatan: 'Pemanfaatan',
  pemindahtanganan: 'Pemindahtanganan', penghapusan: 'Penghapusan',
}

export default function RkbmdAsetForm({ jenis, rkbmdId, skpdId, editItem, onSaved, onCancel }: {
  jenis: Exclude<RkbmdJenis, 'pengadaan'>
  rkbmdId: string
  skpdId: number
  editItem: RkbmdItem | null
  onSaved: () => void
  onCancel: () => void
}) {
  const supabase = createClient()
  const editing = !!editItem

  const [aset, setAset] = useState<AsetRingkas | null>(
    editItem?.aset_id
      ? { id: editItem.aset_id, nibar: editItem.nibar, kode: editItem.kode || '', nama_barang: editItem.nama_barang, nilai_perolehan: editItem.nilai_perolehan ?? 0, skpd_id: skpdId, status: 'aktif', skpd: null }
      : null,
  )
  const [jumlah, setJumlah] = useState(editItem?.jumlah != null ? String(editItem.jumlah) : '1')
  const [lokasi, setLokasi] = useState(editItem?.lokasi || '')
  const [kondisi, setKondisi] = useState(editItem?.kondisi || '')
  const [uraianPemeliharaan, setUraianPemeliharaan] = useState(editItem?.uraian_pemeliharaan || '')
  const [totalAnggaran, setTotalAnggaran] = useState(editItem?.total_anggaran != null ? String(editItem.total_anggaran) : '')
  const [peruntukan, setPeruntukan] = useState(editItem?.peruntukan || '')
  const [bentuk, setBentuk] = useState(editItem?.bentuk || '')
  const [jangkaWaktu, setJangkaWaktu] = useState(editItem?.jangka_waktu || '')
  const [nilaiPerolehan, setNilaiPerolehan] = useState(editItem?.nilai_perolehan != null ? String(editItem.nilai_perolehan) : '')
  const [alasan, setAlasan] = useState(editItem?.alasan || '')
  const [keterangan, setKeterangan] = useState(editItem?.keterangan || '')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  function onSelect(a: AsetRingkas | null) {
    setAset(a)
    if (a && (jenis === 'pemindahtanganan' || jenis === 'penghapusan')) {
      setNilaiPerolehan(prev => prev || String(a.nilai_perolehan))
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!aset) { setErr('Pilih aset dulu.'); return }
    setSaving(true); setErr('')

    const base = {
      rkbmd_id: rkbmdId,
      aset_id: aset.id,
      kode: aset.kode || null,
      nibar: aset.nibar,
      nama_barang: aset.nama_barang,
      jumlah: jumlah === '' ? null : Number(jumlah),
      keterangan: keterangan || null,
    }
    const perJenis: Record<string, unknown> =
      jenis === 'pemeliharaan'
        ? { kondisi: kondisi || null, uraian_pemeliharaan: uraianPemeliharaan || null, total_anggaran: totalAnggaran === '' ? null : Number(totalAnggaran) }
        : jenis === 'pemanfaatan'
        ? { lokasi: lokasi || null, peruntukan: peruntukan || null, bentuk: bentuk || null, jangka_waktu: jangkaWaktu || null }
        : jenis === 'pemindahtanganan'
        ? { lokasi: lokasi || null, nilai_perolehan: nilaiPerolehan === '' ? null : Number(nilaiPerolehan), bentuk: bentuk || null, alasan: alasan || null }
        : { nilai_perolehan: nilaiPerolehan === '' ? null : Number(nilaiPerolehan), alasan: alasan || null }

    const payload = { ...base, ...perJenis }
    let error
    if (editing) {
      ({ error } = await supabase.from('rkbmd_item').update(payload).eq('id', editItem!.id))
    } else {
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
        <h3 className="text-sm font-semibold text-gray-800">{editing ? 'Edit' : 'Tambah'} Item {JUDUL[jenis]}</h3>
        <button type="button" onClick={onCancel} className="text-xs text-gray-500 hover:text-gray-700">Tutup</button>
      </div>

      <div>
        <label className="block text-xs text-gray-500 mb-1">Aset (Barang Milik Daerah)</label>
        <AsetPicker selected={aset} onSelect={onSelect} skpdId={skpdId} />
      </div>

      {jenis === 'pemeliharaan' && (
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Kondisi</label>
            <input className="select-filter w-full" value={kondisi} onChange={e => setKondisi(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Estimasi Biaya (Rp)</label>
            <input type="number" step="any" className="select-filter w-full" value={totalAnggaran} onChange={e => setTotalAnggaran(e.target.value)} />
          </div>
          <div className="col-span-2">
            <label className="block text-xs text-gray-500 mb-1">Usulan / Uraian Pemeliharaan</label>
            <input className="select-filter w-full" value={uraianPemeliharaan} onChange={e => setUraianPemeliharaan(e.target.value)} />
          </div>
          <p className="col-span-2 text-[11px] text-amber-600">
            Catatan Pasal 25: jangan usulkan aset rusak berat / dipakai sementara pihak lain / objek pemanfaatan.
          </p>
        </div>
      )}

      {jenis === 'pemanfaatan' && (
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Jumlah / Luas</label>
            <input type="number" step="any" className="select-filter w-full" value={jumlah} onChange={e => setJumlah(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Lokasi</label>
            <input className="select-filter w-full" value={lokasi} onChange={e => setLokasi(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Peruntukan</label>
            <input className="select-filter w-full" value={peruntukan} onChange={e => setPeruntukan(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Bentuk Pemanfaatan</label>
            <select className="select-filter w-full" value={bentuk} onChange={e => setBentuk(e.target.value)}>
              <option value="">— pilih —</option>
              {BENTUK_PEMANFAATAN.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Jangka Waktu</label>
            <input className="select-filter w-full" value={jangkaWaktu} onChange={e => setJangkaWaktu(e.target.value)} placeholder="mis. 5 tahun" />
          </div>
        </div>
      )}

      {jenis === 'pemindahtanganan' && (
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Jumlah</label>
            <input type="number" step="any" className="select-filter w-full" value={jumlah} onChange={e => setJumlah(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Lokasi</label>
            <input className="select-filter w-full" value={lokasi} onChange={e => setLokasi(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Nilai Perolehan (Rp)</label>
            <input type="number" step="any" className="select-filter w-full" value={nilaiPerolehan} onChange={e => setNilaiPerolehan(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Bentuk Pemindahtanganan</label>
            <select className="select-filter w-full" value={bentuk} onChange={e => setBentuk(e.target.value)}>
              <option value="">— pilih —</option>
              {BENTUK_PEMINDAHTANGANAN.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>
          <div className="col-span-2">
            <label className="block text-xs text-gray-500 mb-1">Alasan Rencana Pemindahtanganan</label>
            <input className="select-filter w-full" value={alasan} onChange={e => setAlasan(e.target.value)} />
          </div>
        </div>
      )}

      {jenis === 'penghapusan' && (
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Jumlah</label>
            <input type="number" step="any" className="select-filter w-full" value={jumlah} onChange={e => setJumlah(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Nilai Perolehan (Rp)</label>
            <input type="number" step="any" className="select-filter w-full" value={nilaiPerolehan} onChange={e => setNilaiPerolehan(e.target.value)} />
          </div>
          <div className="col-span-2">
            <label className="block text-xs text-gray-500 mb-1">Alasan Rencana Penghapusan</label>
            <input className="select-filter w-full" value={alasan} onChange={e => setAlasan(e.target.value)} />
          </div>
        </div>
      )}

      <div>
        <label className="block text-xs text-gray-500 mb-1">Keterangan</label>
        <input className="select-filter w-full" value={keterangan} onChange={e => setKeterangan(e.target.value)} />
      </div>

      {err && <p className="text-xs text-red-600">{err}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={saving} className="btn-primary">{saving ? 'Menyimpan...' : editing ? 'Simpan Perubahan' : 'Tambah Item'}</button>
        <button type="button" onClick={onCancel} className="text-sm text-gray-500 hover:text-gray-700">Batal</button>
      </div>
    </form>
  )
}
