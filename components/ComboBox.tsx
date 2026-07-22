'use client'
// Combobox ringan: input teks BEBAS + saran dari `options` via <datalist> native.
// User boleh mengetik apa saja (nilai = apa yang diketik); saran muncul sambil
// mengetik & bisa diklik. Dipakai utk kolom referensi (Program/Kegiatan/Sub
// Kegiatan, Nama Pejabat, Satuan, dll) — BUKAN utk enum terkontrol (biarkan
// <select> ketat supaya nilainya tak salah).
import { useId } from 'react'

export default function ComboBox({ value, onChange, options, placeholder, className, disabled }: {
  value: string
  onChange: (v: string) => void
  options: string[]
  placeholder?: string
  className?: string
  disabled?: boolean
}) {
  const rawId = useId()
  const listId = `cb-${rawId.replace(/[^a-zA-Z0-9_-]/g, '')}`
  return (
    <>
      <input
        list={listId}
        className={`select-filter w-full ${className || ''}`}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete="off"
      />
      <datalist id={listId}>
        {options.map((o, i) => <option key={i} value={o} />)}
      </datalist>
    </>
  )
}
