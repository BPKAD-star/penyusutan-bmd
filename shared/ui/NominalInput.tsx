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
// ⚠️ DESIMAL (2 angka di belakang koma) DIDUKUNG sejak 2026-09-14. Versi awal
// komponen ini "bulat saja", dan itu ternyata JEBAKAN, bukan penyederhanaan:
// nilai perolehan di DB banyak yang berdesimal (warisan e-BMD, mis.
// 104.893.870.444,53). Pemanggil yang mengisi awal `value` dari DB
// (`String(b.nilai_perolehan)` → "104893870444.53") membuat versi lama
// menampilkan 10.489.387.044.453 — dan begitu operator mengetik SATU digit,
// `bersihkanAngka` membuang titik desimalnya lalu mengirim angka 100× LIPAT ke
// state, tanpa satu pun error. Selain itu Pemecahan Barang mustahil menyamai
// induk berdesimal, sehingga total pecahan selalu dibulatkan & selisih sen-nya
// "tercipta" di ledger.
// Tampilan: titik = ribuan, KOMA = desimal ("1.234.567,89"). Raw: titik =
// desimal ("1234567.89") — tetap aman untuk `Number()`/`parseFloat`/`toNum`.
// Karena kontraknya raw TANPA titik ribuan, titik di raw pasti desimal.
// ============================================================================
import { useLayoutEffect, useRef } from 'react'

/** Buang semua karakter selain digit, lalu buang nol di depan (kecuali "0" tunggal). */
export function bersihkanAngka(s: unknown): string {
  const digits = String(s ?? '').replace(/[^0-9]/g, '')
  return digits.replace(/^0+(?=\d)/, '')
}

/**
 * Teks TAMPILAN ("1.234,5") → raw ("1234.5"). Koma pertama = pemisah desimal,
 * maksimal 2 angka sesudahnya; titik dianggap pemisah ribuan & dibuang.
 * Koma di akhir dipertahankan ("1234.") supaya operator bisa lanjut mengetik sen.
 */
export function bacaTampilan(s: unknown): string {
  const str = String(s ?? '')
  const iKoma = str.indexOf(',')
  if (iKoma < 0) return bersihkanAngka(str)
  const bulat = bersihkanAngka(str.slice(0, iKoma)) || '0'
  const sen = str.slice(iKoma + 1).replace(/[^0-9]/g, '').slice(0, 2)
  return `${bulat}.${sen}`
}

/** "1500000" → "1.500.000"; "1500000.5" → "1.500.000,5". Kosong tetap kosong (bukan "0"). */
export function formatRibuan(raw: unknown): string {
  const str = String(raw ?? '')
  const iTitik = str.indexOf('.')
  const bulatRaw = iTitik < 0 ? str : str.slice(0, iTitik)
  const digits = bersihkanAngka(bulatRaw)
  const bulat = digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  if (iTitik < 0) return bulat
  const sen = str.slice(iTitik + 1).replace(/[^0-9]/g, '').slice(0, 2)
  return `${bulat || '0'},${sen}`
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
      inputMode="decimal"
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
        // Koma di tampilan = titik di raw, jadi keduanya terhitung satu karakter
        // di kedua sisi (pemulih kursor menghitung semua selain '.').
        digitsBeforeCursor.current = bacaTampilan(el.value.slice(0, cursorPos)).length
        onChange(bacaTampilan(el.value))
      }}
      onBlur={onBlur}
    />
  )
}
