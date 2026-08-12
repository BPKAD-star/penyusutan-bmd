'use client'
// No.6/7: Pengeluaran Internal — mutasi BMD antar sub-unit DALAM satu SKPD
// induk (tree) yang sama, alur draft + approval (sama seperti Pengalihan
// Status Penggunaan, migrasi 20260704_21/22/24 — lihat Penghapusan.tsx untuk
// pola aslinya). Beda dari pengalihan_status: SKPD tujuan boleh level mana pun
// (bukan cuma SKPD induk), tapi WAJIB dalam satu tree yang sama (lihat migrasi
// 20260707_03).
//   1. Pilih SKPD (asal).
//   2. Tambah jurnal: No. Dokumen, tanggal, SKPD tujuan (dibatasi tree sama),
//      keterangan, dokumen sumber (foto/PDF) → jurnal_header, approval_status
//      'pending'. Barang ditampung sbg draft (payload.draft_items) — ledger &
//      aset TIDAK disentuh sampai SKPD tujuan menyetujui lewat menu Penerimaan
//      Internal (RPC fn_terima_mutasi_internal).
//   3. Selama pending: barang bebas ditambah/dihapus, header bebas diedit
//      (semester sama), jurnal bisa dihapus utuh (belum ada jejak ledger).
//   4. SATU PINTU: setelah disetujui, kartu di sisi PENGIRIM read-only.
//      Pengembalian hanya lewat SKPD penerima (menu Penerimaan Internal).
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { periodeDariTanggal, GOLONGAN_DAFTAR_BARANG, kodeLevel3 } from '@/lib/bmd'
import { formatRupiah } from '@/lib/export'
import { fetchBatalTargets, BATAL_TARGET_JENIS } from '@/lib/voidedAset'
import FormShell from './FormShell'
import SkpdCombobox from '@/components/SkpdCombobox'
import { useDateBounds } from '@/components/useTahunBuku'
import { backdropClose } from '@/components/backdropClose'

type Barang = {
  id: string; nibar: string | null; kode: string; nama_barang: string | null
  merek_tipe: string | null; jumlah: number; satuan: string | null; nilai_perolehan: number; skpd_id: number | null
}
type DraftItem = {
  aset_id: string; nibar: string | null; kode: string; nama_barang: string | null
  merek_tipe: string | null; jumlah: number; satuan: string | null; nilai: number
}
type HeaderPayload = { dokumen_paths?: string[]; draft_items?: DraftItem[] }
type Header = {
  id: string; no_sk: string; tanggal: string; periode: string; keterangan: string | null
  skpd_tujuan: number | null; approval_status: string | null; rejected_reason: string | null
  payload: HeaderPayload | null
}
type JurnalLine = DraftItem
type Jurnal = Header & { lines: JurnalLine[]; total: number }

const HEADER_COLS = 'id,no_sk,tanggal,periode,keterangan,skpd_tujuan,approval_status,rejected_reason,payload'
const namaFile = (path: string) => path.split('/').pop() || path

