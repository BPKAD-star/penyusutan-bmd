'use client'
// Cara Perolehan: Pengadaan (ber-SK) — pola jurnal ala Penghapusan, header editable.
//   1. Pilih SKPD.
//   2. Tambah jurnal: kartu Kontrak (sumber, no/tgl kontrak, program/kegiatan,
//      penyedia, PPK, keterangan) + kartu BAST (no/tgl BAST, keterangan), lalu
//      baris barang: kode, satuan, kuantitas, harga per item.
//   3. Simpan → tiap baris di-SPLIT jadi N aset (jumlah=1) sesuai kuantitas,
//      masing-masing dapat transaksi ledger 'pengadaan' ber-header_id (append-only).
//   4. Edit data barang (NIBAR, nama, spesifikasi, merek, satuan, komptabel) —
//      foto menyusul di fase berikutnya.
// Header (jurnal_header) editable; baris ledger tetap beku. Pindah semester tak
// diizinkan lewat edit (guard DB + validasi UI), sama seperti Penghapusan.
//
// Perolehan (tgl aset + periode ledger) memakai TANGGAL BAST (serah terima),
// fallback tgl kontrak — supaya penyusutan mulai dari serah terima.
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { periodeDariTanggal } from '@/lib/bmd'
import { formatRupiah } from '@/lib/export'
import FormShell from './FormShell'

type SumberPengadaan = 'kwitansi' | 'bukti_pembelian' | 'surat_pesanan' | 'spk'
const SUMBER_OPT: { value: SumberPengadaan; label: string }[] = [
  { value: 'kwitansi', label: 'Kwitansi' },
  { value: 'bukti_pembelian', label: 'Bukti Pembelian' },
  { value: 'surat_pesanan', label: 'Surat Pesanan' },
  { value: 'spk', label: 'Surat Perintah Kerja (SPK)' },
]
const sumberLabel = (v: string) => SUMBER_OPT.find(o => o.value === v)?.label || v

type HeaderPayload = {
  program?: string; kegiatan?: string; sub_kegiatan?: string
  nama_penyedia?: string; nama_ppk?: string
  no_bast?: string; tgl_bast?: string; ket_bast?: string
}
type Header = {
  id: string; no_sk: string; tanggal: string; periode: string
  jenis: string; keterangan: string | null; payload: HeaderPayload
}
type JurnalLine = {
  aset_id: string; nibar: string | null; kode: string; nama_barang: string | null
  spesifikasi: string | null; merek_tipe: string | null; satuan: string | null
  intra_ekstra: string | null; nilai: number
}
type Jurnal = Header & { lines: JurnalLine[]; total: number }

// Baris input barang (sebelum disimpan / di-split).
type LineInput = { key: string; kode: string; uraian: string; nama: string; satuan: string; qty: string; harga: string }

const toNum = (s: string) => { const n = parseFloat(String(s).replace(/[^0-9.]/g, '')); return isNaN(n) ? 0 : n }
const toInt = (s: string) => { const n = parseInt(String(s).replace(/[^0-9]/g, ''), 10); return isNaN(n) ? 0 : n }
const newKey = () => Math.random().toString(36).slice(2)

