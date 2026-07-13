'use client'
// Import template Excel export e-bmd untuk satu jenis perolehan (PLAN §5A).
// Dipakai oleh 5 route: Pengadaan, Hibah, Tukar Menukar, Hasil Inventarisasi,
// Perolehan Lainnya.
//
// ALUR (sejak revisi 2026-07-13): import TIDAK menulis langsung ke ledger.
// Baris valid ditampung sbg DRAFT `jurnal_header` (approval_status='pending'),
// dikelompokkan per No. BAST/Dokumen (1 kontrak/dokumen = 1 kartu). Draft ini
// muncul sbg kartu "Menunggu Persetujuan" di menu terkait (tab Entry Manual) —
// bisa diedit/dihapus/di-approve/di-unapprove persis spt entry manual. Barang
// baru masuk aset+transaksi_bmd SAAT admin klik "Setujui" (materialize di
// Pengadaan.tsx / PerolehanManual.tsx), pakai NIBAR yang DIGENERATE OTOMATIS
// saat itu — kolom NIBAR di file Excel diabaikan (keputusan user 2026-07-13).
import { useEffect, useState } from 'react'
import * as XLSX from 'xlsx'
import { createClient } from '@/lib/supabase/client'
import { formatRupiah } from '@/lib/export'
import { kodeLevel3 } from '@/lib/bmd'

type RowImport = {
  kode: string
  nibar: string
  nama_barang: string
  spesifikasi: string
  merek_tipe: string
  jumlah: number
  satuan: string
  harga_satuan: number
  nilai: number
  tgl_perolehan: string | null
  bentuk_kontrak: string
  nama_penyedia: string
  nomor_bast: string
  keterangan: string
  valid: boolean
  masalah: string[]
}

// Draft item disimpan di jurnal_header.payload.draft_items — 1 item = 1 unit
// (kuantitas dipecah saat import, sama pola entry manual). Shape MENGIKUTI
// DraftItem di komponen konsumen: Pengadaan pakai `rekening` (tanpa tgl per
// item — approve pakai tgl BAST header); Hibah dsb pakai `tglPerolehan` per
// item (backdate diperbolehkan, di-whitelist tahun_buku saat approve).
type DraftItemBase = {
  key: string; golongan: string; kode: string; uraianBarang: string
  satuan: string; harga: string
  fields: Record<string, string>
  foto: string[]
}
type SumberPengadaan = 'kwitansi' | 'bukti_pembelian' | 'surat_pesanan' | 'spk'

const todayStr = () => new Date().toISOString().slice(0, 10)
const newKey = () => Math.random().toString(36).slice(2)

// Petakan teks "Bentuk Kontrak" e-bmd → enum sumber pengadaan (utk kolom
// jurnal_header.jenis, dipakai label & payload.sumber saat approve).
function mapSumber(bentuk: string): SumberPengadaan {
  const s = (bentuk || '').toLowerCase()
  if (s.includes('spk') || s.includes('perintah kerja')) return 'spk'
  if (s.includes('pesanan')) return 'surat_pesanan'
  if (s.includes('bukti')) return 'bukti_pembelian'
  if (s.includes('kontrak') || s.includes('perjanjian')) return 'spk'
  return 'kwitansi'
}

function normHeader(s: unknown): string {
  return String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

function excelDate(v: unknown): string | null {
  if (v == null || v === '') return null
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  if (typeof v === 'number') {
    const d = new Date(Math.round((v - 25569) * 86400 * 1000))
    return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
  }
  const s = String(v).trim()
  const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/)
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  const d = new Date(s)
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
}

