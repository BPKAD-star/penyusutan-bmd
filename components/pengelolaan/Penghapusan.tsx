'use client'
// No.11: Penghapusan — alur jurnal ala e-SIMBADA.
//   1. Pilih SKPD.
//   2. Tambah jurnal: No SK, tanggal, jenis + bentuk, keterangan (header).
//   3. Centang barang dari daftar terfilter (SKPD/golongan/komptabel/cari) → simpan.
//   4. Jurnal tampil dengan header + tabel barang; ikon sampah membatalkan
//      penghapusan barang (transaksi batal_penghapusan → aset aktif lagi).
// Grouping jurnal via payload.no_sk (tanpa tabel baru); ledger tetap append-only.
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { catatTransaksi } from '@/lib/transaksi'
import { periodeDariTanggal, GOLONGAN_DAFTAR_BARANG, kodeLevel3 } from '@/lib/bmd'
import { formatRupiah } from '@/lib/export'
import FormShell from './FormShell'

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
type Jurnal = {
  no_sk: string
  tanggal: string
  jenis: JenisHapus
  sub_jenis: string | null
  keterangan: string | null
  lines: JurnalLine[]
  total: number
}

const PENGHAPUSAN_JENIS = ['penghapusan_pemindahtanganan', 'penghapusan_sebab_lain']

