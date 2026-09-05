'use client'
// Form input Penilaian IPA (Indeks Pengelolaan Aset) — port dari
// FormPenilaian.tsx di github.com/BPKAD-star/ipa-bmd-kediri. Sub-komponen
// presentational (ParamTL/ParamTanggal/ParamBulanan/ParamRasioRp/
// ParamSertifikasi/dst.) disalin nyaris apa adanya (murni UI+kalkulasi
// client-side). Beda dari source: simpan lewat browser client + RLS
// (bukan server action + service-role), lihat handleSubmit di bawah.
import { useState, useMemo, useRef, useEffect, useTransition } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import {
  hitungST1, hitungST2, hitungST3, hitungST4,
  getFPK, konversiIndeks, konversiIndeksTanggal, ST_MAX, NAMA_PARAMETER, BOBOT,
} from '@/lib/ipaEngine'
import type { KategoriIPA, Indeks, KelompokFPK } from '@/lib/ipaTypes'
import NominalInput from '@/shared/ui/NominalInput'

// ─────────────────────────────────────────────────────────────────────────
// Tipe
// ─────────────────────────────────────────────────────────────────────────

type SKPDItem = { id: number; kode_lokasi: string | null; nama: string; kelompok_fpk: number | null }
type TahunAktif = { id: string; tahun: number; batas_submit_pb: string | null; batas_submit_bkad: string | null }

type FormValues = {
  skpdId: string
  np111_sudah_tl: number; np111_total_tl: number; np111_tidak_dapat: number
  np121_sudah_tl: number; np121_total_tl: number; np121_tidak_dapat: number
  np231_tanggal: string; sp2411_jumlah_tepat: number
  sp2421_tanggal: string; sp2431_tanggal: string; np251_tanggal: string
  np361_sudah_tl: number; np361_total_tl: number; np361_tidak_dapat: number
  sp3711_sudah_tl: number; sp3711_total: number; sp3711_tidak_terdefinisi: boolean
  sp3721_nilai_tl: number; sp3721_saldo_awal: number; sp3721_mutasi_tambah: number; sp3721_saldo_akhir_nol: boolean
  sp3731_nilai_tl: number; sp3731_saldo_awal: number; sp3731_mutasi_tambah: number; sp3731_nilai_multiyear: number; sp3731_saldo_akhir_nol: boolean
  sp4811_sudah: number; sp4811_total: number
  sp4821_nilai_sudah: number; sp4821_nilai_total: number
  sp4831_sudah: number; sp4831_total: number
  sp4841_nilai_sudah: number; sp4841_nilai_total: number
  sp4851_sudah: number; sp4851_total: number
  sp4861_nilai_sudah: number; sp4861_nilai_total: number
  catatan: string
}

const INIT: FormValues = {
  skpdId: '',
  np111_sudah_tl: 0, np111_total_tl: 0, np111_tidak_dapat: 0,
  np121_sudah_tl: 0, np121_total_tl: 0, np121_tidak_dapat: 0,
  np231_tanggal: '', sp2411_jumlah_tepat: 0,
  sp2421_tanggal: '', sp2431_tanggal: '', np251_tanggal: '',
  np361_sudah_tl: 0, np361_total_tl: 0, np361_tidak_dapat: 0,
  sp3711_sudah_tl: 0, sp3711_total: 0, sp3711_tidak_terdefinisi: false,
  sp3721_nilai_tl: 0, sp3721_saldo_awal: 0, sp3721_mutasi_tambah: 0, sp3721_saldo_akhir_nol: false,
  sp3731_nilai_tl: 0, sp3731_saldo_awal: 0, sp3731_mutasi_tambah: 0, sp3731_nilai_multiyear: 0, sp3731_saldo_akhir_nol: false,
  sp4811_sudah: 0, sp4811_total: 0, sp4821_nilai_sudah: 0, sp4821_nilai_total: 0,
  sp4831_sudah: 0, sp4831_total: 0, sp4841_nilai_sudah: 0, sp4841_nilai_total: 0,
  sp4851_sudah: 0, sp4851_total: 0, sp4861_nilai_sudah: 0, sp4861_nilai_total: 0,
  catatan: '',
}

// ─────────────────────────────────────────────────────────────────────────
// Konstanta warna
// ─────────────────────────────────────────────────────────────────────────

const C_KAT: Record<KategoriIPA, { latar: string; teks: string; ring: string }> = {
  'Sangat Baik': { latar: 'bg-emerald-50', teks: 'text-emerald-700', ring: 'ring-emerald-200' },
  'Baik':        { latar: 'bg-sky-50',     teks: 'text-sky-700',     ring: 'ring-sky-200' },
  'Cukup':       { latar: 'bg-amber-50',   teks: 'text-amber-700',   ring: 'ring-amber-200' },
  'Buruk':       { latar: 'bg-red-50',     teks: 'text-red-700',     ring: 'ring-red-200' },
}

const C_INDEKS: Record<Indeks, string> = {
  4: 'bg-emerald-100 text-emerald-700',
  3: 'bg-sky-100 text-sky-700',
  2: 'bg-amber-100 text-amber-700',
  1: 'bg-red-100 text-red-700',
}

// ─────────────────────────────────────────────────────────────────────────
// Komponen kecil
// ─────────────────────────────────────────────────────────────────────────

function IndeksBadge({ indeks }: { indeks: Indeks }) {
  return (
    <span className={`inline-flex items-center justify-center w-6 h-6 rounded text-xs font-bold ${C_INDEKS[indeks]}`}>
      {indeks}
    </span>
  )
}

