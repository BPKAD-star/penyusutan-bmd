'use client'
// No.11: Penghapusan — alur jurnal ala e-SIMBADA, dengan header editable.
//   1. Pilih SKPD.
//   2. Tambah jurnal: No SK, tanggal, jenis + bentuk, keterangan (→ jurnal_header).
//   3. Centang barang → simpan sebagai baris ledger ber-header_id (append-only).
//   4. Kartu jurnal: ikon edit (ganti No SK/tanggal, WAJIB semester sama),
//      ikon + (tambah barang ke SK yang sama), ikon sampah per barang (batal).
// Header (No SK/tanggal) boleh diedit; ledger tetap beku. Pindah semester tak
// diizinkan lewat edit → dijaga trigger DB + validasi UI (lihat CLAUDE.md).
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { catatTransaksi } from '@/lib/transaksi'
import { periodeDariTanggal, GOLONGAN_DAFTAR_BARANG, kodeLevel3 } from '@/lib/bmd'
import { formatRupiah } from '@/lib/export'
import FormShell from './FormShell'
import SkpdCombobox from '@/components/SkpdCombobox'

type JenisHapus = 'penghapusan_pemindahtanganan' | 'penghapusan_sebab_lain'

const JENIS_OPT: { value: JenisHapus; label: string }[] = [
  { value: 'penghapusan_pemindahtanganan', label: 'Pemindahtanganan' },
  { value: 'penghapusan_sebab_lain', label: 'Sebab Lain (force majeure)' },
]
const SUBJENIS_OPT = [
  { value: 'hibah', label: 'Hibah' },
  { value: 'penjualan', label: 'Penjualan' },
  { value: 'tukar_menukar', label: 'Tukar-Menukar' },
  { value: 'penyertaan_modal', label: 'Penyertaan Modal Pemerintah' },
]

const PENGHAPUSAN_JENIS = ['penghapusan_pemindahtanganan', 'penghapusan_sebab_lain']

type Barang = {
  id: string
  nibar: string | null
  kode: string
  nama_barang: string | null
  merek_tipe: string | null
  jumlah: number
  satuan: string | null
  nilai_perolehan: number
  skpd_id: number | null
}

// Header jurnal (jurnal_header) + baris barang (dari transaksi_bmd ber-header_id).
type Header = {
  id: string
  no_sk: string
  tanggal: string
  periode: string
  jenis: JenisHapus
  sub_jenis: string | null
  keterangan: string | null
}
type JurnalLine = {
  aset_id: string
  nibar: string | null
  kode: string
  nama_barang: string | null
  merek_tipe: string | null
  jumlah: number
  satuan: string | null
  nilai: number
}
type Jurnal = Header & { lines: JurnalLine[]; total: number }

