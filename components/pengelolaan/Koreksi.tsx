'use client'
// No.9: Koreksi nilai, spesifikasi, & pencatatan ganda (gabung duplikat).
// (No.9c koreksi kuantitas split/merge = DEFERRED — masih tahap konsep, belum
// dieksekusi.)
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { catatTransaksi } from '@/lib/transaksi'
import { formatRupiah } from '@/lib/export'
import AsetPicker, { type AsetRingkas } from '@/components/AsetPicker'
import FormShell from './FormShell'

const SPEK_KOSONG = { nama_barang: '', spesifikasi_lainnya: '', merek_tipe: '', satuan: '' }
const TANAH_KOSONG = { luas: '', nomor_dokumen_kepemilikan: '', tanggal_dokumen_kepemilikan: '', nama_dokumen_kepemilikan: '', jenis_hak: '' }
const ATRIBUT_KOSONG = { asal_usul: '', kondisi_barang: '', tahun_pengadaan: '' }
const HAK_OPT = ['HM (Hak Milik)', 'HGB (Hak Guna Bangunan)', 'HP (Hak Pakai)', 'HGU (Hak Guna Usaha)', 'HPL (Hak Pengelolaan)']
const KONDISI_OPT = ['Baik', 'Rusak Ringan', 'Rusak Berat']

// Kandidat duplikat — kolom lebih lengkap dari AsetRingkas (AsetPicker) krn
// butuh tgl_perolehan (buat backdate) & spesifikasi_lainnya (buat komparasi).
// JANGAN ubah AsetPicker yang shared — cari lokal di sini saja.
type Kandidat = {
  id: string; nibar: string | null; kode: string; nama_barang: string | null
  spesifikasi_lainnya: string | null; nilai_perolehan: number; tgl_perolehan: string | null
}
const tahunDari = (tgl: string | null) => tgl ? tgl.slice(0, 4) : '-'