export default function Pengadaan() {
  const supabase = createClient()

  const [skpdList, setSkpdList] = useState<{ id: number; nama: string }[]>([])
  const [skpd, setSkpd] = useState('')

  const [jurnals, setJurnals] = useState<Jurnal[]>([])
  const [loadingJurnal, setLoadingJurnal] = useState(false)

  const [mode, setMode] = useState<'list' | 'tambah'>('list')
  const [addTo, setAddTo] = useState<Header | null>(null)     // "+" tambah barang ke jurnal ini
  const [editing, setEditing] = useState<Header | null>(null)  // edit header
  const [editBarang, setEditBarang] = useState<JurnalLine | null>(null) // edit data barang (step 4)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    supabase.from('skpd').select('id,nama').eq('level', 1).order('nama')
      .then(({ data }) => setSkpdList(data || []))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const loadJurnals = useCallback(async (skpdId: string) => {
    if (!skpdId) { setJurnals([]); return }
    setLoadingJurnal(true)

    const { data: headers } = await supabase.from('jurnal_header')
      .select('id,no_sk,tanggal,periode,jenis,keterangan,payload')
      .eq('kategori', 'pengadaan').eq('skpd_id', Number(skpdId))
      .order('tanggal', { ascending: false })
    const hs = (headers || []) as Header[]

    const jmap = new Map<string, Jurnal>()
    for (const h of hs) jmap.set(h.id, { ...h, payload: h.payload || {}, lines: [], total: 0 })

    if (hs.length > 0) {
      const { data } = await supabase.from('transaksi_bmd')
        .select('id,header_id,nilai,aset:aset_id(id,nibar,nama_barang,kode,spesifikasi,merek_tipe,satuan,intra_ekstra,status)')
        .eq('jenis', 'pengadaan')
        .in('header_id', hs.map(h => h.id))
        .order('id', { ascending: false })

      const rows = (data || []) as unknown as {
        id: number; header_id: string; nilai: number
        aset: {
          id: string; nibar: string | null; nama_barang: string | null; kode: string
          spesifikasi: string | null; merek_tipe: string | null; satuan: string | null
          intra_ekstra: string | null; status: string
        } | null
      }[]
      // Dedup per aset: baris pengadaan TERBARU (id desc) menentukan keanggotaan.
      // Hanya aset yang masih 'aktif' yang jadi anggota jurnal saat ini.
      const seen = new Set<string>()
      for (const r of rows) {
        if (!r.aset || seen.has(r.aset.id)) continue
        seen.add(r.aset.id)
        if (r.aset.status !== 'aktif') continue
        const j = jmap.get(r.header_id)
        if (!j) continue
        j.lines.push({
          aset_id: r.aset.id, nibar: r.aset.nibar, kode: r.aset.kode, nama_barang: r.aset.nama_barang,
          spesifikasi: r.aset.spesifikasi, merek_tipe: r.aset.merek_tipe, satuan: r.aset.satuan,
          intra_ekstra: r.aset.intra_ekstra, nilai: r.nilai,
        })
        j.total += r.nilai
      }
    }
    setJurnals([...jmap.values()].filter(j => j.lines.length > 0))
    setLoadingJurnal(false)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadJurnals(skpd); setMode('list'); setAddTo(null); setEditing(null) }, [skpd, loadJurnals])

  const skpdNama = skpdList.find(s => String(s.id) === skpd)?.nama

  return (
    <FormShell judul="Pengadaan" msg={msg}
      deskripsi="Pilih SKPD, buat jurnal pengadaan (kontrak + BAST), lalu isi barang. Kuantitas > 1 otomatis di-split jadi beberapa barang.">
      {/* Pilih SKPD */}
      <div className="card p-5 mb-4">
        <div className="flex items-center gap-3">
          <label className="w-32 text-sm text-gray-600 text-right flex-shrink-0">Lokasi / SKPD :</label>
          <select className="select-filter flex-1" value={skpd} onChange={e => { setSkpd(e.target.value); setMsg('') }}>
            <option value="">— pilih SKPD —</option>
            {skpdList.map(s => <option key={s.id} value={s.id}>{s.nama}</option>)}
          </select>
        </div>
      </div>

      {!skpd ? (
        <div className="card p-12 text-center text-gray-400 text-sm">
          Pilih SKPD di atas untuk melihat & membuat jurnal pengadaan.
        </div>
      ) : mode === 'tambah' ? (
        <BarangForm
          skpdId={Number(skpd)} skpdNama={skpdNama || ''} header={null}
          onCancel={() => setMode('list')}
          onSaved={(n) => { setMode('list'); setMsg(`Jurnal pengadaan tersimpan — ${n} barang dicatat.`); loadJurnals(skpd) }}
        />
      ) : addTo ? (
        <BarangForm
          skpdId={Number(skpd)} skpdNama={skpdNama || ''} header={addTo}
          onCancel={() => setAddTo(null)}
          onSaved={(n) => { setAddTo(null); setMsg(`${n} barang ditambahkan ke kontrak ${addTo.no_sk}.`); loadJurnals(skpd) }}
        />
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">{skpdNama} — {jurnals.length} jurnal pengadaan</span>
            <button className="btn-primary" onClick={() => { setMsg(''); setMode('tambah') }}>+ Tambah Pengadaan</button>
          </div>

          {loadingJurnal ? (
            <div className="card p-12 text-center text-gray-400 text-sm">Memuat jurnal...</div>
          ) : jurnals.length === 0 ? (
            <div className="card p-12 text-center text-gray-400 text-sm">Belum ada pengadaan untuk SKPD ini.</div>
          ) : jurnals.map(j => (
            <div key={j.id} className="card overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/60">
                <div className="flex items-start justify-between gap-4">
                  <div className="text-sm space-y-0.5">
                    <p className="font-semibold text-gray-800">Kontrak: {j.no_sk} <span className="font-normal text-gray-400">· {sumberLabel(j.jenis)}</span></p>
                    <p className="text-xs text-gray-500">Tgl kontrak {j.tanggal} · {j.periode}
                      {j.payload?.no_bast && ` · BAST ${j.payload.no_bast}`}
                      {j.payload?.tgl_bast && ` (${j.payload.tgl_bast})`}
                    </p>
                    {(j.payload?.program || j.payload?.kegiatan || j.payload?.sub_kegiatan) && (
                      <p className="text-xs text-gray-500">
                        {[j.payload.program, j.payload.kegiatan, j.payload.sub_kegiatan].filter(Boolean).join(' › ')}
                      </p>
                    )}
                    {(j.payload?.nama_penyedia || j.payload?.nama_ppk) && (
                      <p className="text-xs text-gray-500">
                        {j.payload.nama_penyedia && `Penyedia: ${j.payload.nama_penyedia}`}
                        {j.payload.nama_penyedia && j.payload.nama_ppk && ' · '}
                        {j.payload.nama_ppk && `PPK: ${j.payload.nama_ppk}`}
                      </p>
                    )}
                    {j.keterangan && <p className="text-xs text-gray-500">Keterangan: {j.keterangan}</p>}
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <div className="text-right">
                      <p className="text-xs text-gray-400">Total Pengadaan</p>
                      <p className="font-semibold text-gray-800">{formatRupiah(j.total)}</p>
                    </div>
                    <button title="Edit kontrak / BAST (dalam semester yang sama)"
                      onClick={() => { setMsg(''); setEditing(j) }}
                      className="inline-flex items-center justify-center w-8 h-8 rounded bg-gray-100 hover:bg-gray-200 text-gray-700">✎</button>
                    <button title="Tambah barang ke kontrak ini"
                      onClick={() => { setMsg(''); setAddTo(j) }}
                      className="inline-flex items-center justify-center w-8 h-8 rounded bg-teal hover:opacity-90 text-white">+</button>
                  </div>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      <th className="table-th w-10 text-center">Aksi</th>
                      <th className="table-th">Kode Register / Nama Barang</th>
                      <th className="table-th">Merek / Tipe</th>
                      <th className="table-th text-center">Satuan</th>
                      <th className="table-th text-center">Komptabel</th>
                      <th className="table-th text-right">Nilai</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {j.lines.map(l => (
                      <tr key={l.aset_id}>
                        <td className="table-td text-center">
                          <button
                            onClick={() => { setMsg(''); setEditBarang(l) }}
                            title="Edit data barang (NIBAR, nama, spesifikasi, dll)"
                            className="inline-flex items-center justify-center w-7 h-7 rounded bg-gray-100 hover:bg-gray-200 text-gray-700"
                          >✎</button>
                        </td>
                        <td className="table-td">
                          <p className="font-medium text-gray-800 text-xs">{l.nama_barang || '-'}</p>
                          <p className="text-gray-400 text-xs mt-0.5">{l.nibar || '(NIBAR belum diisi)'} · {l.kode}</p>
                        </td>
                        <td className="table-td text-xs text-gray-600">{l.merek_tipe || '-'}</td>
                        <td className="table-td text-center text-xs">{l.satuan || '-'}</td>
                        <td className="table-td text-center text-xs capitalize">{l.intra_ekstra || '-'}</td>
                        <td className="table-td text-right text-xs">{formatRupiah(l.nilai)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <EditHeaderModal header={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); setMsg('Header kontrak diperbarui.'); loadJurnals(skpd) }}
        />
      )}
      {editBarang && (
        <EditBarangModal line={editBarang}
          onClose={() => setEditBarang(null)}
          onSaved={() => { setEditBarang(null); setMsg('Data barang diperbarui.'); loadJurnals(skpd) }}
        />
      )}
    </FormShell>
  )
}

// ── Modal edit header: kontrak (no/tgl, kunci semester) + BAST + penyedia/PPK ─
function EditHeaderModal({ header, onClose, onSaved }: {
  header: Header; onClose: () => void; onSaved: () => void
}) {
  const supabase = createClient()
  const p = header.payload || {}
  const [noKontrak, setNoKontrak] = useState(header.no_sk)
  const [tgl, setTgl] = useState(header.tanggal)
  const [ket, setKet] = useState(header.keterangan || '')
  const [program, setProgram] = useState(p.program || '')
  const [kegiatan, setKegiatan] = useState(p.kegiatan || '')
  const [subKeg, setSubKeg] = useState(p.sub_kegiatan || '')
  const [penyedia, setPenyedia] = useState(p.nama_penyedia || '')
  const [ppk, setPpk] = useState(p.nama_ppk || '')
  const [noBast, setNoBast] = useState(p.no_bast || '')
  const [tglBast, setTglBast] = useState(p.tgl_bast || '')
  const [ketBast, setKetBast] = useState(p.ket_bast || '')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const pindahSemester = periodeDariTanggal(tgl) !== header.periode

  async function simpan() {
    if (!noKontrak.trim()) { setErr('No. Kontrak wajib diisi.'); return }
    if (pindahSemester) {
      setErr(`Tanggal kontrak masuk ${periodeDariTanggal(tgl)}, sedangkan jurnal ini di ${header.periode}. Pindah semester tidak diizinkan — batalkan & buat jurnal baru.`)
      return
    }
    setErr(''); setSaving(true)
    const payload: HeaderPayload = {
      program: program.trim() || undefined, kegiatan: kegiatan.trim() || undefined, sub_kegiatan: subKeg.trim() || undefined,
      nama_penyedia: penyedia.trim() || undefined, nama_ppk: ppk.trim() || undefined,
      no_bast: noBast.trim() || undefined, tgl_bast: tglBast || undefined, ket_bast: ketBast.trim() || undefined,
    }
    const { error } = await supabase.from('jurnal_header')
      .update({ no_sk: noKontrak.trim(), tanggal: tgl, keterangan: ket.trim() || null, payload })
      .eq('id', header.id)
    if (error) { setErr(`Gagal menyimpan: ${error.message}`); setSaving(false); return }
    setSaving(false); onSaved()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="card w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white">
          <h3 className="font-semibold text-gray-800">Edit Kontrak & BAST</h3>
          <button className="text-gray-400 hover:text-gray-700 text-xl leading-none" onClick={onClose}>×</button>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">No. Kontrak</label>
              <input className="select-filter w-full" value={noKontrak} onChange={e => setNoKontrak(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Tgl Kontrak <span className="text-gray-400">(tetap di {header.periode})</span></label>
              <input type="date" className="select-filter w-full" value={tgl} onChange={e => setTgl(e.target.value)} />
              {pindahSemester && <p className="text-xs text-red-600 mt-1">Tanggal ini masuk {periodeDariTanggal(tgl)} — di luar semester jurnal.</p>}
            </div>
            <div><label className="block text-xs text-gray-500 mb-1">Program</label><input className="select-filter w-full" value={program} onChange={e => setProgram(e.target.value)} /></div>
            <div><label className="block text-xs text-gray-500 mb-1">Kegiatan</label><input className="select-filter w-full" value={kegiatan} onChange={e => setKegiatan(e.target.value)} /></div>
            <div><label className="block text-xs text-gray-500 mb-1">Sub Kegiatan</label><input className="select-filter w-full" value={subKeg} onChange={e => setSubKeg(e.target.value)} /></div>
            <div><label className="block text-xs text-gray-500 mb-1">Nama Penyedia</label><input className="select-filter w-full" value={penyedia} onChange={e => setPenyedia(e.target.value)} /></div>
            <div><label className="block text-xs text-gray-500 mb-1">Nama PPK</label><input className="select-filter w-full" value={ppk} onChange={e => setPpk(e.target.value)} /></div>
            <div className="sm:col-span-2"><label className="block text-xs text-gray-500 mb-1">Keterangan Kontrak</label><input className="select-filter w-full" value={ket} onChange={e => setKet(e.target.value)} /></div>
          </div>
          <div className="pt-2 border-t border-gray-100">
            <p className="text-xs font-semibold text-gray-600 mb-2">Berita Acara Serah Terima (BAST)</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div><label className="block text-xs text-gray-500 mb-1">No. BAST</label><input className="select-filter w-full" value={noBast} onChange={e => setNoBast(e.target.value)} /></div>
              <div><label className="block text-xs text-gray-500 mb-1">Tgl BAST <span className="text-gray-400">(tgl perolehan barang)</span></label><input type="date" className="select-filter w-full" value={tglBast} onChange={e => setTglBast(e.target.value)} /></div>
              <div className="sm:col-span-2"><label className="block text-xs text-gray-500 mb-1">Keterangan BAST</label><input className="select-filter w-full" value={ketBast} onChange={e => setKetBast(e.target.value)} /></div>
            </div>
            <p className="text-xs text-gray-400 mt-2">Catatan: mengubah tgl BAST di sini TIDAK memindahkan tgl perolehan barang yang sudah tercatat (baris ledger beku). Untuk itu, batalkan &amp; entry ulang.</p>
          </div>
          {err && <p className="text-sm text-red-600">{err}</p>}
        </div>
        <div className="px-5 py-4 border-t border-gray-100 flex justify-end gap-2 sticky bottom-0 bg-white">
          <button className="btn-secondary" onClick={onClose}>Batal</button>
          <button className="btn-primary" onClick={simpan} disabled={saving || pindahSemester}>{saving ? 'Menyimpan...' : 'Simpan'}</button>
        </div>
      </div>
    </div>
  )
}

// ── Modal edit data barang (step 4): NIBAR + deskriptif + komptabel ─────────
// Update aset langsung (field non-finansial & NIBAR). Nilai/kuantitas TIDAK
// diedit di sini (struktural — batalkan & entry ulang atau lewat menu Koreksi).
function EditBarangModal({ line, onClose, onSaved }: {
  line: JurnalLine; onClose: () => void; onSaved: () => void
}) {
  const supabase = createClient()
  const [nibar, setNibar] = useState(line.nibar || '')
  const [nama, setNama] = useState(line.nama_barang || '')
  const [spesifikasi, setSpesifikasi] = useState(line.spesifikasi || '')
  const [merek, setMerek] = useState(line.merek_tipe || '')
  const [satuan, setSatuan] = useState(line.satuan || '')
  const [komptabel, setKomptabel] = useState((line.intra_ekstra || 'intra'))
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  async function simpan() {
    setErr(''); setSaving(true)
    const patch: Record<string, unknown> = {
      nibar: nibar.trim() || null, nama_barang: nama.trim() || null,
      spesifikasi: spesifikasi.trim() || null, merek_tipe: merek.trim() || null,
      satuan: satuan.trim() || null, intra_ekstra: komptabel,
    }
    const { error } = await supabase.from('aset').update(patch).eq('id', line.aset_id)
    if (error) {
      setErr(error.message.includes('duplicate') ? 'NIBAR sudah dipakai barang lain — pakai nomor lain.' : `Gagal menyimpan: ${error.message}`)
      setSaving(false); return
    }
    setSaving(false); onSaved()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="card w-full max-w-lg" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-semibold text-gray-800">Edit Data Barang</h3>
          <button className="text-gray-400 hover:text-gray-700 text-xl leading-none" onClick={onClose}>×</button>
        </div>
        <div className="p-5 space-y-4">
          <p className="text-xs text-gray-400">Kode: {line.kode} · Nilai: {formatRupiah(line.nilai)}</p>
          <div>
            <label className="block text-xs text-gray-500 mb-1">NIBAR</label>
            <input className="select-filter w-full" value={nibar} onChange={e => setNibar(e.target.value)} placeholder="isi nomor barang (opsional)" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Nama Barang</label>
            <input className="select-filter w-full" value={nama} onChange={e => setNama(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Spesifikasi</label>
            <input className="select-filter w-full" value={spesifikasi} onChange={e => setSpesifikasi(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-xs text-gray-500 mb-1">Merek / Tipe</label><input className="select-filter w-full" value={merek} onChange={e => setMerek(e.target.value)} /></div>
            <div><label className="block text-xs text-gray-500 mb-1">Satuan</label><input className="select-filter w-full" value={satuan} onChange={e => setSatuan(e.target.value)} /></div>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Komptabel</label>
            <select className="select-filter w-full" value={komptabel} onChange={e => setKomptabel(e.target.value)}>
              <option value="intra">Intrakomptabel (disusutkan)</option>
              <option value="ekstra">Ekstrakomptabel (tidak disusutkan)</option>
            </select>
          </div>
          <p className="text-xs text-gray-400">Foto barang menyusul di fase berikutnya. Perubahan nilai/kuantitas bersifat struktural — lewat menu Koreksi atau batalkan &amp; entry ulang.</p>
          {err && <p className="text-sm text-red-600">{err}</p>}
        </div>
        <div className="px-5 py-4 border-t border-gray-100 flex justify-end gap-2">
          <button className="btn-secondary" onClick={onClose}>Batal</button>
          <button className="btn-primary" onClick={simpan} disabled={saving}>{saving ? 'Menyimpan...' : 'Simpan'}</button>
        </div>
      </div>
    </div>
  )
}

// ── Sub-view: header kontrak+BAST (baru) + entry barang (kode/qty/harga) ─────
// header=null → buat jurnal baru. header=… → tambah barang ke kontrak yang ada.
function BarangForm({ skpdId, skpdNama, header, onCancel, onSaved }: {
  skpdId: number; skpdNama: string; header: Header | null; onCancel: () => void; onSaved: (n: number) => void
}) {
  const supabase = createClient()

  // Header kontrak (hanya untuk jurnal baru)
  const [sumber, setSumber] = useState<SumberPengadaan>('spk')
  const [noKontrak, setNoKontrak] = useState('')
  const [tglKontrak, setTglKontrak] = useState(new Date().toISOString().slice(0, 10))
  const [program, setProgram] = useState('')
  const [kegiatan, setKegiatan] = useState('')
  const [subKeg, setSubKeg] = useState('')
  const [ketKontrak, setKetKontrak] = useState('')
  const [penyedia, setPenyedia] = useState('')
  const [ppk, setPpk] = useState('')
  const [noBast, setNoBast] = useState('')
  const [tglBast, setTglBast] = useState('')
  const [ketBast, setKetBast] = useState('')

  // Entry barang
  const [kodeSearch, setKodeSearch] = useState('')
  const [kodeResults, setKodeResults] = useState<{ kode: string; uraian: string | null }[]>([])
  const [searching, setSearching] = useState(false)
  const [lines, setLines] = useState<LineInput[]>([])

  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  // Tgl perolehan (untuk aset & periode ledger) = BAST bila ada, else kontrak.
  const perolehanDate = header
    ? (header.payload?.tgl_bast || header.tanggal)
    : (tglBast || tglKontrak)

  async function cariKode() {
    if (!kodeSearch.trim()) return
    setSearching(true)
    const s = kodeSearch.trim()
    const { data } = await supabase.from('kodefikasi_bmd')
      .select('kode,uraian').or(`kode.ilike.${s}%,uraian.ilike.%${s}%`).limit(30)
    setKodeResults((data || []) as { kode: string; uraian: string | null }[])
    setSearching(false)
  }

  function addLine(kode: string, uraian: string) {
    setLines(prev => [...prev, { key: newKey(), kode, uraian, nama: uraian, satuan: '', qty: '1', harga: '' }])
    setKodeResults([]); setKodeSearch('')
  }
  function updateLine(key: string, patch: Partial<LineInput>) {
    setLines(prev => prev.map(l => l.key === key ? { ...l, ...patch } : l))
  }
  function removeLine(key: string) {
    setLines(prev => prev.filter(l => l.key !== key))
  }

  const totalNilai = lines.reduce((s, l) => s + toInt(l.qty) * toNum(l.harga), 0)
  const totalUnit = lines.reduce((s, l) => s + toInt(l.qty), 0)

  async function simpan() {
    // Validasi baris barang
    if (lines.length === 0) { setErr('Tambah minimal satu barang.'); return }
    for (const l of lines) {
      if (!l.kode) { setErr('Ada baris tanpa kode barang.'); return }
      if (toInt(l.qty) < 1) { setErr(`Kuantitas "${l.nama || l.kode}" minimal 1.`); return }
      if (toNum(l.harga) <= 0) { setErr(`Harga "${l.nama || l.kode}" harus > 0.`); return }
    }
    setErr(''); setSaving(true)

    // 1. Header (baru) atau pakai header yang ada.
    let h = header
    const headerBaru = !header
    if (!h) {
      if (!noKontrak.trim()) { setErr('No. Kontrak wajib diisi.'); setSaving(false); return }
      const payload: HeaderPayload = {
        program: program.trim() || undefined, kegiatan: kegiatan.trim() || undefined, sub_kegiatan: subKeg.trim() || undefined,
        nama_penyedia: penyedia.trim() || undefined, nama_ppk: ppk.trim() || undefined,
        no_bast: noBast.trim() || undefined, tgl_bast: tglBast || undefined, ket_bast: ketBast.trim() || undefined,
      }
      const { data, error } = await supabase.from('jurnal_header').insert({
        skpd_id: skpdId, kategori: 'pengadaan', jenis: sumber, sub_jenis: null,
        no_sk: noKontrak.trim(), tanggal: tglKontrak, keterangan: ketKontrak.trim() || null, payload,
      }).select('id,no_sk,tanggal,periode,jenis,keterangan,payload').single()
      if (error || !data) { setErr(`Gagal membuat header kontrak: ${error?.message}`); setSaving(false); return }
      h = data as Header
    }

    // 2. Split kuantitas → aset baru (jumlah=1) per unit.
    const periode = periodeDariTanggal(perolehanDate)
    const asetRows: Record<string, unknown>[] = []
    for (const l of lines) {
      const qty = toInt(l.qty), harga = toNum(l.harga)
      for (let i = 0; i < qty; i++) {
        asetRows.push({
          nibar: null, kode: l.kode, nama_barang: l.nama.trim() || l.uraian || null,
          spesifikasi: null, merek_tipe: null, jumlah: 1, satuan: l.satuan.trim() || null,
          harga_satuan: harga, nilai_perolehan: harga, tgl_perolehan: perolehanDate,
          skpd_id: skpdId, intra_ekstra: 'intra', cara_perolehan: 'pengadaan', status: 'aktif',
        })
      }
    }

    const { data: inserted, error: asetErr } = await supabase.from('aset').insert(asetRows).select('id,nilai_perolehan')
    if (asetErr || !inserted) {
      if (headerBaru) await supabase.from('jurnal_header').delete().eq('id', h.id)
      setErr(`Gagal membuat barang: ${asetErr?.message}`); setSaving(false); return
    }

    // 3. Transaksi ledger 'pengadaan' per aset (nilai = harga aset itu).
    const trxRows = (inserted as { id: string; nilai_perolehan: number }[]).map(a => ({
      aset_id: a.id, jenis: 'pengadaan', periode, tanggal: perolehanDate, nilai: a.nilai_perolehan,
      skpd_tujuan: skpdId, header_id: h!.id,
      payload: { sumber: h!.jenis, no_bast: h!.payload?.no_bast || null },
    }))
    const { error: trxErr } = await supabase.from('transaksi_bmd').insert(trxRows)
    if (trxErr) {
      // Rollback best-effort: aset tak bisa di-DELETE (RLS soft-delete), tandai dihapus
      // supaya tak jadi barang aktif tanpa ledger.
      await supabase.from('aset').update({ status: 'dihapus' }).in('id', (inserted as { id: string }[]).map(a => a.id))
      if (headerBaru) await supabase.from('jurnal_header').delete().eq('id', h.id)
      setErr(`Gagal mencatat transaksi: ${trxErr.message}`); setSaving(false); return
    }

    setSaving(false)
    onSaved(asetRows.length)
  }

  return (
    <div className="space-y-4">
      {/* Header kontrak — form (baru) atau ringkasan (tambah barang) */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-800">
            {header ? `Tambah Barang — Kontrak ${header.no_sk}` : `Pengadaan Baru — ${skpdNama}`}
          </h2>
          <button className="btn-secondary text-xs" onClick={onCancel}>← Kembali</button>
        </div>

        {header ? (
          <p className="text-sm text-gray-500">
            {sumberLabel(header.jenis)} · Tgl kontrak {header.tanggal} · {header.periode}
            {header.payload?.no_bast && ` · BAST ${header.payload.no_bast}`}
            {' · '}Barang baru dicatat pada perolehan {perolehanDate}.
          </p>
        ) : (
          <div className="space-y-4">
            {/* Kartu 1: Kontrak */}
            <div>
              <p className="text-xs font-semibold text-gray-600 mb-2">Kartu 1 — Kontrak</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Sumber Pengadaan</label>
                  <select className="select-filter w-full" value={sumber} onChange={e => setSumber(e.target.value as SumberPengadaan)}>
                    {SUMBER_OPT.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div />
                <div><label className="block text-xs text-gray-500 mb-1">No. Kontrak</label><input className="select-filter w-full" value={noKontrak} onChange={e => setNoKontrak(e.target.value)} placeholder="mis. 027/123/418.xx/2026" /></div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Tgl Kontrak</label>
                  <input type="date" className="select-filter w-full" value={tglKontrak} onChange={e => setTglKontrak(e.target.value)} />
                  <p className="text-xs text-gray-400 mt-1">Periode: {periodeDariTanggal(tglKontrak)}</p>
                </div>
                <div><label className="block text-xs text-gray-500 mb-1">Program</label><input className="select-filter w-full" value={program} onChange={e => setProgram(e.target.value)} placeholder="teks bebas (dropdown menyusul)" /></div>
                <div><label className="block text-xs text-gray-500 mb-1">Kegiatan</label><input className="select-filter w-full" value={kegiatan} onChange={e => setKegiatan(e.target.value)} /></div>
                <div><label className="block text-xs text-gray-500 mb-1">Sub Kegiatan</label><input className="select-filter w-full" value={subKeg} onChange={e => setSubKeg(e.target.value)} /></div>
                <div />
                <div><label className="block text-xs text-gray-500 mb-1">Nama Penyedia</label><input className="select-filter w-full" value={penyedia} onChange={e => setPenyedia(e.target.value)} /></div>
                <div><label className="block text-xs text-gray-500 mb-1">Nama PPK (Pejabat Pembuat Komitmen)</label><input className="select-filter w-full" value={ppk} onChange={e => setPpk(e.target.value)} /></div>
                <div className="sm:col-span-2"><label className="block text-xs text-gray-500 mb-1">Keterangan Kontrak</label><input className="select-filter w-full" value={ketKontrak} onChange={e => setKetKontrak(e.target.value)} /></div>
              </div>
            </div>
            {/* Kartu 2: BAST */}
            <div className="pt-2 border-t border-gray-100">
              <p className="text-xs font-semibold text-gray-600 mb-2">Kartu 2 — Berita Acara Serah Terima (BAST)</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div><label className="block text-xs text-gray-500 mb-1">No. BAST</label><input className="select-filter w-full" value={noBast} onChange={e => setNoBast(e.target.value)} /></div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Tgl BAST <span className="text-gray-400">(= tgl perolehan)</span></label>
                  <input type="date" className="select-filter w-full" value={tglBast} onChange={e => setTglBast(e.target.value)} />
                  <p className="text-xs text-gray-400 mt-1">Kosong → pakai tgl kontrak. Perolehan: {perolehanDate}</p>
                </div>
                <div className="sm:col-span-2"><label className="block text-xs text-gray-500 mb-1">Keterangan BAST</label><input className="select-filter w-full" value={ketBast} onChange={e => setKetBast(e.target.value)} /></div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Entry barang */}
      <div className="card p-5">
        <h2 className="text-base font-semibold text-gray-800 mb-4">Barang</h2>

        {/* Cari kode barang */}
        <div className="flex flex-wrap items-end gap-3 mb-3">
          <div className="flex-1 min-w-[220px]">
            <label className="block text-xs text-gray-500 mb-1">Cari Kode Barang (kode / nama baku)</label>
            <input className="select-filter w-full" placeholder="mis. 1.3.2 atau 'komputer'..."
              value={kodeSearch} onChange={e => setKodeSearch(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); cariKode() } }} />
          </div>
          <button className="btn-secondary" onClick={cariKode} disabled={searching}>{searching ? 'Mencari...' : 'Cari'}</button>
        </div>
        {kodeResults.length > 0 && (
          <div className="border border-gray-100 rounded-lg mb-4 max-h-52 overflow-y-auto divide-y divide-gray-50">
            {kodeResults.map(r => (
              <button key={r.kode} onClick={() => addLine(r.kode, r.uraian || '')}
                className="w-full text-left px-3 py-2 hover:bg-teal/5 text-xs">
                <span className="font-medium text-gray-700">{r.kode}</span>
                <span className="text-gray-500"> — {r.uraian || '(tanpa uraian)'}</span>
              </button>
            ))}
          </div>
        )}

        {/* Baris barang */}
        {lines.length === 0 ? (
          <div className="py-8 text-center text-gray-400 text-sm">Cari & pilih kode barang di atas untuk menambah baris.</div>
        ) : (
          <div className="border border-gray-100 rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="table-th">Kode / Nama Barang</th>
                    <th className="table-th w-28 text-center">Satuan</th>
                    <th className="table-th w-24 text-center">Kuantitas</th>
                    <th className="table-th w-40 text-right">Harga / item</th>
                    <th className="table-th w-40 text-right">Subtotal</th>
                    <th className="table-th w-10" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {lines.map(l => (
                    <tr key={l.key}>
                      <td className="table-td">
                        <input className="select-filter w-full text-xs" value={l.nama} onChange={e => updateLine(l.key, { nama: e.target.value })} placeholder="nama barang" />
                        <p className="text-gray-400 text-xs mt-0.5">{l.kode}</p>
                      </td>
                      <td className="table-td"><input className="select-filter w-full text-xs text-center" value={l.satuan} onChange={e => updateLine(l.key, { satuan: e.target.value })} placeholder="unit" /></td>
                      <td className="table-td"><input className="select-filter w-full text-xs text-center" inputMode="numeric" value={l.qty} onChange={e => updateLine(l.key, { qty: e.target.value })} /></td>
                      <td className="table-td"><input className="select-filter w-full text-xs text-right" inputMode="numeric" value={l.harga} onChange={e => updateLine(l.key, { harga: e.target.value })} placeholder="0" /></td>
                      <td className="table-td text-right text-xs text-gray-600">{formatRupiah(toInt(l.qty) * toNum(l.harga))}</td>
                      <td className="table-td text-center">
                        <button onClick={() => removeLine(l.key)} title="Hapus baris" className="inline-flex items-center justify-center w-7 h-7 rounded bg-red-500 hover:bg-red-600 text-white">🗑</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {err && <p className="mt-3 text-sm text-red-600">{err}</p>}

        <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-100">
          <span className="text-sm text-gray-600">
            {lines.length} baris · {totalUnit} unit (setelah split) · <span className="font-medium">{formatRupiah(totalNilai)}</span>
          </span>
          <button className="btn-primary" onClick={simpan} disabled={saving || lines.length === 0}>
            {saving ? 'Menyimpan...' : header ? 'Tambah ke Kontrak' : 'Simpan Pengadaan'}
          </button>
        </div>
      </div>
    </div>
  )
}
