// @vitest-environment jsdom
// Test NominalInput — permintaan user 2026-09-05: kolom isian nominal manual
// (Harga/item, Nominal BAST, Harga Satuan Usulan Standar Harga, Nilai Baru
// Koreksi, dst.) wajib menampilkan titik ribuan SAAT DIKETIK, dan nilai yang
// dikirim ke `onChange` wajib tetap angka polos tanpa titik — kalau titik ikut
// terkirim, `Number()`/`toNum()` di pemanggil akan salah baca (lihat CLAUDE.md
// "Koordinat: toNum MEMBUANG tanda minus" — titik yang ditelan sbg pemisah
// ribuan pernah membuat toNum salah baca angka).
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { useState } from 'react'
import NominalInput, { bacaTampilan, bersihkanAngka, formatRibuan } from './NominalInput'

// 2026-09-14: desimal. Nilai perolehan warisan e-BMD berdesimal; versi bulat
// menampilkan "104893870444.53" sbg 10.489.387.044.453 & mengirim angka 100×
// lipat begitu satu digit diketik.
describe('desimal (koma = pemisah desimal di tampilan, titik di raw)', () => {
  it('formatRibuan membaca titik di raw sbg desimal', () => {
    expect(formatRibuan('104893870444.53')).toBe('104.893.870.444,53')
    expect(formatRibuan('1500.')).toBe('1.500,')
    expect(formatRibuan('0.5')).toBe('0,5')
  })
  it('bacaTampilan: koma → titik, titik ribuan dibuang, maks 2 angka sen', () => {
    expect(bacaTampilan('104.893.870.444,53')).toBe('104893870444.53')
    expect(bacaTampilan('1.234,567')).toBe('1234.56')
    expect(bacaTampilan('1.500.000')).toBe('1500000')
    expect(bacaTampilan(',5')).toBe('0.5')
  })
  it('mengedit nilai berdesimal dari DB TIDAK melipatgandakannya 100×', () => {
    function Harness() {
      const [raw, setRaw] = useState('104893870444.53')
      return (
        <div>
          <NominalInput value={raw} onChange={setRaw} placeholder="d" />
          <span data-testid="rawd">{raw}</span>
        </div>
      )
    }
    render(<Harness />)
    const input = screen.getByPlaceholderText('d') as HTMLInputElement
    expect(input.value).toBe('104.893.870.444,53')
    // hapus satu digit sen terakhir
    fireEvent.change(input, { target: { value: '104.893.870.444,5' } })
    expect(screen.getByTestId('rawd').textContent).toBe('104893870444.5')
    expect(Number(screen.getByTestId('rawd').textContent)).toBeLessThan(2e11)
  })
})

describe('bersihkanAngka', () => {
  it('membuang segala sesuatu selain digit', () => {
    expect(bersihkanAngka('1.500.000')).toBe('1500000')
    expect(bersihkanAngka('Rp 15.000.000,-')).toBe('15000000')
  })
  it('membuang nol di depan tapi mempertahankan satu nol tunggal', () => {
    expect(bersihkanAngka('007')).toBe('7')
    expect(bersihkanAngka('0')).toBe('0')
    expect(bersihkanAngka('')).toBe('')
  })
})

describe('formatRibuan', () => {
  it('menyisipkan titik tiap tiga digit dari kanan', () => {
    expect(formatRibuan('1500000')).toBe('1.500.000')
    expect(formatRibuan('500')).toBe('500')
    expect(formatRibuan('1000')).toBe('1.000')
    expect(formatRibuan('15000000')).toBe('15.000.000')
  })
  it('kosong tetap kosong, bukan "0"', () => {
    expect(formatRibuan('')).toBe('')
  })
})

describe('NominalInput — komponen', () => {
  it('menampilkan format berTITIK sementara onChange menerima angka POLOS', () => {
    function Harness() {
      const [raw, setRaw] = useState('')
      return (
        <div>
          <NominalInput value={raw} onChange={setRaw} placeholder="0" />
          <span data-testid="raw">{raw}</span>
        </div>
      )
    }
    render(<Harness />)
    const input = screen.getByPlaceholderText('0') as HTMLInputElement
    fireEvent.change(input, { target: { value: '15000000' } })
    expect(screen.getByTestId('raw').textContent).toBe('15000000')
    expect(input.value).toBe('15.000.000')
  })

  it('mengetik titik yang sudah tampil tidak ikut masuk ke raw (anti dobel-format)', () => {
    function Harness() {
      const [raw, setRaw] = useState('1500000')
      return <NominalInput value={raw} onChange={setRaw} placeholder="x" />
    }
    render(<Harness />)
    const input = screen.getByPlaceholderText('x') as HTMLInputElement
    expect(input.value).toBe('1.500.000')
    // Ketik "0" lagi di akhir — hasil DOM sementara browser: "1.500.0000"
    fireEvent.change(input, { target: { value: '1.500.0000' } })
    expect(input.value).toBe('15.000.000')
  })

  it('value awal dengan titik (mis. dari state lama) tetap diterima & diformat ulang', () => {
    function Harness() {
      const [raw, setRaw] = useState('250000')
      return <NominalInput value={raw} onChange={setRaw} placeholder="y" />
    }
    render(<Harness />)
    const input = screen.getByPlaceholderText('y') as HTMLInputElement
    expect(input.value).toBe('250.000')
  })
})
