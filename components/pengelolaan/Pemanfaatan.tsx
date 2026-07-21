'use client'
// Pemanfaatan BMD (sewa, pinjam pakai, KSP, BGS/BSG, KSPI) — pola jurnal ber-
// dokumen (jurnal_header + ledger), TANPA approval & TANPA lintas-SKPD:
//   1. Pilih SKPD (pengurus barang otomatis terkunci ke SKPD-nya).
//   2. Tambah Pemanfaatan: 1 perjanjian → jurnal_header kategori 'pemanfaatan'
//      (jenis/mitra/alamat/mulai/masa/berakhir/peruntukan/dokumen di payload).
//   3. Pilih barang (centang) + Lingkup per barang (Seluruh/Sebagian) → baris
//      ledger jenis 'pemanfaatan' ber-header_id sama.
// Sifat NETRAL: tidak mengubah nilai/penyusutan, barang tetap muncul di Daftar
// Barang & tetap disusutkan (bukan event SEMBUNYI). Kolom aset.pemanfaatan cuma
// CACHE ringkas (badge/filter) — di-set saat catat, di-null saat selesai;
// sumber kebenaran tetap ledger.
//
// BLOKIR KERAS: hanya real estate (Tanah/Gedung/Jalan-Jaringan-Irigasi) + Aset
// Lain-Lain yang boleh dipilih. Barang bergerak (Peralatan&Mesin/ATL) WAJIB
// direklas ke Aset Lain-Lain dulu (lib/pemanfaatan.PEMANFAATAN_ELIGIBLE_GOLONGAN).
//
// Akhiri: baris 'pemanfaatan_selesai' (append-only) + null cache. Header (No/Tgl
// dokumen) boleh diedit selama semester sama (guard fn_jurnal_header_guard).
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { periodeDariTanggal, kodeLevel3, GOLONGAN_REKAP } from '@/lib/bmd'
import { formatRupiah } from '@/lib/export'
import FormShell from './FormShell'
import SkpdCombobox from '@/components/SkpdCombobox'
import { useDateBounds } from '@/components/useTahunBuku'
import {
  JENIS_PEMANFAATAN, JENIS_PEMANFAATAN_LABEL, LINGKUP_OPT, type Lingkup,
  PEMANFAATAN_ELIGIBLE_GOLONGAN, isPemanfaatanEligible, hitungBerakhir, pemanfaatanCache,
} from '@/lib/pemanfaatan'

const GOL_LABEL: Record<string, string> = Object.fromEntries(GOLONGAN_REKAP.map(g => [g.kode, g.uraian]))
const golLabel = (kode: string) => GOL_LABEL[kodeLevel3(kode)] || kodeLevel3(kode)
const todayStr = () => new Date().toISOString().slice(0, 10)

type PemPayload = {
  jenis_pemanfaatan?: string; mitra?: string; alamat_mitra?: string
  mulai?: string; masa_tahun?: number; berakhir?: string; peruntukan?: string; jenis_dokumen?: string
}
type Header = {
  id: string; no_sk: string; tanggal: string; periode: string
  keterangan: string | null; payload: PemPayload | null
}
type Line = {
  aset_id: string; nibar: string | null; kode: string; nama_barang: string | null
  merek_tipe: string | null; jumlah: number; satuan: string | null
  nilai: number; lingkup: Lingkup; bagian: string | null; selesai: boolean
}
type Jurnal = Header & { lines: Line[] }

type Barang = {
  id: string; nibar: string | null; kode: string; nama_barang: string | null
  merek_tipe: string | null; jumlah: number; satuan: string | null; nilai_perolehan: number; skpd_id: number | null
}
type SelItem = { b: Barang; lingkup: Lingkup; bagian: string }

const HEADER_COLS = 'id,no_sk,tanggal,periode,keterangan,payload'

