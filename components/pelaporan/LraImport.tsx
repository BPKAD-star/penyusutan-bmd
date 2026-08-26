'use client'
// Import LRA (realisasi belanja) dari Excel akuntansi — 2 langkah: parse →
// preview → commit. Anti-dobel via natural key (skpd_id, no_bukti, kode_rekening)
// dengan UPSERT (tanda Kapitalisasi/Reklas Fase B tetap, tak ikut ditimpa).
// Lihat docs/lra-plan.md §4.
//
// ADMIN-ONLY sejak 2026-08-26 (permintaan user) — pemanggilnya (app/dashboard/
// pelaporan/lra/page.tsx) hanya menampilkan tombol yang membuka modal ini kalau
// isAdmin, dan trigger DB `fn_lra_realisasi_guard` (migrasi 20260826_02) menolak
// INSERT/DELETE/UPDATE-kolom-impor dari non-admin apa pun caranya. Karena itu
// modul ini TAK LAGI membatasi SKPD per-role — dulu non-admin cuma boleh
// mengimpor subtree SKPD-nya sendiri (allowedIds/mySkpdId), sekarang kode itu
// dihapus krn tak pernah tereksekusi lagi (satu-satunya pemanggil sudah admin).
import { useEffect, useState } from 'react'
import * as XLSX from 'xlsx'
import { createClient } from '@/lib/supabase/client'
import { formatRupiah } from '@/lib/export'
import { parseKodeUraian, parseDebit, parseTanggal, kelompokDari } from '@/lib/lra'

type Parsed = {
  baris: number                 // no. baris Excel (utk pesan error)
  tanggal: string | null
  kode: string
  uraian: string
  no_bukti: string
  skpd_id: number | null
  keterangan: string
  debit: number
  kelompok: 'modal' | 'barjas' | 'lain'
  masalah: string[]
  valid: boolean
}

function normHeader(s: unknown): string {
  return String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
}
const keyOf = (r: { skpd_id: number | null; no_bukti: string; kode: string }) =>
  `${r.skpd_id}|${r.no_bukti}|${r.kode}`

