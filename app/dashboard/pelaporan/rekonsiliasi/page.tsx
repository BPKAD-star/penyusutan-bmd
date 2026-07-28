'use client'
// Rekonsiliasi BMD — Berita Acara Rekonsiliasi (laporan mutasi). Per SKPD, per
// SEMESTER (dipilih), per golongan; Saldo Awal + Penambahan − Pengurangan =
// Saldo Akhir, 4 ukuran (Perolehan/Beban/Akumulasi/Nilai Buku) × Intra/Ekstra.
// Angka PERIOD-CORRECT (lib/rekon.ts) — identik halaman Penyusutan → bisa tie-out.
// Lihat docs/rekonsiliasi-bmd-plan.md.
//
// FASE 2 (ini): baris Penambahan/Pengurangan terisi utk NILAI PEROLEHAN + baris
// "Selisih (belum terpetakan)" penyeimbang (menjamin rantai reconcile & memunculkan
// yg belum dipetakan, mis. reklas komptabel Intra/Ekstra). Beban & Akumulasi baris
// mutasi = Fase 3 (kolomnya "—" utk baris mutasi; Saldo Awal/Akhir tetap 4 ukuran).
//
// DRILL-DOWN (pola LRA): angka Nilai Perolehan baris mutasi bisa diklik → popup
// RekonDetailModal berisi transaksi pembentuknya, dikelompokkan per SKPD. Halaman
// menahan `lines` (fetchMutasiLines) lalu menjumlah SENDIRI lewat aggregateMutasi
// — jadi tabel & popup makan dari array yang sama, TAK ADA query kedua yang bisa
// bikin totalnya beda. Kalau nanti nambah baris/kategori, cukup daftarkan di
// keysOfRow(); baris yang tak punya transaksi pembentuk (saldo, selisih) sengaja
// dibiarkan tak bisa diklik — lihat komentar di fungsi itu.
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { exportToExcel } from '@/lib/export'
import { GOLONGAN_REKAP } from '@/lib/bmd'
import SkpdCombobox, { type SkpdSelection as OrgSelection } from '@/components/SkpdCombobox'
import TahunTerkunciNote from '@/components/TahunTerkunciNote'
import RekonDetailModal from '@/components/pelaporan/RekonDetailModal'
import { tahunAwal } from '@/lib/tahunKerja'
import {
  fetchSnapshot, fetchMutasiLines, aggregateMutasi, measuresOf, mutasiCellOf,
  type Snapshot, type Mutasi, type MutasiCell, type MutasiKey, type MutasiLine, type Komptabel,
} from '@/lib/rekon'

const angka = (v: number) => new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(v || 0)
const KOMPS: Komptabel[] = ['intra', 'ekstra']

// ── Struktur baris laporan (image BA rekonsiliasi) ──────────────────────────
type RowKind = 'saldo-awal' | 'saldo-akhir' | 'header' | 'sub' | 'item' | 'jumlah-t' | 'jumlah-k' | 'selisih'
type RowDef = { kind: RowKind; label: string; key?: MutasiKey; indent?: number }

const TAMBAH_KEYS: MutasiKey[] = ['pengadaan', 'hibah', 'tukar', 'inventarisasi', 'lainnya', 'kdp', 'belanja_jasa', 'penggunaan_masuk', 'kapitalisasi', 'koreksi_tambah', 'reklas_fungsi_masuk', 'reklas_kode_masuk']
const KURANG_KEYS: MutasiKey[] = ['hapus_penjualan', 'hapus_hibah', 'hapus_tukar', 'hapus_penyertaan', 'hapus_sebab_lain', 'pengalihan_keluar', 'koreksi_kurang', 'reklas_fungsi_keluar', 'reklas_kode_keluar']