function statusBadge(h: Header): { txt: string; cls: string } {
  const berakhir = h.payload?.berakhir
  if (berakhir && todayStr() > berakhir) return { txt: 'Berakhir', cls: 'bg-amber-100 text-amber-700' }
  return { txt: 'Aktif', cls: 'bg-green-100 text-green-700' }
}

export default function Pemanfaatan() {
  const supabase = createClient()

  const [skpdList, setSkpdList] = useState<{ id: number; nama: string }[]>([])
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
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const skpdNama = skpdList.find(s => String(s.id) === skpd)?.nama || ''

  const loadJurnals = useCallback(async (skpdId: string) => {
    if (!skpdId) { setJurnals([]); return }
    setLoadingJurnal(true)

    const { data: headers } = await supabase.from('jurnal_header')
      .select(HEADER_COLS).eq('kategori', 'pemanfaatan').eq('skpd_id', Number(skpdId))
      .order('tanggal', { ascending: false })
    const hs = (headers || []) as unknown as Header[]
    const jmap = new Map<string, Jurnal>()
    for (const h of hs) jmap.set(h.id, { ...h, lines: [] })

    if (hs.length > 0) {
      const { data } = await supabase.from('transaksi_bmd')
        .select('id,header_id,jenis,nilai,payload,aset:aset_id(id,nibar,nama_barang,kode,merek_tipe,jumlah,satuan)')
        .in('jenis', ['pemanfaatan', 'pemanfaatan_selesai'] as never)
        .in('header_id', hs.map(h => h.id))
        .order('id', { ascending: true })
      const rows = (data || []) as unknown as {
        id: number; header_id: string; jenis: string; nilai: number
        payload: { lingkup?: Lingkup; bagian?: string | null } | null
        aset: Omit<Barang, 'nilai_perolehan'> | null
      }[]
      // Akumulasi kronologis per (header, aset): baris 'pemanfaatan' set
      // lingkup/bagian & selesai=false; 'pemanfaatan_selesai' → selesai=true.
      // Baris terakhir menentukan keadaan (siklus manfaat→selesai→manfaat lagi).
      const acc = new Map<string, Line>()
      for (const r of rows) {
        if (!r.aset) continue
        const key = `${r.header_id}|${r.aset.id}`
        if (r.jenis === 'pemanfaatan') {
          acc.set(key, {
            aset_id: r.aset.id, nibar: r.aset.nibar, kode: r.aset.kode, nama_barang: r.aset.nama_barang,
            merek_tipe: r.aset.merek_tipe, jumlah: r.aset.jumlah, satuan: r.aset.satuan, nilai: r.nilai,
            lingkup: (r.payload?.lingkup as Lingkup) || 'seluruh', bagian: r.payload?.bagian ?? null, selesai: false,
          })
        } else {
          const cur = acc.get(key)
          if (cur) cur.selesai = true
        }
      }
      for (const [key, line] of acc) {
        const headerId = key.split('|')[0]
        jmap.get(headerId)?.lines.push(line)
      }
    }
    setJurnals([...jmap.values()].filter(j => j.lines.length > 0))
    setLoadingJurnal(false)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadJurnals(skpd); setMode('list'); setAddTo(null); setEditing(null) }, [skpd, loadJurnals])

  // Akhiri pemanfaatan satu barang: baris pemanfaatan_selesai (hari ini) + null cache.
  async function akhiriBarang(l: Line, j: Jurnal) {
    if (l.selesai) return
    if (!confirm(`Akhiri pemanfaatan barang "${l.nama_barang || l.nibar}"? Barang tetap di SKPD & tetap disusutkan — hanya status pemanfaatannya yang ditutup.`)) return
    const tgl = todayStr()
    const { error } = await supabase.from('transaksi_bmd').insert({
      aset_id: l.aset_id, jenis: 'pemanfaatan_selesai', periode: periodeDariTanggal(tgl), tanggal: tgl,
      nilai: 0, header_id: j.id, payload: {},
    })
    if (error) { setMsg(`Error: ${error.message}`); return }
    await supabase.from('aset').update({ pemanfaatan: null }).eq('id', l.aset_id)
    setMsg('Pemanfaatan barang diakhiri.')
    loadJurnals(skpd)
  }

  return (
    <FormShell judul="Pemanfaatan" msg={msg}
      deskripsi="Pilih SKPD, buat perjanjian pemanfaatan (sewa/pinjam pakai/KSP/BGS-BSG/KSPI), lalu centang barang + lingkupnya. Hanya Tanah, Gedung, Jalan/Jaringan/Irigasi, & Aset Lain-Lain yang bisa dimanfaatkan — barang bergerak reklas ke Aset Lain-Lain dulu.">
      <div className="card p-5 mb-4">
        <div className="flex items-center gap-3">
          <label className="w-32 text-sm text-gray-600 text-right flex-shrink-0">Lokasi / SKPD :</label>
          <SkpdCombobox lockToOperator value={skpd}
            onChange={id => { setSkpd(id); setMsg('') }}
            placeholder="Ketik nama SKPD / Sub OPD / Lokasi..." />
        </div>
      </div>

      {!skpd ? (
        <div className="card p-12 text-center text-gray-400 text-sm">
          Pilih SKPD di atas untuk melihat & membuat pemanfaatan.
        </div>
      ) : mode === 'tambah' ? (
        <BarangForm skpdId={Number(skpd)} skpdNama={skpdNama} header={null}
          onCancel={() => setMode('list')}
          onSaved={(n) => { setMode('list'); setMsg(`Pemanfaatan tersimpan — ${n} barang dicatat.`); loadJurnals(skpd) }} />
      ) : addTo ? (
        <BarangForm skpdId={Number(skpd)} skpdNama={skpdNama} header={addTo}
          onCancel={() => setAddTo(null)}
          onSaved={(n) => { setAddTo(null); setMsg(`${n} barang ditambahkan ke ${addTo.no_sk}.`); loadJurnals(skpd) }} />
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">{skpdNama} — {jurnals.length} pemanfaatan</span>
            <button className="btn-primary" onClick={() => { setMsg(''); setMode('tambah') }}>+ Tambah Pemanfaatan</button>
          </div>

          {loadingJurnal ? (
            <div className="card p-12 text-center text-gray-400 text-sm">Memuat...</div>
          ) : jurnals.length === 0 ? (
            <div className="card p-12 text-center text-gray-400 text-sm">Belum ada pemanfaatan untuk SKPD ini.</div>
          ) : jurnals.map(j => {
            const p = j.payload || {}
            const badge = statusBadge(j)
            return (
              <div key={j.id} className="card overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/60">
                  <div className="flex items-start justify-between gap-4">
                    <div className="text-sm space-y-0.5">
                      <p className="font-semibold text-gray-800">
                        {JENIS_PEMANFAATAN_LABEL[p.jenis_pemanfaatan || ''] || 'Pemanfaatan'}
                        <span className={`ml-2 inline-block px-2 py-0.5 rounded-full text-xs font-medium ${badge.cls}`}>{badge.txt}</span>
                      </p>
                      <p className="text-xs text-gray-600">Mitra: {p.mitra || '-'}{p.alamat_mitra ? ` · ${p.alamat_mitra}` : ''}</p>
                      <p className="text-xs text-gray-500">
                        {p.mulai || '-'} s.d. {p.berakhir || '-'} ({p.masa_tahun || '-'} th)
                        {' · '}No. Dok: {j.no_sk} · Tgl. {j.tanggal} · {j.periode}
                      </p>
                      {p.peruntukan && <p className="text-xs text-gray-500">Peruntukan: {p.peruntukan}</p>}
                      {p.jenis_dokumen && <p className="text-xs text-gray-500">Jenis Dokumen: {p.jenis_dokumen}</p>}
                      {j.keterangan && <p className="text-xs text-gray-500">Keterangan: {j.keterangan}</p>}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button title="Edit header (No/Tgl dokumen & detail — semester sama)"
                        onClick={() => { setMsg(''); setEditing(j) }}
                        className="inline-flex items-center justify-center w-8 h-8 rounded bg-gray-100 hover:bg-gray-200 text-gray-700">✎</button>
                      <button title="Tambah barang ke pemanfaatan ini"
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
                        <th className="table-th">Lingkup</th>
                        <th className="table-th text-center">Jumlah</th>
                        <th className="table-th text-right">Nilai Perolehan</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {j.lines.map(l => (
                        <tr key={l.aset_id} className={l.selesai ? 'opacity-50' : ''}>
                          <td className="table-td text-center">
                            {l.selesai ? (
                              <span className="text-gray-300 text-xs" title="Sudah diakhiri">—</span>
                            ) : (
                              <button onClick={() => akhiriBarang(l, j)} title="Akhiri pemanfaatan barang ini"
                                className="inline-flex items-center justify-center w-7 h-7 rounded bg-amber-500 hover:bg-amber-600 text-white">⏹</button>
                            )}
                          </td>
                          <td className="table-td">
                            <p className="font-medium text-gray-800 text-xs">{l.nama_barang || '-'}{l.selesai && <span className="ml-2 text-[10px] text-gray-400">(selesai)</span>}</p>
                            <p className="text-gray-400 text-xs mt-0.5">{l.nibar || '-'} · {l.kode} · {golLabel(l.kode)}</p>
                          </td>
                          <td className="table-td text-xs text-gray-600">
                            {l.lingkup === 'sebagian' ? `Sebagian${l.bagian ? ` — ${l.bagian}` : ''}` : 'Seluruhnya'}
                          </td>
                          <td className="table-td text-center text-xs">{l.jumlah} {l.satuan || ''}</td>
                          <td className="table-td text-right text-xs">{formatRupiah(l.nilai)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {editing && (
        <EditHeaderModal header={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); setMsg('Header pemanfaatan diperbarui.'); loadJurnals(skpd) }} />
      )}
    </FormShell>
  )
}

// ── Edit header: No/Tgl dokumen (kunci semester) + detail perjanjian ─────────
function EditHeaderModal({ header, onClose, onSaved }: { header: Header; onClose: () => void; onSaved: () => void }) {
  const supabase = createClient()
  const dateBounds = useDateBounds()
  const p = header.payload || {}
  const [noSk, setNoSk] = useState(header.no_sk)
  const [tgl, setTgl] = useState(header.tanggal)
  const [jenis, setJenis] = useState(p.jenis_pemanfaatan || 'sewa')
  const [mitra, setMitra] = useState(p.mitra || '')
  const [alamat, setAlamat] = useState(p.alamat_mitra || '')
  const [mulai, setMulai] = useState(p.mulai || '')
  const [masa, setMasa] = useState(String(p.masa_tahun ?? ''))
  const [peruntukan, setPeruntukan] = useState(p.peruntukan || '')
  const [jenisDok, setJenisDok] = useState(p.jenis_dokumen || '')
  const [ket, setKet] = useState(header.keterangan || '')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const masaNum = Number(masa)
  const berakhir = hitungBerakhir(mulai, masaNum)
  const tglPeriode = periodeDariTanggal(tgl)
  const pindahSemester = tglPeriode !== header.periode

  async function simpan() {
    if (!noSk.trim()) { setErr('No. dokumen wajib diisi.'); return }
    if (!mitra.trim()) { setErr('Mitra pemanfaatan wajib diisi.'); return }
    if (!mulai) { setErr('Tanggal mulai pemanfaatan wajib diisi.'); return }
    if (!Number.isFinite(masaNum) || masaNum <= 0) { setErr('Masa pemanfaatan (tahun) harus > 0.'); return }
    if (pindahSemester) {
      setErr(`Tanggal masuk ${tglPeriode}, sedangkan jurnal ini di ${header.periode}. Pindah semester tidak diizinkan — batalkan & buat pemanfaatan baru.`)
      return
    }
    setErr(''); setSaving(true)
    const payload: PemPayload = {
      jenis_pemanfaatan: jenis, mitra: mitra.trim(), alamat_mitra: alamat.trim() || undefined,
      mulai, masa_tahun: masaNum, berakhir, peruntukan: peruntukan.trim() || undefined, jenis_dokumen: jenisDok.trim() || undefined,
    }
    const { error } = await supabase.from('jurnal_header')
      .update({ no_sk: noSk.trim(), tanggal: tgl, keterangan: ket.trim() || null, payload }).eq('id', header.id)
    if (error) { setErr(`Gagal menyimpan: ${error.message}`); setSaving(false); return }
    // Segarkan cache aset.pemanfaatan utk barang yang MASIH aktif di header ini.
    const { data: aktif } = await supabase.from('transaksi_bmd')
      .select('aset_id,jenis,id').eq('header_id', header.id)
      .in('jenis', ['pemanfaatan', 'pemanfaatan_selesai'] as never).order('id', { ascending: true })
    const state = new Map<string, boolean>() // aset_id → aktif?
    for (const r of (aktif || []) as { aset_id: string; jenis: string }[]) state.set(r.aset_id, r.jenis === 'pemanfaatan')
    const aktifIds = [...state.entries()].filter(([, on]) => on).map(([id]) => id)
    if (aktifIds.length) {
      await supabase.from('aset').update({ pemanfaatan: pemanfaatanCache(jenis, mitra.trim(), berakhir) }).in('id', aktifIds)
    }
    setSaving(false); onSaved()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="card w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white">
          <h3 className="font-semibold text-gray-800">Edit Header Pemanfaatan</h3>
          <button className="text-gray-400 hover:text-gray-700 text-xl leading-none" onClick={onClose}>×</button>
        </div>
        <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Jenis Pemanfaatan</label>
            <select className="select-filter w-full" value={jenis} onChange={e => setJenis(e.target.value)}>
              {JENIS_PEMANFAATAN.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">No. Dokumen <span className="text-gray-400">(tetap di {header.periode})</span></label>
            <input className="select-filter w-full" value={noSk} onChange={e => setNoSk(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Mitra Pemanfaatan</label>
            <input className="select-filter w-full" value={mitra} onChange={e => setMitra(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Alamat Mitra</label>
            <input className="select-filter w-full" value={alamat} onChange={e => setAlamat(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Mulai Pemanfaatan</label>
            <input type="date" className="select-filter w-full" value={mulai} onChange={e => setMulai(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Masa (tahun)</label>
            <input type="number" min={1} className="select-filter w-full" value={masa} onChange={e => setMasa(e.target.value)} />
            <p className="text-xs text-gray-400 mt-1">Berakhir: {berakhir || '—'}</p>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Tanggal Dokumen</label>
            <input type="date" className="select-filter w-full" max={dateBounds.max} value={tgl} onChange={e => setTgl(e.target.value)} />
            {pindahSemester && <p className="text-xs text-red-600 mt-1">Tanggal ini masuk {tglPeriode} — di luar semester jurnal.</p>}
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Jenis Dokumen</label>
            <input className="select-filter w-full" value={jenisDok} onChange={e => setJenisDok(e.target.value)} placeholder="mis. Perjanjian Sewa" />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs text-gray-500 mb-1">Peruntukan Pemanfaatan</label>
            <input className="select-filter w-full" value={peruntukan} onChange={e => setPeruntukan(e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs text-gray-500 mb-1">Keterangan</label>
            <input className="select-filter w-full" value={ket} onChange={e => setKet(e.target.value)} />
          </div>
          {err && <p className="sm:col-span-2 text-sm text-red-600">{err}</p>}
        </div>
        <div className="px-5 py-4 border-t border-gray-100 flex justify-end gap-2 sticky bottom-0 bg-white">
          <button className="btn-secondary" onClick={onClose}>Batal</button>
          <button className="btn-primary" onClick={simpan} disabled={saving || pindahSemester}>{saving ? 'Menyimpan...' : 'Simpan'}</button>
        </div>
      </div>
    </div>
  )
}

// ── Form: (header baru) + pemilihan barang + lingkup ─────────────────────────
function BarangForm({ skpdId, skpdNama, header, onCancel, onSaved }: {
  skpdId: number; skpdNama: string; header: Header | null; onCancel: () => void; onSaved: (n: number) => void
}) {
  const supabase = createClient()
  const dateBounds = useDateBounds()

  const [jenis, setJenis] = useState('sewa')
  const [mitra, setMitra] = useState('')
  const [alamat, setAlamat] = useState('')
  const [mulai, setMulai] = useState(todayStr())
  const [masa, setMasa] = useState('1')
  const [peruntukan, setPeruntukan] = useState('')
  const [jenisDok, setJenisDok] = useState('')
  const [noSk, setNoSk] = useState('')
  const [tglDok, setTglDok] = useState(todayStr())
  const [ket, setKet] = useState('')

  const [fGolongan, setFGolongan] = useState('')
  const [fSearch, setFSearch] = useState('')
  const [rows, setRows] = useState<Barang[]>([])
  const [loaded, setLoaded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [sel, setSel] = useState<Record<string, SelItem>>({})
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const masaNum = Number(masa)
  const berakhir = hitungBerakhir(mulai, masaNum)

  async function tampilkan() {
    setLoading(true)
    let q = supabase.from('aset')
      .select('id,nibar,kode,nama_barang,merek_tipe,jumlah,satuan,nilai_perolehan,skpd_id')
      .eq('status', 'aktif').eq('skpd_id', skpdId).is('pemanfaatan', null)
    if (fGolongan) q = q.like('kode', `${fGolongan}.%`)
    else q = q.or(PEMANFAATAN_ELIGIBLE_GOLONGAN.map(g => `kode.like.${g}.%`).join(','))
    if (fSearch) q = q.or(`nama_barang.ilike.%${fSearch}%,nibar.ilike.%${fSearch}%,kode.ilike.${fSearch}%`)
    const { data } = await q.order('nilai_perolehan', { ascending: false }).limit(500)
    // Belt & suspenders: buang yang tak eligible (mis. kalau filter lolos).
    setRows(((data as unknown as Barang[]) || []).filter(b => isPemanfaatanEligible(b.kode)))
    setLoaded(true)
    setLoading(false)
  }

  function toggle(b: Barang) {
    setSel(prev => {
      const next = { ...prev }
      if (next[b.id]) delete next[b.id]; else next[b.id] = { b, lingkup: 'seluruh', bagian: '' }
      return next
    })
  }
  function setLingkup(id: string, lingkup: Lingkup) {
    setSel(prev => prev[id] ? { ...prev, [id]: { ...prev[id], lingkup } } : prev)
  }
  function setBagian(id: string, bagian: string) {
    setSel(prev => prev[id] ? { ...prev, [id]: { ...prev[id], bagian } } : prev)
  }

  const selList = Object.values(sel)

  async function simpan() {
    if (!header) {
      if (!noSk.trim()) { setErr('No. dokumen wajib diisi.'); return }
      if (!mitra.trim()) { setErr('Mitra pemanfaatan wajib diisi.'); return }
      if (!mulai) { setErr('Tanggal mulai pemanfaatan wajib diisi.'); return }
      if (!Number.isFinite(masaNum) || masaNum <= 0) { setErr('Masa pemanfaatan (tahun) harus > 0.'); return }
    }
    if (selList.length === 0) { setErr('Centang minimal satu barang.'); return }
    setErr(''); setSaving(true)

    let h = header
    const headerBaru = !header
    if (!h) {
      const payload: PemPayload = {
        jenis_pemanfaatan: jenis, mitra: mitra.trim(), alamat_mitra: alamat.trim() || undefined,
        mulai, masa_tahun: masaNum, berakhir, peruntukan: peruntukan.trim() || undefined, jenis_dokumen: jenisDok.trim() || undefined,
      }
      const { data, error } = await supabase.from('jurnal_header').insert({
        skpd_id: skpdId, kategori: 'pemanfaatan', jenis: 'pemanfaatan',
        no_sk: noSk.trim(), tanggal: tglDok, keterangan: ket.trim() || null, payload,
      }).select(HEADER_COLS).single()
      if (error || !data) { setErr(`Gagal membuat header pemanfaatan: ${error?.message}`); setSaving(false); return }
      h = data as unknown as Header
    }

    const trxRows = selList.map(s => ({
      aset_id: s.b.id, jenis: 'pemanfaatan', periode: h!.periode, tanggal: h!.tanggal, nilai: 0,
      skpd_asal: s.b.skpd_id, header_id: h!.id,
      payload: { lingkup: s.lingkup, bagian: s.lingkup === 'sebagian' ? (s.bagian.trim() || null) : null },
    }))
    const { error: e1 } = await supabase.from('transaksi_bmd').insert(trxRows)
    if (e1) {
      if (headerBaru) await supabase.from('jurnal_header').delete().eq('id', h.id)
      setErr(`Gagal mencatat transaksi: ${e1.message}`); setSaving(false); return
    }
    // Cache badge di aset.
    const hp = h.payload || {}
    const cache = pemanfaatanCache(hp.jenis_pemanfaatan || jenis, hp.mitra || mitra.trim(), hp.berakhir || berakhir)
    await supabase.from('aset').update({ pemanfaatan: cache }).in('id', selList.map(s => s.b.id))

    setSaving(false)
    onSaved(selList.length)
  }

  const p = header?.payload || {}

  return (
    <div className="space-y-4">
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-800">
            {header ? `Tambah Barang — ${header.no_sk}` : `Pemanfaatan Baru — ${skpdNama}`}
          </h2>
          <button className="btn-secondary text-xs" onClick={onCancel}>← Kembali</button>
        </div>

        {header ? (
          <p className="text-sm text-gray-500">
            {JENIS_PEMANFAATAN_LABEL[p.jenis_pemanfaatan || ''] || 'Pemanfaatan'} · Mitra: {p.mitra || '-'}
            {' · '}{p.mulai || '-'} s.d. {p.berakhir || '-'} · Tgl. {header.tanggal} · {header.periode}
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Jenis Pemanfaatan</label>
              <select className="select-filter w-full" value={jenis} onChange={e => setJenis(e.target.value)}>
                {JENIS_PEMANFAATAN.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Mitra Pemanfaatan</label>
              <input className="select-filter w-full" value={mitra} onChange={e => setMitra(e.target.value)} placeholder="mis. PT Bank Jatim" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Alamat Mitra</label>
              <input className="select-filter w-full" value={alamat} onChange={e => setAlamat(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Peruntukan Pemanfaatan</label>
              <input className="select-filter w-full" value={peruntukan} onChange={e => setPeruntukan(e.target.value)} placeholder="mis. Kantor kas / ATM" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Mulai Pemanfaatan</label>
              <input type="date" className="select-filter w-full" value={mulai} onChange={e => setMulai(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Masa Pemanfaatan (tahun)</label>
              <input type="number" min={1} className="select-filter w-full" value={masa} onChange={e => setMasa(e.target.value)} />
              <p className="text-xs text-gray-400 mt-1">Berakhir otomatis: {berakhir || '—'}</p>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Jenis Dokumen</label>
              <input className="select-filter w-full" value={jenisDok} onChange={e => setJenisDok(e.target.value)} placeholder="mis. Perjanjian Sewa" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">No. Dokumen</label>
              <input className="select-filter w-full" value={noSk} onChange={e => setNoSk(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Tanggal Dokumen</label>
              <input type="date" className="select-filter w-full" min={dateBounds.min} max={dateBounds.max}
                value={tglDok} onChange={e => setTglDok(e.target.value)} />
              <p className="text-xs text-gray-400 mt-1">Periode: {periodeDariTanggal(tglDok)}</p>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs text-gray-500 mb-1">Keterangan</label>
              <input className="select-filter w-full" value={ket} onChange={e => setKet(e.target.value)} />
            </div>
          </div>
        )}
      </div>

      <div className="card p-5">
        <h2 className="text-base font-semibold text-gray-800 mb-1">Pilih Barang</h2>
        <p className="text-xs text-gray-400 mb-4">Hanya Tanah, Gedung & Bangunan, Jalan/Jaringan/Irigasi, dan Aset Lain-Lain yang muncul. Barang bergerak harus direklas ke Aset Lain-Lain dulu.</p>
        <div className="flex flex-wrap items-end gap-3 mb-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Jenis Aset</label>
            <select className="select-filter" value={fGolongan} onChange={e => setFGolongan(e.target.value)}>
              <option value="">Semua (yang boleh)</option>
              {PEMANFAATAN_ELIGIBLE_GOLONGAN.map(g => <option key={g} value={g}>{g} — {GOL_LABEL[g] || g}</option>)}
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
                    <th className="table-th w-10 text-center">Pilih</th>
                    <th className="table-th">Barang</th>
                    <th className="table-th w-64">Lingkup Pemanfaatan</th>
                    <th className="table-th text-right">Nilai Perolehan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {rows.length === 0 ? (
                    <tr><td colSpan={4} className="table-td text-center py-10 text-gray-400">Tidak ada barang eligible untuk filter ini.</td></tr>
                  ) : rows.map(b => {
                    const s = sel[b.id]
                    return (
                      <tr key={b.id} className={s ? 'bg-teal/5' : ''}>
                        <td className="table-td text-center">
                          <input type="checkbox" checked={!!s} onChange={() => toggle(b)} />
                        </td>
                        <td className="table-td">
                          <p className="font-medium text-gray-800 text-xs">{b.nama_barang || '-'}</p>
                          <p className="text-gray-400 text-xs mt-0.5">{b.nibar || '-'} · {b.kode} · {golLabel(b.kode)}</p>
                        </td>
                        <td className="table-td">
                          {s ? (
                            <div className="space-y-1">
                              <select className="select-filter w-full text-xs" value={s.lingkup} onChange={e => setLingkup(b.id, e.target.value as Lingkup)}>
                                {LINGKUP_OPT.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                              </select>
                              {s.lingkup === 'sebagian' && (
                                <input className="select-filter w-full text-xs" placeholder="Bagian yg dimanfaatkan (mis. 1 ruang 12 m²)"
                                  value={s.bagian} onChange={e => setBagian(b.id, e.target.value)} />
                              )}
                            </div>
                          ) : <span className="text-gray-300 text-xs">—</span>}
                        </td>
                        <td className="table-td text-right text-xs">{formatRupiah(b.nilai_perolehan)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {err && <p className="mt-3 text-sm text-red-600">{err}</p>}

        <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-100">
          <span className="text-sm text-gray-600">{selList.length} barang dipilih</span>
          <button className="btn-primary" onClick={simpan} disabled={saving || selList.length === 0}>
            {saving ? 'Menyimpan...' : header ? 'Tambah ke Pemanfaatan' : 'Simpan Pemanfaatan'}
          </button>
        </div>
      </div>
    </div>
  )
}
