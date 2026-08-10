'use client'
// Form item RKBMD berbasis aset eksisting — empat jenis: Pemeliharaan,
// Pemanfaatan, Pemindahtanganan, Penghapusan.
//
// URUTAN ISIAN DITENTUKAN USER 2026-08-10 dan sengaja beda per jenis — di
// Pemanfaatan & Pemindahtanganan, BENTUK dipilih PALING DULU (sebelum barang),
// karena bentuknyalah yang menentukan barang macam apa yang layak diusulkan:
//   pemeliharaan      : jenis aset → barang → kondisi → estimasi biaya → ket.
//   pemanfaatan       : bentuk → jenis aset → barang → peruntukan →
//                       estimasi hasil → jangka waktu → ket.
//   pemindahtanganan  : bentuk → jenis aset → barang → ket.
//   penghapusan       : jenis aset → barang → sebab → ket.
//
// Identitas barang (kode, NIBAR, nama, TANGGAL & NILAI PEROLEHAN) DI-SNAPSHOT
// ke `rkbmd_item` saat dipilih — bukan di-join dari `aset` saat cetak. Dokumen
// perencanaan yang sudah ditandatangani tidak boleh angkanya bergerak ketika
// data aset berubah; `aset_id` tetap disimpan untuk penelusuran.
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import AsetPicker, { type AsetRingkas } from '@/components/AsetPicker'
import { GOLONGAN_REKAP, kodeLevel3 } from '@/lib/bmd'
import { formatRupiah } from '@/lib/export'
import {
  BENTUK_PEMANFAATAN, BENTUK_PEMINDAHTANGANAN, KONDISI_RKBMD,
  type RkbmdItem, type RkbmdJenis,
} from '@/lib/rkbmd'

type JenisAset = Exclude<RkbmdJenis, 'pengadaan'>

const JUDUL: Record<JenisAset, string> = {
  pemeliharaan: 'Pemeliharaan', pemanfaatan: 'Pemanfaatan',
  pemindahtanganan: 'Pemindahtanganan', penghapusan: 'Penghapusan',
}

