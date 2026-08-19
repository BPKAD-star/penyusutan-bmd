'use client'
// Dashboard IPA (Indeks Pengelolaan Aset) — port dari dashboard/page.tsx di
// github.com/BPKAD-star/ipa-bmd-kediri, jadi client component (browser client
// + RLS, bukan service-role). Tambahan di luar source (disetujui user):
// aksi Verifikasi/Tolak per baris + panel kelola Tahun Anggaran IPA — tanpa
// itu alur submit->verifikasi buntu total & fitur gak bisa dipakai sama sekali
// (selalu "tidak ada tahun aktif").
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import {
  indeksTertimbangKeKategori, ipaKeDisplay, stKeDisplay, ST_MAX,
} from '@/lib/ipaEngine'
import type { KategoriIPA, StatusRecord } from '@/lib/ipaTypes'
import { useKonfirmasi } from '@/shared/ui/konfirmasi'

type TahunRow = { id: string; tahun: number; batas_submit_pb: string | null; batas_submit_bkad: string | null; is_active: boolean }

type RecordDenganSKPD = {
  id: string
  st1_nilai: number; st2_nilai: number; st3_nilai: number; st4_nilai: number
  ipa_final: number
  ipa_kategori: KategoriIPA
  status: StatusRecord
  skpd: { id: number; nama: string; kode_lokasi: string | null; kelompok_fpk: number | null } | null
}

const SEMUA_KATEGORI: KategoriIPA[] = ['Sangat Baik', 'Baik', 'Cukup', 'Buruk']

const C_KAT: Record<KategoriIPA, { latar: string; teks: string; ring: string; titik: string }> = {
  'Sangat Baik': { latar: 'bg-emerald-50', teks: 'text-emerald-700', ring: 'ring-emerald-200', titik: 'bg-emerald-500' },
  'Baik':        { latar: 'bg-sky-50',     teks: 'text-sky-700',     ring: 'ring-sky-200',     titik: 'bg-sky-500' },
  'Cukup':       { latar: 'bg-amber-50',   teks: 'text-amber-700',   ring: 'ring-amber-200',   titik: 'bg-amber-500' },
  'Buruk':       { latar: 'bg-red-50',     teks: 'text-red-700',     ring: 'ring-red-200',     titik: 'bg-red-500' },
}

const C_STATUS: Record<StatusRecord, { latar: string; teks: string }> = {
  draft:        { latar: 'bg-slate-100',   teks: 'text-slate-600' },
  diajukan:     { latar: 'bg-blue-100',    teks: 'text-blue-700' },
  diverifikasi: { latar: 'bg-emerald-100', teks: 'text-emerald-700' },
  ditolak:      { latar: 'bg-red-100',     teks: 'text-red-700' },
}
const LABEL_STATUS: Record<StatusRecord, string> = {
  draft: 'Draft', diajukan: 'Diajukan', diverifikasi: 'Terverifikasi', ditolak: 'Ditolak',
}
const C_KELOMPOK: Record<number, string> = {
  1: 'bg-indigo-100 text-indigo-700', 2: 'bg-sky-100 text-sky-700',
  3: 'bg-slate-100 text-slate-600', 4: 'bg-slate-100 text-slate-500',
}

function fmt(n: number) { return n.toFixed(2) }
function warnaBatang(v: number) {
  if (v >= 80) return 'bg-emerald-500'
  if (v >= 60) return 'bg-sky-500'
  if (v >= 40) return 'bg-amber-500'
  if (v >= 20) return 'bg-orange-500'
  return 'bg-red-500'
}
function warnaAngkaST(pct: number) {
  if (pct >= 80) return 'text-emerald-700'
  if (pct >= 60) return 'text-sky-700'
  if (pct >= 40) return 'text-amber-700'
  return 'text-red-700'
}

function ScoreBar({ nilai, className = '' }: { nilai: number; className?: string }) {
  const w = Math.min(100, Math.max(0, nilai))
  return (
    <div className={`w-full bg-slate-100 rounded-full h-1.5 overflow-hidden ${className}`}>
      <div className={`h-full rounded-full ${warnaBatang(nilai)}`} style={{ width: `${w}%` }} />
    </div>
  )
}
function KategoriPill({ k }: { k: KategoriIPA }) {
  const c = C_KAT[k]
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ring-1 ring-inset ${c.latar} ${c.teks} ${c.ring}`}>
      <span className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${c.titik}`} />
      {k}
    </span>
  )
}
function StatusBadge({ status }: { status: StatusRecord }) {
  const c = C_STATUS[status]
  return <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${c.latar} ${c.teks}`}>{LABEL_STATUS[status]}</span>
}
function KelompokBadge({ k }: { k: number }) {
  const style = C_KELOMPOK[k] ?? 'bg-slate-100 text-slate-600'
  return <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${style}`}>{k}</span>
}