export default function Penghapusan() {
  const supabase = createClient()

  const [skpdList, setSkpdList] = useState<{ id: number; nama: string }[]>([])
  const [golonganLabels, setGolonganLabels] = useState<Record<string, string>>({})
  const [skpd, setSkpd] = useState('')

  const [jurnals, setJurnals] = useState<Jurnal[]>([])
  const [loadingJurnal, setLoadingJurnal] = useState(false)

  const [mode, setMode] = useState<'list' | 'tambah'>('list')
  const [addTo, setAddTo] = useState<Header | null>(null)   // "+" tambah barang ke jurnal ini
  const [editing, setEditing] = useState<Header | null>(null) // edit header
  const [msg, setMsg] = useState('')

  // ── Referensi awal ──
  useEffect(() => {
    ;(async () => {
      const rows: { id: number; nama: string }[] = []
      for (let from = 0; ; from += 1000) {
        const { data } = await supabase.from('skpd').select('id,nama').range(from, from + 999)
        if (!data || data.length === 0) break
        rows.push(...data)
        if (data.length < 1000) break
      }
      setSkpdList(rows)
    })()
    ;(async () => {
      const { data: jenis } = await supabase.from('jenis_aset').select('id,nama')
      const namaById = new Map((jenis || []).map(j => [j.id, j.nama]))
      const labels: Record<string, string> = {}
      await Promise.all(GOLONGAN_DAFTAR_BARANG.map(async prefix => {
        const { data } = await supabase.from('kodefikasi_bmd')
          .select('jenis_aset_id').eq('kode_jenis', prefix).not('jenis_aset_id', 'is', null).limit(1)
        const id = data?.[0]?.jenis_aset_id
        labels[prefix] = (id != null && namaById.get(id)) || prefix
      }))
      setGolonganLabels(labels)
    })()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Muat jurnal penghapusan milik SKPD terpilih ──
  const loadJurnals = useCallback(async (skpdId: string) => {
    if (!skpdId) { setJurnals([]); return }
    setLoadingJurnal(true)

    const { data: headers } = await supabase.from('jurnal_header')
      .select('id,no_sk,tanggal,periode,jenis,sub_jenis,keterangan')
      .eq('kategori', 'penghapusan').eq('skpd_id', Number(skpdId))
      .order('tanggal', { ascending: false })
    const hs = (headers || []) as Header[]

    const jmap = new Map<string, Jurnal>()
    for (const h of hs) jmap.set(h.id, { ...h, lines: [], total: 0 })

    if (hs.length > 0) {
      const { data } = await supabase.from('transaksi_bmd')
        .select('id,header_id,nilai,aset:aset_id(id,nibar,nama_barang,kode,merek_tipe,jumlah,satuan,status)')
        .in('jenis', PENGHAPUSAN_JENIS as never)
        .in('header_id', hs.map(h => h.id))
        .order('id', { ascending: false })

      const rows = (data || []) as unknown as {
        id: number; header_id: string; nilai: number
        aset: (Barang & { status: string }) | null
      }[]
      // Dedup per aset: baris penghapusan TERBARU (id desc) menentukan keanggotaan.
      // Hanya barang yang masih 'dihapus' yang jadi anggota jurnal saat ini.
      const seen = new Set<string>()
      for (const r of rows) {
        if (!r.aset || seen.has(r.aset.id)) continue
        seen.add(r.aset.id)
        if (r.aset.status !== 'dihapus') continue
        const j = jmap.get(r.header_id)
        if (!j) continue
        j.lines.push({
          aset_id: r.aset.id, nibar: r.aset.nibar, kode: r.aset.kode, nama_barang: r.aset.nama_barang,
          merek_tipe: r.aset.merek_tipe, jumlah: r.aset.jumlah, satuan: r.aset.satuan, nilai: r.nilai,
        })
        j.total += r.nilai
      }
    }
    // Sembunyikan jurnal tanpa barang (auto-ilang): entah karena semua barang
    // sudah dibatalkan, atau header orphan sisa entry yang gagal. Header tetap di
    // DB (baris ledger yg pernah ada memblok DELETE via FK), cukup tak ditampilkan.
    setJurnals([...jmap.values()].filter(j => j.lines.length > 0))
    setLoadingJurnal(false)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadJurnals(skpd); setMode('list'); setAddTo(null); setEditing(null) }, [skpd, loadJurnals])

  async function hapusBarang(asetId: string, h: Header) {
    if (!confirm('Batalkan penghapusan barang ini? Barang akan kembali aktif dan penyusutan dilanjutkan.')) return
    // Reversal dicatat di PERIODE penghapusan asli (header.tanggal), bukan hari ini —
    // supaya di view periode itu barang langsung kembali muncul (konsisten Daftar Barang).
    const { error } = await catatTransaksi(supabase, {
      asetId, jenis: 'batal_penghapusan', tanggal: h.tanggal,
      keterangan: `Pembatalan dari jurnal ${h.no_sk}`,
    })
    if (error) { setMsg(`Error: ${error}`); return }
    setMsg('Barang dikeluarkan dari jurnal — kembali aktif, penyusutan dilanjutkan.')
    loadJurnals(skpd)
  }

  const skpdNama = skpdList.find(s => String(s.id) === skpd)?.nama

  return (
    <FormShell judul="Penghapusan" msg={msg}
      deskripsi="Pilih SKPD, buat jurnal penghapusan (No SK/tanggal), lalu centang barang. Soft-delete: data & histori tetap tersimpan.">
      {/* Pilih SKPD */}
      <div className="card p-5 mb-4">
        <div className="flex items-center gap-3">
          <label className="w-32 text-sm text-gray-600 text-right flex-shrink-0">Lokasi / SKPD :</label>
          <SkpdCombobox value={skpd} onChange={id => { setSkpd(id); setMsg('') }}
            placeholder="Ketik nama SKPD / Sub OPD / Lokasi..." />
        </div>
      </div>

      {!skpd ? (
        <div className="card p-12 text-center text-gray-400 text-sm">
          Pilih SKPD di atas untuk melihat & membuat jurnal penghapusan.
        </div>
      ) : mode === 'tambah' ? (
        <BarangForm
          skpdId={Number(skpd)} skpdNama={skpdNama || ''} golonganLabels={golonganLabels} header={null}
          onCancel={() => setMode('list')}
          onSaved={(n) => { setMode('list'); setMsg(`Jurnal tersimpan — ${n} barang dihapus dari laporan (penyusutan berhenti).`); loadJurnals(skpd) }}
        />
      ) : addTo ? (
        <BarangForm
          skpdId={Number(skpd)} skpdNama={skpdNama || ''} golonganLabels={golonganLabels} header={addTo}
          onCancel={() => setAddTo(null)}
          onSaved={(n) => { setAddTo(null); setMsg(`${n} barang ditambahkan ke jurnal ${addTo.no_sk}.`); loadJurnals(skpd) }}
        />
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">{skpdNama} — {jurnals.length} jurnal penghapusan</span>
            <button className="btn-primary" onClick={() => { setMsg(''); setMode('tambah') }}>+ Tambah Jurnal</button>
          </div>

          {loadingJurnal ? (
            <div className="card p-12 text-center text-gray-400 text-sm">Memuat jurnal...</div>
          ) : jurnals.length === 0 ? (
            <div className="card p-12 text-center text-gray-400 text-sm">Belum ada penghapusan untuk SKPD ini.</div>
          ) : jurnals.map(j => (
            <div key={j.id} className="card overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/60">
                <div className="flex items-start justify-between gap-4">
                  <div className="text-sm space-y-0.5">
                    <p className="font-semibold text-gray-800">No. SK: {j.no_sk}</p>
                    <p className="text-xs text-gray-500">
                      {JENIS_OPT.find(o => o.value === j.jenis)?.label}
                      {j.sub_jenis && ` · ${SUBJENIS_OPT.find(o => o.value === j.sub_jenis)?.label || j.sub_jenis}`}
                      {' · '}Tgl. {j.tanggal} · {j.periode}
                    </p>
                    {j.keterangan && <p className="text-xs text-gray-500">Keterangan: {j.keterangan}</p>}
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <div className="text-right">
                      <p className="text-xs text-gray-400">Total Penghapusan</p>
                      <p className="font-semibold text-gray-800">{formatRupiah(j.total)}</p>
                    </div>
                    <button title="Edit No SK / tanggal (dalam semester yang sama)"
                      onClick={() => { setMsg(''); setEditing(j) }}
                      className="inline-flex items-center justify-center w-8 h-8 rounded bg-gray-100 hover:bg-gray-200 text-gray-700">✎</button>
                    <button title="Tambah barang ke jurnal ini"
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
                      <th className="table-th text-center">Jumlah</th>
                      <th className="table-th text-right">Nilai</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {j.lines.length === 0 ? (
                      <tr><td colSpan={5} className="table-td text-center py-6 text-gray-400 text-xs">Belum ada barang — klik + untuk menambah.</td></tr>
                    ) : j.lines.map(l => (
                      <tr key={l.aset_id}>
                        <td className="table-td text-center">
                          <button
                            onClick={() => hapusBarang(l.aset_id, j)}
                            title="Batalkan penghapusan barang ini"
                            className="inline-flex items-center justify-center w-7 h-7 rounded bg-red-500 hover:bg-red-600 text-white"
                          >🗑</button>
                        </td>
                        <td className="table-td">
                          <p className="font-medium text-gray-800 text-xs">{l.nama_barang || '-'}</p>
                          <p className="text-gray-400 text-xs mt-0.5">{l.nibar || '-'} · {l.kode}</p>
                        </td>
                        <td className="table-td text-xs text-gray-600">{l.merek_tipe || '-'}</td>
                        <td className="table-td text-center text-xs">{l.jumlah} {l.satuan || ''}</td>
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
          onSaved={() => { setEditing(null); setMsg('Header jurnal diperbarui.'); loadJurnals(skpd) }}
        />
      )}
    </FormShell>
  )
}

// ── Modal edit header: No SK + tanggal (kunci semester sama) + keterangan ────
function EditHeaderModal({ header, onClose, onSaved }: {
  header: Header; onClose: () => void; onSaved: () => void
}) {
  const supabase = createClient()
  const [noSk, setNoSk] = useState(header.no_sk)
  const [tgl, setTgl] = useState(header.tanggal)
  const [ket, setKet] = useState(header.keterangan || '')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const tglPeriode = periodeDariTanggal(tgl)
  const pindahSemester = tglPeriode !== header.periode

  async function simpan() {
    if (!noSk.trim()) { setErr('No. SK wajib diisi.'); return }
    if (pindahSemester) {
      setErr(`Tanggal masuk ${tglPeriode}, sedangkan jurnal ini di ${header.periode}. Pindah semester tidak diizinkan — batalkan & buat jurnal baru.`)
      return
    }
    setErr(''); setSaving(true)
    const { error } = await supabase.from('jurnal_header')
      .update({ no_sk: noSk.trim(), tanggal: tgl, keterangan: ket.trim() || null })
      .eq('id', header.id)
    if (error) { setErr(`Gagal menyimpan: ${error.message}`); setSaving(false); return }
    setSaving(false); onSaved()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="card w-full max-w-lg" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-semibold text-gray-800">Edit Header Jurnal</h3>
          <button className="text-gray-400 hover:text-gray-700 text-xl leading-none" onClick={onClose}>×</button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">No. SK / BA Penghapusan</label>
            <input className="select-filter w-full" value={noSk} onChange={e => setNoSk(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Tanggal <span className="text-gray-400">(harus tetap di {header.periode})</span></label>
            <input type="date" className="select-filter w-full" value={tgl} onChange={e => setTgl(e.target.value)} />
            {pindahSemester && (
              <p className="text-xs text-red-600 mt-1">Tanggal ini masuk {tglPeriode} — di luar semester jurnal. Ganti tanggal atau batalkan & entry ulang.</p>
            )}
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Keterangan</label>
            <input className="select-filter w-full" value={ket} onChange={e => setKet(e.target.value)} />
          </div>
          {err && <p className="text-sm text-red-600">{err}</p>}
        </div>
        <div className="px-5 py-4 border-t border-gray-100 flex justify-end gap-2">
          <button className="btn-secondary" onClick={onClose}>Batal</button>
          <button className="btn-primary" onClick={simpan} disabled={saving || pindahSemester}>{saving ? 'Menyimpan...' : 'Simpan'}</button>
        </div>
      </div>
    </div>
  )
}

// ── Sub-view: (opsional header baru) + pemilihan barang (centang) ───────────
// header=null → buat jurnal baru (bikin jurnal_header dulu). header=… → tambah
// barang ke jurnal yang sudah ada (insert baris ledger ber-header_id yg sama).
function BarangForm({ skpdId, skpdNama, golonganLabels, header, onCancel, onSaved }: {
  skpdId: number; skpdNama: string; golonganLabels: Record<string, string>
  header: Header | null; onCancel: () => void; onSaved: (n: number) => void
}) {
  const supabase = createClient()

  const [jenis, setJenis] = useState<JenisHapus>('penghapusan_pemindahtanganan')
  const [subJenis, setSubJenis] = useState('hibah')
  const [noSk, setNoSk] = useState('')
  const [tgl, setTgl] = useState(new Date().toISOString().slice(0, 10))
  const [ket, setKet] = useState('')

  const [fGolongan, setFGolongan] = useState('')
  const [fKomptabel, setFKomptabel] = useState('')
  const [fSearch, setFSearch] = useState('')

  const [rows, setRows] = useState<Barang[]>([])
  const [loaded, setLoaded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [sel, setSel] = useState<Record<string, Barang>>({})
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  async function tampilkan() {
    setLoading(true)
    let q = supabase.from('aset')
      .select('id,nibar,kode,nama_barang,merek_tipe,jumlah,satuan,nilai_perolehan,skpd_id')
      .eq('status', 'aktif').eq('skpd_id', skpdId)
    if (fGolongan) q = q.like('kode', `${fGolongan}.%`)
    if (fKomptabel) q = q.eq('intra_ekstra', fKomptabel)
    if (fSearch) q = q.or(`nama_barang.ilike.%${fSearch}%,nibar.ilike.%${fSearch}%,kode.ilike.${fSearch}%`)
    const { data } = await q.order('nilai_perolehan', { ascending: false }).limit(500)
    setRows((data as unknown as Barang[]) || [])
    setLoaded(true)
    setLoading(false)
  }

  function toggle(b: Barang) {
    setSel(prev => {
      const next = { ...prev }
      if (next[b.id]) delete next[b.id]; else next[b.id] = b
      return next
    })
  }
  function toggleAll() {
    setSel(prev => {
      const allSelected = rows.length > 0 && rows.every(r => prev[r.id])
      if (allSelected) return {}
      const next = { ...prev }
      for (const r of rows) next[r.id] = r
      return next
    })
  }

  const selList = Object.values(sel)
  const selTotal = selList.reduce((s, b) => s + b.nilai_perolehan, 0)

  // Insert baris penghapusan untuk header tertentu.
  async function insertLines(h: Header): Promise<string | null> {
    const trxRows = selList.map(b => ({
      aset_id: b.id, jenis: h.jenis, periode: h.periode, tanggal: h.tanggal, nilai: b.nilai_perolehan,
      skpd_asal: b.skpd_id, header_id: h.id, payload: {},
    }))
    const { error } = await supabase.from('transaksi_bmd').insert(trxRows)
    if (error) return `Gagal mencatat transaksi: ${error.message}`
    const { error: e2 } = await supabase.from('aset').update({ status: 'dihapus' }).in('id', selList.map(b => b.id))
    if (e2) return `Transaksi tercatat, tapi update status aset gagal: ${e2.message}`
    return null
  }

  async function simpan() {
    if (selList.length === 0) { setErr('Centang minimal satu barang.'); return }
    setErr(''); setSaving(true)

    let h = header
    const headerBaru = !header
    if (!h) {
      // Buat header baru dulu.
      if (!noSk.trim()) { setErr('No. SK / dasar penghapusan wajib diisi.'); setSaving(false); return }
      const { data, error } = await supabase.from('jurnal_header').insert({
        skpd_id: skpdId, kategori: 'penghapusan', jenis,
        sub_jenis: jenis === 'penghapusan_pemindahtanganan' ? subJenis : null,
        no_sk: noSk.trim(), tanggal: tgl, keterangan: ket.trim() || null,
      }).select('id,no_sk,tanggal,periode,jenis,sub_jenis,keterangan').single()
      if (error || !data) { setErr(`Gagal membuat header jurnal: ${error?.message}`); setSaving(false); return }
      h = data as Header
    }

    const e = await insertLines(h)
    if (e) {
      // Header baru + gagal isi barang → hapus header supaya tak jadi orphan
      // (kartu jurnal kosong). Header lama (tambah barang) dibiarkan utuh.
      if (headerBaru) await supabase.from('jurnal_header').delete().eq('id', h.id)
      setErr(e); setSaving(false); return
    }
    setSaving(false)
    onSaved(selList.length)
  }

  const allSelected = rows.length > 0 && rows.every(r => sel[r.id])

  return (
    <div className="space-y-4">
      {/* Header jurnal — form (baru) atau ringkasan read-only (tambah barang) */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-800">
            {header ? `Tambah Barang — ${header.no_sk}` : `Jurnal Penghapusan Baru — ${skpdNama}`}
          </h2>
          <button className="btn-secondary text-xs" onClick={onCancel}>← Kembali</button>
        </div>

        {header ? (
          <p className="text-sm text-gray-500">
            {JENIS_OPT.find(o => o.value === header.jenis)?.label}
            {header.sub_jenis && ` · ${SUBJENIS_OPT.find(o => o.value === header.sub_jenis)?.label || header.sub_jenis}`}
            {' · '}Tgl. {header.tanggal} · {header.periode}
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Jenis Penghapusan</label>
              <select className="select-filter w-full" value={jenis} onChange={e => setJenis(e.target.value as JenisHapus)}>
                {JENIS_OPT.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            {jenis === 'penghapusan_pemindahtanganan' && (
              <div>
                <label className="block text-xs text-gray-500 mb-1">Bentuk Pemindahtanganan</label>
                <select className="select-filter w-full" value={subJenis} onChange={e => setSubJenis(e.target.value)}>
                  {SUBJENIS_OPT.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            )}
            <div>
              <label className="block text-xs text-gray-500 mb-1">No. SK / BA Penghapusan</label>
              <input className="select-filter w-full" value={noSk} onChange={e => setNoSk(e.target.value)} placeholder="mis. 100.3.3.2/74/418.08/2024" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Tanggal</label>
              <input type="date" className="select-filter w-full" value={tgl} onChange={e => setTgl(e.target.value)} />
              <p className="text-xs text-gray-400 mt-1">Periode: {periodeDariTanggal(tgl)}</p>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs text-gray-500 mb-1">Keterangan</label>
              <input className="select-filter w-full" value={ket} onChange={e => setKet(e.target.value)} placeholder="mis. Penghapusan Lelang" />
            </div>
          </div>
        )}
      </div>

      {/* Filter & pilih barang */}
      <div className="card p-5">
        <h2 className="text-base font-semibold text-gray-800 mb-4">Pilih Barang</h2>
        <div className="flex flex-wrap items-end gap-3 mb-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Kode Jenis</label>
            <select className="select-filter" value={fGolongan} onChange={e => setFGolongan(e.target.value)}>
              <option value="">Semua Jenis Aset</option>
              {GOLONGAN_DAFTAR_BARANG.map(g => <option key={g} value={g}>{g} — {golonganLabels[g] || '...'}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Komptabel</label>
            <select className="select-filter" value={fKomptabel} onChange={e => setFKomptabel(e.target.value)}>
              <option value="">Semua</option>
              <option value="intra">Intrakomptabel</option>
              <option value="ekstra">Ekstrakomptabel</option>
            </select>
          </div>
          <div className="flex-1 min-w-[180px]">
            <label className="block text-xs text-gray-500 mb-1">Cari</label>
            <input className="select-filter w-full" placeholder="Nama barang / NIBAR / kode..."
              value={fSearch} onChange={e => setFSearch(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') tampilkan() }} />
          </div>
          <button className="btn-primary" onClick={tampilkan} disabled={loading}>{loading ? 'Memuat...' : 'Tampilkan'}</button>
        </div>

        {!loaded ? (
          <div className="py-10 text-center text-gray-400 text-sm">Atur filter lalu klik Tampilkan untuk memilih barang.</div>
        ) : (
          <div className="border border-gray-100 rounded-lg overflow-hidden">
            <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-100 sticky top-0">
                  <tr>
                    <th className="table-th w-10 text-center">
                      <input type="checkbox" checked={allSelected} onChange={toggleAll} />
                    </th>
                    <th className="table-th">Barang</th>
                    <th className="table-th">Merek / Tipe</th>
                    <th className="table-th text-center">Jumlah</th>
                    <th className="table-th text-right">Nilai Perolehan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {rows.length === 0 ? (
                    <tr><td colSpan={5} className="table-td text-center py-10 text-gray-400">Tidak ada barang aktif untuk filter ini.</td></tr>
                  ) : rows.map(b => (
                    <tr key={b.id} className={sel[b.id] ? 'bg-teal/5' : ''}>
                      <td className="table-td text-center">
                        <input type="checkbox" checked={!!sel[b.id]} onChange={() => toggle(b)} />
                      </td>
                      <td className="table-td">
                        <p className="font-medium text-gray-800 text-xs">{b.nama_barang || '-'}</p>
                        <p className="text-gray-400 text-xs mt-0.5">{b.nibar || '-'} · {b.kode} · {golonganLabels[kodeLevel3(b.kode)] || kodeLevel3(b.kode)}</p>
                      </td>
                      <td className="table-td text-xs text-gray-600">{b.merek_tipe || '-'}</td>
                      <td className="table-td text-center text-xs">{b.jumlah} {b.satuan || ''}</td>
                      <td className="table-td text-right text-xs">{formatRupiah(b.nilai_perolehan)}</td>
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
            {selList.length} barang dipilih · <span className="font-medium">{formatRupiah(selTotal)}</span>
          </span>
          <button className="btn-primary" onClick={simpan} disabled={saving || selList.length === 0}>
            {saving ? 'Menyimpan...' : header ? 'Tambah ke Jurnal' : 'Simpan Penghapusan'}
          </button>
        </div>
      </div>
    </div>
  )
}
