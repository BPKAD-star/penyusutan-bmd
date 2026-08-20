// ============================================================================
// angkaKolomAset — pembaca angka untuk kolom spesifikasi `aset`.
//
// Ditulis SESUDAH insiden 2026-08-20: titik tanah hibah tersimpan di LAUT dekat
// Filipina karena tanda minus latitude dibuang pembaca rupiah (`toNum`).
// Kabupaten Kediri ada di belahan SELATAN — latitude negatif itu bukan kasus
// pinggiran, itu SELURUH data koordinat aplikasi ini.
// ============================================================================
import { describe, it, expect } from 'vitest'
import { angkaKolomAset, ASET_NUM_COLS } from './asetFields'

// Persis `toNum` yang dulu dipakai ketiga menu Cara Perolehan. Disalin ke sini
// sebagai PEMBANDING supaya bedanya terbaca hitam-putih, bukan cuma diceritakan
// di komentar.
const toNumLama = (s: string) => {
  const n = parseFloat(String(s).replace(/[^0-9.]/g, ''))
  return isNaN(n) ? 0 : n
}

describe('angkaKolomAset — tanda minus koordinat', () => {
  it('MEMPERTAHANKAN minus (inti insiden 2026-08-20)', () => {
    expect(angkaKolomAset('-7.774007')).toBe(-7.774007)
    expect(angkaKolomAset('-7.8')).toBe(-7.8)
  })

  it('pembaca rupiah lama justru MEMBUANGNYA — jangan dipakai lagi di sini', () => {
    // Bukti bahwa perbedaannya nyata, bukan kehati-hatian teoretis: inilah
    // yang memindahkan titik tanah ke seberang khatulistiwa.
    expect(toNumLama('-7.774007')).toBe(7.774007)
    expect(angkaKolomAset('-7.774007')).not.toBe(toNumLama('-7.774007'))
  })

  it('longitude Indonesia (positif) tetap utuh', () => {
    expect(angkaKolomAset('111.95279')).toBe(111.95279)
  })
})

describe('angkaKolomAset — menolak yang tak terbaca, bukan menebak', () => {
  it('pemisah ribuan gaya rupiah DITOLAK, tidak diam-diam jadi 686,7', () => {
    // `parseFloat('686.700.000')` = 686.7 — meleset SEJUTA KALI tanpa error.
    expect(toNumLama('686.700.000')).toBe(686.7)
    expect(angkaKolomAset('686.700.000')).toBeNull()
  })

  it('teks & isian setengah jadi → null (kolomnya tak ditulis)', () => {
    for (const v of ['', '   ', 'abc', '12abc', '-', null, undefined]) {
      expect(angkaKolomAset(v), `nilai ${JSON.stringify(v)}`).toBeNull()
    }
  })

  it('`null` BUKAN 0 — 0 itu koordinat yang sah (Teluk Guinea)', () => {
    // Beda ini yang menentukan: `toNum` lama mengembalikan 0 untuk isian rusak,
    // dan 0 lolos semua validasi rentang lalu mendarat di peta.
    expect(toNumLama('abc')).toBe(0)
    expect(angkaKolomAset('abc')).toBeNull()
    expect(angkaKolomAset('0')).toBe(0)   // nol yang DIKETIK tetap diterima
  })

  it('angka biasa & desimal lolos apa adanya', () => {
    expect(angkaKolomAset('28212')).toBe(28212)
    expect(angkaKolomAset(' 1234.56 ')).toBe(1234.56)
  })
})

describe('ASET_NUM_COLS', () => {
  it('memuat kedua kolom koordinat + luas', () => {
    // Kolom yang KELUAR dari daftar ini akan ditulis sebagai TEKS ke kolom
    // numeric → ditolak Postgres saat approve; yang MASUK tanpa alasan akan
    // dipaksa jadi angka. Dua-duanya lebih baik ketahuan di sini.
    expect([...ASET_NUM_COLS].sort()).toEqual(['latitude', 'longitude', 'luas'])
  })
})
