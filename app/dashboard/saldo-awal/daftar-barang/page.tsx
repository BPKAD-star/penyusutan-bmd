'use client'
// Saldo Awal → Daftar Barang Awal. Gabungan Daftar Barang + Penyusutan pada posisi
// saldo awal 2026 (= saldo akhir 2025), sumber saldo_awal_2026 (angka penyusutan
// baseline: masa manfaat, beban/smt, akumulasi 2025, nilai buku awal, sisa).
// Urutan: SKPD · Kode · Nama(+NIBAR) · Komptabel · Tgl · Masa Manfaat · Nilai ·
// Beban · Akumulasi · Nilai Buku · Sisa · Keterangan.
//
// Koreksi SPESIFIKASI (bukan angka) bisa dilakukan langsung di sini — centang
// barang → "Edit Spesifikasi". Angkanya beku & dikunci di DB (migrasi
// 20260728_01: GRANT per-kolom + trigger). Simpan menulis ke DUA tabel
// sekaligus: snapshot `aset_awal_2026` + kolom yang sama di register `aset`
// (dicocokkan NIBAR), keduanya UPDATE biasa TANPA event ledger — spesifikasi
// itu data deskriptif, bukan peristiwa akuntansi (pola sama dgn KIR). Yang
// butuh jejak audit + tombol Batal tetap lewat Pembukuan → Koreksi.
//
// HANYA untuk barang yang BELUM BERGERAK: aset yang pernah kena koreksi
// spesifikasi, reklas kode/golongan, atau pindah SKPD ditandai 🔒 dan centangnya
// mati — koreksinya wajib lewat menu Koreksi. Penegaknya trigger DB (migrasi
// 20260728_01 bagian 3); 🔒 di sini cuma biar operator tak klik lalu kena error.
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { exportToExcel } from '@/lib/export'
import { GOLONGAN_REKAP, kodeLevel3 } from '@/lib/bmd'
import { koreksiFieldKeys, allSameGolongan, ASET_NUM_COLS } from '@/lib/asetFields'
import SkpdCombobox, { type SkpdSelection as OrgSelection } from '@/components/SkpdCombobox'
import KomptabelRadio from '@/components/KomptabelRadio'
import EditSpesifikasiModal from '@/components/pengelolaan/EditSpesifikasiModal'
import { useIsViewer } from '@/components/useIsViewer'

const PAGE_SIZE = 50

type Row = {
  nibar: string; kode: string; nama_barang: string; skpd_id: number
  intra_ekstra: string | null; tgl_perolehan: string | null; nilai_perolehan: number
  akumulasi_2025: number; nilai_buku_awal: number; sisa_masa_manfaat_smt: number
  masa_manfaat_smt: number | null; beban_penyusutan_per_smt: number | null
  foto_paths: string[] | null
}
type Applied = { org: OrgSelection; golongan: string; komptabel: string; search: string }

const COLS = 'nibar,kode,nama_barang,skpd_id,intra_ekstra,tgl_perolehan,nilai_perolehan,akumulasi_2025,sisa_masa_manfaat_smt,nilai_buku_awal,masa_manfaat_smt,beban_penyusutan_per_smt,foto_paths'

const angka = (v: number | null | undefined) =>
  v == null ? '-' : new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(v)
const golLabel = (kode: string) => GOLONGAN_REKAP.find(g => g.kode === kodeLevel3(kode))?.uraian || kodeLevel3(kode)
const newKey = () => Math.random().toString(36).slice(2)

