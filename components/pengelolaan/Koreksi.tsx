'use client'
// No.9: Koreksi — 2 mode terpisah:
//   - "Koreksi Transaksi" (alur ber-SK, sama pola dgn Reklasifikasi/
//     Penghapusan): pilih SKPD → tambah jurnal (No Dokumen Koreksi + tanggal
//     + keterangan) → pilih ALASAN (Nilai Perolehan / Kuantitas Bertambah —
//     DEFERRED / Pencatatan Ganda) → pilih barang.
//   - "Koreksi Spesifikasi" (alur lama, standalone single-item): DI LUAR
//     "3 sebab" yang diminta user, sengaja TIDAK ikut pola ber-SK.
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { catatTransaksi } from '@/lib/transaksi'
import { formatRupiah } from '@/lib/export'
import { periodeDariTanggal, GOLONGAN_DAFTAR_BARANG, kodeLevel3, perlakuanKode, parsePeriode, previousPeriode, formatPeriode, fetchBatasKapitalisasi, klasifikasiKomptabel } from '@/lib/bmd'
import { generateNibars } from '@/lib/nibar'
import { ASET_FIELD_COLS } from '@/lib/asetFields'
import AsetPicker, { type AsetRingkas } from '@/components/AsetPicker'
import SkpdCombobox from '@/components/SkpdCombobox'
import { useDateBounds, useTahunBukuMap } from '@/components/useTahunBuku'
import FormShell from './FormShell'

// ── Field spesifikasi (dipakai alasan "Spesifikasi Barang" di bawah) ────────
const SPEK_KOSONG = { nama_barang: '', spesifikasi_lainnya: '', merek_tipe: '', satuan: '' }
const ATRIBUT_KOSONG = { asal_usul: '', kondisi_barang: '', tahun_pengadaan: '' }
const KONDISI_OPT = ['Baik', 'Rusak Ringan', 'Rusak Berat', 'Hilang', 'Tidak Ditemukan']
// Field identitas tanah (nomor/jenis hak/luas/dll) TIDAK diedit di sini lagi —
// dikelola khusus di menu GIS BMD (aset_bidang_tanah), biar gak ada 2 sumber.

// ── Koreksi — satu alur ber-SK, 4 alasan ─────────────────────────────────────
type Alasan = 'nilai_perolehan' | 'pencatatan_ganda' | 'spesifikasi'
const ALASAN_OPT: { value: Alasan; label: string; deskripsi: string; disabled?: boolean }[] = [
  { value: 'nilai_perolehan', label: 'Nilai Perolehan', deskripsi: 'Koreksi nilai perolehan barang — beban penyusutan disebar ulang ke sisa umur oleh engine.' },
  { value: 'pencatatan_ganda', label: 'Pencatatan Ganda (Gabung Duplikat)', deskripsi: 'Gabungkan barang yang kecatat dua kali jadi satu register — kode barang harus identik.' },
  { value: 'spesifikasi', label: 'Spesifikasi Barang', deskripsi: 'Koreksi field spesifikasi (nama, dokumen, kondisi, dll) satu barang — tanpa efek nilai/penyusutan.' },
]
// Pemecahan Barang punya alur sendiri (1 induk → N pecahan), BUKAN salah satu
// "alasan" pilih-barang di atas — lihat PemecahanPanel & tombol "+ Pemecahan Barang".
const ALASAN_LABEL = Object.fromEntries(ALASAN_OPT.map(a => [a.value, a.label])) as Record<Alasan, string>
const tahunDari = (tgl: string | null) => tgl ? tgl.slice(0, 4) : '-'

type Barang = {
  id: string; nibar: string | null; kode: string; nama_barang: string | null
  merek_tipe: string | null; jumlah: number; satuan: string | null; nilai_perolehan: number; skpd_id: number | null
}
type Kandidat = {
  id: string; nibar: string | null; kode: string; nama_barang: string | null
  spesifikasi_lainnya: string | null; nilai_perolehan: number; tgl_perolehan: string | null
}
type LinePayload = { nilai_lama?: number; nilai_perolehan_baru?: number; survivor_nibar?: string }
type Header = {
  id: string; no_sk: string; tanggal: string; periode: string; jenis: Alasan
  keterangan: string | null; kategori: 'koreksi'
}
type JurnalLine = {
  aset_id: string; nibar: string | null; kode: string; nama_barang: string | null
  nilai: number; payload: LinePayload | null
}
type Jurnal = Header & { lines: JurnalLine[]; total: number }

// ── Pemecahan Barang (alur sendiri: 1 induk → N pecahan) ────────────────────
type PemecahanHeader = { id: string; no_sk: string; tanggal: string; periode: string; keterangan: string | null }
type PemecahanRow = { aset_id: string; nibar: string | null; kode: string; nama_barang: string | null; jumlah: number; nilai: number }
type PemecahanJurnal = PemecahanHeader & { induk: PemecahanRow | null; pecahan: PemecahanRow[]; total: number; dibatalkan: boolean }

const HEADER_COLS = 'id,no_sk,tanggal,periode,jenis,keterangan,kategori'

function ringkasanBaris(l: JurnalLine, jenis: Alasan): string {
  const p = l.payload || {}
  if (jenis === 'spesifikasi') {
    const fields = Object.keys(p)
    return fields.length ? `Spesifikasi diubah: ${fields.join(', ')}` : '-'
  }
  if (p.nilai_perolehan_baru != null) return `${formatRupiah(p.nilai_lama || 0)} → ${formatRupiah(p.nilai_perolehan_baru)}`
  if (p.survivor_nibar) return `Digabung ke NIBAR ${p.survivor_nibar}`
  return '-'
}

export default function Koreksi() {
  return (
    <FormShell judul="Koreksi" msg=""
      deskripsi="Koreksi lewat jurnal ber-SK: nilai perolehan, spesifikasi barang, atau pencatatan ganda.">
      <KoreksiTransaksi />
    </FormShell>
  )
}

