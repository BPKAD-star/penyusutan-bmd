'use client'
// Picker Kode Rekening Belanja (master admin_rekening). Ketik untuk MENCARI →
// PILIH dari daftar hasil. Nilai tersimpan SELALU kode_sub_rincian yang valid
// (atau '' bila dikosongkan) — teks bebas tak pernah tersimpan. Setelah dipilih,
// breadcrumb hierarki (Akun › Kelompok › Jenis › Objek › Rincian Objek)
// ditampilkan; tombol "Ganti" untuk mencari ulang.
//
// Dipakai di Pengadaan (per barang) & Konstruksi (per termin).
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

export default function RekeningPicker({ value, onChange, kelompok, className }: {
  value: string
  onChange: (kode: string) => void
  kelompok?: 'operasi' | 'modal' | 'tak_terduga' | 'transfer'
  className?: string
}) {
  const supabase = createClient()
  const [search, setSearch] = useState('')
  const [results, setResults] = useState<RekeningRow[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [picked, setPicked] = useState<RekeningRow | null>(null)
  const boxRef = useRef<HTMLDivElement>(null)

  // Kalau value sudah terisi (mis. draft dibuka lagi) tapi baris belum dimuat,
  // ambil sekali supaya breadcrumb tampil. Value dikosongkan → reset.
  useEffect(() => {
    if (value && picked?.kode_sub_rincian !== value) {
      supabase.from('admin_rekening').select(COLS).eq('kode_sub_rincian', value).maybeSingle()
        // `as unknown as` (bukan `as` langsung): `.select(COLS)` diberi string
        // yang dirakit runtime, jadi supabase-js tak bisa menurunkan bentuk
        // barisnya & tipenya jatuh ke `GenericStringError`. Pola yang sama
        // sudah dipakai kolektor di lib/ (mis. `as unknown as LedRow[]`).
        .then(({ data }) => { if (data) setPicked(data as unknown as RekeningRow) })
    } else if (!value && picked) {
      setPicked(null)
    }
  }, [value]) // eslint-disable-line react-hooks/exhaustive-deps

  // Cari (debounce). Saat dropdown terbuka & belum mengetik → tampilkan 20
  // rekening pertama supaya daftar langsung kelihatan begitu kolom diklik.
  useEffect(() => {
    if (!open) return
    const term = search.trim().replace(/[,()]/g, '')
    setLoading(true)
    const t = setTimeout(async () => {
      let q = supabase.from('admin_rekening').select(COLS).eq('aktif', true)
      if (kelompok) q = q.eq('kelompok', kelompok)
      // Cari luas: kode + nama di semua level (Objek, Rincian Objek, Sub Rincian)
      // supaya kata seperti "software" tetap ketemu walau ada di level atasnya.
      if (term) q = q.or([
        `kode_sub_rincian.ilike.%${term}%`,
        `uraian_sub_rincian.ilike.%${term}%`,
        `uraian_rincian_objek.ilike.%${term}%`,
        `uraian_objek.ilike.%${term}%`,
      ].join(','))
      const { data } = await q.order('kode_sub_rincian').limit(50)
      setResults((data || []) as unknown as RekeningRow[])
      setLoading(false)
    }, term ? 250 : 0)
    return () => clearTimeout(t)
  }, [search, kelompok, open]) // eslint-disable-line react-hooks/exhaustive-deps

  // Tutup dropdown saat klik di luar.
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  function pick(r: RekeningRow) {
    setPicked(r); onChange(r.kode_sub_rincian)
    setSearch(''); setResults([]); setOpen(false)
  }
  function ganti() { setPicked(null); onChange(''); setSearch(''); setResults([]) }

  if (picked) {
    return (
      <div className={className}>
        <div className="rounded-lg border border-teal/40 bg-teal/5 px-3 py-2">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-800">{picked.kode_sub_rincian}</p>
              <p className="text-xs text-gray-600">{picked.uraian_sub_rincian}</p>
            </div>
            <button type="button" onClick={ganti} className="text-xs text-red-500 hover:text-red-700 flex-shrink-0">Ganti</button>
          </div>
          <div className="mt-2 space-y-0.5 text-[11px]">
            <Crumb kode={picked.kode_rekening} uraian={picked.uraian_rekening} />
            <Crumb kode={picked.kode_klasifikasi} uraian={picked.uraian_klasifikasi} />
            <Crumb kode={picked.kode_jenis} uraian={picked.uraian_jenis} />
            <Crumb kode={picked.kode_objek} uraian={picked.uraian_objek} />
            <Crumb kode={picked.kode_rincian_objek} uraian={picked.uraian_rincian_objek} />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div ref={boxRef} className={`relative ${className || ''}`}>
      <input
        className="select-filter w-full"
        value={search}
        onChange={e => { setSearch(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        placeholder="ketik untuk mencari kode rekening belanja..."
        autoComplete="off"
      />
      {open && (loading || results.length > 0 || search.trim() !== '') && (
        <div className="absolute z-20 mt-1 w-full max-h-72 overflow-auto rounded-lg border border-gray-200 bg-white shadow-lg">
          {loading ? (
            <p className="px-3 py-2 text-xs text-gray-400">Mencari…</p>
          ) : results.length === 0 ? (
            <p className="px-3 py-2 text-xs text-gray-400">Tidak ada hasil.</p>
          ) : (
            results.map(r => (
              <button
                type="button" key={r.kode_sub_rincian} onClick={() => pick(r)}
                className="block w-full text-left px-3 py-2 hover:bg-teal/5 border-b border-gray-50 last:border-0"
              >
                <span className="text-xs font-medium text-gray-800">{r.kode_sub_rincian}</span>
                <span className="block text-[11px] text-gray-600">{r.uraian_sub_rincian}</span>
                <span className="block text-[10px] text-gray-400 truncate">{r.kode_objek} · {r.uraian_objek}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}

function Crumb({ kode, uraian }: { kode: string; uraian: string }) {
  return (
    <div><span className="font-medium text-gray-600">{kode}</span> <span className="text-gray-500">{uraian}</span></div>
  )
}