export default function Page() {
  const supabase = createClient()
  const isViewer = useIsViewer()
  const [org, setOrg] = useState<OrgSelection>({ skpdId: null, descendantIds: null })
  const [golongan, setGolongan] = useState('')
  const [komptabel, setKomptabel] = useState('')
  const [search, setSearch] = useState('')
  const [applied, setApplied] = useState<Applied | null>(null)
  const [rows, setRows] = useState<Row[]>([])
  const [ketMap, setKetMap] = useState<Record<string, string>>({})
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [skpdNama, setSkpdNama] = useState<Record<number, string>>({})
  // ── Koreksi spesifikasi: centang barang (multi) → popup EditSpesifikasiModal ──
  const [sel, setSel] = useState<Record<string, Row>>({}) // key = NIBAR
  const [spekOpen, setSpekOpen] = useState(false)
  const [spekPrefix, setSpekPrefix] = useState('')
  const [spekInitFields, setSpekInitFields] = useState<Record<string, string>>({})
  const [spekInitFoto, setSpekInitFoto] = useState<string[]>([])
  const [spekMsg, setSpekMsg] = useState('')
  const [spekErr, setSpekErr] = useState('')
  const [spekSaving, setSpekSaving] = useState(false)
  // NIBAR yang TERKUNCI dari pintu ini: asetnya pernah kena transaksi yang
  // menyentuh spesifikasi/golongan/SKPD → koreksinya wajib lewat menu Koreksi
  // (lihat migrasi 20260728_01 bagian 3). Dihitung server-side per halaman.
  const [terkunci, setTerkunci] = useState<Set<string>>(new Set())

  useEffect(() => {
    (async () => {
      const map: Record<number, string> = {}
      for (let from = 0; ; from += 1000) {
        const { data } = await supabase.from('admin_skpd').select('id,nama').range(from, from + 999)
        if (!data || data.length === 0) break
        for (const s of data) map[s.id] = s.nama
        if (data.length < 1000) break
      }
      setSkpdNama(map)
    })()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function buildQuery(f: Applied, withCount: boolean) {
    let q = supabase.from('aset_awal_2026').select(COLS, withCount ? { count: 'exact' } : undefined)
    if (f.org.descendantIds) q = q.in('skpd_id', f.org.descendantIds)
    if (f.golongan) q = q.like('kode', `${f.golongan}.%`)
    if (f.komptabel) q = q.eq('intra_ekstra', f.komptabel)
    if (f.search) q = q.or(`nama_barang.ilike.%${f.search}%,nibar.ilike.%${f.search}%,kode.ilike.${f.search}%`)
    return q.order('nilai_perolehan', { ascending: false })
  }

  // Keterangan sengaja diambil dari register `aset` (bukan kolom keterangan di
  // snapshot) — itu versi terkini yang juga dipakai Daftar Barang.
  async function fetchKet(nibars: string[]) {
    const map: Record<string, string> = {}
    for (let i = 0; i < nibars.length; i += 300) {
      const { data } = await supabase.from('aset').select('nibar,keterangan').in('nibar', nibars.slice(i, i + 300))
      for (const a of (data || []) as { nibar: string | null; keterangan: string | null }[]) if (a.nibar && a.keterangan) map[a.nibar] = a.keterangan
    }
    return map
  }

  async function load(f: Applied, pg: number) {
    setLoading(true)
    const { data, count } = await buildQuery(f, true).range(pg * PAGE_SIZE, (pg + 1) * PAGE_SIZE - 1)
    const rs = (data as unknown as Row[]) || []
    setRows(rs)
    setTotal(count || 0)
    setKetMap(await fetchKet(rs.map(r => r.nibar)))
    setTerkunci(await fetchTerkunci(rs.map(r => r.nibar)))
    setSel({}) // seleksi lama tak lagi nyambung dgn baris yang tampil
    setLoading(false)
  }

  // Penegak sesungguhnya tetap trigger DB — ini cuma supaya operator tak klik
  // lalu kena error. Gagal RPC (mis. migrasi belum dijalankan) → set kosong,
  // tombolnya tetap hidup dan DB yang menolak.
  async function fetchTerkunci(nibars: string[]) {
    if (nibars.length === 0) return new Set<string>()
    const { data } = await supabase.rpc('fn_aset_awal_2026_terkunci_batch', { p_nibars: nibars })
    return new Set(((data || []) as { nibar: string }[]).map(d => d.nibar))
  }

  function tampilkan() {
    const f: Applied = { org, golongan, komptabel, search }
    setApplied(f); setPage(0); load(f, 0)
  }
  function goPage(pg: number) { if (applied) { setPage(pg); load(applied, pg) } }

  // ── Koreksi spesifikasi ───────────────────────────────────────────────────
  const selList = Object.values(sel)
  const selSameGol = allSameGolongan(selList.map(r => r.kode))

  function toggleSel(r: Row) {
    if (terkunci.has(r.nibar)) return
    setSel(prev => {
      const next = { ...prev }
      if (next[r.nibar]) delete next[r.nibar]; else next[r.nibar] = r
      return next
    })
    setSpekMsg(''); setSpekErr('')
  }

  // Buka popup: 1 barang → prefill nilai sekarang (dari snapshot, itu yang
  // ditampilkan halaman ini); banyak barang → kosong (isi = diterapkan ke semua).
  async function openSpek() {
    if (selList.length === 0 || !selSameGol) return
    setSpekMsg(''); setSpekErr('')
    const single = selList.length === 1
    setSpekPrefix(`draft/saldo-awal-spek/${single ? selList[0].nibar : newKey()}`)
    if (single) {
      const keys = koreksiFieldKeys(selList[0].kode)
      const { data } = await supabase.from('aset_awal_2026')
        .select([...keys, 'foto_paths'].join(',')).eq('nibar', selList[0].nibar).single()
      const row = (data || {}) as Record<string, unknown>
      const f: Record<string, string> = {}
      for (const k of keys) { const v = row[k]; if (v != null) f[k] = String(v) }
      setSpekInitFields(f)
      setSpekInitFoto(Array.isArray(row.foto_paths) ? (row.foto_paths as string[]) : [])
    } else {
      setSpekInitFields({}); setSpekInitFoto([])
    }
    setSpekOpen(true)
  }

  // Commit langsung (halaman ini tak punya kartu jurnal — tak ada tombol Simpan
  // terpisah spt menu Koreksi). Menulis ke snapshot + register `aset` by NIBAR.
  async function simpanSpek(fields: Record<string, string>, foto: { replace?: string[]; append?: string[] }) {
    const list = selList
    const single = list.length === 1
    // Modal ditutup DULU: pesan hasil/error tampil di strip halaman, yang bakal
    // ketutup overlay modal (z-50) kalau modalnya dibiarkan terbuka.
    setSpekOpen(false); setSpekMsg(''); setSpekErr('')
    // Single: modal prefill nilai sekarang → simpan HANYA yang berubah.
    // Bulk: initial kosong → semua yang diisi = perubahan, diterapkan ke semua.
    const initial = single ? spekInitFields : {}
    const base: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(fields)) {
      const val = (v ?? '').toString().trim()
      if (val === '' || val === (initial[k] ?? '').toString().trim()) continue
      if (ASET_NUM_COLS.has(k) || k === 'tahun_pengadaan') { const n = Number(val); if (Number.isFinite(n)) base[k] = n }
      else base[k] = val
    }
    const fotoReplace = single ? (foto.replace || []) : null
    const fotoAppend = !single ? (foto.append || []) : null
    const fotoBerubah = single ? JSON.stringify(fotoReplace) !== JSON.stringify(spekInitFoto) : (fotoAppend?.length ?? 0) > 0
    if (Object.keys(base).length === 0 && !fotoBerubah) { setSpekErr('Tidak ada field yang diubah — centangannya masih utuh, klik "Edit Spesifikasi" lagi.'); return }
    setSpekSaving(true)

    // Foto di `aset` bisa beda dari snapshot (mis. ditambah lewat menu Koreksi
    // setelah baseline dibekukan) → append relatif ke daftar masing-masing tabel.
    const nibars = list.map(r => r.nibar)
    const fotoAset = new Map<string, string[]>()
    for (let i = 0; i < nibars.length; i += 300) {
      const { data } = await supabase.from('aset').select('nibar,foto_paths').in('nibar', nibars.slice(i, i + 300))
      for (const a of (data || []) as { nibar: string | null; foto_paths: string[] | null }[]) {
        if (a.nibar) fotoAset.set(a.nibar, a.foto_paths || [])
      }
    }

    let okSnapshot = 0, okAset = 0
    for (const r of list) {
      const patchSnapshot: Record<string, unknown> = { ...base }
      const patchAset: Record<string, unknown> = { ...base }
      if (fotoBerubah) {
        if (single) { patchSnapshot.foto_paths = fotoReplace; patchAset.foto_paths = fotoReplace }
        else {
          patchSnapshot.foto_paths = [...(r.foto_paths || []), ...(fotoAppend || [])]
          patchAset.foto_paths = [...(fotoAset.get(r.nibar) || []), ...(fotoAppend || [])]
        }
      }
      const nama = r.nama_barang || r.nibar
      const sudah = okSnapshot ? ` (${okSnapshot} barang sebelumnya sudah tersimpan)` : ''
      const gagal = (pesan: string) => { setSpekSaving(false); setSpekErr(pesan); if (applied) load(applied, page) }
      // `.select()` WAJIB: UPDATE yang ditolak RLS tidak melempar error, cuma
      // mengembalikan 0 baris — tanpa ini kegagalan (mis. migrasi 20260728_01
      // belum dijalankan, policy sa_update belum ada) dilaporkan sbg "berhasil".
      const { data: d1, error: e1 } = await supabase.from('aset_awal_2026').update(patchSnapshot).eq('nibar', r.nibar).select('nibar')
      if (e1) { gagal(`Gagal menyimpan "${nama}": ${e1.message}${sudah}`); return }
      if (!d1 || d1.length === 0) { gagal(`Perubahan "${nama}" ditolak database — barang di luar wewenang SKPD-mu, atau migrasi 20260728_01 belum dijalankan.${sudah}`); return }
      okSnapshot++
      // Register `aset`: barang baseline yang sudah dihapus/tak pernah termigrasi
      // bisa saja tak punya baris pasangan — bukan error, cuma dilaporkan.
      if (fotoAset.has(r.nibar)) {
        const { data: d2, error: e2 } = await supabase.from('aset').update(patchAset).eq('nibar', r.nibar).select('nibar')
        if (e2) { gagal(`Saldo awal "${nama}" tersimpan, tapi register aset gagal: ${e2.message}`); return }
        if (d2 && d2.length > 0) okAset++
      }
    }

    setSpekSaving(false); setSel({})
    setSpekMsg(okAset === okSnapshot
      ? `${okSnapshot} barang diperbarui (saldo awal + register aset).`
      : `${okSnapshot} barang diperbarui di saldo awal; ${okAset} di antaranya punya pasangan di register aset (sisanya tidak ada / di luar wewenangmu).`)
    if (applied) load(applied, page)
  }

  async function handleExport() {
    if (!applied) return
    setExporting(true)
    const all: Row[] = []
    for (let from = 0; ; from += 1000) {
      const { data } = await buildQuery(applied, false).range(from, from + 999)
      if (!data || data.length === 0) break
      all.push(...(data as unknown as Row[]))
      if (data.length < 1000) break
    }
    const ket = await fetchKet(all.map(r => r.nibar))
    exportToExcel(all.map(r => ({
      'SKPD': skpdNama[r.skpd_id] || '', 'Kode Barang': r.kode, 'Nama Barang': r.nama_barang, 'NIBAR': r.nibar,
      'Komptabel': r.intra_ekstra || '', 'Tgl Perolehan': r.tgl_perolehan || '',
      'Masa Manfaat (Smt)': r.masa_manfaat_smt ?? '', 'Nilai Perolehan': r.nilai_perolehan,
      'Beban / Smt': r.beban_penyusutan_per_smt ?? '', 'Akumulasi 2025': r.akumulasi_2025,
      'Nilai Buku Awal': r.nilai_buku_awal, 'Sisa (Smt)': r.sisa_masa_manfaat_smt, 'Keterangan': ket[r.nibar] || '',
    })), 'Daftar_Barang_Awal_2026', 'Daftar Barang Awal')
    setExporting(false)
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)
  const kolom = isViewer ? 12 : 13

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Daftar Barang Awal</h1>
        <p className="text-gray-500 text-sm mt-1">Daftar aset + penyusutan pada posisi saldo awal 2026 (= saldo akhir 2025).</p>
      </div>

      <div className="card p-5 mb-4">
        <h2 className="text-base font-semibold text-gray-800 mb-4">Filter data</h2>
        <div className="space-y-3 max-w-3xl">
          <div className="flex items-center gap-3">
            <label className="w-40 text-sm text-gray-600 text-right flex-shrink-0">SKPD / Lokasi :</label>
            <SkpdCombobox lockToOperator onChangeSelection={setOrg} allowClear placeholder="Semua — atau ketik SKPD / Sub OPD / Lokasi..." />
          </div>
          <div className="flex items-center gap-3">
            <label className="w-40 text-sm text-gray-600 text-right flex-shrink-0">Jenis Aset :</label>
            <select className="select-filter flex-1" value={golongan} onChange={e => setGolongan(e.target.value)}>
              <option value="">Semua Jenis Aset</option>
              {GOLONGAN_REKAP.map(g => <option key={g.kode} value={g.kode}>{g.kode} — {g.uraian}</option>)}
            </select>
          </div>
          <KomptabelRadio value={komptabel} onChange={setKomptabel} />
          <div className="flex items-center gap-3">
            <label className="w-40 text-sm text-gray-600 text-right flex-shrink-0">Cari :</label>
            <input className="select-filter flex-1" placeholder="Nama barang / NIBAR / kode..."
              value={search} onChange={e => setSearch(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') tampilkan() }} />
          </div>
          <div className="flex items-center gap-3">
            <span className="w-40 flex-shrink-0" />
            <button className="btn-primary" onClick={tampilkan} disabled={loading}>{loading ? 'Memuat...' : 'Tampilkan'}</button>
          </div>
        </div>
      </div>

      {applied === null ? (
        <div className="card p-12 text-center text-gray-400 text-sm">
          Atur filter lalu klik <span className="font-medium text-gray-600">Tampilkan</span>.
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <span className="text-sm text-gray-500">
              {total.toLocaleString('id-ID')} barang
              {selList.length > 0 && <span className="text-teal font-medium"> · {selList.length} dicentang</span>}
            </span>
            <div className="flex items-center gap-3">
              {!isViewer && (
                <button onClick={openSpek} disabled={selList.length === 0 || !selSameGol || spekSaving} className="btn-secondary text-xs">
                  {spekSaving ? 'Menyimpan...' : '✎ Edit Spesifikasi...'}
                </button>
              )}
              <span className="text-sm text-gray-500">Hal. {page + 1} / {totalPages || 1}</span>
              <button onClick={handleExport} disabled={exporting || total === 0} className="btn-secondary text-xs">
                {exporting ? 'Mengekspor...' : 'Export Excel'}
              </button>
            </div>
          </div>
          {!isViewer && (selList.length > 0 || spekMsg || spekErr || spekSaving || terkunci.size > 0) && (
            <div className="px-4 py-2 border-b border-gray-100 space-y-1">
              {spekSaving && <p className="text-xs text-gray-500">Menyimpan koreksi spesifikasi...</p>}
              {terkunci.size > 0 && (
                <p className="text-xs text-gray-500">
                  🔒 {terkunci.size} barang di halaman ini terkunci — sudah punya transaksi yang mengubah spesifikasi,
                  golongan, atau SKPD-nya. Koreksinya lewat Pembukuan → Koreksi → Spesifikasi Barang, biar ada jejak
                  ledger & bisa dibatalkan.
                </p>
              )}
              {selList.length > 0 && !selSameGol && (
                <p className="text-xs text-amber-600">Barang beda jenis aset — pisahkan per jenis, field spesifikasinya beda.</p>
              )}
              {selList.length > 0 && selSameGol && (
                <p className="text-xs text-gray-500">
                  Koreksi spesifikasi ditulis ke saldo awal <span className="font-medium">dan</span> register aset (dicocokkan NIBAR).
                  Angka penyusutan tidak ikut berubah. Tanpa jejak ledger — kalau butuh bisa dibatalkan, pakai Pembukuan → Koreksi.
                </p>
              )}
              {spekMsg && <p className="text-xs text-emerald-600">{spekMsg}</p>}
              {spekErr && <p className="text-xs text-red-600">{spekErr}</p>}
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  {!isViewer && <th className="table-th w-8" />}
                  <th className="table-th">SKPD</th>
                  <th className="table-th">Kode Barang</th>
                  <th className="table-th">Nama Barang</th>
                  <th className="table-th text-center">Komptabel</th>
                  <th className="table-th">Tgl Perolehan</th>
                  <th className="table-th text-center">Masa Manfaat (Smt)</th>
                  <th className="table-th text-right">Nilai Perolehan</th>
                  <th className="table-th text-right">Beban / Smt</th>
                  <th className="table-th text-right">Akumulasi 2025</th>
                  <th className="table-th text-right">Nilai Buku Awal</th>
                  <th className="table-th text-center">Sisa (Smt)</th>
                  <th className="table-th">Keterangan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {loading ? (
                  <tr><td colSpan={kolom} className="table-td text-center py-12 text-gray-400">Memuat data...</td></tr>
                ) : rows.length === 0 ? (
                  <tr><td colSpan={kolom} className="table-td text-center py-12 text-gray-400">Tidak ada data untuk filter ini</td></tr>
                ) : rows.map((r, i) => (
                  <tr key={r.nibar} className={sel[r.nibar] ? 'bg-teal/5' : i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                    {!isViewer && (
                      <td className="table-td">
                        {terkunci.has(r.nibar) ? (
                          <span title="Barang ini sudah punya transaksi yang mengubah spesifikasi, golongan, atau SKPD-nya. Koreksi spesifikasinya lewat Pembukuan → Koreksi → Spesifikasi Barang."
                            className="text-gray-400 cursor-help">🔒</span>
                        ) : (
                          <input type="checkbox" checked={!!sel[r.nibar]} onChange={() => toggleSel(r)} />
                        )}
                      </td>
                    )}
                    <td className="table-td text-xs text-gray-600">{skpdNama[r.skpd_id] || '-'}</td>
                    <td className="table-td text-xs text-gray-600">{r.kode}</td>
                    <td className="table-td">
                      <p className="font-medium text-gray-800 text-xs">{r.nama_barang || '-'}</p>
                      <p className="text-gray-400 text-xs mt-0.5">{r.nibar}</p>
                    </td>
                    <td className="table-td text-center text-xs capitalize">{r.intra_ekstra || '-'}</td>
                    <td className="table-td text-xs text-gray-600">{r.tgl_perolehan || '-'}</td>
                    <td className="table-td text-center text-xs">{r.masa_manfaat_smt ?? <span className="text-gray-300">-</span>}</td>
                    <td className="table-td text-right text-xs">{angka(r.nilai_perolehan)}</td>
                    <td className="table-td text-right text-xs">{r.beban_penyusutan_per_smt != null ? angka(r.beban_penyusutan_per_smt) : <span className="text-gray-300">-</span>}</td>
                    <td className="table-td text-right text-xs">{angka(r.akumulasi_2025)}</td>
                    <td className="table-td text-right text-xs">{angka(r.nilai_buku_awal)}</td>
                    <td className="table-td text-center text-xs">{r.sisa_masa_manfaat_smt}</td>
                    <td className="table-td text-xs text-gray-600">{ketMap[r.nibar] || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
              <button className="btn-secondary" disabled={page === 0} onClick={() => goPage(page - 1)}>← Sebelumnya</button>
              <button className="btn-secondary" disabled={page >= totalPages - 1} onClick={() => goPage(page + 1)}>Berikutnya →</button>
            </div>
          )}
        </div>
      )}

      {spekOpen && selList.length > 0 && (
        <EditSpesifikasiModal
          title={selList.length === 1
            ? (selList[0].nama_barang || selList[0].nibar)
            : `${selList.length} barang — ${golLabel(selList[0].kode)}`}
          fieldKeys={koreksiFieldKeys(selList[0].kode)}
          storagePrefix={spekPrefix}
          initialFields={spekInitFields}
          initialFoto={spekInitFoto}
          single={selList.length === 1}
          onSave={simpanSpek}
          onClose={() => setSpekOpen(false)}
        />
      )}
    </div>
  )
}
