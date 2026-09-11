'use client'
// LRA — Rekonsiliasi Belanja Modal. Fase B (lengkap):
//   LRA (5.2) + Kapitalisasi (5.1 ditandai) − Reklasifikasi (5.2 ditandai)
//   =? Belanja Modal (Entryan Aplikasi, dari ledger `pengadaan` + termin KDP)
//
// ⚠️ DUA DASAR PENGELOMPOKAN, dan bedanya justru yang paling berguna di sini
// (permintaan user 2026-09-09):
//   · KODE REKENING — jenis BELANJA-nya (`payload.kode_rekening`). Sebanding
//     langsung dgn box LRA, jadi Check-nya menjawab **kelengkapan entry**:
//     "apakah semua realisasi belanja sudah dicatat sbg aset di aplikasi?"
//   · KODE BARANG — jenis ASET-nya (`aset.golongan`). Inilah yang masuk
//     Neraca/Daftar Barang, jadi Check-nya menjawab **ketepatan klasifikasi**:
//     "apakah barangnya mendarat di jenis aset yang sesuai belanjanya?"
// Selisih TOTALNYA sama di kedua dasar (yang bergeser cuma sebarannya antar
// jenis), jadi memindah tuas ini tak pernah bisa menyembunyikan uang.
// Tabel **Persilangan** di bawahnya yang MENJELASKAN pergeseran itu baris per
// baris. Lihat docs/lra-plan.md.
import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { exportToExcel } from '@/lib/export'
import { namaBerkasLaporan } from '@/lib/namaBerkas'
import SkpdCombobox, { type SkpdSelection } from '@/components/SkpdCombobox'
import LraImport from '@/components/pelaporan/LraImport'
import LraTagModal from '@/components/pelaporan/LraTagModal'
import LraDetailModal from '@/components/pelaporan/LraDetailModal'
import {
  JENIS_BM, BULAN_SINGKAT, GOL_URAIAN, TANPA_REK, TANPA_GOL,
  rekapModal, rekapKapitalisasi, rekapReklas, rekapApp, rekapAppBarang,
  selisihMatrix, silangRekBarang, statusSilang, leafLra,
  type LraRow, type AppRow, type RekapMatrix, type Silang,
} from '@/lib/lra'
import { bangunPohonLra, ratakanPohonLra } from '@/lib/lraPohon'
import LraRekapTable from '@/components/pelaporan/LraRekapTable'
import { angka, KelolaTandaBtn, MatrixTable, DasarSwitch, SilangTable } from '@/components/pelaporan/LraMatrixBlocks'
import { useProfilRole } from '@/components/useProfilRole'
import { useSkpdTree } from '@/components/useSkpdTree'
import { tahunAwal } from '@/lib/tahunKerja'
import { fetchApprovalScope } from '@/lib/roles'

const LRA_COLS = 'id,skpd_id,tanggal,bulan,no_bukti,kode_rekening,kode_grup3,kelompok,uraian,keterangan,debit,klasifikasi,jenis_tujuan'

/**
 * Tarik baris LRA + Entryan Aplikasi utk satu (tahun, scope SKPD). Diekstrak
 * 2026-09-11 supaya bisa dipanggil dari DUA jalur independen: `proses()`
 * (tab Daftar Transaksi LRA, manual via tombol Proses, terikat filter SKPD) &
 * effect auto-muat tab Rekap per SKPD (2026-09-11, permintaan user: "tanpa
 * perlu klik rekap, auto nampilin datanya" — SELALU `desc=null`, scope
 * SELURUHNYA yang boleh dibaca RLS, supaya pohonnya bisa direkursi sampai ke
 * bawah tanpa bergantung pilihan SKPD tab sebelah).
 */