export default function Penghapusan() {
  const supabase = createClient()

  const [skpdList, setSkpdList] = useState<{ id: number; nama: string }[]>([])
  const [golonganLabels, setGolonganLabels] = useState<Record<string, string>>({})
  const [skpd, setSkpd] = useState('')

  const [jurnals, setJurnals] = useState<Jurnal[]>([])
  const [loadingJurnal, setLoadingJurnal] = useState(false)

  const [mode, setMode] = useState<'list' | 'tambah'>('list')
  const [msg, setMsg] = useState('')

  // ── Referensi awal ──
  useEffect(() => {
    supabase.from('skpd').select('id,nama').eq('level', 1).order('nama')
      .then(({ data }) => setSkpdList(data || []))
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
    const { data } = await supabase.from('transaksi_bmd')
      .select('id,jenis,tanggal,keterangan,payload,nilai,aset:aset_id(id,nibar,nama_barang,kode,merek_tipe,jumlah,satuan,nilai_perolehan,status)')
      .in('jenis', PENGHAPUSAN_JENIS as never)
      .eq('skpd_asal', Number(skpdId))
      .order('id', { ascending: false })

    const rows = (data || []) as unknown as {
      id: number; jenis: JenisHapus; tanggal: string; keterangan: string | null
      payload: { no_sk?: string; sub_jenis?: string }; nilai: number
      aset: (Barang & { status: string }) | null
    }[]

    const map = new Map<string, Jurnal>()
    const seenAset = new Set<string>()
    for (const r of rows) {
      // Hanya barang yang masih berstatus dihapus = anggota jurnal saat ini.
      if (!r.aset || r.aset.status !== 'dihapus' || seenAset.has(r.aset.id)) continue
      seenAset.add(r.aset.id)
      const key = r.payload?.no_sk || '(tanpa no. SK)'
      let j = map.get(key)
      if (!j) {
        j = { no_sk: key, tanggal: r.tanggal, jenis: r.jenis, sub_jenis: r.payload?.sub_jenis || null, keterangan: r.keterangan, lines: [], total: 0 }
        map.set(key, j)
      }
      j.lines.push({
        aset_id: r.aset.id, nibar: r.aset.nibar, kode: r.aset.kode, nama_barang: r.aset.nama_barang,
        merek_tipe: r.aset.merek_tipe, jumlah: r.aset.jumlah, satuan: r.aset.satuan, nilai: r.nilai,
      })
      j.total += r.nilai
    }
    setJurnals([...map.values()])
    setLoadingJurnal(false)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadJurnals(skpd); setMode('list') }, [skpd, loadJurnals])

  async function hapusBarang(asetId: string, noSk: string, tglAsli: string) {
    if (!confirm('Batalkan penghapusan barang ini? Barang akan kembali aktif dan penyusutan dilanjutkan.')) return
    // Reversal dicatat di PERIODE penghapusan asli (tglAsli), bukan hari ini — supaya di
    // view periode itu barang langsung kembali muncul (konsisten dgn Daftar Barang).
    const { error } = await catatTransaksi(supabase, {
      asetId, jenis: 'batal_penghapusan', tanggal: tglAsli,
      keterangan: `Pembatalan dari jurnal ${noSk}`,
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
      <div className="card p-5 mb-4 max-w-3xl">
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
          Pilih SKPD di atas untuk melihat & membuat jurnal penghapusan.
        </div>
      ) : mode === 'tambah' ? (
        <TambahJurnal
          skpdId={Number(skpd)} skpdNama={skpdNama || ''} golonganLabels={golonganLabels}
          onCancel={() => setMode('list')}
          onSaved={(n) => { setMode('list'); setMsg(`Jurnal tersimpan — ${n} barang dihapus dari laporan (penyusutan berhenti).`); loadJurnals(skpd) }}
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
            <div key={j.no_sk} className="card overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/60">
                <div className="flex items-start justify-between gap-4">
                  <div className="text-sm space-y-0.5">
                    <p className="font-semibold text-gray-800">No. SK: {j.no_sk}</p>
                    <p className="text-xs text-gray-500">
                      {JENIS_OPT.find(o => o.value === j.jenis)?.label}
                      {j.sub_jenis && ` · ${SUBJENIS_OPT.find(o => o.value === j.sub_jenis)?.label || j.sub_jenis}`}
                      {' · '}Tgl. {j.tanggal}
                    </p>
                    {j.keterangan && <p className="text-xs text-gray-500">Keterangan: {j.keterangan}</p>}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-xs text-gray-400">Total Penghapusan</p>
                    <p className="font-semibold text-gray-800">{formatRupiah(j.total)}</p>
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
                    {j.lines.map(l => (
                      <tr key={l.aset_id}>
                        <td className="table-td text-center">
                          <button
                            onClick={() => hapusBarang(l.aset_id, j.no_sk, j.tanggal)}
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
    </FormShell>
  )
}

// ── Sub-view: header jurnal + pemilihan barang (centang) ───────────────────
function TambahJurnal({ skpdId, skpdNama, golonganLabels, onCancel, onSaved }: {
  skpdId: number; skpdNama: string; golonganLabels: Record<string, string>
  onCancel: () => void; onSaved: (n: number) => void
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

  async function simpan() {
    if (!noSk.trim()) { setErr('No. SK / dasar penghapusan wajib diisi.'); return }
    if (selList.length === 0) { setErr('Centang minimal satu barang.'); return }
    setErr('')
    setSaving(true)
    const periode = periodeDariTanggal(tgl)
    const payloadBase = jenis === 'penghapusan_pemindahtanganan'
      ? { no_sk: noSk.trim(), sub_jenis: subJenis }
      : { no_sk: noSk.trim() }
    const trxRows = selList.map(b => ({
      aset_id: b.id, jenis, periode, tanggal: tgl, nilai: b.nilai_perolehan,
      skpd_asal: b.skpd_id, payload: payloadBase, keterangan: ket.trim() || null,
    }))
    const { error } = await supabase.from('transaksi_bmd').insert(trxRows)
    if (error) { setErr(`Gagal mencatat transaksi: ${error.message}`); setSaving(false); return }
    const { error: e2 } = await supabase.from('aset').update({ status: 'dihapus' }).in('id', selList.map(b => b.id))
    if (e2) { setErr(`Transaksi tercatat, tapi update status aset gagal: ${e2.message}`); setSaving(false); return }
    setSaving(false)
    onSaved(selList.length)
  }

  const allSelected = rows.length > 0 && rows.every(r => sel[r.id])

  return (
    <div className="space-y-4">
      {/* Header jurnal */}
      <div className="card p-5 max-w-3xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-800">Jurnal Penghapusan Baru — {skpdNama}</h2>
          <button className="btn-secondary text-xs" onClick={onCancel}>← Kembali</button>
        </div>
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
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs text-gray-500 mb-1">Keterangan</label>
            <input className="select-filter w-full" value={ket} onChange={e => setKet(e.target.value)} placeholder="mis. Penghapusan Lelang" />
          </div>
        </div>
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
            {saving ? 'Menyimpan...' : 'Simpan Penghapusan'}
          </button>
        </div>
      </div>
    </div>
  )
}