export default function PengeluaranInternal() {
  const supabase = createClient()

  const [skpdList, setSkpdList] = useState<{ id: number; nama: string }[]>([])
  const [golonganLabels, setGolonganLabels] = useState<Record<string, string>>({})
  const [skpd, setSkpd] = useState('')

  const [jurnals, setJurnals] = useState<Jurnal[]>([])
  const [loadingJurnal, setLoadingJurnal] = useState(false)
  const [errLoad, setErrLoad] = useState('')

  const [mode, setMode] = useState<'list' | 'tambah'>('list')
  const [addTo, setAddTo] = useState<Header | null>(null)
  const [editing, setEditing] = useState<Header | null>(null)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    (async () => {
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

  // ⚠️ Badan fungsi di dalam try, `setLoadingJurnal(false)` di FINALLY:
  // `fetchBatalTargets` MELEMPAR (fail-closed). Tanpa ini halaman membeku di
  // "Memuat..." tanpa keterangan — cacat yang sudah didokumentasikan di
  // CLAUDE.md untuk Daftar Barang.
  const loadJurnals = useCallback(async (skpdId: string) => {
    if (!skpdId) { setJurnals([]); setErrLoad(''); return }
    setLoadingJurnal(true); setErrLoad('')
    try {
    const { data: headers, error: errH } = await supabase.from('jurnal_header')
      .select(HEADER_COLS)
      .eq('kategori', 'mutasi_internal').eq('skpd_id', Number(skpdId))
      .order('tanggal', { ascending: false })
    if (errH) throw new Error(errH.message)
    const hs = (headers || []) as unknown as Header[]

    const jmap = new Map<string, Jurnal>()
    for (const h of hs) jmap.set(h.id, { ...h, lines: [], total: 0 })

    for (const j of jmap.values()) {
      if (j.approval_status !== 'disetujui') {
        for (const d of j.payload?.draft_items || []) { j.lines.push({ ...d }); j.total += d.nilai }
      }
    }

    const approvedIds = hs.filter(h => h.approval_status === 'disetujui').map(h => h.id)
    if (approvedIds.length > 0) {
      const { data, error: errT } = await supabase.from('transaksi_bmd')
        .select('id,header_id,nilai,payload,aset:aset_id(id,nibar,nama_barang,kode,merek_tipe,jumlah,satuan)')
        .eq('jenis', 'mutasi_internal')
        .in('header_id', approvedIds)
        .order('id', { ascending: false })
      if (errT) throw new Error(errT.message)
      const rows = (data || []) as unknown as {
        id: number; header_id: string; nilai: number
        aset: { id: string; nibar: string | null; nama_barang: string | null; kode: string; merek_tipe: string | null; jumlah: number; satuan: string | null } | null
      }[]
      // Barang yang mutasinya DIBATALKAN keluar dari kartu — juga di sisi
      // PENGIRIM. rules.md §1.7 titik 3 menyebut sisi ini yang paling sering
      // lolos: ledgernya sudah benar tapi barangnya masih nongol di kartu.
      const dibatalkan = await fetchBatalTargets(
        supabase, BATAL_TARGET_JENIS.pengalihan,
        rows.map(r => r.aset?.id).filter((x): x is string => !!x),
      )
      const seen = new Set<string>()
      for (const r of rows) {
        if (!r.aset) continue
        const key = `${r.header_id}|${r.aset.id}`
        if (seen.has(key)) continue
        seen.add(key)
        if (dibatalkan.has(r.id)) continue
        const j = jmap.get(r.header_id)
        if (!j) continue
        j.lines.push({
          aset_id: r.aset.id, nibar: r.aset.nibar, kode: r.aset.kode, nama_barang: r.aset.nama_barang,
          merek_tipe: r.aset.merek_tipe, jumlah: r.aset.jumlah, satuan: r.aset.satuan, nilai: r.nilai,
        })
        j.total += r.nilai
      }
    }
    setJurnals([...jmap.values()].filter(j => j.lines.length > 0))
    } catch (e) {
      setJurnals([])
      setErrLoad(`Gagal memuat jurnal mutasi internal: ${e instanceof Error ? e.message : String(e)}. Daftar tidak ditampilkan supaya tak terbaca sebagai "belum ada jurnal".`)
    } finally {
      setLoadingJurnal(false)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadJurnals(skpd); setMode('list'); setAddTo(null); setEditing(null) }, [skpd, loadJurnals])

  async function hapusBarang(l: JurnalLine, j: Jurnal) {
    if (j.approval_status !== 'pending') return // SATU PINTU: disetujui = read-only di sisi pengirim
    const sisa = (j.payload?.draft_items || []).filter(d => d.aset_id !== l.aset_id)
    if (sisa.length === 0) {
      if (!confirm('Ini barang terakhir di jurnal — jurnal akan dihapus seluruhnya. Lanjutkan?')) return
      const { error } = await supabase.from('jurnal_header').delete().eq('id', j.id)
      if (error) { setMsg(`Error: ${error.message}`); return }
      setMsg('Jurnal mutasi internal dihapus.')
    } else {
      if (!confirm('Keluarkan barang ini dari draft?')) return
      const { error } = await supabase.from('jurnal_header')
        .update({ payload: { ...(j.payload || {}), draft_items: sisa } }).eq('id', j.id)
      if (error) { setMsg(`Error: ${error.message}`); return }
      setMsg('Barang dikeluarkan dari draft.')
    }
    loadJurnals(skpd)
  }

  async function hapusJurnal(j: Jurnal) {
    if (!confirm(`Hapus jurnal "${j.no_sk}" seluruhnya (${j.lines.length} barang)? Barang tetap utuh di SKPD ini.`)) return
    const { error } = await supabase.from('jurnal_header').delete().eq('id', j.id)
    if (error) { setMsg(`Error: ${error.message}`); return }
    setMsg('Jurnal mutasi internal dihapus.')
    loadJurnals(skpd)
  }

  async function bukaDokumen(path: string) {
    const { data } = await supabase.storage.from('dokumen-sumber').createSignedUrl(path, 3600)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
  }

  const skpdNama = skpdList.find(s => String(s.id) === skpd)?.nama
  const namaSkpdById = (id: number | null) => skpdList.find(s => s.id === id)?.nama || '-'

  return (
    <FormShell judul="Pengeluaran Internal" msg={msg}
      deskripsi="Pindahkan BMD ke sub-unit lain dalam SKPD induk yang sama (naik ke induk, turun ke sub-OPD, atau antar sub-OPD). Menunggu persetujuan SKPD tujuan di menu Penerimaan Internal.">
      <div className="card p-5 mb-4">
        <div className="flex items-center gap-3">
          <label className="w-32 text-sm text-gray-600 text-right flex-shrink-0">Lokasi / SKPD :</label>
          <SkpdCombobox lockToOperator value={skpd} onChange={id => { setSkpd(id); setMsg('') }}
            placeholder="Ketik nama SKPD / Sub OPD / Lokasi..." />
        </div>
      </div>

      {!skpd ? (
        <div className="card p-12 text-center text-gray-400 text-sm">
          Pilih SKPD di atas untuk melihat & membuat jurnal mutasi internal.
        </div>
      ) : mode === 'tambah' ? (
        <BarangForm
          skpdId={Number(skpd)} skpdNama={skpdNama || ''} golonganLabels={golonganLabels} header={null}
          onCancel={() => setMode('list')}
          onSaved={(n) => { setMode('list'); setMsg(`Jurnal tersimpan — ${n} barang menunggu persetujuan SKPD tujuan.`); loadJurnals(skpd) }}
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
            <span className="text-sm text-gray-500">{skpdNama} — {jurnals.length} jurnal</span>
            <button className="btn-primary" onClick={() => { setMsg(''); setMode('tambah') }}>+ Tambah Jurnal</button>
          </div>

          {loadingJurnal ? (
            <div className="card p-12 text-center text-gray-400 text-sm">Memuat jurnal...</div>
          ) : jurnals.length === 0 ? (
            <div className="card p-12 text-center text-gray-400 text-sm">Belum ada mutasi internal untuk SKPD ini.</div>
          ) : jurnals.map(j => {
            const pending = j.approval_status === 'pending'
            const ditolak = j.approval_status === 'ditolak'
            const disetujui = j.approval_status === 'disetujui'
            return (
              <div key={j.id} className="card overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/60">
                  <div className="flex items-start justify-between gap-4">
                    <div className="text-sm space-y-0.5">
                      <p className="font-semibold text-gray-800">
                        No. Dokumen: {j.no_sk}
                        <span className={`ml-2 inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                          pending ? 'bg-amber-100 text-amber-700'
                          : ditolak ? 'bg-red-100 text-red-700'
                          : 'bg-green-100 text-green-700'
                        }`}>
                          {pending ? 'Menunggu Persetujuan' : ditolak ? 'Ditolak' : 'Disetujui'}
                        </span>
                      </p>
                      <p className="text-xs text-gray-500">
                        Tujuan: <span className="font-medium">{namaSkpdById(j.skpd_tujuan)}</span>
                        {' · '}Tgl. {j.tanggal} · {j.periode}
                      </p>
                      {j.keterangan && <p className="text-xs text-gray-500">Keterangan: {j.keterangan}</p>}
                      {ditolak && j.rejected_reason && (
                        <p className="text-xs text-red-600">Alasan penolakan: {j.rejected_reason}</p>
                      )}
                      {(j.payload?.dokumen_paths?.length || 0) > 0 && (
                        <p className="text-xs text-gray-500">
                          Dokumen:{' '}
                          {j.payload!.dokumen_paths!.map(p => (
                            <button key={p} onClick={() => bukaDokumen(p)}
                              className="underline text-teal hover:opacity-80 mr-2">{namaFile(p)}</button>
                          ))}
                        </p>
                      )}
                      {disetujui && (
                        <p className="text-xs text-gray-400 italic">Sudah diterima SKPD tujuan — read-only. Pengembalian dilakukan SKPD tujuan lewat menu Penerimaan Internal.</p>
                      )}
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <div className="text-right">
                        <p className="text-xs text-gray-400">Total Nilai</p>
                        <p className="font-semibold text-gray-800">{formatRupiah(j.total)}</p>
                      </div>
                      {pending && (
                        <button title="Edit No dokumen / tanggal (dalam semester yang sama)"
                          onClick={() => { setMsg(''); setEditing(j) }}
                          className="inline-flex items-center justify-center w-8 h-8 rounded bg-gray-100 hover:bg-gray-200 text-gray-700">✎</button>
                      )}
                      {pending && (
                        <button title="Tambah barang ke jurnal ini"
                          onClick={() => { setMsg(''); setAddTo(j) }}
                          className="inline-flex items-center justify-center w-8 h-8 rounded bg-teal hover:opacity-90 text-white">+</button>
                      )}
                      {(pending || ditolak) && (
                        <button title="Hapus jurnal ini seluruhnya (belum ada jejak ledger)"
                          onClick={() => hapusJurnal(j)}
                          className="inline-flex items-center justify-center w-8 h-8 rounded bg-red-500 hover:bg-red-600 text-white">🗑</button>
                      )}
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
                            {pending ? (
                              <button onClick={() => hapusBarang(l, j)} title="Keluarkan barang dari draft"
                                className="inline-flex items-center justify-center w-7 h-7 rounded bg-red-500 hover:bg-red-600 text-white">🗑</button>
                            ) : <span className="text-gray-300 text-xs">—</span>}
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
            )
          })}
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

// ── Modal edit header: No Dokumen + tanggal (kunci semester sama) + keterangan
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
    if (!noSk.trim()) { setErr('No. Dokumen wajib diisi.'); return }
    if (pindahSemester) {
      setErr(`Tanggal masuk ${tglPeriode}, sedangkan jurnal ini di ${header.periode}. Pindah semester tidak diizinkan — hapus jurnal & entry ulang.`)
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" {...backdropClose(onClose)}>
      <div className="card w-full max-w-lg" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-semibold text-gray-800">Edit Header Jurnal</h3>
          <button className="text-gray-400 hover:text-gray-700 text-xl leading-none" onClick={onClose}>×</button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">No. Dokumen</label>
            <input className="select-filter w-full" value={noSk} onChange={e => setNoSk(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Tanggal <span className="text-gray-400">(harus tetap di {header.periode})</span></label>
            <input type="date" className="select-filter w-full" max={dateBounds.max} value={tgl} onChange={e => setTgl(e.target.value)} />
            {pindahSemester && (
              <p className="text-xs text-red-600 mt-1">Tanggal ini masuk {tglPeriode} — di luar semester jurnal. Ganti tanggal, atau hapus jurnal ini seluruhnya lalu entry ulang.</p>
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

// ── Sub-view: (opsional header baru) + pemilihan barang (centang) ──────────
function BarangForm({ skpdId, skpdNama, golonganLabels, header, onCancel, onSaved }: {
  skpdId: number; skpdNama: string; golonganLabels: Record<string, string>
  header: Header | null; onCancel: () => void; onSaved: (n: number) => void
}) {
  const supabase = createClient()
  const dateBounds = useDateBounds()

  const [noSk, setNoSk] = useState('')
  const [tgl, setTgl] = useState(new Date().toISOString().slice(0, 10))
  const [ket, setKet] = useState('')
  const [tujuanList, setTujuanList] = useState<{ id: number; nama: string; level: number }[]>([])
  const [tujuan, setTujuan] = useState('')
  const [dokPaths, setDokPaths] = useState<string[]>([])
  const [dokUploading, setDokUploading] = useState(false)

  const [fGolongan, setFGolongan] = useState('')
  const [fKomptabel, setFKomptabel] = useState('')
  const [fSearch, setFSearch] = useState('')

  const [rows, setRows] = useState<Barang[]>([])
  const [loaded, setLoaded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [sel, setSel] = useState<Record<string, Barang>>({})
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  // Daftar tujuan = SKPD induk (root) + semua anak + semua cucu dari root yg
  // sama dgn skpdId — HANYA relevan saat bikin jurnal baru (header===null);
  // jurnal existing sudah punya skpd_tujuan tetap (dikunci trigger DB).
  useEffect(() => {
    if (header) return
    (async () => {
      type SkpdRow = { id: number; nama: string; level: number; parent_id: number | null }
      let node: SkpdRow | null = null
      const { data: n0 } = await supabase.from('admin_skpd').select('id,nama,level,parent_id').eq('id', skpdId).single()
      node = n0 as SkpdRow | null
      while (node && node.level > 1 && node.parent_id) {
        const { data: parent } = await supabase.from('admin_skpd').select('id,nama,level,parent_id').eq('id', node.parent_id).single()
        if (!parent) break
        node = parent as SkpdRow
      }
      if (!node) return
      const { data: anak } = await supabase.from('admin_skpd').select('id,nama,level,parent_id').eq('parent_id', node.id)
      const anakIds = (anak || []).map(a => a.id)
      const { data: cucu } = anakIds.length
        ? await supabase.from('admin_skpd').select('id,nama,level,parent_id').in('parent_id', anakIds)
        : { data: [] }
      setTujuanList([node, ...((anak || []) as SkpdRow[]), ...((cucu || []) as SkpdRow[])].filter(s => s.id !== skpdId))
    })()
  }, [skpdId, header]) // eslint-disable-line react-hooks/exhaustive-deps

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

  async function uploadDokumen(files: FileList | null) {
    if (!files || files.length === 0) return
    setDokUploading(true)
    for (const file of Array.from(files)) {
      const path = `mutasi-internal/${crypto.randomUUID()}/${file.name}`
      const { error } = await supabase.storage.from('dokumen-sumber').upload(path, file)
      if (error) { setErr(`Gagal upload "${file.name}": ${error.message}`); continue }
      setDokPaths(prev => [...prev, path])
    }
    setDokUploading(false)
  }
  async function hapusDokumen(path: string) {
    await supabase.storage.from('dokumen-sumber').remove([path])
    setDokPaths(prev => prev.filter(p => p !== path))
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

  const draftDari = (b: Barang): DraftItem => ({
    aset_id: b.id, nibar: b.nibar, kode: b.kode, nama_barang: b.nama_barang,
    merek_tipe: b.merek_tipe, jumlah: b.jumlah, satuan: b.satuan, nilai: b.nilai_perolehan,
  })

  async function simpan() {
    if (selList.length === 0) { setErr('Centang minimal satu barang.'); return }
    setErr(''); setSaving(true)

    if (header) {
      const lama = header.payload?.draft_items || []
      const ada = new Set(lama.map(d => d.aset_id))
      const gabung = [...lama, ...selList.filter(b => !ada.has(b.id)).map(draftDari)]
      const { error } = await supabase.from('jurnal_header')
        .update({ payload: { ...(header.payload || {}), draft_items: gabung } }).eq('id', header.id)
      if (error) { setErr(`Gagal menambah barang: ${error.message}`); setSaving(false); return }
      setSaving(false); onSaved(selList.length); return
    }

    if (!noSk.trim()) { setErr('No. dokumen wajib diisi.'); setSaving(false); return }
    if (!tujuan) { setErr('SKPD tujuan wajib dipilih.'); setSaving(false); return }
    const { error } = await supabase.from('jurnal_header').insert({
      skpd_id: skpdId, kategori: 'mutasi_internal', jenis: null, sub_jenis: null,
      no_sk: noSk.trim(), tanggal: tgl, keterangan: ket.trim() || null,
      skpd_tujuan: Number(tujuan), approval_status: 'pending',
      payload: { dokumen_paths: dokPaths, draft_items: selList.map(draftDari) },
    })
    if (error) { setErr(`Gagal membuat jurnal: ${error.message}`); setSaving(false); return }
    setSaving(false); onSaved(selList.length)
  }

  const allSelected = rows.length > 0 && rows.every(r => sel[r.id])

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
          <p className="text-sm text-gray-500">Tgl. {header.tanggal} · {header.periode}</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">SKPD Tujuan <span className="text-gray-400">(satu induk dgn {skpdNama})</span></label>
              <select className="select-filter w-full" value={tujuan} onChange={e => setTujuan(e.target.value)}>
                <option value="">— pilih tujuan —</option>
                {tujuanList.map(s => <option key={s.id} value={s.id}>{' '.repeat((s.level - 1) * 3)}{s.nama}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">No. Dokumen</label>
              <input className="select-filter w-full" value={noSk} onChange={e => setNoSk(e.target.value)} placeholder="mis. 100.3.3.2/74/418.08/2026" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Tanggal</label>
              <input type="date" className="select-filter w-full" min={dateBounds.min} max={dateBounds.max}
                value={tgl} onChange={e => setTgl(e.target.value)} />
              <p className="text-xs text-gray-400 mt-1">Periode: {periodeDariTanggal(tgl)}</p>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs text-gray-500 mb-1">Keterangan</label>
              <input className="select-filter w-full" value={ket} onChange={e => setKet(e.target.value)} placeholder="mis. Pemerataan sarana ke SDN Belor" />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs text-gray-500 mb-1">Dokumen Sumber (foto / PDF, bisa lebih dari satu)</label>
              <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" multiple
                onChange={e => uploadDokumen(e.target.files)} disabled={dokUploading} className="text-xs" />
              {dokUploading && <p className="text-xs text-gray-400 mt-1">Mengunggah...</p>}
              {dokPaths.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {dokPaths.map(p => (
                    <li key={p} className="flex items-center gap-2 text-xs text-gray-600">
                      <span className="truncate">{namaFile(p)}</span>
                      <button onClick={() => hapusDokumen(p)} className="text-red-500 hover:text-red-700" title="Hapus dokumen">×</button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </div>

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
                    <th className="table-th w-10 text-center"><input type="checkbox" checked={allSelected} onChange={toggleAll} /></th>
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
                      <td className="table-td text-center"><input type="checkbox" checked={!!sel[b.id]} onChange={() => toggle(b)} /></td>
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
            {saving ? 'Menyimpan...' : header ? 'Tambah ke Jurnal' : 'Simpan Jurnal (Menunggu Persetujuan)'}
          </button>
        </div>
      </div>
    </div>
  )
}
