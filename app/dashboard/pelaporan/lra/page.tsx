'use client'
// LRA — Rekonsiliasi Belanja Modal. Fase B (lengkap):
//   LRA (5.2) + Kapitalisasi (5.1 ditandai) − Reklasifikasi (5.2 ditandai)
//   =? Belanja Modal (Entryan Aplikasi, dari ledger `pengadaan`)
// Lihat docs/lra-plan.md.
import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { exportToExcel } from '@/lib/export'
import { namaBerkasLaporan } from '@/lib/namaBerkas'
import SkpdCombobox, { type SkpdSelection } from '@/components/SkpdCombobox'
import LraImport from '@/components/pelaporan/LraImport'
import LraTagModal from '@/components/pelaporan/LraTagModal'
import LraDetailModal from '@/components/pelaporan/LraDetailModal'
import {
  JENIS_BM, BULAN_SINGKAT,
  rekapModal, rekapKapitalisasi, rekapReklas, rekapApp, selisihMatrix,
  type LraRow, type AppRow, type RekapMatrix,
} from '@/lib/lra'
import { tahunAwal } from '@/lib/tahunKerja'
import { fetchApprovalScope } from '@/lib/roles'

const angka = (v: number) => new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(v || 0)
const LRA_COLS = 'id,skpd_id,tanggal,bulan,no_bukti,kode_rekening,kode_grup3,kelompok,uraian,keterangan,debit,klasifikasi,jenis_tujuan'