export default function DashboardIPAPage() {
  const supabase = createClient()
  const konfirmasi = useKonfirmasi()
  const [loading, setLoading] = useState(true)
  const [isAdminUmum, setIsAdminUmum] = useState(false)
  const [ipaRole, setIpaRole] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)

  const [tahunList, setTahunList] = useState<TahunRow[]>([])
  const [tahunAktif, setTahunAktif] = useState<TahunRow | null>(null)
  const [totalSkpd, setTotalSkpd] = useState(0)
  const [records, setRecords] = useState<RecordDenganSKPD[]>([])
  const [showTahunPanel, setShowTahunPanel] = useState(false)
  const [tahunForm, setTahunForm] = useState({ tahun: '', batas_submit_pb: '', batas_submit_bkad: '' })
  const [tahunMsg, setTahunMsg] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)

  const bisaVerifikasi = isAdminUmum || ipaRole === 'bkad_verifier' || ipaRole === 'bkad_admin'
  const bisaKelolaTahun = isAdminUmum || ipaRole === 'bkad_admin'

  const load = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    let admin = false
    let role: string | null = null
    if (user) {
      setUserId(user.id)
      const { data: profile } = await supabase.from('admin_profiles').select('role,ipa_role').eq('id', user.id).single()
      admin = profile?.role === 'admin'
      role = (profile?.ipa_role as string | null) ?? null
      setIsAdminUmum(admin)
      setIpaRole(role)
    }

    const { data: tahunRows } = await supabase.from('ipa_tahun_anggaran')
      .select('id,tahun,batas_submit_pb,batas_submit_bkad,is_active').order('tahun', { ascending: false })
    setTahunList((tahunRows as TahunRow[]) || [])
    const aktif = ((tahunRows as TahunRow[]) || []).find(t => t.is_active) || null
    setTahunAktif(aktif)

    const { count } = await supabase.from('admin_skpd').select('id', { count: 'exact', head: true }).eq('jabatan', 'pengguna barang')
    setTotalSkpd(count ?? 0)

    if (aktif) {
      const { data } = await supabase.from('ipa_record')
        .select('id,st1_nilai,st2_nilai,st3_nilai,st4_nilai,ipa_final,ipa_kategori,status,skpd:skpd_id(id,nama,kode_lokasi,kelompok_fpk)')
        .eq('tahun_id', aktif.id).order('ipa_final', { ascending: false })
      setRecords((data as unknown as RecordDenganSKPD[]) || [])
    } else {
      setRecords([])
    }

    setLoading(false)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() }, [load])

  async function handleAktifkanTahun(id: string) {
    setTahunMsg('')
    await supabase.from('ipa_tahun_anggaran').update({ is_active: false }).eq('is_active', true)
    const { error } = await supabase.from('ipa_tahun_anggaran').update({ is_active: true }).eq('id', id)
    if (error) setTahunMsg(`Error: ${error.message}`)
    load()
  }

  async function handleTambahTahun(e: React.FormEvent) {
    e.preventDefault()
    setTahunMsg('')
    const tahunNum = parseInt(tahunForm.tahun, 10)
    if (!tahunNum) { setTahunMsg('Tahun wajib diisi.'); return }
    const { error } = await supabase.from('ipa_tahun_anggaran').insert({
      tahun: tahunNum,
      batas_submit_pb: tahunForm.batas_submit_pb || null,
      batas_submit_bkad: tahunForm.batas_submit_bkad || null,
    })
    if (error) { setTahunMsg(`Error: ${error.message}`); return }
    setTahunForm({ tahun: '', batas_submit_pb: '', batas_submit_bkad: '' })
    load()
  }

  async function handleVerifikasi(recordId: string) {
    if (!userId) return
    setBusyId(recordId)
    await supabase.from('ipa_record').update({
      status: 'diverifikasi', verified_at: new Date().toISOString(), verified_by: userId,
    }).eq('id', recordId)
    await supabase.from('ipa_log').insert({ ipa_record_id: recordId, user_id: userId, aksi: 'verifikasi' })
    await load()
    setBusyId(null)
  }

  async function handleTolak(recordId: string) {
    if (!userId) return
    const { ya, catatan } = await konfirmasi({
      nada: 'merah', ikon: '↩', judul: 'Tolak penilaian IPA ini?',
      isi: <>Penilaiannya dikembalikan ke pengurus barang untuk diperbaiki.</>,
      catatan: {
        label: 'Alasan penolakan',
        placeholder: 'Mis. bukti dukung sub-tema 2 belum diunggah; nilai ST3 tak sesuai dokumen.',
        petunjuk: <><b>Wajib diisi</b> — ini satu-satunya keterangan yang sampai ke pengurus barang.</>,
      },
      labelYa: 'Ya, tolak',
    })
    if (!ya) return
    // Halaman ini tak punya kotak pesan sendiri, jadi penolakan tanpa alasan
    // dijawab dengan pemberitahuan satu tombol (pengganti `alert()`). Perilaku
    // LAMA-nya: `prompt` yang dikosongkan membatalkan aksinya DIAM-DIAM —
    // operator menekan OK, tak terjadi apa-apa, tanpa satu pun keterangan.
    if (!catatan.trim()) {
      await konfirmasi({
        nada: 'amber', ikon: '⚠', judul: 'Alasan penolakan wajib diisi',
        isi: <>Tanpa alasan, pengurus barang tak punya cara tahu apa yang harus diperbaiki.
          Penolakan dibatalkan — silakan ulangi.</>,
        labelYa: 'Mengerti', tanpaBatal: true,
      })
      return
    }
    setBusyId(recordId)
    await supabase.from('ipa_record').update({
      status: 'ditolak', verified_at: new Date().toISOString(), verified_by: userId, catatan_verifikasi: catatan.trim(),
    }).eq('id', recordId)
    await supabase.from('ipa_log').insert({ ipa_record_id: recordId, user_id: userId, aksi: 'tolak', keterangan: catatan.trim() })
    await load()
    setBusyId(null)
  }

  const n = records.length
  const ipaDaerah = n > 0 ? records.reduce((s, r) => s + r.ipa_final, 0) / n : 0
  const kategoriDaerah = indeksTertimbangKeKategori(ipaDaerah)
  const avgST = (k: keyof Pick<RecordDenganSKPD, 'st1_nilai' | 'st2_nilai' | 'st3_nilai' | 'st4_nilai'>) =>
    n > 0 ? records.reduce((s, r) => s + r[k], 0) / n : 0
  const avgST1 = avgST('st1_nilai'); const avgST2 = avgST('st2_nilai')
  const avgST3 = avgST('st3_nilai'); const avgST4 = avgST('st4_nilai')

  const distribusi = Object.fromEntries(
    SEMUA_KATEGORI.map(k => [k, records.filter(r => r.ipa_kategori === k).length]),
  ) as Record<KategoriIPA, number>

  const sudahDinilaiIds = new Set(records.flatMap(r => (r.skpd ? [r.skpd.id] : [])))
  const belumDinilai = Math.max(0, totalSkpd - sudahDinilaiIds.size)
  const pctCakupan = totalSkpd > 0 ? (sudahDinilaiIds.size / totalSkpd) * 100 : 0

  const stDefs = [
    { label: 'ST1 · Akuntabilitas',    sub: 'Tindak Lanjut LHP',          avg: avgST1, stKey: 'ST1' as const, bobot: 20 },
    { label: 'ST2 · Kepatuhan',        sub: 'Penyampaian Dokumen BMD',    avg: avgST2, stKey: 'ST2' as const, bobot: 30 },
    { label: 'ST3 · Wasdalmen',        sub: 'Pengawasan & Pengendalian',  avg: avgST3, stKey: 'ST3' as const, bobot: 35 },
    { label: 'ST4 · Administrasi BMD', sub: 'Sertifikasi Dokumen',        avg: avgST4, stKey: 'ST4' as const, bobot: 15 },
  ]

  if (loading) return <div className="p-8 text-center text-sm text-gray-400">Memuat...</div>

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        <div className="flex flex-wrap items-start justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Indeks Pengelolaan Aset Daerah</h1>
            <p className="text-sm text-slate-500 mt-0.5">Kabupaten Kediri · Kepmen Dalam Negeri No. 900.1.15-136 Tahun 2026</p>
          </div>
          <div className="flex items-center gap-2">
            {tahunAktif ? (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 border border-blue-200 rounded-lg">
                <span className="h-2 w-2 rounded-full bg-blue-500 animate-pulse flex-shrink-0" />
                <span className="text-sm font-semibold text-blue-800">TA {tahunAktif.tahun}</span>
                {tahunAktif.batas_submit_pb && (
                  <span className="text-xs text-blue-500 border-l border-blue-200 pl-2">Submit PB: {tahunAktif.batas_submit_pb}</span>
                )}
              </div>
            ) : (
              <div className="px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700 font-medium">
                Tidak ada tahun anggaran aktif
              </div>
            )}
            <Link href="/dashboard/ipa/penilaian" className="btn-primary text-sm">+ Input Penilaian</Link>
          </div>
        </div>

        {bisaKelolaTahun && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm mb-6 overflow-hidden">
            <button onClick={() => setShowTahunPanel(v => !v)}
              className="w-full px-5 py-3 flex items-center justify-between text-sm font-semibold text-slate-700 hover:bg-slate-50">
              Kelola Tahun Anggaran IPA
              <span className="text-slate-400 text-xs">{showTahunPanel ? 'Tutup ▲' : 'Buka ▼'}</span>
            </button>
            {showTahunPanel && (
              <div className="px-5 pb-5 border-t border-slate-100 pt-4">
                {tahunMsg && <p className={`text-xs mb-3 ${tahunMsg.startsWith('Error') ? 'text-red-600' : 'text-emerald-600'}`}>{tahunMsg}</p>}
                <form onSubmit={handleTambahTahun} className="grid grid-cols-1 sm:grid-cols-4 gap-2 mb-4">
                  <input type="number" placeholder="Tahun" required value={tahunForm.tahun}
                    onChange={e => setTahunForm(f => ({ ...f, tahun: e.target.value }))}
                    className="px-3 py-2 text-sm border border-slate-300 rounded-lg" />
                  <input type="date" placeholder="Batas submit PB" value={tahunForm.batas_submit_pb}
                    onChange={e => setTahunForm(f => ({ ...f, batas_submit_pb: e.target.value }))}
                    className="px-3 py-2 text-sm border border-slate-300 rounded-lg" />
                  <input type="date" placeholder="Batas submit BKAD" value={tahunForm.batas_submit_bkad}
                    onChange={e => setTahunForm(f => ({ ...f, batas_submit_bkad: e.target.value }))}
                    className="px-3 py-2 text-sm border border-slate-300 rounded-lg" />
                  <button type="submit" className="btn-primary text-sm">+ Tambah Tahun</button>
                </form>
                <div className="divide-y divide-slate-50">
                  {tahunList.length === 0 && <p className="text-xs text-slate-400 py-3">Belum ada tahun anggaran IPA.</p>}
                  {tahunList.map(t => (
                    <div key={t.id} className="flex items-center justify-between py-2.5">
                      <div>
                        <p className="text-sm font-medium text-slate-800">TA {t.tahun}</p>
                        <p className="text-xs text-slate-400">
                          PB: {t.batas_submit_pb || '-'} · BKAD: {t.batas_submit_bkad || '-'}
                        </p>
                      </div>
                      {t.is_active ? (
                        <span className="text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-1 rounded-full">Aktif</span>
                      ) : (
                        <button onClick={() => handleAktifkanTahun(t.id)}
                          className="text-xs font-medium text-blue-600 hover:text-blue-800">Aktifkan</button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">IPA Daerah</p>
            <div className="mt-2 flex items-end gap-2">
              <span className="text-4xl font-bold text-slate-900 tabular-nums leading-none">{n > 0 ? fmt(ipaDaerah) : '—'}</span>
            </div>
            {n > 0 && <div className="mt-2 mb-1"><KategoriPill k={kategoriDaerah} /></div>}
            <ScoreBar nilai={n > 0 ? ipaKeDisplay(ipaDaerah) : 0} className="mt-2" />
            <p className="text-xs text-slate-400 mt-1.5">{n > 0 ? `Indeks ${fmt(ipaDaerah)} · dari ${n} SKPD` : 'Belum ada data penilaian'}</p>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total SKPD</p>
            <p className="text-4xl font-bold text-slate-900 mt-2 tabular-nums leading-none">{totalSkpd}</p>
            <p className="text-xs text-slate-400 mt-4 pt-3 border-t border-slate-50">SKPD di lingkungan daerah</p>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Sudah Dinilai</p>
            <div className="mt-2 flex items-end gap-2 leading-none">
              <span className="text-4xl font-bold text-slate-900 tabular-nums">{sudahDinilaiIds.size}</span>
              <span className="text-sm text-slate-400 mb-0.5">({pctCakupan.toFixed(0)}%)</span>
            </div>
            <ScoreBar nilai={pctCakupan} className="mt-3" />
            <p className="text-xs text-slate-400 mt-1.5">dari {totalSkpd} SKPD</p>
          </div>

          <div className={`rounded-xl border p-5 shadow-sm ${belumDinilai > 0 ? 'bg-amber-50 border-amber-200' : 'bg-white border-slate-200'}`}>
            <p className={`text-xs font-semibold uppercase tracking-wider ${belumDinilai > 0 ? 'text-amber-600' : 'text-slate-500'}`}>Belum Dinilai</p>
            <p className={`text-4xl font-bold mt-2 tabular-nums leading-none ${belumDinilai > 0 ? 'text-amber-700' : 'text-slate-900'}`}>{belumDinilai}</p>
            <p className={`text-xs mt-4 pt-3 border-t ${belumDinilai > 0 ? 'text-amber-600 border-amber-100' : 'text-slate-400 border-slate-50'}`}>
              {belumDinilai > 0 ? 'SKPD perlu segera diinput' : 'Semua SKPD telah dinilai'}
            </p>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm mb-6">
          <h2 className="text-sm font-semibold text-slate-700 mb-4">Distribusi Kategori IPA</h2>
          {n > 0 ? (
            <div className="flex flex-wrap gap-3">
              {SEMUA_KATEGORI.map(k => {
                const c = C_KAT[k]; const jml = distribusi[k]; const pct = ((jml / n) * 100).toFixed(0)
                return (
                  <div key={k} className={`flex items-center gap-3 px-4 py-2.5 rounded-lg ring-1 ring-inset ${c.latar} ${c.ring}`}>
                    <span className={`h-2.5 w-2.5 rounded-full flex-shrink-0 ${c.titik}`} />
                    <div>
                      <p className={`text-xs font-medium leading-tight ${c.teks}`}>{k}</p>
                      <div className={`flex items-baseline gap-1 ${c.teks}`}>
                        <span className="text-xl font-bold tabular-nums">{jml}</span>
                        <span className="text-xs opacity-60">({pct}%)</span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : <p className="text-sm text-slate-400 py-2">Belum ada data penilaian untuk ditampilkan.</p>}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {stDefs.map(st => {
            const disp = stKeDisplay(st.avg, st.stKey)
            const normalizedIPA = ST_MAX[st.stKey] > 0 ? (st.avg / ST_MAX[st.stKey]) * 4 : 0
            const kat = n > 0 ? indeksTertimbangKeKategori(normalizedIPA) : null
            return (
              <div key={st.label} className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-800 leading-tight">{st.label}</p>
                    <p className="text-xs text-slate-400 mt-0.5 leading-tight">{st.sub}</p>
                  </div>
                  <span className="flex-shrink-0 text-xs font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">{st.bobot}%</span>
                </div>
                <p className="text-3xl font-bold text-slate-900 mt-3 tabular-nums leading-none">{n > 0 ? fmt(st.avg) : '—'}</p>
                {kat && <div className="mt-2"><KategoriPill k={kat} /></div>}
                <ScoreBar nilai={n > 0 ? disp : 0} className="mt-3" />
              </div>
            )
          })}
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-700">Daftar Penilaian SKPD</h2>
              <p className="text-xs text-slate-400 mt-0.5">Diurutkan berdasarkan nilai IPA tertinggi</p>
            </div>
            <span className="text-xs font-medium text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full">{n} / {totalSkpd} SKPD</span>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100">
              <thead>
                <tr className="bg-slate-50 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  <th className="px-4 py-3 text-left w-8">#</th>
                  <th className="px-4 py-3 text-left">SKPD</th>
                  <th className="px-4 py-3 text-center">Klpk</th>
                  <th className="px-4 py-3 text-center">Nilai IPA</th>
                  <th className="px-4 py-3 text-center">Kategori</th>
                  <th className="px-4 py-3 text-right">ST1</th>
                  <th className="px-4 py-3 text-right">ST2</th>
                  <th className="px-4 py-3 text-right">ST3</th>
                  <th className="px-4 py-3 text-right">ST4</th>
                  <th className="px-4 py-3 text-center">Status</th>
                  {bisaVerifikasi && <th className="px-4 py-3 text-center">Aksi</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 bg-white">
                {records.map((r, idx) => (
                  <tr key={r.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="px-4 py-3 text-xs text-slate-400 tabular-nums">{idx + 1}</td>
                    <td className="px-4 py-3 min-w-[180px]">
                      <p className="text-sm font-medium text-slate-900 truncate max-w-xs">{r.skpd?.nama ?? '—'}</p>
                      <p className="text-xs text-slate-400">{r.skpd?.kode_lokasi ?? ''}</p>
                    </td>
                    <td className="px-4 py-3 text-center">{r.skpd?.kelompok_fpk ? <KelompokBadge k={r.skpd.kelompok_fpk} /> : '—'}</td>
                    <td className="px-4 py-3 text-center">
                      <p className="text-sm font-bold text-slate-900 tabular-nums">{fmt(r.ipa_final)}</p>
                      <ScoreBar nilai={ipaKeDisplay(r.ipa_final)} className="mt-1 w-16 mx-auto" />
                    </td>
                    <td className="px-4 py-3 text-center"><KategoriPill k={r.ipa_kategori} /></td>
                    {(['st1_nilai', 'st2_nilai', 'st3_nilai', 'st4_nilai'] as const).map((k, i) => {
                      const stKey = (['ST1', 'ST2', 'ST3', 'ST4'] as const)[i]
                      return (
                        <td key={i} className="px-4 py-3 text-right">
                          <span className={`text-xs font-semibold tabular-nums ${warnaAngkaST(stKeDisplay(r[k], stKey))}`}>{fmt(r[k])}</span>
                        </td>
                      )
                    })}
                    <td className="px-4 py-3 text-center"><StatusBadge status={r.status} /></td>
                    {bisaVerifikasi && (
                      <td className="px-4 py-3 text-center whitespace-nowrap">
                        {r.status === 'diajukan' ? (
                          <div className="flex items-center justify-center gap-2">
                            <button disabled={busyId === r.id} onClick={() => handleVerifikasi(r.id)}
                              className="text-xs font-medium text-emerald-600 hover:text-emerald-800 disabled:opacity-50">Verifikasi</button>
                            <button disabled={busyId === r.id} onClick={() => handleTolak(r.id)}
                              className="text-xs font-medium text-red-500 hover:text-red-700 disabled:opacity-50">Tolak</button>
                          </div>
                        ) : <span className="text-xs text-slate-300">—</span>}
                      </td>
                    )}
                  </tr>
                ))}

                {records.length === 0 && (
                  <tr>
                    <td colSpan={bisaVerifikasi ? 11 : 10} className="px-4 py-16 text-center">
                      <p className="text-sm font-medium text-slate-600">Belum ada data penilaian</p>
                      <p className="text-xs text-slate-400 mt-1">
                        {tahunAktif ? `Tahun Anggaran ${tahunAktif.tahun} belum memiliki record penilaian IPA.` : 'Tidak ada tahun anggaran yang aktif.'}
                      </p>
                    </td>
                  </tr>
                )}
              </tbody>

              {n > 0 && (
                <tfoot>
                  <tr className="bg-slate-50 border-t-2 border-slate-200">
                    <td colSpan={3} className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Rata-rata</td>
                    <td className="px-4 py-3 text-center">
                      <p className="text-sm font-bold text-slate-800 tabular-nums">{fmt(ipaDaerah)}</p>
                      <p className="text-xs text-slate-400">(indeks)</p>
                    </td>
                    <td className="px-4 py-3 text-center"><KategoriPill k={kategoriDaerah} /></td>
                    {([avgST1, avgST2, avgST3, avgST4] as const).map((v, i) => {
                      const stKey = (['ST1', 'ST2', 'ST3', 'ST4'] as const)[i]
                      return (
                        <td key={i} className="px-4 py-3 text-right">
                          <span className={`text-xs font-bold tabular-nums ${warnaAngkaST(stKeDisplay(v, stKey))}`}>{fmt(v)}</span>
                        </td>
                      )
                    })}
                    <td /><td />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>

        <p className="text-center text-xs text-slate-400 mt-8">Sistem IPA Kabupaten Kediri · Data diperbarui setiap kali halaman dimuat</p>
      </div>
    </main>
  )
}