export default function Koreksi() {
  const supabase = createClient()
  const [aset, setAset] = useState<AsetRingkas | null>(null)
  const [mode, setMode] = useState<'nilai' | 'spesifikasi' | 'pencatatan_ganda'>('nilai')
  const [nilaiBaru, setNilaiBaru] = useState('')
  const [spek, setSpek] = useState(SPEK_KOSONG)
  const [tanah, setTanah] = useState(TANAH_KOSONG)
  const [atribut, setAtribut] = useState(ATRIBUT_KOSONG)
  const [ket, setKet] = useState('')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  // ── Pencatatan Ganda (gabung duplikat) ──
  const [qGanda, setQGanda] = useState('')
  const [hasilGanda, setHasilGanda] = useState<Kandidat[]>([])
  const [kandidat, setKandidat] = useState<Kandidat[]>([])
  const [survivorId, setSurvivorId] = useState<string | null>(null)

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
      const isiAtribut: Record<string, unknown> = {}
      if (atribut.asal_usul.trim()) isiAtribut.asal_usul = atribut.asal_usul.trim()
      if (atribut.kondisi_barang) isiAtribut.kondisi_barang = atribut.kondisi_barang
      if (atribut.tahun_pengadaan.trim()) {
        const th = parseInt(atribut.tahun_pengadaan, 10)
        if (!isNaN(th) && th > 0) isiAtribut.tahun_pengadaan = th
      }
      const isi = { ...isiTeks, ...isiTanah, ...isiAtribut }
      if (Object.keys(isi).length === 0) { setMsg('Error: tidak ada field yang diubah.'); setSaving(false); return }
      ;({ error } = await catatTransaksi(supabase, {
        asetId: aset.id, jenis: 'koreksi_spesifikasi', payload: isi, keterangan: ket || undefined,
      }))
    }
    setMsg(error ? `Error: ${error}` : 'Koreksi tercatat di ledger.')
    if (!error) { setAset(null); setNilaiBaru(''); setSpek(SPEK_KOSONG); setTanah(TANAH_KOSONG); setAtribut(ATRIBUT_KOSONG); setKet('') }
    setSaving(false)
  }

  // ── Pencatatan Ganda ──
  async function cariKandidat() {
    if (!qGanda.trim()) return
    const { data } = await supabase.from('aset')
      .select('id,nibar,kode,nama_barang,spesifikasi_lainnya,nilai_perolehan,tgl_perolehan')
      .eq('status', 'aktif')
      .or(`nibar.ilike.%${qGanda}%,nama_barang.ilike.%${qGanda}%,kode.ilike.%${qGanda}%`)
      .limit(10)
    setHasilGanda((data as Kandidat[]) || [])
  }
  function tambahKandidat(k: Kandidat) {
    if (kandidat.some(x => x.id === k.id)) return
    setKandidat(prev => [...prev, k])
    setHasilGanda([]); setQGanda('')
    setSurvivorId(prev => prev ?? k.id)
  }
  function hapusKandidat(id: string) {
    setKandidat(prev => prev.filter(k => k.id !== id))
    setSurvivorId(prev => prev === id ? null : prev)
  }

  const kodeBeda = kandidat.length > 1 && kandidat.some(k => k.kode !== kandidat[0].kode)
  const nilaiBeda = kandidat.length > 1 && kandidat.some(k => k.nilai_perolehan !== kandidat[0].nilai_perolehan)
  const tahunBeda = kandidat.length > 1 && kandidat.some(k => tahunDari(k.tgl_perolehan) !== tahunDari(kandidat[0].tgl_perolehan))
  const namaBeda = kandidat.length > 1 && kandidat.some(k => (k.nama_barang || '') !== (kandidat[0].nama_barang || ''))

  async function submitGanda() {
    if (kandidat.length < 2) { setMsg('Error: pilih minimal 2 barang kandidat duplikat.'); return }
    if (!survivorId) { setMsg('Error: pilih salah satu sebagai barang yang dipertahankan.'); return }
    if (kodeBeda) { setMsg('Error: semua kandidat harus kode barang yang SAMA PERSIS — beda kode bukan duplikat, coba menu Reklasifikasi kalau memang perlu ganti kode.'); return }
    if (!ket.trim()) { setMsg('Error: keterangan/justifikasi wajib diisi (kenapa ini dianggap duplikat).'); return }
    setSaving(true)
    const survivor = kandidat.find(k => k.id === survivorId)!
    const lainnya = kandidat.filter(k => k.id !== survivorId)
    for (const k of lainnya) {
      const { error } = await catatTransaksi(supabase, {
        asetId: k.id, jenis: 'koreksi_pencatatan_ganda', tanggal: k.tgl_perolehan || undefined,
        payload: { survivor_aset_id: survivor.id, survivor_nibar: survivor.nibar },
        keterangan: ket,
      })
      if (error) { setMsg(`Error: ${error}`); setSaving(false); return }
    }
    setMsg(`${lainnya.length} barang digabung ke ${survivor.nibar || survivor.nama_barang || survivor.id} — hilang dari Daftar Barang/Penyusutan.`)
    setKandidat([]); setSurvivorId(null); setKet('')
    setSaving(false)
  }

  return (
    <FormShell judul="Koreksi" msg={msg} deskripsi="Koreksi nilai perolehan, spesifikasi, atau gabung barang duplikat. Koreksi = transaksi baru, tidak mengubah histori.">
      <div className="space-y-4 max-w-2xl">
        <div className="flex gap-2">
          {(['nilai', 'spesifikasi', 'pencatatan_ganda'] as const).map(m => (
            <button key={m} type="button" onClick={() => { setMode(m); setMsg('') }}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium ${mode === m ? 'bg-teal text-white' : 'bg-gray-100 text-gray-600'}`}>
              Koreksi {m === 'nilai' ? 'Nilai' : m === 'spesifikasi' ? 'Spesifikasi' : 'Pencatatan Ganda'}
            </button>
          ))}
        </div>

        {mode === 'pencatatan_ganda' ? (
          <div className="card p-6 space-y-4">
            <p className="text-sm text-gray-500">
              Gabungkan barang yang kecatat dua kali (duplikat) jadi satu register. Pilih minimal 2 barang, tandai
              yang mana yang DIPERTAHANKAN — sisanya dibatalkan retroaktif ke tanggal perolehan masing-masing
              (hilang dari Daftar Barang/Penyusutan/KIBAR, ledger tetap tersimpan utk audit).
            </p>

            <div>
              <label className="block text-xs text-gray-500 mb-1">Cari &amp; tambah kandidat (NIBAR / nama / kode)</label>
              <div className="flex gap-2">
                <input className="select-filter flex-1" value={qGanda} onChange={e => setQGanda(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); cariKandidat() } }} />
                <button type="button" className="btn-secondary" onClick={cariKandidat}>Cari</button>
              </div>
              {hasilGanda.length > 0 && (
                <div className="mt-2 border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-56 overflow-y-auto">
                  {hasilGanda.map(k => (
                    <button key={k.id} type="button" onClick={() => tambahKandidat(k)}
                      className="w-full text-left px-3 py-2 hover:bg-gray-50 text-xs">
                      <span className="font-medium text-gray-800">{k.nama_barang || '-'}</span>
                      <span className="text-gray-400"> — {k.nibar || '-'} · {k.kode} · {formatRupiah(k.nilai_perolehan)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {kandidat.length > 0 && (
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      <th className="table-th w-16 text-center">Survivor</th>
                      <th className={`table-th ${kodeBeda ? 'bg-red-50 text-red-700' : ''}`}>Kode</th>
                      <th className={`table-th ${namaBeda ? 'bg-amber-50 text-amber-700' : ''}`}>Nama Barang</th>
                      <th className={`table-th text-right ${nilaiBeda ? 'bg-amber-50 text-amber-700' : ''}`}>Nilai Perolehan</th>
                      <th className={`table-th text-center ${tahunBeda ? 'bg-amber-50 text-amber-700' : ''}`}>Tahun</th>
                      <th className="table-th w-10 text-center">Hapus</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {kandidat.map(k => (
                      <tr key={k.id} className={survivorId === k.id ? 'bg-teal/5' : ''}>
                        <td className="table-td text-center">
                          <input type="radio" name="survivor" checked={survivorId === k.id} onChange={() => setSurvivorId(k.id)} />
                        </td>
                        <td className="table-td text-xs">{k.kode}</td>
                        <td className="table-td text-xs">{k.nama_barang || '-'}<p className="text-gray-400 mt-0.5">{k.nibar || '-'}</p></td>
                        <td className="table-td text-right text-xs">{formatRupiah(k.nilai_perolehan)}</td>
                        <td className="table-td text-center text-xs">{tahunDari(k.tgl_perolehan)}</td>
                        <td className="table-td text-center">
                          <button type="button" onClick={() => hapusKandidat(k.id)} className="text-red-500 hover:text-red-700">×</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {kodeBeda && <p className="text-xs text-red-600 px-3 py-2 bg-red-50">Kode barang beda — ini BUKAN duplikat, tidak bisa digabung. Pakai menu Reklasifikasi kalau memang perlu ganti kode.</p>}
                {!kodeBeda && (nilaiBeda || tahunBeda || namaBeda) && (
                  <p className="text-xs text-amber-700 px-3 py-2 bg-amber-50">Ada kolom yang beda (kuning) — tetap bisa dilanjut, tapi jelaskan alasannya di keterangan.</p>
                )}
              </div>
            )}

            <div>
              <label className="block text-xs text-gray-500 mb-1">Keterangan / justifikasi duplikat <span className="text-red-500">*wajib</span></label>
              <input className="select-filter w-full" value={ket} onChange={e => setKet(e.target.value)}
                placeholder="mis. Barang sama tercatat 2× saat migrasi e-BMD 2025" />
            </div>

            <button type="button" className="btn-primary" onClick={submitGanda}
              disabled={saving || kandidat.length < 2 || !survivorId || kodeBeda}>
              {saving ? 'Menyimpan...' : `Gabung ${kandidat.length} Barang`}
            </button>
          </div>
        ) : (
        <form onSubmit={submit} className="card p-6 space-y-4">
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
                      {/* Tanggal SERTIFIKAT (bisa historis, bukan tanggal transaksi ledger) — cuma dibatasi tak boleh di masa depan, TIDAK dibatasi tahun_buku. */}
                      <input type="date" className="select-filter w-full" max={new Date().toISOString().slice(0, 10)}
                        value={tanah.tanggal_dokumen_kepemilikan}
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
              <div className="pt-3 border-t border-gray-100">
                <p className="text-xs font-medium text-gray-600 mb-2">Atribut Tambahan</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Asal Usul</label>
                    <input className="select-filter w-full" value={atribut.asal_usul} placeholder="(kosongkan jika tidak berubah)"
                      onChange={e => setAtribut(s => ({ ...s, asal_usul: e.target.value }))} />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Kondisi Barang</label>
                    <select className="select-filter w-full" value={atribut.kondisi_barang}
                      onChange={e => setAtribut(s => ({ ...s, kondisi_barang: e.target.value }))}>
                      <option value="">(kosongkan jika tidak berubah)</option>
                      {KONDISI_OPT.map(k => <option key={k} value={k}>{k}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Tahun Pengadaan</label>
                    <input type="number" min="1900" max="2100" step="1" className="select-filter w-full" value={atribut.tahun_pengadaan}
                      placeholder="(kosongkan jika tidak berubah)"
                      onChange={e => setAtribut(s => ({ ...s, tahun_pengadaan: e.target.value }))} />
                  </div>
                </div>
              </div>
            </div>
          )}
          <div>
            <label className="block text-xs text-gray-500 mb-1">Keterangan / dasar koreksi</label>
            <input className="select-filter w-full" value={ket} onChange={e => setKet(e.target.value)} />
          </div>
          <button className="btn-primary" disabled={saving || !aset}>{saving ? 'Menyimpan...' : 'Catat Koreksi'}</button>
        </form>
        )}
        <div className="card p-4 text-sm text-gray-400 border-dashed">
          <span className="font-medium text-gray-500">Koreksi Kuantitas Bertambah (pemecahan)</span> — ditunda:
          rumus alokasi proporsional nilai buku/akumulasi/beban sudah disepakati konsepnya, implementasi menyusul.
        </div>
      </div>
    </FormShell>
  )
}