const ROWS: RowDef[] = [
  { kind: 'saldo-awal', label: 'SALDO AWAL' },
  { kind: 'header', label: 'Penambahan' },
  { kind: 'sub', label: 'Cara Perolehan', indent: 1 },
  { kind: 'item', label: 'Pengadaan', key: 'pengadaan', indent: 2 },
  { kind: 'item', label: 'Hibah', key: 'hibah', indent: 2 },
  { kind: 'item', label: 'Tukar Menukar', key: 'tukar', indent: 2 },
  { kind: 'item', label: 'Hasil Inventarisasi', key: 'inventarisasi', indent: 2 },
  { kind: 'item', label: 'Perolehan Lainnya', key: 'lainnya', indent: 2 },
  // Termin kontrak konstruksi (akumulasi_kdp) → nilai aset KDP 1.3.6 naik.
  // Sebelumnya tak terpetakan & jatuh ke baris Selisih.
  { kind: 'item', label: 'Konstruksi Dalam Pengerjaan (termin)', key: 'kdp', indent: 2 },
  { kind: 'item', label: 'Perolehan dari rekening Belanja Jasa', key: 'belanja_jasa', indent: 1 },
  { kind: 'item', label: 'Penggunaan (transfer masuk)', key: 'penggunaan_masuk', indent: 1 },
  { kind: 'item', label: 'Kapitalisasi', key: 'kapitalisasi', indent: 1 },
  { kind: 'item', label: 'Koreksi Nilai', key: 'koreksi_tambah', indent: 1 },
  { kind: 'sub', label: 'Reklasifikasi', indent: 1 },
  { kind: 'item', label: 'Intra', indent: 2 },        // reklas_komptabel → Selisih (Fase 2b)
  { kind: 'item', label: 'Ekstra', indent: 2 },       // reklas_komptabel → Selisih (Fase 2b)
  { kind: 'item', label: 'Perubahan Fungsi', key: 'reklas_fungsi_masuk', indent: 2 },
  { kind: 'item', label: 'Kesalahan Kodefikasi', key: 'reklas_kode_masuk', indent: 2 },
  { kind: 'jumlah-t', label: 'JUMLAH PENAMBAHAN' },
  { kind: 'header', label: 'Pengurangan' },
  { kind: 'sub', label: 'Penghapusan Pemindahtanganan', indent: 1 },
  { kind: 'item', label: 'Penjualan', key: 'hapus_penjualan', indent: 2 },
  { kind: 'item', label: 'Hibah', key: 'hapus_hibah', indent: 2 },
  { kind: 'item', label: 'Tukar Menukar', key: 'hapus_tukar', indent: 2 },
  { kind: 'item', label: 'Penyertaan Modal', key: 'hapus_penyertaan', indent: 2 },
  { kind: 'item', label: 'Penghapusan Sebab Lain', key: 'hapus_sebab_lain', indent: 1 },
  { kind: 'item', label: 'Penghapusan Pengalihan (transfer keluar)', key: 'pengalihan_keluar', indent: 1 },
  { kind: 'item', label: 'Koreksi Kurang', key: 'koreksi_kurang', indent: 1 },
  { kind: 'sub', label: 'Reklasifikasi', indent: 1 },
  { kind: 'item', label: 'Intra', indent: 2 },
  { kind: 'item', label: 'Ekstra', indent: 2 },
  { kind: 'item', label: 'Perubahan Fungsi', key: 'reklas_fungsi_keluar', indent: 2 },
  { kind: 'item', label: 'Kesalahan Kodefikasi', key: 'reklas_kode_keluar', indent: 2 },
  { kind: 'jumlah-k', label: 'JUMLAH PENGURANGAN' },
  { kind: 'selisih', label: 'Selisih (belum terpetakan)' },
  { kind: 'saldo-akhir', label: 'SALDO AKHIR' },
]

const sumKeys = (cell: MutasiCell, keys: MutasiKey[]) => keys.reduce((s, k) => s + (cell[k] || 0), 0)

// Kategori mutasi pembentuk sebuah baris — dipakai drill-down (klik angka →
// popup rincian). null = baris yang TIDAK punya transaksi pembentuk:
//   · saldo awal/akhir → posisi hasil replay engine per aset, bukan transaksi
//     periode ini (rinciannya ada di menu Penyusutan);
//   · selisih → penyeimbang, justru bagian yang BELUM terpetakan ke kategori —
//     kalau bisa dirinci, dia bukan selisih lagi;
//   · header/sub & baris Reklas Intra/Ekstra (Fase 2b) → memang tanpa angka.
function keysOfRow(row: RowDef): MutasiKey[] | null {
  if (row.kind === 'item') return row.key ? [row.key] : null
  if (row.kind === 'jumlah-t') return TAMBAH_KEYS
  if (row.kind === 'jumlah-k') return KURANG_KEYS
  return null
}

