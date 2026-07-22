'use client'
// Picker Program → Kegiatan → Sub Kegiatan dari master admin_program
// (nomenklatur Kepmendagri 050). Tiga SearchSelect: ketik untuk MENCARI, lalu
// PILIH dari daftar (nilai selalu dari master, bukan teks bebas). Saran Kegiatan
// menyesuaikan Program terpilih, Sub Kegiatan menyesuaikan Kegiatan. Mengganti
// Program mereset Kegiatan & Sub (begitu juga Kegiatan → Sub).
//
// Nilai per level = "kode — uraian" — cocok dgn payload.{program,kegiatan,
// sub_kegiatan}.
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import SearchSelect, { type SSOption } from '@/components/SearchSelect'

type Opt = { kode: string; uraian: string }
export type ProgramPilihan = { program: string; kegiatan: string; sub_kegiatan: string }

const disp = (kode: string, uraian: string) => `${kode} — ${uraian}`
const kodeOf = (s: string | undefined | null) => (s || '').split(' — ')[0].trim()
const toOpts = (arr: Opt[]): SSOption[] => arr.map(o => ({ value: disp(o.kode, o.uraian), label: disp(o.kode, o.uraian) }))

export default function ProgramPicker({ program, kegiatan, subKeg, onChange }: {
  program: string; kegiatan: string; subKeg: string
  onChange: (sel: ProgramPilihan) => void
}) {
  const supabase = createClient()
  const [programs, setPrograms] = useState<Opt[]>([])
  const [kegiatans, setKegiatans] = useState<Opt[]>([])
  const [subs, setSubs] = useState<Opt[]>([])
  const progKode = kodeOf(program)
  const kegKode = kodeOf(kegiatan)

  // Daftar Program (distinct dari daun — dedupe client).
  useEffect(() => {
    let alive = true
    supabase.from('admin_program').select('kode_program,uraian_program').eq('aktif', true)
      .order('kode_program').then(({ data }) => {
        if (!alive) return
        const seen = new Set<string>(); const out: Opt[] = []
        for (const r of (data || []) as { kode_program: string; uraian_program: string }[]) {
          if (!seen.has(r.kode_program)) { seen.add(r.kode_program); out.push({ kode: r.kode_program, uraian: r.uraian_program }) }
        }
        setPrograms(out)
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

  // Daftar Sub Kegiatan per Kegiatan.
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

  return (
    <div className="space-y-3 rounded-lg border border-gray-100 bg-gray-50/40 p-3">
      <div>
        <label className="block text-xs text-gray-500 mb-1">Program</label>
        <SearchSelect value={program} options={toOpts(programs)} placeholder="ketik untuk mencari program..."
          onChange={v => onChange({ program: v, kegiatan: '', sub_kegiatan: '' })} />
      </div>
      <div>
        <label className="block text-xs text-gray-500 mb-1">Kegiatan</label>
        <SearchSelect value={kegiatan} options={toOpts(kegiatans)} disabled={!progKode}
          placeholder={progKode ? 'ketik untuk mencari kegiatan...' : 'pilih program dulu'}
          onChange={v => onChange({ program, kegiatan: v, sub_kegiatan: '' })} />
      </div>
      <div>
        <label className="block text-xs text-gray-500 mb-1">Sub Kegiatan</label>
        <SearchSelect value={subKeg} options={toOpts(subs)} disabled={!kegKode}
          placeholder={kegKode ? 'ketik untuk mencari sub kegiatan...' : 'pilih kegiatan dulu'}
          onChange={v => onChange({ program, kegiatan, sub_kegiatan: v })} />
      </div>
    </div>
  )
}
