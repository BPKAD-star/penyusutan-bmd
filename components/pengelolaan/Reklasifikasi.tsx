'use client'
// Reklasifikasi — 4 alasan, alur ber-SK sama seperti Penghapusan/Kapitalisasi:
//   1. Pilih SKPD.
//   2. Tambah jurnal: pilih alasan reklasifikasi, dokumen sumber, tanggal,
//      keterangan (→ jurnal_header, kategori 'reklasifikasi').
//   3. Alasan Perubahan Fungsi BMD / Kesalahan Kodefikasi: pilih SATU kode
//      tujuan dulu (berlaku utk semua barang di jurnal ini).
//   4. Centang barang → simpan sebagai baris ledger ber-header_id.
//
// 4 alasan (efek penyusutan BEDA, lihat lib/engine/penyusutan.ts):
//   - Intra→Ekstra / Ekstra→Intra komptabel: nilai penyusutan TETAP, cuma
//     aset.intra_ekstra yang di-flip. Ledger jenis: 'reklas_komptabel'.
//   - Perubahan Fungsi BMD (lintas golongan/rumpun, mis. KDP→Gedung): FRESH
//     START — penyusutan mulai dari tanggal reklas, BUKAN retroaktif. Ledger
//     jenis BARU: 'reklas_golongan'.
//   - Kesalahan Kodefikasi (tetap satu rumpun): penyusutan dihitung ULANG
//     retroaktif dari tgl_perolehan pakai masa manfaat kode tujuan. Ledger
//     jenis lama yang sudah ada: 'reklas_kode' (reuse apa adanya).
//
// Header (No dokumen/tanggal) boleh diedit selama semester sama; ledger tetap
// beku. Belum ada mekanisme batal/reversal utk reklasifikasi (out of scope —
// lihat CLAUDE.md/plan).
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { periodeDariTanggal, GOLONGAN_DAFTAR_BARANG, kodeLevel3 } from '@/lib/bmd'
import { formatRupiah } from '@/lib/export'
import FormShell from './FormShell'
import SkpdCombobox from '@/components/SkpdCombobox'
import { useDateBounds } from '@/components/useTahunBuku'

type Alasan = 'komptabel_ke_ekstra' | 'komptabel_ke_intra' | 'golongan' | 'kode'

const ALASAN_OPT: { value: Alasan; label: string; deskripsi: string }[] = [
  { value: 'komptabel_ke_ekstra', label: 'Intra → Ekstra Komptabel', deskripsi: 'Nilai penyusutan tetap sama, cuma status komptabel yang berubah.' },
  { value: 'komptabel_ke_intra', label: 'Ekstra → Intra Komptabel', deskripsi: 'Nilai penyusutan tetap sama. Dibutuhkan sebelum kapitalisasi (mensyaratkan komptabel sama).' },
  { value: 'golongan', label: 'Perubahan Fungsi BMD', deskripsi: 'Barang pindah golongan/jenis BMD sepenuhnya (mis. KDP selesai dibangun jadi Gedung, atau barang rusak berat direklas ke Aset Lain-Lain). Penyusutan mulai dihitung ULANG sejak tanggal reklas ini (bukan retroaktif).' },
  { value: 'kode', label: 'Kesalahan Kodefikasi', deskripsi: 'Tetap dalam jenis BMD yang sama, cuma kodefikasi detailnya salah pilih. Penyusutan dihitung ulang RETROAKTIF dari tanggal perolehan asli, pakai masa manfaat kodefikasi tujuan.' },
]
const ALASAN_LABEL = Object.fromEntries(ALASAN_OPT.map(a => [a.value, a.label])) as Record<Alasan, string>