// Nilai Perolehan sebuah baris utk (golongan, komptabel).
function perolehanRow(row: RowDef, cell: MutasiCell, awalP: number, akhirP: number): number | null {
  switch (row.kind) {
    case 'saldo-awal': return awalP
    case 'saldo-akhir': return akhirP
    case 'jumlah-t': return sumKeys(cell, TAMBAH_KEYS)
    case 'jumlah-k': return sumKeys(cell, KURANG_KEYS)
    case 'selisih': return (akhirP - awalP) - (sumKeys(cell, TAMBAH_KEYS) - sumKeys(cell, KURANG_KEYS))
    case 'item': return row.key ? (cell[row.key] || 0) : 0
    default: return null // header/sub → tanpa angka
  }
}

export default function RekonsiliasiPage() {
  const supabase = createClient()
  const [org, setOrg] = useState<OrgSelection>({ skpdId: null, descendantIds: null })
  const [tahun, setTahun] = useState(() => tahunAwal('2026'))
  const [smt, setSmt] = useState('1')
  const [applied, setApplied] = useState<{ tahun: string; smt: string } | null>(null)
  const [snapAwal, setSnapAwal] = useState<Snapshot>({})
  const [snapAkhir, setSnapAkhir] = useState<Snapshot>({})
  const [mutasi, setMutasi] = useState<Mutasi>({})
  // Baris rinci pembentuk angka mutasi — ditahan di memori untuk drill-down.
  // Agregatnya dijumlah dari array yang SAMA (aggregateMutasi), jadi total di
  // popup tak mungkin beda dari angka yang diklik.
  const [lines, setLines] = useState<MutasiLine[]>([])
  const [skpdNama, setSkpdNama] = useState<Record<number, string>>({})
  const [detail, setDetail] = useState<{ judul: string; rows: MutasiLine[] } | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    (async () => {
      const map: Record<number, string> = {}
      for (let from = 0; ; from += 1000) {
        const { data } = await supabase.from('admin_skpd').select('id,nama').range(from, from + 999)
        if (!data || data.length === 0) break
        for (const s of data as { id: number; nama: string }[]) map[s.id] = s.nama
        if (data.length < 1000) break
      }
      setSkpdNama(map)
    })()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function proses() {
    setLoading(true)
    setDetail(null)
    const desc = org.descendantIds ?? null
    const periode = `${tahun}-S${smt}`
    const awalPeriode = smt === '1' ? `${Number(tahun) - 1}-S2` : `${tahun}-S1`
    const [awal, akhir, mutLines] = await Promise.all([
      fetchSnapshot(supabase, awalPeriode, desc),
      fetchSnapshot(supabase, periode, desc),
      fetchMutasiLines(supabase, periode, desc),
    ])
    setSnapAwal(awal); setSnapAkhir(akhir)
    setLines(mutLines); setMutasi(aggregateMutasi(mutLines))
    setApplied({ tahun, smt })
    setLoading(false)
  }

  // Klik angka → kumpulkan baris pembentuk sel (golongan × komptabel × kategori).
  function bukaDetail(golKode: string, golUraian: string, komp: Komptabel, row: RowDef) {
    const keys = keysOfRow(row)
    if (!keys) return
    const set = new Set(keys)
    const rows = lines.filter(l => l.golongan === golKode && l.komp === komp && set.has(l.kategori))
    if (rows.length === 0) return
    setDetail({
      judul: `${golKode} ${golUraian} · ${komp === 'intra' ? 'Intrakomptabel' : 'Ekstrakomptabel'} · ${row.label}`,
      rows,
    })
  }

  const periodeLabel = applied ? `${applied.tahun}-S${applied.smt}` : ''

  function handleExport() {
    if (!applied) return
    const rows: Record<string, string | number>[] = []
    for (const g of GOLONGAN_REKAP) {
      for (const row of ROWS) {
        if (row.kind === 'header' || row.kind === 'sub') continue
        const rec: Record<string, string | number> = { 'Jenis Aset': `${g.kode} — ${g.uraian}`, 'Baris': row.label }
        for (const k of KOMPS) {
          const cell = mutasiCellOf(mutasi, g.kode, k)
          const aw = measuresOf(snapAwal, g.kode, k), ak = measuresOf(snapAkhir, g.kode, k)
          const p = perolehanRow(row, cell, aw.perolehan, ak.perolehan)
          const pref = k === 'intra' ? 'Intra' : 'Ekstra'
          rec[`${pref} — Nilai Perolehan`] = p ?? ''
          rec[`${pref} — Beban`] = row.kind === 'saldo-awal' ? aw.beban : row.kind === 'saldo-akhir' ? ak.beban : ''
          rec[`${pref} — Akumulasi`] = row.kind === 'saldo-awal' ? aw.akumulasi : row.kind === 'saldo-akhir' ? ak.akumulasi : ''
          rec[`${pref} — Nilai Buku`] = row.kind === 'saldo-awal' ? aw.nilaiBuku : row.kind === 'saldo-akhir' ? ak.nilaiBuku : ''
        }
        rows.push(rec)
      }
    }
    exportToExcel(rows, `Rekonsiliasi_BMD_${periodeLabel}`, 'Rekonsiliasi BMD')
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Rekonsiliasi BMD</h1>
        <p className="text-gray-500 text-sm mt-1">
          Berita Acara Rekonsiliasi — mutasi per jenis aset & semester. Angka period-correct (setara halaman Penyusutan).
        </p>
      </div>

      <div className="card p-5 mb-4">
        <h2 className="text-base font-semibold text-gray-800 mb-4">Filter data</h2>
        <div className="space-y-3 max-w-3xl">
          <div className="flex items-center gap-3">
            <label className="w-40 text-sm text-gray-600 text-right flex-shrink-0">SKPD / Lokasi :</label>
            <SkpdCombobox lockToOperator onChangeSelection={setOrg} allowClear placeholder="Semua — atau ketik SKPD / Sub OPD / Lokasi..." />
          </div>
          <div className="flex items-center gap-3">
            <label className="w-40 text-sm text-gray-600 text-right flex-shrink-0">Semester :</label>
            <select className="select-filter w-28" value={tahun} onChange={e => setTahun(e.target.value)}>
              {['2025', '2026', '2027'].map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <div className="flex gap-4">
              {[['1', 'Semester I'], ['2', 'Semester II']].map(([v, l]) => (
                <label key={v} className="flex items-center gap-1.5 text-sm cursor-pointer">
                  <input type="radio" name="smt" checked={smt === v} onChange={() => setSmt(v)} />{l}
                </label>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="w-40 flex-shrink-0" />
            <button className="btn-primary" onClick={proses} disabled={loading}>{loading ? 'Memproses...' : 'Proses'}</button>
            {applied && <button className="btn-secondary" onClick={handleExport}>Export Excel</button>}
          </div>
        </div>
      </div>

      <TahunTerkunciNote tahun={Number(tahun)} />

      {applied === null ? (
        <div className="card p-12 text-center text-gray-400 text-sm">
          Atur filter lalu klik <span className="font-medium text-gray-600">Proses</span>.
        </div>
      ) : loading ? (
        <div className="card p-12 text-center text-gray-400 text-sm">Memproses...</div>
      ) : (
        <div className="space-y-3">
          <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-2 text-xs text-amber-800">
            <span className="font-medium">Fase 2</span> — periode <b>{periodeLabel}</b>. Nilai Perolehan baris mutasi sudah terisi;
            baris <b>Selisih</b> memuat yang belum terpetakan (a.l. reklas komptabel Intra/Ekstra). Kolom Beban &amp; Akumulasi baris
            mutasi (bertanda &ldquo;—&rdquo;) menyusul Fase 3; Saldo Awal/Akhir sudah lengkap.
          </div>
          <div className="rounded-lg bg-gray-50 border border-gray-200 px-4 py-2 text-xs text-gray-600">
            Angka <b>Nilai Perolehan</b> yang berwarna bisa <b>diklik</b> untuk melihat rincian transaksi pembentuknya
            (per SKPD, lengkap dengan NIBAR &amp; no. dokumen). Saldo Awal/Akhir tidak — itu posisi hasil replay engine
            per aset, bukan transaksi periode ini; rinciannya di menu Penyusutan. Baris <b>Selisih</b> juga tidak,
            karena isinya justru yang belum terpetakan ke kategori mana pun.
          </div>
          {GOLONGAN_REKAP.map(g => (
            <div key={g.kode} className="card overflow-hidden">
              <div className="px-4 py-2.5 border-b border-gray-100 bg-gray-50/60">
                <p className="text-sm font-semibold text-gray-800">{g.kode} — {g.uraian}</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      <th className="table-th text-left" rowSpan={2}>Uraian</th>
                      {KOMPS.map(k => <th key={k} className="table-th text-center border-l border-gray-100" colSpan={4}>{k === 'intra' ? 'Intrakomptabel' : 'Ekstrakomptabel'}</th>)}
                    </tr>
                    <tr>
                      {KOMPS.map(k => ['Nilai Perolehan', 'Beban', 'Akumulasi', 'Nilai Buku'].map((lbl, i) => (
                        <th key={`${k}-${lbl}`} className={`table-th text-right ${i === 0 ? 'border-l border-gray-100' : ''}`}>{lbl}</th>
                      )))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {ROWS.map((row, ri) => {
                      const isSaldo = row.kind === 'saldo-awal' || row.kind === 'saldo-akhir'
                      const isJumlah = row.kind === 'jumlah-t' || row.kind === 'jumlah-k'
                      const isHead = row.kind === 'header'
                      const cls = isSaldo ? 'bg-teal/5 font-semibold text-gray-900'
                        : isJumlah ? 'bg-gray-50 font-medium text-gray-800'
                        : isHead ? 'bg-gray-50/40 font-medium text-gray-700'
                        : row.kind === 'selisih' ? 'text-gray-500 italic' : ''
                      return (
                        <tr key={ri} className={cls}>
                          <td className="table-td text-xs" style={{ paddingLeft: `${0.75 + (row.indent || 0) * 1}rem` }}>{row.label}</td>
                          {KOMPS.map(k => {
                            const cell = mutasiCellOf(mutasi, g.kode, k)
                            const aw = measuresOf(snapAwal, g.kode, k), ak = measuresOf(snapAkhir, g.kode, k)
                            const p = perolehanRow(row, cell, aw.perolehan, ak.perolehan)
                            const beban = row.kind === 'saldo-awal' ? aw.beban : row.kind === 'saldo-akhir' ? ak.beban : null
                            const akum = row.kind === 'saldo-awal' ? aw.akumulasi : row.kind === 'saldo-akhir' ? ak.akumulasi : null
                            const nb = row.kind === 'saldo-awal' ? aw.nilaiBuku : row.kind === 'saldo-akhir' ? ak.nilaiBuku : null
                            // Nilai Perolehan baris mutasi bisa diklik → popup rincian
                            // transaksinya. Kolom lain (Beban/Akumulasi/Nilai Buku) &
                            // baris saldo/selisih tidak — lihat keysOfRow().
                            const adaRincian = keysOfRow(row) !== null && p != null && p !== 0
                            const td = (id: string, v: number | null, border = false, onClick?: () => void) => (
                              <td key={id} className={`table-td text-right text-xs tabular-nums ${border ? 'border-l border-gray-100' : ''}`}>
                                {v == null ? <span className="text-gray-300">{isHead || row.kind === 'sub' ? '' : '—'}</span>
                                  : onClick ? (
                                    <button type="button" onClick={onClick}
                                      className="text-teal hover:underline tabular-nums"
                                      title="Klik untuk melihat rincian transaksi pembentuk angka ini">
                                      {angka(v)}
                                    </button>
                                  ) : angka(v)}
                              </td>
                            )
                            return [
                              td(`${k}-p`, p, true, adaRincian ? () => bukaDetail(g.kode, g.uraian, k, row) : undefined),
                              td(`${k}-b`, beban), td(`${k}-a`, akum), td(`${k}-n`, nb),
                            ]
                          })}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}

      {detail && (
        <RekonDetailModal judul={detail.judul} rows={detail.rows} skpdNama={skpdNama} onClose={() => setDetail(null)} />
      )}
    </div>
  )
}