// ════════════════════════════════════════════════════════════════════════
// Koreksi — alur ber-SK, satu-satunya alur (4 alasan)
// ════════════════════════════════════════════════════════════════════════
function KoreksiTransaksi() {
  const supabase = createClient()
  const tahunMap = useTahunBukuMap()
  const [skpdList, setSkpdList] = useState<{ id: number; nama: string }[]>([])
  const [golonganLabels, setGolonganLabels] = useState<Record<string, string>>({})
  const [skpd, setSkpd] = useState('')

  const [jurnals, setJurnals] = useState<Jurnal[]>([])
  const [pemecahanJurnals, setPemecahanJurnals] = useState<PemecahanJurnal[]>([])
  const [loadingJurnal, setLoadingJurnal] = useState(false)

  const [mode, setMode] = useState<'list' | 'tambah' | 'pemecahan'>('list')
  const [addTo, setAddTo] = useState<Header | null>(null)
  const [editing, setEditing] = useState<Header | null>(null)
  const [batalId, setBatalId] = useState<string | null>(null)
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
    if (!skpdId) { setJurnals([]); setPemecahanJurnals([]); return }
    setLoadingJurnal(true)
    const { data: headers } = await supabase.from('jurnal_header')
      .select(HEADER_COLS).eq('kategori', 'koreksi').eq('skpd_id', Number(skpdId))
      .order('tanggal', { ascending: false })
    const allHeaders = (headers || []) as unknown as (Header & { jenis: string })[]
    const hs = allHeaders.filter(h => h.jenis !== 'pemecahan') as unknown as Header[]
    const pemHeaders = allHeaders.filter(h => h.jenis === 'pemecahan') as unknown as PemecahanHeader[]

    const jmap = new Map<string, Jurnal>()
    for (const h of hs) jmap.set(h.id, { ...h, lines: [], total: 0 })

    const headerIds = hs.map(h => h.id)
    if (headerIds.length > 0) {
      const { data } = await supabase.from('transaksi_bmd')
        .select('header_id,nilai,payload,aset:aset_id(id,nibar,nama_barang,kode)')
        .in('jenis', ['koreksi_nilai', 'koreksi_pencatatan_ganda', 'koreksi_spesifikasi'] as never)
        .in('header_id', headerIds)
        .order('id', { ascending: true })
      const rows = (data || []) as unknown as {
        header_id: string; nilai: number; payload: LinePayload | null
        aset: { id: string; nibar: string | null; nama_barang: string | null; kode: string } | null
      }[]
      for (const r of rows) {
        if (!r.aset) continue
        const j = jmap.get(r.header_id)
        if (!j) continue
        j.lines.push({ aset_id: r.aset.id, nibar: r.aset.nibar, kode: r.aset.kode, nama_barang: r.aset.nama_barang, nilai: r.nilai, payload: r.payload })
        j.total += r.nilai
      }
    }
    setJurnals([...jmap.values()].filter(j => j.lines.length > 0))

    // ── Jurnal Pemecahan: induk (pemecahan_keluar) + pecahan (pemecahan_masuk) ──
    const pmap = new Map<string, PemecahanJurnal>()
    for (const h of pemHeaders) pmap.set(h.id, { ...h, induk: null, pecahan: [], total: 0, dibatalkan: false })
    const pemIds = pemHeaders.map(h => h.id)
    if (pemIds.length > 0) {
      const { data } = await supabase.from('transaksi_bmd')
        .select('header_id,jenis,nilai,aset:aset_id(id,nibar,nama_barang,kode,jumlah)')
        .in('jenis', ['pemecahan_keluar', 'pemecahan_masuk', 'batal_pemecahan'] as never)
        .in('header_id', pemIds)
        .order('id', { ascending: true })
      const rows = (data || []) as unknown as {
        header_id: string; jenis: string; nilai: number
        aset: { id: string; nibar: string | null; nama_barang: string | null; kode: string; jumlah: number } | null
      }[]
      for (const r of rows) {
        const j = pmap.get(r.header_id)
        if (!j) continue
        if (r.jenis === 'batal_pemecahan') { j.dibatalkan = true; continue }
        if (!r.aset) continue
        const row: PemecahanRow = { aset_id: r.aset.id, nibar: r.aset.nibar, kode: r.aset.kode, nama_barang: r.aset.nama_barang, jumlah: r.aset.jumlah, nilai: r.nilai }
        if (r.jenis === 'pemecahan_keluar') j.induk = row
        else { j.pecahan.push(row); j.total += r.nilai }
      }
    }
    setPemecahanJurnals([...pmap.values()].filter(j => j.induk || j.pecahan.length > 0))
    setLoadingJurnal(false)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadJurnals(skpd); setMode('list'); setAddTo(null); setEditing(null) }, [skpd, loadJurnals])

  const skpdNama = skpdList.find(s => String(s.id) === skpd)?.nama

  // Batal Pemecahan: induk aktif lagi (batal_pemecahan) + pecahan dibuang
  // (batal_pemecahan_masuk). Dicatat mundur ke tanggal pemecahan asli supaya
  // period-correct. Hanya boleh selama tahun pemecahan masih TERBUKA (guard DB
  // juga menolak kalau terkunci — ini fail-fast di UI).
  async function handleBatalPemecahan(j: PemecahanJurnal) {
    const tahun = parsePeriode(j.periode).tahun
    if (tahunMap[tahun] !== 'terbuka') {
      setMsg(`Error: Tahun ${tahun} sudah terkunci — pemecahan tidak bisa dibatalkan. Koreksi lewat pemecahan/gabung baru di periode berjalan.`)
      return
    }
    if (!confirm(`Batalkan pemecahan No. ${j.no_sk}? Induk akan aktif kembali dan ${j.pecahan.length} pecahan dibuang.`)) return
    setBatalId(j.id)
    setMsg('')
    if (j.induk) {
      const { error } = await catatTransaksi(supabase, {
        asetId: j.induk.aset_id, jenis: 'batal_pemecahan', tanggal: j.tanggal, nilai: j.induk.nilai, headerId: j.id,
        payload: { induk_nibar: j.induk.nibar }, keterangan: `Pembatalan pemecahan ${j.no_sk}`,
      })
      if (error) { setMsg(`Error: ${error}`); setBatalId(null); return }
    }
    for (const p of j.pecahan) {
      const { error } = await catatTransaksi(supabase, {
        asetId: p.aset_id, jenis: 'batal_pemecahan_masuk', tanggal: j.tanggal, nilai: p.nilai, headerId: j.id,
        payload: { induk_nibar: j.induk?.nibar || null }, keterangan: `Pembatalan pemecahan ${j.no_sk}`,
      })
      if (error) { setMsg(`Sebagian batal gagal: ${error} — ulangi untuk menuntaskan.`); setBatalId(null); loadJurnals(skpd); return }
    }
    setBatalId(null)
    setMsg(`Pemecahan ${j.no_sk} dibatalkan — induk kembali aktif. Jalankan engine untuk memperbarui penyusutan.`)
    loadJurnals(skpd)
  }

  return (
    <>
      <div className="card p-5 mb-4">
        <div className="flex items-center gap-3">
          <label className="w-32 text-sm text-gray-600 text-right flex-shrink-0">Lokasi / SKPD :</label>
          <SkpdCombobox lockToOperator value={skpd} onChange={id => { setSkpd(id); setMsg('') }}
            placeholder="Ketik nama SKPD / Sub OPD / Lokasi..." />
        </div>
      </div>

      {msg && (
        <div className={`mb-4 p-3 rounded-lg text-sm max-w-2xl ${msg.startsWith('Error') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>{msg}</div>
      )}

      {!skpd ? (
        <div className="card p-12 text-center text-gray-400 text-sm">Pilih SKPD di atas untuk melihat &amp; membuat jurnal koreksi.</div>
      ) : mode === 'tambah' ? (
        <KoreksiForm skpdId={Number(skpd)} skpdNama={skpdNama || ''} golonganLabels={golonganLabels} header={null}
          onCancel={() => setMode('list')}
          onSaved={n => { setMode('list'); setMsg(`Jurnal tersimpan — ${n} barang dikoreksi.`); loadJurnals(skpd) }} />
      ) : addTo ? (
        <KoreksiForm skpdId={Number(skpd)} skpdNama={skpdNama || ''} golonganLabels={golonganLabels} header={addTo}
          onCancel={() => setAddTo(null)}
          onSaved={n => { setAddTo(null); setMsg(`${n} barang ditambahkan ke jurnal ${addTo.no_sk}.`); loadJurnals(skpd) }} />
      ) : mode === 'pemecahan' ? (
        <PemecahanPanel skpdId={Number(skpd)} skpdNama={skpdNama || ''}
          onCancel={() => setMode('list')}
          onSaved={(n, no) => { setMode('list'); setMsg(`Pemecahan ${no} tersimpan — induk dipecah jadi ${n} pecahan. Jalankan engine untuk mengisi angka penyusutan pecahan.`); loadJurnals(skpd) }} />
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">{skpdNama} — {jurnals.length} koreksi · {pemecahanJurnals.length} pemecahan</span>
            <div className="flex items-center gap-2">
              <button className="btn-secondary" onClick={() => { setMsg(''); setMode('pemecahan') }}>+ Pemecahan Barang</button>
              <button className="btn-primary" onClick={() => { setMsg(''); setMode('tambah') }}>+ Tambah Jurnal</button>
            </div>
          </div>
          {loadingJurnal ? (
            <div className="card p-12 text-center text-gray-400 text-sm">Memuat jurnal...</div>
          ) : (jurnals.length === 0 && pemecahanJurnals.length === 0) ? (
            <div className="card p-12 text-center text-gray-400 text-sm">Belum ada koreksi transaksi untuk SKPD ini.</div>
          ) : (<>
            {pemecahanJurnals.map(j => (
              <PemecahanCard key={j.id} j={j} busy={batalId === j.id}
                bisaBatal={tahunMap[parsePeriode(j.periode).tahun] === 'terbuka'}
                onBatal={() => handleBatalPemecahan(j)} />
            ))}
            {jurnals.map(j => (
            <div key={j.id} className="card overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/60">
                <div className="flex items-start justify-between gap-4">
                  <div className="text-sm space-y-0.5">
                    <p className="font-semibold text-gray-800">No. Dokumen Koreksi: {j.no_sk}</p>
                    <p className="text-xs text-gray-500">{ALASAN_LABEL[j.jenis]} · Tgl. {j.tanggal} · {j.periode}</p>
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
                        <td className="table-td text-xs text-gray-600">{ringkasanBaris(l, j.jenis)}</td>
                        <td className="table-td text-right text-xs">{formatRupiah(l.nilai)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            ))}
          </>)}
        </div>
      )}

      {editing && (
        <EditHeaderModal header={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); setMsg('Header jurnal diperbarui.'); loadJurnals(skpd) }} />
      )}
    </>
  )
}

// ── Modal edit header: No dokumen + tanggal (kunci semester sama) + keterangan ──
function EditHeaderModal({ header, onClose, onSaved }: { header: Header; onClose: () => void; onSaved: () => void }) {
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
    if (!noSk.trim()) { setErr('No. dokumen koreksi wajib diisi.'); return }
    if (pindahSemester) {
      setErr(`Tanggal masuk ${tglPeriode}, sedangkan jurnal ini di ${header.periode}. Pindah semester tidak diizinkan — batalkan & entry ulang.`)
      return
    }
    setErr(''); setSaving(true)
    const { error } = await supabase.from('jurnal_header')
      .update({ no_sk: noSk.trim(), tanggal: tgl, keterangan: ket.trim() || null }).eq('id', header.id)
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
            <label className="block text-xs text-gray-500 mb-1">No. Dokumen Koreksi</label>
            <input className="select-filter w-full" value={noSk} onChange={e => setNoSk(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Tanggal <span className="text-gray-400">(harus tetap di {header.periode})</span></label>
            <input type="date" className="select-filter w-full" max={dateBounds.max} value={tgl} onChange={e => setTgl(e.target.value)} />
            {pindahSemester && (
              <p className="text-xs text-red-600 mt-1">Tanggal ini masuk {tglPeriode} — di luar semester jurnal. Ganti tanggal, atau batalkan &amp; entry ulang.</p>
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

// ── Sub-view: (opsional header baru) + alasan + pilih barang ────────────────
function KoreksiForm({ skpdId, skpdNama, golonganLabels, header, onCancel, onSaved }: {
  skpdId: number; skpdNama: string; golonganLabels: Record<string, string>
  header: Header | null; onCancel: () => void; onSaved: (n: number) => void
}) {
  const supabase = createClient()
  const dateBounds = useDateBounds()

  const [alasan, setAlasan] = useState<Alasan>(header?.jenis || 'nilai_perolehan')
  const [noSk, setNoSk] = useState('')
  const [tgl, setTgl] = useState(new Date().toISOString().slice(0, 10))
  const [ket, setKet] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  // ── Nilai Perolehan: barang + nilai baru per-baris ──
  const [fGolongan, setFGolongan] = useState('')
  const [fSearch, setFSearch] = useState('')
  const [rows, setRows] = useState<Barang[]>([])
  const [loaded, setLoaded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [selNilai, setSelNilai] = useState<Record<string, { barang: Barang; nilaiBaru: string }>>({})

  // ── Pencatatan Ganda: cari & tambah kandidat ──
  const [qGanda, setQGanda] = useState('')
  const [hasilGanda, setHasilGanda] = useState<Kandidat[]>([])
  const [kandidat, setKandidat] = useState<Kandidat[]>([])
  const [survivorId, setSurvivorId] = useState<string | null>(null)

  // ── Spesifikasi: satu barang + field yang diubah ──
  const [aset, setAset] = useState<AsetRingkas | null>(null)
  const [spek, setSpek] = useState(SPEK_KOSONG)
  const [atribut, setAtribut] = useState(ATRIBUT_KOSONG)

  async function tampilkan() {
    setLoading(true)
    let q = supabase.from('aset')
      .select('id,nibar,kode,nama_barang,merek_tipe,jumlah,satuan,nilai_perolehan,skpd_id')
      .eq('status', 'aktif').eq('skpd_id', skpdId)
    if (fGolongan) q = q.like('kode', `${fGolongan}.%`)
    if (fSearch) q = q.or(`nama_barang.ilike.%${fSearch}%,nibar.ilike.%${fSearch}%,kode.ilike.${fSearch}%`)
    const { data } = await q.order('nilai_perolehan', { ascending: false }).limit(500)
    setRows((data as unknown as Barang[]) || [])
    setLoaded(true)
    setLoading(false)
  }
  function toggleNilai(b: Barang) {
    setSelNilai(prev => {
      const next = { ...prev }
      if (next[b.id]) delete next[b.id]
      else next[b.id] = { barang: b, nilaiBaru: String(b.nilai_perolehan) }
      return next
    })
  }
  function ubahNilaiBaru(id: string, v: string) {
    setSelNilai(prev => prev[id] ? { ...prev, [id]: { ...prev[id], nilaiBaru: v } } : prev)
  }

  async function cariKandidat() {
    if (!qGanda.trim()) return
    const { data } = await supabase.from('aset')
      .select('id,nibar,kode,nama_barang,spesifikasi_lainnya,nilai_perolehan,tgl_perolehan')
      .eq('status', 'aktif').eq('skpd_id', skpdId)
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

  async function simpan() {
    setErr('')

    let h = header
    const headerBaru = !header
    if (!h) {
      if (!noSk.trim()) { setErr('No. dokumen koreksi wajib diisi.'); return }
      if (alasan === 'pencatatan_ganda' && !ket.trim()) { setErr('Keterangan/justifikasi wajib diisi utk Pencatatan Ganda.'); return }
    }

    setSaving(true)

    if (!h) {
      const { data, error } = await supabase.from('jurnal_header').insert({
        skpd_id: skpdId, kategori: 'koreksi', jenis: alasan,
        no_sk: noSk.trim(), tanggal: tgl, keterangan: ket.trim() || null,
      }).select(HEADER_COLS).single()
      if (error || !data) { setErr(`Gagal membuat header jurnal: ${error?.message}`); setSaving(false); return }
      h = data as unknown as Header
    }

    if (alasan === 'nilai_perolehan') {
      const items = Object.values(selNilai)
      if (items.length === 0) { setErr('Centang minimal satu barang.'); if (headerBaru) await supabase.from('jurnal_header').delete().eq('id', h.id); setSaving(false); return }
      for (const { barang, nilaiBaru } of items) {
        const baru = parseFloat(nilaiBaru)
        if (isNaN(baru) || baru < 0) { setErr(`Nilai baru "${barang.nama_barang || barang.nibar}" tidak valid.`); if (headerBaru) await supabase.from('jurnal_header').delete().eq('id', h.id); setSaving(false); return }
        const delta = baru - barang.nilai_perolehan
        const { error } = await catatTransaksi(supabase, {
          asetId: barang.id, jenis: 'koreksi_nilai', nilai: delta, tanggal: h.tanggal, headerId: h.id,
          payload: { nilai_lama: barang.nilai_perolehan, nilai_perolehan_baru: baru, delta },
          keterangan: h.keterangan || undefined,
        })
        if (error) { setErr(error); if (headerBaru) await supabase.from('jurnal_header').delete().eq('id', h.id); setSaving(false); return }
      }
      setSaving(false); onSaved(items.length); return
    }

    if (alasan === 'spesifikasi') {
      if (!aset) { setErr('Pilih barang yang dikoreksi.'); if (headerBaru) await supabase.from('jurnal_header').delete().eq('id', h.id); setSaving(false); return }
      const isiTeks = Object.fromEntries(Object.entries(spek).filter(([, v]) => v.trim() !== ''))
      const isiAtribut: Record<string, unknown> = {}
      if (atribut.asal_usul.trim()) isiAtribut.asal_usul = atribut.asal_usul.trim()
      if (atribut.kondisi_barang) isiAtribut.kondisi_barang = atribut.kondisi_barang
      if (atribut.tahun_pengadaan.trim()) {
        const th = parseInt(atribut.tahun_pengadaan, 10)
        if (!isNaN(th) && th > 0) isiAtribut.tahun_pengadaan = th
      }
      const isi = { ...isiTeks, ...isiAtribut }
      if (Object.keys(isi).length === 0) { setErr('Tidak ada field yang diubah.'); if (headerBaru) await supabase.from('jurnal_header').delete().eq('id', h.id); setSaving(false); return }
      const { error } = await catatTransaksi(supabase, {
        asetId: aset.id, jenis: 'koreksi_spesifikasi', headerId: h.id, payload: isi, keterangan: h.keterangan || undefined,
      })
      if (error) { setErr(error); if (headerBaru) await supabase.from('jurnal_header').delete().eq('id', h.id); setSaving(false); return }
      setSaving(false); onSaved(1); return
    }

    // pencatatan_ganda
    if (kandidat.length < 2) { setErr('Pilih minimal 2 barang kandidat duplikat.'); if (headerBaru) await supabase.from('jurnal_header').delete().eq('id', h.id); setSaving(false); return }
    if (!survivorId) { setErr('Pilih salah satu sebagai barang yang dipertahankan.'); if (headerBaru) await supabase.from('jurnal_header').delete().eq('id', h.id); setSaving(false); return }
    if (kodeBeda) { setErr('Semua kandidat harus kode barang yang SAMA PERSIS.'); if (headerBaru) await supabase.from('jurnal_header').delete().eq('id', h.id); setSaving(false); return }
    const survivor = kandidat.find(k => k.id === survivorId)!
    const lainnya = kandidat.filter(k => k.id !== survivorId)
    for (const k of lainnya) {
      const { error } = await catatTransaksi(supabase, {
        asetId: k.id, jenis: 'koreksi_pencatatan_ganda', tanggal: k.tgl_perolehan || h.tanggal, headerId: h.id,
        payload: { survivor_aset_id: survivor.id, survivor_nibar: survivor.nibar },
        keterangan: h.keterangan || undefined,
      })
      if (error) { setErr(error); if (headerBaru) await supabase.from('jurnal_header').delete().eq('id', h.id); setSaving(false); return }
    }
    setSaving(false); onSaved(lainnya.length)
  }

  const alasanAktif = header?.jenis || alasan

  return (
    <div className="space-y-4">
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-800">{header ? `Tambah Barang — ${header.no_sk}` : `Jurnal Baru — ${skpdNama}`}</h2>
          <button className="btn-secondary text-xs" onClick={onCancel}>← Kembali</button>
        </div>

        {header ? (
          <p className="text-sm text-gray-500">{ALASAN_LABEL[header.jenis]} · Tgl. {header.tanggal} · {header.periode}</p>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Alasan Koreksi</label>
              <div className="space-y-2">
                {ALASAN_OPT.map(o => (
                  <label key={o.value} className={`flex items-start gap-2 p-2.5 rounded-lg border text-sm ${o.disabled ? 'opacity-50 cursor-not-allowed border-gray-200' : alasan === o.value ? 'border-teal bg-teal/5 cursor-pointer' : 'border-gray-200 hover:bg-gray-50 cursor-pointer'}`}>
                    <input type="radio" className="mt-0.5" checked={alasan === o.value} disabled={o.disabled}
                      onChange={() => {
                        setAlasan(o.value); setSelNilai({}); setKandidat([]); setSurvivorId(null); setRows([]); setLoaded(false)
                        setAset(null); setSpek(SPEK_KOSONG); setAtribut(ATRIBUT_KOSONG)
                      }} />
                    <span>
                      <span className="font-medium text-gray-800">{o.label}</span>
                      <span className="block text-xs text-gray-500 mt-0.5">{o.deskripsi}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1">No. Dokumen Koreksi</label>
                <input className="select-filter w-full" value={noSk} onChange={e => setNoSk(e.target.value)} placeholder="mis. 100.3.3.2/74/418.08/2024" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Tanggal Koreksi</label>
                <input type="date" className="select-filter w-full" min={dateBounds.min} max={dateBounds.max} value={tgl} onChange={e => setTgl(e.target.value)} />
                <p className="text-xs text-gray-400 mt-1">Periode: {periodeDariTanggal(tgl)}</p>
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs text-gray-500 mb-1">
                  Keterangan {alasan === 'pencatatan_ganda' && <span className="text-red-500">*wajib (justifikasi duplikat)</span>}
                </label>
                <input className="select-filter w-full" value={ket} onChange={e => setKet(e.target.value)} />
              </div>
            </div>
          </div>
        )}
      </div>

      {alasanAktif === 'nilai_perolehan' && (
        <div className="card p-5">
          <h2 className="text-base font-semibold text-gray-800 mb-4">Pilih Barang &amp; Nilai Baru</h2>
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
              <input className="select-filter w-full" placeholder="Nama barang / NIBAR / kode..." value={fSearch}
                onChange={e => setFSearch(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') tampilkan() }} />
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
                      <th className="table-th w-10 text-center"></th>
                      <th className="table-th">Barang</th>
                      <th className="table-th text-right">Nilai Sekarang</th>
                      <th className="table-th text-right w-48">Nilai Baru</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {rows.length === 0 ? (
                      <tr><td colSpan={4} className="table-td text-center py-10 text-gray-400">Tidak ada barang aktif untuk filter ini.</td></tr>
                    ) : rows.map(b => (
                      <tr key={b.id} className={selNilai[b.id] ? 'bg-teal/5' : ''}>
                        <td className="table-td text-center">
                          <input type="checkbox" checked={!!selNilai[b.id]} onChange={() => toggleNilai(b)} />
                        </td>
                        <td className="table-td">
                          <p className="font-medium text-gray-800 text-xs">{b.nama_barang || '-'}</p>
                          <p className="text-gray-400 text-xs mt-0.5">{b.nibar || '-'} · {b.kode} · {golonganLabels[kodeLevel3(b.kode)] || kodeLevel3(b.kode)}</p>
                        </td>
                        <td className="table-td text-right text-xs">{formatRupiah(b.nilai_perolehan)}</td>
                        <td className="table-td text-right">
                          {selNilai[b.id] && (
                            <input type="number" min="0" step="1" className="select-filter w-full text-right"
                              value={selNilai[b.id].nilaiBaru} onChange={e => ubahNilaiBaru(b.id, e.target.value)} />
                          )}
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
            <span className="text-sm text-gray-600">{Object.keys(selNilai).length} barang dipilih</span>
            <button className="btn-primary" onClick={simpan} disabled={saving || Object.keys(selNilai).length === 0}>
              {saving ? 'Menyimpan...' : header ? 'Tambah ke Jurnal' : 'Simpan Koreksi'}
            </button>
          </div>
        </div>
      )}

      {alasanAktif === 'pencatatan_ganda' && (
        <div className="card p-5">
          <h2 className="text-base font-semibold text-gray-800 mb-4">Pilih Kandidat Duplikat</h2>
          <p className="text-sm text-gray-500 mb-3">
            Cari &amp; tambah minimal 2 barang, tandai yang DIPERTAHANKAN — sisanya dibatalkan retroaktif ke tanggal
            perolehan masing-masing (hilang dari Daftar Barang/Penyusutan/KIBAR, ledger tetap tersimpan utk audit).
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
                  <button key={k.id} type="button" onClick={() => tambahKandidat(k)} className="w-full text-left px-3 py-2 hover:bg-gray-50 text-xs">
                    <span className="font-medium text-gray-800">{k.nama_barang || '-'}</span>
                    <span className="text-gray-400"> — {k.nibar || '-'} · {k.kode} · {formatRupiah(k.nilai_perolehan)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {kandidat.length > 0 && (
            <div className="mt-4 border border-gray-200 rounded-lg overflow-hidden">
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
          {err && <p className="mt-3 text-sm text-red-600">{err}</p>}
          <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-100">
            <span className="text-sm text-gray-600">{kandidat.length} barang dipilih</span>
            <button className="btn-primary" onClick={simpan} disabled={saving || kandidat.length < 2 || !survivorId || kodeBeda}>
              {saving ? 'Menyimpan...' : header ? 'Tambah ke Jurnal' : `Gabung ${kandidat.length} Barang`}
            </button>
          </div>
        </div>
      )}

      {alasanAktif === 'spesifikasi' && (
        <div className="card p-5">
          <h2 className="text-base font-semibold text-gray-800 mb-4">Barang &amp; Field yang Diubah</h2>
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Aset</label>
              <AsetPicker selected={aset} onSelect={setAset} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              {(Object.keys(spek) as (keyof typeof spek)[]).map(k => (
                <div key={k}>
                  <label className="block text-xs text-gray-500 mb-1 capitalize">{k.replace('_', ' ')}</label>
                  <input className="select-filter w-full" value={spek[k]} placeholder="(kosongkan jika tidak berubah)"
                    onChange={e => setSpek(s => ({ ...s, [k]: e.target.value }))} />
                </div>
              ))}
            </div>
            {(aset?.kode.startsWith('1.3.1') ?? false) && (
              <div className="pt-3 border-t border-gray-100">
                <p className="text-xs text-gray-500 bg-gray-50 rounded-lg p-3">
                  Field identitas tanah (luas, nomor & jenis hak, dokumen kepemilikan, titik koordinat)
                  dikelola di menu <span className="font-medium text-gray-700">GIS BMD</span> — termasuk
                  pemecahan per bidang tanah. Di sini cukup untuk nama/spesifikasi umum.
                </p>
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
                    placeholder="(kosongkan jika tidak berubah)" onChange={e => setAtribut(s => ({ ...s, tahun_pengadaan: e.target.value }))} />
                </div>
              </div>
            </div>
          </div>
          {err && <p className="mt-3 text-sm text-red-600">{err}</p>}
          <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-100">
            <span className="text-sm text-gray-600">{aset ? `1 barang dipilih — ${aset.nama_barang || aset.nibar || '-'}` : 'Belum pilih barang'}</span>
            <button className="btn-primary" onClick={simpan} disabled={saving || !aset}>
              {saving ? 'Menyimpan...' : header ? 'Tambah ke Jurnal' : 'Simpan Koreksi'}
            </button>
          </div>
        </div>
      )}

    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════
// Pemecahan Barang — kartu tampil (induk retire + N pecahan) + tombol Batal
// ════════════════════════════════════════════════════════════════════════
function PemecahanCard({ j, busy, bisaBatal, onBatal }: {
  j: PemecahanJurnal; busy: boolean; bisaBatal: boolean; onBatal: () => void
}) {
  return (
    <div className="card overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/60">
        <div className="flex items-start justify-between gap-4">
          <div className="text-sm space-y-0.5">
            <p className="font-semibold text-gray-800">
              Pemecahan Barang · No. {j.no_sk}
              {j.dibatalkan && <span className="ml-2 text-xs font-medium text-red-600 bg-red-50 px-2 py-0.5 rounded">Dibatalkan</span>}
            </p>
            <p className="text-xs text-gray-500">Tgl. {j.tanggal} · {j.periode} · {j.pecahan.length} pecahan</p>
            {j.keterangan && <p className="text-xs text-gray-500">Keterangan: {j.keterangan}</p>}
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            <div className="text-right">
              <p className="text-xs text-gray-400">Total Nilai Pecahan</p>
              <p className="font-semibold text-gray-800">{formatRupiah(j.total)}</p>
            </div>
            {!j.dibatalkan && (
              <button disabled={busy || !bisaBatal} onClick={onBatal}
                title={bisaBatal ? 'Batalkan pemecahan — induk kembali aktif' : 'Tahun sudah terkunci — tidak bisa dibatalkan'}
                className="text-xs font-medium text-red-600 hover:text-red-700 border border-red-200 rounded px-2.5 py-1.5 disabled:opacity-40 disabled:cursor-not-allowed">
                {busy ? 'Membatalkan...' : 'Batal Pemecahan'}
              </button>
            )}
          </div>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="table-th w-24">Peran</th>
              <th className="table-th">Kode Register / Nama Barang</th>
              <th className="table-th text-center">Jumlah</th>
              <th className="table-th text-right">Nilai Perolehan</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {j.induk && (
              <tr className="bg-amber-50/40">
                <td className="table-td text-xs font-medium text-amber-700">Induk</td>
                <td className="table-td">
                  <p className="font-medium text-gray-800 text-xs">{j.induk.nama_barang || '-'}</p>
                  <p className="text-gray-400 text-xs mt-0.5">{j.induk.nibar || '-'} · {j.induk.kode}</p>
                </td>
                <td className="table-td text-center text-xs">{j.induk.jumlah}</td>
                <td className="table-td text-right text-xs">{formatRupiah(j.induk.nilai)}</td>
              </tr>
            )}
            {j.pecahan.map(p => (
              <tr key={p.aset_id}>
                <td className="table-td text-xs text-gray-500">Pecahan</td>
                <td className="table-td">
                  <p className="font-medium text-gray-800 text-xs">{p.nama_barang || '-'}</p>
                  <p className="text-gray-400 text-xs mt-0.5">{p.nibar || '-'} · {p.kode}</p>
                </td>
                <td className="table-td text-center text-xs">{p.jumlah}</td>
                <td className="table-td text-right text-xs">{formatRupiah(p.nilai)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════
// Pemecahan Barang — form buat: 1 induk → N pecahan (jumlah + nilai bebas,
// total NILAI wajib = induk). Alokasi nilai buku/akumulasi PROPORSIONAL by
// nilai; sisa pembulatan diserap di pecahan terakhir. Basis = state engine
// induk pada semester SEBELUM cutover (penyusutan_semester).
// ════════════════════════════════════════════════════════════════════════
type IndukPecah = { id: string; nibar: string | null; kode: string; nama_barang: string | null; nilai_perolehan: number; jumlah: number; tgl_perolehan: string | null; cara_perolehan: string | null }
type BasisPecah = { nilai_buku: number; akumulasi: number; sisa_smt: number; masa_tahun: number | null; disusutkan: boolean }
type Pecahan = { key: string; jumlah: string; nilai: string }
const newKey = () => Math.random().toString(36).slice(2)

function PemecahanPanel({ skpdId, skpdNama, onCancel, onSaved }: {
  skpdId: number; skpdNama: string; onCancel: () => void; onSaved: (n: number, noSk: string) => void
}) {
  const supabase = createClient()
  const dateBounds = useDateBounds()

  const [noSk, setNoSk] = useState('')
  const [tgl, setTgl] = useState(new Date().toISOString().slice(0, 10))
  const [ket, setKet] = useState('')

  const [qInduk, setQInduk] = useState('')
  const [hasilInduk, setHasilInduk] = useState<IndukPecah[]>([])
  const [induk, setInduk] = useState<IndukPecah | null>(null)
  const [basis, setBasis] = useState<BasisPecah | null>(null)
  const [basisErr, setBasisErr] = useState('')
  const [basisLoading, setBasisLoading] = useState(false)

  const [pieces, setPieces] = useState<Pecahan[]>([{ key: newKey(), jumlah: '1', nilai: '' }, { key: newKey(), jumlah: '1', nilai: '' }])
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  // Basis alokasi induk: state engine di semester SEBELUM cutover (dari tgl dok).
  useEffect(() => {
    if (!induk) { setBasis(null); setBasisErr(''); return }
    ;(async () => {
      setBasisLoading(true); setBasisErr(''); setBasis(null)
      const cutover = periodeDariTanggal(tgl)
      const basisPeriode = formatPeriode(previousPeriode(parsePeriode(cutover)))
      const { data } = await supabase.from('penyusutan_semester')
        .select('nilai_buku_akhir,akumulasi,sisa_semester,masa_manfaat_tahun')
        .eq('aset_id', induk.id).eq('periode', basisPeriode).maybeSingle()
      if (data) {
        const d = data as { nilai_buku_akhir: number; akumulasi: number; sisa_semester: number; masa_manfaat_tahun: number | null }
        setBasis({ nilai_buku: d.nilai_buku_akhir, akumulasi: d.akumulasi, sisa_smt: d.sisa_semester, masa_tahun: d.masa_manfaat_tahun, disusutkan: true })
      } else if (perlakuanKode(induk.kode) === 'tidak') {
        // Non-disusutkan (mis. ATL 1.3.5): tak ada baris engine — basis = nilai murni.
        setBasis({ nilai_buku: induk.nilai_perolehan, akumulasi: 0, sisa_smt: 0, masa_tahun: null, disusutkan: false })
      } else {
        setBasisErr(`Belum ada data penyusutan induk untuk periode ${basisPeriode}. Jalankan engine dulu untuk periode itu, atau pilih tanggal dokumen di semester berikutnya.`)
      }
      setBasisLoading(false)
    })()
  }, [induk, tgl]) // eslint-disable-line react-hooks/exhaustive-deps

  async function cariInduk() {
    if (!qInduk.trim()) return
    const { data } = await supabase.from('aset')
      .select('id,nibar,kode,nama_barang,nilai_perolehan,jumlah,tgl_perolehan,cara_perolehan')
      .eq('status', 'aktif').eq('skpd_id', skpdId)
      .or(`nibar.ilike.%${qInduk}%,nama_barang.ilike.%${qInduk}%,kode.ilike.%${qInduk}%`)
      .limit(15)
    // Tanah (1.3.1) & KDP (1.3.6) dikecualikan — punya alur sendiri (GIS BMD / Konstruksi).
    const rows = ((data as IndukPecah[]) || []).filter(r => !['1.3.1', '1.3.6'].includes(kodeLevel3(r.kode)))
    setHasilInduk(rows)
  }

  function setPiece(key: string, patch: Partial<Pecahan>) {
    setPieces(prev => prev.map(p => p.key === key ? { ...p, ...patch } : p))
  }
  function addPiece() { setPieces(prev => [...prev, { key: newKey(), jumlah: '1', nilai: '' }]) }
  function removePiece(key: string) { setPieces(prev => prev.length <= 2 ? prev : prev.filter(p => p.key !== key)) }

  // Alokasi proporsional by nilai; sisa pembulatan (NB/akumulasi) diserap di
  // pecahan TERAKHIR supaya total kekal persis.
  const alokasi = (() => {
    if (!induk || !basis) return [] as { np: number; nb: number; ak: number; beban: number; valid: boolean }[]
    const totalNP = Math.round(induk.nilai_perolehan)
    let accNB = 0, accAk = 0
    return pieces.map((p, i) => {
      const jumlah = parseInt(p.jumlah, 10)
      const np = Math.round(parseFloat(p.nilai))
      const valid = Number.isFinite(jumlah) && jumlah >= 1 && Number.isFinite(np) && np > 0
      const prop = totalNP > 0 && Number.isFinite(np) ? np / totalNP : 0
      const last = i === pieces.length - 1
      const nb = last ? basis.nilai_buku - accNB : Math.round(prop * basis.nilai_buku)
      const ak = last ? basis.akumulasi - accAk : Math.round(prop * basis.akumulasi)
      accNB += nb; accAk += ak
      const beban = basis.sisa_smt > 0 ? Math.round(nb / basis.sisa_smt) : 0
      return { np: Number.isFinite(np) ? np : 0, nb, ak, beban, valid }
    })
  })()

  const totalNP = induk ? Math.round(induk.nilai_perolehan) : 0
  const sumNP = alokasi.reduce((s, a) => s + a.np, 0)
  const balance = induk != null && sumNP === totalNP
  const semuaValid = alokasi.length >= 2 && alokasi.every(a => a.valid)

  async function simpan() {
    setErr('')
    if (!noSk.trim()) { setErr('No. Dokumen Pemecahan wajib diisi.'); return }
    if (!induk) { setErr('Pilih barang induk yang dipecah.'); return }
    if (basisErr) { setErr(basisErr); return }
    if (!basis) { setErr('Basis alokasi belum termuat. Tunggu sebentar / cek tanggal dokumen.'); return }
    if (pieces.length < 2) { setErr('Minimal 2 pecahan.'); return }
    if (!semuaValid) { setErr('Tiap pecahan wajib: jumlah ≥ 1 dan nilai perolehan > 0.'); return }
    if (!balance) { setErr(`Total nilai pecahan (${formatRupiah(sumNP)}) harus SAMA dengan nilai perolehan induk (${formatRupiah(totalNP)}). Selisih ${formatRupiah(sumNP - totalNP)}.`); return }

    setSaving(true)
    // 1. Header jurnal pemecahan (kategori 'koreksi', jenis 'pemecahan').
    const { data: hData, error: hErr } = await supabase.from('jurnal_header').insert({
      skpd_id: skpdId, kategori: 'koreksi', jenis: 'pemecahan',
      no_sk: noSk.trim(), tanggal: tgl, keterangan: ket.trim() || null,
    }).select('id').single()
    if (hErr || !hData) { setErr(`Gagal membuat header: ${hErr?.message}`); setSaving(false); return }
    const headerId = (hData as { id: string }).id
    const abort = async (m: string) => { setErr(m); await supabase.from('jurnal_header').delete().eq('id', headerId); setSaving(false) }

    // 2. Ambil spesifikasi induk (utk diwariskan ke pecahan) + kode lokasi SKPD (NIBAR).
    const { data: indukFull } = await supabase.from('aset')
      .select(`nama_barang,merek_tipe,satuan,uraian_barang,foto_paths,${ASET_FIELD_COLS.join(',')}`).eq('id', induk.id).single()
    const { data: skpdRow, error: skpdErr } = await supabase.from('admin_skpd').select('kode_skpd').eq('id', skpdId).single()
    if (skpdErr || !(skpdRow as { kode_skpd?: string } | null)?.kode_skpd) { await abort(`Gagal ambil kode lokasi SKPD utk NIBAR: ${skpdErr?.message || 'kode_skpd kosong'}`); return }
    const kodeSkpd = (skpdRow as { kode_skpd: string }).kode_skpd

    // 3. Intra/ekstra per pecahan (by nilai vs batas kapitalisasi) + generate NIBAR.
    const batas = (await fetchBatasKapitalisasi(supabase, [induk.kode])).get(induk.kode)
    const tahun = (induk.tgl_perolehan || tgl).slice(0, 4)
    const nibarItems = alokasi.map((a, i) => ({ key: String(i), kode: induk.kode, intraEkstra: klasifikasiKomptabel(a.np, batas), tahun }))
    const nibarMap = await generateNibars(supabase, nibarItems, kodeSkpd)

    // 4. Buat aset pecahan — status 'draft' (tersembunyi) sampai commit di langkah 7.
    const spec: Record<string, unknown> = {}
    if (indukFull) for (const k of ['nama_barang', 'merek_tipe', 'satuan', 'uraian_barang', ...ASET_FIELD_COLS]) {
      const v = (indukFull as Record<string, unknown>)[k]; if (v != null) spec[k] = v
    }
    const foto = (indukFull as { foto_paths?: string[] } | null)?.foto_paths || []
    const asetRows: Record<string, unknown>[] = alokasi.map((a, i) => {
      const jumlah = parseInt(pieces[i].jumlah, 10)
      return {
        ...spec,
        nibar: nibarMap.get(String(i)) || null, kode: induk.kode, jumlah,
        harga_satuan: a.np / Math.max(1, jumlah), nilai_perolehan: a.np,
        tgl_perolehan: induk.tgl_perolehan, skpd_id: skpdId,
        intra_ekstra: klasifikasiKomptabel(a.np, batas),
        cara_perolehan: induk.cara_perolehan || 'pemecahan', foto_paths: foto, status: 'draft',
      }
    })
    const { data: inserted, error: insErr } = await supabase.from('aset').insert(asetRows).select('id')
    if (insErr || !inserted) { await abort(`Gagal membuat pecahan: ${insErr?.message}`); return }
    const pieceIds = (inserted as { id: string }[]).map(r => r.id)

    // 5. Seed pemecahan_masuk per pecahan (induk MASIH aktif → belum ada risiko double).
    const masaSmt = basis.masa_tahun ? Math.round(basis.masa_tahun * 2) : 0
    for (let i = 0; i < alokasi.length; i++) {
      const a = alokasi[i]
      const { error } = await catatTransaksi(supabase, {
        asetId: pieceIds[i], jenis: 'pemecahan_masuk', tanggal: tgl, nilai: a.np, headerId,
        payload: {
          nilai_buku_awal: a.nb, akumulasi: a.ak, sisa_masa_manfaat_smt: basis.sisa_smt,
          masa_manfaat_smt: masaSmt, beban_per_smt: a.beban, induk_aset_id: induk.id, induk_nibar: induk.nibar,
        },
        keterangan: `Pecahan dari ${induk.nibar || induk.nama_barang || 'induk'} (${noSk.trim()})`,
      })
      if (error) {
        // Pecahan yg terlanjur berledger dibiarkan (draft → tersembunyi). Induk masih
        // aktif → nilai tetap utuh, TIDAK double. Bisa dituntaskan lewat Batal Pemecahan.
        setErr(`Gagal mencatat pecahan ke-${i + 1}: ${error}. Induk tetap utuh; buka jurnal ini lalu klik Batal Pemecahan untuk membersihkan.`)
        setSaving(false); return
      }
    }

    // 6. Retire induk (pemecahan_keluar) — induk hilang dari laporan sejak periode ini.
    const { error: keluarErr } = await catatTransaksi(supabase, {
      asetId: induk.id, jenis: 'pemecahan_keluar', tanggal: tgl, nilai: induk.nilai_perolehan, headerId,
      payload: { jumlah_pecahan: alokasi.length, pecahan_ids: pieceIds, pecahan_nibars: alokasi.map((_, i) => nibarMap.get(String(i)) || null) },
      keterangan: `Dipecah jadi ${alokasi.length} pecahan (${noSk.trim()})`,
    })
    if (keluarErr) { setErr(`Gagal me-retire induk: ${keluarErr}. Buka jurnal ini lalu klik Batal Pemecahan untuk membersihkan.`); setSaving(false); return }

    // 7. Commit: pecahan draft → aktif.
    const { error: flipErr } = await supabase.from('aset').update({ status: 'aktif' }).in('id', pieceIds)
    if (flipErr) { setErr(`Pemecahan hampir selesai tapi aktivasi pecahan gagal: ${flipErr.message}. Induk sudah di-retire — hubungi admin untuk mengaktifkan pecahan, atau Batal Pemecahan lalu ulangi.`); setSaving(false); return }

    setSaving(false)
    onSaved(alokasi.length, noSk.trim())
  }

  return (
    <div className="space-y-4">
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-800">Pemecahan Barang — {skpdNama}</h2>
          <button className="btn-secondary text-xs" onClick={onCancel}>← Kembali</button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">No. Dokumen Pemecahan</label>
            <input className="select-filter w-full" value={noSk} onChange={e => setNoSk(e.target.value)} placeholder="mis. 030/123/418.xx/2026" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Tanggal Dokumen</label>
            <input type="date" className="select-filter w-full" min={dateBounds.min} max={dateBounds.max} value={tgl} onChange={e => setTgl(e.target.value)} />
            <p className="text-xs text-gray-400 mt-1">Periode efektif: {periodeDariTanggal(tgl)}</p>
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs text-gray-500 mb-1">Keterangan / Justifikasi</label>
            <input className="select-filter w-full" value={ket} onChange={e => setKet(e.target.value)} />
          </div>
        </div>
      </div>

      <div className="card p-5">
        <h2 className="text-base font-semibold text-gray-800 mb-3">Barang Induk (yang Dipecah)</h2>
        {induk ? (
          <div className="flex items-start justify-between gap-4 border border-teal/30 bg-teal/5 rounded-lg p-3">
            <div className="text-sm">
              <p className="font-medium text-gray-800">{induk.nama_barang || '-'}</p>
              <p className="text-xs text-gray-500 mt-0.5">{induk.nibar || '-'} · {induk.kode} · Jumlah {induk.jumlah}</p>
              <p className="text-xs text-gray-500 mt-0.5">Nilai perolehan: <span className="font-medium">{formatRupiah(induk.nilai_perolehan)}</span></p>
              {basisLoading ? <p className="text-xs text-gray-400 mt-1">Memuat basis alokasi…</p>
                : basisErr ? <p className="text-xs text-red-600 mt-1">{basisErr}</p>
                : basis ? (
                  <p className="text-xs text-gray-500 mt-1">
                    Basis (akhir {formatPeriode(previousPeriode(parsePeriode(periodeDariTanggal(tgl))))}):
                    nilai buku {formatRupiah(basis.nilai_buku)} · akumulasi {formatRupiah(basis.akumulasi)} · sisa {basis.sisa_smt} smt
                    {!basis.disusutkan && ' (tidak disusutkan)'}
                  </p>
                ) : null}
            </div>
            <button className="text-xs text-gray-500 hover:text-red-600" onClick={() => { setInduk(null); setBasis(null); setBasisErr('') }}>Ganti</button>
          </div>
        ) : (
          <div>
            <div className="flex gap-2">
              <input className="select-filter flex-1" value={qInduk} onChange={e => setQInduk(e.target.value)}
                placeholder="Cari induk: NIBAR / nama / kode…"
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); cariInduk() } }} />
              <button type="button" className="btn-secondary" onClick={cariInduk}>Cari</button>
            </div>
            <p className="text-xs text-gray-400 mt-1">Tanah &amp; KDP dikecualikan (dikelola di GIS BMD / Konstruksi).</p>
            {hasilInduk.length > 0 && (
              <div className="mt-2 border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-56 overflow-y-auto">
                {hasilInduk.map(k => (
                  <button key={k.id} type="button" onClick={() => { setInduk(k); setHasilInduk([]); setQInduk('') }}
                    className="w-full text-left px-3 py-2 hover:bg-gray-50 text-xs">
                    <span className="font-medium text-gray-800">{k.nama_barang || '-'}</span>
                    <span className="text-gray-400"> — {k.nibar || '-'} · {k.kode} · {formatRupiah(k.nilai_perolehan)} · jml {k.jumlah}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {induk && basis && (
        <div className="card p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold text-gray-800">Pecahan &amp; Alokasi</h2>
            <button type="button" className="btn-secondary text-xs" onClick={addPiece}>+ Tambah Pecahan</button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="table-th w-12 text-center">#</th>
                  <th className="table-th w-24 text-center">Jumlah</th>
                  <th className="table-th text-right w-44">Nilai Perolehan</th>
                  <th className="table-th text-right">Nilai Buku</th>
                  <th className="table-th text-right">Akumulasi</th>
                  <th className="table-th text-right">Beban/Smt</th>
                  <th className="table-th w-10 text-center"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {pieces.map((p, i) => {
                  const a = alokasi[i]
                  return (
                    <tr key={p.key}>
                      <td className="table-td text-center text-xs text-gray-400">{i + 1}</td>
                      <td className="table-td text-center">
                        <input type="number" min="1" step="1" className="select-filter w-full text-center"
                          value={p.jumlah} onChange={e => setPiece(p.key, { jumlah: e.target.value })} />
                      </td>
                      <td className="table-td text-right">
                        <input type="number" min="0" step="1" className="select-filter w-full text-right"
                          value={p.nilai} placeholder="0" onChange={e => setPiece(p.key, { nilai: e.target.value })} />
                      </td>
                      <td className="table-td text-right text-xs text-gray-600">{a ? formatRupiah(a.nb) : '-'}</td>
                      <td className="table-td text-right text-xs text-gray-600">{a ? formatRupiah(a.ak) : '-'}</td>
                      <td className="table-td text-right text-xs text-gray-600">{a ? formatRupiah(a.beban) : '-'}</td>
                      <td className="table-td text-center">
                        <button type="button" disabled={pieces.length <= 2} onClick={() => removePiece(p.key)}
                          className="text-red-500 hover:text-red-700 disabled:opacity-30 disabled:cursor-not-allowed">×</button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className={`border-t border-gray-200 ${balance ? '' : 'bg-red-50'}`}>
                  <td className="table-td text-xs font-medium" colSpan={2}>Total</td>
                  <td className={`table-td text-right text-xs font-semibold ${balance ? 'text-gray-800' : 'text-red-700'}`}>{formatRupiah(sumNP)}</td>
                  <td className="table-td text-right text-xs text-gray-500" colSpan={3}>Induk: {formatRupiah(totalNP)}</td>
                  <td className="table-td"></td>
                </tr>
              </tfoot>
            </table>
          </div>
          {!balance && <p className="mt-2 text-xs text-red-600">Total nilai pecahan harus sama dengan nilai perolehan induk. Selisih {formatRupiah(sumNP - totalNP)}.</p>}
          <p className="mt-2 text-xs text-gray-400">Pecahan mewarisi spesifikasi &amp; foto induk sebagai titik awal (bisa diedit di Daftar Barang). NIBAR digenerate baru.</p>
        </div>
      )}

      {err && <p className="text-sm text-red-600">{err}</p>}
      <div className="flex items-center justify-end gap-2">
        <button className="btn-secondary" onClick={onCancel}>Batal</button>
        <button className="btn-primary" onClick={simpan}
          disabled={saving || !induk || !basis || !!basisErr || !semuaValid || !balance}>
          {saving ? 'Menyimpan…' : `Pecah jadi ${pieces.length} Barang`}
        </button>
      </div>
    </div>
  )
}

