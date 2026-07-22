'use client'
// Typeahead TERBATAS: user mengetik di kolom untuk MENCARI/menyaring opsi, lalu
// memilih dari daftar. Nilai yang tersimpan SELALU salah satu `options` (atau ''
// kalau dikosongkan) — teks bebas yang tak cocok TIDAK pernah tersimpan (saat
// blur, input balik menampilkan label pilihan terakhir). Beda dari <datalist>
// yang membolehkan nilai sembarang.
//
// Dipakai utk kolom referensi (Program/Kegiatan/Sub Kegiatan, Nama PPK, Satuan).
import { useEffect, useRef, useState } from 'react'

export type SSOption = { value: string; label: string; sub?: string }

export default function SearchSelect({ value, onChange, options, placeholder, disabled, className }: {
  value: string
  onChange: (v: string) => void
  options: SSOption[]
  placeholder?: string
  disabled?: boolean
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const boxRef = useRef<HTMLDivElement>(null)

  const selected = options.find(o => o.value === value) || null
  // Saat dropdown terbuka → tampilkan apa yang diketik; kalau tertutup → label
  // pilihan (fallback ke nilai mentah bila opsinya tak ada, mis. pegawai dihapus).
  const inputText = open ? query : (selected?.label ?? value ?? '')

  const q = query.trim().toLowerCase()
  const filtered = (!q ? options : options.filter(o =>
    o.label.toLowerCase().includes(q) ||
    o.value.toLowerCase().includes(q) ||
    (o.sub ? o.sub.toLowerCase().includes(q) : false)
  )).slice(0, 50)

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) { setOpen(false); setQuery('') }
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  function pick(o: SSOption) { onChange(o.value); setOpen(false); setQuery('') }

  return (
    <div ref={boxRef} className={`relative ${className || ''}`}>
      <input
        className="select-filter w-full pr-7"
        value={inputText}
        disabled={disabled}
        onFocus={() => { setOpen(true); setQuery('') }}
        onChange={e => { setQuery(e.target.value); setOpen(true) }}
        placeholder={placeholder}
        autoComplete="off"
      />
      {value && !open && !disabled && (
        <button type="button" onClick={() => onChange('')}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500 text-sm leading-none" aria-label="Kosongkan">×</button>
      )}
      {open && (
        <div className="absolute z-20 mt-1 w-full max-h-72 overflow-auto rounded-lg border border-gray-200 bg-white shadow-lg">
          {filtered.length === 0 ? (
            <p className="px-3 py-2 text-xs text-gray-400">Tidak ada hasil.</p>
          ) : filtered.map(o => (
            <button type="button" key={o.value} onClick={() => pick(o)}
              className="block w-full text-left px-3 py-2 hover:bg-teal/5 border-b border-gray-50 last:border-0">
              <span className="text-xs text-gray-800">{o.label}</span>
              {o.sub && <span className="block text-[10px] text-gray-400 truncate">{o.sub}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