function KategoriPill({ k }: { k: KategoriIPA }) {
  const c = C_KAT[k]
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ring-1 ring-inset ${c.latar} ${c.teks} ${c.ring}`}>
      {k}
    </span>
  )
}

function ScoreBar({ pct }: { pct: number }) {
  const w = Math.min(100, Math.max(0, pct))
  const color = w >= 75 ? 'bg-emerald-500' : w >= 50 ? 'bg-sky-500' : w >= 25 ? 'bg-amber-500' : 'bg-red-500'
  return (
    <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${w}%` }} />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// SKPD Combobox
// ─────────────────────────────────────────────────────────────────────────

function SKPDCombobox({ skpdList, value, onChange }: {
  skpdList: SKPDItem[]; value: string; onChange: (id: string) => void
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const selected = skpdList.find(s => String(s.id) === value)

  const filtered = useMemo(() => {
    if (query.length < 2) return []
    const q = query.toLowerCase()
    return skpdList.filter(s => s.nama.toLowerCase().includes(q) || (s.kode_lokasi || '').includes(q)).slice(0, 25)
  }, [query, skpdList])

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  return (
    <div ref={ref} className="relative">
      <input
        type="text"
        value={open || !selected ? query : selected.nama}
        onChange={e => { setQuery(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        placeholder="Ketik nama atau kode SKPD (min. 2 huruf)…"
        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        autoComplete="off"
      />
      {selected && !open && (
        <p className="mt-1 text-xs text-slate-500">
          {selected.kode_lokasi || '-'} · Kelompok {selected.kelompok_fpk ?? '-'} (FPK)
        </p>
      )}
      {open && filtered.length > 0 && (
        <ul className="absolute z-20 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-64 overflow-auto">
          {filtered.map(s => (
            <li key={s.id} onMouseDown={() => { onChange(String(s.id)); setQuery(''); setOpen(false) }}
              className="px-3 py-2 hover:bg-blue-50 cursor-pointer border-b border-slate-50 last:border-0">
              <p className="text-sm font-medium text-slate-900">{s.nama}</p>
              <p className="text-xs text-slate-400">{s.kode_lokasi || '-'} · Klpk {s.kelompok_fpk ?? '-'}</p>
            </li>
          ))}
        </ul>
      )}
      {open && query.length >= 2 && filtered.length === 0 && (
        <div className="absolute z-20 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow px-3 py-3 text-sm text-slate-400">
          Tidak ada SKPD yang cocok.
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Input integer / rupiah
// ─────────────────────────────────────────────────────────────────────────

function InputInt({ value, onChange, placeholder = '0', min = 0 }: {
  value: number; onChange: (v: number) => void; placeholder?: string; min?: number
}) {
  return (
    <input
      type="number" min={min} step={1} value={value || ''}
      placeholder={placeholder}
      onChange={e => onChange(Math.max(min, Math.floor(parseFloat(e.target.value) || 0)))}
      className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 tabular-nums"
    />
  )
}

function InputRp({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <NominalInput
      value={value ? String(value) : ''}
      placeholder="0"
      onChange={raw => onChange(raw === '' ? 0 : Number(raw))}
      className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 tabular-nums"
    />
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Blok parameter: Tindak Lanjut (count-based)
// ─────────────────────────────────────────────────────────────────────────

function ParamTL({
  kode, label, bobot,
  sudah, total, tidakDapat, fpkTemuan,
  onSudah, onTotal, onTidakDapat,
  showFPK = true,
}: {
  kode: string; label: string; bobot: number
  sudah: number; total: number; tidakDapat: number; fpkTemuan: number
  onSudah: (v: number) => void; onTotal: (v: number) => void; onTidakDapat: (v: number) => void
  showFPK?: boolean
}) {
  const denominator = total - tidakDapat
  const persen_raw = denominator > 0 ? (sudah / denominator) * 100 : denominator === 0 && total === 0 ? 100 : 0
  const persen_fpk = showFPK ? persen_raw * fpkTemuan : persen_raw
  const indeks: Indeks = denominator <= 0 && total <= 0 ? 4 : konversiIndeks(persen_fpk, kode)

  return (
    <div className="py-4 border-b border-slate-50 last:border-0">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <p className="text-sm font-medium text-slate-800">{label}</p>
          <p className="text-xs text-slate-400 mt-0.5">
            <span>{kode}</span> · bobot {(bobot * 100).toFixed(0)}%
            {showFPK && <span className="ml-1">· FPK ×{fpkTemuan.toFixed(1)}</span>}
          </p>
        </div>
        <div className="flex-shrink-0 flex flex-col items-end gap-1">
          <IndeksBadge indeks={indeks} />
          <span className="text-xs text-slate-400 tabular-nums">{persen_fpk.toFixed(1)}%</span>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className="block text-xs text-slate-500 mb-1">Total perlu TL</label>
          <InputInt value={total} onChange={onTotal} />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">Tidak dapat TL</label>
          <InputInt value={tidakDapat} onChange={onTidakDapat} />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">Sudah TL</label>
          <InputInt value={sudah} onChange={onSudah} />
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Blok parameter: Tanggal (berbasis kalender Kepmen)
// ─────────────────────────────────────────────────────────────────────────

function ParamTanggal({
  kode, label, bobot, tanggal, tahun, onChange,
}: {
  kode: 'NP.2.3.1' | 'NP.2.5.1' | 'SP.2.4.2.1' | 'SP.2.4.3.1'
  label: string; bobot: number; tanggal: string; tahun: number
  onChange: (v: string) => void
}) {
  const indeks: Indeks = useMemo(() => {
    if (!tanggal) return 1
    const d = new Date(tanggal)
    return isNaN(d.getTime()) ? 1 : konversiIndeksTanggal(d, kode, tahun)
  }, [tanggal, kode, tahun])

  return (
    <div className="py-3 border-b border-slate-50 last:border-0">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div>
          <p className="text-sm font-medium text-slate-800">{label}</p>
          <p className="text-xs text-slate-400 mt-0.5">
            <span>{kode}</span> · bobot {(bobot * 100).toFixed(0)}%
          </p>
        </div>
        <IndeksBadge indeks={indeks} />
      </div>
      <div className="flex items-center gap-2">
        <input
          type="date" value={tanggal} onChange={e => onChange(e.target.value)}
          className="flex-1 px-2 py-1.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        {!tanggal && <span className="text-xs text-slate-400">Kosong = tidak menyampaikan → Indeks 1</span>}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Blok parameter: Laporan Bulanan (0–12)
// ─────────────────────────────────────────────────────────────────────────

function ParamBulanan({ jumlah, onChange }: { jumlah: number; onChange: (v: number) => void }) {
  const indeks: Indeks = jumlah >= 12 ? 4 : jumlah >= 8 ? 3 : jumlah >= 4 ? 2 : 1
  return (
    <div className="py-3 border-b border-slate-50 last:border-0">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div>
          <p className="text-sm font-medium text-slate-800">Laporan Bulanan Penatausahaan BMD</p>
          <p className="text-xs text-slate-400 mt-0.5">
            <span>SP.2.4.1.1</span> · Berapa bulan tepat waktu (0–12)
          </p>
        </div>
        <IndeksBadge indeks={indeks} />
      </div>
      <div className="flex items-center gap-3">
        <input
          type="range" min={0} max={12} step={1} value={jumlah}
          onChange={e => onChange(parseInt(e.target.value))}
          className="flex-1 accent-blue-600"
        />
        <span className="text-sm font-bold text-slate-700 tabular-nums w-8 text-right">{jumlah}/12</span>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Blok parameter: Rasio nilai Rp
// ─────────────────────────────────────────────────────────────────────────

function ParamRasioRp({
  kode, label, bobot, fpkLaporan,
  nilaiTL, saldoAwal, mutasiTambah, saldoAkhirNol,
  onNilaiTL, onSaldoAwal, onMutasiTambah, onSaldoAkhirNol,
  extraField,
}: {
  kode: string; label: string; bobot: number; fpkLaporan: number
  nilaiTL: number; saldoAwal: number; mutasiTambah: number; saldoAkhirNol: boolean
  onNilaiTL: (v: number) => void; onSaldoAwal: (v: number) => void
  onMutasiTambah: (v: number) => void; onSaldoAkhirNol: (v: boolean) => void
  extraField?: React.ReactNode
}) {
  const denom = saldoAwal + mutasiTambah
  const persen_raw = denom > 0 ? (nilaiTL / denom) * 100 : 100
  let indeks: Indeks
  if (saldoAkhirNol || denom === 0) {
    indeks = 4
  } else {
    indeks = konversiIndeks(persen_raw * fpkLaporan, kode)
  }

  return (
    <div className="py-4 border-b border-slate-50 last:border-0">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <p className="text-sm font-medium text-slate-800">{label}</p>
          <p className="text-xs text-slate-400 mt-0.5">
            <span>{kode}</span> · bobot {(bobot * 100).toFixed(0)}%
            · FPK ×{fpkLaporan.toFixed(1)}
          </p>
        </div>
        <div className="flex-shrink-0 flex flex-col items-end gap-1">
          <IndeksBadge indeks={indeks} />
          {!saldoAkhirNol && denom > 0 && (
            <span className="text-xs text-slate-400">{(persen_raw * fpkLaporan).toFixed(1)}%</span>
          )}
        </div>
      </div>
      <label className="flex items-center gap-2 mb-3 cursor-pointer">
        <input type="checkbox" checked={saldoAkhirNol} onChange={e => onSaldoAkhirNol(e.target.checked)}
          className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
        <span className="text-xs text-slate-600">Saldo akhir = 0 (sudah semua ditindaklanjuti → Indeks 4)</span>
      </label>
      {!saldoAkhirNol && (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-xs text-slate-500 mb-1">Saldo awal (Rp)</label>
            <InputRp value={saldoAwal} onChange={onSaldoAwal} />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Mutasi tambah (Rp)</label>
            <InputRp value={mutasiTambah} onChange={onMutasiTambah} />
          </div>
          {extraField}
          <div>
            <label className="block text-xs text-slate-500 mb-1">Nilai sudah TL/dikurangi (Rp)</label>
            <InputRp value={nilaiTL} onChange={onNilaiTL} />
          </div>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Blok parameter: Sertifikasi (jumlah atau nilai)
// ─────────────────────────────────────────────────────────────────────────

function ParamSertifikasi({
  kode, label, bobot, sudah, total, satuanLabel,
  onSudah, onTotal,
}: {
  kode: string; label: string; bobot: number
  sudah: number; total: number; satuanLabel: string
  onSudah: (v: number) => void; onTotal: (v: number) => void
}) {
  const persen = total > 0 ? (sudah / total) * 100 : 0
  const indeks = konversiIndeks(persen, kode)
  return (
    <div className="py-3 border-b border-slate-50 last:border-0">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div>
          <p className="text-sm text-slate-800">{label}</p>
          <p className="text-xs text-slate-400 mt-0.5">
            <span>{kode}</span> · bobot {(bobot * 100).toFixed(0)}%
          </p>
        </div>
        <div className="flex-shrink-0 flex flex-col items-end gap-1">
          <IndeksBadge indeks={indeks} />
          <span className="text-xs text-slate-400">{persen.toFixed(1)}%</span>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs text-slate-500 mb-1">Total {satuanLabel}</label>
          {satuanLabel.includes('Rp') ? <InputRp value={total} onChange={onTotal} /> : <InputInt value={total} onChange={onTotal} />}
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">Sudah bersertifikat/berdokumen</label>
          {satuanLabel.includes('Rp') ? <InputRp value={sudah} onChange={onSudah} /> : <InputInt value={sudah} onChange={onSudah} />}
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// ST Header
// ─────────────────────────────────────────────────────────────────────────

function STHeader({ label, sub, bobotPct, stNilai, stMax }: {
  label: string; sub: string; bobotPct: number; stNilai: number; stMax: number
}) {
  const pct = stMax > 0 ? (stNilai / stMax) * 100 : 0
  const kat: KategoriIPA = pct >= 75 ? 'Sangat Baik' : pct >= 50 ? 'Baik' : pct >= 25 ? 'Cukup' : 'Buruk'
  const c = C_KAT[kat]
  return (
    <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
      <div>
        <h3 className="text-sm font-semibold text-slate-800">{label}</h3>
        <p className="text-xs text-slate-400 mt-0.5">{sub}</p>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
          Bobot {bobotPct}%
        </span>
        <div className="text-right">
          <p className="text-lg font-bold text-slate-900 tabular-nums">{stNilai.toFixed(3)}</p>
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ring-1 ring-inset ${c.latar} ${c.teks} ${c.ring}`}>
            {kat}
          </span>
        </div>
      </div>
    </div>
  )
}

// Bobot display (persentase) untuk sub-parameter tanpa nested lookup di BOBOT
const BOBOT_D: Record<string, number> = {
  'NP.1.1.1': 0.10, 'NP.1.2.1': 0.10, 'NP.2.3.1': 0.05,
  'SP.2.4.2.1': 1 / 3, 'SP.2.4.3.1': 1 / 3,
  'NP.2.5.1': 0.05, 'NP.3.6.1': 0.15,
}

// ─────────────────────────────────────────────────────────────────────────
// Komponen utama
// ─────────────────────────────────────────────────────────────────────────

export default function FormPenilaian({
  skpdList, tahunAktif, lockedSkpdId,
}: {
  skpdList: SKPDItem[]; tahunAktif: TahunAktif; lockedSkpdId?: string
}) {
  const supabase = createClient()
  const tahun = tahunAktif.tahun
  const [values, setValues] = useState<FormValues>(() => ({
    ...INIT,
    skpdId: lockedSkpdId ?? '',
  }))
  const [isPending, startTransition] = useTransition()
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null)

  const set = <K extends keyof FormValues>(field: K, val: FormValues[K]) =>
    setValues(prev => ({ ...prev, [field]: val }))

  const selectedSkpd = skpdList.find(s => String(s.id) === values.skpdId)
  const kelompok = (selectedSkpd?.kelompok_fpk ?? 1) as KelompokFPK
  const fpkTemuan  = getFPK(kelompok, 'temuan')
  const fpkLaporan = getFPK(kelompok, 'laporan')

  // Hitung skor real-time
  const scores = useMemo(() => {
    const td = (s: string) => { if (!s) return null; const d = new Date(s); return isNaN(d.getTime()) ? null : d }

    const h1 = hitungST1({
      np111_sudah_tl: values.np111_sudah_tl, np111_total_tl: values.np111_total_tl, np111_tidak_dapat: values.np111_tidak_dapat,
      np121_sudah_tl: values.np121_sudah_tl, np121_total_tl: values.np121_total_tl, np121_tidak_dapat: values.np121_tidak_dapat,
      kelompok,
    })
    const h2 = hitungST2({
      np231_tanggal_terima: td(values.np231_tanggal),
      sp2411_jumlah_tepat: values.sp2411_jumlah_tepat,
      sp2421_tanggal_terima: td(values.sp2421_tanggal),
      sp2431_tanggal_terima: td(values.sp2431_tanggal),
      np251_tanggal_terima: td(values.np251_tanggal),
      tahun, kelompok,
    })
    const h3 = hitungST3({
      np361_sudah_tl: values.np361_sudah_tl, np361_total_tl: values.np361_total_tl, np361_tidak_dapat: values.np361_tidak_dapat,
      sp3711_sudah_tl: values.sp3711_sudah_tl, sp3711_total: values.sp3711_total, sp3711_tidak_terdefinisi: values.sp3711_tidak_terdefinisi,
      sp3721_nilai_tl: values.sp3721_nilai_tl, sp3721_saldo_awal: values.sp3721_saldo_awal, sp3721_mutasi_tambah: values.sp3721_mutasi_tambah, sp3721_saldo_akhir_nol: values.sp3721_saldo_akhir_nol,
      sp3731_nilai_tl: values.sp3731_nilai_tl, sp3731_saldo_awal: values.sp3731_saldo_awal, sp3731_mutasi_tambah: values.sp3731_mutasi_tambah, sp3731_nilai_multiyear: values.sp3731_nilai_multiyear, sp3731_saldo_akhir_nol: values.sp3731_saldo_akhir_nol,
      kelompok,
    })
    const h4 = hitungST4({
      sp4811_sudah: values.sp4811_sudah, sp4811_total: values.sp4811_total,
      sp4821_nilai_sudah: values.sp4821_nilai_sudah, sp4821_nilai_total: values.sp4821_nilai_total,
      sp4831_sudah: values.sp4831_sudah, sp4831_total: values.sp4831_total,
      sp4841_nilai_sudah: values.sp4841_nilai_sudah, sp4841_nilai_total: values.sp4841_nilai_total,
      sp4851_sudah: values.sp4851_sudah, sp4851_total: values.sp4851_total,
      sp4861_nilai_sudah: values.sp4861_nilai_sudah, sp4861_nilai_total: values.sp4861_nilai_total,
    })

    const ipaFinal = h1.st1_nilai + h2.st2_nilai + h3.st3_nilai + h4.st4_nilai
    const kategori: KategoriIPA = ipaFinal > 3 ? 'Sangat Baik' : ipaFinal > 2 ? 'Baik' : ipaFinal > 1 ? 'Cukup' : 'Buruk'
    return { h1, h2, h3, h4, ipaFinal, kategori }
  }, [values, kelompok, tahun])

  function handleSubmit(status: 'draft' | 'diajukan') {
    if (!values.skpdId) { setResult({ ok: false, msg: 'Pilih SKPD terlebih dahulu.' }); return }
    setResult(null)
    startTransition(async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) throw new Error('Sesi login tidak ditemukan, silakan login ulang.')

        const { data: existing, error: existingErr } = await supabase
          .from('ipa_record')
          .select('id,status')
          .eq('skpd_id', values.skpdId)
          .eq('tahun_id', tahunAktif.id)
          .maybeSingle()
        if (existingErr) throw existingErr

        if (existing && !['draft', 'ditolak'].includes(existing.status)) {
          setResult({ ok: false, msg: `Record sudah berstatus "${existing.status}" dan tidak dapat diubah.` })
          return
        }

        const st1 = Math.round(scores.h1.st1_nilai * 10000) / 10000
        const st2 = Math.round(scores.h2.st2_nilai * 10000) / 10000
        const st3 = Math.round(scores.h3.st3_nilai * 10000) / 10000
        const st4 = Math.round(scores.h4.st4_nilai * 10000) / 10000
        const ipaFinal = Math.round(scores.ipaFinal * 10000) / 10000

        // Step 1: upsert ipa_record dengan status='draft' DULU — RLS
        // ipa_parameter_nilai (ipn_write) cuma izinin tulis selama
        // ipa_record.status='draft', jadi status final ('diajukan') baru
        // di-set di step 3, SETELAH parameter selesai ditulis.
        const draftPayload = {
          skpd_id: Number(values.skpdId),
          tahun_id: tahunAktif.id,
          status: 'draft' as const,
          st1_nilai: st1, st2_nilai: st2, st3_nilai: st3, st4_nilai: st4,
          ipa_final: ipaFinal,
          ipa_kategori: scores.kategori,
          catatan_verifikasi: values.catatan || null,
          verified_at: null, verified_by: null,
        }

        let recordId: string
        if (existing) {
          const { data, error } = await supabase.from('ipa_record')
            .update(draftPayload).eq('id', existing.id).select('id').single()
          if (error) throw error
          recordId = data.id
        } else {
          const { data, error } = await supabase.from('ipa_record')
            .insert(draftPayload).select('id').single()
          if (error) throw error
          recordId = data.id
        }

        // Step 2: ganti seluruh baris parameter (delete-by-ipa_id lalu insert ulang)
        const { error: delErr } = await supabase.from('ipa_parameter_nilai').delete().eq('ipa_id', recordId)
        if (delErr) throw delErr

        const semuaDetail = {
          'NP.1.1.1': scores.h1.np111, 'NP.1.2.1': scores.h1.np121,
          'NP.2.3.1': scores.h2.np231, 'SP.2.4.1.1': scores.h2.sp2411,
          'SP.2.4.2.1': scores.h2.sp2421, 'SP.2.4.3.1': scores.h2.sp2431,
          'NP.2.4.1': scores.h2.np241, 'NP.2.5.1': scores.h2.np251,
          'NP.3.6.1': scores.h3.np361, 'SP.3.7.1.1': scores.h3.sp3711,
          'SP.3.7.2.1': scores.h3.sp3721, 'SP.3.7.3.1': scores.h3.sp3731,
          'NP.3.7.1': scores.h3.np371,
          'SP.4.8.1.1': scores.h4.sp4811, 'SP.4.8.2.1': scores.h4.sp4821,
          'SP.4.8.3.1': scores.h4.sp4831, 'SP.4.8.4.1': scores.h4.sp4841,
          'SP.4.8.5.1': scores.h4.sp4851, 'SP.4.8.6.1': scores.h4.sp4861,
          'NP.4.8.1': scores.h4.np481,
        }
        const { error: insErr } = await supabase.from('ipa_parameter_nilai').insert(
          Object.entries(semuaDetail).map(([kode, p]) => ({
            ipa_id: recordId,
            kode_parameter: kode,
            nama_parameter: NAMA_PARAMETER[kode] ?? kode,
            realisasi: p.persen_raw,
            target: 100,
            persen_raw: p.persen_raw,
            persen_fpk: p.persen_fpk,
            indeks: p.indeks,
            bobot: BOBOT[kode] ?? p.bobot,
            nilai_terbobot: p.nilai_terbobot,
            metadata: { kelompok_fpk: kelompok, tahun },
          })),
        )
        if (insErr) throw insErr

        // Step 3: kalau target status = diajukan, submit terakhir (parameter sudah aman tersimpan)
        if (status === 'diajukan') {
          const now = new Date().toISOString()
          const { error: subErr } = await supabase.from('ipa_record')
            .update({ status: 'diajukan', submitted_at: now, submitted_by: user.id })
            .eq('id', recordId)
          if (subErr) throw subErr
        }

        await supabase.from('ipa_log').insert({
          ipa_record_id: recordId,
          user_id: user.id,
          aksi: status === 'diajukan' ? 'submit' : 'simpan_draft',
          payload: { ipa_final: ipaFinal, kategori: scores.kategori },
        })

        setResult({
          ok: true,
          msg: `Berhasil disimpan sebagai "${status === 'draft' ? 'Draft' : 'Diajukan'}". IPA: ${ipaFinal.toFixed(4)} (${scores.kategori})`,
        })
      } catch (err) {
        const e = err as { message?: string; details?: string; hint?: string }
        setResult({ ok: false, msg: [e?.message, e?.details, e?.hint].filter(Boolean).join(' · ') || 'Gagal menyimpan.' })
      }
    })
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center gap-4 mb-6">
        <Link href="/dashboard/ipa" className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Dashboard IPA
        </Link>
        <span className="text-slate-300">/</span>
        <h1 className="text-xl font-bold text-slate-900">Input Penilaian IPA</h1>
        <span className="text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full">
          TA {tahun}
        </span>
      </div>

      <div className="lg:grid lg:grid-cols-3 lg:gap-6 items-start">
        {/* Kolom Kiri: Form */}
        <div className="lg:col-span-2 space-y-5">

          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
            <label className="block text-sm font-semibold text-slate-700 mb-2">SKPD yang Dinilai</label>
            {lockedSkpdId && selectedSkpd ? (
              <div className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg">
                <p className="text-sm font-medium text-slate-900">{selectedSkpd.nama}</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {selectedSkpd.kode_lokasi || '-'} · Kelompok {selectedSkpd.kelompok_fpk ?? '-'} (FPK)
                </p>
              </div>
            ) : (
              <>
                <SKPDCombobox skpdList={skpdList} value={values.skpdId} onChange={id => set('skpdId', id)} />
                {!values.skpdId && <p className="mt-1.5 text-xs text-amber-600">Wajib dipilih sebelum menyimpan.</p>}
              </>
            )}
          </div>

          {/* ST1 */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <STHeader label="ST1 · Akuntabilitas dan Produktivitas" sub="Tindak lanjut LHP BPK & Inspektorat" bobotPct={20} stNilai={scores.h1.st1_nilai} stMax={ST_MAX.ST1} />
            <div className="px-5">
              <ParamTL kode="NP.1.1.1" label="Tindak Lanjut LHP BPK atas LKPD terkait BMD" bobot={BOBOT_D['NP.1.1.1']}
                sudah={values.np111_sudah_tl} total={values.np111_total_tl} tidakDapat={values.np111_tidak_dapat} fpkTemuan={fpkTemuan}
                onSudah={v => set('np111_sudah_tl', v)} onTotal={v => set('np111_total_tl', v)} onTidakDapat={v => set('np111_tidak_dapat', v)} />
              <ParamTL kode="NP.1.2.1" label="Tindak Lanjut LHP Inspektorat terkait BMD" bobot={BOBOT_D['NP.1.2.1']}
                sudah={values.np121_sudah_tl} total={values.np121_total_tl} tidakDapat={values.np121_tidak_dapat} fpkTemuan={fpkTemuan}
                onSudah={v => set('np121_sudah_tl', v)} onTotal={v => set('np121_total_tl', v)} onTidakDapat={v => set('np121_tidak_dapat', v)} />
            </div>
          </div>

          {/* ST2 */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <STHeader label="ST2 · Kepatuhan Pengelolaan BMD" sub="Ketepatan waktu RKBMD, Laporan BMD, Wasdalmen" bobotPct={30} stNilai={scores.h2.st2_nilai} stMax={ST_MAX.ST2} />
            <div className="px-5">
              <ParamTanggal kode="NP.2.3.1" label="Ketepatan Waktu Penyampaian RKBMD" bobot={BOBOT_D['NP.2.3.1']}
                tanggal={values.np231_tanggal} tahun={tahun} onChange={v => set('np231_tanggal', v)} />

              <div className="py-3 border-b border-slate-50">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                  NP.2.4.1 · Ketepatan Waktu Penyampaian Laporan BMD (bobot 20%)
                </p>
                <ParamBulanan jumlah={values.sp2411_jumlah_tepat} onChange={v => set('sp2411_jumlah_tepat', v)} />
                <ParamTanggal kode="SP.2.4.2.1" label="Laporan Semester I Penatausahaan BMD" bobot={BOBOT_D['SP.2.4.2.1']}
                  tanggal={values.sp2421_tanggal} tahun={tahun} onChange={v => set('sp2421_tanggal', v)} />
                <ParamTanggal kode="SP.2.4.3.1" label="Laporan Akhir Tahun (Semester II) Penatausahaan BMD" bobot={BOBOT_D['SP.2.4.3.1']}
                  tanggal={values.sp2431_tanggal} tahun={tahun} onChange={v => set('sp2431_tanggal', v)} />
              </div>

              <ParamTanggal kode="NP.2.5.1" label="Ketepatan Waktu Laporan Pengawasan dan Pengendalian" bobot={BOBOT_D['NP.2.5.1']}
                tanggal={values.np251_tanggal} tahun={tahun} onChange={v => set('np251_tanggal', v)} />
            </div>
          </div>

          {/* ST3 */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <STHeader label="ST3 · Efektivitas Pengawasan dan Pengendalian" sub="Tindak lanjut temuan & pengelolaan BMD" bobotPct={35} stNilai={scores.h3.st3_nilai} stMax={ST_MAX.ST3} />
            <div className="px-5">
              <ParamTL kode="NP.3.6.1" label="Tindak Lanjut Rekomendasi Temuan Inspektorat (akumulasi)" bobot={BOBOT_D['NP.3.6.1']}
                sudah={values.np361_sudah_tl} total={values.np361_total_tl} tidakDapat={values.np361_tidak_dapat} fpkTemuan={1}
                onSudah={v => set('np361_sudah_tl', v)} onTotal={v => set('np361_total_tl', v)} onTidakDapat={v => set('np361_tidak_dapat', v)}
                showFPK={false} />

              <div className="py-3 border-b border-slate-50">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                  NP.3.7.1 · Tindak Lanjut Pengelolaan BMD (bobot 20%)
                </p>

                <div className="py-4 border-b border-slate-50">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div>
                      <p className="text-sm font-medium text-slate-800">TL Pemanfaatan / Pemindahtanganan / Penghapusan BMD</p>
                      <p className="text-xs text-slate-400 mt-0.5"><span>SP.3.7.1.1</span> · bobot 30% dalam NP.3.7.1 · FPK ×{fpkLaporan.toFixed(1)}</p>
                    </div>
                    <IndeksBadge indeks={scores.h3.sp3711.indeks} />
                  </div>
                  <label className="flex items-center gap-2 mb-3 cursor-pointer">
                    <input type="checkbox" checked={values.sp3711_tidak_terdefinisi} onChange={e => set('sp3711_tidak_terdefinisi', e.target.checked)}
                      className="w-4 h-4 rounded border-slate-300 text-blue-600" />
                    <span className="text-xs text-slate-600">Tidak terdefinisi (tidak ada persetujuan BMD) → Indeks 1</span>
                  </label>
                  {!values.sp3711_tidak_terdefinisi && (
                    <div className="grid grid-cols-2 gap-2">
                      <div><label className="block text-xs text-slate-500 mb-1">Total BMD dengan persetujuan</label><InputInt value={values.sp3711_total} onChange={v => set('sp3711_total', v)} /></div>
                      <div><label className="block text-xs text-slate-500 mb-1">Sudah ditindaklanjuti</label><InputInt value={values.sp3711_sudah_tl} onChange={v => set('sp3711_sudah_tl', v)} /></div>
                    </div>
                  )}
                </div>

                <ParamRasioRp kode="SP.3.7.2.1" label="Tindak Lanjut BMD Rusak Berat/Usang" bobot={0.40} fpkLaporan={fpkLaporan}
                  nilaiTL={values.sp3721_nilai_tl} saldoAwal={values.sp3721_saldo_awal} mutasiTambah={values.sp3721_mutasi_tambah} saldoAkhirNol={values.sp3721_saldo_akhir_nol}
                  onNilaiTL={v => set('sp3721_nilai_tl', v)} onSaldoAwal={v => set('sp3721_saldo_awal', v)} onMutasiTambah={v => set('sp3721_mutasi_tambah', v)} onSaldoAkhirNol={v => set('sp3721_saldo_akhir_nol', v)} />

                <ParamRasioRp kode="SP.3.7.3.1" label="Tindak Lanjut BMD Konstruksi Dalam Pengerjaan (KDP)" bobot={0.30} fpkLaporan={fpkLaporan}
                  nilaiTL={values.sp3731_nilai_tl} saldoAwal={values.sp3731_saldo_awal} mutasiTambah={values.sp3731_mutasi_tambah} saldoAkhirNol={values.sp3731_saldo_akhir_nol}
                  onNilaiTL={v => set('sp3731_nilai_tl', v)} onSaldoAwal={v => set('sp3731_saldo_awal', v)} onMutasiTambah={v => set('sp3731_mutasi_tambah', v)} onSaldoAkhirNol={v => set('sp3731_saldo_akhir_nol', v)}
                  extraField={
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">KDP masih multiyear (dikecualikan, Rp)</label>
                      <InputRp value={values.sp3731_nilai_multiyear} onChange={v => set('sp3731_nilai_multiyear', v)} />
                    </div>
                  } />
              </div>
            </div>
          </div>

          {/* ST4 */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <STHeader label="ST4 · Administrasi BMD yang Andal" sub="Sertifikasi dokumen kepemilikan BMD" bobotPct={15} stNilai={scores.h4.st4_nilai} stMax={ST_MAX.ST4} />
            <div className="px-5">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider pt-4 pb-2">
                NP.4.8.1 · Sertifikasi Dokumen Kepemilikan BMD (bobot 15%)
              </p>
              <p className="text-xs text-slate-400 mb-3">Threshold sertifikasi: &gt;80% → Indeks 4, ≥60% → 3, ≥40% → 2, &lt;40% → 1</p>
              <ParamSertifikasi kode="SP.4.8.1.1" label="Tanah — Jumlah Bidang Bersertifikat" bobot={0.30}
                sudah={values.sp4811_sudah} total={values.sp4811_total} satuanLabel="bidang" onSudah={v => set('sp4811_sudah', v)} onTotal={v => set('sp4811_total', v)} />
              <ParamSertifikasi kode="SP.4.8.2.1" label="Tanah — Nilai Perolehan Bersertifikat" bobot={0.30}
                sudah={values.sp4821_nilai_sudah} total={values.sp4821_nilai_total} satuanLabel="Rp total" onSudah={v => set('sp4821_nilai_sudah', v)} onTotal={v => set('sp4821_nilai_total', v)} />
              <ParamSertifikasi kode="SP.4.8.3.1" label="Bangunan — Jumlah Unit Berdokumen (PBG/SLF)" bobot={0.10}
                sudah={values.sp4831_sudah} total={values.sp4831_total} satuanLabel="unit" onSudah={v => set('sp4831_sudah', v)} onTotal={v => set('sp4831_total', v)} />
              <ParamSertifikasi kode="SP.4.8.4.1" label="Bangunan — Nilai Perolehan Berdokumen" bobot={0.10}
                sudah={values.sp4841_nilai_sudah} total={values.sp4841_nilai_total} satuanLabel="Rp total" onSudah={v => set('sp4841_nilai_sudah', v)} onTotal={v => set('sp4841_nilai_total', v)} />
              <ParamSertifikasi kode="SP.4.8.5.1" label="Kendaraan — Jumlah Unit Punya BPKB" bobot={0.10}
                sudah={values.sp4851_sudah} total={values.sp4851_total} satuanLabel="unit" onSudah={v => set('sp4851_sudah', v)} onTotal={v => set('sp4851_total', v)} />
              <ParamSertifikasi kode="SP.4.8.6.1" label="Kendaraan — Nilai Perolehan Punya BPKB" bobot={0.10}
                sudah={values.sp4861_nilai_sudah} total={values.sp4861_nilai_total} satuanLabel="Rp total" onSudah={v => set('sp4861_nilai_sudah', v)} onTotal={v => set('sp4861_nilai_total', v)} />
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              Catatan <span className="font-normal text-slate-400">(opsional)</span>
            </label>
            <textarea rows={3} value={values.catatan} onChange={e => set('catatan', e.target.value)}
              placeholder="Catatan tambahan untuk verifikator…"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>

          {result && (
            <div className={`rounded-xl px-4 py-3 text-sm font-medium border ${result.ok ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
              {result.msg}
            </div>
          )}

          <div className="flex gap-3 pb-8">
            <button onClick={() => handleSubmit('draft')} disabled={isPending}
              className="flex-1 px-4 py-2.5 text-sm font-semibold text-slate-700 bg-white border-2 border-slate-300 rounded-xl hover:bg-slate-50 disabled:opacity-50 transition-colors">
              {isPending ? 'Menyimpan…' : 'Simpan sebagai Draft'}
            </button>
            <button onClick={() => handleSubmit('diajukan')} disabled={isPending || !values.skpdId}
              className="flex-1 px-4 py-2.5 text-sm font-semibold text-white bg-blue-600 rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors">
              {isPending ? 'Menyimpan…' : 'Submit untuk Verifikasi'}
            </button>
          </div>
        </div>

        {/* Kolom Kanan: Ringkasan */}
        <div className="hidden lg:block">
          <div className="sticky top-8 space-y-4">
            <div className={`rounded-xl border-2 p-5 ${scores.ipaFinal > 3 ? 'border-emerald-300 bg-emerald-50' : scores.ipaFinal > 2 ? 'border-sky-300 bg-sky-50' : scores.ipaFinal > 1 ? 'border-amber-300 bg-amber-50' : 'border-slate-200 bg-white'}`}>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">IPA Final (skala 0–4)</p>
              <p className="text-5xl font-bold text-slate-900 tabular-nums">{scores.ipaFinal.toFixed(4)}</p>
              <div className="mt-2"><KategoriPill k={scores.kategori} /></div>
              <ScoreBar pct={(scores.ipaFinal / 4) * 100} />
            </div>

            <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-50 shadow-sm overflow-hidden">
              {[
                { label: 'ST1 · Akuntabilitas', bobot: '20%', nilai: scores.h1.st1_nilai, max: ST_MAX.ST1 },
                { label: 'ST2 · Kepatuhan', bobot: '30%', nilai: scores.h2.st2_nilai, max: ST_MAX.ST2 },
                { label: 'ST3 · Wasdalmen', bobot: '35%', nilai: scores.h3.st3_nilai, max: ST_MAX.ST3 },
                { label: 'ST4 · Administrasi', bobot: '15%', nilai: scores.h4.st4_nilai, max: ST_MAX.ST4 },
              ].map(st => (
                <div key={st.label} className="px-4 py-3">
                  <div className="flex items-center justify-between mb-1">
                    <div>
                      <p className="text-xs font-semibold text-slate-700">{st.label}</p>
                      <p className="text-xs text-slate-400">{st.bobot} · maks {st.max.toFixed(2)}</p>
                    </div>
                    <span className="text-sm font-bold text-slate-900 tabular-nums">{st.nilai.toFixed(4)}</span>
                  </div>
                  <ScoreBar pct={(st.nilai / st.max) * 100} />
                </div>
              ))}
            </div>

            <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 text-xs text-slate-500 space-y-1">
              {selectedSkpd ? (
                <>
                  <p className="font-semibold text-slate-700">{selectedSkpd.nama}</p>
                  <p>Kelompok FPK: <span className="font-bold text-slate-800">{kelompok}</span></p>
                  <p>FPK Temuan: ×{fpkTemuan.toFixed(1)} · FPK Laporan: ×{fpkLaporan.toFixed(1)}</p>
                </>
              ) : (
                <p>Pilih SKPD untuk melihat FPK.</p>
              )}
              <p className="pt-1 border-t border-slate-200">Kepmen Dagri No. 900.1.15-136/2026. Indeks 4=SB · 3=Baik · 2=Cukup · 1=Buruk.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
