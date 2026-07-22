'use client'
// Cascading picker Program → Kegiatan → Sub Kegiatan dari master admin_program
// (nomenklatur Kepmendagri 050). Tiga dropdown berjenjang: pilih Program →
// daftar Kegiatan menyesuaikan → pilih Kegiatan → daftar Sub Kegiatan
// menyesuaikan. Dipakai di kartu Kontrak Pengadaan.
//
// Nilai yang di-emit per level = "kode — uraian" (string) — cocok dgn shape
// payload.{program,kegiatan,sub_kegiatan} yg sudah ada (ditampilkan apa adanya
// oleh <Baris>). Init dari nilai tersimpan: kode diambil dari token awal string.
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type Opt = { kode: string; uraian: string }
export type ProgramPilihan = { program: string; kegiatan: string; sub_kegiatan: string }

const disp = (kode: string, uraian: string) => `${kode} — ${uraian}`
// Ambil kode dari string tersimpan "kode — uraian" (token sebelum ' — ').
const kodeOf = (s: string | undefined | null) => (s || '').split(' — ')[0].trim()

export default function ProgramPicker({ program, kegiatan, subKeg, onChange }: {
  program: string; kegiatan: string; subKeg: string
  onChange: (sel: ProgramPilihan) => void
}) {
  const supabase = createClient()
  const [programs, setPrograms] = useState<Opt[]>([])
  const [kegiatans, setKegiatans] = useState<Opt[]>([])
  const [subs, setSubs] = useState<Opt[]>([])
  const [progKode, setProgKode] = useState(kodeOf(program))
  const [kegKode, setKegKode] = useState(kodeOf(kegiatan))
  const [subKode, setSubKode] = useState(kodeOf(subKeg))
  const [loading, setLoading] = useState(false)

  // Daftar Program (distinct dari daun — dedupe client, 1527 baris kecil).
  useEffect(() => {
    let alive = true
    setLoading(true)
    supabase.from('admin_program').select('kode_program,uraian_program').eq('aktif', true)
      .order('kode_program').then(({ data }) => {
        if (!alive) return
        const seen = new Set<string>(); const out: Opt[] = []
        for (const r of (data || []) as { kode_program: string; uraian_program: string }[]) {
          if (!seen.has(r.kode_program)) { seen.add(r.kode_program); out.push({ kode: r.kode_program, uraian: r.uraian_program }) }
        }
        setPrograms(out); setLoading(false)
      })
    return () => { alive = false }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Daftar Kegiatan per Program.
  useEffect(() => {
    if (!progKode) { setKegiatans([]); return }
    let alive = true
    supabase.from('admin_program').select('kode_kegiatan,uraian_kegiatan').eq('aktif', true)
      .eq('kode_program', progKode).order('kode_kegiatan').then(({ data }) => {
        if (!alive) return
        const seen = new Set<string>(); const out: Opt[] = []
        for (const r of (data || []) as { kode_kegiatan: string; uraian_kegiatan: string }[]) {
          if (!seen.has(r.kode_kegiatan)) { seen.add(r.kode_kegiatan); out.push({ kode: r.kode_kegiatan, uraian: r.uraian_kegiatan }) }
        }
        setKegiatans(out)
      })
    return () => { alive = false }
  }, [progKode]) // eslint-disable-line react-hooks/exhaustive-deps

  // Daftar Sub Kegiatan per Kegiatan (daun, sudah unik).
  useEffect(() => {
    if (!kegKode) { setSubs([]); return }
    let alive = true
    supabase.from('admin_program').select('kode_sub_kegiatan,uraian_sub_kegiatan').eq('aktif', true)
      .eq('kode_kegiatan', kegKode).order('kode_sub_kegiatan').then(({ data }) => {
        if (!alive) return
        setSubs(((data || []) as { kode_sub_kegiatan: string; uraian_sub_kegiatan: string }[])
          .map(r => ({ kode: r.kode_sub_kegiatan, uraian: r.uraian_sub_kegiatan })))
      })
    return () => { alive = false }
  }, [kegKode]) // eslint-disable-line react-hooks/exhaustive-deps

  const strOf = (opts: Opt[], kode: string) => {
    const o = opts.find(x => x.kode === kode); return o ? disp(o.kode, o.uraian) : ''
  }

  function pickProgram(kode: string) {
    setProgKode(kode); setKegKode(''); setSubKode(''); setKegiatans([]); setSubs([])
    onChange({ program: strOf(programs, kode), kegiatan: '', sub_kegiatan: '' })
  }
  function pickKegiatan(kode: string) {
    setKegKode(kode); setSubKode(''); setSubs([])
    onChange({ program: strOf(programs, progKode), kegiatan: strOf(kegiatans, kode), sub_kegiatan: '' })
  }
  function pickSub(kode: string) {
    setSubKode(kode)
    onChange({ program: strOf(programs, progKode), kegiatan: strOf(kegiatans, kegKode), sub_kegiatan: strOf(subs, kode) })
  }

  return (
    <div className="space-y-3 rounded-lg border border-gray-100 bg-gray-50/40 p-3">
      <div>
        <label className="block text-xs text-gray-500 mb-1">Program</label>
        <select className="select-filter w-full" value={progKode} onChange={e => pickProgram(e.target.value)}>
          <option value="">{loading ? 'Memuat…' : '— pilih program —'}</option>
          {programs.map(o => <option key={o.kode} value={o.kode}>{o.kode} — {o.uraian}</option>)}
        </select>
      </div>
      <div>
        <label className="block text-xs text-gray-500 mb-1">Kegiatan</label>
        <select className="select-filter w-full" value={kegKode} onChange={e => pickKegiatan(e.target.value)} disabled={!progKode}>
          <option value="">{!progKode ? '— pilih program dulu —' : '— pilih kegiatan —'}</option>
          {kegiatans.map(o => <option key={o.kode} value={o.kode}>{o.kode} — {o.uraian}</option>)}
        </select>
      </div>
      <div>
        <label className="block text-xs text-gray-500 mb-1">Sub Kegiatan</label>
        <select className="select-filter w-full" value={subKode} onChange={e => pickSub(e.target.value)} disabled={!kegKode}>
          <option value="">{!kegKode ? '— pilih kegiatan dulu —' : '— pilih sub kegiatan —'}</option>
          {subs.map(o => <option key={o.kode} value={o.kode}>{o.kode} — {o.uraian}</option>)}
        </select>
      </div>
    </div>
  )
}
