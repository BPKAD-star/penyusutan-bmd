'use client'
// Picker Kode Rekening Belanja (master admin_rekening). KETIK BEBAS + saran:
// input boleh diisi apa saja (nilai = apa yang diketik); sambil mengetik muncul
// dropdown saran dari admin_rekening yang bisa diklik. Kalau nilai saat ini
// PERSIS sebuah kode Sub Rincian yang valid, breadcrumb hierarki (Akun ›
// Kelompok › Jenis › Objek › Rincian Objek) ditampilkan di bawah input.
//
// Nilai tersimpan saat memilih saran = kode_sub_rincian (kode penuh). Diketik
// bebas = apa adanya. Dipakai di Pengadaan (per barang) & Konstruksi (per termin).
import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export type RekeningRow = {
  kode_sub_rincian: string; uraian_sub_rincian: string
  kode_rekening: string; uraian_rekening: string
  kode_klasifikasi: string; uraian_klasifikasi: string
  kode_jenis: string; uraian_jenis: string
  kode_objek: string; uraian_objek: string
  kode_rincian_objek: string; uraian_rincian_objek: string
}

const COLS =
  'kode_sub_rincian,uraian_sub_rincian,kode_rekening,uraian_rekening,' +
  'kode_klasifikasi,uraian_klasifikasi,kode_jenis,uraian_jenis,' +
  'kode_objek,uraian_objek,kode_rincian_objek,uraian_rincian_objek'

// Bentuk kode Sub Rincian penuh: 6 kelompok angka (5.1.01.01.001.00001).
const KODE_PENUH = /^\d+\.\d+\.\d+\.\d+\.\d+\.\d+$/

export default function RekeningPicker({ value, onChange, kelompok, className }: {
  value: string
  onChange: (kode: string) => void
  kelompok?: 'operasi' | 'modal' | 'tak_terduga' | 'transfer'
  className?: string
}) {
  const supabase = createClient()
  const [results, setResults] = useState<RekeningRow[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [picked, setPicked] = useState<RekeningRow | null>(null) // baris breadcrumb bila value = kode valid
  const boxRef = useRef<HTMLDivElement>(null)

  // Breadcrumb: ambil baris HANYA kalau value berbentuk kode penuh.
  useEffect(() => {
    const v = (value || '').trim()
    if (!KODE_PENUH.test(v)) { setPicked(null); return }
    if (picked?.kode_sub_rincian === v) return
    let alive = true
    supabase.from('admin_rekening').select(COLS).eq('kode_sub_rincian', v).maybeSingle()
      .then(({ data }) => { if (alive) setPicked(data ? (data as RekeningRow) : null) })
    return () => { alive = false }
  }, [value]) // eslint-disable-line react-hooks/exhaustive-deps

  // Saran: cari berdasarkan teks yang sedang diketik (debounce).
  useEffect(() => {
    const term = (value || '').trim().replace(/[,()]/g, '')
    if (!term) { setResults([]); setLoading(false); return }
    setLoading(true)
    const t = setTimeout(async () => {
      let q = supabase.from('admin_rekening').select(COLS).eq('aktif', true)
      if (kelompok) q = q.eq('kelompok', kelompok)
      q = q.or(`kode_sub_rincian.ilike.${term}%,uraian_sub_rincian.ilike.%${term}%`)
      const { data } = await q.order('kode_sub_rincian').limit(20)
      setResults((data || []) as RekeningRow[])
      setLoading(false)
    }, 250)
    return () => clearTimeout(t)
  }, [value, kelompok]) // eslint-disable-line react-hooks/exhaustive-deps

  // Tutup dropdown saat klik di luar.
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  function pick(r: RekeningRow) {
    onChange(r.kode_sub_rincian); setPicked(r); setResults([]); setOpen(false)
  }

  return (
    <div ref={boxRef} className={`relative ${className || ''}`}>
      <input
        className="select-filter w-full"
        value={value}
        onChange={e => { onChange(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        placeholder="ketik / cari kode rekening belanja..."
        autoComplete="off"
      />
      {open && (results.length > 0 || loading) && (
        <div className="absolute z-20 mt-1 w-full max-h-72 overflow-auto rounded-lg border border-gray-200 bg-white shadow-lg">
          {loading ? (
            <p className="px-3 py-2 text-xs text-gray-400">Mencari…</p>
          ) : (
            results.map(r => (
              <button
                type="button" key={r.kode_sub_rincian} onClick={() => pick(r)}
                className="block w-full text-left px-3 py-2 hover:bg-teal/5 border-b border-gray-50 last:border-0"
              >
                <span className="text-xs font-medium text-gray-800 font-mono">{r.kode_sub_rincian}</span>
                <span className="block text-[11px] text-gray-600">{r.uraian_sub_rincian}</span>
                <span className="block text-[10px] text-gray-400 truncate">{r.kode_objek} · {r.uraian_objek}</span>
              </button>
            ))
          )}
        </div>
      )}
      {picked && (
        <div className="mt-1 rounded-lg border border-teal/40 bg-teal/5 px-3 py-2">
          <p className="text-xs text-gray-700"><span className="font-mono font-semibold">{picked.kode_sub_rincian}</span> — {picked.uraian_sub_rincian}</p>
          <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-gray-400">
            <Crumb kode={picked.kode_rekening} uraian={picked.uraian_rekening} />
            <span>›</span>
            <Crumb kode={picked.kode_klasifikasi} uraian={picked.uraian_klasifikasi} />
            <span>›</span>
            <Crumb kode={picked.kode_jenis} uraian={picked.uraian_jenis} />
            <span>›</span>
            <Crumb kode={picked.kode_objek} uraian={picked.uraian_objek} />
            <span>›</span>
            <Crumb kode={picked.kode_rincian_objek} uraian={picked.uraian_rincian_objek} />
          </div>
        </div>
      )}
    </div>
  )
}

function Crumb({ kode, uraian }: { kode: string; uraian: string }) {
  return (
    <span className="whitespace-nowrap">
      <span className="font-mono text-gray-500">{kode}</span> {uraian}
    </span>
  )
}