const LEDGER_JENIS: Record<Alasan, string> = {
  komptabel_ke_ekstra: 'reklas_komptabel',
  komptabel_ke_intra: 'reklas_komptabel',
  golongan: 'reklas_golongan',
  kode: 'reklas_kode',
}
const perluKodeTujuan = (a: Alasan) => a === 'golongan' || a === 'kode'
const targetKomptabel = (a: Alasan): 'intra' | 'ekstra' => a === 'komptabel_ke_ekstra' ? 'ekstra' : 'intra'
const filterKomptabelAwal = (a: Alasan): 'intra' | 'ekstra' | null =>
  a === 'komptabel_ke_ekstra' ? 'intra' : a === 'komptabel_ke_intra' ? 'ekstra' : null

type Barang = {
  id: string
  nibar: string | null
  kode: string
  nama_barang: string | null
  merek_tipe: string | null
  jumlah: number
  satuan: string | null
  nilai_perolehan: number
  intra_ekstra: string | null
  skpd_id: number | null
}
type LinePayload = {
  intra_ekstra_lama?: string; intra_ekstra?: string
  kode_lama?: string; kode_baru?: string; uraian_baru?: string
}
type HeaderPayload = { kode_tujuan?: string; uraian_tujuan?: string }
type Header = {
  id: string
  no_sk: string
  tanggal: string
  periode: string
  jenis: Alasan
  keterangan: string | null
  kategori: 'reklasifikasi'
  payload: HeaderPayload | null
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
  payload: LinePayload | null
}
type Jurnal = Header & { lines: JurnalLine[]; total: number }

const HEADER_COLS = 'id,no_sk,tanggal,periode,jenis,keterangan,kategori,payload'

function ringkasanBaris(l: JurnalLine): string {
  const p = l.payload || {}
  if (p.kode_baru) return `${p.kode_lama || l.kode} → ${p.kode_baru}`
  if (p.intra_ekstra) return `${(p.intra_ekstra_lama || '-').toUpperCase()} → ${p.intra_ekstra.toUpperCase()}`
  return '-'
}

