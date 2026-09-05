'use client'
// ============================================================================
// NominalInput — kotak isian angka rupiah yang menampilkan titik pemisah ribuan
// SAAT DIKETIK, bukan cuma sesudahnya.
//
// LATAR (permintaan user 2026-09-05): operator mengisi Harga/item, Nominal
// pembayaran BAST, Harga Satuan Usulan Standar Harga, Nilai Baru Koreksi, dst.
// lewat `<input type="number">` polos — angkanya tampil rapat ("15000000")
// dan operator harus menghitung sendiri jumlah nolnya untuk yakin tidak
// kelebihan/kekurangan sebelum menekan Simpan. Salah nol di kolom ini
// langsung membengkakkan/mengecilkan nilai perolehan di neraca.
//
// KENAPA DI shared/ui: pola isian nominal manual ini berulang di banyak menu
// (Cara Perolehan, Konstruksi/KDP, Koreksi, Usulan Standar Harga, RKBMD
// Pemeliharaan/Pemanfaatan, Inventarisasi/LKI, IPA) — satu komponen supaya
// perilakunya (termasuk perbaikan bug format di masa depan) seragam di semua
// tempat, bukan disalin dan lama-lama menyimpang.
//
// KONTRAK NILAI: `value`/`onChange` selalu STRING ANGKA POLOS (mis. "1500000",
// TANPA titik) — sama seperti `<input type="number">` yang digantikannya, dan
// aman dioper ke `Number()`/`toNum()`/`angkaKolomAset()` yang sudah dipakai
// pemanggilnya. Titik ribuan HANYA di tampilan; tak pernah ikut ke `onChange`
// maupun tersimpan di state. Sengaja `type="text"` + `inputMode="numeric"`
// (bukan `type="number"`) — HTML number input menolak mentah-mentah karakter
// titik, jadi format tampilan seperti ini mustahil dengan `type="number"`.
//
// Bilangan BULAT saja (tanpa desimal) — seluruh field nominal di aplikasi ini
// memang rupiah utuh, dan `type="number"` yang digantikan juga tak pernah
// menampilkan koma desimal di layar manapun yang dipakai komponen ini.
// ============================================================================
import { useLayoutEffect, useRef } from 'react'

/** Buang semua karakter selain digit, lalu buang nol di depan (kecuali "0" tunggal). */
export function bersihkanAngka(s: unknown): string {
  const digits = String(s ?? '').replace(/[^0-9]/g, '')
  return digits.replace(/^0+(?=\d)/, '')
}

/** "1500000" → "1.500.000". Kosong tetap kosong (bukan "0"), supaya placeholder tampil. */
export function formatRibuan(raw: unknown): string {
  const digits = bersihkanAngka(raw)
  if (!digits) return ''
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

interface NominalInputProps {
  /** String angka polos tanpa titik, mis. "1500000". Kosong = belum diisi. */
  value: string
  /** Dipanggil dengan string angka polos tanpa titik — simpan apa adanya. */
  onChange: (raw: string) => void
  className?: string
  placeholder?: string
  disabled?: boolean
  id?: string
  autoFocus?: boolean
  onBlur?: () => void
}

export default function NominalInput({
  value, onChange, className, placeholder, disabled, id, autoFocus, onBlur,
}: NominalInputProps) {
  const ref = useRef<HTMLInputElement>(null)
  // Jumlah digit di sebelah KIRI kursor sesaat sebelum re-render — dipakai
  // memulihkan posisi kursor sesudah titik disisipkan/dicabut, supaya
  // mengedit angka di TENGAH (bukan cuma menambah di akhir) tidak melompat
  // kursornya ke ujung kanan tiap kali mengetik satu digit.
  const digitsBeforeCursor = useRef<number | null>(null)
  const formatted = formatRibuan(value)

  useLayoutEffect(() => {
    const el = ref.current
    const target = digitsBeforeCursor.current
    if (!el || target === null) return
    digitsBeforeCursor.current = null
    let count = 0
    let pos = el.value.length
    for (let i = 0; i < el.value.length; i++) {
      if (el.value[i] !== '.') count++
      if (count >= target) { pos = i + 1; break }
    }
    el.setSelectionRange(pos, pos)
  }, [formatted])

  return (
    <input
      ref={ref}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      id={id}
      disabled={disabled}
      autoFocus={autoFocus}
      placeholder={placeholder}
      className={className}
      value={formatted}
      onChange={e => {
        const el = e.target
        const cursorPos = el.selectionStart ?? el.value.length
        digitsBeforeCursor.current = bersihkanAngka(el.value.slice(0, cursorPos)).length
        onChange(bersihkanAngka(el.value))
      }}
      onBlur={onBlur}
    />
  )
}