export default function RkbmdAsetForm({ jenis, rkbmdId, skpdId, editItem, onSaved, onCancel }: {
  jenis: JenisAset
  rkbmdId: string
  skpdId: number
  editItem: RkbmdItem | null
  onSaved: () => void
  onCancel: () => void
}) {
  const supabase = createClient()
  const editing = !!editItem
  const pakaiBentuk = jenis === 'pemanfaatan' || jenis === 'pemindahtanganan'
  const opsiBentuk = jenis === 'pemanfaatan' ? BENTUK_PEMANFAATAN : BENTUK_PEMINDAHTANGANAN

  const [bentuk, setBentuk] = useState(editItem?.bentuk || '')
  const [golongan, setGolongan] = useState(editItem?.kode ? kodeLevel3(editItem.kode) : '')
  const [aset, setAset] = useState<AsetRingkas | null>(
    editItem?.aset_id
      ? {
          id: editItem.aset_id, nibar: editItem.nibar, kode: editItem.kode || '',
          nama_barang: editItem.nama_barang, nilai_perolehan: editItem.nilai_perolehan ?? 0,
          tgl_perolehan: editItem.tgl_perolehan, skpd_id: skpdId, status: 'aktif', skpd: null,
        }
      : null,
  )
  const [kondisi, setKondisi] = useState(editItem?.kondisi || '')
  const [biaya, setBiaya] = useState(editItem?.total_anggaran != null ? String(editItem.total_anggaran) : '')
  const [peruntukan, setPeruntukan] = useState(editItem?.peruntukan || '')
  const [hasil, setHasil] = useState(editItem?.estimasi_hasil != null ? String(editItem.estimasi_hasil) : '')
  const [jangkaWaktu, setJangkaWaktu] = useState(editItem?.jangka_waktu || '')
  const [sebab, setSebab] = useState(editItem?.alasan || '')
  const [keterangan, setKeterangan] = useState(editItem?.keterangan || '')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  // Ganti jenis aset → barang yang sudah terpilih dilepas, kalau tidak barang
  // dari golongan lama tertinggal di form sementara pickernya sudah menyaring
  // golongan baru — operator tak punya petunjuk apa pun bahwa itu tak cocok.
  useEffect(() => {
    if (aset && golongan && kodeLevel3(aset.kode) !== golongan) setAset(null)
  }, [golongan]) // eslint-disable-line react-hooks/exhaustive-deps

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (pakaiBentuk && !bentuk) {
      setErr(`Pilih bentuk ${jenis === 'pemanfaatan' ? 'pemanfaatan' : 'pemindahtanganan'} dulu.`); return
    }
    if (!aset) { setErr('Pilih barangnya dulu.'); return }
    if (jenis === 'pemeliharaan' && !kondisi) { setErr('Pilih kondisi barang.'); return }
    setSaving(true); setErr('')

    const base = {
      rkbmd_id: rkbmdId,
      aset_id: aset.id,
      kode: aset.kode || null,
      nibar: aset.nibar,
      nama_barang: aset.nama_barang,
      tgl_perolehan: aset.tgl_perolehan ?? null,
      nilai_perolehan: aset.nilai_perolehan ?? null,
      keterangan: keterangan.trim() || null,
    }
    const perJenis: Record<string, unknown> =
      jenis === 'pemeliharaan'
        ? { kondisi, total_anggaran: biaya === '' ? null : Number(biaya) }
        : jenis === 'pemanfaatan'
        ? {
            bentuk, peruntukan: peruntukan.trim() || null,
            estimasi_hasil: hasil === '' ? null : Number(hasil),
            jangka_waktu: jangkaWaktu.trim() || null,
          }
        : jenis === 'pemindahtanganan'
        ? { bentuk }
        : { alasan: sebab.trim() || null }

    const payload = { ...base, ...perJenis }
    let error
    if (editing) {
      ({ error } = await supabase.from('rkbmd_item').update(payload).eq('id', editItem!.id))
    } else {
      const { data: last } = await supabase.from('rkbmd_item').select('no_urut')
        .eq('rkbmd_id', rkbmdId).order('no_urut', { ascending: false }).limit(1).maybeSingle()
      const next = ((last as { no_urut: number | null } | null)?.no_urut || 0) + 1;
      ({ error } = await supabase.from('rkbmd_item').insert({ ...payload, no_urut: next }))
    }
    if (error) { setErr(`Error: ${error.message}`); setSaving(false); return }
    setSaving(false)
    onSaved()
  }

  // Nomor langkah menyesuaikan: jenis ber-bentuk mulai dari "1. Bentuk".
  let n = 0
  const langkah = () => ++n

  return (
    <form onSubmit={submit} className="card p-5 mb-4 space-y-4 border-teal/30">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-800">{editing ? 'Edit' : 'Tambah'} Item {JUDUL[jenis]}</h3>
        <button type="button" onClick={onCancel} className="text-xs text-gray-500 hover:text-gray-700">Tutup</button>
      </div>

      {err && <p className="text-xs text-red-600">{err}</p>}

      {pakaiBentuk && (
        <div className="max-w-sm">
          <label className="block text-xs text-gray-500 mb-1">
            {langkah()}. Bentuk {jenis === 'pemanfaatan' ? 'Pemanfaatan' : 'Pemindahtanganan'}
          </label>
          <select className="select-filter w-full" value={bentuk} onChange={e => setBentuk(e.target.value)}>
            <option value="">— pilih —</option>
            {opsiBentuk.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
        </div>
      )}

      <div className="max-w-sm">
        <label className="block text-xs text-gray-500 mb-1">{langkah()}. Jenis Aset</label>
        <select className="select-filter w-full" value={golongan} onChange={e => setGolongan(e.target.value)}>
          <option value="">— semua jenis aset —</option>
          {GOLONGAN_REKAP.map(g => <option key={g.kode} value={g.kode}>{g.kode} — {g.uraian}</option>)}
        </select>
        <p className="text-[11px] text-gray-400 mt-1">Menyaring daftar barang di bawah.</p>
      </div>

      <div>
        <label className="block text-xs text-gray-500 mb-1">{langkah()}. Data Barang</label>
        <AsetPicker selected={aset} onSelect={setAset} skpdId={skpdId} kodePrefix={golongan || undefined} />
        <p className="text-[11px] text-gray-400 mt-1">
          Bisa dicari lewat NIBAR, uraian barang, nama barang, atau merek. Kosongkan kotak cari lalu tekan
          &ldquo;Cari&rdquo; untuk melihat seluruh barang{golongan ? ' jenis ini' : ''} di SKPD.
        </p>
      </div>

      {jenis === 'pemeliharaan' && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl">
            <div>
              <label className="block text-xs text-gray-500 mb-1">{langkah()}. Kondisi</label>
              <select className="select-filter w-full" value={kondisi} onChange={e => setKondisi(e.target.value)}>
                <option value="">— pilih kondisi —</option>
                {KONDISI_RKBMD.map(k => <option key={k} value={k}>{k}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">{langkah()}. Estimasi Biaya Pemeliharaan (Rp)</label>
              <input type="number" min={0} step="any" className="select-filter w-full"
                value={biaya} onChange={e => setBiaya(e.target.value)} />
            </div>
          </div>
          {kondisi === 'Rusak Berat' && (
            <p className="text-[11px] text-amber-600">
              Catatan Pasal 25: barang rusak berat pada dasarnya TIDAK diusulkan untuk dipelihara —
              pertimbangkan RKBMD Penghapusan. Kalau memang disengaja, jelaskan di Keterangan.
            </p>
          )}
        </>
      )}

      {jenis === 'pemanfaatan' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-3">
            <label className="block text-xs text-gray-500 mb-1">{langkah()}. Peruntukan Pemanfaatan</label>
            <input className="select-filter w-full" value={peruntukan} onChange={e => setPeruntukan(e.target.value)}
              placeholder="mis. kantin, ruang ATM, menara telekomunikasi" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">{langkah()}. Estimasi Hasil Pemanfaatan (Rp)</label>
            <input type="number" min={0} step="any" className="select-filter w-full"
              value={hasil} onChange={e => setHasil(e.target.value)} />
            <p className="text-[11px] text-gray-400 mt-1">Rencana penerimaan, bukan belanja.</p>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">{langkah()}. Jangka Waktu</label>
            <input className="select-filter w-full" value={jangkaWaktu} onChange={e => setJangkaWaktu(e.target.value)}
              placeholder="mis. 5 tahun" />
          </div>
        </div>
      )}

      {jenis === 'penghapusan' && (
        <div>
          <label className="block text-xs text-gray-500 mb-1">{langkah()}. Sebab Penghapusan</label>
          <input className="select-filter w-full" value={sebab} onChange={e => setSebab(e.target.value)}
            placeholder="mis. rusak berat & tidak ekonomis diperbaiki, hilang, musnah" />
        </div>
      )}

      <div>
        <label className="block text-xs text-gray-500 mb-1">{langkah()}. Keterangan</label>
        <input className="select-filter w-full" value={keterangan} onChange={e => setKeterangan(e.target.value)} />
      </div>

      {aset && (
        <div className="rounded-lg bg-gray-50 px-4 py-2 text-[11px] text-gray-500 flex flex-wrap gap-x-6 gap-y-1">
          <span>Dibekukan ke dokumen —</span>
          <span>Tgl perolehan: <span className="font-medium text-gray-700">{aset.tgl_perolehan || '—'}</span></span>
          <span>Nilai perolehan: <span className="font-medium text-gray-700">{formatRupiah(aset.nilai_perolehan)}</span></span>
        </div>
      )}

      <div className="flex gap-2">
        <button type="submit" disabled={saving} className="btn-primary">
          {saving ? 'Menyimpan...' : editing ? 'Simpan Perubahan' : 'Tambah Item'}
        </button>
        <button type="button" onClick={onCancel} className="text-sm text-gray-500 hover:text-gray-700">Batal</button>
      </div>
    </form>
  )
}