export default function Reklasifikasi() {
  const supabase = createClient()

  const [skpdList, setSkpdList] = useState<{ id: number; nama: string }[]>([])
  const [golonganLabels, setGolonganLabels] = useState<Record<string, string>>({})
  const [skpd, setSkpd] = useState('')

  const [jurnals, setJurnals] = useState<Jurnal[]>([])
  const [loadingJurnal, setLoadingJurnal] = useState(false)

  const [mode, setMode] = useState<'list' | 'tambah'>('list')
  const [addTo, setAddTo] = useState<Header | null>(null)
  const [editing, setEditing] = useState<Header | null>(null)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    ;(async () => {
      const rows: { id: number; nama: string }[] = []
      for (let from = 0; ; from += 1000) {
        const { data } = await supabase.from('admin_skpd').select('id,nama').range(from, from + 999)
        if (!data || data.length === 0) break
        rows.push(...data)
        if (data.length < 1000) break
      }
      setSkpdList(rows)
    })()
    ;(async () => {
      const { data: jenis } = await supabase.from('admin_jenis_aset').select('id,nama')
      const namaById = new Map((jenis || []).map(j => [j.id, j.nama]))
      const labels: Record<string, string> = {}
      await Promise.all(GOLONGAN_DAFTAR_BARANG.map(async prefix => {
        const { data } = await supabase.from('admin_kodefikasi_bmd')
          .select('jenis_aset_id').eq('kode_jenis', prefix).not('jenis_aset_id', 'is', null).limit(1)
        const id = data?.[0]?.jenis_aset_id
        labels[prefix] = (id != null && namaById.get(id)) || prefix
      }))
      setGolonganLabels(labels)
    })()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const loadJurnals = useCallback(async (skpdId: string) => {
    if (!skpdId) { setJurnals([]); return }
    setLoadingJurnal(true)

    const { data: headers } = await supabase.from('jurnal_header')
      .select(HEADER_COLS)
      .eq('kategori', 'reklasifikasi')
      .eq('skpd_id', Number(skpdId))
      .order('tanggal', { ascending: false })
    const hs = (headers || []) as unknown as Header[]

    const jmap = new Map<string, Jurnal>()
    for (const h of hs) jmap.set(h.id, { ...h, lines: [], total: 0 })

    const headerIds = hs.map(h => h.id)
    if (headerIds.length > 0) {
      const { data } = await supabase.from('transaksi_bmd')
        .select('header_id,nilai,payload,aset:aset_id(id,nibar,nama_barang,kode,merek_tipe,jumlah,satuan)')
        .in('jenis', ['reklas_kode', 'reklas_komptabel', 'reklas_golongan'] as never)
        .in('header_id', headerIds)
        .order('id', { ascending: true })
      const rows = (data || []) as unknown as {
        header_id: string; nilai: number; payload: LinePayload | null
        aset: Barang | null
      }[]
      for (const r of rows) {
        if (!r.aset) continue
        const j = jmap.get(r.header_id)
        if (!j) continue
        j.lines.push({
          aset_id: r.aset.id, nibar: r.aset.nibar, kode: r.aset.kode, nama_barang: r.aset.nama_barang,
          merek_tipe: r.aset.merek_tipe, jumlah: r.aset.jumlah, satuan: r.aset.satuan, nilai: r.nilai,
          payload: r.payload,
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
    <FormShell judul="Reklasifikasi" msg={msg}
      deskripsi="Pilih SKPD, buat jurnal (pilih alasan reklasifikasi + dokumen sumber), lalu centang barang.">
      <div className="card p-5 mb-4">
        <div className="flex items-center gap-3">
          <label className="w-32 text-sm text-gray-600 text-right flex-shrink-0">Lokasi / SKPD :</label>
          <SkpdCombobox value={skpd} onChange={id => { setSkpd(id); setMsg('') }}
            placeholder="Ketik nama SKPD / Sub OPD / Lokasi..." />
        </div>
      </div>

      {!skpd ? (
        <div className="card p-12 text-center text-gray-400 text-sm">
          Pilih SKPD di atas untuk melihat &amp; membuat jurnal reklasifikasi.
        </div>
      ) : mode === 'tambah' ? (
        <ReklasForm
          skpdId={Number(skpd)} skpdNama={skpdNama || ''} golonganLabels={golonganLabels} header={null}
          onCancel={() => setMode('list')}
          onSaved={n => { setMode('list'); setMsg(`Jurnal tersimpan — ${n} barang direklasifikasi.`); loadJurnals(skpd) }}
        />
      ) : addTo ? (
        <ReklasForm
          skpdId={Number(skpd)} skpdNama={skpdNama || ''} golonganLabels={golonganLabels} header={addTo}
          onCancel={() => setAddTo(null)}
          onSaved={n => { setAddTo(null); setMsg(`${n} barang ditambahkan ke jurnal ${addTo.no_sk}.`); loadJurnals(skpd) }}
        />
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">{skpdNama} — {jurnals.length} jurnal</span>
            <button className="btn-primary" onClick={() => { setMsg(''); setMode('tambah') }}>+ Tambah Jurnal</button>
          </div>

          {loadingJurnal ? (
            <div className="card p-12 text-center text-gray-400 text-sm">Memuat jurnal...</div>
          ) : jurnals.length === 0 ? (
            <div className="card p-12 text-center text-gray-400 text-sm">Belum ada reklasifikasi untuk SKPD ini.</div>
          ) : jurnals.map(j => (
            <div key={j.id} className="card overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/60">
                <div className="flex items-start justify-between gap-4">
                  <div className="text-sm space-y-0.5">
                    <p className="font-semibold text-gray-800">No. Dokumen: {j.no_sk}</p>
                    <p className="text-xs text-gray-500">
                      {ALASAN_LABEL[j.jenis]}
                      {j.payload?.kode_tujuan && ` → ${j.payload.kode_tujuan}${j.payload.uraian_tujuan ? ' — ' + j.payload.uraian_tujuan : ''}`}
                      {' · '}Tgl. {j.tanggal} · {j.periode}
                    </p>
                    {j.keterangan && <p className="text-xs text-gray-500">Keterangan: {j.keterangan}</p>}
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <div className="text-right">
                      <p className="text-xs text-gray-400">Total Nilai</p>
                      <p className="font-semibold text-gray-800">{formatRupiah(j.total)}</p>
                    </div>
                    <button title="Edit No dokumen / tanggal (dalam semester yang sama)"
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
                      <th className="table-th">Kode Register / Nama Barang</th>
                      <th className="table-th">Perubahan</th>
                      <th className="table-th text-center">Jumlah</th>
                      <th className="table-th text-right">Nilai</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {j.lines.map(l => (
                      <tr key={l.aset_id}>
                        <td className="table-td">
                          <p className="font-medium text-gray-800 text-xs">{l.nama_barang || '-'}</p>
                          <p className="text-gray-400 text-xs mt-0.5">{l.nibar || '-'} · {l.kode}</p>
                        </td>
                        <td className="table-td text-xs text-gray-600">{ringkasanBaris(l)}</td>
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

// ── Modal edit header: No dokumen + tanggal (kunci semester sama) + keterangan ──
function EditHeaderModal({ header, onClose, onSaved }: {
  header: Header; onClose: () => void; onSaved: () => void
}) {
  const supabase = createClient()
  const dateBounds = useDateBounds()
  const [noSk, setNoSk] = useState(header.no_sk)
  const [tgl, setTgl] = useState(header.tanggal)
  const [ket, setKet] = useState(header.keterangan || '')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const tglPeriode = periodeDariTanggal(tgl)
  const pindahSemester = tglPeriode !== header.periode

  async function simpan() {
    if (!noSk.trim()) { setErr('No. dokumen wajib diisi.'); return }
    if (pindahSemester) {
      setErr(`Tanggal masuk ${tglPeriode}, sedangkan jurnal ini di ${header.periode}. Pindah semester tidak diizinkan — batalkan & entry ulang.`)
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
            <label className="block text-xs text-gray-500 mb-1">No. Dokumen Sumber</label>
            <input className="select-filter w-full" value={noSk} onChange={e => setNoSk(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Tanggal <span className="text-gray-400">(harus tetap di {header.periode})</span></label>
            <input type="date" className="select-filter w-full" max={dateBounds.max} value={tgl} onChange={e => setTgl(e.target.value)} />
            {pindahSemester && (
              <p className="text-xs text-red-600 mt-1">
                Tanggal ini masuk {tglPeriode} — di luar semester jurnal. Ganti tanggal, atau batalkan &amp; entry ulang.
              </p>
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
function ReklasForm({ skpdId, skpdNama, golonganLabels, header, onCancel, onSaved }: {
  skpdId: number; skpdNama: string; golonganLabels: Record<string, string>
  header: Header | null; onCancel: () => void; onSaved: (n: number) => void
}) {
  const supabase = createClient()
  const dateBounds = useDateBounds()

  const [alasan, setAlasan] = useState<Alasan>(header?.jenis || 'komptabel_ke_ekstra')
  const [noSk, setNoSk] = useState('')
  const [tgl, setTgl] = useState(new Date().toISOString().slice(0, 10))
  const [ket, setKet] = useState('')

  // Kode tujuan (kasus golongan/kode) — tetap dari header kalau tambah barang.
  const [qKode, setQKode] = useState('')
  const [kandidatKode, setKandidatKode] = useState<{ kode: string; uraian: string; masa_manfaat_tahun: number }[]>([])
  const [kodeTujuan, setKodeTujuan] = useState<{ kode: string; uraian: string } | null>(
    header?.payload?.kode_tujuan ? { kode: header.payload.kode_tujuan, uraian: header.payload.uraian_tujuan || '' } : null
  )

  const [fGolongan, setFGolongan] = useState('')
  const [fSearch, setFSearch] = useState('')
  const [rows, setRows] = useState<Barang[]>([])
  const [loaded, setLoaded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [sel, setSel] = useState<Record<string, Barang>>({})
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const butuhKodeTujuan = perluKodeTujuan(alasan)
  const filterAwal = filterKomptabelAwal(alasan)

  async function cariKode() {
    const { data } = await supabase.from('admin_kodefikasi_bmd')
      .select('kode,uraian,masa_manfaat_tahun')
      .or(`kode.ilike.${qKode}%,uraian.ilike.%${qKode}%`).limit(20)
    setKandidatKode(data || [])
  }

  async function tampilkan() {
    setLoading(true)
    let q = supabase.from('aset')
      .select('id,nibar,kode,nama_barang,merek_tipe,jumlah,satuan,nilai_perolehan,intra_ekstra,skpd_id')
      .eq('status', 'aktif').eq('skpd_id', skpdId)
    if (fGolongan) q = q.like('kode', `${fGolongan}.%`)
    if (filterAwal) q = q.eq('intra_ekstra', filterAwal)
    if (fSearch) q = q.or(`nama_barang.ilike.%${fSearch}%,nibar.ilike.%${fSearch}%,kode.ilike.${fSearch}%`)
    const { data } = await q.order('nilai_perolehan', { ascending: false }).limit(500)
    setRows((data as unknown as Barang[]) || [])
    setLoaded(true)
    setLoading(false)
  }

  // Validasi per baris — kasus 'golongan' butuh rumpun BEDA, kasus 'kode' butuh rumpun SAMA.
  function invalidReason(b: Barang): string | null {
    if (!butuhKodeTujuan || !kodeTujuan) return null
    const samaRumpun = kodeLevel3(b.kode) === kodeLevel3(kodeTujuan.kode)
    if (b.kode === kodeTujuan.kode) return 'Sudah kode ini'
    if (alasan === 'golongan' && samaRumpun) return 'Masih satu rumpun — pakai alasan Kesalahan Kodefikasi'
    if (alasan === 'kode' && !samaRumpun) return 'Beda rumpun — pakai alasan Perubahan Fungsi BMD'
    return null
  }

  function toggle(b: Barang) {
    if (invalidReason(b)) return
    setSel(prev => {
      const next = { ...prev }
      if (next[b.id]) delete next[b.id]; else next[b.id] = b
      return next
    })
  }
  function toggleAll() {
    const valid = rows.filter(r => !invalidReason(r))
    setSel(prev => {
      const allSelected = valid.length > 0 && valid.every(r => prev[r.id])
      if (allSelected) return {}
      const next = { ...prev }
      for (const r of valid) next[r.id] = r
      return next
    })
  }

  const selList = Object.values(sel)
  const selTotal = selList.reduce((s, b) => s + b.nilai_perolehan, 0)

  async function insertLines(h: Header): Promise<string | null> {
    const jenisLedger = LEDGER_JENIS[h.jenis]
    const trxRows = selList.map(b => ({
      aset_id: b.id, jenis: jenisLedger, periode: h.periode, tanggal: h.tanggal, nilai: b.nilai_perolehan,
      header_id: h.id,
      payload: butuhKodeTujuan
        ? { kode_lama: b.kode, kode_baru: h.payload?.kode_tujuan, uraian_baru: h.payload?.uraian_tujuan }
        : { intra_ekstra_lama: b.intra_ekstra, intra_ekstra: targetKomptabel(h.jenis) },
    }))
    const { error } = await supabase.from('transaksi_bmd').insert(trxRows)
    if (error) return `Gagal mencatat transaksi: ${error.message}`
    const patch = butuhKodeTujuan
      ? { kode: h.payload?.kode_tujuan }
      : { intra_ekstra: targetKomptabel(h.jenis) }
    const { error: e2 } = await supabase.from('aset').update(patch).in('id', selList.map(b => b.id))
    if (e2) return `Transaksi tercatat, tapi update aset gagal: ${e2.message}`
    return null
  }

  async function simpan() {
    if (selList.length === 0) { setErr('Centang minimal satu barang.'); return }
    setErr(''); setSaving(true)

    let h = header
    const headerBaru = !header
    if (!h) {
      if (!noSk.trim()) { setErr('No. dokumen sumber wajib diisi.'); setSaving(false); return }
      if (butuhKodeTujuan && !kodeTujuan) { setErr('Kode tujuan wajib dipilih.'); setSaving(false); return }
      const { data, error } = await supabase.from('jurnal_header').insert({
        skpd_id: skpdId, kategori: 'reklasifikasi', jenis: alasan,
        no_sk: noSk.trim(), tanggal: tgl, keterangan: ket.trim() || null,
        payload: butuhKodeTujuan ? { kode_tujuan: kodeTujuan!.kode, uraian_tujuan: kodeTujuan!.uraian } : null,
      }).select(HEADER_COLS).single()
      if (error || !data) { setErr(`Gagal membuat header jurnal: ${error?.message}`); setSaving(false); return }
      h = data as unknown as Header
    }

    const e = await insertLines(h)
    if (e) {
      if (headerBaru) await supabase.from('jurnal_header').delete().eq('id', h.id)
      setErr(e); setSaving(false); return
    }
    setSaving(false)
    onSaved(selList.length)
  }

  const validRows = rows.filter(r => !invalidReason(r))
  const allSelected = validRows.length > 0 && validRows.every(r => sel[r.id])

  return (
    <div className="space-y-4">
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-800">
            {header ? `Tambah Barang — ${header.no_sk}` : `Jurnal Baru — ${skpdNama}`}
          </h2>
          <button className="btn-secondary text-xs" onClick={onCancel}>← Kembali</button>
        </div>

        {header ? (
          <p className="text-sm text-gray-500">
            {ALASAN_LABEL[header.jenis]}
            {header.payload?.kode_tujuan && ` → ${header.payload.kode_tujuan}`}
            {' · '}Tgl. {header.tanggal} · {header.periode}
          </p>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Alasan Reklasifikasi</label>
              <div className="space-y-2">
                {ALASAN_OPT.map(o => (
                  <label key={o.value} className={`flex items-start gap-2 p-2.5 rounded-lg border cursor-pointer text-sm ${
                    alasan === o.value ? 'border-teal bg-teal/5' : 'border-gray-200 hover:bg-gray-50'
                  }`}>
                    <input type="radio" className="mt-0.5" checked={alasan === o.value}
                      onChange={() => { setAlasan(o.value); setKodeTujuan(null); setSel({}); setRows([]); setLoaded(false) }} />
                    <span>
                      <span className="font-medium text-gray-800">{o.label}</span>
                      <span className="block text-xs text-gray-500 mt-0.5">{o.deskripsi}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {butuhKodeTujuan && (
              <div>
                <label className="block text-xs text-gray-500 mb-1">Kode Tujuan (dari kodefikasi BMD)</label>
                {kodeTujuan ? (
                  <div className="flex items-center justify-between p-3 bg-teal/5 border border-teal/30 rounded-lg text-sm">
                    <span className="text-xs">{kodeTujuan.kode} — {kodeTujuan.uraian}</span>
                    <button type="button" className="btn-secondary text-xs" onClick={() => { setKodeTujuan(null); setSel({}) }}>Ganti</button>
                  </div>
                ) : (
                  <>
                    <div className="flex gap-2">
                      <input className="select-filter flex-1" placeholder="Cari kode / uraian..." value={qKode}
                        onChange={e => setQKode(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); cariKode() } }} />
                      <button type="button" className="btn-secondary" onClick={cariKode}>Cari</button>
                    </div>
                    {kandidatKode.length > 0 && (
                      <div className="mt-2 border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-56 overflow-y-auto">
                        {kandidatKode.map(k => (
                          <button key={k.kode} type="button" onClick={() => { setKodeTujuan(k); setKandidatKode([]) }}
                            className="w-full text-left px-3 py-2 hover:bg-gray-50 text-xs">
                            <span>{k.kode}</span> — {k.uraian}
                            <span className="text-gray-400"> (MM {k.masa_manfaat_tahun} th)</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
                <p className="text-xs text-gray-400 mt-1">
                  {alasan === 'golongan'
                    ? 'Harus BEDA rumpun/golongan dari kode barang saat ini.'
                    : 'Harus SATU rumpun/golongan yang sama dengan kode barang saat ini.'}
                </p>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1">No. Dokumen Sumber</label>
                <input className="select-filter w-full" value={noSk} onChange={e => setNoSk(e.target.value)} placeholder="mis. 100.3.3.2/74/418.08/2024" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Tanggal</label>
                <input type="date" className="select-filter w-full" min={dateBounds.min} max={dateBounds.max}
                  value={tgl} onChange={e => setTgl(e.target.value)} />
                <p className="text-xs text-gray-400 mt-1">Periode: {periodeDariTanggal(tgl)}</p>
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs text-gray-500 mb-1">Keterangan</label>
                <input className="select-filter w-full" value={ket} onChange={e => setKet(e.target.value)}
                  placeholder="mis. KDP selesai dibangun, serah terima gedung" />
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="card p-5">
        <h2 className="text-base font-semibold text-gray-800 mb-4">Pilih Barang</h2>
        {butuhKodeTujuan && !kodeTujuan ? (
          <div className="py-10 text-center text-gray-400 text-sm">Pilih kode tujuan dulu di atas.</div>
        ) : (
          <>
            <div className="flex flex-wrap items-end gap-3 mb-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Kode Jenis</label>
                <select className="select-filter" value={fGolongan} onChange={e => setFGolongan(e.target.value)}>
                  <option value="">Semua Jenis Aset</option>
                  {GOLONGAN_DAFTAR_BARANG.map(g => <option key={g} value={g}>{g} — {golonganLabels[g] || '...'}</option>)}
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
                        <th className="table-th">Komptabel</th>
                        <th className="table-th text-center">Jumlah</th>
                        <th className="table-th text-right">Nilai Perolehan</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {rows.length === 0 ? (
                        <tr><td colSpan={5} className="table-td text-center py-10 text-gray-400">Tidak ada barang aktif untuk filter ini.</td></tr>
                      ) : rows.map(b => {
                        const invalid = invalidReason(b)
                        return (
                          <tr key={b.id} className={invalid ? 'opacity-40' : sel[b.id] ? 'bg-teal/5' : ''}>
                            <td className="table-td text-center">
                              <input type="checkbox" checked={!!sel[b.id]} disabled={!!invalid} onChange={() => toggle(b)} />
                            </td>
                            <td className="table-td">
                              <p className="font-medium text-gray-800 text-xs">{b.nama_barang || '-'}</p>
                              <p className="text-gray-400 text-xs mt-0.5">{b.nibar || '-'} · {b.kode} · {golonganLabels[kodeLevel3(b.kode)] || kodeLevel3(b.kode)}</p>
                              {invalid && <p className="text-red-500 text-[11px] mt-0.5">{invalid}</p>}
                            </td>
                            <td className="table-td text-xs text-gray-600">{(b.intra_ekstra || '-').toUpperCase()}</td>
                            <td className="table-td text-center text-xs">{b.jumlah} {b.satuan || ''}</td>
                            <td className="table-td text-right text-xs">{formatRupiah(b.nilai_perolehan)}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}

        {err && <p className="mt-3 text-sm text-red-600">{err}</p>}

        <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-100">
          <span className="text-sm text-gray-600">
            {selList.length} barang dipilih · <span className="font-medium">{formatRupiah(selTotal)}</span>
          </span>
          <button className="btn-primary" onClick={simpan} disabled={saving || selList.length === 0}>
            {saving ? 'Menyimpan...' : header ? 'Tambah ke Jurnal' : 'Simpan Reklasifikasi'}
          </button>
        </div>
      </div>
    </div>
  )
}