export default function LraPage() {
  const supabase = createClient()
  const [org, setOrg] = useState<SkpdSelection>({ skpdId: null, descendantIds: null })
  const [tahun, setTahun] = useState(() => tahunAwal('2026'))
  const [rows, setRows] = useState<LraRow[] | null>(null)
  const [app, setApp] = useState<AppRow[]>([])
  const [loading, setLoading] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [tagMode, setTagMode] = useState<'kapitalisasi' | 'reklas_keluar' | null>(null)
  const [skpdNama, setSkpdNama] = useState<Map<number, string>>(new Map())
  const [detail, setDetail] = useState<{ judul: string; rows: LraRow[] } | null>(null)
  const [msg, setMsg] = useState('')
  // Import Excel LRA = admin-only (permintaan user 2026-08-26) — Pengurus
  // Barang/Pembantu/Pengawas tak perlu. Penegak sesungguhnya trigger DB
  // fn_lra_realisasi_guard (migrasi 20260826_02); ini cuma menyembunyikan
  // tombolnya supaya non-admin tak mengklik lalu kena pesan error.
  const [isAdmin, setIsAdmin] = useState(false)
  useEffect(() => { fetchApprovalScope(supabase).then(s => setIsAdmin(s.isAdmin)) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const proses = useCallback(async () => {
    setLoading(true); setMsg('')
    const desc = org.descendantIds ?? null

    // 1) Baris LRA hasil import.
    const lra: LraRow[] = []
    for (let from = 0; ; from += 1000) {
      let q = supabase.from('lra_realisasi').select(LRA_COLS)
        .eq('tahun', Number(tahun)).order('id').range(from, from + 999)
      if (desc) q = q.in('skpd_id', desc)
      const { data, error } = await q
      if (error) { setMsg(`Error: ${error.message}`); setLoading(false); return }
      const batch = (data || []) as LraRow[]
      lra.push(...batch)
      if (batch.length < 1000) break
    }

    // 2) Belanja modal sisi aplikasi (ledger `pengadaan`) — DIAGREGASI DI SERVER.
    //    Dulu ditarik mentah ke browser → RLS aset per-baris + ~227rb aset bikin
    //    statement timeout 8s. Sekarang lewat RPC (SECURITY DEFINER, scope RLS
    //    direplikasi): balikannya maks 5 jenis × 12 bulan.
    //    Lihat supabase/migrations/20260724_01_fn_lra_belanja_modal.sql.
    const { data: appData, error: appErr } = await supabase.rpc('fn_lra_belanja_modal', {
      p_tahun: Number(tahun),
      p_skpd_ids: desc,
    })
    if (appErr) { setMsg(`Error: ${appErr.message}`); setLoading(false); return }
    const appRows: AppRow[] = ((appData || []) as { grup: string | null; bulan: number; nilai: number }[])
      .map(d => ({ grup: d.grup, bulan: Number(d.bulan), nilai: Number(d.nilai || 0) }))

    // 3) Nama SKPD untuk popup rincian (hanya id yang muncul di data).
    const ids = [...new Set(lra.map(r => r.skpd_id))]
    const nm = new Map<number, string>()
    for (let i = 0; i < ids.length; i += 200) {
      const { data } = await supabase.from('admin_skpd').select('id,nama').in('id', ids.slice(i, i + 200))
      for (const s of (data || []) as { id: number; nama: string }[]) nm.set(s.id, s.nama)
    }
    setSkpdNama(nm)

    setRows(lra); setApp(appRows); setLoading(false)
  }, [org, tahun, supabase])

  const mLra = rows ? rekapModal(rows) : null
  const mKap = rows ? rekapKapitalisasi(rows) : null
  const mRek = rows ? rekapReklas(rows) : null
  const mApp = rows ? rekapApp(app) : null
  const check = mLra && mKap && mRek && mApp ? selisihMatrix(mLra, mKap, mRek, mApp) : null

  const nBarjas = rows ? rows.filter(r => r.kelompok === 'barjas').length : 0
  const nBelumTag = rows ? rows.filter(r => r.kelompok === 'barjas' && r.klasifikasi == null).length : 0
  const nBukti = rows ? new Set(rows.map(r => r.no_bukti)).size : 0

  // Drill-down ala pivot: klik angka → popup baris pembentuknya. Tak perlu query
  // baru — baris LRA sudah ada di memori. grup/bulan null = "semua" (klik Total).
  const drill = (blok: string, base: LraRow[], grupOf: (r: LraRow) => string | null) =>
    (grup: string | null, bulan: number | null) => {
      const sel = base.filter(r => (grup == null || grupOf(r) === grup) && (bulan == null || r.bulan === bulan))
      const jl = grup ? `${grup} ${JENIS_BM.find(j => j.grup === grup)?.uraian ?? ''}`.trim() : 'Semua jenis'
      const bl = bulan ? BULAN_SINGKAT[bulan - 1] : 'Semua bulan'
      setDetail({ judul: `${blok} · ${jl} · ${bl}`, rows: sel })
    }

  function handleExport() {
    if (!mLra || !mKap || !mRek || !mApp || !check) return
    const out: Record<string, string | number>[] = []
    const push = (blok: string, m: RekapMatrix) => {
      for (const j of JENIS_BM) {
        const rec: Record<string, string | number> = { Blok: blok, Jenis: `${j.grup} — ${j.uraian}` }
        BULAN_SINGKAT.forEach((b, i) => { rec[b] = m.perJenis[j.grup][i] })
        rec.Total = m.totalJenis[j.grup]
        out.push(rec)
      }
    }
    push('LRA (Belanja Modal)', mLra)
    push('Kapitalisasi', mKap)
    push('Reklasifikasi', mRek)
    push('Belanja Modal (Entry Aplikasi)', mApp)
    for (const j of JENIS_BM) {
      out.push({
        Blok: 'CHECK', Jenis: `${j.grup} — ${j.uraian}`,
        LRA: mLra.totalJenis[j.grup], Kapitalisasi: mKap.totalJenis[j.grup], Reklasifikasi: mRek.totalJenis[j.grup],
        Seharusnya: mLra.totalJenis[j.grup] + mKap.totalJenis[j.grup] - mRek.totalJenis[j.grup],
        EntryAplikasi: mApp.totalJenis[j.grup], Selisih: check.perJenis[j.grup],
      })
    }
    exportToExcel(out, namaBerkasLaporan({
      laporan: 'LRA Rekonsiliasi', periode: tahun,
      skpd: org.skpdId ? skpdNama.get(org.skpdId) : null,
    }), 'LRA')
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">LRA — Rekonsiliasi Belanja Modal</h1>
        <p className="text-gray-500 text-sm mt-1">
          LRA + Kapitalisasi − Reklasifikasi dibandingkan dengan belanja modal hasil entry Pengadaan di aplikasi.
        </p>
      </div>

      {msg && (
        <div className={`mb-4 p-3 rounded-lg text-sm ${msg.startsWith('Error') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>{msg}</div>
      )}

      <div className="card p-5 mb-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-800">Filter data</h2>
          {isAdmin && <button className="btn-primary" onClick={() => setShowImport(true)}>+ Import Excel LRA</button>}
        </div>
        <div className="space-y-3 max-w-3xl">
          <div className="flex items-center gap-3">
            <label className="w-40 text-sm text-gray-600 text-right flex-shrink-0">SKPD / Lokasi :</label>
            <SkpdCombobox lockToOperator onChangeSelection={setOrg} allowClear placeholder="Semua — atau ketik SKPD / Sub OPD / Lokasi..." />
          </div>
          <div className="flex items-center gap-3">
            <label className="w-40 text-sm text-gray-600 text-right flex-shrink-0">Tahun :</label>
            <select className="select-filter w-28" value={tahun} onChange={e => setTahun(e.target.value)}>
              {['2025', '2026', '2027'].map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-3">
            <span className="w-40 flex-shrink-0" />
            <button className="btn-primary" onClick={proses} disabled={loading}>{loading ? 'Memproses...' : 'Proses'}</button>
            {mLra && <button className="btn-secondary" onClick={handleExport}>Export Excel</button>}
          </div>
        </div>
      </div>

      {rows === null ? (
        <div className="card p-12 text-center text-gray-400 text-sm">
          Atur filter lalu klik <span className="font-medium text-gray-600">Proses</span>.
          {isAdmin
            ? <> Belum ada data? Klik <span className="font-medium text-gray-600">Import Excel LRA</span> dulu.</>
            : <> Belum ada data? Hubungi admin untuk mengimpor data LRA.</>}
        </div>
      ) : loading ? (
        <div className="card p-12 text-center text-gray-400 text-sm">Memproses...</div>
      ) : rows.length === 0 ? (
        <div className="card p-12 text-center text-gray-400 text-sm">
          Belum ada data LRA untuk tahun {tahun} pada lingkup ini.{isAdmin ? ' Import dulu.' : ' Hubungi admin untuk mengimpor data LRA.'}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="text-xs text-gray-500">
              {nBukti} No. Bukti · {rows.length} baris · {nBarjas} baris barjas (5.1){nBelumTag > 0 && `, ${nBelumTag} belum ditandai`}
            </div>
            <div className="flex gap-2 ml-auto">
              <button className="btn-secondary" onClick={() => setTagMode('kapitalisasi')}>+ Tandai Kapitalisasi</button>
              <button className="btn-secondary" onClick={() => setTagMode('reklas_keluar')}>+ Tandai Reklasifikasi</button>
            </div>
          </div>

          <MatrixTable judul={`LRA — Belanja Modal (5.2) ${tahun}`} m={mLra!}
            onDrill={drill('LRA', rows.filter(r => r.kelompok === 'modal'), r => r.kode_grup3)} />
          <MatrixTable judul="Kapitalisasi (belanja barjas 5.1 → belanja modal)" m={mKap!} kosongNote="Belum ada baris ditandai Kapitalisasi."
            onDrill={drill('Kapitalisasi', rows.filter(r => r.klasifikasi === 'kapitalisasi'), r => r.jenis_tujuan)} />
          <MatrixTable judul="Reklasifikasi (belanja modal dikeluarkan)" m={mRek!} kosongNote="Belum ada baris ditandai Reklasifikasi."
            onDrill={drill('Reklasifikasi', rows.filter(r => r.klasifikasi === 'reklas_keluar'), r => r.kode_grup3)} />
          <MatrixTable judul="Belanja Modal — Entryan Aplikasi (dari Pengadaan)" m={mApp!}
            note={mApp!.luarJenis > 0 ? `${angka(mApp!.luarJenis)} dari pengadaan berada di luar objek 5.2.01–05 (mis. 5.2.06 Aset Tidak Berwujud) — tidak masuk tabel ini.` : undefined} />

          {/* ── CHECK ── */}
          <div className="card overflow-hidden">
            <div className="px-4 py-2.5 border-b border-gray-100 bg-gray-50/60 flex items-center justify-between">
              <p className="text-sm font-semibold text-gray-800">Check — LRA + Kapitalisasi − Reklasifikasi vs Entry Aplikasi</p>
              {check!.total === 0
                ? <span className="text-xs font-medium text-green-700 bg-green-50 px-2 py-0.5 rounded">Reconcile ✓</span>
                : <span className="text-xs font-medium text-red-700 bg-red-50 px-2 py-0.5 rounded">Selisih {angka(check!.total)}</span>}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="table-th text-left">Jenis</th>
                    <th className="table-th text-right">LRA</th>
                    <th className="table-th text-right">+ Kapitalisasi</th>
                    <th className="table-th text-right">− Reklasifikasi</th>
                    <th className="table-th text-right border-l border-gray-100">= Seharusnya</th>
                    <th className="table-th text-right">Entry Aplikasi</th>
                    <th className="table-th text-right border-l border-gray-100">Selisih</th>
                    <th className="table-th text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {JENIS_BM.map(j => {
                    const l = mLra!.totalJenis[j.grup], k = mKap!.totalJenis[j.grup], r = mRek!.totalJenis[j.grup]
                    const harus = l + k - r, ap = mApp!.totalJenis[j.grup], d = check!.perJenis[j.grup]
                    return (
                      <tr key={j.grup}>
                        <td className="table-td whitespace-nowrap"><span className="text-gray-400">{j.grup}</span> {j.uraian}</td>
                        <td className="table-td text-right tabular-nums">{angka(l)}</td>
                        <td className="table-td text-right tabular-nums">{k ? angka(k) : <span className="text-gray-300">–</span>}</td>
                        <td className="table-td text-right tabular-nums">{r ? angka(r) : <span className="text-gray-300">–</span>}</td>
                        <td className="table-td text-right tabular-nums font-medium border-l border-gray-100">{angka(harus)}</td>
                        <td className="table-td text-right tabular-nums">{angka(ap)}</td>
                        <td className={`table-td text-right tabular-nums border-l border-gray-100 ${d === 0 ? 'text-gray-300' : 'text-red-600 font-medium'}`}>{d === 0 ? '0' : angka(d)}</td>
                        <td className="table-td text-center">{d === 0 ? <span className="text-green-600">✓</span> : <span className="text-red-500">✗</span>}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div className="px-4 py-2 border-t border-gray-100 text-xs text-gray-400">
              Selisih positif = LRA lebih besar dari entry aplikasi (kemungkinan ada belanja yang belum dientry / belum ditandai reklas).
              Negatif = entry aplikasi lebih besar (kemungkinan ada barjas yang belum ditandai kapitalisasi).
            </div>
          </div>
        </div>
      )}

      {showImport && (
        <LraImport onClose={() => setShowImport(false)} onDone={m => { setShowImport(false); setMsg(m); proses() }} />
      )}
      {tagMode && (
        <LraTagModal mode={tagMode} tahun={tahun} descendantIds={org.descendantIds ?? null}
          onClose={() => { setTagMode(null); proses() }}
          onDone={m => { setTagMode(null); setMsg(m); proses() }} />
      )}
      {detail && (
        <LraDetailModal judul={detail.judul} periode={tahun} skpd={org.skpdId ? skpdNama.get(org.skpdId) : undefined}
          rows={detail.rows} skpdNama={skpdNama} onClose={() => setDetail(null)} />
      )}
    </div>
  )
}

// Tabel matriks jenis × 12 bulan + Total. Kalau `onDrill` diisi, angka non-nol
// jadi tombol → buka rincian (grup/bulan null = "semua", untuk sel Total).
function MatrixTable({ judul, m, note, kosongNote, onDrill }: {
  judul: string; m: RekapMatrix; note?: string; kosongNote?: string
  onDrill?: (grup: string | null, bulan: number | null) => void
}) {
  const kosong = m.totalKeseluruhan === 0
  const Sel = ({ v, grup, bulan, cls }: { v: number; grup: string | null; bulan: number | null; cls?: string }) => (
    <td className={`table-td text-right tabular-nums ${cls || ''}`}>
      {v === 0 ? <span className="text-gray-300">–</span>
        : onDrill
          ? <button type="button" className="text-teal hover:underline" title="Lihat rincian"
              onClick={() => onDrill(grup, bulan)}>{angka(v)}</button>
          : angka(v)}
    </td>
  )
  return (
    <div className="card overflow-hidden">
      <div className="px-4 py-2.5 border-b border-gray-100 bg-gray-50/60">
        <p className="text-sm font-semibold text-gray-800">{judul}</p>
      </div>
      {kosong && kosongNote ? (
        <div className="p-6 text-center text-gray-400 text-sm">{kosongNote}</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="table-th text-left sticky left-0 bg-gray-50">Jenis</th>
                {BULAN_SINGKAT.map(b => <th key={b} className="table-th text-right">{b}</th>)}
                <th className="table-th text-right border-l border-gray-100">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {JENIS_BM.map(j => (
                <tr key={j.grup}>
                  <td className="table-td sticky left-0 bg-white whitespace-nowrap"><span className="text-gray-400">{j.grup}</span> {j.uraian}</td>
                  {m.perJenis[j.grup].map((v, i) => <Sel key={i} v={v} grup={j.grup} bulan={i + 1} />)}
                  <Sel v={m.totalJenis[j.grup]} grup={j.grup} bulan={null} cls="font-medium border-l border-gray-100" />
                </tr>
              ))}
              <tr className="bg-gray-50 font-semibold text-gray-900">
                <td className="table-td sticky left-0 bg-gray-50">TOTAL</td>
                {m.totalBulan.map((v, i) => <Sel key={i} v={v} grup={null} bulan={i + 1} />)}
                <Sel v={m.totalKeseluruhan} grup={null} bulan={null} cls="border-l border-gray-100" />
              </tr>
            </tbody>
          </table>
        </div>
      )}
      {note && <div className="px-4 py-2 border-t border-gray-100 text-xs text-amber-700 bg-amber-50/50">{note}</div>}
    </div>
  )
}