async function fetchLraData(
  supabase: ReturnType<typeof createClient>, tahunVal: string, desc: number[] | null,
): Promise<{ lra: LraRow[]; appRows: AppRow[] }> {
  const lra: LraRow[] = []
  for (let from = 0; ; from += 1000) {
    let q = supabase.from('lra_realisasi').select(LRA_COLS)
      .eq('tahun', Number(tahunVal)).order('id').range(from, from + 999)
    if (desc) q = q.in('skpd_id', desc)
    const { data, error } = await q
    if (error) throw new Error(error.message)
    const batch = (data || []) as LraRow[]
    lra.push(...batch)
    if (batch.length < 1000) break
  }

  // Belanja modal sisi aplikasi (ledger `pengadaan`) — DIAGREGASI DI SERVER.
  // Dulu ditarik mentah ke browser → RLS aset per-baris + ~227rb aset bikin
  // statement timeout 8s. Sekarang lewat RPC (SECURITY DEFINER, scope RLS
  // direplikasi): balikannya maks 5 jenis × 12 bulan × jumlah SKPD berdata.
  const { data: appData, error: appErr } = await supabase.rpc('fn_lra_belanja_modal', {
    p_tahun: Number(tahunVal), p_skpd_ids: desc,
  })
  if (appErr) throw new Error(appErr.message)
  // ⚠️ `golongan` baru ada sejak migrasi 20260909_01, `skpd_id` sejak
  // 20260910_05. Kalau migrasinya belum jalan keduanya `undefined` →
  // dinormalisasi jadi `null` ("tak bisa dinilai" / "tak diketahui SKPD-nya"),
  // dan halaman MENGATAKANNYA (strip amber) alih-alih diam-diam menampilkan
  // matriks/rekap kosong yang terbaca "memang tak ada apa-apa".
  const appRows: AppRow[] = ((appData || []) as { skpd_id?: number | null; grup: string | null; golongan?: string | null; bulan: number; nilai: number }[])
    .map(d => ({ skpd_id: d.skpd_id ?? null, grup: d.grup, golongan: d.golongan ?? null, bulan: Number(d.bulan), nilai: Number(d.nilai || 0) }))

  return { lra, appRows }
}