export default function PerolehanImport({ jenis, label, kontrakRelevan }: {
  jenis: string
  label: string
  kontrakRelevan?: boolean
}) {
  const supabase = createClient()
  const isPengadaan = jenis === 'pengadaan'
  const [rows, setRows] = useState<RowImport[]>([])
  const [kodeUraian, setKodeUraian] = useState<Map<string, string>>(new Map())
  const [fileName, setFileName] = useState('')
  const [parsing, setParsing] = useState(false)
  const [importing, setImporting] = useState(false)
  const [msg, setMsg] = useState('')
  const [isAdmin, setIsAdmin] = useState(false)
  const [mySkpdId, setMySkpdId] = useState<number | null>(null)
  const [skpdList, setSkpdList] = useState<{ id: number; nama: string }[]>([])
  const [targetSkpd, setTargetSkpd] = useState<number | ''>('')

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: profile } = await supabase.from('admin_profiles').select('role,skpd_id').eq('id', user.id).single()
      const admin = profile?.role === 'admin'
      setIsAdmin(admin)
      setMySkpdId(profile?.skpd_id ?? null)
      if (!admin && profile?.skpd_id) setTargetSkpd(profile.skpd_id)
      const { data: skpd } = await supabase.from('admin_skpd').select('id,nama').order('nama').limit(1000)
      setSkpdList(skpd || [])
    })()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleFile(f: File) {
    setParsing(true); setMsg(''); setFileName(f.name)
    try {
      const buf = await f.arrayBuffer()
      const wb = XLSX.read(buf, { cellDates: true })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const grid: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })

      const headerIdx = grid.findIndex(r => r.some(c => normHeader(c) === 'nibar'))
      if (headerIdx < 0) throw new Error("Header 'NIBAR' tidak ditemukan — pastikan file adalah template export e-bmd.")
      const header = grid[headerIdx].map(normHeader)
      const nibarCol = header.indexOf('nibar')
      const col = (...names: string[]) => {
        for (const n of names) { const i = header.findIndex(h => h.includes(n)); if (i >= 0) return i }
        return -1
      }
      const cUraian = col('uraianbarang'), cSpes = col('spesifikasinamabarang', 'spesifikasi')
      const cMerek = col('merek', 'tipe'), cJumlah = col('jumlahbarang', 'jumlah')
      const cSatuan = col('satuanbarang', 'satuan'), cHarga = col('hargasatuan')
      const cNilai = col('totalnilaibarang', 'totalnilai'), cTgl = col('tglperolehan', 'tanggalperolehan')
      const cKontrak = col('bentukkontrak'), cPenyedia = col('namapenyedia')
      const cNomor = col('nomor'), cKet = col('keterangan')

      const parsed: RowImport[] = []
      for (const r of grid.slice(headerIdx + 1)) {
        const nibar = String(r[nibarCol] ?? '').trim()
        const segCells = r.slice(0, nibarCol).map(c => String(c ?? '').trim()).filter(Boolean)
        let kode = ''
        if (segCells.length > 1) kode = segCells.join('.')
        else if (segCells.length === 1) kode = segCells[0].split(/[^0-9]+/).filter(Boolean).join('.')
        if (!kode && !nibar) continue
        const num = (i: number) => {
          const v = r[i]; if (typeof v === 'number') return v
          const f = parseFloat(String(v ?? '').replace(/[^0-9.-]/g, '')); return isNaN(f) ? 0 : f
        }
        const str = (i: number) => (i >= 0 ? String(r[i] ?? '').trim() : '')
        parsed.push({
          kode, nibar,
          nama_barang: str(cSpes) || str(cUraian),
          spesifikasi: str(cSpes), merek_tipe: str(cMerek),
          jumlah: cJumlah >= 0 ? num(cJumlah) || 1 : 1,
          satuan: str(cSatuan),
          harga_satuan: cHarga >= 0 ? num(cHarga) : 0,
          nilai: cNilai >= 0 ? num(cNilai) : 0,
          tgl_perolehan: cTgl >= 0 ? excelDate(r[cTgl]) : null,
          bentuk_kontrak: str(cKontrak), nama_penyedia: str(cPenyedia),
          nomor_bast: str(cNomor), keterangan: str(cKet),
          valid: true, masalah: [],
        })
      }
      if (parsed.length === 0) throw new Error('Tidak ada baris data terbaca.')

      // Validasi kode + ambil uraian baku (utk aset.uraian_barang saat approve).
      const kodeSet = [...new Set(parsed.map(p => p.kode).filter(Boolean))]
      const kodeValid = new Set<string>()
      const kodeNonaktif = new Set<string>()
      const uraianMap = new Map<string, string>()
      for (let i = 0; i < kodeSet.length; i += 200) {
        const { data } = await supabase.from('admin_kodefikasi_bmd').select('kode,aktif,uraian').in('kode', kodeSet.slice(i, i + 200))
        for (const k of data || []) {
          if (k.aktif) kodeValid.add(k.kode); else kodeNonaktif.add(k.kode)
          if (k.uraian) uraianMap.set(k.kode, k.uraian)
        }
      }
      for (const p of parsed) {
        if (!p.kode) p.masalah.push('kode kosong')
        else if (kodeNonaktif.has(p.kode)) p.masalah.push('kode sudah dinonaktifkan admin')
        else if (!kodeValid.has(p.kode)) p.masalah.push('kode tidak ada di kodefikasi')
        if (p.nilai <= 0) p.masalah.push('nilai ≤ 0')
        if (!p.tgl_perolehan) p.masalah.push('tgl perolehan kosong')
        if (p.tgl_perolehan && p.tgl_perolehan > todayStr()) p.masalah.push('tgl perolehan di masa depan')
        p.valid = p.masalah.length === 0
      }
      setKodeUraian(uraianMap)
      setRows(parsed)
    } catch (e) {
      setMsg(`Error: ${e instanceof Error ? e.message : String(e)}`); setRows([])
    }
    setParsing(false)
  }

  // Tampung baris valid sbg DRAFT jurnal_header (pending), dikelompokkan per
  // No. BAST/Dokumen. TIDAK menyentuh aset/ledger — itu terjadi saat approve.
  async function handleImport() {
    if (!targetSkpd) { setMsg('Error: pilih SKPD tujuan dulu.'); return }
    const valid = rows.filter(r => r.valid)
    if (valid.length === 0) return
    setImporting(true); setMsg('')

    // Kelompokkan per No. BAST/Dokumen (1 kontrak/dokumen = 1 kartu draft).
    // Baris tanpa nomor digabung jadi satu kartu fallback per file.
    const groups = new Map<string, RowImport[]>()
    for (const r of valid) {
      const key = r.nomor_bast.trim() || `${fileName} (tanpa nomor)`
      const arr = groups.get(key) || []; arr.push(r); groups.set(key, arr)
    }

    // Hindari kartu ganda: No. Dokumen yg sudah ada (selain 'ditolak') dilewati.
    const noKeys = [...groups.keys()]
    const existing = new Set<string>()
    for (let i = 0; i < noKeys.length; i += 200) {
      const { data } = await supabase.from('jurnal_header').select('no_sk')
        .eq('kategori', jenis).eq('skpd_id', Number(targetSkpd)).neq('approval_status', 'ditolak')
        .in('no_sk', noKeys.slice(i, i + 200))
      for (const h of (data || []) as { no_sk: string }[]) existing.add(h.no_sk)
    }

    let dibuat = 0, totalBarang = 0
    const konflik: string[] = []
    const gagal: string[] = []

    for (const [noSk, grp] of groups) {
      if (existing.has(noSk)) { konflik.push(noSk); continue }

      const draftItems: (DraftItemBase & { rekening?: string; tglPerolehan?: string })[] = []
      for (const r of grp) {
        const n = Math.max(1, Math.floor(r.jumlah) || 1)
        const perUnit = r.jumlah > 0 ? r.nilai / r.jumlah : r.nilai
        for (let u = 0; u < n; u++) {
          const base: DraftItemBase = {
            key: newKey(), golongan: kodeLevel3(r.kode), kode: r.kode,
            uraianBarang: kodeUraian.get(r.kode) || '',
            satuan: r.satuan || '', harga: String(perUnit),
            fields: {
              nama_barang: r.nama_barang || '',
              ...(r.merek_tipe ? { merek_tipe: r.merek_tipe } : {}),
              ...(r.spesifikasi ? { spesifikasi_lainnya: r.spesifikasi } : {}),
              ...(r.keterangan ? { keterangan: r.keterangan } : {}),
            },
            foto: [],
          }
          draftItems.push(isPengadaan ? { ...base, rekening: '' } : { ...base, tglPerolehan: r.tgl_perolehan! })
        }
      }

      const tglBast = grp.find(r => r.tgl_perolehan)?.tgl_perolehan || todayStr()
      const penyedia = grp.find(r => r.nama_penyedia)?.nama_penyedia || undefined

      // Pengadaan: approve pakai tgl BAST (header) utk SEMUA barang → tanggal
      // header = tgl BAST. Hibah dsb: tgl perolehan per item (bisa backdate),
      // header cukup tanggal hari ini (di tahun terbuka, hindari guard kunci).
      const header = isPengadaan ? {
        skpd_id: Number(targetSkpd), kategori: 'pengadaan', jenis: mapSumber(grp[0].bentuk_kontrak), sub_jenis: null,
        no_sk: noSk, tanggal: tglBast, keterangan: null,
        payload: { nama_penyedia: penyedia, no_bast: noSk, tgl_bast: tglBast, dokumen_paths: [], draft_items: draftItems, sumber_import: fileName },
        approval_status: 'pending',
      } : {
        skpd_id: Number(targetSkpd), kategori: jenis, jenis: null, sub_jenis: null,
        no_sk: noSk, tanggal: todayStr(), keterangan: null,
        payload: { pihak: penyedia, dokumen_paths: [], draft_items: draftItems, sumber_import: fileName },
        approval_status: 'pending',
      }

      const { error } = await supabase.from('jurnal_header').insert(header)
      if (error) { gagal.push(`${noSk}: ${error.message}`); continue }
      dibuat++; totalBarang += draftItems.length
    }

    const parts: string[] = []
    if (dibuat > 0) parts.push(`${dibuat} draft (${totalBarang} barang) dibuat — status MENUNGGU PERSETUJUAN di menu ${label}. Buka tab "Entry Manual" untuk memeriksa & menyetujui.`)
    if (konflik.length) parts.push(`${konflik.length} No. Dokumen dilewati karena sudah ada: ${konflik.slice(0, 5).join(', ')}${konflik.length > 5 ? '…' : ''}.`)
    if (gagal.length) parts.push(`${gagal.length} gagal dibuat: ${gagal.slice(0, 3).join(' | ')}${gagal.length > 3 ? '…' : ''}.`)
    setMsg((dibuat === 0 ? 'Error: ' : '') + (parts.join(' ') || 'Tidak ada yang diproses.'))
    if (dibuat > 0) { setRows([]); setFileName('') }
    setImporting(false)
  }

  const nValid = rows.filter(r => r.valid).length
  const nGroup = new Set(rows.filter(r => r.valid).map(r => r.nomor_bast.trim() || `${fileName} (tanpa nomor)`)).size

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Import Excel — {label}</h1>
        <p className="text-gray-500 text-sm mt-1">
          Import template Excel export e-bmd. Baris valid ditampung sebagai <b>draft menunggu persetujuan</b>
          {' '}(dikelompokkan per No. BAST/Dokumen), lalu masuk Daftar Barang setelah admin menyetujuinya —
          persis alur Entry Manual. NIBAR digenerate otomatis saat disetujui (kolom NIBAR di file diabaikan).
        </p>
      </div>

      {!kontrakRelevan && (
        <div className="mb-4 p-3 bg-amber-50 text-amber-800 rounded-lg text-sm">
          Kolom kontrak/penyedia tidak wajib untuk {label} (sumber dokumen: BA hibah / BA inventarisasi / dokumen perolehan lain).
          Sementara pakai template dasar yang sama dengan Pengadaan.
        </div>
      )}

      {msg && (
        <div className={`mb-4 p-3 rounded-lg text-sm ${msg.startsWith('Error') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>{msg}</div>
      )}

      <div className="card p-4 mb-4 flex flex-wrap items-end gap-4">
        <div>
          <label className="block text-xs text-gray-500 mb-1">SKPD Penerima</label>
          {isAdmin ? (
            <select className="select-filter" value={targetSkpd} onChange={e => setTargetSkpd(e.target.value ? Number(e.target.value) : '')}>
              <option value="">— pilih SKPD —</option>
              {skpdList.map(s => <option key={s.id} value={s.id}>{s.nama}</option>)}
            </select>
          ) : (
            <p className="text-sm text-gray-700 py-2">
              {skpdList.find(s => s.id === mySkpdId)?.nama || 'SKPD belum di-set di profil — hubungi admin'}
            </p>
          )}
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">File Excel (export e-bmd)</label>
          <input type="file" accept=".xlsx,.xls" className="text-sm"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
        </div>
        {parsing && <span className="text-sm text-gray-400">Membaca file...</span>}
      </div>

      {rows.length > 0 && (
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <span className="text-sm text-gray-600">
              {rows.length} baris terbaca — <span className="text-green-600 font-medium">{nValid} valid</span>
              {rows.length - nValid > 0 && <span className="text-red-500"> · {rows.length - nValid} bermasalah</span>}
              {nValid > 0 && <span className="text-gray-400"> · akan jadi {nGroup} kartu draft</span>}
            </span>
            <button className="btn-primary" disabled={importing || nValid === 0 || !targetSkpd} onClick={handleImport}>
              {importing ? 'Memproses...' : `Buat ${nValid} Baris jadi Draft`}
            </button>
          </div>
          <div className="overflow-x-auto max-h-96 overflow-y-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-100 sticky top-0">
                <tr>
                  <th className="table-th">Status</th><th className="table-th">Kode</th><th className="table-th">No. BAST/Dok</th>
                  <th className="table-th">Nama Barang</th><th className="table-th text-right">Nilai</th><th className="table-th">Tgl Perolehan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {rows.map((r, i) => (
                  <tr key={i} className={r.valid ? '' : 'bg-red-50/50'}>
                    <td className="table-td text-xs">{r.valid ? <span className="text-green-600">OK</span> : <span className="text-red-500">{r.masalah.join(', ')}</span>}</td>
                    <td className="table-td text-xs">{r.kode}</td>
                    <td className="table-td text-xs">{r.nomor_bast || <span className="text-gray-400">(tanpa nomor)</span>}</td>
                    <td className="table-td text-xs">{r.nama_barang}</td>
                    <td className="table-td text-xs text-right">{formatRupiah(r.nilai)}</td>
                    <td className="table-td text-xs">{r.tgl_perolehan || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
