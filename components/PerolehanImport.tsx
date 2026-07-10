'use client'
// Import template Excel export e-bmd untuk satu jenis perolehan (PLAN §5A).
// Dipakai oleh 4 route: Pengadaan, Hibah, Hasil Inventarisasi, Perolehan Lainnya.
import { useEffect, useState } from 'react'
import * as XLSX from 'xlsx'
import { createClient } from '@/lib/supabase/client'
import { formatRupiah } from '@/lib/export'
import { periodeDariTanggal, fetchBatasKapitalisasi, klasifikasiKomptabel } from '@/lib/bmd'

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
  const [rows, setRows] = useState<RowImport[]>([])
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

      const kodeSet = [...new Set(parsed.map(p => p.kode).filter(Boolean))]
      const kodeValid = new Set<string>()
      const kodeNonaktif = new Set<string>()
      for (let i = 0; i < kodeSet.length; i += 200) {
        const { data } = await supabase.from('admin_kodefikasi_bmd').select('kode,aktif').in('kode', kodeSet.slice(i, i + 200))
        for (const k of data || []) { if (k.aktif) kodeValid.add(k.kode); else kodeNonaktif.add(k.kode) }
      }
      const nibarSet = [...new Set(parsed.map(p => p.nibar).filter(Boolean))]
      const nibarAda = new Set<string>()
      for (let i = 0; i < nibarSet.length; i += 200) {
        const { data } = await supabase.from('aset').select('nibar').in('nibar', nibarSet.slice(i, i + 200))
        for (const a of data || []) if (a.nibar) nibarAda.add(a.nibar)
      }
      for (const p of parsed) {
        if (!p.kode) p.masalah.push('kode kosong')
        else if (kodeNonaktif.has(p.kode)) p.masalah.push('kode sudah dinonaktifkan admin')
        else if (!kodeValid.has(p.kode)) p.masalah.push('kode tidak ada di kodefikasi')
        if (!p.nibar) p.masalah.push('NIBAR kosong')
        else if (nibarAda.has(p.nibar)) p.masalah.push('NIBAR sudah terdaftar')
        if (p.nilai <= 0) p.masalah.push('nilai ≤ 0')
        p.valid = p.masalah.length === 0
      }
      setRows(parsed)
    } catch (e) {
      setMsg(`Error: ${e instanceof Error ? e.message : String(e)}`); setRows([])
    }
    setParsing(false)
  }

  async function handleImport() {
    if (!targetSkpd) { setMsg('Error: pilih SKPD tujuan dulu.'); return }
    const valid = rows.filter(r => r.valid)
    if (valid.length === 0) return
    setImporting(true); setMsg('')
    let sukses = 0, gagal = ''
    // Klasifikasi intra/ekstrakomptabel: nilai PER UNIT (nilai/jumlah) vs
    // batas_kapitalisasi (kodefikasi_bmd) — >= batas -> intra, < batas -> ekstra.
    const batasMap = await fetchBatasKapitalisasi(supabase, valid.map(r => r.kode))
    for (let i = 0; i < valid.length; i += 100) {
      const chunk = valid.slice(i, i + 100)
      const { data: inserted, error } = await supabase.from('aset').insert(chunk.map(r => ({
        nibar: r.nibar, kode: r.kode, nama_barang: r.nama_barang,
        spesifikasi_lainnya: r.spesifikasi || null, merek_tipe: r.merek_tipe || null,
        jumlah: r.jumlah, satuan: r.satuan || null, harga_satuan: r.harga_satuan || null,
        nilai_perolehan: r.nilai, tgl_perolehan: r.tgl_perolehan,
        skpd_id: targetSkpd, cara_perolehan: jenis, keterangan: r.keterangan || null,
        intra_ekstra: klasifikasiKomptabel(r.jumlah > 0 ? r.nilai / r.jumlah : r.nilai, batasMap.get(r.kode)),
      }))).select('id,nibar')
      if (error) { gagal = `Error saat insert aset: ${error.message}`; break }
      const idByNibar = new Map((inserted || []).map(a => [a.nibar, a.id]))
      const { error: trxError } = await supabase.from('transaksi_bmd').insert(chunk
        .filter(r => idByNibar.has(r.nibar))
        .map(r => ({
          aset_id: idByNibar.get(r.nibar), jenis,
          periode: periodeDariTanggal(r.tgl_perolehan || new Date().toISOString()),
          tanggal: r.tgl_perolehan || new Date().toISOString().slice(0, 10),
          nilai: r.nilai, skpd_tujuan: targetSkpd,
          payload: {
            bentuk_kontrak: r.bentuk_kontrak || null, nama_penyedia: r.nama_penyedia || null,
            nomor_bast: r.nomor_bast || null, lokasi: r.keterangan || null, sumber_import: fileName,
          },
          keterangan: `Import ${label} — ${fileName}`,
        })))
      if (trxError) { gagal = `Error saat mencatat transaksi: ${trxError.message}`; break }
      sukses += (inserted || []).length
    }
    setMsg(gagal || `${sukses} aset berhasil diimport sebagai ${label}.`)
    if (!gagal) { setRows([]); setFileName('') }
    setImporting(false)
  }

  const nValid = rows.filter(r => r.valid).length

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Perolehan — {label}</h1>
        <p className="text-gray-500 text-sm mt-1">
          Import template Excel export e-bmd. Tiap baris jadi transaksi perolehan di ledger + record aset baru.
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
            </span>
            <button className="btn-primary" disabled={importing || nValid === 0 || !targetSkpd} onClick={handleImport}>
              {importing ? 'Mengimport...' : `Import ${nValid} Baris Valid`}
            </button>
          </div>
          <div className="overflow-x-auto max-h-96 overflow-y-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-100 sticky top-0">
                <tr>
                  <th className="table-th">Status</th><th className="table-th">Kode</th><th className="table-th">NIBAR</th>
                  <th className="table-th">Nama Barang</th><th className="table-th text-right">Nilai</th><th className="table-th">Tgl Perolehan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {rows.map((r, i) => (
                  <tr key={i} className={r.valid ? '' : 'bg-red-50/50'}>
                    <td className="table-td text-xs">{r.valid ? <span className="text-green-600">OK</span> : <span className="text-red-500">{r.masalah.join(', ')}</span>}</td>
                    <td className="table-td text-xs">{r.kode}</td>
                    <td className="table-td text-xs">{r.nibar}</td>
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