export default function LraPage() {
  const supabase = createClient()
  // ⚠️ `skpdId` di sini SENGAJA cuma dipakai utk `bolehRekap` — `isAdmin` di
  // bawah (state, via `fetchApprovalScope`) sudah lebih dulu dipakai halaman
  // ini utk menggerbang tombol Import; dua sumber "admin" utk satu halaman
  // cuma bikin bingung mana yg otoritatif, jadi `role` dari hook ini TIDAK
  // ikut dipakai — bolehRekap bersandar ke `isAdmin` (state) yg sudah ada.
  const { skpdId: myScopeId } = useProfilRole()
  const { byId: skpdById, childrenOf, rootOf, loaded: skpdLoaded } = useSkpdTree()
  const [view, setView] = useState<'worksheet' | 'matrix'>('worksheet')
  const [org, setOrg] = useState<SkpdSelection>({ skpdId: null, descendantIds: null })
  const [tahun, setTahun] = useState(() => tahunAwal('2026'))
  const [rows, setRows] = useState<LraRow[] | null>(null)
  const [app, setApp] = useState<AppRow[]>([])
  const [loading, setLoading] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [tagMode, setTagMode] = useState<'kapitalisasi' | 'reklas_keluar' | null>(null)
  // Tab awal modal tanda: 'kandidat' saat "Tandai", 'ditandai' saat "Kelola tanda"
  // (batal tandai). Satu modal melayani keduanya.
  const [tagTab, setTagTab] = useState<'kandidat' | 'ditandai'>('kandidat')
  const [skpdNama, setSkpdNama] = useState<Map<number, string>>(new Map())
  const [detail, setDetail] = useState<{ judul: string; rows: LraRow[] } | null>(null)
  const [msg, setMsg] = useState('')
  // Dasar pengelompokan blok "Entryan Aplikasi" + kolom "Entry Aplikasi" di
  // Check. Bawaannya `rekening` = PERILAKU LAMA PERSIS — menambah tuas tak
  // boleh diam-diam mengubah angka yang sudah dibaca operator kemarin.
  const [dasar, setDasar] = useState<'rekening' | 'barang'>('rekening')
  // Import Excel LRA = admin-only (permintaan user 2026-08-26) — Pengurus
  // Barang/Pembantu/Pengawas tak perlu. Penegak sesungguhnya trigger DB
  // fn_lra_realisasi_guard (migrasi 20260826_02); ini cuma menyembunyikan
  // tombolnya supaya non-admin tak mengklik lalu kena pesan error.
  const [isAdmin, setIsAdmin] = useState(false)
  useEffect(() => { fetchApprovalScope(supabase).then(s => setIsAdmin(s.isAdmin)) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Rekap per SKPD = admin ATAU siapa pun yang punya anak SKPD di bawahnya
  // (keputusan user 2026-09-10) — sama persis dgn LaporanPerolehan/Perpindahan/
  // Reklas/Koreksi/Penghapusan/Pengamanan.
  const bolehRekap = isAdmin || (myScopeId != null && (childrenOf.get(myScopeId)?.length ?? 0) > 0)

  const proses = useCallback(async () => {
    setLoading(true); setMsg('')
    try {
      const desc = org.descendantIds ?? null
      const { lra, appRows } = await fetchLraData(supabase, tahun, desc)

      // Nama SKPD untuk popup rincian (hanya id yang muncul di data).
      const ids = [...new Set(lra.map(r => r.skpd_id))]
      const nm = new Map<number, string>()
      for (let i = 0; i < ids.length; i += 200) {
        const { data } = await supabase.from('admin_skpd').select('id,nama').in('id', ids.slice(i, i + 200))
        for (const s of (data || []) as { id: number; nama: string }[]) nm.set(s.id, s.nama)
      }
      setSkpdNama(nm)
      setRows(lra); setApp(appRows)
    } catch (e) {
      setMsg(`Error: ${(e as Error).message}`)
    } finally {
      setLoading(false)
    }
  }, [org, tahun, supabase])

  // ── Rekap per SKPD berjenjang: AUTO-MUAT, tanpa tombol Proses ───────────
  // (keputusan user 2026-09-11): "untuk yang rekap per SKPD ini tanpa perlu
  // klik rekap, tapi ya auto nampilin datanya". Tahun-nya sendiri (bukan
  // `tahun` milik tab Daftar Transaksi LRA — dua tab ini punya filter
  // terbalik: tab satu perlu pilih SKPD+Tahun+klik Proses, tab ini cukup
  // pilih Tahun & langsung berubah). Scope SELALU seluruh yg RLS izinkan
  // (`desc=null`) — pohonnya butuh id SKPD lintas cabang, bukan satu subtree
  // hasil pilihan combobox tab sebelah.
  const [tahunMatrix, setTahunMatrix] = useState(() => tahunAwal('2026'))
  const [matrixRows, setMatrixRows] = useState<LraRow[] | null>(null)
  const [matrixApp, setMatrixApp] = useState<AppRow[]>([])
  const [matrixLoading, setMatrixLoading] = useState(false)
  const [matrixErr, setMatrixErr] = useState('')

  useEffect(() => {
    // Gerbangnya sama dgn tab-nya sendiri (`bolehRekap`) — pengguna yang
    // memang tak akan pernah melihat tab ini tak perlu menanggung query-nya.
    if (!bolehRekap) return
    let batal = false
    void (async () => {
      setMatrixLoading(true); setMatrixErr('')
      try {
        const { lra, appRows } = await fetchLraData(supabase, tahunMatrix, null)
        if (!batal) { setMatrixRows(lra); setMatrixApp(appRows) }
      } catch (e) {
        if (!batal) setMatrixErr(`Gagal memuat Rekap per SKPD: ${(e as Error).message}`)
      } finally {
        if (!batal) setMatrixLoading(false)
      }
    })()
    return () => { batal = true }
  }, [tahunMatrix, bolehRekap, supabase])

  const mLra = rows ? rekapModal(rows) : null
  const mKap = rows ? rekapKapitalisasi(rows) : null
  const mRek = rows ? rekapReklas(rows) : null
  // Kedua dasar dihitung SELALU (bukan cuma yang sedang dipilih): keduanya
  // dipakai bersamaan — satu untuk tabel & Check, satunya untuk kalimat
  // "kalau dasarnya ditukar, angkanya jadi begini".
  const mAppRek = rows ? rekapApp(app) : null
  const mAppBar = rows ? rekapAppBarang(app) : null
  const mApp = dasar === 'barang' ? mAppBar : mAppRek
  const silang = rows ? silangRekBarang(app) : null
  // Migrasi 20260909_01 belum jalan → seluruh baris tanpa `golongan`.
  const golonganKosong = !!rows && app.length > 0 && app.every(r => !r.golongan)
  const check = mLra && mKap && mRek && mApp ? selisihMatrix(mLra, mKap, mRek, mApp) : null

  // Migrasi 20260910_05 belum jalan → seluruh baris `app` tanpa `skpd_id`,
  // jadi belanjaModal tiap leaf akan 0 walau `app` sendiri tak kosong.
  const skpdIdKosong = !!matrixRows && matrixApp.length > 0 && matrixApp.every(r => r.skpd_id == null)

  // ── Rekap per SKPD berjenjang (tab "Rekap per SKPD") ────────────────────
  const matrixLra = (() => {
    if (!matrixRows || !skpdLoaded) return []
    const leaf = leafLra(matrixRows, matrixApp)
    const akarIds = isAdmin
      ? [...new Set([...leaf.keys()].map(id => rootOf(id)?.id ?? id))]
      : (myScopeId != null ? [myScopeId] : [])
    return bangunPohonLra(leaf, skpdById, akarIds)
  })()

  function handleExportMatrix() {
    // Tab ini tak punya filter SKPD (selalu seluruh scope RLS) — namanya
    // di berkas ikut peran: admin = se-Kabupaten (`null`), pengurus barang =
    // SKPD-nya sendiri.
    const namaScope = isAdmin ? null : (myScopeId != null ? (skpdById.get(myScopeId)?.nama ?? null) : null)
    exportToExcel(ratakanPohonLra(matrixLra).map(({ row: r, namaBerindentasi }) => ({
      'SKPD': namaBerindentasi,
      'Total LRA': r.cell.totalLra,
      'Kapitalisasi': r.cell.kapitalisasi,
      'Reklasifikasi': r.cell.reklas,
      'Belanja Modal (App)': r.cell.belanjaModal,
      'Selisih': r.cell.totalLra + r.cell.kapitalisasi - r.cell.reklas - r.cell.belanjaModal,
    })), namaBerkasLaporan({
      laporan: 'LRA Rekonsiliasi', periode: tahunMatrix,
      skpd: namaScope, akhiran: ['per SKPD'],
    }), 'Rekap per SKPD')
  }

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
    // ⚠️ KEDUA dasar ikut ke berkas, bukan cuma yang sedang tampil di layar.
    // Berkas yang cuma memuat salah satunya tak bisa dibaca balik: pembacanya
    // tak punya cara tahu tuas mana yang aktif waktu tombol Export ditekan.
    push('Belanja Modal Aplikasi (dasar kode rekening)', mAppRek!)
    push('Belanja Modal Aplikasi (dasar kode barang)', mAppBar!)
    for (const j of JENIS_BM) {
      out.push({
        Blok: `CHECK (dasar ${dasar === 'barang' ? 'kode barang' : 'kode rekening'})`,
        Jenis: `${j.grup} — ${j.uraian}`,
        LRA: mLra.totalJenis[j.grup], Kapitalisasi: mKap.totalJenis[j.grup], Reklasifikasi: mRek.totalJenis[j.grup],
        Seharusnya: mLra.totalJenis[j.grup] + mKap.totalJenis[j.grup] - mRek.totalJenis[j.grup],
        EntryAplikasi: mApp.totalJenis[j.grup], Selisih: check.perJenis[j.grup],
      })
    }
    // Persilangan: satu baris per (rekening × golongan) yang ada isinya, plus
    // penanda SILANG supaya bisa disaring/di-pivot langsung di Excel.
    if (silang) {
      for (const b of silang.baris) for (const k of silang.kolom) {
        const v = silang.sel[b]?.[k] ?? 0
        if (v === 0) continue
        const st = statusSilang(b === TANPA_REK ? null : b, k === TANPA_GOL ? null : k)
        out.push({
          Blok: 'PERSILANGAN',
          Jenis: `${b} — ${JENIS_BM.find(j => j.grup === b)?.uraian ?? ''}`.replace(/ — $/, ''),
          KodeBarang: `${k} — ${GOL_URAIAN[k] ?? ''}`.replace(/ — $/, ''),
          Nilai: v,
          Status: st === false ? 'SILANG' : st === true ? 'cocok' : 'tak bisa dinilai',
        })
      }
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

      {/* ⚠️ Tab bar DI PALING ATAS (permintaan user 2026-09-11) — filternya
          TERBALIK antara dua tab: "Daftar Transaksi LRA" (dulu "Ringkasan")
          tetap perlu pilih SKPD+Tahun lalu klik Proses; "Rekap per SKPD" AUTO
          menampilkan datanya begitu tahunnya dipilih, tanpa tombol apa pun.
          Rekap per SKPD = admin ATAU siapa pun yang punya anak SKPD di
          bawahnya (keputusan 2026-09-10) — lihat `bolehRekap`. */}
      <div className="mb-4 inline-flex rounded-lg border border-gray-200 bg-gray-50 p-1 text-sm">
        {([['worksheet', 'Daftar Transaksi LRA'] as const,
          ...(bolehRekap ? [['matrix', 'Rekap per SKPD'] as const] : [])] as const).map(([v, label]) => (
          <button key={v} onClick={() => setView(v as typeof view)}
            className={`px-4 py-1.5 rounded-md transition-colors ${view === v ? 'bg-white shadow-sm font-medium text-gray-800' : 'text-gray-500 hover:text-gray-700'}`}>
            {label}
          </button>
        ))}
      </div>

      {view === 'matrix' ? (
        <div className="space-y-3">
          {matrixErr && <div className="p-3 rounded-lg text-sm bg-red-50 text-red-700">{matrixErr}</div>}
          <div className="card p-4 flex flex-wrap items-end justify-between gap-3">
            <div className="flex items-center gap-3">
              <label className="text-sm text-gray-600">Tahun :</label>
              <select className="select-filter w-28" value={tahunMatrix} onChange={e => setTahunMatrix(e.target.value)}>
                {['2025', '2026', '2027'].map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            {matrixLra.length > 0 && <button className="btn-secondary" onClick={handleExportMatrix}>Export Excel</button>}
          </div>
          <p className="text-xs text-gray-500">
            Total LRA · Kapitalisasi · Reklasifikasi (dari box LRA hasil import) dibandingkan Belanja Modal
            hasil entry Pengadaan di aplikasi, per SKPD (bisa dibuka sampai sub-unit terbawah). Kolom Belanja
            Modal di sini memakai dasar KODE REKENING (sebanding langsung dgn Total LRA) — sama seperti Check
            di tab Daftar Transaksi LRA.
          </p>
          {skpdIdKosong && (
            <div className="p-3 rounded-lg text-sm bg-amber-50 text-amber-700">
              Kolom SKPD belum terbaca dari server — migrasi <b>20260910_05_lra_belanja_modal_per_skpd.sql</b> belum
              dijalankan. Kolom &quot;Belanja Modal (App)&quot; di tabel ini akan 0 untuk semua baris sampai migrasinya jalan;
              angka di tab Daftar Transaksi LRA TIDAK terpengaruh.
            </div>
          )}
          <p className="text-xs text-gray-400">
            Kolom Status pada SKPD yang punya banyak sub-unit (mis. Dinas Pendidikan) WAJAR menunjukkan
            "Selisih": realisasi belanja modal sub-unitnya sering tercatat atas nama SKPD induk di ledger
            Pengadaan, sementara sebagian box LRA-nya tercatat langsung di sub-unit.
          </p>
          <LraRekapTable rows={matrixLra} loading={matrixLoading} />
        </div>
      ) : (
        <>
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
                  <button className="btn-secondary" onClick={() => { setTagTab('kandidat'); setTagMode('kapitalisasi') }}>Tandai Kapitalisasi</button>
                  <button className="btn-secondary" onClick={() => { setTagTab('kandidat'); setTagMode('reklas_keluar') }}>Tandai Reklasifikasi</button>
                </div>
              </div>

              <MatrixTable judul={`LRA — Belanja Modal (5.2) ${tahun}`} m={mLra!}
                onDrill={drill('LRA', rows.filter(r => r.kelompok === 'modal'), r => r.kode_grup3)} />
              <MatrixTable judul="Kapitalisasi (belanja barjas 5.1 → belanja modal)" m={mKap!} kosongNote="Belum ada baris ditandai Kapitalisasi."
                aksi={<KelolaTandaBtn onClick={() => { setTagTab('ditandai'); setTagMode('kapitalisasi') }} />}
                onDrill={drill('Kapitalisasi', rows.filter(r => r.klasifikasi === 'kapitalisasi'), r => r.jenis_tujuan)} />
              <MatrixTable judul="Reklasifikasi (belanja modal dikeluarkan)" m={mRek!} kosongNote="Belum ada baris ditandai Reklasifikasi."
                aksi={<KelolaTandaBtn onClick={() => { setTagTab('ditandai'); setTagMode('reklas_keluar') }} />}
                onDrill={drill('Reklasifikasi', rows.filter(r => r.klasifikasi === 'reklas_keluar'), r => r.kode_grup3)} />
              <MatrixTable
                judul={`Belanja Modal — Entryan Aplikasi (dasar ${dasar === 'barang' ? 'KODE BARANG' : 'KODE REKENING'})`}
                m={mApp!}
                aksi={<DasarSwitch nilai={dasar} onGanti={setDasar} />}
                note={mApp!.luarJenis > 0
                  ? (dasar === 'barang'
                    ? `${angka(mApp!.luarJenis)} belanja mendarat di golongan yang BUKAN aset tetap 1.3.1–1.3.5 — mis. 1.3.6 Konstruksi Dalam Pengerjaan (termin kontrak yang belum selesai), Aset Tidak Berwujud, atau Aset Lain-Lain. Realisasinya nyata, cuma belum jadi aset tetap; rinciannya ada di tabel Persilangan.`
                    : `${angka(mApp!.luarJenis)} dari pengadaan berada di luar objek 5.2.01–05 (mis. 5.2.06 Aset Tidak Berwujud), atau termin KDP yang kode rekeningnya belum diisi — tidak masuk tabel ini.`)
                  : undefined} />

              {/* ── PERSILANGAN rekening × kode barang ──
                  Ini yang menjelaskan kenapa dua dasar di atas bisa beda sebaran.
                  Diagonal = belanja mendarat di jenis aset yang sesuai; di luar
                  diagonal = temuan yang perlu penjelasan di CaLK / koreksi
                  reklasifikasi. */}
              <SilangTable s={silang!} belumMigrasi={golonganKosong} />

              {/* ── CHECK ── */}
              <div className="card overflow-hidden">
                <div className="px-4 py-2.5 border-b border-gray-100 bg-gray-50/60 flex items-center justify-between">
                  <p className="text-sm font-semibold text-gray-800">
                    Check — LRA + Kapitalisasi − Reklasifikasi vs Entry Aplikasi
                    <span className="ml-2 text-xs font-normal text-gray-500">(dasar {dasar === 'barang' ? 'kode barang' : 'kode rekening'})</span>
                  </p>
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
                  {dasar === 'barang'
                    ? ' Dasar KODE BARANG: selisih per jenis di sini juga memuat persilangan klasifikasi — belanja rekening A yang barangnya golongan B. Lihat tabel Persilangan di atas.'
                    : ' Dasar KODE REKENING: kedua sisi dikelompokkan per jenis belanja, jadi persilangan klasifikasi TIDAK terlihat di sini — pindahkan tuas ke Kode Barang, atau baca tabel Persilangan di atas.'}
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {showImport && (
        <LraImport onClose={() => setShowImport(false)} onDone={m => { setShowImport(false); setMsg(m); proses() }} />
      )}
      {tagMode && (
        <LraTagModal mode={tagMode} initialTab={tagTab} tahun={tahun} descendantIds={org.descendantIds ?? null}
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