export default function LraImport({ onClose, onDone }: { onClose: () => void; onDone: (msg: string) => void }) {
  const supabase = createClient()
  const [skpdNama, setSkpdNama] = useState<Map<number, string>>(new Map())
  const [ready, setReady] = useState(false)

  const [fileName, setFileName] = useState('')
  const [parsing, setParsing] = useState(false)
  const [rows, setRows] = useState<Parsed[]>([])
  const [existing, setExisting] = useState<Map<string, { id: number; tagged: boolean }>>(new Map())
  const [committing, setCommitting] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    (async () => {
      // Master SKPD (id→nama) — cuma utk validasi id_skpd & label preview.
      const all: { id: number; nama: string }[] = []
      for (let from = 0; ; from += 1000) {
        const { data } = await supabase.from('admin_skpd').select('id,nama').range(from, from + 999)
        if (!data || data.length === 0) break
        all.push(...(data as { id: number; nama: string }[]))
        if (data.length < 1000) break
      }
      setSkpdNama(new Map(all.map(s => [s.id, s.nama])))
      setReady(true)
    })()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleFile(f: File) {
    setParsing(true); setErr(''); setRows([]); setExisting(new Map()); setFileName(f.name)
    try {
      const buf = await f.arrayBuffer()
      const wb = XLSX.read(buf, { cellDates: true })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const grid: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })

      // Cari baris header (harus punya kolom Tanggal & Uraian & Debit).
      const headerIdx = grid.findIndex(r => {
        const hs = r.map(normHeader)
        return hs.some(h => h === 'tanggal') && hs.some(h => h.includes('uraian')) && hs.some(h => h.includes('debit'))
      })
      if (headerIdx < 0) throw new Error("Header tidak ditemukan — pastikan ada kolom Tanggal, Uraian, No. Bukti, SKPD, Keterangan, Debit.")
      const header = grid[headerIdx].map(normHeader)
      const col = (...names: string[]) => {
        for (const n of names) { const i = header.findIndex(h => h === n || h.includes(n)); if (i >= 0) return i }
        return -1
      }
      const cTgl = col('tanggal'), cUraian = col('uraian'), cBukti = col('nobukti', 'noboktidoksumber', 'bukti', 'doksumber')
      const cSkpd = col('idskpd', 'skpd'), cKet = col('keterangan'), cDebit = col('debit', 'nominal', 'nilai')
      if (cUraian < 0 || cBukti < 0 || cSkpd < 0 || cDebit < 0) {
        throw new Error('Kolom wajib kurang. Perlu: Tanggal, Uraian, No. Bukti/Dok. Sumber, SKPD (id_skpd), Debit.')
      }

      const parsed: Parsed[] = []
      for (let i = headerIdx + 1; i < grid.length; i++) {
        const r = grid[i]
        const raw = (idx: number) => (idx >= 0 ? r[idx] : '')
        const uraianCell = String(raw(cUraian) ?? '').trim()
        const buktiCell = String(raw(cBukti) ?? '').trim()
        if (!uraianCell && !buktiCell) continue // baris kosong

        const { kode, uraian } = parseKodeUraian(raw(cUraian))
        const tanggal = parseTanggal(raw(cTgl))
        const skpdRaw = String(raw(cSkpd) ?? '').trim()
        const skpd_id = /^\d+$/.test(skpdRaw) ? Number(skpdRaw) : null
        const debit = parseDebit(raw(cDebit))
        const kelompok = kelompokDari(kode)

        const masalah: string[] = []
        if (!tanggal) masalah.push('tanggal kosong/invalid')
        if (!kode) masalah.push('kode rekening kosong')
        if (!buktiCell) masalah.push('No. Bukti kosong')
        if (skpd_id == null) masalah.push('id_skpd bukan angka')
        else if (!skpdNama.has(skpd_id)) masalah.push(`id_skpd ${skpd_id} tak ada`)
        if (debit <= 0) masalah.push('debit ≤ 0')
        if (kelompok === 'lain') masalah.push('bukan 5.1/5.2 (dilewati)')

        parsed.push({
          baris: i + 1, tanggal, kode, uraian, no_bukti: buktiCell, skpd_id, keterangan: String(raw(cKet) ?? '').trim(),
          debit, kelompok, masalah, valid: masalah.length === 0,
        })
      }
      if (parsed.length === 0) throw new Error('Tidak ada baris data terbaca.')

      // Cek baris yg sudah ada di DB (utk preview "akan ditimpa" & delete baris hilang).
      const valid = parsed.filter(p => p.valid)
      const skpdIds = [...new Set(valid.map(p => p.skpd_id!).filter(Boolean))]
      const buktiList = [...new Set(valid.map(p => p.no_bukti))]
      const ex = new Map<string, { id: number; tagged: boolean }>()
      if (skpdIds.length && buktiList.length) {
        for (let i = 0; i < buktiList.length; i += 200) {
          const { data } = await supabase.from('lra_realisasi')
            .select('id,skpd_id,no_bukti,kode_rekening,klasifikasi')
            .in('skpd_id', skpdIds).in('no_bukti', buktiList.slice(i, i + 200))
          for (const d of (data || []) as { id: number; skpd_id: number; no_bukti: string; kode_rekening: string; klasifikasi: string | null }[]) {
            ex.set(keyOf({ skpd_id: d.skpd_id, no_bukti: d.no_bukti, kode: d.kode_rekening }), { id: d.id, tagged: d.klasifikasi != null })
          }
        }
      }
      setRows(parsed)
      setExisting(ex)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e)); setRows([])
    }
    setParsing(false)
  }

  // Agregasi baris valid per natural key (jumlahkan debit — keputusan D-4).
  function aggregate(valid: Parsed[]) {
    const map = new Map<string, Parsed>()
    for (const p of valid) {
      const k = keyOf({ skpd_id: p.skpd_id, no_bukti: p.no_bukti, kode: p.kode })
      const cur = map.get(k)
      if (cur) { cur.debit += p.debit }
      else map.set(k, { ...p })
    }
    return map
  }

  async function commit() {
    const valid = rows.filter(p => p.valid)
    if (valid.length === 0) { setErr('Tidak ada baris valid untuk diimport.'); return }
    setCommitting(true); setErr('')
    try {
      const agg = aggregate(valid)
      const aggRows = [...agg.values()]
      const fileKeys = new Set(agg.keys())

      // UPSERT (natural key) — TIDAK menyertakan kolom tanda & generated columns.
      const payload = aggRows.map(p => ({
        skpd_id: p.skpd_id, tanggal: p.tanggal, no_bukti: p.no_bukti, kode_rekening: p.kode,
        uraian: p.uraian || null, keterangan: p.keterangan || null, debit: p.debit,
      }))
      for (let i = 0; i < payload.length; i += 500) {
        const { error } = await supabase.from('lra_realisasi')
          .upsert(payload.slice(i, i + 500), { onConflict: 'skpd_id,no_bukti,kode_rekening' })
        if (error) throw new Error(error.message)
      }

      // Hapus baris DB yg TADINYA ada di bukti yg di-import tapi kini hilang dari file.
      const hapusIds: number[] = []
      for (const [k, v] of existing) if (!fileKeys.has(k)) hapusIds.push(v.id)
      for (let i = 0; i < hapusIds.length; i += 200) {
        const { error } = await supabase.from('lra_realisasi').delete().in('id', hapusIds.slice(i, i + 200))
        if (error) throw new Error(error.message)
      }

      const baru = [...fileKeys].filter(k => !existing.has(k)).length
      const timpa = [...fileKeys].filter(k => existing.has(k)).length
      onDone(`Import selesai — ${aggRows.length} baris (${baru} baru, ${timpa} diperbarui${hapusIds.length ? `, ${hapusIds.length} dihapus` : ''}).`)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    }
    setCommitting(false)
  }

  // Ringkasan preview.
  const valid = rows.filter(p => p.valid)
  const dilewati = rows.filter(p => !p.valid && p.masalah.length === 1 && p.masalah[0].startsWith('bukan 5.1/5.2'))
  const error = rows.filter(p => !p.valid && !(p.masalah.length === 1 && p.masalah[0].startsWith('bukan 5.1/5.2')))
  const aggKeys = new Set(valid.map(p => keyOf({ skpd_id: p.skpd_id, no_bukti: p.no_bukti, kode: p.kode })))
  const nBaru = [...aggKeys].filter(k => !existing.has(k)).length
  const nTimpa = [...aggKeys].filter(k => existing.has(k)).length
  const nTagTerdampak = [...existing.entries()].filter(([, v]) => v.tagged).length
  const totalDebit = valid.reduce((s, p) => s + p.debit, 0)
  const buktiTimpa = new Set(rows.filter(p => p.valid && existing.has(keyOf({ skpd_id: p.skpd_id, no_bukti: p.no_bukti, kode: p.kode }))).map(p => p.no_bukti))

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 overflow-y-auto">
      <div className="card w-full max-w-5xl my-8 bg-white">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-800">Import LRA (Realisasi Belanja)</h2>
          <button className="text-gray-400 hover:text-gray-600 text-xl leading-none" onClick={onClose}>×</button>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-xs text-gray-500">
            Kolom Excel: <b>Tanggal</b> (dd/mm/yyyy) · <b>Uraian</b> (kode + &quot; - &quot; nama) · <b>No. Bukti/Dok. Sumber</b> ·
            {' '}<b>SKPD</b> (isi <b>id_skpd</b>) · <b>Keterangan</b> · <b>Debit</b>. Hanya baris <b>5.1 &amp; 5.2</b> yang diimport;
            baris dgn No. Bukti + kode sama akan <b>ditimpa</b> (tanda Kapitalisasi/Reklas tetap).
          </p>

          {err && <div className="p-3 rounded-lg bg-red-50 text-red-700 text-sm">{err}</div>}

          <div className="flex flex-wrap items-center gap-4">
            <input type="file" accept=".xlsx,.xls" className="text-sm" disabled={!ready || parsing || committing}
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
            {!ready && <span className="text-sm text-gray-400">Memuat data SKPD…</span>}
            {parsing && <span className="text-sm text-gray-400">Membaca {fileName}…</span>}
          </div>

          {rows.length > 0 && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <Stat label="Baris valid" value={String(valid.length)} tone="green" />
                <Stat label="Baru / Ditimpa" value={`${nBaru} / ${nTimpa}`} />
                <Stat label="Dilewati (non 5.1/5.2)" value={String(dilewati.length)} />
                <Stat label="Bermasalah" value={String(error.length)} tone={error.length ? 'red' : undefined} />
              </div>

              {buktiTimpa.size > 0 && (
                <div className="p-3 rounded-lg bg-amber-50 text-amber-800 text-xs">
                  {buktiTimpa.size} No. Bukti sudah ada → akan diperbarui.
                  {nTagTerdampak > 0 && <> {nTagTerdampak} baris di antaranya sudah punya tanda Kapitalisasi/Reklas — tanda dipertahankan selama bukti+kode sama.</>}
                </div>
              )}

              <div className="text-sm text-gray-600">Total debit valid: <b>{formatRupiah(totalDebit)}</b></div>

              <div className="card overflow-hidden">
                <div className="overflow-x-auto max-h-80 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 border-b border-gray-100 sticky top-0">
                      <tr>
                        <th className="table-th">Status</th><th className="table-th">Tgl</th><th className="table-th">Kode</th>
                        <th className="table-th">No. Bukti</th><th className="table-th">SKPD</th><th className="table-th text-right">Debit</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {rows.slice(0, 300).map((p, i) => (
                        <tr key={i} className={p.valid ? '' : (p.masalah[0]?.startsWith('bukan') ? 'bg-gray-50/60 text-gray-400' : 'bg-red-50/50')}>
                          <td className="table-td">{p.valid ? <span className="text-green-600">OK</span> : <span className={p.masalah[0]?.startsWith('bukan') ? 'text-gray-400' : 'text-red-500'}>{p.masalah.join(', ')}</span>}</td>
                          <td className="table-td">{p.tanggal || '-'}</td>
                          <td className="table-td">{p.kode || '-'}</td>
                          <td className="table-td">{p.no_bukti || '-'}</td>
                          <td className="table-td">{p.skpd_id != null ? (skpdNama.get(p.skpd_id) || p.skpd_id) : '-'}</td>
                          <td className="table-td text-right">{formatRupiah(p.debit)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {rows.length > 300 && <div className="px-3 py-2 text-xs text-gray-400 border-t border-gray-100">Menampilkan 300 dari {rows.length} baris.</div>}
              </div>
            </>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 px-5 py-3 border-t border-gray-100">
          <button className="btn-secondary" onClick={onClose} disabled={committing}>Batal</button>
          <button className="btn-primary" disabled={committing || parsing || valid.length === 0} onClick={commit}>
            {committing ? 'Menyimpan…' : `Import ${valid.length} Baris`}
          </button>
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'green' | 'red' }) {
  const color = tone === 'green' ? 'text-green-600' : tone === 'red' ? 'text-red-500' : 'text-gray-800'
  return (
    <div className="rounded-lg border border-gray-100 px-3 py-2">
      <div className="text-xs text-gray-400">{label}</div>
      <div className={`text-lg font-semibold ${color}`}>{value}</div>
    </div>
  )
}
